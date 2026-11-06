// Games the admin has reviewed (Admin → Games to review). One blob, "review": { [play key]: { s: 'out' | 'ok', at } }
//   out = left out of score statistics (averages, "better than X%", archive, posts). The player's own result is untouched.
//   ok  = looked at and fine, so it stops showing in the review list.
export async function reviews(store) {
  return (await store.get('review', { type: 'json' }).catch(() => null)) || {};
}
// left out automatically, no review needed: 3 or more exact answers, or under 30 seconds of answering for all six rounds
export const exactCount = (p) => (p.points || []).filter((x) => x >= 100).length;
export const SAFE_BELOW = 500;   // games under 500 points are accepted automatically: never flagged, never left out
export function autoOut(p) {
  if ((p.score || 0) < SAFE_BELOW) return null;
  if (exactCount(p) >= 3) return '3+ exact answers';
  if (p.ms > 0 && p.ms < 30e3) return 'Under 30 seconds';
  return null;
}
// out of the score numbers? The admin's own decision wins over the automatic rules ("ok" brings a game back)
export const isOut = (p, rv) => (rv[p.key] ? rv[p.key].s === 'out' : !!autoOut(p));
// the plays that count for one daily: each device's first finish, minus any left out
export function countable(plays, rv) {
  const first = new Map();
  for (const p of [...plays].sort((a, b) => (a.key < b.key ? -1 : 1))) if (!first.has(p.device)) first.set(p.device, p);
  return [...first.values()].filter((p) => !isOut(p, rv));
}
// clear the saved numbers for a daily so the next view works them out again
export async function refreshDaily(store, n) {
  await Promise.all([store.delete(`stats-live/${n}`).catch(() => {}), store.delete(`archive/${n}`).catch(() => {})]);
  const idx = await store.get('archive/index', { type: 'json' }).catch(() => null);
  if (idx && idx[n]) { delete idx[n]; await store.setJSON('archive/index', idx).catch(() => {}); }
  // and drop Netlify's cached archive pages (the token is provided to functions automatically)
  const token = process.env.NETLIFY_PURGE_API_TOKEN, site = process.env.SITE_ID;
  if (token && site) await fetch('https://api.netlify.com/api/v1/purge', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ site_id: site, cache_tags: ['archive', `archive-${n}`] }) }).catch(() => {});
}
