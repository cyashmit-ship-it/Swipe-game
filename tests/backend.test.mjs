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
const ALL_YES = IDS.map((_, i) => (i === 0 ? "Super Like" : i % 3 === 0 ? "No" : "Yes"));

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
  assert.equal(row["P1 Masala Dosa"], "Super Like");
  assert.equal(row["P2 Italian"], "No");
  assert.equal(row["Yes total (incl. Super Like)"], 7);
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

test("an unfinished token continues with its saved answers", () => {
  const be = createBackend(CODE);
  startNew(be, "40");
  be.call({ action: "answer", token: "40", attempt: 1, card: "dosa", answer: "Yes", rid: rid() });
  be.call({ action: "answer", token: "40", attempt: 1, card: "samosa", answer: "No", rid: rid() });
  const r = be.call({ action: "start", token: "40", age: 30, gender: "Male", device: "Laptop-X", rid: rid() });
  assert.equal(r.state, "resume");
  assert.deepEqual(r.answers, { dosa: "Yes", samosa: "No" });
  assert.equal(r.age, 21, "keeps the age entered first");
  assert.equal(be.sheet("Players").rows().length, 1);
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
  assert.equal(rows[0]["P1 Masala Dosa"], "Super Like", "first game untouched");
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
  assert.equal(be.call({ action: "start", token: "1", age: 200, rid: rid() }).ok, false);
  assert.equal(be.call({ action: "nope" }).code, "bad_request");
  assert.equal(be.get().ok, true);
});

test("an alphanumeric token like 1E5 stays text in the sheet", () => {
  const be = createBackend(CODE);
  startNew(be, "1e5");
  assert.equal(be.sheet("Players").rows()[0].Token, "1E5");
  assert.equal(startNew(be, "1E5").state, "resume");
});

test("tokens ignore case, spaces and leading zeros: a1 = A1, 09 = 9", () => {
  const be = createBackend(CODE);
  startNew(be, "a1");
  assert.equal(startNew(be, " A 1 ").state, "resume");
  startNew(be, "09");
  assert.equal(startNew(be, "9").state, "resume");
  assert.deepEqual(be.sheet("Players").rows().map((r) => String(r.Token)), ["A1", "9"]);
});
