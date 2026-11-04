// Admin only: checks the Meta token in Netlify (META_TOKEN) and lists the Facebook Pages it can post to,
// with each Page's linked Instagram account, so the auto-poster knows which IDs to use.
//   GET /.netlify/functions/meta      → { ok, pages:[{ id, name, instagram:{ id, username } }], set:{ FB_PAGE_ID, IG_USER_ID } }
import { json } from '../lib/db.mjs';
import { userFor, isAdminUser } from '../lib/auth.mjs';

const G = 'https://graph.facebook.com/v21.0';

export default async (req) => {
  if (!isAdminUser(await userFor(req))) return json({ error: 'not the admin account' }, 401);
  const token = process.env.META_TOKEN;
  if (!token) return json({ ok: false, error: 'META_TOKEN is not set in Netlify.' });
  const r = await fetch(`${G}/me/accounts?fields=id,name,instagram_business_account{id,username}&limit=50&access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return json({ ok: false, error: (j.error && j.error.message) || `Meta answered ${r.status}` });
  const pages = (j.data || []).map((p) => ({ id: p.id, name: p.name, instagram: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username } : null }));
  return json({ ok: true, pages, set: { FB_PAGE_ID: process.env.FB_PAGE_ID || null, IG_USER_ID: process.env.IG_USER_ID || null } });
};
