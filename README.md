# Daily Banana (dailybanana.io) · "Banana for Scale"

Daily word game: today's place and a big thing to start from (A BASEBALL GAME · STADIUM). Name smaller and smaller things in 60 seconds.

```
index.html          the game (works on its own; logging and shared stats use the Netlify functions)
admin.html          stats, for the admin account only (ADMIN_EMAIL / ADMIN_DISCORD_ID)
config.js           optional: where the server functions live (default /.netlify/functions)
package.json        one dependency for the server functions: @netlify/blobs
data/words.json     ~2,800 everyday words + ~8,600 specific kinds (COFFEE CUP, DEMITASSE), each with an exact size
data/categories.json  places with their start word and typical things (the on-theme bonus)
data/dailies.json   365 dailies (category, start word; the old floor/bottom fields are no longer used)
netlify/functions/  log (visits, unknown words, finished rounds), words + stats (read by the game),
                    admin (admin page), words-daily (adds player words each day), stats-hourly (rebuilds stats)
netlify/lib/db.mjs  shared storage helpers; everything is kept in Netlify Blobs
tools/              scripts and source files for words, categories and the schedule
review/             spreadsheet of every word for you to check
```

## Rules (what players see) · v0.6 beta "Banana for Scale"
Six rounds a day, 20 seconds each. Every round asks one question in the same shape:
"How many bananas long is a school bus?" Players type a number (1200, 1,200 and 1.2k all work).

## Scoring
Points = accuracy as a percent: the smaller of (guess, answer) divided by the bigger, times 100.
Half or twice the answer = 50, 5x off = 20, 10x off = 10. Max 600 a day.
Share marks: 🍌 90+, 🟨 70+, 🟫 40+, ⬜ under 40.

## Quick play and challenges
Quick play builds 6 random questions. Up to 1 hour after finishing one, the player can make a challenge link
(`/?c=CODE`). Anyone with the link plays the same 6 questions once, for 24 hours. The creator can close it early.
One open challenge per person (per device); joining others is unlimited. Server: `netlify/functions/challenge.mjs`
(Netlify Blobs keys `challenges/`, `entries/`, `hosting/`). Scores are honor system: nothing stops someone looking things up.

## Daily schedule
Items live in `tools/scale_items.txt` (`name | plural | article | long/tall/across/deep | cm | u`, where `u` means it can be the counting unit).
Edit sizes there, then run `python3 tools/make_scale.py` to rebuild `data/items.json` and `data/dailies.json` (365 days; Daily #000 is 2026-11-03, #001 the next day).
Each day spreads its answers from small (3-20) to huge (2,000-50,000), and the thing measured doesn't repeat within 10 days.
Challenges store item names, so keep names stable once live (changing a size is fine).

## Going live (about 15 minutes, Netlify only)

No database account and no sign-in providers. Netlify hosts the game, runs the server functions, and stores everything in Netlify Blobs (built in). Players don't sign in; their scores, streaks and badges live in their browser.

1. **Put the folder on GitHub** (e.g. `ohmyitsdoug/matryo`). Deploy from Git so Netlify installs `@netlify/blobs` for the functions; a drag-and-drop deploy doesn't install dependencies.
2. **Netlify → Add new site → Import from Git** → pick the repo. Build command: leave empty. Publish directory: `.` (netlify.toml already says this).
3. **Sign-in (players and admin).** Players can sign in with Google or Discord to keep their scores on every device; guests still play without an account.
   - Google: Google Cloud Console → APIs & Services → Credentials → **OAuth client ID** (Web application). Authorized JavaScript origins: `https://dailybanana.io`, `https://www.dailybanana.io`, `https://dailybanana.netlify.app`. Authorized redirect URIs: `https://dailybanana.io/` and `https://dailybanana.netlify.app/` (with the slash).
   - Discord: discord.com/developers/applications → New Application → **OAuth2**. Copy the Client ID, reset and copy the Client Secret, and add redirects `https://dailybanana.io/` and `https://dailybanana.netlify.app/`.
   - Netlify → Project configuration → Environment variables: `GOOGLE_CLIENT_ID`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (mark secret), `ADMIN_EMAIL` (your Google address), `ADMIN_DISCORD_ID` (your Discord user ID). Redeploy.
   - The admin page opens for whichever admin account you're signed into on the game's Menu, and the Menu shows the Admin link only then.
4. **Deploys → Trigger deploy** so the functions see the variable.
5. **Domain management → Add a domain** → `matryo.io`, then follow Netlify's DNS steps at your registrar. HTTPS turns on by itself.
6. **Check it:** play a daily, open `matryo.io/admin.html`, enter the password. Today's visitors and the finished round should show (daily stats refresh hourly and every time you open the page). Netlify → Functions shows `words-daily` (daily) and `stats-hourly` (hourly) as scheduled.

## Accepting new words (no AI) · used by v0.4, not by v0.5

There is no AI anywhere in the game or its server jobs. New words come from players and from you.

When a player types a word the game doesn't know, `log` records it once per player per day (an anonymous random device id, never a name), together with what they typed it after. Once a day `words-daily` looks at yesterday (UTC) and counts different players per word:
1. `AUTO_PLAYERS` (5) or more players → added automatically (`auto`) and live on the next visit.
2. `REVIEW_PLAYERS` (2) or more → queued for you (`review`).
3. Size: about one size (1.5×) smaller than the median thing players typed it after. If players disagree a lot about where it goes (more than 3 sizes apart), it waits for review even with 5+ players.
4. Skipped: words already known or rejected, anything in `BLOCKED_WORDS`, and anything that isn't plain letters.

Open `/admin.html` (signed in with the admin Google account) to see stats and:
- **Add a word by hand:** a size in mm/cm/m/km, or "same size as" a known word, plus an optional "kind of" word (Surgeon → Doctor).
- **Needs a decision:** approve (with a size you can change) or reject.
- **Auto-approved:** fix the size or undo.
- **Most-typed unknown words:** "Add…" fills the form with a suggested size, or ignore it.

Words you approve or add load into the game on the next visit, no redeploy needed.

## Editing the starting word list

1. Change a size in `tools/sizes/*.txt` (format `size_cm: word word two_word`; later files win, `sizes_z.txt` is for fixes), add other meanings in `senses.txt` (wing: 5000), or add a specific kind in `specific_extra.tsv` (souvenir_cup → cup). The review sheet is `review/snug-words-review.csv`.
2. `cd tools && FREQ=path/to/en_full.txt python3 build_words.py` (frequency list from github.com/hermitdave/FrequencyWords, optional)
3. `python3 make_dailies.py 2026-11-01 365` to rebuild the schedule (pick your real launch date).
