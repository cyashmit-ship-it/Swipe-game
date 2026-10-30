# Is It a Match? (working title)

A Tinder-style food swipe game for market research at the MDI fest.

- Round 1: five Indian dishes. Would you try it Chinese-style?
- Round 2: five world cuisines. Would you try it desi-style?
- Answers: Yes or No, with no screen in between: the card flies off and the next one comes in. Undo works for the last swipe only.
- After all 10 swipes every player **must** pick one cuisine as their Desi Crush (saved as "Super Like"). That pick is the one reveal screen, and it replaces that cuisine's Yes or No.
- About 40 seconds of play per player.
- Tokens are numbers only (07 = 7). A token being played on one device can't be opened on another.
- The end screen gives a random "perfect match" dish, just for fun (not saved).
- Every swipe is saved straight to a Google Sheet.
- Deleting all of a token's rows in the sheet frees that token. Retyping a row's Token moves that game to the new number and frees the old one. The sheet has a Game admin menu (Allow a replay).
- Look: Urban Illumina night poster (dark maroon with sun rays, bunting, vinyl and disco ball, truck-art corners; cream cards; Rye and Shrikhand fonts).

Edit text, dishes and photo names in `data.js`. Setup steps are in `SETUP.md`.
