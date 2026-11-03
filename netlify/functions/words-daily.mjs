// Runs once a day, no AI. Looks at yesterday's unknown words (UTC) and counts how many
// DIFFERENT players typed each one.
//   AUTO_PLAYERS (default 5) or more players -> added automatically ("auto"), live in the game right away
//   REVIEW_PLAYERS (default 2) or more       -> waits for you in admin.html ("review")
// Size: each player typed it into the gap between that day's two ends, so it's somewhere in that range.
// It's added automatically only when the ranges narrow it to 3 sizes or less (e.g. from different dailies);
// otherwise it waits for review with a best guess. Anything you add, fix, reject or ignore wins.
// Env: AUTO_PLAYERS, REVIEW_PLAYERS, BLOCKED_WORDS (comma list), all optional
import { db, day, tierOf, cmOf, keys, rebuildLive } from '../lib/db.mjs';
export const config = { schedule: '@daily' };

const AUTO = +(process.env.AUTO_PLAYERS || 5);
const REVIEW = +(process.env.REVIEW_PLAYERS || 2);
const BLOCKED = new Set((process.env.BLOCKED_WORDS || '').split(',').map((w) => w.trim().toLowerCase().replace(/ /g, '_')).filter(Boolean));
const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };

export async function run(store, when = day(-1)) {
  const ks = await keys(store, `misses/${when}/`);
  if (!ks.length) return { day: when, auto: [], review: [] };
  const known = new Set();
  try { (await fetch(`${process.env.URL || ''}/data/words.json`).then((r) => r.json())).words.forEach(([w]) => known.add(w)); } catch {}
  for (const k of await keys(store, 'words/')) known.add(k.slice(6));
  for (const k of await keys(store, 'ignored/')) known.add(k.slice(8));

  const by = {};
  for (const k of ks) { const [, , word, device] = k.split('/'); (by[word] = by[word] || []).push({ key: k, device }); }
  const decided = { day: when, auto: [], review: [] };
  for (const [word, es] of Object.entries(by)) {
    const players = new Set(es.map((e) => e.device)).size;
    if (players < REVIEW || known.has(word) || BLOCKED.has(word) || !/^[a-z][a-z_]{2,29}$/.test(word)) continue;
    const rows = (await Promise.all(es.map((e) => store.get(e.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
    // each player's gap says "somewhere between lo and hi"; where the gaps overlap is the word's likely size.
    // Words typed on only one daily share one 8-size gap, so they wait for review until other dailies narrow it down.
    const gaps = rows.filter((r) => r.lo && r.hi);
    if (!gaps.length) continue;
    const lo = Math.max(...gaps.map((g) => g.lo)), hi = Math.min(...gaps.map((g) => g.hi));
    const width = hi - lo, puzzles = new Set(rows.map((r) => r.puzzle)).size;
    const at = Math.max(1, width > 0 ? (lo + hi) / 2 : quantile(gaps.map((g) => (g.lo + g.hi) / 2), 0.5));
    const status = players >= AUTO && width > 0 && width <= 3 ? 'auto' : 'review';
    const why = width <= 0 ? ' · players placed it in gaps that don\'t overlap' : width > 3 ? ` · could be anywhere in a ${width.toFixed(1)}-size range` : '';
    const size_cm = cmOf(at);
    await store.setJSON(`words/${word}`, { word, size_cm, tier: tierOf(size_cm), pop: 2, players, status, parent: null,
      note: `typed by ${players} players on ${when} (${puzzles} daily${puzzles === 1 ? '' : 's'})${why}`,
      created: new Date().toISOString() });
    decided[status].push(word);
  }
  if (decided.auto.length) await rebuildLive(store);
  return decided;
}
export default async () => new Response(JSON.stringify(await run(db())), { headers: { 'content-type': 'application/json' } });
