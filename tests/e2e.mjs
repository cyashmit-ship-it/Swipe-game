// Browser test of the whole game against the real Code.gs (in-memory sheet).
// Run: node tests/e2e.mjs [screenshot-folder]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBackend } from "./gas-mock.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHOTS = process.argv[2] || join(ROOT, "tests", "shots");
mkdirSync(SHOTS, { recursive: true });
const FAKE_URL = "https://script.google.com/macros/s/TEST/exec";
const be = createBackend(join(ROOT, "apps-script", "Code.gs"), { pin: "4321" });

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};
const rows = () => be.sheet("Players")?.rows() ?? [];
const row = (token, attempt = 1) => rows().find((r) => String(r.Token) === token && r.Attempt === attempt);

// ---------------------------------------------------------------- static server
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  if (!p.startsWith(ROOT) || !existsSync(p)) {
    res.writeHead(404);
    return res.end();
  }
  let body = readFileSync(p);
  if (p.endsWith("data.js")) body = body.toString().replace(/scriptUrl: "[^"]*"/, `scriptUrl: "${FAKE_URL}"`);
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
let offline = false;

async function newPage(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...opts });
  await ctx.route("https://script.google.com/**", async (route) => {
    if (offline) return route.abort("internetdisconnected");
    await new Promise((r) => setTimeout(r, 60));
    const text = be.raw(route.request().postData() || "");
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: text });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => {
    console.log("PAGE ERROR", e.message);
    failures++;
  });
  await page.goto(BASE);
  return { ctx, page };
}

const settle = (page, ms = 450) => page.waitForTimeout(ms);
const until = (page, fn, ms = 8000, arg = null) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const visible = (loc, ms = 5000) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
const hidden = (loc, ms = 8000) => loc.waitFor({ state: "hidden", timeout: ms }).then(() => true, () => false);

async function startGame(page, token, age = "22", gender = "Female") {
  await page.locator("#token").fill(token);
  await page.locator("#age").fill(age);
  await page.locator(`.chips-choice span:text-is("${gender}")`).click();
  await page.locator("#startBtn").click();
}
// After Start: wait for the round flash to finish and a card to show.
async function toCard(page) {
  await page.waitForTimeout(150);
  await waitFlash(page);
  return visible(page.locator("#deck .is-top"));
}
async function waitFlash(page) {
  await page.waitForTimeout(150);
  return hidden(page.locator("#flash"), 5000);
}
const cardName = (page) => page.locator("#deck .is-top h3").textContent();
const resultTitle = (page) => page.locator("#resultTitle").textContent();
const waitResult = (page) => visible(page.locator("#result"), 4000);
// Yes/No: the next card comes straight in (no result screen).
const nextCard = (page, name, ms = 2500) =>
  until(page, (n) => document.querySelector("#deck .is-top:not(.is-leaving) h3")?.textContent === n, ms, name);

async function dragCard(page, dx) {
  const box = await page.locator("#deck .is-top").boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + (dx * i) / 12, y);
  await page.mouse.up();
}
async function touchSwipe(page, dx, dy = 0) {
  const box = await page.locator("#deck .is-top").boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 3;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const inViewport = (page, sel) =>
  page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1;
  }, sel);
const textBelowPhoto = (page) =>
  page.evaluate(() => {
    const c = document.querySelector("#deck .is-top");
    return c.querySelector(".card-info").getBoundingClientRect().top >= c.querySelector(".card-photos").getBoundingClientRect().bottom - 1;
  });
async function openTeam(page) {
  for (let i = 0; i < 5; i++) await page.locator("#brand").click();
  return visible(page.locator("#team"));
}

// ================================================================ laptop: full game
{
  const { page } = await newPage({ width: 1440, height: 860 });
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/01-start-laptop.png` });

  const words = (await page.locator("body").innerText()).toLowerCase();
  check(!/(research|survey|saved|sheet|\bdata\b)/.test(words), "start page has no research or data wording");
  check((await page.locator("text=Team >> visible=true").count()) === 0, "no visible Team button for players");
  check((await page.locator("#startHow li").count()) === 3, "how-it-works lines are on the start screen");
  await page.locator(".fan-card").nth(0).hover({ force: true });
  await settle(page, 500);
  check(Number(await page.locator(".fan-card").nth(0).locator(".fan-stamp").evaluate((e) => getComputedStyle(e).opacity)) > 0.9, "hovering a start card shows its sticker");
  await page.screenshot({ path: `${SHOTS}/02-start-hover.png` });

  await page.locator("#token").fill(" 0 1 2 ");
  check((await page.locator("#token").inputValue()) === "012", "token box drops spaces as you type");
  await page.locator("#token").fill("ab1");
  check((await page.locator("#token").inputValue()) === "AB1", "token box shows capitals");

  await startGame(page, "012");
  check(await visible(page.locator("#flash")), "Start goes straight to the round 1 flash (no extra screen)");
  await settle(page, 500);
  await page.screenshot({ path: `${SHOTS}/03-flash-round1.png` });
  await waitFlash(page);

  // 1 Schezwan Dosa
  check((await cardName(page)) === "Schezwan Dosa", "card 1 shows the twist: Schezwan Dosa");
  check((await page.locator("#deck .is-top .origin").textContent()).includes("Masala Dosa"), "card 1 names the original dish");
  check((await page.locator("#deck .is-top .origin-photo").count()) === 1, "small photo of the original dish");
  check(await textBelowPhoto(page), "card text sits below the photo (no overlap)");
  check(await page.locator("#crushBtn").isHidden(), "Desi Crush button hidden in round 1");
  check((await page.locator("#question").textContent()).includes("Chinese twist"), "question on the left names the Chinese twist");
  await settle(page, 500);
  await page.screenshot({ path: `${SHOTS}/04-card-round1.png` });

  await page.locator("#deck .is-top .info-btn").click();
  check(await visible(page.locator("#profile")), "full profile opens");
  check((await page.locator("#pFacts").innerText()).includes("Green flag"), "profile shows green flag and other details");
  check((await page.locator("#pPhotos .sheet-photo").count()) === 2, "profile shows the twist and the original");
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/05-profile-sheet.png` });
  await page.locator("#pBack").click();

  await page.locator("#yesBtn").click();
  check(await nextCard(page, "Noodle Samosa"), "Yes: next card comes straight in");
  check(await page.locator("#result").isHidden(), "no result screen after Yes");

  // 2 Noodle Samosa: drag left
  await dragCard(page, -280);
  check(await nextCard(page, "Chinese Bhel"), "drag left = No, next card");
  check(await page.locator("#result").isHidden(), "no result screen after No");

  // 3 Chinese Bhel: Yes by key. 4 Chilli Soya Chaap: No, undo, Yes.
  await page.keyboard.press("ArrowRight");
  check(await nextCard(page, "Chilli Soya Chaap"), "card 4 is Chilli Soya Chaap");
  await page.keyboard.press("ArrowLeft");
  await nextCard(page, "Schezwan Pav Bhaji");
  await page.locator("#undoBtn").click();
  check((await cardName(page)) === "Chilli Soya Chaap", "undo goes back one card");
  check(await page.locator("#undoBtn").isDisabled(), "undo is off after one undo");
  await page.keyboard.press("ArrowRight");
  await nextCard(page, "Schezwan Pav Bhaji");

  // 5 Schezwan Pav Bhaji, then the round 2 flash
  await page.keyboard.press("ArrowRight");
  check(await visible(page.locator("#flash")), "round 2 flash after dish 5");
  check((await page.locator("#flashCrush").textContent()).includes("Desi Crush"), "round 2 flash explains the Desi Crush");
  check(await page.locator("#halftime").isHidden(), "fortune cookie is switched off");
  await settle(page, 700);
  await page.screenshot({ path: `${SHOTS}/06-flash-round2.png` });
  await waitFlash(page);

  // 6 Korean: Desi Crush
  check((await cardName(page)) === "Korean", "card 6 is Korean");
  check((await page.locator("#deck .is-top .card-photos.is-split .photo").count()) === 2, "Korean card shows two desi dishes side by side");
  check((await page.locator("#deck .is-top .split-cap").first().textContent()).includes("Butter-chicken"), "desi dish names on the photos");
  check(await page.locator("#crushBtn").isVisible(), "Desi Crush button shows in round 2");
  check((await page.locator("#crushCount").textContent()) === "1", "1 Desi Crush available");
  check(await textBelowPhoto(page), "round 2: no text over the photos");
  await settle(page, 400);
  await page.screenshot({ path: `${SHOTS}/07-card-round2.png` });
  await page.keyboard.press("ArrowUp");
  check(await waitResult(page), "Desi Crush opens its screen");
  check((await resultTitle(page)) === "Desi crush!", "Desi Crush title");
  await settle(page, 450);
  await page.screenshot({ path: `${SHOTS}/08-crush-crash.png` });
  await settle(page, 1200);
  await page.screenshot({ path: `${SHOTS}/09-crush-done.png` });
  await page.waitForTimeout(3000);
  check(await page.locator("#result").isVisible(), "Desi Crush screen waits for Next");
  await page.locator("#nextBtn").click();

  // 7 Italian: Yes
  check(await nextCard(page, "Italian"), "card 7 is Italian");
  check((await page.locator("#crushCount").textContent()) === "0", "Desi Crush shows as used");
  await page.keyboard.press("ArrowRight");

  // 8 Thai: move the Desi Crush from Korean, change it, move again
  check(await nextCard(page, "Thai"), "card 8 is Thai");
  await page.locator("#crushBtn").click();
  check(await visible(page.locator("#moveDialog")), "using it again asks to move the Desi Crush");
  check((await page.locator("#moveText").textContent()).includes("Korean"), "move question names Korean");
  await page.screenshot({ path: `${SHOTS}/10-move-crush.png` });
  await page.locator("#moveYes").click();
  await waitResult(page);
  await page.locator("#changeBtn").click();
  check((await cardName(page)) === "Thai", "Change my answer goes back to Thai");
  await page.locator("#crushBtn").click();
  await page.locator("#moveYes").click();
  await waitResult(page);
  await page.locator("#nextBtn").click();
  await nextCard(page, "Mexican");

  // Reload mid-game
  await until(page, () => document.querySelector("#sync").dataset.state === "saved");
  await page.reload();
  await waitFlash(page);
  check((await cardName(page)) === "Mexican", "reload resumes at dish 9");

  // Offline
  offline = true;
  await page.locator("#noBtn").click();
  check(await nextCard(page, "Japanese"), "card 10 is Japanese, even offline");
  check(await until(page, () => document.querySelector("#sync").dataset.state === "offline"), "offline dot turns red");
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  check(await until(page, () => document.querySelector("#sync").dataset.state === "saved", 15000), "answers save once the internet is back");

  await page.locator("#yesBtn").click();
  check(await visible(page.locator("#screen-done"), 5000), "profile screen right after the last swipe");
  check(await until(page, () => document.querySelector("#sync").dataset.state === "saved"), "everything saved");
  check(!/(saved|sheet|second)/i.test(await page.locator("#screen-done").innerText()), "end screen has no saving or timer wording");
  check((await page.locator("#tiles li").first().innerText()).includes("Schezwan Dosa"), "end tiles show the twists");
  await settle(page, 600);
  await page.screenshot({ path: `${SHOTS}/11-done.png` });

  const head = be.sheet("Players").data[0].slice(8, 18);
  check(head.join("|") === "P1 Masala Dosa|P1 Samosa|P1 Bhel Puri|P1 Soya Chaap|P1 Pav Bhaji|P2 Korean|P2 Italian|P2 Thai|P2 Mexican|P2 Japanese", "sheet columns: round 1, then round 2");
  const r = row("12");
  const expect = {
    "P1 Masala Dosa": "Yes", "P1 Samosa": "No", "P1 Bhel Puri": "Yes", "P1 Soya Chaap": "Yes", "P1 Pav Bhaji": "Yes",
    "P2 Korean": "Yes", "P2 Italian": "Yes", "P2 Thai": "Super Like", "P2 Mexican": "No", "P2 Japanese": "Yes",
  };
  const wrong = Object.entries(expect).filter(([k, v]) => r?.[k] !== v);
  check(r && !wrong.length, `sheet has every answer; Desi Crush saved as Super Like on Thai only ${wrong.length ? JSON.stringify(wrong.map(([k]) => [k, r?.[k]])) : ""}`);
  check(r?.Status === "Completed" && r?.["Super Likes"] === 1 && r?.["Yes total (incl. Super Like)"] === 8, "row completed with 1 Super Like, 8 yes");
  const thaiLog = be.sheet("Swipe log").rows().find((l) => String(l.Token) === "12" && l.Card === "P2 Thai");
  check(thaiLog?.["Card #"] === 8, "Swipe log Card # = order played");
  check((await page.locator("#stats").innerText()).includes("Thai"), "end screen shows the Desi Crush");

  // Same token blocked; 12 = 012
  await page.locator("#nextPlayerBtn").click();
  await startGame(page, "12", "30", "Male");
  check(await visible(page.locator("#formError")), "finished token is blocked");
  check((await page.locator("#formError").textContent()).includes("already played"), "message says already played");

  // Team panel via 5 taps on the logo
  check(await openTeam(page), "5 taps on the logo open the team panel");
  await page.locator("#tName").fill("Riya");
  await page.locator("#tPin").fill("4321");
  await page.locator("#tToken").fill("12");
  await page.locator("#tCheck").click();
  check(await visible(page.locator("#tReplay")), "replay offered for a finished token");
  await page.locator("#tReason").fill("Phone battery died, re-run approved");
  await page.locator("#tReplay").click();
  check(await until(page, () => /can play again/.test(document.querySelector("#tResult").textContent)), "replay allowed");
  await page.locator("#tClose").click();
  await page.locator("#startBtn").click();
  check(await toCard(page), "token 12 plays again after the override");
  check(/^YES/.test(row("12", 2)?.Duplicate || ""), "replay row marked duplicate");
  await page.context().close();
}

// ================================================================ timing: how long the game itself takes
{
  const { page, ctx } = await newPage({ width: 1440, height: 860 });
  await page.locator("#token").fill("555");
  await page.locator("#age").fill("23");
  await page.locator('.chips-choice span:text-is("Male")').click();
  const t0 = Date.now();
  await page.locator("#startBtn").click();
  const names = ["Schezwan Dosa", "Noodle Samosa", "Chinese Bhel", "Chilli Soya Chaap", "Schezwan Pav Bhaji", "Korean", "Italian", "Thai", "Mexican", "Japanese"];
  for (let i = 0; i < 10; i++) {
    // Wait for the card to be ready (as fast as a player could act), then answer.
    await until(page, (n) => {
      const top = document.querySelector("#deck .is-top:not(.is-leaving) h3");
      return top && top.textContent === n && document.querySelector("#flash").hidden;
    }, 8000, names[i]);
    await page.keyboard.press(i % 3 === 1 ? "ArrowLeft" : "ArrowRight");
  }
  await visible(page.locator("#screen-done"), 5000);
  const machine = (Date.now() - t0) / 1000;
  console.log(`      game overhead with instant answers: ${machine.toFixed(1)} s (add ~3 s thinking per dish)`);
  check(machine < 12, `screens and animations take under 12 s in total (${machine.toFixed(1)} s)`);
  await ctx.close();
}

// ================================================================ iPad + phone
{
  const ipad = await newPage({ width: 1180, height: 820 }, { hasTouch: true });
  const p = ipad.page;
  await startGame(p, "77", "19", "Male");
  await toCard(p);
  await settle(p, 600);
  await p.screenshot({ path: `${SHOTS}/12-card-ipad-landscape.png` });
  check(await inViewport(p, ".controls"), "iPad landscape: buttons fit on screen");
  check(await noOverflow(p), "iPad landscape: no sideways scrolling");
  check(await textBelowPhoto(p), "iPad landscape: no text over the photo");
  await touchSwipe(p, 300);
  check(await nextCard(p, "Noodle Samosa"), "touch swipe right = Yes, next card");
  await touchSwipe(p, 0, -320);
  await p.waitForTimeout(900);
  check((await cardName(p)) === "Noodle Samosa" && (await p.locator("#result").isHidden()), "swiping up does nothing (no accidental Desi Crush)");
  await touchSwipe(p, -300);
  await nextCard(p, "Chinese Bhel");
  await until(p, () => document.querySelector("#sync").dataset.state === "saved");

  const phone = await newPage({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const ph = phone.page;
  await startGame(ph, "77", "19", "Male");
  await toCard(ph);
  check((await cardName(ph)) === "Chinese Bhel", "same token on another device continues at dish 3");
  await settle(ph, 500);
  await ph.screenshot({ path: `${SHOTS}/13-card-phone.png` });
  check(await inViewport(ph, ".controls"), "phone: buttons fit on screen");
  check(await noOverflow(ph), "phone: no sideways scrolling");
  check(await textBelowPhoto(ph), "phone: no text over the photo");
  for (const n of ["Chilli Soya Chaap", "Schezwan Pav Bhaji"]) {
    await ph.locator("#yesBtn").click();
    await nextCard(ph, n);
  }
  await ph.locator("#yesBtn").click();
  check(await nextCard(ph, "Korean", 6000), "phone: round 2 starts");
  await waitFlash(ph);
  await settle(ph, 500);
  await ph.screenshot({ path: `${SHOTS}/14-card-phone-round2.png` });
  check(await inViewport(ph, ".controls"), "phone round 2: buttons fit on screen");
  await ph.locator("#crushBtn").click();
  await waitResult(ph);
  await settle(ph, 1400);
  await ph.screenshot({ path: `${SHOTS}/15-crush-phone.png` });
  await phone.ctx.close();

  const t = await newPage({ width: 1366, height: 768 });
  await openTeam(t.page);
  await t.page.locator("#tName").fill("Aman");
  await t.page.locator("#tPin").fill("4321");
  await t.page.locator("#tToken").fill("77");
  await t.page.locator("#tCheck").click();
  check(await visible(t.page.locator("#tRestart")), "restart offered for an unfinished token");
  await t.page.locator("#tReason").fill("Player walked away mid-game");
  await t.page.locator("#tRestart").click();
  check(await until(t.page, () => /start again/.test(document.querySelector("#tResult").textContent)), "restart done");
  await t.ctx.close();

  await p.locator("#noBtn").click();
  check(await until(p, () => document.body.dataset.screen === "start", 10000), "restarted game sends the old device back to start");

  await p.setViewportSize({ width: 820, height: 1180 });
  await settle(p, 300);
  await p.screenshot({ path: `${SHOTS}/16-start-ipad-portrait.png` });
  await startGame(p, "88", "25", "Other");
  check(await toCard(p), "iPad portrait: game starts");
  await settle(p, 600);
  await p.screenshot({ path: `${SHOTS}/17-card-ipad-portrait.png` });
  check(await inViewport(p, ".controls"), "iPad portrait: buttons fit on screen");
  check(await noOverflow(p), "iPad portrait: no sideways scrolling");
  await ipad.ctx.close();
}

// ================================================================ more sizes
for (const [w, h, name] of [[1366, 768, "laptop-small"], [1280, 720, "laptop-720"], [360, 640, "phone-small"]]) {
  const { page, ctx } = await newPage({ width: w, height: h }, w < 500 ? { hasTouch: true, isMobile: true } : {});
  await startGame(page, `9${w}`, "20", "Female");
  check(await toCard(page), `${name}: game starts`);
  await settle(page, 600);
  await page.screenshot({ path: `${SHOTS}/18-card-${name}.png` });
  check(await inViewport(page, ".controls"), `${name}: buttons fit on screen`);
  check(await noOverflow(page), `${name}: no sideways scrolling`);
  check(await textBelowPhoto(page), `${name}: no text over the photo`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
