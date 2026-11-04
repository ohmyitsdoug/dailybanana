// Shared helpers for Daily Banana's server functions. Everything is stored in Netlify Blobs
// (Netlify's built-in storage), in one store called "matryo". Keys are listed in each function.
import { getStore } from '@netlify/blobs';

export const db = () => globalThis.__MATRYO_STORE__ || getStore({ name: 'matryo', consistency: 'strong' });

export const json = (o, status = 200, headers = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });

export const cleanDevice = (s) => String(s || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
// days follow the daily: they change at midnight Eastern time
export const day = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offset * 86400e3));

export async function keys(store, prefix) {
  const { blobs } = await store.list({ prefix });
  return blobs.map((b) => b.key);
}
export async function getAll(store, prefix) {
  const ks = await keys(store, prefix);
  const vals = await Promise.all(ks.map((k) => store.get(k, { type: 'json' }).catch(() => null)));
  return ks.map((k, i) => ({ key: k, ...(vals[i] || {}) }));
}

// getAll, but fast for big prefixes the admin dashboard reads on every view. Records almost never change
// once written, so values are kept in memory (while the function is warm) and in one snapshot blob per prefix
// (cache/{prefix}), and only keys that are new since last time are fetched. `recheck(value)` says which
// cached records may still change (e.g. ones written today) so they are fetched again; `fresh` refetches all.
const MEM = new Map();
export async function getAllCached(store, prefix, { recheck = null, fresh = false } = {}) {
  const ck = `cache/${prefix.replace(/\//g, '_')}`;
  let vals = MEM.get(prefix);
  if (!vals) {
    const snap = fresh ? null : await store.get(ck, { type: 'json' }).catch(() => null);
    vals = new Map(snap ? Object.entries(snap) : []);
    MEM.set(prefix, vals);
  }
  const ks = await keys(store, prefix), live = new Set(ks);
  const need = ks.filter((k) => fresh || !vals.has(k) || (recheck && recheck(vals.get(k), k)));
  let changed = false;
  for (const k of [...vals.keys()]) if (!live.has(k)) { vals.delete(k); changed = true; }
  for (let i = 0; i < need.length; i += 200) {   // in batches, so thousands of reads don't all fire at once
    const part = need.slice(i, i + 200), got = await Promise.all(part.map((k) => store.get(k, { type: 'json' }).catch(() => null)));
    part.forEach((k, j) => { const before = vals.get(k); vals.set(k, got[j] || {}); if (JSON.stringify(before) !== JSON.stringify(got[j] || {})) changed = true; });
  }
  if (changed) await store.setJSON(ck, Object.fromEntries(vals)).catch(() => {});
  return ks.map((k) => ({ key: k, ...(vals.get(k) || {}) }));
}
