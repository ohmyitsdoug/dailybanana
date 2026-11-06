// dailybanana.io/weekend → this weekend's challenge (the link in the Instagram bio).
//   /weekend           redirects to the challenge link (/c/CODE), or home if there isn't one yet
//   /weekend?json=1    { code, open, closes, tagline, plural, next:{ opens } } for the app's Join screen and Menu
//                      next = when the coming weekend's challenge opens (12am Eastern Saturday), for the countdown
import { db, json } from '../lib/db.mjs';

const SITE = process.env.URL || 'https://dailybanana.io';
const etDate = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
// 12am Eastern at the start of that Saturday, in standard or daylight time
function opensAt(iso) {
  const t = Date.parse(iso + 'T05:00:00Z');
  const h = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(new Date(t)) % 24;
  return t - h * 3600e3;
}
let WKS = null;
async function weekends() {
  if (!WKS) { const r = await fetch(`${SITE}/data/weekend.json`).catch(() => null); WKS = r && r.ok ? await r.json() : []; }
  return WKS;
}

export default async (req) => {
  const store = db(), now = Date.now(), cur = await store.get('weekend/current', { type: 'json' }).catch(() => null);
  const c = cur && (await store.get(`challenges/${cur.code}`, { type: 'json' }).catch(() => null));
  const open = !!c && !c.closed && c.closes > now;
  if (new URL(req.url).searchParams.get('json')) {
    const out = c ? { code: c.code, open, closes: c.closes, theme: c.weekend.theme || c.weekend.tagline } : {};
    if (!open) {
      const today = etDate(now), nx = (await weekends()).find((w) => w.date >= today && (!cur || w.n !== cur.n));
      if (nx) out.next = { opens: opensAt(nx.date) };
    }
    return json(out, 200, { 'cache-control': 'public, max-age=60', 'netlify-cdn-cache-control': 'public, durable, s-maxage=60, stale-while-revalidate=300', 'netlify-vary': 'query=json' });
  }
  return Response.redirect(new URL(c ? `/c/${c.code}` : '/', req.url), 302);
};
export const config = { path: '/weekend' };
