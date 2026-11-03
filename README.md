# Daily Banana (dailybanana.io) · "Banana for Scale"

Daily word game: today's place and a big thing to start from (A BASEBALL GAME · STADIUM). Name smaller and smaller things in 60 seconds.

```
index.html          the game (works on its own; logging and shared stats use the Netlify functions)
admin.html          stats, for the admin account only (ADMIN_EMAIL / ADMIN_DISCORD_ID)
config.js           optional: where the server functions live (default /.netlify/functions)
package.json        one dependency for the server functions: @netlify/blobs
data/items.json     720 items with typical sizes (built from tools/scale_items.txt)
data/dailies.json   365 dailies, 6 rounds each (built by tools/make_scale.py)
privacy.html        privacy policy and terms (/privacy, /terms)
netlify/functions/  log (anonymous visits, games, shares), stats (daily ranking), auth + sync (accounts),
                    challenge (challenge links), admin (admin numbers)
netlify/lib/        storage helpers (Netlify Blobs) and sign-in helpers
tools/              scale_items.txt (items), specific.txt (hyper-specific items), make_scale.py (schedule)
```

## Rules (what players see) · v0.6 beta "Banana for Scale"
Six rounds a day, 25 seconds each. Every round asks one question in the same shape:
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
Each day has one answer from each size range (2-12 up to 600-3,000) in a random order, and the thing measured doesn't repeat within 10 days.
Hyper-specific items are listed in `tools/specific.txt` (landmarks, niche gear): only 1-2 rounds a day, in dailies and quick play. Dailies up to `FROZEN` in make_scale.py are never regenerated.
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
6. **Check it:** play a daily, then open `dailybanana.io/admin.html` while signed in as the admin. Today's visitors and the finished game should show.

## Admin
`/admin.html` (signed in on the game's Menu as ADMIN_EMAIL or ADMIN_DISCORD_ID) shows visitors (unique, returning, new),
players, dailies and quick games, total and average points, average 🍌 (rounds of 90+) per game, results and challenge
links copied, challenges made and accounts: today, all time and the last 14 days.
