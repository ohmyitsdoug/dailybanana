// The Daily Banana Discord app (slash commands). Discord sends each command here (Interactions Endpoint URL:
// https://dailybanana.io/discord) and we answer right away.
//   /daily       today's daily, with a Play button
//   /yesterday   the last daily that's finished everywhere in the world (noon UTC the day after it; 7am Eastern,
//                8am in summer), as an image: average score, players and all six answers
//   /weekend     this weekend's challenge, or when the next one opens
// Setup (admin): GET /discord?setup=1 with the admin sign-in registers the commands. Needs DISCORD_PUBLIC_KEY
// (from the Discord developer portal) plus the existing DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.
// Images: /discord/yesterday/N.jpg (drawn once, then kept in blobs at discord/img/N).
import { createPublicKey, verify } from 'node:crypto';
import { db, json, getAllCached } from '../lib/db.mjs';
import { userFor, isAdminUser } from '../lib/auth.mjs';
import { data, fonts, SITE } from '../lib/social.mjs';
import { resultsCard } from '../lib/posts.mjs';

export const config = { path: ['/discord', '/discord/*'] };
const DAY = 86400e3, GOLD = 0xffd43b;
const publishedAt = (d) => Date.parse(d.date + 'T12:00:00Z') + DAY;   // same rule as the archive
const etDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const pad3 = (n) => String(n).padStart(3, '0');
const button = (label, url) => [{ type: 1, components: [{ type: 2, style: 5, label, url }] }];
const reply = (o) => json({ type: 4, data: { allowed_mentions: { parse: [] }, ...o } });

function verified(req, body) {
  const key = process.env.DISCORD_PUBLIC_KEY, sig = req.headers.get('x-signature-ed25519'), ts = req.headers.get('x-signature-timestamp');
  if (!key || !sig || !ts) return false;
  try {
    const k = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(key, 'hex')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(ts + body), k, Buffer.from(sig, 'hex'));
  } catch { return false; }
}

const COMMANDS = [
  { name: 'daily', description: 'Today’s Daily Banana', type: 1 },
  { name: 'yesterday', description: 'Results and answers from the last finished daily', type: 1 },
  { name: 'weekend', description: 'This weekend’s themed challenge', type: 1 },
];
async function setup() {
  const id = process.env.DISCORD_CLIENT_ID, sec = process.env.DISCORD_CLIENT_SECRET;
  if (!id || !sec || !process.env.DISCORD_PUBLIC_KEY) return { ok: false, error: 'Set DISCORD_PUBLIC_KEY in Netlify (DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are already used for sign-in).' };
  const t = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { authorization: 'Basic ' + Buffer.from(`${id}:${sec}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials&scope=applications.commands.update' }).then((r) => r.json()).catch(() => ({}));
  if (!t.access_token) return { ok: false, error: 'Discord did not give a token: ' + (t.error_description || t.error || 'unknown') };
  const r = await fetch(`https://discord.com/api/v10/applications/${id}/commands`, { method: 'PUT', headers: { authorization: 'Bearer ' + t.access_token, 'content-type': 'application/json' }, body: JSON.stringify(COMMANDS) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, commands: j.map((c) => '/' + c.name), install: `https://discord.com/oauth2/authorize?client_id=${id}&scope=applications.commands`, endpoint: `${SITE}/discord` } : { ok: false, error: (j && j.message) || `Discord answered ${r.status}` };
}

async function results(store, d, items) {
  const plays = (await getAllCached(store, `plays/${d.n}/`)).filter((p) => Array.isArray(p.points) && p.points.length === 6);
  const first = new Map(); for (const p of plays) if (!first.has(p.device)) first.set(p.device, p);
  const ps = [...first.values()], scores = ps.map((p) => p.score || p.points.reduce((a, b) => a + b, 0));
  return { n: d.n, date: d.date, players: ps.length, avg: ps.length ? scores.reduce((a, b) => a + b, 0) / ps.length : null, best: ps.length ? Math.max(...scores) : null,
    rounds: d.rounds.map((r) => { const A = items[r.a], B = items[r.b]; return { q: { A, B, ans: B.cm / A.cm } }; }) };
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
  if (name === 'daily') {
    const today = etDate(), d = dailies.find((x) => x.date === today) || dailies.filter((x) => x.date <= today).pop();
    return reply({ embeds: [{ title: `Daily Banana #${pad3(d.n)}`, url: SITE, color: GOLD, description: 'Today’s 6 questions are up. 25 seconds each, and the closer your guess, the more it scores.\nA new daily every midnight, your time.' }], components: button('Play the daily', SITE) });
  }
  if (name === 'yesterday') {
    const d = dailies.filter((x) => publishedAt(x) <= Date.now()).pop();
    if (!d) return reply({ content: 'The first daily’s results come out once it’s finished everywhere in the world.' });
    const r = await results(store, d, await data('items'));
    return reply({ embeds: [{ title: `Daily Banana #${pad3(d.n)} results`, url: `${SITE}/archive/${pad3(d.n)}`, color: GOLD,
      description: r.players ? `${r.players} player${r.players === 1 ? '' : 's'} · average ${Math.round(r.avg)} / 600 · best ${r.best}` : 'No scores came in for this one.',
      image: { url: `${SITE}/discord/yesterday/${d.n}.jpg` } }], components: button('Play today’s daily', SITE) });
  }
  if (name === 'weekend') {
    const w = await fetch(`${SITE}/weekend?json=1`).then((r) => r.json()).catch(() => ({}));
    if (w && w.open) return reply({ embeds: [{ title: `Weekend challenge: ${w.theme}`, url: `${SITE}/c/${w.code}`, color: GOLD, description: `Same 6 questions for everyone, a different unit each time. One try.\nCode **${w.code}** · closes <t:${Math.floor(w.closes / 1000)}:R>` }], components: button('Play the weekend challenge', `${SITE}/c/${w.code}`) });
    if (w && w.next) return reply({ content: `The next weekend challenge opens <t:${Math.floor(w.next.opens / 1000)}:R> (<t:${Math.floor(w.next.opens / 1000)}:F>).` });
    return reply({ content: 'No weekend challenge right now.' });
  }
  return reply({ content: 'Unknown command.' });
};
