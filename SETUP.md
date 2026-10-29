# Setup guide

The game is a website on GitHub Pages. Every swipe goes to the Google Sheet **Swipe Game Responses** through a small Apps Script.

`original/` holds an unchanged copy of the first version, kept only for reference.

## 1. Connect the Google Sheet (about 10 minutes, once)

1. Open the sheet **Swipe Game Responses** in your Google Drive.
2. Click **Extensions → Apps Script**.
3. Delete the code that's there. Paste the whole of `apps-script/Code.gs` from this repo.
4. Near the top, change `const VOLUNTEER_PIN = "CHANGE-ME";` to your own stall PIN, for example `"7391"`. Only team members should know it.
5. Click **Save**.
6. Choose **setup** in the function list at the top, then click **Run**. Google asks for permission:
   - **Review permissions** → pick your account.
   - Click **Advanced → Go to (project) (unsafe)** → **Allow**. This warning appears because you wrote the script yourself; it only touches this sheet.
   - The sheet now has three tabs: **Players**, **Swipe log** and **Overrides**.
7. Click **Deploy → New deployment**.
   - Click the gear icon and choose **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone**.
   - Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
8. Open `data.js` and paste that URL into `scriptUrl`. Commit the change. (Done: the current link is already in.)
9. Test: open the URL in a browser. It should say `"The results sheet is connected."`

**If you change Code.gs later** (for example a new PIN): **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. The URL stays the same. A plain Save is not enough.

## 1b. Updating the Apps Script to a new version of Code.gs

Do this whenever Code.gs in this repo changes (29 Oct: column reorder; later on 29 Oct: numbers-only tokens and one device per token; 30 Oct: deleted rows free a token, Game admin menu).

1. Open `apps-script/Code.gs` in this repo on GitHub. Click the **copy icon** (two squares, top right of the code). The whole file is copied.
2. Open the sheet **Swipe Game Responses** → **Extensions → Apps Script**.
3. Click inside the code. Press **Ctrl + A** (Mac: Cmd + A), then **Delete**. Press **Ctrl + V** to paste.
4. Near the top, find `const VOLUNTEER_PIN = "CHANGE-ME";`. Change `CHANGE-ME` to your stall PIN (the same one as before). Keep the quotes.
5. Press **Ctrl + S** to save. The orange dot next to the file name disappears.
6. Click **Deploy → Manage deployments**. Click the **pencil icon**. Under **Version**, choose **New version**. Click **Deploy**. Then **Done**. The link stays the same, so `data.js` doesn't change.
7. In the bar at the top, pick **setup** in the function list, then click **Run**. The log at the bottom says "Setup done". If the columns changed, it also says the old Players tab was renamed. Nothing is deleted.
8. Check the sheet: a new **Players** tab with the new column order. The old one is now **Players (old layout)**.

Step 7 is only needed when the columns change. The 30 Oct update didn't change any columns, so steps 1–6 are enough.

After the 30 Oct update, reload the sheet tab. A **Game admin** menu appears at the top, after **Help** (it takes a few seconds). The first time you use it, Google asks for permission: **Continue → choose your account → Advanced → Go to (project name) → Allow**.

Do step 6 before step 7. Between them the game saves nothing to the sheet (answers wait on the device and the start screen says to run setup), so nothing can land in the wrong column. After step 7 the waiting answers send themselves.

## 2. Turn on the website

Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, folder **/(root)** → **Save**.
After 1–2 minutes the link appears at the top of that page: `https://cyashmit-ship-it.github.io/Swipe-game/`.

## 3. Add photos

All 25 photos are in. `images/README.md` lists the file names. To swap one, upload a new file with the same name into the `images` folder on GitHub (**Add file → Upload files**), or send it to Claude.

## Changing the text

Every word players see is in **`data.js`**.

1. Open the repo on GitHub and click **data.js**.
2. Click the **pencil icon** (top right of the code: "Edit this file").
3. Click inside the code and press **Ctrl + F** (Mac: Cmd + F). Type a few words of the text you want to change and press **Enter**. It jumps there.
4. Change only the words **between the quotation marks**.
   - Keep both quotes and the comma at the end of the line.
   - Don't type a double quote `"` inside your text. Use a single quote `'`.
   - Keep `{name}`, `{from}`, `{to}`, `{n}`, `{token}` where they are: the game fills them in.
   - Don't change the `id:` or `part:` lines, or the order of the cards (the sheet columns depend on them).
5. Click the green **Commit changes…** button (top right), then **Commit changes** in the box.
6. Wait about a minute. The **Actions** tab shows a yellow dot while updating, a green tick when live.
7. Reload the game: **Ctrl + Shift + R** on the laptop; on the iPad close the tab and open the link again.

If the game shows a blank page after an edit, a quote or comma is broken. Open data.js again and fix it.

**Where each text lives in data.js**

| In data.js | On screen |
|---|---|
| `presenter`, `presents` | The "URBAN ILLUMINA presents" line above the title (`""` hides it) |
| `title`, `intro`, `startHeading`, `startButton` | Start screen (on phones the intro is hidden to save space) |
| `howTo` | The 3 "how it works" lines on the start screen |
| `fanStickers` | Stickers on the 3 cards of the start screen |
| `rounds` → `1` / `2` | Round title flash, the question, the card banner, the yes/no meanings. `flashSeconds` = how long the round title stays up |
| `buttons` | Yes / No / Desi Crush / Undo labels |
| `results` | The match screen after Yes, and the Desi Crush screen. `minSeconds` / `maxSeconds` = how long the match screen stays before moving on |
| `moveCrush` | The "Move your Desi Crush?" box |
| `profileButton`, `profileLabels` | The "See full profile" sheet |
| `halftime`, `fortunes` | Fortune cookie (off; `show: true` turns it on, between round 1 and 2) |
| `done`, `profiles` | End screen, the random "perfect match" line, and the 5 food personalities |
| `messages` | Error and info messages |
| `CARDS` (bottom half) | Every dish: name, bio, tags, flags, twist, photos |

## What the sheet records

**Players**: one row per game.

| Column | Meaning |
|---|---|
| Token, Age, Gender | From the start screen. Tokens are numbers only. Spaces and leading zeros are ignored: `09`, `9` and ` 9 ` are one token. |
| Attempt | 1 for the first game. 2+ only after a team member allows a replay or a restart. |
| Status | In progress, Completed, Replay allowed (not started yet), Restarted (unfinished). |
| Duplicate | Empty for a first game. `YES (replay…)` or `Restart (…)` for extra attempts. |
| P1 Masala Dosa … P2 Japanese | Yes, No or **Super Like**. "Super Like" is what the game calls **Desi Crush** (round 2 only, one per player). Columns are in play order: the 5 round-1 dishes, then the 5 cuisines. In round 1, "Yes" means yes to the twist shown on the card (for example Schezwan Dosa). |
| Yes total, Super Likes | Filled when the game is completed. Yes total includes the Desi Crush. |
| Undos | Times the player changed an answer. Moving the Desi Crush to another cuisine also adds 1. |
| Profile type | The fun end-of-game profile they were shown. |
| Device, Notes | Which device started the game (only that device can carry on with it); team notes for overrides. |

For analysis, use rows with **Status = Completed**. Decide whether to keep or drop rows where Duplicate is filled.

**Swipe log**: every answer, undo, start and finish, with the time. "Card #" is the dish's position in the game (1–10).

**Overrides**: every replay and restart, with the team member's name and reason. Replays done from the sheet menu say "Allowed a replay (sheet menu)".

### Freeing a token by deleting its rows

To make a token usable again as if it was never played (for example test games, or a slip given out twice by mistake):

1. In the **Players** tab press **Ctrl + F** and type the token number. Find **every row** with that token.
2. Right-click the row number on the left → **Delete row**. Do this for each row of that token. (Selecting the row and pressing Delete to clear it also works.)
3. The token now starts like new, on any device, with attempt 1.

- Delete **all** rows of the token. If a Completed row is left, the token still says "already played".
- The deleted answers are gone from Players. The Swipe log keeps its old lines (it's only a history).
- If that token was still being played on some device, that device goes back to the start screen with "This game was reset by the stall team". Its late answers never land in the new player's row.
- To let the **same player** play once more and keep the first game, use **Allow a replay** instead (below). That keeps both rows, with the replay marked in Duplicate.

## On fest day

- Use **Chrome or Safari** on the laptop or iPad. Open the game link once at the start and keep the tab open.
- **The small dot in the top bar** (players won't notice it):
  - Green: everything is in the sheet.
  - Yellow, blinking: saving.
  - Red: no internet. Answers stay on the device and send themselves when the internet is back. Don't clear the browser data while it's red.
- **Team tools** (allow a replay, restart a token): tap the **game name/logo at the top left 5 times quickly**. A panel opens. Enter your name, the stall PIN and the token, then **Check token**.
- **Same token twice:** the game says "already played". To allow another go, either:
  - **In the sheet:** **Game admin → Allow a replay for a token**. Type the token, your name and a reason. A new row appears in Players, or
  - **On the game device:** Team tools → Check token → **Allow a replay** with a reason.
- **Player walked away mid-game:** tap **Exit** (top right). The same token carries on later from where it stopped, **on the same device**.
- **"Token X is already playing on another device":** that token's game is still open on another laptop, iPad or phone. Finish it there. If that device died or is busy: Team tools → Check token (it shows which device has it) → **Restart unfinished game**. The token then starts from dish 1 on any device.
- **Don't clear browser history or site data on the game devices** during the fest. The device would look new and be locked out of its own unfinished game (fix: Restart unfinished game).
- **Something looks stuck:** reload the page. The game resumes where it was. Team tools also has **Reload page**.

## Testing changes locally

```
node --test tests/backend.test.mjs   # the Apps Script logic
node tests/e2e.mjs                   # the full game in a browser (needs Playwright)
```
