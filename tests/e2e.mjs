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
  if (p.endsWith("data.js")) body = body.toString().replace("PASTE_YOUR_APPS_SCRIPT_URL_HERE", FAKE_URL);
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
let offline = false;
let calls = 0;

async function newPage(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...opts });
  await ctx.route("https://fonts.googleapis.com/**", (r) => r.abort());
  await ctx.route("https://fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("https://script.google.com/**", async (route) => {
    calls++;
    if (offline) return route.abort("internetdisconnected");
    await new Promise((r) => setTimeout(r, 60)); // a little network delay
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

const settle = (page) => page.waitForTimeout(450);
const until = (page, fn, ms = 8000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
const visible = (loc, ms = 5000) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);

async function startGame(page, token, age = "22", gender = "Female") {
  await page.locator("#token").fill(token);
  await page.locator("#age").fill(age);
  await page.locator(`.chips-choice span:text-is("${gender}")`).click();
  await page.locator("#startBtn").click();
}
const cardName = (page) => page.locator("#deck .is-top h3").textContent();
async function nextDish(page) {
  await page.locator("#nextBtn").click();
  await page.locator("#result").waitFor({ state: "hidden" });
}
async function dragCard(page, dx, dy = 0) {
  const box = await page.locator("#deck .is-top").boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + (dx * i) / 12, y + (dy * i) / 12);
  await page.mouse.up();
}
async function touchSwipe(page, dx, dy = 0) {
  const box = await page.locator("#deck .is-top").boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
async function inViewport(page, sel) {
  return page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1;
  }, sel);
}

// ================================================================ laptop: full game
{
  const { page } = await newPage({ width: 1440, height: 860 });
  await settle(page); await page.screenshot({ path: `${SHOTS}/01-start-laptop.png` });
  check((await page.title()) === "Is It a Match?", "working title shown");

  await page.locator("#startBtn").click();
  check(await visible(page.locator("#formError")), "empty form shows an error");

  await startGame(page, " 012 ");
  check(await visible(page.locator("#deck .is-top")), "game starts for token 012");
  check((await cardName(page)) === "Masala Dosa", "card 1 is Masala Dosa");
  check((await page.locator("#roundTag").textContent()) === "Chinese twist", "part 1 round label");
  await settle(page); await page.screenshot({ path: `${SHOTS}/02-card-laptop.png` });

  // 1. Yes button
  await page.locator("#yesBtn").click();
  check(await visible(page.locator("#result")), "Yes opens the result screen");
  check((await page.locator("#resultTitle").textContent()) === "It's a match!", "Yes shows 'It's a match!'");
  check((await page.locator("#resultName").textContent()) === "Schezwan Dosa", "Yes shows the Chinese twist");
  await page.waitForTimeout(700);
  await settle(page); await page.screenshot({ path: `${SHOTS}/03-match-laptop.png` });
  await nextDish(page);

  // 2. Mouse drag left
  check((await cardName(page)) === "Samosa", "card 2 is Samosa");
  await dragCard(page, -260);
  check(await visible(page.locator("#result")), "drag left answers No");
  check((await page.locator("#resultTitle").textContent()) === "Keeping it classic", "No shows 'Keeping it classic'");
  await page.waitForTimeout(700);
  await settle(page); await page.screenshot({ path: `${SHOTS}/04-classic-laptop.png` });
  await nextDish(page);

  // Plot twist before the first cuisine card
  check(await visible(page.locator("#screen-twist")), "plot-twist screen before part 2");
  await page.waitForTimeout(600);
  await settle(page); await page.screenshot({ path: `${SHOTS}/05-twist-laptop.png` });
  await page.locator("#twistBtn").click();

  // 3. Korean: flip photos, Super Like with the keyboard
  check((await cardName(page)) === "Korean", "card 3 is Korean");
  check((await page.locator("#roundTag").textContent()) === "Indian twist", "part 2 round label");
  const capBefore = await page.locator("#deck .is-top .caption b").textContent();
  const box = await page.locator("#deck .is-top").boundingBox();
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.3);
  const capAfter = await page.locator("#deck .is-top .caption b").textContent();
  check(capBefore === "Korean Fried Chicken" && capAfter === "Ramyeon", "tapping the photo shows the second dish");
  await settle(page); await page.screenshot({ path: `${SHOTS}/06-cuisine-laptop.png` });
  await page.keyboard.press("ArrowUp");
  check(await visible(page.locator("#result")), "arrow up answers Super Like");
  check((await page.locator("#resultTitle").textContent()) === "Super match!", "Super Like shows 'Super match!'");
  check((await page.locator("#teasers li").count()) === 2, "teasers appear after the match, not before");
  await page.waitForTimeout(700);
  await settle(page); await page.screenshot({ path: `${SHOTS}/07-super-cuisine-laptop.png` });
  await nextDish(page);

  // 4. Italian: No, then "Change my answer", then Yes
  check((await cardName(page)) === "Italian", "card 4 is Italian");
  await page.keyboard.press("ArrowLeft");
  await visible(page.locator("#result"));
  await page.locator("#changeBtn").click();
  check((await cardName(page)) === "Italian", "Change my answer goes back to the same card");
  check(await page.locator("#undoBtn").isDisabled(), "undo is off after one undo (last swipe only)");
  await page.keyboard.press("ArrowRight");
  await visible(page.locator("#result"));
  await nextDish(page);

  // 5. Bhel: Yes, then undo from the next card, answer No
  check((await cardName(page)) === "Bhel Puri", "card 5 is Bhel Puri");
  await page.locator("#yesBtn").click();
  await visible(page.locator("#result"));
  await nextDish(page);
  check((await cardName(page)) === "Thai", "card 6 is Thai");
  await page.locator("#undoBtn").click();
  check((await cardName(page)) === "Bhel Puri", "undo button returns to the last card");
  await page.locator("#noBtn").click();
  await visible(page.locator("#result"));
  await nextDish(page);

  // Reload mid-game
  await until(page, () => document.querySelector("#sync").dataset.state === "saved");
  await page.reload();
  check((await cardName(page)) === "Thai", "reload resumes at dish 6");

  // Offline: answers wait, then save once
  offline = true;
  await page.locator("#yesBtn").click();
  await visible(page.locator("#result"));
  await nextDish(page);
  await page.locator("#noBtn").click();
  await visible(page.locator("#result"));
  check(await until(page, () => document.querySelector("#sync").dataset.state === "offline"), "offline is shown in the top bar");
  await settle(page); await page.screenshot({ path: `${SHOTS}/08-offline-laptop.png` });
  await nextDish(page);
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  check(await until(page, () => document.querySelector("#sync").dataset.state === "saved", 15000), "answers save after the internet returns");

  // 8, 9, 10
  for (const expected of ["Mexican", "Pav Bhaji"]) {
    check((await cardName(page)) === expected, `card is ${expected}`);
    await page.locator("#yesBtn").click();
    await visible(page.locator("#result"));
    await nextDish(page);
  }
  check((await cardName(page)) === "Japanese", "card 10 is Japanese");
  await page.locator("#superBtn").click();
  await visible(page.locator("#result"));
  check((await page.locator("#nextBtn").textContent()) === "See my food profile", "last result leads to the profile");
  await page.locator("#nextBtn").click();
  check(await visible(page.locator("#screen-done")), "profile screen shown");
  check(await until(page, () => document.querySelector("#saveNote").dataset.state === "saved"), "profile says all answers saved");
  await page.waitForTimeout(500);
  await settle(page); await page.screenshot({ path: `${SHOTS}/09-profile-laptop.png` });

  const r = row("12");
  const expect = {
    "P1 Masala Dosa": "Yes", "P1 Samosa": "No", "P2 Korean": "Super Like", "P2 Italian": "Yes", "P1 Bhel Puri": "No",
    "P2 Thai": "Yes", "P1 Soya Chaap": "No", "P2 Mexican": "Yes", "P1 Pav Bhaji": "Yes", "P2 Japanese": "Super Like",
  };
  check(r && Object.entries(expect).every(([k, v]) => r[k] === v), "sheet row has every answer in its fixed column");
  check(r?.Status === "Completed" && r?.Undos === 2, `row completed with 2 undos (${r?.Status}, ${r?.Undos})`);
  check(r?.["Yes total (incl. Super Like)"] === 7 && r?.["Super Likes"] === 2, "totals correct");
  check(r?.["Profile type"] === (await page.locator("#profileName").textContent()), "profile type saved to the sheet");
  const log = be.sheet("Swipe log").rows().filter((l) => String(l.Token) === "12");
  const answerLines = log.filter((l) => /^(Yes|No|Super Like)$/.test(l["Answer or action"]));
  check(answerLines.length === 12, `swipe log has 12 answers incl. 2 redone, no duplicates from retries (${answerLines.length})`);

  // Same token again is blocked
  await page.locator("#nextPlayerBtn").click();
  await startGame(page, "12", "30", "Male");
  check(await visible(page.locator("#formError")), "a finished token is blocked");
  check((await page.locator("#formError").textContent()).includes("already played"), "block message says already played");
  await settle(page); await page.screenshot({ path: `${SHOTS}/10-blocked-laptop.png` });

  // Team override
  await page.locator("#teamOpen").click();
  await page.locator("#tName").fill("Riya");
  await page.locator("#tPin").fill("0000");
  await page.locator("#tToken").fill("12");
  await page.locator("#tCheck").click();
  check(await until(page, () => /not right/.test(document.querySelector("#tResult").textContent)), "wrong PIN refused");
  await page.locator("#tPin").fill("4321");
  await page.locator("#tCheck").click();
  check(await visible(page.locator("#tReplay")), "PIN accepted; replay offered for a finished token");
  await page.locator("#tReplay").click();
  check(await until(page, () => /at least 5/.test(document.querySelector("#tResult").textContent)), "replay needs a reason");
  await page.locator("#tReason").fill("Phone battery died, re-run approved");
  await page.locator("#tReplay").click();
  check(await until(page, () => /can play again/.test(document.querySelector("#tResult").textContent)), "replay allowed");
  await settle(page); await page.screenshot({ path: `${SHOTS}/11-team-laptop.png` });
  await page.locator("#tClose").click();
  await page.locator("#startBtn").click();
  check(await visible(page.locator("#deck .is-top")), "token 12 plays again after the override");
  const r2 = row("12", 2);
  check(r2?.Status === "In progress" && /^YES/.test(r2?.Duplicate), "replay row marked as duplicate");
  check(row("12", 1)?.["P1 Masala Dosa"] === "Yes", "first game's answers untouched");
  check(be.sheet("Overrides").rows()[0]?.["Team member"] === "Riya", "override saved with name");
  await page.context().close();
}

// ================================================================ iPad + phone: touch, cross-device resume, restart
{
  const ipad = await newPage({ width: 1180, height: 820 }, { hasTouch: true, isMobile: false });
  const p = ipad.page;
  await settle(p); await p.screenshot({ path: `${SHOTS}/12-start-ipad-landscape.png` });
  await startGame(p, "77", "19", "Male");
  await visible(p.locator("#deck .is-top"));
  await settle(p); await p.screenshot({ path: `${SHOTS}/13-card-ipad-landscape.png` });
  check(await inViewport(p, ".controls"), "iPad landscape: buttons fit on screen without scrolling");
  check(await noOverflow(p), "iPad landscape: no sideways scrolling");
  await touchSwipe(p, 300);
  check(await visible(p.locator("#result")), "touch swipe right works");
  check((await p.locator("#resultTitle").textContent()) === "It's a match!", "touch swipe right = Yes");
  await nextDish(p);
  await touchSwipe(p, 0, -320);
  await visible(p.locator("#result"));
  check((await p.locator("#resultTitle").textContent()) === "Super match!", "touch swipe up = Super Like");
  await nextDish(p);
  await until(p, () => document.querySelector("#sync").dataset.state === "saved");

  // Continue on a phone with the same token
  const phone = await newPage({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await settle(phone.page); await phone.page.screenshot({ path: `${SHOTS}/14-start-phone.png` });
  await startGame(phone.page, "77", "19", "Male");
  check(await visible(phone.page.locator("#screen-twist")), "same token on another device continues (at the plot twist)");
  await phone.page.locator("#twistBtn").click();
  check((await cardName(phone.page)) === "Korean", "continues at dish 3 on the phone");
  await settle(phone.page); await phone.page.screenshot({ path: `${SHOTS}/15-card-phone.png` });
  check(await inViewport(phone.page, ".controls"), "phone: buttons fit on screen");
  check(await noOverflow(phone.page), "phone: no sideways scrolling");
  await touchSwipe(phone.page, -300);
  await visible(phone.page.locator("#result"));
  await phone.page.waitForTimeout(700);
  await settle(phone.page); await phone.page.screenshot({ path: `${SHOTS}/16-result-phone.png` });
  await phone.ctx.close();

  // Team restarts token 77; the iPad's next answer is refused and it goes back to start
  const t = await newPage({ width: 1366, height: 768 });
  await t.page.locator("#teamOpen").click();
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
  check(row("77", 1)?.Status === "Restarted (unfinished)" && row("77", 2)?.Status === "Replay allowed", "restart recorded in the sheet");

  // iPad portrait layout
  await p.setViewportSize({ width: 820, height: 1180 });
  await startGame(p, "88", "25", "Other");
  check(await visible(p.locator("#deck .is-top")), "Start works right after a restarted game");
  await settle(p); await p.screenshot({ path: `${SHOTS}/17-card-ipad-portrait.png` });
  check(await inViewport(p, ".controls"), "iPad portrait: buttons fit on screen");
  check(await noOverflow(p), "iPad portrait: no sideways scrolling");
  await ipad.ctx.close();
}

// ================================================================ small laptop + small phone layout
for (const [w, h, name] of [[1366, 768, "laptop-small"], [1280, 720, "laptop-720"], [360, 640, "phone-small"]]) {
  const { page, ctx } = await newPage({ width: w, height: h }, w < 500 ? { hasTouch: true, isMobile: true } : {});
  await startGame(page, `9${w}`, "20", "Female");
  check(await visible(page.locator("#deck .is-top")), `${name}: game starts`);
  await settle(page); await page.screenshot({ path: `${SHOTS}/18-card-${name}.png` });
  check(await inViewport(page, ".controls"), `${name}: buttons fit on screen`);
  check(await noOverflow(page), `${name}: no sideways scrolling`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
