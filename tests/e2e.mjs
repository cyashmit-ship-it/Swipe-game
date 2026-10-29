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
const until = (page, fn, ms = 8000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
const visible = (loc, ms = 5000) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
const hidden = (loc, ms = 8000) => loc.waitFor({ state: "hidden", timeout: ms }).then(() => true, () => false);

async function startGame(page, token, age = "22", gender = "Female") {
  await page.locator("#token").fill(token);
  await page.locator("#age").fill(age);
  await page.locator(`.chips-choice span:text-is("${gender}")`).click();
  await page.locator("#startBtn").click();
}
// After Start: get past "How it works" and the round flash.
async function toCard(page) {
  if (await visible(page.locator("#howBtn"), 4000)) await page.locator("#howBtn").click();
  await waitFlash(page);
  return visible(page.locator("#deck .is-top"));
}
async function waitFlash(page) {
  await page.waitForTimeout(150);
  return hidden(page.locator("#flash"), 4000);
}
const cardName = (page) => page.locator("#deck .is-top h3").textContent();
const resultTitle = (page) => page.locator("#resultTitle").textContent();
const waitResult = (page) => visible(page.locator("#result"), 4000);
const autoNext = (page) => hidden(page.locator("#result"), 8000);

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
  await page.locator(".fan-card").nth(0).hover({ force: true });
  await settle(page, 500);
  check(Number(await page.locator(".fan-card").nth(0).locator(".fan-stamp").evaluate((e) => getComputedStyle(e).opacity)) > 0.9, "hovering a start card shows its sticker");
  await page.screenshot({ path: `${SHOTS}/02-start-hover.png` });

  await page.locator("#token").fill(" 0 1 2 ");
  check((await page.locator("#token").inputValue()) === "012", "token box drops spaces as you type");
  await page.locator("#token").fill("ab1");
  check((await page.locator("#token").inputValue()) === "AB1", "token box shows capitals");

  await startGame(page, "012");
  check(await visible(page.locator("#screen-how")), "How it works screen after Start");
  await settle(page, 600);
  await page.screenshot({ path: `${SHOTS}/03-how.png` });
  await page.locator("#howBtn").click();
  check(await visible(page.locator("#flash")), "round flash shows before the first card");
  await settle(page, 500);
  await page.screenshot({ path: `${SHOTS}/04-flash-round1.png` });
  await waitFlash(page);
  check((await cardName(page)) === "Masala Dosa", "card 1 is Masala Dosa");
  check(await textBelowPhoto(page), "card text sits below the photo (no overlap)");
  check(await page.locator("#crushBtn").isHidden(), "Desi Crush button hidden in the Chinese round");
  check((await page.locator("#deck .is-top .card-banner").textContent()).includes("Chinese-style"), "question banner on the card");
  await settle(page, 700);
  await page.screenshot({ path: `${SHOTS}/05-card-laptop.png` });

  // Full profile
  await page.locator("#deck .is-top .info-btn").click();
  check(await visible(page.locator("#profile")), "full profile opens");
  check((await page.locator("#pFacts").innerText()).includes("Green flag"), "profile shows green flag and other details");
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/06-profile-sheet.png` });
  await page.locator("#pBack").click();

  // 1 Dosa: Yes, auto-advance
  await page.locator("#yesBtn").click();
  check(await waitResult(page), "Yes opens the result after the card flies off");
  check((await resultTitle(page)) === "It's a match!", "Yes shows 'It's a match!'");
  check(await page.locator("#nextBtn").isHidden(), "no Next button on a Yes result");
  await settle(page, 700);
  await page.screenshot({ path: `${SHOTS}/07-match.png` });
  check(await autoNext(page), "Yes result moves on by itself");

  // 2 Samosa: drag left, tap to skip
  check((await cardName(page)) === "Samosa", "card 2 is Samosa");
  await dragCard(page, -280);
  await waitResult(page);
  check((await resultTitle(page)) === "Keeping it classic", "drag left = No");
  await settle(page, 600);
  await page.screenshot({ path: `${SHOTS}/08-classic.png` });
  await page.locator("#result").click({ position: { x: 30, y: 30 } });
  check(await hidden(page.locator("#result"), 1500), "tapping the result skips the wait");

  // Plot twist
  check(await visible(page.locator("#screen-twist")), "plot twist before the cuisine round");
  await settle(page, 700);
  await page.screenshot({ path: `${SHOTS}/09-twist.png` });
  await page.locator("#twistBtn").click();

  // 3 Korean: Desi Crush
  check((await cardName(page)) === "Korean", "card 3 is Korean");
  check(await page.locator("#crushBtn").isVisible(), "Desi Crush button shows in the cuisine round");
  check((await page.locator("#crushCount").textContent()) === "1", "1 Desi Crush available");
  const box = await page.locator("#deck .is-top .card-photos").boundingBox();
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.3);
  check((await page.locator("#deck .is-top .caption-pill b").textContent()) === "Ramyeon", "tapping the photo shows the second dish");
  await page.screenshot({ path: `${SHOTS}/10-cuisine-card.png` });
  await page.keyboard.press("ArrowUp");
  await waitResult(page);
  check((await resultTitle(page)) === "Desi crush!", "Desi Crush shows its own screen");
  check((await page.locator("#teasers li").count()) === 2, "teasers appear after the answer");
  await settle(page, 450);
  await page.screenshot({ path: `${SHOTS}/11-crush-crash.png` });
  await settle(page, 1200);
  await page.screenshot({ path: `${SHOTS}/12-crush-done.png` });
  await page.waitForTimeout(4500);
  check(await page.locator("#result").isVisible(), "Desi Crush screen waits for Next");
  await page.locator("#nextBtn").click();

  // 4 Italian: No, change answer, Yes
  check((await cardName(page)) === "Italian", "card 4 is Italian");
  check((await page.locator("#crushCount").textContent()) === "0", "Desi Crush shows as used");
  await page.keyboard.press("ArrowLeft");
  await waitResult(page);
  await page.locator("#changeBtn").click();
  check((await cardName(page)) === "Italian", "Change my answer returns to the card");
  check(await page.locator("#undoBtn").isDisabled(), "undo is off after one undo");
  await page.keyboard.press("ArrowRight");
  await waitResult(page);
  await autoNext(page);

  // 5 Bhel: round switch flash, Yes, then halftime
  check(await visible(page.locator("#flash")), "round flash when switching back to the Chinese round");
  await waitFlash(page);
  check((await cardName(page)) === "Bhel Puri", "card 5 is Bhel Puri");
  await page.locator("#yesBtn").click();
  await waitResult(page);
  await autoNext(page);
  check(await visible(page.locator("#halftime")), "halftime surprise after 5 dishes");
  await settle(page, 600);
  await page.screenshot({ path: `${SHOTS}/13-halftime.png` });
  await page.locator("#cookie").click();
  check(await visible(page.locator("#fortune")), "cracking the cookie shows a fortune");
  await settle(page, 600);
  await page.screenshot({ path: `${SHOTS}/14-fortune.png` });
  await page.locator("#halfBtn").click();
  await waitFlash(page);

  // 6 Thai: move the Desi Crush from Korean, undo it, move again
  check((await cardName(page)) === "Thai", "card 6 is Thai");
  await page.locator("#crushBtn").click();
  check(await visible(page.locator("#moveDialog")), "using it again asks to move the Desi Crush");
  check((await page.locator("#moveText").textContent()).includes("Korean"), "move question names Korean");
  await page.screenshot({ path: `${SHOTS}/15-move-crush.png` });
  await page.locator("#moveYes").click();
  await waitResult(page);
  check((await resultTitle(page)) === "Desi crush!", "moved Desi Crush to Thai");
  await page.locator("#changeBtn").click();
  check((await cardName(page)) === "Thai", "change answer goes back to Thai");
  await page.locator("#crushBtn").click();
  await page.locator("#moveYes").click();
  await waitResult(page);
  await page.locator("#nextBtn").click();
  await waitFlash(page);

  // Reload mid-game
  await until(page, () => document.querySelector("#sync").dataset.state === "saved");
  await page.reload();
  await waitFlash(page);
  check((await cardName(page)) === "Soya Chaap", "reload resumes at dish 7");

  // Offline
  offline = true;
  await page.locator("#noBtn").click();
  await waitResult(page);
  await autoNext(page);
  await waitFlash(page);
  await page.locator("#yesBtn").click();
  await waitResult(page);
  check(await until(page, () => document.querySelector("#sync").dataset.state === "offline"), "offline dot turns red");
  await autoNext(page);
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  check(await until(page, () => document.querySelector("#sync").dataset.state === "saved", 15000), "answers save once the internet is back");

  // 9, 10
  await waitFlash(page);
  check((await cardName(page)) === "Pav Bhaji", "card 9 is Pav Bhaji");
  await page.locator("#yesBtn").click();
  await waitResult(page);
  await autoNext(page);
  await waitFlash(page);
  check((await cardName(page)) === "Japanese", "card 10 is Japanese");
  await page.locator("#noBtn").click();
  await waitResult(page);
  check(await visible(page.locator("#screen-done"), 9000), "profile screen at the end");
  check(await until(page, () => document.querySelector("#sync").dataset.state === "saved"), "everything saved");
  check(!/(saved|sheet)/i.test(await page.locator("#screen-done").innerText()), "end screen has no saving wording");
  await settle(page, 600);
  await page.screenshot({ path: `${SHOTS}/16-done.png` });

  const r = row("12");
  const expect = {
    "P1 Masala Dosa": "Yes", "P1 Samosa": "No", "P2 Korean": "Yes", "P2 Italian": "Yes", "P1 Bhel Puri": "Yes",
    "P2 Thai": "Super Like", "P1 Soya Chaap": "No", "P2 Mexican": "Yes", "P1 Pav Bhaji": "Yes", "P2 Japanese": "No",
  };
  const wrong = Object.entries(expect).filter(([k, v]) => r?.[k] !== v);
  check(r && !wrong.length, `sheet has every answer; Desi Crush saved as Super Like on Thai only ${wrong.length ? JSON.stringify(wrong.map(([k]) => [k, r?.[k]])) : ""}`);
  check(r?.Status === "Completed" && r?.["Super Likes"] === 1 && r?.["Yes total (incl. Super Like)"] === 7, "row completed with 1 Super Like, 7 yes");
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

// ================================================================ iPad + phone
{
  const ipad = await newPage({ width: 1180, height: 820 }, { hasTouch: true });
  const p = ipad.page;
  await startGame(p, "77", "19", "Male");
  await toCard(p);
  await settle(p, 600);
  await p.screenshot({ path: `${SHOTS}/17-card-ipad-landscape.png` });
  check(await inViewport(p, ".controls"), "iPad landscape: buttons fit on screen");
  check(await noOverflow(p), "iPad landscape: no sideways scrolling");
  check(await textBelowPhoto(p), "iPad landscape: no text over the photo");
  await touchSwipe(p, 300);
  await waitResult(p);
  check((await resultTitle(p)) === "It's a match!", "touch swipe right = Yes");
  await autoNext(p);
  await touchSwipe(p, 0, -320);
  await p.waitForTimeout(900);
  check(await p.locator("#result").isHidden(), "swiping up does nothing (no accidental Desi Crush)");
  await touchSwipe(p, -300);
  await waitResult(p);
  await autoNext(p);
  await until(p, () => document.querySelector("#sync").dataset.state === "saved");

  const phone = await newPage({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await startGame(phone.page, "77", "19", "Male");
  check(await visible(phone.page.locator("#screen-twist")), "same token on another device continues");
  await phone.page.locator("#twistBtn").click();
  await settle(phone.page, 600);
  await phone.page.screenshot({ path: `${SHOTS}/18-card-phone.png` });
  check(await inViewport(phone.page, ".controls"), "phone: buttons fit on screen");
  check(await noOverflow(phone.page), "phone: no sideways scrolling");
  check(await textBelowPhoto(phone.page), "phone: no text over the photo");
  await phone.page.locator("#crushBtn").click();
  await waitResult(phone.page);
  await settle(phone.page, 1400);
  await phone.page.screenshot({ path: `${SHOTS}/19-crush-phone.png` });
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

  await p.locator("#twistBtn").click();
  await p.locator("#noBtn").click();
  check(await until(p, () => document.body.dataset.screen === "start", 10000), "restarted game sends the old device back to start");

  await p.setViewportSize({ width: 820, height: 1180 });
  await startGame(p, "88", "25", "Other");
  check(await toCard(p), "iPad portrait: game starts");
  await settle(p, 600);
  await p.screenshot({ path: `${SHOTS}/20-card-ipad-portrait.png` });
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
  await page.screenshot({ path: `${SHOTS}/21-card-${name}.png` });
  check(await inViewport(page, ".controls"), `${name}: buttons fit on screen`);
  check(await noOverflow(page), `${name}: no sideways scrolling`);
  check(await textBelowPhoto(page), `${name}: no text over the photo`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
