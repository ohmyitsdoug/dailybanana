// Shared Discord pieces: the messages (used by the slash commands and the automatic posts) and posting to the
// channels servers connected with the "daily posts" link (Discord webhooks owned by our app).
//   discord/hooks/{id}    { url, guild, channel, at, kinds:['daily','weekend'] }   one per connected channel (no kinds = both)
//   discord/done/{date}/{kind}                           an automatic post already sent
import { reviews, countable } from './review.mjs';
import { getAll, getAllCached } from './db.mjs';
import { data, SITE } from './social.mjs';
import { nice, roundAns, SCORE_V3 } from './page.mjs';

const DAY = 86400e3, GOLD = 0xffd43b;
export const publishedAt = (d) => Date.parse(d.date + 'T12:00:00Z') + DAY;   // finished everywhere (same rule as the archive)
export const etDate = (t = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const pad3 = (n) => String(n).padStart(3, '0');
export const button = (label, url) => [{ type: 1, components: [{ type: 2, style: 5, label, url }] }];

export async function results(store, d, items) {
  const plays = (await getAllCached(store, `plays/${d.n}/`)).filter((p) => Array.isArray(p.points) && p.points.length === 6);
  const ps = countable(plays, await reviews(store)), scores = ps.map((p) => p.score || p.points.reduce((a, b) => a + b, 0));
  return { n: d.n, date: d.date, players: ps.length, avg: ps.length ? scores.reduce((a, b) => a + b, 0) / ps.length : null, best: ps.length ? Math.max(...scores) : null,
    // the answer as it was shown that day (the rounding changed with v1.1 on Nov 5)
    rounds: d.rounds.map((r) => { const A = items[r.a], B = items[r.b], ans = B.cm / A.cm; return { q: { A, B, ans }, show: d.date >= SCORE_V3 ? roundAns(ans) : nice(ans) }; }) };
}
export async function todayDaily(t = Date.now()) {
  const dailies = await data('dailies'), today = etDate(t);
  return dailies.find((x) => x.date === today) || dailies.filter((x) => x.date <= today).pop();
}
export async function lastFinished(t = Date.now()) { return (await data('dailies')).filter((x) => publishedAt(x) <= t).pop() || null; }

export const dailyEmbed = (d) => ({ title: `Daily Banana #${pad3(d.n)}`, url: SITE, color: GOLD, description: 'Today’s 6 questions are up. 25 seconds each, and the closer your guess, the more it scores.\nA new daily every midnight, your time.' });
export async function yesterdayEmbed(store, d) {
  const r = await results(store, d, await data('items'));
  return { title: `Daily Banana #${pad3(d.n)} results`, url: `${SITE}/archive/${pad3(d.n)}`, color: GOLD,
    description: r.players ? `${r.players} player${r.players === 1 ? '' : 's'} · average ${Math.round(r.avg)} / 600 · best ${r.best}` : 'No scores came in for this one.',
    image: { url: `${SITE}/discord/yesterday/${d.n}.jpg` } };
}
export async function weekendNow() { return fetch(`${SITE}/weekend?json=1`).then((r) => r.json()).catch(() => ({})); }
export const weekendEmbed = (w) => ({ title: `Weekend challenge: ${w.theme}`, url: `${SITE}/c/${w.code}`, color: GOLD, description: `Same 6 questions for everyone, a different unit each time. One try.\nCode **${w.code}** · closes <t:${Math.floor(w.closes / 1000)}:R>` });

// post one message to every connected channel; a channel whose webhook was removed is dropped
const wants = (h, kind) => !Array.isArray(h.kinds) || h.kinds.includes(kind);
export async function broadcast(store, msg, kind) {
  const hooks = (await getAll(store, 'discord/hooks/')).filter((h) => !kind || wants(h, kind));
  let ok = 0, gone = 0, failed = 0;
  for (const h of hooks) {
    const send = (m) => fetch(`${h.url}?wait=true`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ allowed_mentions: { parse: [] }, ...m }) });
    let r = await send(msg).catch(() => null);
    if (r && r.status === 400 && msg.components) r = await send({ ...msg, components: undefined }).catch(() => null);   // in case buttons aren't allowed there
    if (r && (r.status === 404 || r.status === 401)) { await store.delete(h.key); gone++; }
    else if (r && r.ok) ok++; else failed++;
    await new Promise((s) => setTimeout(s, 250));   // gentle on Discord's rate limits
  }
  return { channels: hooks.length, ok, gone, failed };
}

// the weekend challenge's results: players, average, the best score and all six answers (no names: totals only)
export async function weekendResults(store, code, items) {
  const c = await store.get(`challenges/${code}`, { type: 'json' }).catch(() => null);
  if (!c) return null;
  const es = (await getAll(store, `entries/${code}/`)).sort((a, b) => b.score - a.score || a.at - b.at);
  const by = Object.fromEntries(items.flatMap((i) => [...(i.was || []).map((w) => [w, i]), [i.name, i]]));   // old names too (renamed items)
  return { c, players: es.length, avg: es.length ? es.reduce((t, e) => t + e.score, 0) / es.length : null, best: es.length ? es[0].score : null,
    rounds: c.rounds.map((r) => { const A = by[r.a], B = by[r.b]; return A && B ? { q: { A, B, ans: B.cm / A.cm } } : null; }).filter(Boolean) };
}
const weekendResultsEmbed = (w) => ({ title: `Weekend challenge results: ${w.c.weekend.theme}`, url: `${SITE}/c/${w.c.code}`, color: GOLD,
  description: w.players ? `${w.players} player${w.players === 1 ? '' : 's'} · average ${Math.round(w.avg)} / 600 · top score ${w.best}` : 'Nobody played this one.',
  image: { url: `${SITE}/discord/weekend/${w.c.code}.jpg` } });

// the automatic posts, checked every hour (Eastern time):
//   daily channels:   every morning once yesterday's daily has finished everywhere (7:15am, 8:15 in summer): yesterday's results + today's daily
//   weekend channels: Saturday 12:15am when the challenge opens · Sunday 7:15pm last call · Monday 7:15am results and answers
export async function discordRun(store, t, { date, dow, h, m }) {
  const out = [], done = async (k) => { const key = `discord/done/${date}/${k}`; if (await store.get(key).catch(() => null)) return true; await store.setJSON(key, { at: Date.now() }); return false; };
  if (!(await getAll(store, 'discord/hooks/')).length) return out;
  const y = await lastFinished(t), today = await todayDaily(t);
  if (y && today && y.n === today.n - 1 && !(await done('morning'))) {
    out.push('discord morning: ' + JSON.stringify(await broadcast(store, { embeds: [await yesterdayEmbed(store, y), dailyEmbed(today)], components: button('Play today’s daily', SITE) }, 'daily')));
  }
  const at = (dd, hh) => dow === dd && h === hh && Math.abs(m - 15) <= 10;
  if (at(6, 0) || at(6, 1)) {
    const w = await weekendNow();
    if (w && w.open && !(await done('wk-open'))) out.push('discord weekend open: ' + JSON.stringify(await broadcast(store, { embeds: [weekendEmbed(w)], components: button('Play the weekend challenge', `${SITE}/c/${w.code}`) }, 'weekend')));
  }
  if (at(0, 19)) {
    const w = await weekendNow();
    if (w && w.open && !(await done('wk-last'))) out.push('discord weekend last call: ' + JSON.stringify(await broadcast(store, { embeds: [{ ...weekendEmbed(w), title: `Last call: ${w.theme}`, description: `The weekend challenge closes tonight at midnight Pacific (<t:${Math.floor(w.closes / 1000)}:R>). Same 6 questions for everyone, one try.\nCode **${w.code}**` }], components: button('Play before it closes', `${SITE}/c/${w.code}`) }, 'weekend')));
  }
  if (dow === 1 && h >= 7 && h <= 12 && Math.abs(m - 15) <= 10) {
    const cur = await store.get('weekend/current', { type: 'json' }).catch(() => null);
    if (cur && cur.closes <= Date.now() && !(await done('wk-results'))) {
      const w = await weekendResults(store, cur.code, await data('items'));
      if (w) out.push('discord weekend results: ' + JSON.stringify(await broadcast(store, { embeds: [weekendResultsEmbed(w)], components: button('Play today’s daily', SITE) }, 'weekend')));
    }
  }
  return out;
}
