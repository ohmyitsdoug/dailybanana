// The Daily Banana Discord app (slash commands). Discord sends each command here (Interactions Endpoint URL:
// https://dailybanana.io/discord) and we answer right away.
//   /banana-daily       today's daily, with a Play button
//   /banana-yesterday   the last daily that's finished everywhere in the world (noon UTC the day after it; 7am Eastern,
//                8am in summer), as an image: average score, players and all six answers
//   /banana-weekend     this weekend's challenge, or when the next one opens
// Setup (admin): GET /discord?setup=1 with the admin sign-in registers the commands. Needs DISCORD_PUBLIC_KEY
// (from the Discord developer portal) plus the existing DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.
// Images: /discord/yesterday/N.jpg (drawn once, then kept in blobs at discord/img/N).
import { createPublicKey, verify } from 'node:crypto';
import { db, json, getAll } from '../lib/db.mjs';
import { userFor, isAdminUser } from '../lib/auth.mjs';
import { data, fonts, SITE } from '../lib/social.mjs';
import { resultsCard } from '../lib/posts.mjs';
import { publishedAt, results, todayDaily, lastFinished, dailyEmbed, yesterdayEmbed, weekendNow, weekendEmbed, weekendResults, button } from '../lib/discord.mjs';

export const config = { path: ['/discord', '/discord/*'] };
const reply = (o) => json({ type: 4, data: { allowed_mentions: { parse: [] }, ...o } });
const CONNECT = `${SITE}/discord/connect`;
const botLink = () => `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&scope=bot+applications.commands&permissions=536870912`;   // Manage Webhooks, so /setup can make the channel's webhook
const postsLink = () => `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&scope=webhook.incoming+applications.commands&response_type=code&redirect_uri=${encodeURIComponent(CONNECT)}`;

function verified(req, body) {
  const key = process.env.DISCORD_PUBLIC_KEY, sig = req.headers.get('x-signature-ed25519'), ts = req.headers.get('x-signature-timestamp');
  if (!key || !sig || !ts) return false;
  try {
    const k = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(key, 'hex')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(ts + body), k, Buffer.from(sig, 'hex'));
  } catch { return false; }
}

const COMMANDS = [
  { name: 'banana-daily', description: 'Today’s Daily Banana', type: 1 },
  { name: 'banana-yesterday', description: 'Results and answers from the last finished daily', type: 1 },
  { name: 'banana-weekend', description: 'This weekend’s themed challenge', type: 1 },
  // server admins only (Manage Webhooks)
  { name: 'banana-setup', description: 'All the automatic posts in this channel: the daily posts and the weekend posts', type: 1, default_member_permissions: '536870912', dm_permission: false },
  { name: 'banana-autodaily', description: 'Every morning in this channel: yesterday’s results and today’s daily', type: 1, default_member_permissions: '536870912', dm_permission: false },
  { name: 'banana-autoweekend', description: 'The weekend challenge in this channel: when it opens, a Sunday reminder and Monday’s results', type: 1, default_member_permissions: '536870912', dm_permission: false },
  { name: 'banana-stop', description: 'Stop the automatic Daily Banana posts in this channel', type: 1, default_member_permissions: '536870912', dm_permission: false },
];
async function setup() {
  const id = process.env.DISCORD_CLIENT_ID, sec = process.env.DISCORD_CLIENT_SECRET;
  if (!id || !sec || !process.env.DISCORD_PUBLIC_KEY) return { ok: false, error: 'Set DISCORD_PUBLIC_KEY in Netlify (DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are already used for sign-in).' };
  const t = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { authorization: 'Basic ' + Buffer.from(`${id}:${sec}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials&scope=applications.commands.update' }).then((r) => r.json()).catch(() => ({}));
  if (!t.access_token) return { ok: false, error: 'Discord did not give a token: ' + (t.error_description || t.error || 'unknown') };
  const r = await fetch(`https://discord.com/api/v10/applications/${id}/commands`, { method: 'PUT', headers: { authorization: 'Bearer ' + t.access_token, 'content-type': 'application/json' }, body: JSON.stringify(COMMANDS) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, commands: j.map((c) => '/' + c.name), install: `https://discord.com/oauth2/authorize?client_id=${id}&scope=applications.commands`, posts: postsLink(), bot: botLink(), botToken: !!process.env.DISCORD_BOT_TOKEN, redirect: CONNECT, endpoint: `${SITE}/discord` } : { ok: false, error: (j && j.message) || `Discord answered ${r.status}` };
}

export default async (req) => {
  const url = new URL(req.url), store = db();
  // the results image Discord shows for /yesterday
  const m = url.pathname.match(/^\/discord\/yesterday\/(\d+)\.jpg$/);
  if (m) {
    const n = +m[1], dailies = await data('dailies'), d = dailies.find((x) => x.n === n);
    if (!d || Date.now() < publishedAt(d)) return new Response('not yet', { status: 404 });
    let img = await store.get(`discord/img/${n}`, { type: 'arrayBuffer' }).catch(() => null);
    if (!img) { await fonts(); img = resultsCard(await results(store, d, await data('items'))).jpeg(90); await store.set(`discord/img/${n}`, img); }
    return new Response(img, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' } });
  }
  // a server connected a channel for the automatic posts (the "daily posts" link comes back here)
  if (url.pathname === '/discord/connect') {
    const page = (t, b) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t} · Daily Banana</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#2A1A0E;color:#FFF3C9;font-family:system-ui,sans-serif;text-align:center;padding:24px"><div><h1 style="font-size:28px">${t}</h1><p style="color:#CDB68C;max-width:420px">${b}</p><p><a style="color:#FFD43B" href="${SITE}">dailybanana.io</a></p></div>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    const code = url.searchParams.get('code');
    if (!code) return page('Not connected', 'Discord didn’t send a code. Try the link again and pick a channel.');
    const t = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CONNECT, client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET }) }).then((r) => r.json()).catch(() => ({}));
    const w = t.webhook;
    if (!w || !w.url) return page('Not connected', 'Discord didn’t give us a channel to post in. Try the link again and pick a channel.');
    await store.setJSON(`discord/hooks/${w.id}`, { url: w.url, guild: w.guild_id, channel: w.channel_id, at: Date.now() });
    return page('You’re all set! 🍌', 'Daily Banana will post in that channel every morning (yesterday’s results and today’s daily), plus the weekend challenge when it opens on Saturday, a Sunday evening reminder and Monday’s results. To stop, type /banana-stop in that channel.');
  }
  // the weekend challenge results image (once it has closed)
  const wm = url.pathname.match(/^\/discord\/weekend\/([A-Z0-9]{4,8})\.jpg$/);
  if (wm) {
    const code = wm[1], c = await store.get(`challenges/${code}`, { type: 'json' }).catch(() => null);
    if (!c || !c.weekend || c.closes > Date.now()) return new Response('not yet', { status: 404 });
    let img = await store.get(`discord/img/wk-${code}`, { type: 'arrayBuffer' }).catch(() => null);
    if (!img) {
      await fonts(); const w = await weekendResults(store, code, await data('items'));
      img = resultsCard({ ...w, chip: 'Weekend results', label: `${c.weekend.theme} · players averaged`, sub: w.players ? `${w.players} player${w.players === 1 ? '' : 's'} · winner ${w.winner} with ${w.best}` : '', foot: ['Play today’s daily', 'dailybanana.io'] }).jpeg(90);
      await store.set(`discord/img/wk-${code}`, img);
    }
    return new Response(img, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' } });
  }
  if (req.method === 'GET') {
    if (url.searchParams.get('setup')) { if (!isAdminUser(await userFor(req, store))) return json({ error: 'not the admin account' }, 401); return json(await setup()); }
    return new Response('Daily Banana Discord app');
  }
  const body = await req.text();
  if (!verified(req, body)) return new Response('bad signature', { status: 401 });
  const i = JSON.parse(body);
  if (i.type === 1) return json({ type: 1 });   // Discord checking the endpoint
  if (i.type !== 2) return json({ type: 1 });
  const name = i.data && i.data.name, dailies = await data('dailies');
  if (name === 'banana-daily') {
    return reply({ embeds: [dailyEmbed(await todayDaily())], components: button('Play the daily', SITE) });
  }
  if (name === 'banana-yesterday') {
    const d = await lastFinished();
    if (!d) return reply({ content: 'The first daily’s results come out once it’s finished everywhere in the world.' });
    return reply({ embeds: [await yesterdayEmbed(store, d)], components: button('Play today’s daily', SITE) });
  }
  if (name === 'banana-weekend') {
    const w = await weekendNow();
    if (w && w.open) return reply({ embeds: [weekendEmbed(w)], components: button('Play the weekend challenge', `${SITE}/c/${w.code}`) });
    if (w && w.next) return reply({ content: `The next weekend challenge opens <t:${Math.floor(w.next.opens / 1000)}:R> (<t:${Math.floor(w.next.opens / 1000)}:F>).` });
    return reply({ content: 'No weekend challenge right now.' });
  }
  const quiet = (content) => reply({ content, flags: 64 });   // only the person who ran it sees it
  const AUTO = { 'banana-setup': ['daily', 'weekend'], 'banana-autodaily': ['daily'], 'banana-autoweekend': ['weekend'] };
  if (AUTO[name]) {
    const ch = i.channel_id || (i.channel && i.channel.id), guild = i.guild_id, want = AUTO[name];
    if (!guild || !ch) return quiet(`Run /${name} in a server channel.`);
    const say = (k) => 'All set! 🍌 This channel will get ' + [k.includes('daily') && 'yesterday’s results and today’s daily every morning (about 7am Eastern)', k.includes('weekend') && 'the weekend challenge when it opens on Saturday, a last call on Sunday evening and the results on Monday morning'].filter(Boolean).join(', plus ') + '. Use /banana-stop to turn it off.';
    const all = await getAll(store, 'discord/hooks/'), mine = all.filter((h) => h.channel === ch);
    console.log(JSON.stringify({ cmd: name, ch, hooks: all.length, here: mine.map((h) => ({ key: h.key, kinds: h.kinds || null })) }));
    const have = mine[0];
    for (const extra of mine.slice(1)) await store.delete(extra.key);   // one webhook per channel
    if (have) {
      // a channel set up before the daily/weekend split has no list: it becomes exactly what was just asked for
      const { key, ...hk } = have, kinds = Array.isArray(hk.kinds) ? [...new Set([...hk.kinds, ...want])] : want;
      await store.setJSON(key, { ...hk, kinds });
      return quiet(say(kinds));
    }
    const tok = process.env.DISCORD_BOT_TOKEN;
    const r = tok ? await fetch(`https://discord.com/api/v10/channels/${ch}/webhooks`, { method: 'POST', headers: { authorization: 'Bot ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Daily Banana' }) }).catch(() => null) : null;
    const w = r && r.ok ? await r.json().catch(() => null) : null;
    if (!w || !w.token) return quiet(`I couldn't set up this channel myself. Use this link and pick this channel instead: ${postsLink()}`);
    await store.setJSON(`discord/hooks/${w.id}`, { url: `https://discord.com/api/webhooks/${w.id}/${w.token}`, guild, channel: ch, at: Date.now(), kinds: want });
    return quiet(say(want));
  }
  if (name === 'banana-stop') {
    const ch = i.channel_id || (i.channel && i.channel.id);
    const hooks = (await getAll(store, 'discord/hooks/')).filter((h) => h.channel === ch);
    console.log(JSON.stringify({ cmd: name, ch, removed: hooks.map((h) => h.key) }));
    for (const h of hooks) { await fetch(h.url, { method: 'DELETE' }).catch(() => {}); await store.delete(h.key); }
    return quiet(hooks.length ? 'Done. This channel won’t get the automatic posts anymore.' : 'This channel wasn’t getting the automatic posts.');
  }
  return reply({ content: 'Unknown command.' });
};
