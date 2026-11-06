// The admin dashboard's numbers. Needs a signed-in admin account (ADMIN_EMAIL or ADMIN_DISCORD_ID, see lib/auth.mjs).
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD   (Eastern days, inclusive; defaults to the last 30 days)
// A "player" is a device that finished at least one game (daily or quick). Visits alone don't count as playing.
// Metrics whose tracking started later report `null` plus a `since` date, never a fake zero.
import { db, json, day, getAll, getAllCached } from '../lib/db.mjs';
import { userFor, isAdminUser } from '../lib/auth.mjs';

// when each kind of data started being recorded
const SINCE = { games: '2026-11-03', visits: '2026-11-03', shares: '2026-11-03', quick: '2026-11-03', starts: '2026-11-04', time: '2026-11-04', where: '2026-11-06' };
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

  // most records never change once written, so they come from a cache and only new ones are read (see getAllCached);
  // the few that can change get read again: plays still missing guesses (a backfill can add them), brand-new devices' source, challenges, accounts
  const fresh = url.searchParams.get('fresh') === '1', yday = add(today, -1);
  const C = (p, recheck) => getAllCached(store, p, { recheck, fresh });
  const [plays, quickRaw, startsD, startsQ, visitsRaw, shares, chals, entries, users, seenAll, signins, kofi, timeRaw] = await Promise.all([
    C('plays/', (v) => !Array.isArray(v.guesses) || !v.guesses.length), C('quick/'), C('starts/daily/'), C('starts/quick/'),
    C('visits/'), C('shares/'), getAll(store, 'challenges/'), C('entries/'), getAll(store, 'users/'), C('seen/', (v) => !v.first || (v.first >= yday && !v.src)), C('signins/'), C('kofi/'),
    getAll(store, `time/`),
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
    completions_tracked: dR.filter((g) => g.day >= SINCE.starts).length,   // same days as starts, so the two compare
    rate: startsTracked && sD.length ? pct(completedAfterStart, sD.length) : null,
    finished_starts: startsTracked ? completedAfterStart : null,   // of the starts, how many were finished
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
    completed_tracked: qR.filter((g) => g.day >= SINCE.starts).length,
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
    kofi: kofi.filter((k) => inR(k.key.split('/')[1], from, to)).length,
    accounts: users.filter((u) => u.created && inR(ET(u.created), from, to)).length,
    points: gR.reduce((t, g) => t + (g.score || 0), 0),
  };

  // G. where new devices came from (first visit's ad tags / Facebook click / referring site / direct), tracked from Nov 4
  const label = (x) => (!x ? 'before tracking' : x.s === 'direct' ? 'direct' : [x.s, x.c || x.m].filter(Boolean).join(' · '));
  const visitDays = new Map();
  for (const v of visits) { if (!visitDays.has(v.device)) visitDays.set(v.device, new Set()); visitDays.get(v.device).add(v.day); }
  const signedIn = new Map(signins.map((x) => [x.key.split('/')[1], x]));
  const created = new Map(users.map((u) => [u.uid, u.created ? ET(u.created) : null]));
  const dailyDevs = new Set(dailies.map((g) => g.device));
  const groups = new Map();
  for (const sn of seenAll) {
    const dev = sn.key.split('/')[1];
    if (!sn.first || !inR(sn.first, from, to)) continue;
    const k = label(sn.src); if (!groups.has(k)) groups.set(k, { source: k, visitors: 0, played: 0, daily: 0, signed_in: 0, new_accounts: 0, came_back: 0 });
    const g = groups.get(k); g.visitors++;
    if (first.has(dev)) g.played++;
    if (dailyDevs.has(dev)) g.daily++;
    const si = signedIn.get(dev); if (si) { g.signed_in++; if (created.get(si.uid) && created.get(si.uid) >= sn.first) g.new_accounts++; }
    const later = [...(visitDays.get(dev) || []), ...(active.get(dev) || [])].some((d) => d > sn.first);
    if (later) g.came_back++;
  }
  const sources = [...groups.values()].sort((a, b) => b.visitors - a.visitors);

  // H. where players are and how they play (from Nov 6): country from Netlify's edge, time zone and language from the browser,
  // local hour of each finished daily, and active time in the game per player per day
  const lastVisit = new Map();
  for (const v of vR.sort((a, b) => (a.day < b.day ? -1 : 1))) lastVisit.set(v.device, v);   // each device's latest visit in the range
  const playedR = new Set(gR.map((g) => g.device));
  const tally = (pick, top) => {
    const m = new Map();
    for (const [dev, v] of lastVisit) { const k = pick(v); if (!k) continue; const r = m.get(k) || { key: k, visitors: 0, players: 0 }; r.visitors++; if (playedR.has(dev)) r.players++; m.set(k, r); }
    const rows = [...m.values()].sort((a, b) => b.players - a.players || b.visitors - a.visitors);
    return top ? rows.slice(0, top) : rows;
  };
  const tracked = [...lastVisit.values()].filter((v) => v.tz || v.cc || v.dev).length;
  const hours = Array(24).fill(0);
  for (const g of dR) if (Number.isInteger(g.h)) hours[g.h]++;
  const tR = timeRaw.map((t) => ({ ...t, day: t.key.split('/')[1] })).filter((t) => inR(t.day, from, to) && t.secs > 0);
  const secs = tR.map((t) => t.secs).sort((a, b) => a - b);
  const share = (f) => (tR.length ? pct(tR.filter(f).length, tR.length) : null);
  const where = {
    tracked,
    countries: tally((v) => v.cc, 15),
    timezones: tally((v) => v.tz, 12),
    languages: tally((v) => (v.lang || '').split('-')[0].toLowerCase(), 8),
    devices: tally((v) => v.dev),
    installed: [...lastVisit.values()].filter((v) => v.app).length,
    hours, hours_n: hours.reduce((a, b) => a + b, 0),
    time: tR.length ? {
      days: tR.length,
      avg: Math.round(secs.reduce((a, b) => a + b, 0) / secs.length),
      median: secs[Math.floor(secs.length / 2)],
      daily_only: share((t) => t.daily && !t.quick && !t.other),
      daily_plus: share((t) => t.daily && (t.quick || t.other)),
      no_daily: share((t) => !t.daily),
      came_back: share((t) => (t.sids || []).length >= 2),
      visits: Math.round((10 * tR.reduce((a, t) => a + Math.max(1, (t.sids || []).length), 0)) / tR.length) / 10,
    } : null,
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
  return json({ from, to, today, days_in_range: len, since: { ...SINCE, sources: '2026-11-04' }, health, retention, daily, quick: quickM, bananas, traffic, sources, where, days });
};
