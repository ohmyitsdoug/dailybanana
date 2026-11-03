// The admin page's backend. Every request needs the x-admin-key header = ADMIN_PASSWORD (set in Netlify).
// GET  -> stats (last 14 days + each daily) and the word queues
// POST { action: "add" | "approve" | "reject" | "ignore", word, size_cm?, parent? }
import { db, json, isAdmin, clean, day, tierOf, keys, getAll, aggregate, rebuildLive } from '../lib/db.mjs';

export default async (req) => {
  if (!isAdmin(req)) return json({ error: 'wrong password' }, 401);
  const store = db();
  if (req.method === 'GET') {
    const [stats, words] = await Promise.all([aggregate(store), getAll(store, 'words/')]);
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = day(-i), s = stats.find((x) => x.date === d);
      days.push({ day: d, uniques: (await keys(store, `visits/${d}/`)).length, completions: s ? s.plays : 0, returning: s ? s.returning : 0 });
    }
    // unknown words from the last 7 days: how many different players, and what they typed them after
    const unknown = {};
    const ignored = new Set((await keys(store, 'ignored/')).map((k) => k.slice(8)));
    const added = new Set(words.map((w) => w.word));
    for (let i = 0; i < 7; i++) for (const k of await keys(store, `misses/${day(-i)}/`)) {
      const [, d, word, device] = k.split('/');
      if (ignored.has(word) || added.has(word)) continue;
      const u = (unknown[word] = unknown[word] || { word, devices: new Set(), last: d, key: k });
      u.devices.add(device);
      if (d > u.last) { u.last = d; u.key = k; }
    }
    const top = Object.values(unknown).sort((a, b) => b.devices.size - a.devices.size).slice(0, 40);
    const samples = await Promise.all(top.map((u) => store.get(u.key, { type: 'json' }).catch(() => null)));
    const sort = (st, by) => words.filter((w) => w.status === st).sort(by);
    return json({
      days, puzzles: stats.map(({ pct, ...s }) => ({ ...s, top: Object.entries(pct).sort((a, b) => b[1] - a[1]).slice(0, 12) })),
      review: sort('review', (a, b) => (b.players || 0) - (a.players || 0)),
      auto: sort('auto', (a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 60),
      mine: sort('approved', (a, b) => String(b.decided).localeCompare(String(a.decided))).slice(0, 30),
      unknown: top.map((u, i) => ({ word: u.word, players: u.devices.size, last: u.last, lo: samples[i]?.lo ?? null, hi: samples[i]?.hi ?? null })),
    });
  }
  if (req.method !== 'POST') return json({ error: 'GET or POST' }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const word = clean(b.word);
  if (!word) return json({ error: 'no word' }, 400);
  const now = new Date().toISOString();
  const cur = await store.get(`words/${word}`, { type: 'json' }).catch(() => null);
  if (b.action === 'ignore') { await store.set(`ignored/${word}`, now); return json({ ok: true }); }
  if (b.action === 'reject') {
    if (!cur) return json({ error: 'not found' }, 404);
    await store.setJSON(`words/${word}`, { ...cur, status: 'rejected', decided: now });
  } else if (b.action === 'add' || b.action === 'approve') {
    const size_cm = +b.size_cm || cur?.size_cm;
    if (!(size_cm > 0)) return json({ error: 'needs a size' }, 400);
    await store.setJSON(`words/${word}`, {
      ...(cur || { word, pop: 2, players: null, created: now, note: 'added by hand' }),
      size_cm, tier: tierOf(size_cm), parent: b.parent ? clean(b.parent) : cur?.parent || null, status: 'approved', decided: now,
    });
    await store.delete(`ignored/${word}`).catch(() => {});
  } else return json({ error: 'unknown action' }, 400);
  await rebuildLive(store);
  return json({ ok: true });
};
