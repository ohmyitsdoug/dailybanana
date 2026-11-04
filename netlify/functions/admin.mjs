// The admin dashboard's numbers. Needs a signed-in admin account (ADMIN_EMAIL or ADMIN_DISCORD_ID, see lib/auth.mjs).
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD   (Eastern days, inclusive; defaults to the last 30 days)
// A "player" is a device that finished at least one game (daily or quick). Visits alone don't count as playing.
// Metrics whose tracking started later report `null` plus a `since` date, never a fake zero.
import { db, json, day, getAll } from '../lib/db.mjs';
import { userFor, isAdminUser } from '../lib/auth.mjs';

// when each kind of data started being recorded
const SINCE = { games: '2026-11-03', visits: '2026-11-03', shares: '2026-11-03', quick: '2026-11-03', starts: '2026-11-04', time: '2026-11-04' };
const ET = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const add = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const span = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3) + 1;
const inR = (d, a, b) => d >= a && d <= b;
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const change = (now, before) => (before ? Math.round(((now - before) / before) * 100) : now ? null : 0);   // null = new (nothing before)
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export default async (req) => {
  if (!isAdminUser(await userFor(req))) return json({ error: 'not the admin account' }, 401);
  const store = db(), url = new URL(req.url), today = day();
  let to = isISO(url.searchParams.get('to')) ? url.searchParams.get('to') : today;
  let from = isISO(url.searchParams.get('from')) ? url.searchParams.get('from') : add(to, -29);
  if (to > today) to = today;
  if (from < SINCE.games) from = SINCE.games;
  if (from > to) from = to;

  const [plays, quickRaw, startsD, startsQ, visitsRaw, shares, chals, entries, users] = await Promise.all([
    getAll(store, 'plays/'), getAll(store, 'quick/'), getAll(store, 'starts/daily/'), getAll(store, 'starts/quick/'),
    getAll(store, 'visits/'), getAll(store, 'shares/'), getAll(store, 'challenges/'), getAll(store, 'entries/'), getAll(store, 'users/'),
  ]);
  // one record per game, with its Eastern day
  const dailies = []; const seenDaily = new Set();
  for (const p of plays.sort((a, b) => (a.key < b.key ? -1 : 1))) {
    const n = p.key.split('/')[1], k = `${p.device}|${n}`;
    if (seenDaily.has(k)) continue;   // a daily counts once per player
    seenDaily.add(k); dailies.push({ ...p, n: +n, mode: 'daily' });
  }
  const quick = quickRaw.map((q) => ({ ...q, day: q.key.split('/')[1], mode: 'quick' }));
  const games = [...dailies, ...quick].filter((g) => g.device && g.day);
  const visits = visitsRaw.map((v) => ({ ...v, day: v.key.split('/')[1], device: v.key.split('/')[2] }));

  // each player's first game and active days
  const first = new Map(), active = new Map();
  for (const g of games) {
    if (!first.has(g.device) || g.day < first.get(g.device)) first.set(g.device, g.day);
    if (!active.has(g.device)) active.set(g.device, new Set());
    active.get(g.device).add(g.day);
  }
  const playersIn = (a, b) => new Set(games.filter((g) => inR(g.day, a, b)).map((g) => g.device)).size;
  const newIn = (a, b) => [...first.values()].filter((d) => inR(d, a, b)).length;
  const len = span(from, to);

  // A. player health (DAU/WAU/MAU end on the range's last day)
  const health = {
    dau: { v: playersIn(to, to), ch: change(playersIn(to, to), playersIn(add(to, -1), add(to, -1))) },
    wau: { v: playersIn(add(to, -6), to), ch: change(playersIn(add(to, -6), to), playersIn(add(to, -13), add(to, -7))) },
    mau: { v: playersIn(add(to, -29), to), ch: change(playersIn(add(to, -29), to), playersIn(add(to, -59), add(to, -30))) },
    new: { v: newIn(from, to), ch: change(newIn(from, to), newIn(add(from, -len), add(from, -1))) },
  };

  // B. retention: players whose first game falls in the range, who played again exactly N days later
  const retention = {};
  for (const N of [1, 7, 30]) {
    const cohort = [...first.entries()].filter(([, d]) => inR(d, from, to) && add(d, N) <= today);
    const back = cohort.filter(([dev, d]) => active.get(dev).has(add(d, N))).length;
    retention['d' + N] = cohort.length ? { v: pct(back, cohort.length), n: cohort.length } : { v: null, need: N };
  }

  // C. the daily
  const dR = dailies.filter((g) => inR(g.day, from, to));
  const sD = startsD.map((s) => ({ ...s, n: +s.key.split('/')[2], device: s.key.split('/')[3] })).filter((s) => inR(s.day, from, to));
  const startsTracked = to >= SINCE.starts;
  const startedKeys = new Set(sD.map((s) => `${s.device}|${s.n}`));
  const completedAfterStart = dR.filter((g) => startedKeys.has(`${g.device}|${g.n}`)).length;
  const timed = dR.filter((g) => g.ms > 0);
  const daily = {
    starts: startsTracked ? sD.length : null,
    completions: dR.length,
    rate: startsTracked && sD.length ? pct(completedAfterStart, sD.length) : null,
    accuracy: dR.length ? pct(dR.reduce((t, g) => t + (g.score || 0), 0), dR.length * 600) : null,
    avg_score: dR.length ? Math.round(dR.reduce((t, g) => t + (g.score || 0), 0) / dR.length) : null,
    time: timed.length ? Math.round(timed.reduce((t, g) => t + g.ms, 0) / timed.length / 1000) : null,
  };

  // D. quick play (and challenges, which are shared quick games)
  const qR = quick.filter((g) => inR(g.day, from, to));
  const sQ = startsQ.filter((s) => inR(s.key.split('/')[2], from, to));
  const cR = chals.filter((c) => c.created && inR(ET(c.created), from, to));
  const creators = new Map(chals.map((c) => [c.code, c.creator]));
  const joins = entries.filter((e) => { const [, code, dev] = e.key.split('/'); return e.at && inR(ET(e.at), from, to) && creators.get(code) !== dev; });
  const quickM = {
    started: startsTracked ? sQ.length : null,
    completed: qR.length,
    players: new Set(qR.map((g) => g.device)).size,
    rate: startsTracked && sQ.length ? Math.min(100, pct(qR.filter((g) => g.day >= SINCE.starts).length, sQ.length)) : null,
    challenges: cR.length,
    joins: joins.length,
  };

  // E. bananas (rounds scored 90+), dailies and quick play together
  const gR = games.filter((g) => inR(g.day, from, to));
  const ban = (g) => (g.points || []).filter((x) => x >= 90).length;
  const perPlayer = new Map();
  for (const g of gR) perPlayer.set(g.device, (perPlayer.get(g.device) || 0) + ban(g));
  const rounds = gR.reduce((t, g) => t + (g.points || []).length, 0), totalB = [...perPlayer.values()].reduce((a, b) => a + b, 0);
  const bananas = {
    total: totalB,
    players: [...perPlayer.values()].filter((x) => x > 0).length,
    per_player: perPlayer.size ? Math.round((10 * totalB) / perPlayer.size) / 10 : null,
    rate: rounds ? pct(totalB, rounds) : null,
  };

  // F. traffic & sharing (the numbers the dashboard already had)
  const vR = visits.filter((v) => inR(v.day, from, to));
  const visitors = new Set(vR.map((v) => v.device));
  const shR = shares.filter((s) => inR(s.key.split('/')[1], from, to));
  const traffic = {
    visitors: visitors.size,
    returning: new Set(vR.filter((v) => v.first && v.first < v.day).map((v) => v.device)).size,
    conversion: visitors.size ? pct(new Set(gR.map((g) => g.device).filter((d) => visitors.has(d))).size, visitors.size) : null,
    share_results: shR.filter((s) => s.what === 'results').length,
    share_challenge: shR.filter((s) => s.what === 'challenge').length,
    accounts: users.filter((u) => u.created && inR(ET(u.created), from, to)).length,
    points: gR.reduce((t, g) => t + (g.score || 0), 0),
  };

  // per-day series for the chart and the breakdown table (newest first)
  const days = [];
  for (let d = to; d >= from; d = add(d, -1)) {
    const g = games.filter((x) => x.day === d), v = visits.filter((x) => x.day === d);
    days.push({ day: d, players: new Set(g.map((x) => x.device)).size, new: [...first.values()].filter((x) => x === d).length,
      dailies: g.filter((x) => x.mode === 'daily').length, quick: g.filter((x) => x.mode === 'quick').length,
      visitors: v.length, returning: v.filter((x) => x.first && x.first < d).length,
      bananas: g.reduce((t, x) => t + ban(x), 0), shares: shares.filter((s) => s.key.split('/')[1] === d).length });
    if (days.length > 400) break;
  }
  return json({ from, to, today, days_in_range: len, since: SINCE, health, retention, daily, quick: quickM, bananas, traffic, days });
};
