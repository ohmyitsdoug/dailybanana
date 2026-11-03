// Shared helpers for Daily Banana's server functions. Everything is stored in Netlify Blobs
// (Netlify's built-in storage), in one store called "matryo". Keys are listed in each function.
import { getStore } from '@netlify/blobs';

export const db = () => globalThis.__MATRYO_STORE__ || getStore({ name: 'matryo', consistency: 'strong' });

export const json = (o, status = 200, headers = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });

export const cleanDevice = (s) => String(s || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
// days follow the daily: they change at midnight Pacific time
export const day = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offset * 86400e3));

export async function keys(store, prefix) {
  const { blobs } = await store.list({ prefix });
  return blobs.map((b) => b.key);
}
export async function getAll(store, prefix) {
  const ks = await keys(store, prefix);
  const vals = await Promise.all(ks.map((k) => store.get(k, { type: 'json' }).catch(() => null)));
  return ks.map((k, i) => ({ key: k, ...(vals[i] || {}) }));
}
