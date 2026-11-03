// Sign-in for players and the admin.
//   GET                                            which sign-in buttons to show: { google: clientId, discord: clientId }
//   POST { provider:'google', credential }        sign in (or make an account) with Google
//   POST { provider:'discord', code, redirect }   sign in with Discord (after Discord sends the player back with a code)
//   POST { ..., link:true }  + Authorization      add the other provider to the account you're signed in to
//   POST { action:'rename', name } + Authorization
//   DELETE + Authorization                         delete the account and its saved data
import { db, json } from '../lib/db.mjs';
import { makeToken, userFor, publicUser, googleIdentity, discordIdentity, cleanName, newUid } from '../lib/auth.mjs';

const hasGames = (d) => !!d && (Object.keys(d.results || {}).length > 0 || (d.quick || []).length > 0);

export default async (req) => {
  const store = db();
  if (req.method === 'GET') return json({ google: process.env.GOOGLE_CLIENT_ID || '', discord: process.env.DISCORD_CLIENT_ID || '' });

  if (req.method === 'DELETE') {
    const u = await userFor(req, store);
    if (!u) return json({ error: 'Not signed in.' }, 401);
    if (u.google) await store.delete(`idx/google/${u.google.sub}`).catch(() => {});
    if (u.discord) await store.delete(`idx/discord/${u.discord.id}`).catch(() => {});
    await store.delete(`userdata/${u.uid}`).catch(() => {});
    await store.delete(`users/${u.uid}`).catch(() => {});
    return json({ ok: true });
  }
  if (req.method !== 'POST') return json({ error: 'GET, POST or DELETE' }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  if (b.action === 'rename') {
    const u = await userFor(req, store);
    if (!u) return json({ error: 'Not signed in.' }, 401);
    const name = cleanName(b.name);
    if (!name) return json({ error: 'Pick a name.' }, 400);
    u.name = name; await store.setJSON(`users/${u.uid}`, u);
    return json({ user: publicUser(u) });
  }

  const provider = b.provider === 'discord' ? 'discord' : b.provider === 'google' ? 'google' : null;
  if (!provider) return json({ error: 'Unknown sign-in.' }, 400);
  let ident;
  try { ident = provider === 'google' ? await googleIdentity(b.credential, b.nonce) : await discordIdentity(b.code, b.redirect); }
  catch (e) { return json({ error: e.message }, 400); }

  const idxKey = `idx/${provider}/${ident.key}`;
  const existing = await store.get(idxKey).catch(() => null);
  let user;
  if (b.link) {
    user = await userFor(req, store);
    if (!user) return json({ error: 'Sign in first, then link.' }, 401);
    if (existing && existing !== user.uid) {
      // that login already has an account: only merge it in if it has no games saved
      const other = await store.get(`userdata/${existing}`, { type: 'json' }).catch(() => null);
      if (hasGames(other)) return json({ error: `That ${provider === 'google' ? 'Google' : 'Discord'} account already has its own Daily Banana scores, so it can't be linked.` }, 409);
      const o = await store.get(`users/${existing}`, { type: 'json' }).catch(() => null);
      const otherProv = provider === 'google' ? 'discord' : 'google';
      if (o && o[otherProv]) await store.delete(`idx/${otherProv}/${otherProv === 'google' ? o.google.sub : o.discord.id}`).catch(() => {});
      await store.delete(`users/${existing}`).catch(() => {});
      await store.delete(`userdata/${existing}`).catch(() => {});
    }
    user[provider] = ident.data;
  } else if (existing) {
    user = await store.get(`users/${existing}`, { type: 'json' }).catch(() => null);
    if (!user) user = { uid: existing, name: cleanName(ident.name) || 'Player', created: Date.now() };
    user[provider] = ident.data;   // keep the email or username current
  } else {
    user = { uid: newUid(), name: cleanName(ident.name) || 'Player', created: Date.now(), [provider]: ident.data };
  }
  await store.setJSON(`users/${user.uid}`, user);
  await store.set(idxKey, user.uid);
  return json({ token: await makeToken(user.uid, store), user: publicUser(user) });
};
