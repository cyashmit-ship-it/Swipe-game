/* Swipe game — game logic.
 * Content and settings live in data.js. Results go to the Google Sheet via
 * the Apps Script in apps-script/Code.gs.
 *
 * Saving: every swipe is put in a queue stored on this device and sent to the
 * sheet in order. If the internet drops, the queue waits and retries, and it
 * survives a reload. Each request has an id, so a retry never saves twice.
 */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const LS_STATE = "sg_state_v1";
  const LS_QUEUE = "sg_queue_v1";
  const LS_DEVICE = "sg_device_v1";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FIRST_P2 = CARDS.findIndex((c) => c.part === 2);

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

  const configured = () => /^https:\/\/script\.google(usercontent)?\.com\//.test(GAME.scriptUrl);

  class NetError extends Error {}

  async function api(body, timeout = 20000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      // text/plain keeps this a "simple" request, which Apps Script accepts from any site.
      const r = await fetch(GAME.scriptUrl, {
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
        throw new NetError("The results sheet sent back something unexpected.");
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
    if (res.code === "closed" && S && S.token === b.token && S.attempt === b.attempt) {
      resetToStart();
      toast("A team member restarted this game. Enter the token again to start fresh.", 6000);
    } else if (res.code !== "closed") {
      toast(`One answer couldn't be saved (${res.message || res.code}).`, 5000);
    }
  }

  window.addEventListener("online", pump);
  setInterval(() => queue.length && !pumping && pump(), 15000);

  function renderSync(force) {
    const el = $("#sync");
    const txt = $("#syncText");
    const n = queue.length;
    const state = force || (n ? "saving" : "saved");
    el.dataset.state = state;
    txt.textContent =
      state === "offline" ? `Offline, ${n} waiting` : state === "saving" ? (n > 1 ? `Saving ${n}` : "Saving") : "All saved";
    const note = $("#saveNote");
    if (note) {
      note.textContent =
        state === "saved" ? "All your answers are saved." : state === "offline" ? "No internet. Answers will save automatically when it's back." : "Saving your answers…";
      note.dataset.state = state;
    }
    const tq = $("#tQueue");
    if (tq) tq.textContent = n ? `${n} answer${n > 1 ? "s" : ""} waiting to save.` : "Nothing waiting to save.";
  }

  // ------------------------------------------------------------ game state

  // S: { token, attempt, age, gender, answers:{id:answer}, index, last, undos, phase, seenTwist, profile }
  let S = store.get(LS_STATE, null);
  let busy = false; // a card is flying off; ignore other swipes
  let starting = false; // waiting for the token check
  const save = () => store.set(LS_STATE, S);

  function firstUnanswered() {
    const i = CARDS.findIndex((c) => !S.answers[c.id]);
    return i < 0 ? CARDS.length : i;
  }

  function profileFor(answers) {
    const yes = CARDS.filter((c) => answers[c.id] === "Yes" || answers[c.id] === "Super Like").length;
    return { yes, ...GAME.profiles.find((p) => yes <= p.max) };
  }

  // ------------------------------------------------------------ screens

  function show(name) {
    document.body.dataset.screen = name;
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === `screen-${name}`));
    window.scrollTo(0, 0);
  }

  function fillText() {
    document.querySelectorAll("[data-text]").forEach((el) => {
      el.textContent = GAME[el.dataset.text];
    });
    document.title = GAME.title;
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
    [...card.photos, card.twist && card.twist.photo].filter(Boolean).forEach((p) => {
      const i = new Image();
      i.src = p.src;
    });
  }

  // ------------------------------------------------------------ start screen

  function buildFan(el, cards) {
    el.innerHTML = "";
    cards.forEach((c, i) => {
      const f = document.createElement("div");
      f.className = `fan-card part-${c.part}`;
      f.style.setProperty("--i", i - (cards.length - 1) / 2);
      f.append(photoEl(c.photos[0]));
      const name = document.createElement("span");
      name.className = "fan-name";
      name.textContent = c.name;
      f.append(name);
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
    const token = form.token.value.trim();
    const age = parseInt(form.age.value, 10);
    const gender = (form.querySelector("input[name=gender]:checked") || {}).value;
    if (!token) return showFormError("Enter the token number from your slip.");
    if (!/^[A-Za-z0-9-\s]{1,20}$/.test(token)) return showFormError("Tokens use letters and numbers only.");
    if (!(age >= 5 && age <= 99)) return showFormError("Enter your age (5 to 99).");
    if (!gender) return showFormError("Choose a gender option.");
    if (!configured()) {
      return showFormError("The results sheet isn't connected yet. A team member needs to paste the Apps Script link into data.js.");
    }
    showFormError("");
    starting = true;
    const btn = $("#startBtn");
    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.firstElementChild.textContent = "Checking token…";
    let res;
    try {
      res = await api({ action: "start", token, age, gender, rid: uid() });
    } catch {
      res = null;
    }
    starting = false;
    busy = false;
    btn.disabled = false;
    btn.classList.remove("is-loading");
    btn.firstElementChild.textContent = GAME.startButton;

    if (!res) return showFormError("Couldn't reach the results sheet. Check the internet connection, then tap Start again.");
    if (!res.ok) {
      if (res.code === "used") {
        return showFormError(`Token ${res.token} has already played. If they need another go, ask a team member.`);
      }
      return showFormError(res.message || "That didn't work. Try again.");
    }

    S = {
      token: res.token,
      attempt: res.attempt,
      age: res.age || age,
      gender: res.gender || gender,
      answers: res.answers || {},
      last: null,
      undos: 0,
      seenTwist: false,
      phase: "play",
    };
    S.index = firstUnanswered();
    S.seenTwist = S.index > FIRST_P2;
    form.reset();
    if (S.index >= CARDS.length) return finish();
    if (res.state === "resume") toast(`Welcome back. Carrying on from dish ${S.index + 1} of ${CARDS.length}.`, 4000);
    goToCard();
  }

  // ------------------------------------------------------------ play

  function goToCard() {
    if (CARDS[S.index].part === 2 && !S.seenTwist) {
      S.phase = "twist";
      save();
      return showTwist();
    }
    S.phase = "play";
    save();
    show("play");
    renderPlay();
  }

  function renderProgress() {
    const ol = $("#progress");
    ol.innerHTML = "";
    CARDS.forEach((c, i) => {
      const li = document.createElement("li");
      li.className = `part-${c.part}`;
      if (S && S.answers[c.id]) li.classList.add("done");
      if (S && i === S.index && S.phase !== "done") li.classList.add("now");
      li.setAttribute("aria-label", `${c.name}${S && S.answers[c.id] ? ", answered" : ""}`);
      ol.append(li);
    });
  }

  function renderPlay() {
    const card = CARDS[S.index];
    const round = GAME.rounds[card.part];
    document.body.dataset.part = card.part;
    $("#roundTag").textContent = round.tag;
    $("#question").textContent = round.question;
    $("#roundHint").textContent = round.hint;
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
    if (card.twist) preload({ photos: [], twist: card.twist });
  }

  function cardEl(card, cls) {
    const el = document.createElement("article");
    el.className = `card part-${card.part} ${cls}`;
    el.dataset.id = card.id;
    el.dataset.photo = "0";
    el.setAttribute("aria-label", `${card.name}. ${card.bio}`);

    const photos = document.createElement("div");
    photos.className = "card-photos";
    if (card.photos.length > 1) {
      const bars = document.createElement("div");
      bars.className = "bars";
      card.photos.forEach((_, i) => {
        const b = document.createElement("span");
        if (i === 0) b.className = "on";
        bars.append(b);
      });
      photos.append(bars);
    }
    card.photos.forEach((p, i) => {
      const ph = photoEl(p);
      if (i > 0) ph.hidden = true;
      photos.append(ph);
    });
    el.append(photos);

    const tag = document.createElement("span");
    tag.className = "card-tag";
    tag.textContent = GAME.rounds[card.part].tag;
    el.append(tag);

    for (const [k, label] of [["yes", "Yes"], ["no", "No"], ["super", "Super Like"]]) {
      const s = document.createElement("span");
      s.className = `stamp stamp-${k}`;
      s.textContent = label;
      el.append(s);
    }

    const info = document.createElement("div");
    info.className = "card-info";
    info.innerHTML = `<h3></h3><p class="from"><svg><use href="#i-pin"/></svg><span></span></p>${
      card.photos.length > 1 ? `<p class="caption"><b></b> <span></span></p>` : ""
    }<p class="bio"></p><ul class="chips"></ul>`;
    info.querySelector("h3").textContent = card.name;
    info.querySelector(".from span").textContent = card.from;
    info.querySelector(".bio").textContent = card.bio;
    if (card.photos.length > 1) setCaption(info, card.photos[0]);
    const chips = info.querySelector(".chips");
    card.chips.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = c;
      chips.append(li);
    });
    el.append(info);

    if (card.photos.length > 1) {
      const hint = document.createElement("span");
      hint.className = "tap-hint";
      hint.textContent = `Tap the photo to see ${card.photos.length} dishes`;
      el.append(hint);
    }
    return el;
  }

  function setCaption(info, p) {
    info.querySelector(".caption b").textContent = p.caption;
    info.querySelector(".caption span").textContent = p.line || "";
  }

  function flipPhoto(el, dir) {
    const card = CARDS.find((c) => c.id === el.dataset.id);
    if (!card || card.photos.length < 2) return;
    const n = card.photos.length;
    const i = (Number(el.dataset.photo) + dir + n) % n;
    el.dataset.photo = String(i);
    el.querySelectorAll(".card-photos .photo").forEach((p, j) => (p.hidden = j !== i));
    el.querySelectorAll(".bars span").forEach((b, j) => b.classList.toggle("on", j === i));
    setCaption(el.querySelector(".card-info"), card.photos[i]);
    el.classList.add("seen-photos");
  }

  // ---------------------------------------------- dragging

  function setStamps(el, dx, dy) {
    const w = el.offsetWidth || 300;
    const yes = Math.max(0, Math.min(1, dx / (w * 0.3)));
    const no = Math.max(0, Math.min(1, -dx / (w * 0.3)));
    const sup = Math.abs(dx) < w * 0.25 ? Math.max(0, Math.min(1, -dy / (w * 0.3))) : 0;
    el.style.setProperty("--yes", yes);
    el.style.setProperty("--no", no);
    el.style.setProperty("--super", sup);
  }

  function attachDrag(el) {
    let sx = 0, sy = 0, dx = 0, dy = 0, t0 = 0, pid = null;

    el.addEventListener("pointerdown", (e) => {
      if (busy || S.phase !== "play" || (e.pointerType === "mouse" && e.button !== 0)) return;
      pid = e.pointerId;
      el.setPointerCapture(pid);
      sx = e.clientX;
      sy = e.clientY;
      dx = dy = 0;
      t0 = performance.now();
      el.classList.add("is-dragging");
    });

    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pid) return;
      dx = e.clientX - sx;
      dy = e.clientY - sy;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.05}deg)`;
      setStamps(el, dx, dy);
    });

    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      el.classList.remove("is-dragging");
      const moved = Math.hypot(dx, dy);
      if (moved < 8 && performance.now() - t0 < 500 && e.type === "pointerup") {
        el.style.transform = "";
        const r = el.getBoundingClientRect();
        flipPhoto(el, e.clientX - r.left > r.width / 2 ? 1 : -1);
        return;
      }
      const th = Math.min(120, el.offsetWidth * 0.28);
      if (dx > th) decide("Yes", "right");
      else if (dx < -th) decide("No", "left");
      else if (dy < -th && Math.abs(dx) < th) decide("Super Like", "up");
      else {
        el.classList.add("is-returning");
        el.style.transform = "";
        setStamps(el, 0, 0);
        setTimeout(() => el.classList.remove("is-returning"), 300);
      }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  function flyOut(el, dir) {
    return new Promise((resolve) => {
      if (!el) return resolve();
      const w = el.offsetWidth;
      const fromButton = !el.style.transform;
      if (fromButton) {
        el.style.setProperty("--yes", dir === "right" ? 1 : 0);
        el.style.setProperty("--no", dir === "left" ? 1 : 0);
        el.style.setProperty("--super", dir === "up" ? 1 : 0);
      }
      if (reduceMotion) return setTimeout(resolve, 120);
      const x = dir === "right" ? window.innerWidth + w : dir === "left" ? -window.innerWidth - w : 0;
      const y = dir === "up" ? -window.innerHeight - el.offsetHeight : 40;
      const rot = dir === "right" ? 22 : dir === "left" ? -22 : 0;
      el.classList.add("is-leaving");
      // Let the stamp show for a beat when a button was used.
      setTimeout(() => {
        el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
      }, fromButton ? 140 : 0);
      setTimeout(resolve, fromButton ? 480 : 340);
    });
  }

  // ---------------------------------------------- answering

  function decide(answer, dir) {
    if (busy || !S || S.phase !== "play") return;
    busy = true;
    const card = CARDS[S.index];
    S.answers[card.id] = answer;
    S.last = { id: card.id, answer, index: S.index };
    S.phase = "result";
    save();
    enqueue("answer", { token: S.token, attempt: S.attempt, card: card.id, answer });
    if (navigator.vibrate) navigator.vibrate(answer === "No" ? 15 : [20, 40, 30]);
    const game = S;
    flyOut($("#deck .is-top"), dir).then(() => {
      busy = false;
      if (S !== game) return; // game was reset meanwhile (for example by a team restart)
      renderProgress();
      showResult(card, answer);
    });
  }

  function plate(photo, cls) {
    const p = photoEl(photo, `plate ${cls}`);
    return p;
  }

  function showResult(card, answer) {
    const yes = answer !== "No";
    const ov = $("#result");
    ov.dataset.answer = answer === "Super Like" ? "super" : yes ? "yes" : "no";
    ov.dataset.part = card.part;
    const plates = $("#plates");
    plates.innerHTML = "";
    const teasers = $("#teasers");
    teasers.innerHTML = "";
    let title, name, line;

    if (card.part === 1) {
      if (yes) {
        title = answer === "Super Like" ? "Super match!" : "It's a match!";
        plates.append(plate(card.photos[0], "plate-left"), plate(card.twist.photo, "plate-right"));
        name = card.twist.name;
        line = card.twist.line;
      } else {
        title = "Keeping it classic";
        plates.append(plate(card.photos[0], "plate-solo"));
        name = card.name;
        line = card.classicLine;
      }
    } else {
      plates.append(plate(card.photos[0], "plate-left"), plate(card.photos[1] || card.photos[0], "plate-right"));
      if (yes) {
        title = answer === "Super Like" ? "Super match!" : "It's a match!";
        name = `${card.name}, the desi way`;
        line = "On your first date, you might get:";
        card.teasers.forEach((t) => {
          const li = document.createElement("li");
          li.textContent = t;
          teasers.append(li);
        });
      } else {
        title = "Keeping it authentic";
        name = card.name;
        line = card.authenticLine;
      }
    }
    $("#resultTitle").textContent = title;
    $("#resultName").textContent = name;
    $("#resultLine").textContent = line;
    $("#nextBtn").textContent = S.index === CARDS.length - 1 ? "See my food profile" : "Next dish";
    ov.hidden = false;
    // restart the entrance animation
    ov.classList.remove("is-in");
    void ov.offsetWidth;
    ov.classList.add("is-in");
    burst(ov.dataset.answer);
    $("#nextBtn").focus({ preventScroll: true });
  }

  function hideResult() {
    $("#result").hidden = true;
    $("#burst").innerHTML = "";
  }

  function burst(kind) {
    const host = $("#burst");
    host.innerHTML = "";
    if (reduceMotion) return;
    const glyphs = kind === "no" ? ["✨", "⭐", "✨"] : kind === "super" ? ["⭐", "💙", "✨"] : ["💚", "❤️", "✨"];
    for (let i = 0; i < 22; i++) {
      const s = document.createElement("span");
      s.textContent = glyphs[i % glyphs.length];
      const a = (Math.PI * 2 * i) / 22 + Math.random() * 0.3;
      const d = 160 + Math.random() * 220;
      s.style.setProperty("--x", `${Math.cos(a) * d}px`);
      s.style.setProperty("--y", `${Math.sin(a) * d}px`);
      s.style.setProperty("--d", `${Math.random() * 120}ms`);
      host.append(s);
    }
  }

  function next() {
    if (busy || !S || S.phase !== "result") return;
    hideResult();
    S.index++;
    if (S.index >= CARDS.length) return finish();
    goToCard();
  }

  // Undo works for the most recent swipe only.
  function undo() {
    if (busy || !S || !S.last || (S.phase !== "play" && S.phase !== "result")) return;
    const { id, answer, index } = S.last;
    delete S.answers[id];
    S.index = index;
    S.last = null;
    S.undos = (S.undos || 0) + 1;
    S.phase = "play";
    save();
    enqueue("undo", { token: S.token, attempt: S.attempt, card: id, was: answer });
    hideResult();
    show("play");
    renderPlay();
    const top = $("#deck .is-top");
    if (top && !reduceMotion) top.classList.add("is-back");
    toast("Answer removed. Swipe again.", 2200);
  }

  // ------------------------------------------------------------ plot twist

  function showTwist() {
    $("#twistTitle").textContent = GAME.plotTwist.title;
    $("#twistText").textContent = GAME.plotTwist.text;
    $("#twistBtn").textContent = GAME.plotTwist.button;
    buildFan($("#twistFan"), CARDS.filter((c) => c.part === 2).slice(0, 3));
    document.body.dataset.part = 2;
    show("twist");
    renderProgress();
  }

  // ------------------------------------------------------------ finish

  function finish() {
    const prof = profileFor(S.answers);
    S.profile = prof.name;
    S.phase = "done";
    S.last = null;
    save();
    enqueue("finish", { token: S.token, attempt: S.attempt, profile: prof.name });
    renderDone();
  }

  function renderDone() {
    const prof = profileFor(S.answers);
    document.body.dataset.part = "";
    $("#profileName").textContent = prof.name;
    $("#profileLine").textContent = prof.line;
    const p1 = CARDS.filter((c) => c.part === 1);
    const p2 = CARDS.filter((c) => c.part === 2);
    const yesIn = (list) => list.filter((c) => S.answers[c.id] && S.answers[c.id] !== "No").length;
    const sup = CARDS.filter((c) => S.answers[c.id] === "Super Like").length;
    const stats = $("#stats");
    stats.innerHTML = "";
    [
      [`${yesIn(p1)} of ${p1.length}`, "Chinese twists you'd try"],
      [`${yesIn(p2)} of ${p2.length}`, "Cuisines you'd make desi"],
      [String(sup), sup === 1 ? "Super Like" : "Super Likes"],
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
      const a = S.answers[c.id] || "";
      const li = document.createElement("li");
      li.className = `tile part-${c.part}`;
      li.dataset.answer = a === "Super Like" ? "super" : a.toLowerCase();
      li.append(photoEl(c.part === 1 && a && a !== "No" ? c.twist.photo : c.photos[0], "tile-photo"));
      const t = document.createElement("p");
      t.innerHTML = "<b></b><span></span>";
      t.firstChild.textContent = c.part === 1 && a && a !== "No" ? c.twist.name : c.name;
      t.lastChild.textContent = a;
      li.append(t);
      tiles.append(li);
    });
    show("done");
    renderProgress();
    renderSync();
  }

  function resetToStart() {
    S = null;
    store.del(LS_STATE);
    hideResult();
    closeOverlay("#exitDialog");
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

  let teamLatest = null;

  function teamMsg(text, kind = "") {
    const r = $("#tResult");
    r.textContent = text;
    r.dataset.kind = kind;
  }

  async function teamCall(action, extra = {}) {
    const name = $("#tName").value.trim();
    const pin = $("#tPin").value;
    const token = $("#tToken").value.trim();
    if (!pin) {
      teamMsg("Enter the stall PIN.", "error");
      return null;
    }
    if (!token) {
      teamMsg("Enter the token to look up.", "error");
      return null;
    }
    if (!configured()) {
      teamMsg("The results sheet isn't connected yet (data.js has no Apps Script link).", "error");
      return null;
    }
    try {
      return await api({ action, pin, token, name, ...extra, rid: uid() });
    } catch {
      teamMsg("Couldn't reach the results sheet. Check the internet.", "error");
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
    if (!r.attempts.length) {
      teamLatest = null;
      return teamMsg(`Token ${r.token} hasn't played yet. They can start normally.`);
    }
    const lines = r.attempts.map(
      (a) => `Attempt ${a.attempt}: ${a.status}, ${a.answered} of ${r.total} answered${a.duplicate ? ` (${a.duplicate})` : ""}`,
    );
    teamMsg(`Token ${r.token}\n${lines.join("\n")}`);
    teamLatest = r.attempts[r.attempts.length - 1];
    $("#tReplay").hidden = teamLatest.status !== "Completed";
    $("#tRestart").hidden = teamLatest.status !== "In progress";
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

  // ------------------------------------------------------------ wiring

  function wire() {
    $("#startForm").addEventListener("submit", onStart);
    $("#yesBtn").addEventListener("click", () => decide("Yes", "right"));
    $("#noBtn").addEventListener("click", () => decide("No", "left"));
    $("#superBtn").addEventListener("click", () => decide("Super Like", "up"));
    $("#undoBtn").addEventListener("click", undo);
    $("#changeBtn").addEventListener("click", undo);
    $("#nextBtn").addEventListener("click", next);
    $("#twistBtn").addEventListener("click", () => {
      S.seenTwist = true;
      goToCard();
    });
    $("#nextPlayerBtn").addEventListener("click", resetToStart);
    $("#exitBtn").addEventListener("click", () => openOverlay("#exitDialog"));
    $("#exitCancel").addEventListener("click", () => closeOverlay("#exitDialog"));
    $("#exitConfirm").addEventListener("click", resetToStart);
    $("#teamOpen").addEventListener("click", openTeam);
    $("#tClose").addEventListener("click", () => closeOverlay("#team"));
    $("#teamForm").addEventListener("submit", teamCheck);
    $("#tReplay").addEventListener("click", () => teamAct("team_replay"));
    $("#tRestart").addEventListener("click", () => teamAct("team_restart"));
    $("#tReload").addEventListener("click", () => location.reload());

    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, textarea, select")) return;
      if (!$("#team").hidden || !$("#exitDialog").hidden) {
        if (e.key === "Escape") {
          closeOverlay("#team");
          closeOverlay("#exitDialog");
        }
        return;
      }
      const screen = document.body.dataset.screen;
      if (S && S.phase === "result" && !$("#result").hidden) {
        if (e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          next();
        } else if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          undo();
        }
        return;
      }
      if (screen !== "play") return;
      const map = { ArrowRight: ["Yes", "right"], ArrowLeft: ["No", "left"], ArrowUp: ["Super Like", "up"] };
      if (map[e.key]) {
        e.preventDefault();
        decide(...map[e.key]);
      } else if (e.key === "Backspace" || e.key === "Delete" || (e.key === "z" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        undo();
      }
    });

    // Leaving mid-game: answers are saved, but warn if some are still waiting.
    window.addEventListener("beforeunload", (e) => {
      if (queue.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  // ------------------------------------------------------------ boot

  function boot() {
    fillText();
    buildFan($("#fan"), [CARDS[0], CARDS[2], CARDS[1]]);
    wire();
    renderSync();

    if (S && S.token && Array.isArray(CARDS)) {
      if (S.phase === "done") {
        renderDone();
      } else if (S.phase === "twist") {
        showTwist();
      } else {
        if (S.phase === "result" && S.last) {
          // Reloaded on the result screen: show it again.
          S.index = S.last.index;
          show("play");
          renderPlay();
          showResult(CARDS[S.last.index], S.last.answer);
        } else {
          S.phase = "play";
          S.index = Math.min(S.index ?? firstUnanswered(), CARDS.length - 1);
          if (S.answers[CARDS[S.index].id]) S.index = firstUnanswered();
          if (S.index >= CARDS.length) return finish();
          show("play");
          renderPlay();
        }
        toast(`Welcome back. Carrying on from dish ${S.index + 1} of ${CARDS.length}.`, 3500);
      }
    } else {
      show("start");
      renderProgress();
    }
    pump();
  }

  boot();
})();
