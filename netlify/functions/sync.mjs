// A signed-in player's saved games, so they follow them across devices.
//   GET  + Authorization            -> { data }
//   POST { data } + Authorization   -> merges with what's saved and returns { data }
// data = { results: { [daily number]: result }, quick: [quick games], badges: { id: date }, name }
import { db, json } from '../lib/db.mjs';
import { userFor } from '../lib/auth.mjs';

const MAX_BYTES = 400000;
export function merge(a = {}, b = {}) {
  const results = { ...(b.results || {}), ...(a.results || {}) };      // a daily's first finished result wins
  const byId = new Map();
  for (const q of [...(a.quick || []), ...(b.quick || [])]) if (q && q.id) byId.set(q.id, { ...(byId.get(q.id) || {}), ...q });
  const quick = [...byId.values()].sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, 200);
  const badges = { ...(a.badges || {}) };
  for (const [k, v] of Object.entries(b.badges || {})) if (!badges[k] || v < badges[k]) badges[k] = v;
  return { results, quick, badges, name: b.name || a.name || '' };
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
