// The admin dashboard's numbers. Needs a signed-in admin account (ADMIN_EMAIL or ADMIN_DISCORD_ID, see lib/auth.mjs).
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD   (Eastern days, inclusive; defaults to the last 30 days)
// A "player" is a device that finished at least one game (daily or quick). Visits alone don't count as playing.
// Metrics whose tracking started later report `null` plus a `since` date, never a fake zero.
import { db, json, day, getAll, getAllCached } from '../lib/db.mjs';
import { userFor, isAdminUser } from '../lib/auth.mjs';
import { checkName, fallbackName } from '../lib/names.mjs';
import { reviews, refreshDaily, autoOut, isOut } from '../lib/review.mjs';
import { metaAds } from '../lib/metaads.mjs';
import { shownAns, roundAns, nice, SCORE_V2, SCORE_V3 } from '../lib/page.mjs';

// when each kind of data started being recorded
const SINCE = { games: '2026-11-03', visits: '2026-11-03', shares: '2026-11-03', quick: '2026-11-03', starts: '2026-11-04', time: '2026-11-04', where: '2026-11-06' };
const ET = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const add = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const span = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3) + 1;
const inR = (d, a, b) => d >= a && d <= b;
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const change = (now, before) => (before ? Math.round(((now - before) / before) * 100) : now ? null : 0);   // null = new (nothing before)
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// POST { action:'review', key:'plays/12/…', s:'out' | 'ok' | null }: leave a daily game out of score statistics, mark it fine, or undo
async function review(store, b) {
  const key = String(b.key || '');
  if (!/^plays\/\d{1,4}\/[\w-]+$/.test(key)) return json({ error: 'bad key' }, 400);
  const rv = await reviews(store);
  if (b.s === 'out' || b.s === 'ok') rv[key] = { s: b.s, at: Date.now() }; else delete rv[key];
  await store.setJSON('review', rv);
  await refreshDaily(store, +key.split('/')[1]);
  return json({ ok: true, s: rv[key] ? rv[key].s : null });
}

// POST { action:'ads', ads:[{ name, match, amount, from, to }] }: the paid placements, to work out cost per visitor, player and returning player
async function saveAds(store, b) {
  if (b.meta && typeof b.meta === 'object') {   // { campaign id: text to match } for Meta campaigns
    const mm = {}; for (const [k, v] of Object.entries(b.meta).slice(0, 100)) if (/^\d+$/.test(k)) mm[k] = String(v || '').toLowerCase().replace(/[^a-z0-9_.\- ·]/g, '').slice(0, 60);
    await store.setJSON('ads-meta', mm); return json({ ok: true });
  }
  const ads = (Array.isArray(b.ads) ? b.ads : []).slice(0, 50).map((a) => ({
    name: String(a.name || '').slice(0, 60), match: String(a.match || '').toLowerCase().replace(/[^a-z0-9_.\- ·]/g, '').slice(0, 60),
    amount: Math.round(Math.max(0, Math.min(1e6, +a.amount || 0)) * 100) / 100, from: isISO(a.from) ? a.from : null, to: isISO(a.to) ? a.to : null,
  })).filter((a) => a.name && a.match && a.from && a.to && a.from <= a.to);
  await store.setJSON('ads', ads);
  return json({ ok: true, ads });
}

// unusual games that aren't clear-cut: they wait in the admin's review inbox and keep counting unless the admin leaves them out
const flagsFor = (g, usual, plays) => {
  const f = [], pts = g.points || [];
  if (g.score >= 570) f.push(g.score >= 600 ? 'Perfect 600' : 'Near-perfect score');
  if (pts.length === 6 && pts.every((x) => x >= 85)) f.push('85+ on every round');
  if (plays > 1) f.push(`Sent ${plays} times`);
  return f;
};

export default async (req) => {
  if (!isAdminUser(await userFor(req))) return json({ error: 'not the admin account' }, 401);
  const store = db(), url = new URL(req.url), today = day();
  if (req.method === 'POST') { let b = {}; try { b = await req.json(); } catch {} return b.action === 'review' ? review(store, b) : b.action === 'ads' ? saveAds(store, b) : json({ error: 'unknown action' }, 400); }
  let to = isISO(url.searchParams.get('to')) ? url.searchParams.get('to') : today;
  let from = isISO(url.searchParams.get('from')) ? url.searchParams.get('from') : add(to, -29);
  if (to > today) to = today;
  if (from < SINCE.games) from = SINCE.games;
  if (from > to) from = to;

  // most records never change once written, so they come from a cache and only new ones are read (see getAllCached);
  // the few that can change get read again: plays still missing guesses (a backfill can add them), brand-new devices' source, challenges, accounts
  // Meta first, on its own: with hundreds of storage reads in flight the server's address lookups get too busy to reach Meta (EBUSY)
  const metaP = Promise.resolve(metaAds(store, { fresh: url.searchParams.get('meta') === '1' }));
  await metaP;
  const fresh = url.searchParams.get('fresh') === '1', yday = add(today, -1);
  const C = (p, recheck) => getAllCached(store, p, { recheck, fresh });
  const [plays, quickRaw, startsD, startsQ, visitsRaw, shares, chals, entries, users, seenAll, signins, kofi, timeRaw, ratingsRaw, feedbackRaw] = await Promise.all([
    C('plays/', (v) => !Array.isArray(v.guesses) || !v.guesses.length), C('quick/'), C('starts/daily/'), C('starts/quick/'),
    C('visits/'), C('shares/'), getAll(store, 'challenges/'), C('entries/'), getAll(store, 'users/'), C('seen/', (v) => !v.first || (v.first >= yday && !v.src)), C('signins/'), C('kofi/'),
    getAll(store, `time/`), getAll(store, 'ratings/'), getAll(store, 'feedback/'),
  ]);
  const RV = await reviews(store);
  // accounts whose name breaks the name rules go back to their original sign-in name (or 'Player')
  let renamed = 0;
  for (const u of users) {
    if (!u.uid || !u.name || isAdminUser(u) || u.name === 'Player' || checkName(u.name).ok) continue;
    const fixed = { ...u, name: fallbackName(u) }; delete fixed.key;
    await store.setJSON(`users/${u.uid}`, fixed).catch(() => {}); u.name = fixed.name; renamed++;
  }

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
  const dS = dR.filter((g) => !isOut(g, RV));   // score numbers leave out games set aside in Games to review
  const sD = startsD.map((s) => ({ ...s, n: +s.key.split('/')[2], device: s.key.split('/')[3] })).filter((s) => inR(s.day, from, to));
  const startsTracked = to >= SINCE.starts;
  const startedKeys = new Set(sD.map((s) => `${s.device}|${s.n}`));
  const completedAfterStart = dR.filter((g) => startedKeys.has(`${g.device}|${g.n}`)).length;
  const timed = dR.filter((g) => g.ms > 0);
  // your own normal: the same numbers over the 30 days ending on the range's last day (the mark on each bar in Admin)
  const normFrom = add(to, -29), dN = dailies.filter((g) => inR(g.day, normFrom, to)), dNs = dN.filter((g) => !isOut(g, RV));
  const sN = startsD.map((x) => ({ n: +x.key.split('/')[2], device: x.key.split('/')[3], day: x.day })).filter((x) => inR(x.day, normFrom, to) && x.day >= SINCE.starts);
  const sNk = new Set(sN.map((x) => `${x.device}|${x.n}`)), tN = dN.filter((g) => g.ms > 0);
  const norm = {
    rate: sN.length ? pct(dN.filter((g) => sNk.has(`${g.device}|${g.n}`)).length, sN.length) : null,
    accuracy: dNs.length ? pct(dNs.reduce((t, g) => t + (g.score || 0), 0), dNs.length * 600) : null,
    time: tN.length ? Math.round(tN.reduce((t, g) => t + g.ms, 0) / tN.length / 1000) : null,
  };
  const daily = {
    norm,
    starts: startsTracked ? sD.length : null,
    completions: dR.length,
    completions_tracked: dR.filter((g) => g.day >= SINCE.starts).length,   // same days as starts, so the two compare
    rate: startsTracked && sD.length ? pct(completedAfterStart, sD.length) : null,
    finished_starts: startsTracked ? completedAfterStart : null,   // of the starts, how many were finished
    accuracy: dS.length ? pct(dS.reduce((t, g) => t + (g.score || 0), 0), dS.length * 600) : null,
    avg_score: dS.length ? Math.round(dS.reduce((t, g) => t + (g.score || 0), 0) / dS.length) : null,
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
    // golden bananas: rounds guessed exactly (100), dailies and quick play
    golden: gR.reduce((t, g) => t + (g.points || []).filter((x) => x >= 100).length, 0),
    golden_daily: dR.reduce((t, g) => t + (g.points || []).filter((x) => x >= 100).length, 0),
    golden_players: new Set(gR.filter((g) => (g.points || []).some((x) => x >= 100)).map((g) => g.device)).size,
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

  // K. ad spend: new devices whose first visit came from a paid placement during its dates (its own dates, not the range picked above)
  // until the admin saves their own list, start with the Dailydle listing (started the evening of Nov 5, runs 7 days)
  const adsList = (await store.get('ads', { type: 'json' }).catch(() => null)) || [{ name: 'Dailydle listing', match: 'dailydle', amount: 138.9, from: '2026-11-05', to: '2026-11-12' }];
  // Meta campaigns come in on their own (spend straight from Meta); which visitors they brought is matched by source text, "facebook" unless changed
  const [meta, metaMatch] = await Promise.all([metaP, store.get('ads-meta', { type: 'json' }).catch(() => null)]);
  const metaRows = (meta.campaigns || []).map((c) => ({ meta: true, id: c.id, name: c.name, status: c.status, match: (metaMatch && metaMatch[c.id]) || 'facebook',
    amount: c.spend, from: c.from || today, to: c.to && c.to < today ? c.to : today, impressions: c.impressions, clicks: c.clicks }));
  const ads = [...metaRows, ...adsList].map((a) => {
    const r = { ...a, running: a.meta ? a.status === 'ACTIVE' : today <= a.to, day: Math.min(span(a.from, a.to), Math.max(0, span(a.from, today))), days: span(a.from, a.to), visitors: 0, played: 0, daily: 0, came_back: 0, signed_in: 0 };
    for (const sn of seenAll) {
      const dev = sn.key.split('/')[1];
      if (!sn.first || !inR(sn.first, a.from, a.to) || !label(sn.src).toLowerCase().includes(a.match)) continue;
      r.visitors++; if (first.has(dev)) r.played++; if (dailyDevs.has(dev)) r.daily++; if (signedIn.has(dev)) r.signed_in++;
      if ([...(visitDays.get(dev) || []), ...(active.get(dev) || [])].some((d) => d > sn.first)) r.came_back++;
    }
    return r;
  });

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

  // I. ratings (all time; asked once after a player's 3rd daily)
  const rated = ratingsRaw.filter((x) => x.stars >= 1);
  const ratings = {
    count: rated.length,
    avg: rated.length ? Math.round((10 * rated.reduce((t, x) => t + x.stars, 0)) / rated.length) / 10 : null,
    dist: [1, 2, 3, 4, 5].map((n) => rated.filter((x) => x.stars === n).length),
    skipped: ratingsRaw.filter((x) => x.skipped && !x.stars).length,
    comments: rated.filter((x) => x.comment).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 20).map((x) => ({ stars: x.stars, comment: x.comment, day: x.day })),
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
  // J. games to review: daily games in the range that look too good, plus any already reviewed
  const [itemsD, dailiesD] = await Promise.all(['items', 'dailies'].map((f) => fetch(`${url.origin}/data/${f}.json`).then((r) => r.json()).catch(() => null)));
  const sent = new Map(); for (const p of plays) { const k = `${p.device}|${p.key.split('/')[1]}`; sent.set(k, (sent.get(k) || 0) + 1); }
  const byDev = new Map(); for (const g of dailies) { if (!byDev.has(g.device)) byDev.set(g.device, []); byDev.get(g.device).push(g); }
  const lastV = new Map(); for (const v of [...visits].sort((a, b) => (a.day < b.day ? -1 : 1))) lastV.set(v.device, v);
  const seenFirst = new Map(seenAll.map((x) => [x.key.split('/')[1], x.first]));
  const toReview = [];
  for (const g of dR) {
    const others = (byDev.get(g.device) || []).filter((x) => x.key !== g.key), usual = others.length ? { n: others.length, avg: others.reduce((t, x) => t + (x.score || 0), 0) / others.length } : null;
    const auto = autoOut(g), flags = auto ? [auto] : flagsFor(g, usual, sent.get(`${g.device}|${g.n}`) || 1), r = RV[g.key];
    if (!flags.length && !r) continue;
    const d = dailiesD && dailiesD.find((x) => x.n === g.n), v = lastV.get(g.device) || {};
    const answers = d && itemsD ? d.rounds.map((q) => { const ans = itemsD[q.b].cm / itemsD[q.a].cm; return d.date >= SCORE_V3 ? roundAns(ans) : d.date >= SCORE_V2 ? shownAns(ans) : nice(ans); }) : null;
    toReview.push({ key: g.key, n: g.n, day: g.day, score: g.score, points: g.points, guesses: g.guesses || [], answers, secs: g.ms ? Math.round(g.ms / 1000) : null, 
      h: g.h ?? null, first: seenFirst.get(g.device) || null, others: usual ? { n: usual.n, avg: Math.round(usual.avg) } : null,
      cc: v.cc || null, tz: v.tz || null, device: g.device.slice(0, 6), flags, auto: !!auto, s: r ? r.s : null,
      box: r ? 'done' : auto ? 'auto' : 'inbox' });
  }
  toReview.sort((a, b) => b.day.localeCompare(a.day) || b.score - a.score);

  return json({ ads, meta: { connected: !!meta.connected, at: meta.at || null, error: meta.error || null }, review: toReview, from, to, today, days_in_range: len, since: { ...SINCE, sources: '2026-11-04' }, health, retention, daily, quick: quickM, bananas, traffic, sources, where, ratings, renamed, feedback: feedbackRaw.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 100).map((f) => ({ name: f.name || '', message: f.message, at: f.at, day: f.key.split('/')[1] })), days });
};
