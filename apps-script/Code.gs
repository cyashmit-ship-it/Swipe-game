/**
 * Swipe game — results sheet backend (Google Apps Script).
 *
 * Where this goes: open the results Google Sheet > Extensions > Apps Script,
 * delete what is there, paste this whole file, set VOLUNTEER_PIN below, then
 * Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 *
 * What it does
 * - Saves every swipe the moment it happens (Players tab + Swipe log tab).
 * - Blocks a token that has already finished. A team member can allow a replay
 *   with the stall PIN; the replay gets its own row marked in "Duplicate".
 * - Lets an unfinished game continue after a reload on the same device. Another
 *   device can't open a token that is still being played (a team member can
 *   restart it instead).
 * - Tokens are numbers only; 007 and 7 are the same token.
 * - Never deletes rows. Restarts and replays add new rows and are written to
 *   the Overrides tab with the team member's name and reason.
 */

// ---------------------------------------------------------------- settings

// Stall PIN for team overrides. Change this before deploying.
// It stays inside Apps Script; players can't see it.
const VOLUNTEER_PIN = "CHANGE-ME";

const TZ = "Asia/Kolkata";

// Fixed card order: round 1 (Chinese twist), then round 2 (desi twist).
// Must match the ids in data.js. The Players tab columns follow this order.
// If you ever change this list, run setup once (see the bottom of this file).
const CARDS = [
  ["dosa", "P1 Masala Dosa"],
  ["samosa", "P1 Samosa"],
  ["bhel", "P1 Bhel Puri"],
  ["chaap", "P1 Soya Chaap"],
  ["pavbhaji", "P1 Pav Bhaji"],
  ["korean", "P2 Korean"],
  ["italian", "P2 Italian"],
  ["thai", "P2 Thai"],
  ["mexican", "P2 Mexican"],
  ["japanese", "P2 Japanese"],
];
const ANSWERS = ["Yes", "No", "Super Like"];

// ---------------------------------------------------------------- layout

const P = { TOKEN: 0, ATTEMPT: 1, STATUS: 2, DUP: 3, AGE: 4, GENDER: 5, STARTED: 6, FINISHED: 7, FIRST_CARD: 8 };
const AFTER = P.FIRST_CARD + CARDS.length;
const C = { YES: AFTER, SUPER: AFTER + 1, UNDOS: AFTER + 2, PROFILE: AFTER + 3, DEVICE: AFTER + 4, NOTES: AFTER + 5 };

const PLAYER_HEADERS = [
  "Token", "Attempt", "Status", "Duplicate", "Age", "Gender", "Started (IST)", "Finished (IST)",
  ...CARDS.map((c) => c[1]),
  "Yes total (incl. Super Like)", "Super Likes", "Undos", "Profile type", "Device", "Notes",
];
const LOG_HEADERS = ["Time (IST)", "Token", "Attempt", "Card #", "Card", "Answer or action", "Device", "Request id"];
const OVR_HEADERS = ["Time (IST)", "Token", "Action", "Team member", "Reason", "Attempt affected", "New attempt"];

const STATUS = {
  PLAYING: "In progress",
  DONE: "Completed",
  ALLOWED: "Replay allowed",
  CLOSED: "Restarted (unfinished)",
};

// ---------------------------------------------------------------- entry points

function doGet() {
  return out({ ok: true, app: "swipe-game", message: "The results sheet is connected." });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return out({ ok: false, code: "bad_request", message: "Bad request." });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return out({ ok: false, code: "busy", message: "The sheet is busy. Retrying." });
  }

  try {
    const rid = body.rid ? String(body.rid).slice(0, 64) : "";
    const cache = CacheService.getScriptCache();
    if (rid) {
      const seen = cache.get("rid:" + rid);
      if (seen) return out(JSON.parse(seen)); // same request sent twice: same answer, nothing written twice
    }
    const res = handle(body);
    if (rid && res.ok) cache.put("rid:" + rid, JSON.stringify(res), 21600);
    return out(res);
  } catch (err) {
    return out({ ok: false, code: "error", message: "Server error: " + (err && err.message) });
  } finally {
    lock.releaseLock();
  }
}

function handle(b) {
  switch (b.action) {
    case "start": return start(b);
    case "answer": return answer(b);
    case "undo": return undo(b);
    case "finish": return finish(b);
    case "team_check": return teamCheck(b);
    case "team_replay": return teamReplay(b);
    case "team_restart": return teamRestart(b);
    case "ping": return { ok: true };
    default: return { ok: false, code: "bad_request", message: "Unknown action." };
  }
}

// ---------------------------------------------------------------- player actions

function start(b) {
  const token = normToken(b.token);
  if (!token) return bad("Enter a valid token (numbers only).");
  const age = parseInt(b.age, 10);
  if (!(age >= 5 && age <= 99)) return bad("Enter an age between 5 and 99.");
  const gender = clip(b.gender, 30);
  const device = clip(b.device, 40);

  const sh = playersTab();
  const list = attemptsOf(sh, token);
  const latest = list[list.length - 1];

  if (!latest) {
    sh.appendRow(newRow(token, 1, STATUS.PLAYING, "", age, gender, now(), device, ""));
    log(token, 1, "", "", "Started", device, b.rid);
    return { ok: true, state: "new", token: token, attempt: 1, answers: {} };
  }

  const status = latest.values[P.STATUS];
  if (status === STATUS.PLAYING) {
    // Only the device that started the game can carry on with it.
    const owner = String(latest.values[C.DEVICE] || "");
    if (owner && device && owner !== device) {
      log(token, latest.attempt, "", "", "Blocked: already playing on " + owner, device, b.rid);
      return { ok: false, code: "in_use", token: token, message: "Token " + token + " is already playing on another device." };
    }
    log(token, latest.attempt, "", "", "Continued", device, b.rid);
    return {
      ok: true, state: "resume", token: token, attempt: latest.attempt,
      answers: answersOf(latest.values),
      age: latest.values[P.AGE], gender: latest.values[P.GENDER],
    };
  }
  if (status === STATUS.ALLOWED) {
    setCell(sh, latest.row, P.STATUS, STATUS.PLAYING);
    setCell(sh, latest.row, P.AGE, age);
    setCell(sh, latest.row, P.GENDER, gender);
    setCell(sh, latest.row, P.STARTED, now());
    setCell(sh, latest.row, C.DEVICE, device);
    log(token, latest.attempt, "", "", "Started", device, b.rid);
    return { ok: true, state: "new", token: token, attempt: latest.attempt, answers: {} };
  }
  return { ok: false, code: "used", token: token, message: "Token " + token + " has already played." };
}

function answer(b) {
  const g = game(b);
  if (g.error) return g.error;
  const idx = cardIndex(b.card);
  const ans = String(b.answer || "");
  if (idx < 0 || ANSWERS.indexOf(ans) < 0) return bad("Unknown card or answer.");

  const current = String(g.values[P.FIRST_CARD + idx] || "");
  if (current === ans) return { ok: true }; // already saved
  if (current) {
    // First answer wins. A different answer only replaces it after an Undo.
    log(g.token, g.attempt, idx + 1, CARDS[idx][1], "Ignored " + ans + " (kept " + current + ")", clip(b.device, 40), b.rid);
    return { ok: true, kept: current };
  }
  setCell(g.sh, g.row, P.FIRST_CARD + idx, ans);
  log(g.token, g.attempt, idx + 1, CARDS[idx][1], ans, clip(b.device, 40), b.rid);
  return { ok: true };
}

function undo(b) {
  const g = game(b);
  if (g.error) return g.error;
  const idx = cardIndex(b.card);
  if (idx < 0) return bad("Unknown card.");

  const current = String(g.values[P.FIRST_CARD + idx] || "");
  if (!current) return { ok: true }; // nothing to undo
  if (b.was && current !== String(b.was)) return { ok: true }; // already replaced; leave it
  setCell(g.sh, g.row, P.FIRST_CARD + idx, "");
  setCell(g.sh, g.row, C.UNDOS, (Number(g.values[C.UNDOS]) || 0) + 1);
  log(g.token, g.attempt, idx + 1, CARDS[idx][1], "Undo (was " + current + ")", clip(b.device, 40), b.rid);
  return { ok: true };
}

function finish(b) {
  const token = normToken(b.token);
  const attempt = Number(b.attempt);
  const sh = playersTab();
  const a = attemptsOf(sh, token).filter((x) => x.attempt === attempt)[0];
  if (!a) return { ok: false, code: "no_game", message: "No game found for this token." };
  if (a.values[P.STATUS] === STATUS.DONE) return { ok: true };
  if (a.values[P.STATUS] !== STATUS.PLAYING) return closed();

  const vals = CARDS.map((c, i) => String(a.values[P.FIRST_CARD + i] || ""));
  const missing = CARDS.filter((c, i) => !vals[i]).map((c) => c[0]);
  if (missing.length) return { ok: false, code: "incomplete", missing: missing, message: "Some answers are missing." };

  const yes = vals.filter((v) => v === "Yes" || v === "Super Like").length;
  const sup = vals.filter((v) => v === "Super Like").length;
  setCell(sh, a.row, P.STATUS, STATUS.DONE);
  setCell(sh, a.row, P.FINISHED, now());
  setCell(sh, a.row, C.YES, yes);
  setCell(sh, a.row, C.SUPER, sup);
  setCell(sh, a.row, C.PROFILE, clip(b.profile, 60));
  log(token, attempt, "", "", "Finished", clip(b.device, 40), b.rid);
  return { ok: true };
}

// ---------------------------------------------------------------- team actions

function teamCheck(b) {
  const denied = checkPin(b);
  if (denied) return denied;
  const token = normToken(b.token);
  if (!token) return bad("Enter a valid token.");
  const list = attemptsOf(playersTab(), token).map((a) => ({
    attempt: a.attempt,
    status: a.values[P.STATUS],
    duplicate: a.values[P.DUP],
    device: String(a.values[C.DEVICE] || ""),
    answered: CARDS.filter((c, i) => String(a.values[P.FIRST_CARD + i] || "")).length,
    started: String(a.values[P.STARTED] || ""),
    finished: String(a.values[P.FINISHED] || ""),
  }));
  return { ok: true, token: token, total: CARDS.length, attempts: list };
}

function teamReplay(b) {
  const denied = checkPin(b) || checkReason(b);
  if (denied) return denied;
  const token = normToken(b.token);
  const sh = playersTab();
  const list = attemptsOf(sh, token);
  const latest = list[list.length - 1];
  if (!latest) return bad("Token " + token + " hasn't played yet, so no replay is needed.");
  if (latest.values[P.STATUS] !== STATUS.DONE) {
    return bad("A replay can only be allowed after a finished game. This token's latest game is: " + latest.values[P.STATUS] + ".");
  }
  const next = latest.attempt + 1;
  const note = clip(b.name, 40) + ": " + clip(b.reason, 200);
  sh.appendRow(newRow(token, next, STATUS.ALLOWED, "YES (replay of attempt " + latest.attempt + ")", "", "", "", "", note));
  override(token, "Allowed a replay", b, latest.attempt, next);
  return { ok: true, token: token, attempt: next, message: "Token " + token + " can play again (attempt " + next + ")." };
}

function teamRestart(b) {
  const denied = checkPin(b) || checkReason(b);
  if (denied) return denied;
  const token = normToken(b.token);
  const sh = playersTab();
  const list = attemptsOf(sh, token);
  const latest = list[list.length - 1];
  if (!latest || latest.values[P.STATUS] !== STATUS.PLAYING) {
    return bad("Only an unfinished game can be restarted.");
  }
  const next = latest.attempt + 1;
  const note = clip(b.name, 40) + ": " + clip(b.reason, 200);
  setCell(sh, latest.row, P.STATUS, STATUS.CLOSED);
  setCell(sh, latest.row, C.NOTES, appendNote(latest.values[C.NOTES], "Restarted. " + note));
  sh.appendRow(newRow(token, next, STATUS.ALLOWED, "Restart (attempt " + latest.attempt + " unfinished)", "", "", "", "", note));
  override(token, "Restarted an unfinished game", b, latest.attempt, next);
  return { ok: true, token: token, attempt: next, message: "Token " + token + " can start again from dish 1 (attempt " + next + "), on any device." };
}

function checkPin(b) {
  if (VOLUNTEER_PIN === "CHANGE-ME" || !VOLUNTEER_PIN) {
    return { ok: false, code: "no_pin", message: "Set VOLUNTEER_PIN in the Apps Script first, then deploy a new version." };
  }
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get("pinfails") || 0);
  if (fails >= 10) return { ok: false, code: "locked", message: "Too many wrong PINs. Wait 10 minutes." };
  if (String(b.pin || "") !== String(VOLUNTEER_PIN)) {
    cache.put("pinfails", String(fails + 1), 600);
    return { ok: false, code: "wrong_pin", message: "That PIN is not right." };
  }
  return null;
}

function checkReason(b) {
  if (clip(b.name, 40).length < 2) return bad("Enter your name.");
  if (clip(b.reason, 200).length < 5) return bad("Write a short reason (at least 5 characters).");
  return null;
}

// ---------------------------------------------------------------- helpers

function game(b) {
  const token = normToken(b.token);
  const attempt = Number(b.attempt);
  if (!token || !attempt) return { error: bad("Missing token or attempt.") };
  const sh = playersTab();
  const a = attemptsOf(sh, token).filter((x) => x.attempt === attempt)[0];
  if (!a) return { error: { ok: false, code: "no_game", message: "No game found for this token." } };
  if (a.values[P.STATUS] !== STATUS.PLAYING) return { error: closed() };
  return { sh: sh, row: a.row, values: a.values, token: token, attempt: attempt };
}

function closed() {
  return { ok: false, code: "closed", message: "This game was closed by a team member." };
}

function bad(message) {
  return { ok: false, code: "invalid", message: message };
}

// Tokens are numbers only. 007 and 7 are the same token.
function normToken(t) {
  const s = String(t == null ? "" : t).normalize("NFKC").replace(/\s+/g, "");
  if (!/^\d{1,9}$/.test(s)) return "";
  return s.replace(/^0+(?=\d)/, "");
}

function cardIndex(id) {
  for (let i = 0; i < CARDS.length; i++) if (CARDS[i][0] === id) return i;
  return -1;
}

function clip(v, n) {
  return String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
}

function appendNote(old, add) {
  return old ? String(old) + " | " + add : add;
}

function now() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
}

function newRow(token, attempt, status, dup, age, gender, started, device, notes) {
  const row = new Array(PLAYER_HEADERS.length).fill("");
  row[P.TOKEN] = token;
  row[P.ATTEMPT] = attempt;
  row[P.STATUS] = status;
  row[P.DUP] = dup;
  row[P.AGE] = age;
  row[P.GENDER] = gender;
  row[P.STARTED] = started;
  row[C.UNDOS] = 0;
  row[C.DEVICE] = device;
  row[C.NOTES] = notes;
  return row;
}

function answersOf(values) {
  const out = {};
  CARDS.forEach((c, i) => {
    const v = String(values[P.FIRST_CARD + i] || "");
    if (v) out[c[0]] = v;
  });
  return out;
}

function attemptsOf(sh, token) {
  const vals = sh.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][P.TOKEN]) === token) list.push({ row: i + 1, attempt: Number(vals[i][P.ATTEMPT]), values: vals[i] });
  }
  return list.sort((a, b) => a.attempt - b.attempt);
}

function setCell(sh, row, colIndex, value) {
  sh.getRange(row, colIndex + 1).setValue(value);
}

function log(token, attempt, cardNo, cardName, what, device, rid) {
  tab("Swipe log", LOG_HEADERS, 2).appendRow([now(), token, attempt, cardNo, cardName, what, device || "", rid || ""]);
}

function override(token, action, b, from, to) {
  tab("Overrides", OVR_HEADERS, 2).appendRow([now(), token, action, clip(b.name, 40), clip(b.reason, 200), from, to]);
}

// The Players tab, after checking its columns match this script. If they don't
// (an older layout), nothing is written: answers wait on the game device and
// are sent once setup has been run.
function playersTab() {
  const sh = tab("Players", PLAYER_HEADERS, 1);
  if (!headersMatch(sh)) throw new Error(LAYOUT_MSG);
  return sh;
}

const LAYOUT_MSG = "The Players tab has an old column layout. Open Apps Script and run setup once.";

function headersMatch(sh) {
  const head = sh.getRange(1, 1, 1, PLAYER_HEADERS.length).getValues()[0].map(String);
  return head.join("|") === PLAYER_HEADERS.join("|");
}

// Gets a tab, creating it with bold, frozen headers the first time.
// tokenCol: which column holds tokens (kept as text so 1E5 stays 1E5).
function tab(name, headers, tokenCol) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh && name === "Players") {
    const first = ss.getSheets()[0];
    if (first && first.getLastRow() === 0) {
      first.setName("Players");
      sh = first;
    }
  }
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, tokenCol, sh.getMaxRows(), 1).setNumberFormat("@");
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run this from the editor (select "setup", click Run) to create the tabs and
// grant permissions. If the Players tab has an older column layout, it is
// renamed (kept, never deleted) and a fresh Players tab is made.
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName("Players");
  if (old && old.getLastRow() > 0 && !headersMatch(old)) {
    let name = "Players (old layout)";
    for (let n = 2; ss.getSheetByName(name); n++) name = "Players (old layout " + n + ")";
    old.setName(name);
    console.log('Old Players tab renamed to "' + name + '". A new Players tab was created.');
  }
  playersTab();
  tab("Swipe log", LOG_HEADERS, 2);
  tab("Overrides", OVR_HEADERS, 2);
  console.log("Setup done. Players columns: " + CARDS.map((c) => c[1]).join(", "));
}
