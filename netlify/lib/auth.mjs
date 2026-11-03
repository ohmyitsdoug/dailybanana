// Player accounts: sign in with Google or Discord. Nothing else is needed (no passwords, no Supabase).
// Netlify Blobs keys (store "matryo"):
//   users/{uid}               { uid, name, google:{sub,email}, discord:{id,username}, created }
//   idx/google/{sub}          uid      (which account a Google login belongs to)
//   idx/discord/{id}          uid
//   userdata/{uid}            the player's saved games, badges and name (see sync.mjs)
//   secret/session            the key that signs session tokens (made on first use if SESSION_SECRET isn't set)
// Environment variables (Netlify → Project configuration → Environment variables):
//   GOOGLE_CLIENT_ID, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET   the sign-in apps
//   ADMIN_EMAIL (your Google address) and/or ADMIN_DISCORD_ID (your Discord user ID)   who can open the admin page
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db.mjs';

const DAY = 86400;
const b64 = (b) => Buffer.from(b).toString('base64url');

let SECRET = null;
async function secret(store) {
  if (SECRET) return SECRET;
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 24) return (SECRET = process.env.SESSION_SECRET);
  let s = await store.get('secret/session').catch(() => null);
  if (!s) { s = randomBytes(32).toString('hex'); await store.set('secret/session', s); }
  return (SECRET = s);
}

export async function makeToken(uid, store = db()) {
  const body = b64(JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + 180 * DAY }));
  return body + '.' + createHmac('sha256', await secret(store)).update(body).digest('base64url');
}
export async function readToken(tok, store = db()) {
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', await secret(store)).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() / 1000 ? p : null; } catch { return null; }
}
const bearer = (req) => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');

// the signed-in user for a request, or null
export async function userFor(req, store = db()) {
  const p = await readToken(bearer(req), store);
  if (!p) return null;
  return await store.get(`users/${p.uid}`, { type: 'json' }).catch(() => null);
}
export function isAdminUser(u) {
  if (!u) return false;
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const did = String(process.env.ADMIN_DISCORD_ID || '').trim();
  return !!((email && u.google && String(u.google.email || '').toLowerCase() === email) || (did && u.discord && u.discord.id === did));
}
export const publicUser = (u) => ({ uid: u.uid, name: u.name, google: !!u.google, discord: !!u.discord, admin: isAdminUser(u) });

// ---- the two sign-in providers ----
export async function googleIdentity(credential, nonce) {
  const client = process.env.GOOGLE_CLIENT_ID || '';
  if (!client) throw new Error('Google sign-in is not set up yet.');
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential || '')}`);
  if (!r.ok) throw new Error('Google sign-in failed. Try again.');
  const t = await r.json();
  const ok = t.aud === client && (t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com') && +t.exp > Date.now() / 1000 && (!nonce || t.nonce === nonce);
  if (!ok || !t.sub) throw new Error('Google sign-in failed. Try again.');
  return { key: String(t.sub), data: { sub: String(t.sub), email: t.email_verified === true || t.email_verified === 'true' ? t.email : '' }, name: t.given_name || t.name || '' };
}
export async function discordIdentity(code, redirect) {
  const id = process.env.DISCORD_CLIENT_ID || '', sec = process.env.DISCORD_CLIENT_SECRET || '';
  if (!id || !sec) throw new Error('Discord sign-in is not set up yet.');
  const tr = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: sec, grant_type: 'authorization_code', code: String(code || ''), redirect_uri: String(redirect || '') }),
  });
  if (!tr.ok) throw new Error('Discord sign-in failed. Try again.');
  const { access_token } = await tr.json();
  const ur = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${access_token}` } });
  if (!ur.ok) throw new Error('Discord sign-in failed. Try again.');
  const u = await ur.json();
  return { key: String(u.id), data: { id: String(u.id), username: u.username || '' }, name: u.global_name || u.username || '' };
}
export const cleanName = (s) => String(s || '').replace(/[<>"&]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
export const newUid = () => randomBytes(9).toString('base64url');
