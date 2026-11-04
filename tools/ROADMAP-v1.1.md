# Daily Banana · v1.1 update list

Planned for v1.1, not live yet. (This file sits in /tools, which is kept off the public site.)

## 1. Rounding, and exact guesses score 100 · DONE (live Nov 4 evening, applies to games from Nov 5)
- **Bug:** points are worked out against the exact answer, but players see a rounded answer.
  Example (Nov 4): green bean 10 cm and paper clip 3.3 cm give 3.03; the screen showed "about 3", so a guess of 3 scored 99 ("1% too low").
- **Rounding rule (Doug):**
  - Answers under 100 round to the nearest tenth, up or down, dropping a trailing .0 (10.03 → 10, 10.06 → 10.1, 3.03 → 3).
  - Answers of 100 and up round to the nearest whole number (4,031 stays 4,031, not 4,000).
  - Answers stop looking like round numbers, so an exact hit takes real skill.
- **Scoring:** points are worked out against that shown answer, so typing it scores 100 and says "Spot on!"
  Use the same rounding everywhere: the reveal, the results, the share text, the typical-player marks, the archive and the post images.
- Scores already played stay as they are; the change starts with the next day's games.

## 2. Exact guess = golden banana (no bonus points)
- No bonus points: the max stays 600, and within 10% (90+) is still a banana.
- A round scored exactly 100 shows a **golden banana**: a gold banana mark in the round squares, the results and the share squares, with a legend entry.
- A new achievement for getting a golden banana. Like the other badges it comes from dailies only. Name to pick, something like "Golden banana".
- Admin and milestones: "perfect guesses" counts these.

## 3. 150 more everyday objects
- Add 150 everyday items to data/items.json, with typical sizes (cm), the right dimension (long / tall / across), plurals and articles.
- Check every size against a source before it goes in.
- Mix of common household, food, outdoor and kid-friendly things. Mark the well-known ones as `core`.
- Keep them out of the 52 weekend units, and keep the weekend hint rule (no rulers or other known-length objects).
- The dailies already scheduled stay as they are; new items show up in quick play and in dailies generated after the update.
