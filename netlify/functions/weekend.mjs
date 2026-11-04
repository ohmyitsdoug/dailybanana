// dailybanana.io/weekend → this weekend's challenge (the link in the Instagram bio).
//   /weekend           redirects to the challenge link (/c/CODE), or home if there isn't one yet
//   /weekend?json=1    { code, open, closes, tagline, plural } for the app's Join screen and Menu
import { db, json } from '../lib/db.mjs';

export default async (req) => {
  const store = db(), cur = await store.get('weekend/current', { type: 'json' }).catch(() => null);
  const c = cur && (await store.get(`challenges/${cur.code}`, { type: 'json' }).catch(() => null));
  const open = !!c && !c.closed && c.closes > Date.now();
  if (new URL(req.url).searchParams.get('json')) {
    if (!c) return json({}, 200, { 'cache-control': 'public, max-age=60' });
    return json({ code: c.code, open, closes: c.closes, tagline: c.weekend.tagline, plural: c.weekend.unit.plural, name: c.weekend.unit.name }, 200, { 'cache-control': 'public, max-age=60' });
  }
  return Response.redirect(new URL(c ? `/c/${c.code}` : '/', req.url), 302);
};
export const config = { path: '/weekend' };
