/* Swipe game — game logic.
 * Text and dishes live in data.js. Results go to the Google Sheet via the
 * Apps Script in apps-script/Code.gs.
 *
 * Saving: every swipe goes into a queue stored on this device and is sent to
 * the sheet in order. If the internet drops, the queue waits and retries, and
 * it survives a reload. Each request has an id, so a retry never saves twice.
 *
 * In the sheet, a Desi Crush is stored as "Super Like".
 */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const LS_STATE = "sg_state_v4"; // v4: no match screen; the Desi Crush is picked at the end
  const LS_QUEUE = "sg_queue_v1";
  const LS_DEVICE = "sg_device_v1";
  const CRUSH = "Super Like"; // value written to the sheet for a Desi Crush
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const HALFTIME_AT = 5; // fortune cookie (if switched on in data.js) appears before card 6
  const T = GAME;

  const fill = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ""));
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 60) : ms));

  // ------------------------------------------------------------ storage

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : d;
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {
        /* private mode: game still works, without resume */
      }
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 36);

  const device = (() => {
    let d = store.get(LS_DEVICE, null);
    if (!d) {
      const ua = navigator.userAgent;
      const kind = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
        ? "iPad"
        : /iPhone|Android.+Mobile/.test(ua) ? "Phone" : /Android/.test(ua) ? "Tablet" : "Laptop";
      d = `${kind}-${uid().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
      store.set(LS_DEVICE, d);
    }
    return d;
  })();

  // ------------------------------------------------------------ server

  const configured = () => /^https:\/\/script\.google(usercontent)?\.com\//.test(T.scriptUrl);

  class NetError extends Error {}

  async function api(body, timeout = 20000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      // text/plain keeps this a "simple" request, which Apps Script accepts from any site.
      const r = await fetch(T.scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...body, device }),
        signal: ctrl.signal,
        redirect: "follow",
      });
      const text = await r.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new NetError("Unexpected reply.");
      }
    } catch (e) {
      throw e instanceof NetError ? e : new NetError(e.message);
    } finally {
      clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------ save queue

  let queue = store.get(LS_QUEUE, []);
  let pumping = false;
  let retryTimer = null;
  let failures = 0;
  const RETRY = new Set(["busy", "error"]);

  function enqueue(action, payload) {
    queue.push({ rid: uid(), body: { action, ...payload } });
    store.set(LS_QUEUE, queue);
    renderSync();
    pump();
  }

  async function pump() {
    if (pumping || !configured()) return;
    pumping = true;
    clearTimeout(retryTimer);
    while (queue.length) {
      const item = queue[0];
      renderSync("saving");
      let res;
      try {
        res = await api({ ...item.body, rid: item.rid });
      } catch {
        res = null;
      }
      if (!res || (!res.ok && RETRY.has(res.code))) {
        failures++;
        renderSync("offline");
        retryTimer = setTimeout(pump, Math.min(30000, 2000 * 2 ** Math.min(failures - 1, 4)));
        pumping = false;
        return;
      }
      failures = 0;
      queue.shift();
      store.set(LS_QUEUE, queue);
      if (!res.ok) onRejected(item, res);
    }
    pumping = false;
    renderSync();
  }

  function onRejected(item, res) {
    const b = item.body;
    console.warn("Not saved:", b, res);
    // "closed": restarted by the team or taken over by another device.
    // "no_game": the team deleted this token's row in the sheet.
    if ((res.code === "closed" || res.code === "no_game") && S && S.token === b.token && S.attempt === b.attempt) {
      resetToStart();
      toast(T.messages.restarted, 6000);
    }
  }

  window.addEventListener("online", pump);
  setInterval(() => queue.length && !pumping && pump(), 15000);

  // Players only see a small dot. The team panel shows the details.
  function renderSync(force) {
    const n = queue.length;
    const state = force || (n ? "saving" : "saved");
    const label = state === "offline" ? `Offline, ${n} waiting` : state === "saving" ? `Saving ${n}` : "All saved";
    const el = $("#sync");
    el.dataset.state = state;
    el.title = label;
    const tq = $("#tQueue");
    if (tq) tq.textContent = n ? `${label} (answers are kept on this device until sent).` : "all saved.";
  }

  // ------------------------------------------------------------ game state

  // S = { token, attempt, age, gender, answers:{id:answer}, index, last, undos,
  //       phase, crush, sawHalftime, lastPart, profile }
  let S = store.get(LS_STATE, null);
  let busy = false; // a card is flying off
  let starting = false; // waiting for the token check
  let resultTimer = null;
  const save = () => store.set(LS_STATE, S);

  const cardById = (id) => CARDS.find((c) => c.id === id);
  const isYes = (a) => a === "Yes" || a === CRUSH;

  // S.answers holds the plain Yes/No swipes. The Desi Crush is kept separately
  // in S.crush and only merged in here, so changing the pick restores the
  // cuisine's original Yes or No by itself.
  function effective() {
    const out = { ...S.answers };
    if (S.crush) out[S.crush] = CRUSH;
    return out;
  }
  // What the sheet should hold for the five round-2 cuisines.
  function part2Answers() {
    const e = effective();
    const out = {};
    CARDS.filter((c) => c.part === 2).forEach((c) => {
      if (e[c.id]) out[c.id] = e[c.id];
    });
    return out;
  }

  function firstUnanswered() {
    const i = CARDS.findIndex((c) => !S.answers[c.id]);
    return i < 0 ? CARDS.length : i;
  }

  function profileFor(answers) {
    const yes = CARDS.filter((c) => isYes(answers[c.id])).length;
    return { yes, ...T.profiles.find((p) => yes <= p.max) };
  }

  // ------------------------------------------------------------ screens

  function show(name) {
    document.body.dataset.screen = name;
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === `screen-${name}`));
    window.scrollTo(0, 0);
  }

  function fillStatic() {
    document.querySelectorAll("[data-text]").forEach((el) => {
      el.textContent = T[el.dataset.text];
    });
    document.querySelectorAll("[data-btn]").forEach((el) => {
      el.textContent = T.buttons[el.dataset.btn];
    });
    document.title = T.title;
    for (const [img, src] of [[$("#brandLogo"), T.logo], [$("#startLogo"), T.logo]]) {
      if (src) {
        img.src = src;
        img.hidden = false;
      }
    }
    if (T.background) document.body.style.setProperty("--art", `url("${T.background}")`);
    document.body.classList.toggle("has-art", !!T.background);
    $("#exitTitle").textContent = T.messages.exitTitle;
    $("#exitText").textContent = T.messages.exitText;
    $("#exitCancel").textContent = T.messages.exitStay;
    $("#exitConfirm").textContent = T.messages.exitLeave;
    $("#pBack").textContent = T.profileBack;
    $("#changeText").textContent = T.results.change;
    const how = $("#startHow");
    how.innerHTML = "";
    (T.howTo || []).forEach((s) => {
      const li = document.createElement("li");
      li.className = `how-${s.icon}`;
      li.innerHTML = `<svg><use href="#i-${s.icon}"/></svg><span></span>`;
      li.lastChild.textContent = s.text;
      how.append(li);
    });
  }

  // ------------------------------------------------------------ photos

  function photoEl(photo, cls = "photo") {
    const wrap = document.createElement("div");
    wrap.className = cls;
    const ph = document.createElement("div");
    ph.className = "placeholder";
    ph.innerHTML = `<span class="ph-emoji"></span><span class="ph-name"></span>`;
    ph.firstChild.textContent = photo.emoji || "🍽️";
    ph.lastChild.textContent = photo.caption || "";
    wrap.append(ph);
    if (photo.src) {
      const img = new Image();
      img.alt = photo.caption || "";
      img.draggable = false;
      img.decoding = "async";
      img.onerror = () => img.remove();
      img.src = photo.src;
      wrap.append(img);
    }
    return wrap;
  }

  function preload(card) {
    if (!card) return;
    [...card.photos, card.twist && card.twist.photo, ...(card.desi || []).map((d) => d.photo)].filter(Boolean).forEach((p) => {
      const i = new Image();
      i.src = p.src;
    });
  }

  // ------------------------------------------------------------ start screen

  function buildFan(el, cards, stickers) {
    el.innerHTML = "";
    cards.forEach((c, i) => {
      const f = document.createElement("div");
      f.className = `fan-card part-${c.part}`;
      f.style.setProperty("--i", i - (cards.length - 1) / 2);
      f.style.setProperty("--d", `${i * 0.7}s`);
      f.append(photoEl(c.photos[0]));
      const name = document.createElement("span");
      name.className = "fan-name";
      name.textContent = c.name;
      f.append(name);
      const st = stickers && stickers[i];
      if (st) {
        f.tabIndex = 0;
        f.setAttribute("role", "button");
        f.setAttribute("aria-label", `${c.name}: ${st.line}`);
        const s = document.createElement("span");
        s.className = `fan-stamp fan-stamp-${i}`;
        s.textContent = st.stamp;
        const l = document.createElement("span");
        l.className = "fan-line";
        l.textContent = st.line;
        f.append(s, l);
        f.addEventListener("click", () => {
          const on = !f.classList.contains("is-peek");
          el.querySelectorAll(".fan-card").forEach((x) => x.classList.remove("is-peek"));
          f.classList.toggle("is-peek", on);
        });
      }
      el.append(f);
    });
  }

  function showFormError(msg) {
    const e = $("#formError");
    e.textContent = msg;
    e.hidden = !msg;
  }

  async function onStart(ev) {
    ev.preventDefault();
    if (starting) return;
    const form = ev.target;
    const token = form.token.value.replace(/\s+/g, "");
    const age = parseInt(form.age.value, 10);
    const gender = (form.querySelector("input[name=gender]:checked") || {}).value;
    const M = T.messages;
    if (!token) return showFormError(M.noToken);
    if (!/^\d{1,9}$/.test(token)) return showFormError(M.badToken);
    if (!(age >= 5 && age <= 99)) return showFormError(M.badAge);
    if (!gender) return showFormError(M.noGender);
    if (!configured()) return showFormError("Setup needed: the Apps Script link is missing in data.js.");
    showFormError("");
    starting = true;
    const btn = $("#startBtn");
    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.firstElementChild.textContent = M.checking;
    let res;
    try {
      res = await api({ action: "start", token, age, gender, rid: uid() });
    } catch {
      res = null;
    }
    starting = false;
    btn.disabled = false;
    btn.classList.remove("is-loading");
    btn.firstElementChild.textContent = T.startButton;

    if (!res) return showFormError(M.offline);
    if (!res.ok) {
      if (res.code === "used") return showFormError(fill(M.used, { token: res.token }));
      if (res.code === "in_use") return showFormError(fill(M.inUse, { token: res.token }));
      return showFormError(res.message || M.offline);
    }

    const answers = res.answers || {};
    S = {
      token: res.token,
      attempt: res.attempt,
      age: res.age || age,
      gender: res.gender || gender,
      answers,
      last: null,
      undos: 0,
      crush: Object.keys(answers).find((id) => answers[id] === CRUSH) || null,
      phase: "play",
      lastPart: null,
    };
    S.index = firstUnanswered();
    S.sawHalftime = S.index > HALFTIME_AT;
    form.reset();
    busy = false;
    if (S.index >= CARDS.length) return finish();
    if (res.state === "resume") toast(fill(T.messages.welcomeBack, { n: S.index + 1 }), 3500);
    goToCard();
  }

  // ------------------------------------------------------------ play

  function goToCard() {
    const card = CARDS[S.index];
    S.phase = "play";
    save();
    show("play");
    renderPlay();
    if (S.lastPart !== card.part) {
      S.lastPart = card.part;
      save();
      flash(card.part);
    }
  }

  async function flash(part) {
    const R = T.rounds[part];
    const f = $("#flash");
    f.dataset.part = part;
    $("#flashEmoji").textContent = R.emoji;
    $("#flashTitle").textContent = R.flashTitle;
    $("#flashText").textContent = R.flashText;
    $("#flashCrush").textContent = R.flashCrush || "";
    $("#flashCrush").hidden = !R.flashCrush;
    f.hidden = false;
    f.classList.remove("is-out");
    f.classList.remove("is-in");
    void f.offsetWidth;
    f.classList.add("is-in");
    let skipped = false;
    let wake = null;
    f.onclick = () => {
      skipped = true;
      if (wake) wake();
    };
    // Stays up for flashSeconds (data.js), or until tapped.
    await Promise.race([wait((Number(R.flashSeconds) || 1.5) * 1000), new Promise((r) => (wake = r))]);
    f.onclick = null;
    f.classList.add("is-out");
    await wait(skipped ? 200 : 300);
    f.hidden = true;
    // Draw the eye to the question once the flash is gone.
    const q = $("#question");
    q.classList.remove("is-new");
    void q.offsetWidth;
    q.classList.add("is-new");
  }

  function renderProgress() {
    const ol = $("#progress");
    ol.innerHTML = "";
    CARDS.forEach((c, i) => {
      const li = document.createElement("li");
      li.className = `part-${c.part}`;
      if (S && S.answers[c.id]) li.classList.add("done");
      if (S && i === S.index && S.phase !== "done") li.classList.add("now");
      ol.append(li);
    });
  }

  function renderPlay() {
    const card = CARDS[S.index];
    const R = T.rounds[card.part];
    document.body.dataset.part = card.part;
    $("#roundTag").textContent = `${R.emoji} ${R.tag}`;
    $("#question").textContent = R.question;
    $("#yesMeans").textContent = R.yesMeans;
    $("#noMeans").textContent = R.noMeans;
    $("#counter").textContent = `Dish ${S.index + 1} of ${CARDS.length}`;

    const deck = $("#deck");
    deck.innerHTML = "";
    const nextCard = CARDS[S.index + 1];
    if (nextCard) deck.append(cardEl(nextCard, "is-behind"));
    const top = cardEl(card, "is-top");
    deck.append(top);
    attachDrag(top);

    $("#undoBtn").disabled = !S.last;
    renderProgress();
    preload(nextCard);
  }

  // The card shows the original dish (round 1) or the cuisine (round 2).
  // The twist is only revealed after a Yes, on the match screen.
  function cardEl(card, cls) {
    const R = T.rounds[card.part];
    const el = document.createElement("article");
    el.className = `card part-${card.part} ${cls}`;
    el.dataset.id = card.id;
    el.setAttribute("aria-label", `${card.name}. ${card.bio}`);

    const banner = document.createElement("p");
    banner.className = "card-banner";
    banner.innerHTML = "<span></span><b></b>";
    banner.firstChild.textContent = R.emoji;
    banner.lastChild.textContent = R.cardBanner;
    el.append(banner);

    const photos = document.createElement("div");
    photos.className = "card-photos";
    photos.append(photoEl(card.photos[0]));
    const info = document.createElement("button");
    info.type = "button";
    info.className = "info-btn";
    info.setAttribute("aria-label", T.profileButton);
    info.innerHTML = `<svg><use href="#i-info"/></svg><span></span>`;
    info.lastChild.textContent = T.profileButton;
    info.addEventListener("pointerdown", (e) => e.stopPropagation());
    info.addEventListener("click", (e) => {
      e.stopPropagation();
      openProfile(card);
    });
    photos.append(info);
    el.append(photos);

    for (const [k, label] of [["yes", T.buttons.yes], ["no", T.buttons.no], ["crush", T.buttons.crush]]) {
      const s = document.createElement("span");
      s.className = `stamp stamp-${k}`;
      s.textContent = label;
      el.append(s);
    }

    const body = document.createElement("div");
    body.className = "card-info";
    body.innerHTML = `<div class="name-row"><h3></h3><span class="spice"></span></div>
      <p class="from"><svg><use href="#i-pin"/></svg><span></span></p><p class="bio"></p><ul class="chips"></ul>`;
    body.querySelector("h3").textContent = card.name;
    body.querySelector(".spice").textContent = "🌶️".repeat(card.spice || 1);
    body.querySelector(".spice").setAttribute("aria-label", `${T.profileLabels.spice}: ${card.spice || 1} of 3`);
    body.querySelector(".from span").textContent = card.from;
    body.querySelector(".bio").textContent = card.bio;
    const chips = body.querySelector(".chips");
    (card.chips || []).forEach((c) => {
      const li = document.createElement("li");
      li.textContent = c;
      chips.append(li);
    });
    el.append(body);
    return el;
  }

  // ---------------------------------------------- full profile

  function openProfile(card) {
    if (busy) return;
    const L = T.profileLabels;
    const p1 = card.part === 1;
    const strip = $("#pPhotos");
    strip.innerHTML = "";
    // Only the original: the twist stays a surprise until the answer.
    card.photos.forEach((p) => {
      const ph = photoEl(p, "sheet-photo");
      const cap = document.createElement("span");
      cap.className = "sheet-cap";
      cap.textContent = p.caption;
      ph.append(cap);
      strip.append(ph);
    });
    $("#pName").textContent = card.name;
    $("#pFrom").textContent = card.from;
    $("#pBio").textContent = card.bio;
    const dl = $("#pFacts");
    dl.innerHTML = "";
    const rows = [
      [L.spice, "🌶️".repeat(card.spice || 1)],
      [L.lookingFor, card.lookingFor],
      [p1 ? L.madeOf : L.famousFor, p1 ? card.madeOf : card.famousFor],
      [L.greenFlag, card.greenFlag, "green"],
      [L.redFlag, card.redFlag, "red"],
      [L.funFact, card.funFact],
    ];
    rows.filter((r) => r[1]).forEach(([k, v, kind]) => {
      const div = document.createElement("div");
      if (kind) div.className = `flag-${kind}`;
      div.innerHTML = "<dt></dt><dd></dd>";
      div.firstChild.textContent = k;
      div.lastChild.textContent = v;
      dl.append(div);
    });
    openOverlay("#profile");
    $("#profile .sheet").scrollTop = 0;
    $("#pBack").focus({ preventScroll: true });
  }

  // ---------------------------------------------- dragging

  function setStamps(el, dx) {
    const w = el.offsetWidth || 300;
    el.style.setProperty("--yes", Math.max(0, Math.min(1, dx / (w * 0.3))));
    el.style.setProperty("--no", Math.max(0, Math.min(1, -dx / (w * 0.3))));
  }

  function attachDrag(el) {
    let sx = 0, sy = 0, dx = 0, dy = 0, pid = null;

    el.addEventListener("pointerdown", (e) => {
      if (busy || S.phase !== "play" || (e.pointerType === "mouse" && e.button !== 0)) return;
      pid = e.pointerId;
      el.setPointerCapture(pid);
      sx = e.clientX;
      sy = e.clientY;
      dx = dy = 0;
      el.classList.add("is-dragging");
    });

    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pid) return;
      if (!S || S.phase !== "play") return;
      dx = e.clientX - sx;
      dy = e.clientY - sy;
      el.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx * 0.05}deg)`;
      setStamps(el, dx);
    });

    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      el.classList.remove("is-dragging");
      const moved = Math.hypot(dx, dy);
      if (moved < 8) {
        el.style.transform = "";
        setStamps(el, 0);
        return;
      }
      const th = Math.min(120, el.offsetWidth * 0.28);
      if (dx > th) decide("Yes", "right");
      else if (dx < -th) decide("No", "left");
      else {
        el.classList.add("is-returning");
        el.style.transform = "";
        setStamps(el, 0);
        setTimeout(() => el.classList.remove("is-returning"), 300);
      }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // The card flies off; the next card is already underneath.
  async function flyOut(el, dir) {
    if (!el) return;
    const w = el.offsetWidth;
    const fromButton = !el.style.transform;
    if (fromButton) {
      el.style.setProperty("--yes", dir === "right" ? 1 : 0);
      el.style.setProperty("--no", dir === "left" ? 1 : 0);
      el.style.setProperty("--crush", dir === "up" ? 1 : 0);
      el.classList.add(`is-tilt-${dir}`);
      await wait(150);
    }
    if (reduceMotion) return;
    const x = dir === "right" ? window.innerWidth + w : dir === "left" ? -window.innerWidth - w : 0;
    const y = dir === "up" ? -window.innerHeight - el.offsetHeight : 60;
    const rot = dir === "right" ? 26 : dir === "left" ? -26 : 0;
    el.classList.add("is-leaving");
    el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)${dir === "up" ? " scale(0.9)" : ""}`;
    await wait(dir === "up" ? 420 : 340);
  }

  // ---------------------------------------------- answering

  // Yes and No have no screen: the card flies off and the next one comes in.
  async function decide(answer, dir) {
    if (busy || !S || S.phase !== "play") return;
    const card = CARDS[S.index];
    busy = true;
    S.answers[card.id] = answer;
    S.last = { id: card.id, answer, index: S.index };
    save();
    enqueue("answer", { token: S.token, attempt: S.attempt, card: card.id, answer });
    if (navigator.vibrate) navigator.vibrate(answer === "No" ? 15 : [20, 40, 30]);
    const game = S;
    await flyOut($("#deck .is-top"), dir);
    busy = false;
    if (S !== game) return; // reset meanwhile (for example by a team restart)
    advance();
  }

  // ---------------------------------------------- Desi Crush (mandatory)

  // Shown once, after all ten swipes. The player must choose one cuisine.
  function showCrushPick() {
    S.phase = "crush";
    S.last = null;
    save();
    const C = T.crushPick || {};
    document.body.dataset.part = "2";
    $("#crushKicker").textContent = C.kicker || "";
    $("#crushTitle").textContent = C.title || "Pick your Desi Crush";
    $("#crushText").textContent = C.text || "";
    const host = $("#crushTiles");
    host.innerHTML = "";
    CARDS.filter((c) => c.part === 2).forEach((c) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "crush-tile";
      if (S.crush === c.id) btn.classList.add("is-picked");
      btn.dataset.answer = (S.answers[c.id] || "").toLowerCase();
      btn.append(photoEl(c.photos[0], "tile-photo"));
      const t = document.createElement("p");
      t.innerHTML = "<b></b><span></span>";
      t.firstChild.textContent = c.name;
      t.lastChild.textContent = S.answers[c.id] || "";
      btn.append(t);
      const heart = document.createElement("span");
      heart.className = "crush-mark";
      heart.innerHTML = `<svg><use href="#i-crush"/></svg>`;
      btn.append(heart);
      btn.addEventListener("click", () => chooseCrush(c.id));
      li.append(btn);
      host.append(li);
    });
    hideResult();
    show("crush");
    renderProgress();
  }

  function chooseCrush(id) {
    if (busy || !S || S.phase !== "crush") return;
    const card = cardById(id);
    if (!card || card.part !== 2) return;
    S.crush = id;
    S.phase = "result";
    save();
    // One request writes all five round-2 cells, so changing the pick puts the
    // old cuisine back to its plain Yes or No.
    enqueue("crush", { token: S.token, attempt: S.attempt, answers: part2Answers() });
    if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
    showCrush(card);
  }

  function plate(photo, cls) {
    return photoEl(photo, `plate ${cls}`);
  }

  // The one reveal screen in the game: the two plates crash together and the
  // chosen cuisine's desi dishes appear. It waits for the button.
  function showCrush(card) {
    const R = T.results;
    const ov = $("#result");
    ov.dataset.answer = "crush";
    ov.dataset.part = card.part;
    const plates = $("#plates");
    plates.innerHTML = "";
    const teasers = $("#teasers");
    teasers.innerHTML = "";
    const d = card.desi || [];
    plates.append(plate((d[0] || {}).photo || card.photos[0], "plate-left"), plate((d[1] || d[0] || {}).photo || card.photos[0], "plate-right"));
    $("#resultTitle").textContent = R.crush;
    $("#resultName").textContent = fill(R.desiName, { name: card.name });
    $("#resultLine").textContent = R.teaserIntro;
    d.forEach((x) => {
      const li = document.createElement("li");
      li.textContent = x.name;
      teasers.append(li);
    });
    const nextBtn = $("#nextBtn");
    nextBtn.textContent = R.last;
    nextBtn.hidden = false;
    $("#changeText").textContent = R.change;

    ov.hidden = false;
    ov.classList.remove("is-in");
    void ov.offsetWidth;
    ov.classList.add("is-in");
    burst($("#burst"), "crush");
    clearTimeout(resultTimer);
    nextBtn.focus({ preventScroll: true });
  }

  function hideResult() {
    clearTimeout(resultTimer);
    $("#result").hidden = true;
    $("#burst").innerHTML = "";
  }

  function burst(host, kind) {
    host.innerHTML = "";
    if (reduceMotion) return;
    const glyphs = kind === "crush" ? ["🌶️", "💥", "🔥", "💛", "✨"] : ["💚", "❤️", "✨"];
    const n = kind === "crush" ? 34 : 22;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.textContent = glyphs[i % glyphs.length];
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.3;
      const d = (kind === "crush" ? 220 : 160) + Math.random() * 240;
      s.style.setProperty("--x", `${Math.cos(a) * d}px`);
      s.style.setProperty("--y", `${Math.sin(a) * d}px`);
      s.style.setProperty("--d", `${(kind === "crush" ? 420 : 0) + Math.random() * 120}ms`);
      host.append(s);
    }
  }

  // The button on the Desi Crush screen: on to the food profile.
  function next() {
    if (busy || !S || S.phase !== "result") return;
    hideResult();
    finish();
  }

  function advance() {
    S.index++;
    if (S.index >= CARDS.length) return showCrushPick();
    if (T.halftime && T.halftime.show && S.index === HALFTIME_AT && !S.sawHalftime) return showHalftime();
    goToCard();
  }

  // Undo works for the most recent swipe only.
  function undo() {
    if (busy || !S || !S.last || (S.phase !== "play" && S.phase !== "crush")) return;
    const { id, answer, index } = S.last;
    delete S.answers[id];
    enqueue("undo", { token: S.token, attempt: S.attempt, card: id, was: answer });
    S.index = index;
    S.last = null;
    S.undos = (S.undos || 0) + 1;
    S.phase = "play";
    save();
    hideResult();
    show("play");
    renderPlay();
    const top = $("#deck .is-top");
    if (top && !reduceMotion) top.classList.add("is-back");
    toast(T.messages.undone, 2200);
  }

  // ------------------------------------------------------------ halftime

  function showHalftime() {
    S.phase = "halftime";
    save();
    const H = T.halftime;
    $("#halfTitle").textContent = H.title;
    $("#halfText").textContent = H.text;
    $("#fortune").hidden = true;
    $("#cookie").classList.remove("is-cracked");
    $("#cookie").disabled = false;
    $("#halfBtn").textContent = H.crack;
    $("#halfBurst").innerHTML = "";
    openOverlay("#halftime");
    const ov = $("#halftime");
    ov.classList.remove("is-in");
    void ov.offsetWidth;
    ov.classList.add("is-in");
  }

  function crackCookie() {
    const c = $("#cookie");
    if (c.classList.contains("is-cracked")) return;
    c.classList.add("is-cracked");
    c.disabled = true;
    const f = $("#fortune");
    f.textContent = T.fortunes[Math.floor(Math.random() * T.fortunes.length)];
    f.hidden = false;
    $("#halfBtn").textContent = T.halftime.after;
    burst($("#halfBurst"), "yes");
  }

  function halfBtn() {
    if (!$("#cookie").classList.contains("is-cracked")) return crackCookie();
    closeOverlay("#halftime");
    S.sawHalftime = true;
    goToCard();
  }

  // ------------------------------------------------------------ finish

  // All 15 twists: 5 Chinese twists + 2 desi dishes for each cuisine.
  function twistPool() {
    return CARDS.flatMap((c) => (c.part === 1 ? [{ name: c.twist.name, photo: c.twist.photo }] : (c.desi || []).map((d) => ({ name: d.name, photo: d.photo }))));
  }

  function finish() {
    const prof = profileFor(effective());
    S.profile = prof.name;
    S.match = Math.floor(Math.random() * twistPool().length); // just for fun, not sent anywhere
    S.phase = "done";
    S.last = null;
    save();
    enqueue("finish", { token: S.token, attempt: S.attempt, profile: prof.name });
    renderDone();
  }

  function renderDone() {
    const D = T.done;
    const A = effective();
    const prof = profileFor(A);
    document.body.dataset.part = "";
    $("#doneKicker").textContent = D.kicker;
    $("#profileName").textContent = prof.name;
    $("#profileLine").textContent = prof.line;
    $("#nextPlayerBtn").textContent = D.nextPlayer;
    const pool = twistPool();
    const m = pool[(S.match ?? 0) % pool.length];
    $("#matchKicker").textContent = D.matchKicker;
    $("#matchName").textContent = m.name;
    $("#matchLine").textContent = fill(D.matchLine, { name: m.name });
    const mp = $("#matchPhoto");
    mp.innerHTML = "";
    mp.append(photoEl(m.photo, "match-photo"));
    const p1 = CARDS.filter((c) => c.part === 1);
    const p2 = CARDS.filter((c) => c.part === 2);
    const yesIn = (list) => list.filter((c) => isYes(A[c.id])).length;
    const crush = CARDS.find((c) => A[c.id] === CRUSH);
    const stats = $("#stats");
    stats.innerHTML = "";
    [
      [`${yesIn(p1)} of ${p1.length}`, D.statPart1],
      [`${yesIn(p2)} of ${p2.length}`, D.statPart2],
      [crush ? crush.name : D.noCrush, D.statCrush],
    ].forEach(([v, k]) => {
      const div = document.createElement("div");
      div.innerHTML = "<dt></dt><dd></dd>";
      div.firstChild.textContent = k;
      div.lastChild.textContent = v;
      stats.append(div);
    });
    const tiles = $("#tiles");
    tiles.innerHTML = "";
    CARDS.forEach((c) => {
      const a = A[c.id] || "";
      const li = document.createElement("li");
      li.className = `tile part-${c.part}`;
      li.dataset.answer = a === CRUSH ? "crush" : a.toLowerCase();
      const twist = c.part === 1 && (a === "Yes" || a === CRUSH);
      li.append(photoEl(twist ? c.twist.photo : c.photos[0], "tile-photo"));
      const t = document.createElement("p");
      t.innerHTML = "<b></b><span></span>";
      t.firstChild.textContent = twist ? c.twist.name : c.name;
      t.lastChild.textContent = a === CRUSH ? T.buttons.crush : a;
      li.append(t);
      tiles.append(li);
    });
    show("done");
    renderProgress();
    renderSync();
  }

  function resetToStart() {
    S = null;
    busy = false;
    store.del(LS_STATE);
    hideResult();
    ["#exitDialog", "#profile", "#halftime"].forEach(closeOverlay);
    $("#flash").hidden = true;
    document.body.dataset.part = "";
    showFormError("");
    show("start");
    renderProgress();
    $("#token").focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ overlays

  function openOverlay(sel) {
    $(sel).hidden = false;
  }
  function closeOverlay(sel) {
    $(sel).hidden = true;
  }

  let toastTimer = null;
  function toast(msg, ms = 3000) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    t.classList.remove("is-in");
    void t.offsetWidth;
    t.classList.add("is-in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  // ------------------------------------------------------------ team panel

  function teamMsg(text, kind = "") {
    const r = $("#tResult");
    r.textContent = text;
    r.dataset.kind = kind;
  }

  async function teamCall(action, extra = {}) {
    const name = $("#tName").value.trim();
    const pin = $("#tPin").value;
    const token = $("#tToken").value.replace(/\s+/g, "");
    if (!pin) {
      teamMsg("Enter the stall PIN.", "error");
      return null;
    }
    if (!token) {
      teamMsg("Enter the token to look up.", "error");
      return null;
    }
    try {
      return await api({ action, pin, token, name, ...extra, rid: uid() });
    } catch {
      teamMsg("Couldn't reach the sheet. Check the internet.", "error");
      return null;
    }
  }

  async function teamCheck(ev) {
    ev && ev.preventDefault();
    teamMsg("Checking…");
    $("#tActions").hidden = true;
    const r = await teamCall("team_check");
    if (!r) return;
    if (!r.ok) return teamMsg(r.message || "That didn't work.", "error");
    if (!r.attempts.length) return teamMsg(`Token ${r.token} hasn't played yet. They can start normally.`);
    const lines = r.attempts.map(
      (a) => `Attempt ${a.attempt}: ${a.status}, ${a.answered} of ${r.total} answered${a.device ? `, device ${a.device}` : ""}${a.duplicate ? ` (${a.duplicate})` : ""}`,
    );
    teamMsg(`Token ${r.token}\n${lines.join("\n")}`);
    const latest = r.attempts[r.attempts.length - 1];
    $("#tReplay").hidden = latest.status !== "Completed";
    $("#tRestart").hidden = latest.status !== "In progress";
    $("#tActions").hidden = $("#tReplay").hidden && $("#tRestart").hidden;
  }

  async function teamAct(action) {
    const name = $("#tName").value.trim();
    const reason = $("#tReason").value.trim();
    if (name.length < 2) return teamMsg("Enter your name first. It's saved with the change.", "error");
    if (reason.length < 5) return teamMsg("Write a short reason (at least 5 characters).", "error");
    const r = await teamCall(action, { reason });
    if (!r) return;
    if (!r.ok) return teamMsg(r.message || "That didn't work.", "error");
    $("#tReason").value = "";
    $("#tActions").hidden = true;
    teamMsg(r.message, "ok");
  }

  function openTeam() {
    $("#tDevice").textContent = device;
    renderSync();
    teamMsg("");
    $("#tActions").hidden = true;
    openOverlay("#team");
    $("#tName").focus();
  }

  // Five taps on the logo within 3 seconds open the team panel.
  let brandTaps = [];
  function onBrand() {
    const now = Date.now();
    brandTaps = brandTaps.filter((t) => now - t < 3000).concat(now);
    if (brandTaps.length >= 5) {
      brandTaps = [];
      openTeam();
    }
  }

  // ------------------------------------------------------------ wiring

  function wire() {
    $("#startForm").addEventListener("submit", onStart);
    // Tokens are numbers only: anything else is dropped as it's typed.
    for (const id of ["#token", "#tToken"]) {
      $(id).addEventListener("input", (e) => {
        const el = e.target;
        const v = el.value.replace(/\D+/g, "");
        if (v !== el.value) el.value = v;
      });
    }
    $("#yesBtn").addEventListener("click", () => decide("Yes", "right"));
    $("#noBtn").addEventListener("click", () => decide("No", "left"));
    $("#undoBtn").addEventListener("click", undo);
    $("#changeBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      hideResult();
      showCrushPick();
    });
    $("#nextBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      next();
    });

    $("#cookie").addEventListener("click", crackCookie);
    $("#halfBtn").addEventListener("click", halfBtn);
    $("#pBack").addEventListener("click", () => closeOverlay("#profile"));
    $("#profile").addEventListener("click", (e) => {
      if (e.target.id === "profile") closeOverlay("#profile");
    });
    $("#nextPlayerBtn").addEventListener("click", resetToStart);
    $("#exitBtn").addEventListener("click", () => openOverlay("#exitDialog"));
    $("#exitCancel").addEventListener("click", () => closeOverlay("#exitDialog"));
    $("#exitConfirm").addEventListener("click", resetToStart);
    $("#brand").addEventListener("click", onBrand);
    $("#tClose").addEventListener("click", () => closeOverlay("#team"));
    $("#teamForm").addEventListener("submit", teamCheck);
    $("#tReplay").addEventListener("click", () => teamAct("team_replay"));
    $("#tRestart").addEventListener("click", () => teamAct("team_restart"));
    $("#tReload").addEventListener("click", () => location.reload());

    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, textarea, select")) return;
      const open = ["#team", "#exitDialog", "#profile"].find((s) => !$(s).hidden);
      if (open) {
        if (e.key === "Escape") closeOverlay(open);
        return;
      }
      if (!$("#halftime").hidden) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          halfBtn();
        }
        return;
      }
      if (S && S.phase === "result" && !$("#result").hidden) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
          e.preventDefault();
          next();
        } else if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          hideResult();
          showCrushPick();
        }
        return;
      }
      // The Desi Crush pick screen: 1 to 5 choose a cuisine.
      if (S && S.phase === "crush") {
        const n = Number(e.key);
        const list = CARDS.filter((c) => c.part === 2);
        if (n >= 1 && n <= list.length) {
          e.preventDefault();
          chooseCrush(list[n - 1].id);
        } else if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          undo();
        }
        return;
      }
      if (document.body.dataset.screen !== "play") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        decide("Yes", "right");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        decide("No", "left");
      } else if (e.key === "Backspace" || e.key === "Delete" || (e.key === "z" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        undo();
      }
    });

    window.addEventListener("beforeunload", (e) => {
      if (queue.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  // ------------------------------------------------------------ boot

  function boot() {
    fillStatic();
    buildFan($("#fan"), [CARDS[0], CARDS.find((c) => c.part === 2), CARDS[1]], T.fanStickers);
    wire();
    renderSync();

    if (S && S.token) {
      const p = S.phase;
      if (p === "done") renderDone();
      else if (p === "halftime") {
        show("play");
        renderPlay();
        showHalftime();
      } else if (p === "result" && S.crush) {
        showCrushPick();
        S.phase = "result";
        showCrush(cardById(S.crush));
      } else if (p === "crush" || firstUnanswered() >= CARDS.length) {
        showCrushPick();
      } else {
        S.index = Math.min(S.index ?? firstUnanswered(), CARDS.length - 1);
        if (S.answers[CARDS[S.index].id]) S.index = firstUnanswered();
        if (S.index >= CARDS.length) return finish();
        S.lastPart = null; // show the round flash again as a reminder
        goToCard();
        toast(fill(T.messages.welcomeBack, { n: S.index + 1 }), 3500);
      }
    } else {
      show("start");
      renderProgress();
    }
    pump();
  }

  boot();
})();
