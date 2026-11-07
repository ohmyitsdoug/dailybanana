// A signed-in player's saved games, so they follow them across devices.
//   GET  + Authorization            -> { data }
//   POST { data } + Authorization   -> merges with what's saved and returns { data }
// data = { results: { [daily number]: result }, quick: [quick games], badges: { id: date }, name }
import { db, json } from '../lib/db.mjs';
import { userFor } from '../lib/auth.mjs';

const MAX_BYTES = 400000;
export function merge(a = {}, b = {}) {
  const results = { ...(b.results || {}), ...(a.results || {}) };      // a daily's first finished result wins
  for (const [n, r] of Object.entries(b.results || {})) if (r && r.v3 && results[n] && !results[n].v3) results[n] = r;   // v1.1 rescoring of the same game replaces the old score
  const byId = new Map();
  for (const q of [...(a.quick || []), ...(b.quick || [])]) if (q && q.id) byId.set(q.id, { ...(byId.get(q.id) || {}), ...q });
  const quick = [...byId.values()].sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, 200);
  const badges = { ...(a.badges || {}) };
  for (const [k, v] of Object.entries(b.badges || {})) if (!badges[k] || v < badges[k]) badges[k] = v;
  // the unfinished quick game: whichever is newest (a finished one leaves { cleared, at })
  const qlive = [a.qlive, b.qlive].filter((x) => x && x.at).sort((x, y) => y.at - x.at)[0] || null;
  // the rating prompt's state: a rating on any device wins, else the most "Not now"s
  const rates = [a.rate, b.rate].filter((x) => x && typeof x === 'object');
  const rate = rates.find((x) => x.stars) || rates.sort((x, y) => (y.skips || 0) - (x.skips || 0))[0] || null;
  return { results, quick, badges, name: b.name || a.name || '', ...(qlive ? { qlive } : {}), ...(rate ? { rate } : {}) };
}

export default async (req) => {
  const store = db();
  const u = await userFor(req, store);
  if (!u) return json({ error: 'Not signed in.' }, 401);
  const key = `userdata/${u.uid}`;
  const have = (await store.get(key, { type: 'json' }).catch(() => null)) || {};
  if (req.method === 'GET') return json({ data: have });
  if (req.method !== 'POST') return json({ error: 'GET or POST' }, 405);
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json({ error: 'Too much data.' }, 413);
  let b;
  try { b = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }
  const data = merge(have, b.data || {});
  await store.setJSON(key, data);
  return json({ data });
};
