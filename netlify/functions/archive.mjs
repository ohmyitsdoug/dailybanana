// Public daily archive, rendered on the server so search engines and AI tools can read it.
//   /archive        every daily that has finished everywhere, newest first
//   /archive/000    one daily: the six questions, answers, sizes, how players did and where they typically guessed
// A daily is published once it's over in every time zone (noon UTC the day after its date), so nothing is spoiled.
import { db, getAll } from '../lib/db.mjs';
import { reviews, countable } from '../lib/review.mjs';
import { page, esc, fmt, nice, shownAns, roundAns, SCORE_V2, SCORE_V3, len, fmtDate, shortDate, pad3, SITE_URL } from '../lib/page.mjs';

export const config = { path: ['/archive', '/archive/*'] };

const DAY = 86400e3;
export const publishedAt = (d) => Date.parse(d.date + 'T12:00:00Z') + DAY;
const the = (b) => (b.art ? `${b.art} ${b.name}` : b.name);
const theQ = (b) => (b.avg ? `the average ${b.name}` : the(b)), anAvg = (b) => (b.avg ? `an average ${b.name}` : the(b));   // sizes that vary are averages
const question = (A, B) => `How many ${A.plural} ${B.dim} is ${theQ(B)}?`;
const posOf = (g, ans) => (g <= ans ? (50 * g) / ans : 100 - (50 * ans) / g);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.sqrt(s[m - 1] * s[m]); };
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

let DATA = null;
async function data(origin) {
  if (DATA && Date.now() - DATA.at < 10 * 60e3) return DATA;
  const [items, dailies] = await Promise.all(['items', 'dailies'].map((f) => fetch(`${origin}/data/${f}.json`).then((r) => r.json())));
  return (DATA = { items, dailies, at: Date.now() });
}
async function playsFor(store, n) {
  const [plays, rv] = await Promise.all([getAll(store, `plays/${n}/`), reviews(store)]);
  return countable(plays.filter((p) => Array.isArray(p.points) && p.points.length === 6), rv);
}
// A daily's numbers never change once it's over, so they're worked out once and saved (archive/{n}).
// Until an hour after a daily is published (so last-second games still count) they're worked out live.
const FREEZE_AFTER = 3600e3;
async function summarize(store, d, rounds) {
  const ps = await playsFor(store, d.n), scores = ps.map((p) => p.score || 0);
  return {
    n: d.n, players: ps.length,
    avg: avg(scores), median: median(scores), best: scores.length ? Math.max(...scores) : null,
    bananas: ps.length ? avg(ps.map((p) => p.points.filter((x) => x >= 90).length)) : null,
    rounds: rounds.map((_, i) => {
      const pts = ps.map((p) => p.points[i]), gs = ps.map((p) => (p.guesses || [])[i]).filter((g) => g > 0);
      return { avgPts: avg(pts), close: pts.length ? Math.round((100 * pts.filter((x) => x >= 90).length) / pts.length) : null, typical: gs.length >= 3 ? median(gs) : null };
    }),
    buckets: [0, 100, 200, 300, 400, 500].map((lo) => scores.filter((s) => s >= lo && (lo === 500 ? s <= 600 : s < lo + 100)).length),
  };
}
async function numbersFor(store, d) {
  const saved = await store.get(`archive/${d.n}`, { type: 'json' }).catch(() => null);
  if (saved) return saved;
  const sum = await summarize(store, d, d.rounds);
  if (Date.now() >= publishedAt(d) + FREEZE_AFTER) { sum.frozen = true; await store.setJSON(`archive/${d.n}`, sum).catch(() => {}); }
  return sum;
}
// the list page: players and average for every daily, kept in one saved index (archive/index)
async function listNumbers(store, live) {
  const idx = (await store.get('archive/index', { type: 'json' }).catch(() => null)) || {};
  let changed = false;
  const out = await Promise.all(live.map(async (d) => {
    if (idx[d.n]) return { d, players: idx[d.n][0], avg: idx[d.n][1] };
    const sum = await numbersFor(store, d);
    if (sum.frozen) { idx[d.n] = [sum.players, sum.avg]; changed = true; }
    return { d, players: sum.players, avg: sum.avg };
  }));
  if (changed) await store.setJSON('archive/index', idx).catch(() => {});
  return out;
}
// frozen pages never change, so Netlify's edge keeps them like static files (until the next deploy)
const html = (s, status = 200, { forever = false, until = 1800, n = null } = {}) => new Response(s, { status, headers: {
  'netlify-cache-tag': n == null ? 'archive' : `archive,archive-${n}`,
  'content-type': 'text/html; charset=utf-8',
  'cache-control': forever ? 'public, max-age=86400' : 'public, max-age=300',
  'netlify-cdn-cache-control': forever ? 'public, durable, s-maxage=31536000, immutable' : `public, durable, s-maxage=${Math.max(60, Math.round(until))}, stale-while-revalidate=600`,
} });
// seconds until the next daily is published (12:00 UTC) plus the freeze hour, so the list page refreshes right then
const untilNextFreeze = () => { const t = new Date(); t.setUTCHours(13, 0, 30, 0); if (t <= Date.now()) t.setUTCDate(t.getUTCDate() + 1); return (t - Date.now()) / 1000; };

export default async (req) => {
  const url = new URL(req.url), store = db();
  const { items, dailies } = await data(url.origin);
  const now = Date.now();
  const live = dailies.filter((d) => publishedAt(d) <= now).sort((a, b) => b.n - a.n);
  const m = url.pathname.replace(/\/+$/, '').match(/^\/archive\/(\d{1,4})$/);

  if (!m) {   // the landing page
    const sums = await listNumbers(store, live);
    const body = `<h1>Daily archive</h1>
      <p class="lead">Every Daily Banana, with the answers and how players did. A daily shows up here once it's over everywhere in the world.</p>
      <a class="cta" href="/">Play today's daily <span aria-hidden="true">→</span></a>
      <div class="list">${sums.length ? sums.map(({ d, players, avg }) => `<a class="row" href="/archive/${pad3(d.n)}"><span><b>Daily #${pad3(d.n)}</b><br><span class="mut small">${fmtDate(d.date)}</span></span><span class="small" style="text-align:right">${players ? `avg ${fmt(Math.round(avg))}/600<br>${fmt(players)} player${players === 1 ? '' : 's'}` : 'answers'} →</span></a>`).join('') : '<p class="mut" style="padding:12px 0">The first daily appears here once it has finished everywhere.</p>'}</div>`;
    return html(page({
      title: 'Daily Banana archive · past dailies, answers and scores',
      description: 'Every past Daily Banana: the six questions, the answers, the real sizes, the average score and where players typically guessed.',
      path: '/archive', body,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Daily Banana archive', url: SITE_URL + '/archive',
        hasPart: live.slice(0, 50).map((d) => ({ '@type': 'WebPage', name: `Daily Banana #${pad3(d.n)}`, url: `${SITE_URL}/archive/${pad3(d.n)}`, datePublished: new Date(publishedAt(d)).toISOString() })) }],
    }), 200, { until: untilNextFreeze() });
  }

  const n = +m[1], d = dailies.find((x) => x.n === n);
  if (!d || publishedAt(d) > now) {
    return html(page({ title: 'Not posted yet · Daily Banana', description: 'This daily is still being played.', path: url.pathname,
      body: `<h1>Not posted yet</h1><p class="lead">This daily is still being played somewhere in the world, so its answers stay hidden for now.</p><a class="cta" href="/">Play today's daily <span aria-hidden="true">→</span></a>` }), 404);
  }
  const S = await numbersFor(store, d), players = S.players;
  const qs = d.rounds.map((r, i) => {
    const A = items[r.a], B = items[r.b];
    return { A, B, ans: B.cm / A.cm, ...S.rounds[i] };
  });
  const bananas = S.bananas;
  const hardest = players ? qs.reduce((h, q, i) => (q.avgPts < qs[h].avgPts ? i : h), 0) : null;
  const easiest = players ? qs.reduce((h, q, i) => (q.avgPts > qs[h].avgPts ? i : h), 0) : null;
  const buckets = [0, 100, 200, 300, 400, 500].map((lo, i) => ({ lo, c: S.buckets[i] }));
  const maxB = Math.max(1, ...buckets.map((b) => b.c));
  const anyTypical = qs.some((q) => q.typical);
  const prev = live.find((x) => x.n === n - 1), next = live.find((x) => x.n === n + 1);

  const ansOf = (q) => (d.date >= SCORE_V3 ? roundAns(q.ans) : d.date >= SCORE_V2 ? shownAns(q.ans) : nice(q.ans));
  const body = `<div class="eyebrow" style="margin-top:22px">Daily #${pad3(n)} · ${esc(fmtDate(d.date))}</div>
    <h1>Daily Banana #${pad3(n)} answers</h1>
    <p class="lead">Six questions, one ridiculous unit each. Here are the answers, the real sizes behind them, and how ${players ? `${fmt(players)} player${players === 1 ? '' : 's'}` : 'players'} did.</p>
    <div class="stats">
      <div class="stat big"><b>${players ? fmt(Math.round(S.avg)) : '–'}</b><span>average score (of 600)</span></div>
      <div class="stat"><b>${fmt(players)}</b><span>players</span></div>
      <div class="stat"><b>${players ? fmt(Math.round(S.median)) : '–'}</b><span>median score</span></div>
      <div class="stat"><b>${players ? fmt(S.best) : '–'}</b><span>best score</span></div>
      <div class="stat"><b>${bananas != null ? (Math.round(bananas * 10) / 10) : '–'}</b><span>avg 🍌 rounds (90+)</span></div>
    </div>
    ${hardest != null ? `<p>The toughest round was <b>#${hardest + 1}</b> (${esc(qs[hardest].B.name)}), averaging ${Math.round(qs[hardest].avgPts)} points. The easiest was <b>#${easiest + 1}</b> (${esc(qs[easiest].B.name)}) at ${Math.round(qs[easiest].avgPts)}.</p>` : ''}
    <h2>The questions</h2>
    ${anyTypical ? `<div class="legend"><span><i style="width:9px;height:9px;background:var(--acc);border:2px solid var(--ink);transform:rotate(45deg)"></i>typical player's guess</span><span><i style="width:2px;height:12px;background:var(--accsh)"></i>the answer</span><span>left is too low, right is too high</span></div>` : ''}
    ${qs.map((q, i) => `<section class="round">
      <div class="eyebrow">Round ${i + 1}</div>
      <h3 class="q">${esc(question(q.A, q.B))}</h3>
      <p class="a"><b>Answer: about ${fmt(ansOf(q))} ${esc(ansOf(q) === 1 ? q.A.name : q.A.plural)}.</b> ${esc(anAvg(q.B).replace(/^./, (c) => c.toUpperCase()))} is about ${len(q.B.cm)} ${esc(q.B.dim)}, and ${esc(the(q.A))} is about ${len(q.A.cm)}.</p>
      ${q.typical ? `<span class="mini"><span class="c"></span><span class="avg" style="left:${posOf(q.typical, q.ans).toFixed(1)}%"></span></span><div class="ends"><span>too low</span><span>typical guess: ${fmt(nice(q.typical))}</span><span>too high</span></div>` : ''}
      ${q.avgPts != null ? `<p class="small mut" style="margin:8px 0 0">Average ${Math.round(q.avgPts)} points · ${q.close}% of players were within 10%</p>` : ''}
    </section>`).join('')}
    ${players ? `<h2>Score spread</h2><div class="bars">${buckets.map((b) => `<div class="bar"><span>${b.lo}–${b.lo === 500 ? 600 : b.lo + 99}</span><span class="t"><div style="width:${((100 * b.c) / maxB).toFixed(1)}%"></div></span><span>${b.c}</span></div>`).join('')}</div>` : ''}
    <p class="small mut">Points are how accurate a guess was, as a percent: half the answer or twice the answer both score 50. Sizes are typical averages from publicly available sources, rounded.</p>
    <a class="cta" href="/">Play today's daily <span aria-hidden="true">→</span></a>
    <p class="small">${prev ? `<a href="/archive/${pad3(prev.n)}">← Daily #${pad3(prev.n)}</a> · ` : ''}<a href="/archive">All dailies</a>${next ? ` · <a href="/archive/${pad3(next.n)}">Daily #${pad3(next.n)} →</a>` : ''}</p>`;

  const qa = qs.map((q) => ({ '@type': 'Question', name: question(q.A, q.B), acceptedAnswer: { '@type': 'Answer', text: `About ${fmt(ansOf(q))} ${q.A.plural}: ${the(q.B)} is about ${len(q.B.cm)} ${q.B.dim} and ${the(q.A)} is about ${len(q.A.cm)}.` } }));
  return html(page({
    title: `Daily Banana #${pad3(n)} answers · ${shortDate(d.date)}`,
    description: `Answers for Daily Banana #${pad3(n)} (${shortDate(d.date)}): ${qs.slice(0, 2).map((q) => question(q.A, q.B)).join(' ')} Plus the average score${players ? ` (${fmt(Math.round(S.avg))}/600)` : ''} and where players guessed.`,
    path: `/archive/${pad3(n)}`, body,
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'Article', headline: `Daily Banana #${pad3(n)} answers`, datePublished: new Date(publishedAt(d)).toISOString(), dateModified: new Date(S.frozen ? publishedAt(d) + FREEZE_AFTER : Date.now()).toISOString(),
        author: { '@type': 'Organization', name: 'Smidgen Games LLC' }, publisher: { '@type': 'Organization', name: 'Smidgen Games LLC', url: 'https://playsmidgen.com' }, mainEntityOfPage: `${SITE_URL}/archive/${pad3(n)}`, image: `${SITE_URL}/og.png` },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa },
    ],
  }), 200, { forever: !!S.frozen, n });
};
