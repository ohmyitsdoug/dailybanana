// Shared helpers for Matryo's server functions. Everything is stored in Netlify Blobs
// (Netlify's built-in storage), in one store called "matryo". Keys:
//   visits/{day}/{device}            one per device per day
//   plays/{puzzle}/{time-id}         one finished daily round
//   players/{device}                 { first: day } the first day a device finished a daily
//   misses/{day}/{word}/{device}     an unknown word, once per player per day
//   words/{word}                     a word added after launch (by you, or by enough players)
//   ignored/{word}                   unknown words you dismissed
//   live-words                       the accepted words the game loads (rebuilt on every change)
//   stats/{puzzle}                   per-daily totals and "% of players" (rebuilt hourly)
import { getStore } from '@netlify/blobs';

export const db = () => globalThis.__MATRYO_STORE__ || getStore({ name: 'matryo', consistency: 'strong' });

export const json = (o, status = 200, headers = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });

export const clean = (s) => String(s || '').toLowerCase().replace(/_/g, ' ').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40).replace(/ /g, '_');
export const cleanDevice = (s) => String(s || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
export const day = (offset = 0) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

export const BASE = 0.001, STEP = 1.5; // must match data/words.json
export const tierOf = (cm) => Math.max(1, Math.round(Math.log(cm / BASE) / Math.log(STEP)) + 1);
export const cmOf = (x) => +(BASE * STEP ** (x - 1)).toPrecision(2);

export async function keys(store, prefix) {
  const { blobs } = await store.list({ prefix });
  return blobs.map((b) => b.key);
}
export async function getAll(store, prefix) {
  const ks = await keys(store, prefix);
  const vals = await Promise.all(ks.map((k) => store.get(k, { type: 'json' }).catch(() => null)));
  return ks.map((k, i) => ({ key: k, ...(vals[i] || {}) }));
}

// the list the game downloads: words that are live (auto-added or approved by you)
export async function rebuildLive(store) {
  const all = await getAll(store, 'words/');
  const live = all.filter((w) => w.status === 'auto' || w.status === 'approved')
    .map((w) => ({ word: w.word, size_cm: w.size_cm, tier: w.tier, pop: w.pop || 2, parent: w.parent || null }));
  await store.setJSON('live-words', live);
  return all;
}

// admin requests carry the password you set as ADMIN_PASSWORD in Netlify
export function isAdmin(req) {
  const want = process.env.ADMIN_PASSWORD || '';
  const got = req.headers.get('x-admin-key') || '';
  if (want.length < 8 || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

async function dailies() {
  try { return await fetch(`${process.env.URL || ''}/data/dailies.json`).then((r) => r.json()); } catch { return []; }
}

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

// rebuild per-daily stats for the last `back` days of dailies (hourly job, and on demand from the admin page)
export async function aggregate(store, back = 14) {
  const today = day(), from = day(-(back - 1));
  const ds = (await dailies()).filter((d) => d.date >= from && d.date <= today);
  const out = [];
  for (const d of ds) {
    const plays = (await getAll(store, `plays/${d.n}/`)).filter((p) => Array.isArray(p.words));
    const counts = {};
    for (const p of plays) for (const w of new Set(p.words)) counts[w] = (counts[w] || 0) + 1;
    const pct = Object.fromEntries(Object.entries(counts).map(([w, c]) => [w, Math.round((100 * c) / plays.length)]));
    const scores = plays.map((p) => p.score || 0);
    const s = {
      puzzle: d.n, date: d.date, cat: d.cat || (d.rounds ? d.rounds.map((r) => `${r.big} → ${r.small}`.replace(/_/g, ' ')).join(' · ') : `${d.start} → ${d.end}`), plays: plays.length,
      players: new Set(plays.map((p) => p.device || p.key)).size,
      returning: new Set(plays.filter((p) => p.returning).map((p) => p.device)).size,
      avg_score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      high: scores.length ? Math.max(...scores) : null, median: median(scores),
      avg_steps: plays.length ? Math.round((10 * plays.reduce((a, p) => a + (p.steps || p.words.length), 0)) / plays.length) / 10 : null,
      end_pct: plays.length ? Math.round((100 * plays.filter((p) => p.reached).length) / plays.length) : null,
      pct,
    };
    await store.setJSON(`stats/${d.n}`, s);
    out.push(s);
  }
  return out;
}
