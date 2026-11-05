// Daily Banana's automatic social posts: what goes out each day, the captions, milestones, the weekend
// challenge, and publishing to Instagram (feed, carousel, stories) and the Facebook Page.
//
// Weekly plan (Eastern time):           Mon 12:15 carousel · Tue 12:15 fun fact · Wed 7:15pm guess this
//   Thu 9:15am answer story, 12:15 banana for scale · Fri 12:15 week in review (fun fact until 500+ dailies a week)
//   Sat 10:15am weekend challenge post (it opens 12am Eastern Saturday, closes midnight Pacific Sunday) · Sun 11:15 closest guess, 7:15pm last-call story
// Milestones post at 12:15 or 7:15pm only, never within 2 hours of a scheduled post, at most one a day, each mark once.
// Every feed post is also shared as a story.
//
// Blobs (store "matryo"):
//   social/config                 { live }            live:false = practice: posts are made and shown in admin, not published
//   social/posts/{id}             { id, at, kind, slot, date, caption, fb, images:[imgId], story:[imgId], carousel, status, results, error }
//   social/img/{imgId}            the JPEG (served at /social-img/{imgId}.jpg so Meta can fetch it)
//   social/done/{date}/{slot}     a scheduled slot already handled (so a retry never double-posts)
//   social/marks/{metric}         { done:[numbers] } milestone marks already posted (or already passed when this started)
//   social/used                   { facts:[i], pairs:[key] }  recently used facts and questions
//   weekend/current               { code, n, closes }
import { getAll, getAllCached } from './db.mjs';
import { loadFonts } from './raster.mjs';
import * as P from './posts.mjs';

export const SITE = process.env.URL || 'https://dailybanana.io';
const G = 'https://graph.facebook.com/v21.0';
const HOUR = 3600e3;

// ---------- time (Eastern) ----------
export function etParts(t = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, dow, h: +p.hour % 24, m: +p.minute };
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mon = (iso) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+iso.slice(5, 7) - 1] + ' ' + +iso.slice(8, 10);
const dayName = (iso) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso + 'T12:00:00Z').getUTCDay()];

// slot = [hour, minute, kind]; feed posts count for the milestone 2-hour rule, stories don't
export const PLAN = {
  1: [[12, 15, 'mon']],
  2: [[12, 15, 'tue']],
  3: [[19, 15, 'wed']],
  4: [[9, 15, 'thu_story'], [12, 15, 'thu']],
  5: [[12, 15, 'fri']],
  6: [[10, 15, 'sat']],
  0: [[11, 15, 'sun'], [19, 15, 'sun_story']],
};
const STORY_ONLY = new Set(['thu_story', 'sun_story']);
const MILESTONE_WINDOWS = [[12, 15], [19, 15]];
export function milestoneWindowOk(dow, h, m) {
  if (!MILESTONE_WINDOWS.some(([a, b]) => a === h && b === m)) return false;
  return !(PLAN[dow] || []).filter((s) => !STORY_ONLY.has(s[2])).some(([a, b]) => Math.abs((a * 60 + b) - (h * 60 + m)) <= 120);
}

// ---------- hashtags (3 always + 2 by day; Facebook gets one) ----------
const CORE_TAGS = '#dailybanana #dailypuzzle #wordlelike';
const DAY_TAGS = { mon: '#puzzlegame #brainteaser', tue: '#funfacts #didyouknow', wed: '#guessinggame #trivia', thu: '#bananaforscale #estimation', fri: '#indiegame #webgame', fri_fact: '#funfacts #didyouknow', sat: '#weekendchallenge #friendlycompetition', sun: '#trivia #closestguess', milestone: '#indiegame #thankyou' };
const withTags = (kind, text) => ({ caption: `${text}\n\n${CORE_TAGS} ${DAY_TAGS[kind] || ''}`.trim(), fb: `${text}\n\n#dailybanana` });

// ---------- data ----------
const DATA = {};
export async function data(name) {
  if (DATA[name]) return DATA[name];
  if (process.env.SOCIAL_LOCAL) { const fs = await import('node:fs'); return (DATA[name] = JSON.parse(fs.readFileSync(`${process.env.SOCIAL_LOCAL}/data/${name}.json`, 'utf8'))); }
  const r = await fetch(`${SITE}/data/${name}.json`); if (!r.ok) throw new Error(`data/${name}: ${r.status}`);
  return (DATA[name] = await r.json());
}
export const fonts = () => loadFonts(process.env.SOCIAL_LOCAL ? `${process.env.SOCIAL_LOCAL}/fonts` : SITE);

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const NEVER = /grasshopper/i;   // used in an earlier post
// a quick-play style question with an answer between lo and hi (unit from the unit list, thing usually well known)
export function randomPair(items, { lo = 6, hi = 250, unit = null, avoid = new Set() } = {}) {
  const units = unit ? [unit] : items.filter((i) => i.unit && !NEVER.test(i.name)), core = items.filter((i) => i.core && !NEVER.test(i.name)), all = items.filter((i) => !NEVER.test(i.name));
  for (let t = 0; t < 20000; t++) {
    const A = pick(units), B = t < 12000 ? pick(core) : pick(all), r = B.cm / A.cm;
    if (A.name !== B.name && r >= lo && r <= hi && (t > 16000 || !avoid.has(A.name + '>' + B.name))) return { A, B, ans: r };
  }
  return null;
}
const BUCKETS = [[2, 25], [2, 25], [25, 250], [25, 250], [250, 2000], [250, 2000]];   // same as the game: 2 small, 2 medium, 2 large

async function used(store) { return (await store.get('social/used', { type: 'json' }).catch(() => null)) || { facts: [], pairs: [] }; }
async function remember(store, u) { u.facts = u.facts.slice(-80); u.pairs = u.pairs.slice(-300); await store.setJSON('social/used', u); }

// per-daily results from the plays the game logs: average points and share within 10% for each round
function roundStats(plays) {
  const n = plays.length, out = [];
  for (let i = 0; i < 6; i++) {
    const pts = plays.map((p) => (p.points || [])[i]).filter((v) => Number.isFinite(v));
    out.push(pts.length ? { avg: pts.reduce((a, b) => a + b, 0) / pts.length, within: pts.filter((v) => v >= 90).length / pts.length, n: pts.length } : null);
  }
  return { n, rounds: out };
}
const qOfDaily = (items, d, i) => { const A = items[d.rounds[i].a], B = items[d.rounds[i].b]; return { A, B, ans: B.cm / A.cm }; };
const MIN_PLAYS = 3;   // below this, no "hardest" or averages (too few to mean anything)

// ---------- building each post ----------
// returns { kind, caption, fb, images:[Canvas], story:[Canvas], carousel, extra }
export async function build(kind, store, { date = etParts().date, preview = false } = {}) {
  await fonts();
  const items = await data('items'), u = await used(store);
  if (kind === 'mon') {
    const dailies = await data('dailies'), start = addDays(date, -7);
    const week = dailies.filter((d) => d.date >= start && d.date < date).slice(0, 7);
    const slides = [];
    for (const d of week) {
      const plays = (await getAll(store, `plays/${d.n}/`)).filter((p) => Array.isArray(p.points));
      const st = roundStats(plays);
      let i, hasData = st.n >= MIN_PLAYS;
      if (hasData) i = st.rounds.reduce((b, r, k) => (r && (b < 0 || r.avg < st.rounds[b].avg) ? k : b), -1);
      if (i == null || i < 0) { hasData = false; i = d.rounds.reduce((b, r, k) => (qOfDaily(items, d, k).ans > qOfDaily(items, d, b).ans ? k : b), 0); }
      slides.push({ d, q: qOfDaily(items, d, i), avg: hasData ? st.rounds[i].avg : null, within: hasData ? st.rounds[i].within : null });
    }
    if (!week.length) return null;
    slides.sort((a, b) => (a.avg == null) - (b.avg == null) || (a.avg ?? 0) - (b.avg ?? 0) || a.d.n - b.d.n);   // hardest first
    const imgs = [P.monCover(`Week of ${mon(start)}`, slides.length), ...slides.map((s, k) => P.monDay({ dayName: dayName(s.d.date), n: s.d.n, q: s.q, avg: s.avg, within: s.within, i: k + 1, of: slides.length }, k % 2 === 0)), P.monEnd()];
    const top = slides[0], ans = P.shownAns(top.q.ans);
    const text = top.avg != null
      ? `Last week’s dailies, ranked by how badly they slipped everyone up. 🍌 The worst one: ${P.question(top.q)} Answer: about ${P.fmt(ans)} ${ans === 1 ? top.q.A.name : top.q.A.plural}. Average score: ${Math.round(top.avg)}.\nSwipe for all ${slides.length}, then play today’s at dailybanana.io`
      : `Last week’s dailies: the hardest question from each day. 🍌\nSwipe for all ${slides.length}, then play today’s at dailybanana.io`;
    return { kind, ...withTags('mon', text), images: imgs, story: [P.storyOf(imgs[0], false)], carousel: true };
  }
  if (kind === 'tue' || kind === 'fri_fact') {
    const facts = await data('facts');
    let fi = [...facts.keys()].filter((i) => !u.facts.includes(i)); if (!fi.length) { u.facts = []; fi = [...facts.keys()]; }
    const i = pick(fi), q = randomPair(items, { lo: 6, hi: 250 });
    if (!preview) { u.facts.push(i); await remember(store, u); }
    const img = P.factPost(facts[i]);
    return { kind, ...withTags(kind, `${facts[i]}\nNow guess how many ${q.A.plural} ${q.B.dim} ${P.the(q.B)} is. 6 questions a day at dailybanana.io`), images: [img], story: [P.storyOf(img, false)], extra: { fact: i } };
  }
  if (kind === 'wed') {
    const avoid = new Set(u.pairs), [lo, hi] = pick(BUCKETS.slice(1, 4)), q = randomPair(items, { lo, hi, avoid });
    const p = 40 + Math.floor(Math.random() * 61), guess = Math.random() < 0.5 ? q.ans * p / 100 : q.ans * 100 / p;
    if (!preview) { u.pairs.push(q.A.name + '>' + q.B.name); await remember(store, u); }
    const img = P.guessPost(q, { guess, p });
    return { kind, ...withTags('wed', `${P.question(q)} Drop your guess 👇 Answer in tomorrow’s stories.\nPlay 6 like this a day at dailybanana.io`), images: [img], story: [P.storyOf(img, true)], extra: { q: { a: q.A.name, b: q.B.name } } };
  }
  if (kind === 'thu_story') {
    // the answer to yesterday's "guess this"
    const posts = await recent(store, 20), w = posts.find((x) => x.kind === 'wed' && x.extra && x.extra.q && x.date === addDays(date, -1)) || (preview && posts.find((x) => x.kind === 'wed' && x.extra && x.extra.q));
    if (!w) return null;
    const by = Object.fromEntries(items.map((i) => [i.name, i])), A = by[w.extra.q.a], B = by[w.extra.q.b];
    if (!A || !B) return null;
    return { kind, caption: '', fb: '', images: [], story: [P.answerStory({ A, B, ans: B.cm / A.cm })] };
  }
  if (kind === 'thu') {
    const banana = items.find((i) => i.name === 'banana'), avoid = new Set(u.pairs), q = randomPair(items, { lo: 3, hi: 60, unit: banana, avoid });
    if (!preview) { u.pairs.push('banana>' + q.B.name); await remember(store, u); }
    const ans = P.shownAns(q.ans), Bn = q.B.name.charAt(0).toUpperCase() + q.B.name.slice(1);
    const img = P.scalePost(q);
    return { kind, ...withTags('thu', `${q.B.art ? (q.B.art === 'an' ? 'An' : 'A') + ' ' + q.B.name : Bn} is about ${P.fmt(ans)} ${ans === 1 ? 'banana' : 'bananas'} ${q.B.dim}. We did the math so you don’t have to. 🍌📏\nHow close would you have been? dailybanana.io`), images: [img], story: [P.storyOf(img, false)] };
  }
  if (kind === 'fri') {
    const t = await weekTotals(store, date);
    if (t.dailies < 500 && !preview) return build('fri_fact', store, { date, preview });
    const img = P.weekPost(t);
    return { kind, ...withTags('fri', `This week in review: ${P.fmt(t.dailies)} dailies played, ${P.fmt(t.bananas)} bananas earned, ${P.fmt(t.challenges)} challenges made. Thanks for guessing ridiculous things with us. 🍌`), images: [img], story: [P.storyOf(img, true)], extra: { real: t.dailies >= 500 } };
  }
  if (kind === 'sat') {
    const wk = await weekendFor(date);
    if (!wk) return null;
    const code = preview ? 'PREVIEW' : (await openWeekend(store, wk, items)).code;
    const img = P.weekendPost(wk, code);
    return { kind, ...withTags('sat', `Join this weekend’s challenge! 🍌 Same 6 questions for everyone, open all weekend, one try.\nLink in bio, or tap “Join” and enter ${code}.\nPost your score in the comments 👇`), images: [img], story: [P.storyOf(img, false)], extra: { code, n: wk.n } };
  }
  if (kind === 'sun_story') {
    const cur = await store.get('weekend/current', { type: 'json' }).catch(() => null), wks = await data('weekend');
    const wk = cur && wks.find((w) => w.n === cur.n);
    if (!wk || !(cur.closes > Date.now())) return preview && wks[0] ? { kind, caption: '', fb: '', images: [], story: [P.lastCallStory(wks[0], 'PREVIEW')] } : null;
    return { kind, caption: '', fb: '', images: [], story: [P.lastCallStory(wk, cur.code)] };
  }
  if (kind === 'sun') {
    const cg = await closestGuess(store, date, items);
    if (!cg) return null;
    const img = P.closestPost(cg);
    return { kind, ...withTags('sun', `Closest guess of the week 🏆 ${P.question(cg.q)} A player guessed ${P.fmt(cg.guess)}. The answer was ${P.fmt(P.shownAns(cg.q.ans))}. That’s ${cg.points} points.\nThink you can do better? dailybanana.io`), images: [img], story: [P.storyOf(img, true)] };
  }
  if (kind === 'milestone') {
    const m = preview ? { number: '10,000', label: 'bananas earned', sub: 'That’s 10,000 guesses within 10%.' } : await nextMilestone(store);
    if (!m) return null;
    const img = P.milestonePost(m.number, m.label, m.sub);
    return { kind, ...withTags('milestone', `${m.number} ${m.label}! 🍌 Thank you for playing. dailybanana.io`), images: [img], story: [P.storyOf(img, false)], extra: m.mark ? { metric: m.metric, mark: m.mark } : {} };
  }
  return null;
}

async function weekTotals(store, date) {
  const from = addDays(date, -7), inR = (d) => d >= from && d < date;
  const plays = (await getAllCached(store, 'plays/', { recheck: (v) => !Array.isArray(v.guesses) || !v.guesses.length })).filter((p) => inR(p.day));
  const chals = (await getAll(store, 'challenges/')).filter((c) => c.created && inR(etParts(c.created).date) && c.creator !== 'weekend');
  const pts = plays.flatMap((p) => (p.points || []).filter(Number.isFinite));
  return { dailies: plays.length, bananas: pts.filter((v) => v >= 90).length, challenges: chals.length, accuracy: pts.length ? Math.round(pts.reduce((a, b) => a + b, 0) / pts.length) : 0 };
}
async function closestGuess(store, date, items) {
  const from = addDays(date, -7), dailies = await data('dailies'), byN = Object.fromEntries(dailies.map((d) => [d.n, d]));
  const plays = (await getAllCached(store, 'plays/', { recheck: (v) => !Array.isArray(v.guesses) || !v.guesses.length })).filter((p) => p.day >= from && p.day < date);
  let best = null;
  for (const p of plays) {
    const n = +p.key.split('/')[1], d = byN[n]; if (!d || !Array.isArray(p.guesses)) continue;
    p.guesses.forEach((g, i) => { const pt = (p.points || [])[i]; if (g == null || !Number.isFinite(pt)) return; if (!best || pt > best.points) best = { points: pt, guess: g, q: qOfDaily(items, d, i) }; });
  }
  if (!best) return null;
  best.guess = P.shownAns(best.guess);
  return { ...best, plays: plays.length };
}

// ---------- weekend challenge ----------
export async function weekendFor(date) { const wks = await data('weekend'); return wks.find((w) => w.date === date) || null; }
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// the weekend challenge closes for everyone at midnight Pacific at the end of Sunday (3am Monday Eastern)
export function sundayNightPacific(satIso) {
  let t = Date.parse(addDays(satIso, 2) + 'T08:00:00Z');   // Monday 00:00 in standard time
  const h = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false }).format(new Date(t)) % 24;
  return t - h * HOUR;   // in daylight time 08:00Z is 1am, so step back an hour
}
export async function openWeekend(store, wk, items) {
  const cur = await store.get('weekend/current', { type: 'json' }).catch(() => null);
  if (cur && cur.n === wk.n) return cur;   // already made (a retry)
  const unit = { name: wk.name, plural: wk.plural, art: wk.art, dim: wk.dim, cm: wk.cm };
  const used = new Set(), rounds = [];
  for (const [lo, hi] of BUCKETS) {
    let q = null; for (let t = 0; t < 50 && !q; t++) { const c = randomPair(items, { lo, hi, unit }); if (c && !used.has(c.B.name)) q = c; }
    if (!q) for (let t = 0; t < 50 && !q; t++) { const c = randomPair(items, { lo: 2, hi: 1500, unit }); if (c && !used.has(c.B.name)) q = c; }
    if (q) { used.add(q.B.name); rounds.push({ a: wk.name, b: q.B.name }); }
  }
  for (let i = rounds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rounds[i], rounds[j]] = [rounds[j], rounds[i]]; }
  let code; for (let i = 0; i < 6; i++) { code = Array.from({ length: 6 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join(''); if (!(await store.get(`challenges/${code}`).catch(() => null))) break; }
  const now = Date.now(), c = { code, rounds, creator: 'weekend', uid: null, host: 'Daily Banana', weekend: { n: wk.n, tagline: wk.tagline, hint: wk.hint, unit }, created: now, closes: sundayNightPacific(etParts(now).date), closed: false };
  await store.setJSON(`challenges/${code}`, c);
  const rec = { code, n: wk.n, closes: c.closes };
  await store.setJSON('weekend/current', rec);
  return rec;
}

// ---------- milestones ----------
const MARKS = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
const METRICS = {
  players: { label: 'players', min: 100 },
  dailies: { label: 'dailies played', min: 500 },
  bananas: { label: 'bananas earned', min: 1000, sub: (n) => `That’s ${P.fmt(n)} guesses within 10%.` },
  perfect: { label: 'perfect guesses', min: 100 },
  challenges: { label: 'challenges made', min: 100 },
  guesses: { label: 'guesses made', min: 10000 },
};
export async function totals(store) {
  const [plays, quick, chals] = await Promise.all([getAllCached(store, 'plays/', { recheck: (v) => !Array.isArray(v.guesses) || !v.guesses.length }), getAllCached(store, 'quick/'), getAll(store, 'challenges/')]);
  const pts = plays.flatMap((p) => (p.points || []).filter(Number.isFinite)), qpts = quick.flatMap((p) => (p.points || []).filter(Number.isFinite));
  const players = new Set([...plays, ...quick].map((p) => p.device).filter(Boolean));
  const guesses = plays.reduce((t, p) => t + (Array.isArray(p.guesses) ? p.guesses.filter((g) => g != null).length : (p.points || []).filter((v) => v > 0).length), 0) + qpts.filter((v) => v > 0).length;
  return { players: players.size, dailies: plays.length, bananas: pts.filter((v) => v >= 90).length, perfect: [...pts, ...qpts].filter((v) => v >= 100).length, challenges: chals.filter((c) => c.creator !== 'weekend').length, guesses };
}
// the first time this runs, every mark already passed is recorded as done, so nothing old gets announced late
export async function nextMilestone(store) {
  const t = await totals(store), dailies = await data('dailies'), today = etParts().date;
  const cand = [];
  for (const [k, m] of Object.entries(METRICS)) {
    const rec = await store.get(`social/marks/${k}`, { type: 'json' }).catch(() => null);
    const passed = MARKS.filter((x) => x >= m.min && x <= t[k]);
    if (!rec) { await store.setJSON(`social/marks/${k}`, { done: passed }); continue; }
    const fresh = passed.filter((x) => !rec.done.includes(x));
    if (fresh.length) cand.push({ metric: k, mark: Math.max(...fresh), all: fresh, label: m.label, sub: m.sub && m.sub(Math.max(...fresh)) });
  }
  const d = dailies.find((x) => x.date === today);
  if (d && [100, 200, 365].includes(d.n)) {
    const rec = await store.get('social/marks/anniversary', { type: 'json' }).catch(() => null) || { done: [] };
    if (!rec.done.includes(d.n)) cand.push({ metric: 'anniversary', mark: d.n, all: [d.n], number: `#${d.n}`, label: `Daily #${d.n} is here`, sub: d.n === 365 ? 'A whole year of ridiculous measurements.' : `${d.n} days of ridiculous measurements.` });
  }
  if (!cand.length) return null;
  const c = cand.sort((a, b) => b.mark - a.mark)[0];
  return { ...c, number: c.number || P.fmt(c.mark) };
}
export async function markDone(store, m) {
  const k = `social/marks/${m.metric}`, rec = (await store.get(k, { type: 'json' }).catch(() => null)) || { done: [] };
  rec.done = [...new Set([...rec.done, ...(m.all || [m.mark])])]; await store.setJSON(k, rec);
}

// ---------- saving ----------
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export async function save(store, post, { slot = null, date, status }) {
  const id = rid(), put = async (c) => { const k = rid(); await store.set(`social/img/${k}`, c.jpeg(90)); return k; };
  const rec = { id, at: Date.now(), kind: post.kind, slot, date, caption: post.caption, fb: post.fb, carousel: !!post.carousel, extra: post.extra || null, status,
    images: await Promise.all(post.images.map(put)), story: await Promise.all((post.story || []).map(put)), results: [] };
  await store.setJSON(`social/posts/${id}`, rec);
  return rec;
}
export async function recent(store, n = 40) {
  const all = await getAll(store, 'social/posts/');
  return all.map(({ key, ...r }) => r).sort((a, b) => b.at - a.at).slice(0, n);
}
export const imgUrl = (k) => `${SITE}/social-img/${k}.jpg`;

// ---------- publishing ----------
async function graph(path, params, method = 'POST') {
  const body = new URLSearchParams({ ...params, access_token: params.access_token || process.env.META_TOKEN });
  const r = method === 'GET' ? await fetch(`${G}/${path}?${body}`) : await fetch(`${G}/${path}`, { method, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((j.error && j.error.message) || `Meta answered ${r.status}`);
  return j;
}
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function igReady(id) {
  for (let i = 0; i < 12; i++) { const s = await graph(id, { fields: 'status_code' }, 'GET'); if (s.status_code === 'FINISHED') return; if (s.status_code === 'ERROR') throw new Error('Instagram could not process the image'); await sleep(1500); }
}
async function igPublish(ig, creation) { await igReady(creation); return (await graph(`${ig}/media_publish`, { creation_id: creation })).id; }
async function pageToken(page) {
  const j = await graph('me/accounts', { fields: 'id,access_token', limit: '100' }, 'GET');
  const p = (j.data || []).find((x) => x.id === page); if (!p) throw new Error('The token can’t see the Facebook Page');
  return p.access_token;
}
export async function publish(store, rec) {
  const ig = process.env.IG_USER_ID, page = process.env.FB_PAGE_ID, out = [];
  if (!process.env.META_TOKEN || !ig) throw new Error('META_TOKEN or IG_USER_ID is not set');
  const urls = rec.images.map(imgUrl), stories = rec.story.map(imgUrl);
  const step = async (where, fn) => { try { out.push({ where, ok: true, id: await fn() }); } catch (e) { out.push({ where, ok: false, error: String(e.message || e) }); } };
  if (urls.length === 1) await step('instagram', async () => igPublish(ig, (await graph(`${ig}/media`, { image_url: urls[0], caption: rec.caption })).id));
  else if (urls.length > 1) await step('instagram', async () => {
    const kids = await Promise.all(urls.slice(0, 10).map((u) => graph(`${ig}/media`, { image_url: u, is_carousel_item: 'true' }).then((x) => x.id)));
    await Promise.all(kids.map(igReady));
    return igPublish(ig, (await graph(`${ig}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: rec.caption })).id);
  });
  for (const s of stories) await step('instagram story', async () => igPublish(ig, (await graph(`${ig}/media`, { image_url: s, media_type: 'STORIES' })).id));
  if (page && urls.length) await step('facebook', async () => {
    const tok = await pageToken(page);
    if (urls.length === 1) return (await graph(`${page}/photos`, { url: urls[0], message: rec.fb, access_token: tok })).id;
    const ids = await Promise.all(urls.map((u) => graph(`${page}/photos`, { url: u, published: 'false', access_token: tok }).then((x) => x.id)));
    const media = Object.fromEntries(ids.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })]));
    return (await graph(`${page}/feed`, { message: rec.fb, ...media, access_token: tok })).id;
  });
  rec.results = out; rec.status = out.every((x) => x.ok) ? 'posted' : out.some((x) => x.ok) ? 'partly posted' : 'failed';
  rec.postedAt = Date.now();
  await store.setJSON(`social/posts/${rec.id}`, rec);
  return rec;
}

// ---------- the hourly run ----------
export async function config(store) { return (await store.get('social/config', { type: 'json' }).catch(() => null)) || { live: false }; }
export async function run(store, t = Date.now()) {
  const { date, dow, h, m } = etParts(t), cfg = await config(store), log = [];
  const due = (PLAN[dow] || []).filter(([a, b]) => a === h && Math.abs(b - m) <= 10).map((s) => s[2]);
  if (Math.abs(m - 15) <= 10 && milestoneWindowOk(dow, h, 15)) due.push('milestone');
  for (const kind of due) {
    const doneKey = `social/done/${date}/${kind}`;
    if (await store.get(doneKey).catch(() => null)) { log.push(`${kind}: already done`); continue; }
    if (kind === 'milestone') {
      const today = (await recent(store, 20)).some((r) => r.kind === 'milestone' && r.date === date);
      if (today) { log.push('milestone: one already today'); continue; }
    }
    const post = await build(kind, store, { date });
    if (post || kind !== 'milestone') await store.setJSON(doneKey, { at: Date.now() });   // a milestone can still come up in the later window
    if (!post) { log.push(`${kind}: nothing to post`); continue; }
    if (kind === 'milestone' && post.extra && post.extra.metric) await markDone(store, post.extra);
    let rec = await save(store, post, { slot: kind, date, status: cfg.live ? 'publishing' : 'practice' });
    if (cfg.live) rec = await publish(store, rec);
    log.push(`${kind}: ${rec.status}`);
  }
  return { date, dow, h, m, live: cfg.live, log };
}
