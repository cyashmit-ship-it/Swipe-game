// Tests the real apps-script/Code.gs against the in-memory Google stand-in.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createBackend } from "./gas-mock.mjs";

const CODE = fileURLToPath(new URL("../apps-script/Code.gs", import.meta.url));
const IDS = ["dosa", "samosa", "bhel", "chaap", "pavbhaji", "korean", "italian", "thai", "mexican", "japanese"];
const NEW_HEAD = [
  "P1 Masala Dosa", "P1 Samosa", "P1 Bhel Puri", "P1 Soya Chaap", "P1 Pav Bhaji",
  "P2 Korean", "P2 Italian", "P2 Thai", "P2 Mexican", "P2 Japanese",
];
const OLD_HEAD = [
  "P1 Masala Dosa", "P1 Samosa", "P2 Korean", "P2 Italian", "P1 Bhel Puri",
  "P2 Thai", "P1 Soya Chaap", "P2 Mexican", "P1 Pav Bhaji", "P2 Japanese",
];
let n = 0;
const rid = () => `r${++n}`;

function startNew(be, token = "12") {
  return be.call({ action: "start", token, age: 21, gender: "Female", device: "iPad-TEST", rid: rid() });
}
function playAll(be, token, attempt, answers) {
  IDS.forEach((id, i) => {
    const r = be.call({ action: "answer", token, attempt, card: id, answer: answers[i], rid: rid() });
    assert.equal(r.ok, true, `answer ${id}`);
  });
  return be.call({ action: "finish", token, attempt, profile: "The Fusion Flirt", rid: rid() });
}
const ALL_YES = IDS.map((_, i) => (i === 7 ? "Super Like" : i % 3 === 0 ? "No" : "Yes"));

test("creates the three tabs with headers in play order: round 1, then round 2", () => {
  const be = createBackend(CODE);
  startNew(be);
  const head = be.sheet("Players").data[0];
  assert.deepEqual(head.slice(8, 18), NEW_HEAD);
  assert.ok(be.sheet("Swipe log"));
  assert.equal(be.sheets[0].getName(), "Players", "the empty first tab is reused");
});

test("old column layout: nothing is written until setup; setup keeps the old tab and makes a new one", () => {
  const be = createBackend(CODE);
  // A Players tab made by the previous script, with one test row.
  const old = be.sheets[0];
  old.setName("Players");
  const oldHead = ["Token", "Attempt", "Status", "Duplicate", "Age", "Gender", "Started (IST)", "Finished (IST)", ...OLD_HEAD,
    "Yes total (incl. Super Like)", "Super Likes", "Undos", "Profile type", "Device", "Notes"];
  old.appendRow(oldHead);
  old.appendRow(["TEST1", 1, "Completed", "", 22, "Male", "x", "y", "Yes", "No", "Yes", "Yes", "No", "Yes", "Yes", "No", "Yes", "No"]);

  const refused = startNew(be, "60");
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "error", "the game retries later instead of losing the answer");
  assert.match(refused.message, /run setup/);
  assert.equal(old.data.length, 2, "nothing written into the old layout");

  be.setup();
  assert.equal(be.sheet("Players (old layout)"), old, "old tab kept under a new name");
  assert.equal(old.data[1][0], "TEST1", "old rows untouched");
  assert.deepEqual(be.sheet("Players").data[0].slice(8, 18), NEW_HEAD);
  assert.match(be.logs.join("\n"), /renamed/);

  assert.equal(startNew(be, "60").state, "new");
  assert.equal(be.call({ action: "answer", token: "60", attempt: 1, card: "korean", answer: "Super Like", rid: rid() }).ok, true);
  assert.equal(be.sheet("Players").rows()[0]["P2 Korean"], "Super Like");
  const log = be.sheet("Swipe log").rows().find((l) => l.Card === "P2 Korean");
  assert.equal(log["Card #"], 6, "Card # in the log is the play position");

  be.setup(); // running it again changes nothing
  assert.equal(be.sheets.filter((s) => /old layout/.test(s.getName())).length, 1);
  assert.equal(be.sheet("Players").rows().length, 1);
});

test("a full game fills one row and completes it", () => {
  const be = createBackend(CODE);
  const s = startNew(be);
  assert.equal(s.state, "new");
  assert.equal(s.attempt, 1);
  assert.equal(playAll(be, "12", 1, ALL_YES).ok, true);
  const [row] = be.sheet("Players").rows();
  assert.equal(row.Status, "Completed");
  assert.equal(row["P1 Masala Dosa"], "No");
  assert.equal(row["P2 Thai"], "Super Like");
  assert.equal(row["Yes total (incl. Super Like)"], 6);
  assert.equal(row["Super Likes"], 1);
  assert.equal(row["Profile type"], "The Fusion Flirt");
  assert.ok(row["Finished (IST)"]);
});

test("a finished token is blocked; 007 and 7 are the same token", () => {
  const be = createBackend(CODE);
  startNew(be, "007");
  playAll(be, "7", 1, ALL_YES);
  const again = startNew(be, " 7 ");
  assert.equal(again.ok, false);
  assert.equal(again.code, "used");
  assert.equal(be.sheet("Players").rows().length, 1);
});

test("an unfinished token continues with its saved answers on the same device", () => {
  const be = createBackend(CODE);
  startNew(be, "40");
  be.call({ action: "answer", token: "40", attempt: 1, card: "dosa", answer: "Yes", rid: rid() });
  be.call({ action: "answer", token: "40", attempt: 1, card: "samosa", answer: "No", rid: rid() });
  const r = be.call({ action: "start", token: "40", age: 30, gender: "Male", device: "iPad-TEST", rid: rid() });
  assert.equal(r.state, "resume");
  assert.deepEqual(r.answers, { dosa: "Yes", samosa: "No" });
  assert.equal(r.age, 21, "keeps the age entered first");
  assert.equal(be.sheet("Players").rows().length, 1);
});

test("a token being played on one device can't be opened on another", () => {
  const be = createBackend(CODE);
  startNew(be, "41"); // iPad-TEST
  const r = be.call({ action: "start", token: "041", age: 30, gender: "Male", device: "Phone-ZZ", rid: rid() });
  assert.equal(r.ok, false);
  assert.equal(r.code, "in_use");
  assert.equal(r.token, "41");
  assert.equal(be.sheet("Players").rows().length, 1, "no new row");
  assert.match(be.sheet("Swipe log").rows().at(-1)["Answer or action"], /Blocked: already playing on iPad-TEST/);
  // Team restart frees the token for any device, from dish 1.
  be.call({ action: "team_restart", pin: "4321", token: "41", name: "Aman", reason: "Laptop battery died", rid: rid() });
  const s = be.call({ action: "start", token: "41", age: 30, gender: "Male", device: "Phone-ZZ", rid: rid() });
  assert.equal(s.ok, true);
  assert.equal(s.attempt, 2);
  const chk = be.call({ action: "team_check", pin: "4321", token: "41", rid: rid() });
  assert.equal(chk.attempts[1].device, "Phone-ZZ", "team check shows the device");
});

test("first answer wins; a repeat request writes nothing new", () => {
  const be = createBackend(CODE);
  startNew(be, "5");
  const id = rid();
  be.call({ action: "answer", token: "5", attempt: 1, card: "dosa", answer: "Yes", rid: id });
  be.call({ action: "answer", token: "5", attempt: 1, card: "dosa", answer: "Yes", rid: id });
  be.clearCache();
  be.call({ action: "answer", token: "5", attempt: 1, card: "dosa", answer: "Yes", rid: id });
  const changed = be.call({ action: "answer", token: "5", attempt: 1, card: "dosa", answer: "No", rid: rid() });
  assert.equal(changed.kept, "Yes");
  assert.equal(be.sheet("Players").rows()[0]["P1 Masala Dosa"], "Yes");
  const logs = be.sheet("Swipe log").rows().filter((l) => l.Card === "P1 Masala Dosa");
  assert.equal(logs.length, 2, "one Yes plus one 'Ignored' line");
});

test("undo clears the answer, counts it, and allows a new answer", () => {
  const be = createBackend(CODE);
  startNew(be, "8");
  be.call({ action: "answer", token: "8", attempt: 1, card: "korean", answer: "No", rid: rid() });
  be.call({ action: "undo", token: "8", attempt: 1, card: "korean", was: "No", rid: rid() });
  be.call({ action: "answer", token: "8", attempt: 1, card: "korean", answer: "Yes", rid: rid() });
  const row = be.sheet("Players").rows()[0];
  assert.equal(row["P2 Korean"], "Yes");
  assert.equal(row.Undos, 1);
  // A stale undo (answer already replaced) changes nothing.
  be.call({ action: "undo", token: "8", attempt: 1, card: "korean", was: "No", rid: rid() });
  assert.equal(be.sheet("Players").rows()[0]["P2 Korean"], "Yes");
  const acts = be.sheet("Swipe log").rows().map((l) => l["Answer or action"]);
  assert.deepEqual(acts, ["Started", "No", "Undo (was No)", "Yes"]);
});

test("finish refuses when answers are missing", () => {
  const be = createBackend(CODE);
  startNew(be, "9");
  be.call({ action: "answer", token: "9", attempt: 1, card: "dosa", answer: "Yes", rid: rid() });
  const r = be.call({ action: "finish", token: "9", attempt: 1, profile: "x", rid: rid() });
  assert.equal(r.code, "incomplete");
  assert.equal(r.missing.length, 9);
  assert.equal(be.sheet("Players").rows()[0].Status, "In progress");
});

test("team: wrong PIN refused, lockout after 10 tries", () => {
  const be = createBackend(CODE);
  const r = be.call({ action: "team_check", pin: "0000", token: "1", rid: rid() });
  assert.equal(r.code, "wrong_pin");
  for (let i = 0; i < 10; i++) be.call({ action: "team_check", pin: "0000", token: "1", rid: rid() });
  assert.equal(be.call({ action: "team_check", pin: "4321", token: "1", rid: rid() }).code, "locked");
});

test("team: unchanged default PIN disables overrides", () => {
  const be = createBackend(CODE, { pin: "CHANGE-ME" });
  assert.equal(be.call({ action: "team_check", pin: "CHANGE-ME", token: "1", rid: rid() }).code, "no_pin");
});

test("team: replay after a finished game adds a marked row and keeps the first", () => {
  const be = createBackend(CODE);
  startNew(be, "21");
  playAll(be, "21", 1, ALL_YES);
  const noReason = be.call({ action: "team_replay", pin: "4321", token: "21", name: "Riya", reason: "", rid: rid() });
  assert.equal(noReason.ok, false);
  const ok = be.call({ action: "team_replay", pin: "4321", token: "21", name: "Riya", reason: "Phone died before the end", rid: rid() });
  assert.equal(ok.attempt, 2);
  const s = startNew(be, "21");
  assert.equal(s.state, "new");
  assert.equal(s.attempt, 2);
  const rows = be.sheet("Players").rows();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Status, "Completed");
  assert.equal(rows[0]["P2 Thai"], "Super Like", "first game untouched");
  assert.equal(rows[1].Status, "In progress");
  assert.match(rows[1].Duplicate, /^YES/);
  assert.match(rows[1].Notes, /Riya: Phone died/);
  const ov = be.sheet("Overrides").rows()[0];
  assert.equal(ov.Action, "Allowed a replay");
  assert.equal(ov["Team member"], "Riya");
});

test("team: restart closes an unfinished game; the old device's answers are refused", () => {
  const be = createBackend(CODE);
  startNew(be, "33");
  be.call({ action: "answer", token: "33", attempt: 1, card: "dosa", answer: "Yes", rid: rid() });
  const res = be.call({ action: "team_restart", pin: "4321", token: "33", name: "Aman", reason: "Player walked away", rid: rid() });
  assert.equal(res.ok, true);
  const late = be.call({ action: "answer", token: "33", attempt: 1, card: "samosa", answer: "No", rid: rid() });
  assert.equal(late.code, "closed");
  const s = startNew(be, "33");
  assert.equal(s.attempt, 2);
  assert.deepEqual(s.answers, {});
  const rows = be.sheet("Players").rows();
  assert.equal(rows[0].Status, "Restarted (unfinished)");
  assert.equal(rows[0]["P1 Masala Dosa"], "Yes", "old answers kept");
  assert.match(rows[1].Duplicate, /^Restart/);
});

test("team: check lists every attempt", () => {
  const be = createBackend(CODE);
  startNew(be, "50");
  const r = be.call({ action: "team_check", pin: "4321", token: "050", rid: rid() });
  assert.equal(r.token, "50");
  assert.equal(r.attempts.length, 1);
  assert.equal(r.attempts[0].status, "In progress");
});

test("bad input is rejected cleanly", () => {
  const be = createBackend(CODE);
  assert.equal(JSON.parse(be.raw("not json")).code, "bad_request");
  assert.equal(be.call({ action: "start", token: "bad token!", age: 20, rid: rid() }).ok, false);
  assert.equal(be.call({ action: "start", token: "AB", age: 20, rid: rid() }).ok, false);
  assert.equal(be.call({ action: "start", token: "1", age: 200, rid: rid() }).ok, false);
  assert.equal(be.call({ action: "nope" }).code, "bad_request");
  assert.equal(be.get().ok, true);
});

test("tokens are numbers only; letters and symbols are refused", () => {
  const be = createBackend(CODE);
  for (const t of ["A1", "1e5", "12-3", "7!", "", "１２"]) {
    const r = startNew(be, t);
    if (t === "１２") assert.equal(r.token, "12", "full-width digits count as digits");
    else assert.equal(r.ok, false, `refused: ${JSON.stringify(t)}`);
  }
});

test("tokens ignore spaces and leading zeros: 09 = 9 = ' 9 ', 01 = 1", () => {
  const be = createBackend(CODE);
  startNew(be, "09");
  assert.equal(startNew(be, "9").state, "resume");
  assert.equal(startNew(be, " 9 ").state, "resume");
  startNew(be, "1");
  assert.equal(startNew(be, "01").state, "resume");
  assert.deepEqual(be.sheet("Players").rows().map((r) => String(r.Token)), ["9", "1"]);
});

// ---------------------------------------------------------------- Desi Crush (picked at the end)

// The five round-2 answers as the client sends them with the "crush" action.
function crushSend(be, token, attempt, crushId, rest = "Yes") {
  const answers = {};
  IDS.slice(5).forEach((id) => (answers[id] = id === crushId ? "Super Like" : rest));
  return be.call({ action: "crush", token, attempt, answers, device: "iPad-TEST", rid: rid() });
}

test("the Desi Crush overwrites the cuisine's Yes or No", () => {
  const be = createBackend(CODE);
  startNew(be, "70");
  IDS.forEach((id) => be.call({ action: "answer", token: "70", attempt: 1, card: id, answer: "Yes", rid: rid() }));
  assert.equal(crushSend(be, "70", 1, "korean").ok, true);
  const r = be.sheet("Players").rows()[0];
  assert.equal(r["P2 Korean"], "Super Like");
  assert.equal(r["P2 Italian"], "Yes", "the other cuisines are untouched");
  assert.ok(be.sheet("Swipe log").rows().some((x) => x["Answer or action"] === "Desi Crush"), "logged as a Desi Crush");
});

test("changing the pick puts the old cuisine back to its own answer", () => {
  const be = createBackend(CODE);
  startNew(be, "71");
  // The player said No to Korean while swiping, then picks it as their crush, then changes to Thai.
  IDS.forEach((id) => be.call({ action: "answer", token: "71", attempt: 1, card: id, answer: id === "korean" ? "No" : "Yes", rid: rid() }));
  crushSend(be, "71", 1, "korean");
  const answers = { korean: "No", italian: "Yes", thai: "Super Like", mexican: "Yes", japanese: "Yes" };
  assert.equal(be.call({ action: "crush", token: "71", attempt: 1, answers, rid: rid() }).ok, true);
  const r = be.sheet("Players").rows()[0];
  assert.equal(r["P2 Thai"], "Super Like");
  assert.equal(r["P2 Korean"], "No", "Korean goes back to the No it was swiped with");
  assert.equal(be.call({ action: "finish", token: "71", attempt: 1, profile: "The Fusion Flirt", rid: rid() }).ok, true);
  assert.equal(be.sheet("Players").rows()[0]["Super Likes"], 1, "still exactly one Super Like");
});

test("a Desi Crush request must name exactly one crush and no unknown answers", () => {
  const be = createBackend(CODE);
  startNew(be, "72");
  IDS.forEach((id) => be.call({ action: "answer", token: "72", attempt: 1, card: id, answer: "Yes", rid: rid() }));
  const bad = [
    { korean: "Yes", italian: "Yes", thai: "Yes", mexican: "Yes", japanese: "Yes" },
    { korean: "Super Like", italian: "Super Like", thai: "Yes", mexican: "Yes", japanese: "Yes" },
    { korean: "Super Like", italian: "Maybe", thai: "Yes", mexican: "Yes", japanese: "Yes" },
    { korean: "Super Like", italian: "Yes", thai: "Yes", mexican: "Yes" },
  ];
  bad.forEach((answers, i) => {
    assert.equal(be.call({ action: "crush", token: "72", attempt: 1, answers, rid: rid() }).ok, false, `refused ${i}`);
  });
  assert.equal(be.sheet("Players").rows()[0]["P2 Korean"], "Yes", "nothing was written");
});

// ---------------------------------------------------------------- retyping a token in the sheet

test("retyping a row's token moves that game to the new number and frees the old one", () => {
  const be = createBackend(CODE);
  startNew(be, "36");
  be.call({ action: "answer", token: "36", attempt: 1, card: "dosa", answer: "Yes", device: "iPad-TEST", rid: rid() });
  const sh = be.sheet("Players");
  sh.put(2, 1, "1"); // the team types 1 over the 36

  assert.equal(startOn(be, "1", "iPad-TEST").state, "resume", "token 1 now holds that game");
  assert.deepEqual(startOn(be, "1", "iPad-TEST").answers, { dosa: "Yes" }, "with its answers");
  assert.equal(be.call({ action: "answer", token: "1", attempt: 1, card: "samosa", answer: "No", device: "iPad-TEST", rid: rid() }).ok, true);
  assert.equal(sh.rows()[0]["P1 Samosa"], "No", "new answers go to the same row");

  const freed = startOn(be, "36", "phone-X");
  assert.equal(freed.state, "new", "36 is free again");
  assert.equal(sh.rows().length, 2);
});

test("a retyped token is read the same way as a typed one: 01, 1 and ' 1 ' all match", () => {
  const be = createBackend(CODE);
  startNew(be, "36");
  const sh = be.sheet("Players");
  for (const typed of ["01", " 1 ", "001"]) {
    sh.put(2, 1, typed);
    assert.equal(startOn(be, "1", "iPad-TEST").state, "resume", `sheet cell ${JSON.stringify(typed)} is token 1`);
    assert.equal(sh.rows().length, 1, "no extra row");
  }
});

test("retyping a finished game's token blocks the new number and frees the old one", () => {
  const be = createBackend(CODE);
  startNew(be, "36");
  playAll(be, "36", 1, ALL_YES);
  be.sheet("Players").put(2, 1, "5");
  assert.equal(startNew(be, "5").code, "used", "token 5 is now the one that has played");
  assert.equal(startNew(be, "36").state, "new", "36 can be handed out again");
});

// ---------------------------------------------------------------- deleting rows by hand

const startOn = (be, token, device) => be.call({ action: "start", token, age: 20, gender: "Male", device, rid: rid() });
const answerOn = (be, token, attempt, card, device, answer = "Yes") =>
  be.call({ action: "answer", token, attempt, card, answer, device, rid: rid() });

test("deleting a token's row frees it; the old device's late answers never land in the new row", () => {
  const be = createBackend(CODE);
  startOn(be, "40", "phone-A");
  assert.equal(answerOn(be, "40", 1, "dosa", "phone-A").ok, true);

  be.sheet("Players").data.splice(1, 1); // the team deletes token 40's row
  assert.equal(answerOn(be, "40", 1, "samosa", "phone-A").code, "no_game", "phone A is told the game is gone");

  const s = startOn(be, "40", "phone-B");
  assert.equal(s.ok, true);
  assert.equal(s.state, "new", "token 40 starts like new");
  assert.equal(s.attempt, 1);

  const late = answerOn(be, "40", 1, "bhel", "phone-A", "No");
  assert.equal(late.code, "closed", "phone A's queued answer is refused");
  assert.equal(be.call({ action: "finish", token: "40", attempt: 1, device: "phone-A", rid: rid() }).code, "closed");
  assert.equal(answerOn(be, "40", 1, "bhel", "phone-B").ok, true, "phone B carries on normally");
  const rows = be.sheet("Players").rows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["P1 Bhel Puri"], "Yes");
  assert.equal(rows[0]["P1 Masala Dosa"], "", "nothing from phone A");
});

test("deleting a finished token's row lets the token play again", () => {
  const be = createBackend(CODE);
  startNew(be, "41");
  playAll(be, "41", 1, ALL_YES);
  assert.equal(startNew(be, "41").code, "used");
  be.sheet("Players").data.splice(1, 1);
  const s = startNew(be, "41");
  assert.equal(s.state, "new");
  assert.equal(s.attempt, 1);
});

test("clearing a row's cells (instead of deleting it) also frees the token", () => {
  const be = createBackend(CODE);
  startNew(be, "42");
  playAll(be, "42", 1, ALL_YES);
  be.sheet("Players").data[1] = [];
  assert.equal(startNew(be, "42").state, "new");
});

test("after a restart, deleting the newer row frees the token too", () => {
  const be = createBackend(CODE);
  startNew(be, "43");
  be.call({ action: "team_restart", pin: "4321", token: "43", name: "Aman", reason: "Phone died mid-game", rid: rid() });
  be.sheet("Players").data.splice(2, 1); // delete the attempt-2 row, keep the restarted one
  const s = startNew(be, "43");
  assert.equal(s.state, "new");
  assert.equal(s.attempt, 2);
  assert.match(be.sheet("Players").rows()[1].Duplicate, /^Restart/);
});

// ---------------------------------------------------------------- sheet menu

test("sheet menu: Game admin appears with Allow a replay", () => {
  const be = createBackend(CODE);
  be.onOpen();
  assert.equal(be.ui.menus[0].name, "Game admin");
  assert.deepEqual(be.ui.menus[0].items, [["Allow a replay for a token", "menuAllowReplay"]]);
});

test("sheet menu: allow a replay adds a marked row and logs who did it", () => {
  const be = createBackend(CODE);
  startNew(be, "44");
  playAll(be, "44", 1, ALL_YES);

  be.menuReplay([null]); // Cancel at the first box
  assert.equal(be.sheet("Players").rows().length, 1, "cancel changes nothing");
  assert.match(be.menuReplay(["4a"]), /numbers only/);
  assert.match(be.menuReplay(["44", "Y", "x"]), /Enter your name/);

  const msg = be.menuReplay(["044", "Yashmit", "Wrong age entered"]);
  assert.match(msg, /Token 44 can play again \(attempt 2\)/);
  const rows = be.sheet("Players").rows();
  assert.equal(rows.length, 2);
  assert.equal(rows[1].Status, "Replay allowed");
  assert.match(rows[1].Duplicate, /^YES/);
  const ov = be.sheet("Overrides").rows()[0];
  assert.equal(ov.Action, "Allowed a replay (sheet menu)");
  assert.equal(ov["Team member"], "Yashmit");
  assert.equal(startNew(be, "44").attempt, 2, "the player can now start again");
});

test("sheet menu: replay is refused for a token that hasn't finished", () => {
  const be = createBackend(CODE);
  assert.match(be.menuReplay(["45", "Yashmit", "Testing the menu"]), /hasn't played yet/);
  startNew(be, "45");
  assert.match(be.menuReplay(["45", "Yashmit", "Testing the menu"]), /only be allowed after a finished game/);
  assert.equal(be.sheet("Players").rows().length, 1);
});
