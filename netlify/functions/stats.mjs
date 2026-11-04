// GET /.netlify/functions/stats?n=12 -> how everyone did on one daily, so results can say "better than 72% of players"
// { players, totals: [scores], rounds: [[round 1 scores], …], guesses: [typical guess per round], guess_n }   (one entry per device's first finish, sorted)
// Kept for 5 minutes in stats-live/{n} so a busy day doesn't re-read every play on every request.
import { db, json, getAll } from '../lib/db.mjs';
const FRESH = 5 * 60e3;
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.sqrt(s[m - 1] * s[m]); };
export default async (req) => {
  const n = parseInt(new URL(req.url).searchParams.get('n'), 10);
  if (!(n >= 0 && n < 10000)) return json({ players: 0, totals: [], rounds: [] });
  const store = db();
  const c = await store.get(`stats-live/${n}`, { type: 'json' }).catch(() => null);
  if (c && Date.now() - c.at < FRESH) return json(c.s, 200, { 'cache-control': 'public, max-age=120' });
  const plays = (await getAll(store, `plays/${n}/`)).filter((p) => Array.isArray(p.points) && p.points.length === 6).sort((a, b) => (a.key < b.key ? -1 : 1));
  const first = new Map();
  for (const p of plays) if (!first.has(p.device)) first.set(p.device, p);
  const ps = [...first.values()];
  const s = {
    players: ps.length,
    totals: ps.map((p) => p.score || 0).sort((a, b) => a - b),
    rounds: [0, 1, 2, 3, 4, 5].map((i) => ps.map((p) => p.points[i]).sort((a, b) => a - b)),
    // the typical (median) guess per round, from players who sent their guesses
    guess_n: ps.filter((p) => Array.isArray(p.guesses)).length,
    guesses: [0, 1, 2, 3, 4, 5].map((i) => median(ps.map((p) => (p.guesses || [])[i]).filter((g) => g > 0))),
  };
  await store.setJSON(`stats-live/${n}`, { at: Date.now(), s }).catch(() => {});
  return json(s, 200, { 'cache-control': 'public, max-age=120' });
};
