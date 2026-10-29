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

## 2. Turn on the website

Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, folder **/(root)** → **Save**.
After 1–2 minutes the link appears at the top of that page: `https://cyashmit-ship-it.github.io/Swipe-game/`.

## 3. Add photos

See `images/README.md` for the 20 file names. Upload them into the `images` folder on GitHub (**Add file → Upload files**).

## Changing the text

Every word players see is in **`data.js`**. On GitHub: open `data.js` → click the **pencil icon** (top right of the file) → edit → green **Commit changes** button → **Commit changes** again. The site updates in about a minute; reload it to see the change.

- Change only the words between the quotation marks. Keep the quotes, commas and brackets.
- Don't change the `id:` values or the order of the cards (the sheet columns depend on them).
- Each section in `data.js` has a heading comment saying which screen it is for (start, how it works, rounds, results, halftime, end screen, messages, cards).

## What the sheet records

**Players**: one row per game.

| Column | Meaning |
|---|---|
| Token, Age, Gender | From the start screen. Tokens ignore spaces, capitals and leading zeros: `09`, `9` and ` 9 ` are one token; `a1` and `A1` are one token. |
| Attempt | 1 for the first game. 2+ only after a team member allows a replay or a restart. |
| Status | In progress, Completed, Replay allowed (not started yet), Restarted (unfinished). |
| Duplicate | Empty for a first game. `YES (replay…)` or `Restart (…)` for extra attempts. |
| P1 Masala Dosa … P2 Japanese | Yes, No or **Super Like**. "Super Like" is what the game now calls **Desi Crush** (world-cuisine round only, one per player). The columns are in game order and never move. |
| Yes total, Super Likes | Filled when the game is completed. Yes total includes the Desi Crush. |
| Undos | Times the player changed an answer. Moving the Desi Crush to another cuisine also adds 1. |
| Profile type | The fun end-of-game profile they were shown. |
| Device, Notes | Which device started the game; team notes for overrides. |

For analysis, use rows with **Status = Completed**. Decide whether to keep or drop rows where Duplicate is filled.

**Swipe log**: every answer, undo, start and finish, with the time.

**Overrides**: every replay and restart, with the team member's name and reason.

## On fest day

- Use **Chrome or Safari** on the laptop or iPad. Open the game link once at the start and keep the tab open.
- **The small dot in the top bar** (players won't notice it):
  - Green: everything is in the sheet.
  - Yellow, blinking: saving.
  - Red: no internet. Answers stay on the device and send themselves when the internet is back. Don't clear the browser data while it's red.
- **Team tools** (allow a replay, restart a token): tap the **game name/logo at the top left 5 times quickly**. A panel opens. Enter your name, the stall PIN and the token, then **Check token**.
- **Same token twice:** the game says "already played". To allow another go: Team tools → Check token → **Allow a replay** with a reason.
- **Player walked away mid-game:** tap **Exit** (top right). The same token carries on later from where it stopped, on any device. To start that token from dish 1 instead: Team tools → Check token → **Restart unfinished game**.
- **Something looks stuck:** reload the page. The game resumes where it was. Team tools also has **Reload page**.

## Testing changes locally

```
node --test tests/backend.test.mjs   # the Apps Script logic
node tests/e2e.mjs                   # the full game in a browser (needs Playwright)
```
