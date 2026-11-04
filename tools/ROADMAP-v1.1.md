# Daily Banana · v1.1 update list

Planned for v1.1, not live yet. (This file sits in /tools, which is kept off the public site.)

## 1. Exact guesses score 100
- **Bug:** points are worked out against the exact answer, but players see a rounded answer.
  Example (Nov 4): a green bean is 10 cm and a paper clip 3.3 cm, so the real answer is 3.03 and the screen shows "about 3".
  Guessing 3 scored 99 and said "1% too low."
- **Fix:** score against the rounded answer the player sees (`nice(q.ans)`), so typing the shown number gives 100 and says "Spot on!"
  Use the same rounded answer everywhere it's used: the reveal scale, the results, the share text, the typical-player marks and the post images.
- Scores already played stay as they are; only new games use the new scoring.

## 2. Bonus for an exact guess
- Add bonus points when a round scores exactly 100. Amount to decide (+15, +25 or +30).
- To settle: does the bonus raise the max above 600 ("out of 600" in the results, the share text, the admin averages, challenge boards and the "Whole bunch" 500 badge), or is it shown as a separate "perfect" count?
- Decide whether a bonus round gets its own mark in the share squares (for example a gold banana).

## 3. 150 more everyday objects
- Add 150 everyday items to data/items.json, with typical sizes (cm), the right dimension (long / tall / across), plurals and articles.
- Check every size against a source before it goes in.
- Mix of common household, food, outdoor and kid-friendly things. Mark the well-known ones as `core`.
- Keep them out of the 52 weekend units, and keep the weekend hint rule (no rulers or other known-length objects).
- The dailies already scheduled stay as they are; new items show up in quick play and in dailies generated after the update.
