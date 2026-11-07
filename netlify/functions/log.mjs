// POST /.netlify/functions/log  (anonymous: a random device ID, no names)
//   { kind:"visit", device, src:{s,m,c} }                     one per device per day; src = where the device first came from
//   { kind:"signin", device, uid }                            someone signed in on this device (first time per device)
//   { kind:"play",  puzzle, score, points:[6], guesses:[6], device }   a finished daily (guesses: null = no guess)
//   { kind:"quick", score, points:[6], chal, device }         a finished quick game (chal: it was a challenge)
//   { kind:"start", mode:"daily"|"quick", puzzle, chal, device }  a game was started (daily: once per device per puzzle)
//   { kind:"share", what:"results"|"challenge", device }      someone copied their results or a challenge link
//   { kind:"kofi", device }                                   tapped Buy me a banana (one per device per day)
//   { kind:"visit", …, tz, lang, dev, app }                  also: time zone, language, phone/tablet/desktop, installed app (country comes from Netlify)
//   { kind:"time", device, secs, sid, use:{daily,quick,other}, h }   seconds actively in the game since the last report
//   { kind:"backfill", puzzle, score, points, guesses, device } one time: guesses for a daily finished before they were sent
// Netlify Blobs keys: ab/{day}/{id} {test,v,ev,mode} · seen/{device} {first day} · visits/{day}/{device} {first} · plays/{puzzle}/{id} · quick/{day}/{id} · shares/{day}/{id}
import { db, cleanDevice, day, getAll } from '../lib/db.mjs';

const pts = (x) => (Array.isArray(x) ? x : []).slice(0, 6).map((v) => Math.max(0, Math.min(100, Math.round(+v || 0))));
const score = (x) => Math.max(0, Math.min(600, Math.round(+x || 0)));
const ms = (x) => { const n = Math.round(+x || 0); return n > 0 && n < 6 * 60e3 ? n : null; };
const tag = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9_.\-]/g, '').slice(0, 40);
const cleanSrc = (x) => (x && typeof x === 'object' && tag(x.s) ? { s: tag(x.s), m: tag(x.m), c: tag(x.c) } : null);
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default async (req, context) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  let b;
  try { b = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  const store = db(), today = day(), device = cleanDevice(b.device);
  if (!device) return new Response('skip');

  if (b.kind === 'visit') {
    let seen = await store.get(`seen/${device}`, { type: 'json' }).catch(() => null);
    const src = cleanSrc(b.src);
    if (!seen) { seen = { first: today, ...(src ? { src } : {}) }; await store.setJSON(`seen/${device}`, seen); }
    else if (!seen.src && src && seen.first === today) { seen.src = src; await store.setJSON(`seen/${device}`, seen); }
    // country (2 letters) from Netlify's edge, never the IP; the rest comes from the browser's own settings
    const cc = String((context && context.geo && context.geo.country && context.geo.country.code) || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    const tz = String(b.tz || '').replace(/[^A-Za-z0-9_/+\-]/g, '').slice(0, 40), lang = String(b.lang || '').replace(/[^A-Za-z-]/g, '').slice(0, 10);
    const dev = ['phone', 'tablet', 'desktop'].includes(b.dev) ? b.dev : '';
    await store.setJSON(`visits/${today}/${device}`, { first: seen.first, ...(cc ? { cc } : {}), ...(tz ? { tz } : {}), ...(lang ? { lang } : {}), ...(dev ? { dev } : {}), ...(b.app ? { app: true } : {}) });
    return new Response('ok');
  }
  if (b.kind === 'play') {
    const puzzle = Number.isInteger(b.puzzle) && b.puzzle >= 0 && b.puzzle < 10000 ? b.puzzle : null;
    if (puzzle === null) return new Response('skip');
    const guesses = (Array.isArray(b.guesses) ? b.guesses : []).slice(0, 6).map((g) => (Number.isFinite(+g) && +g > 0 && +g < 1e9 && g !== null ? +g : null));
    const h = Number.isInteger(b.h) && b.h >= 0 && b.h < 24 ? b.h : null;   // the player's local hour when they finished
    await store.setJSON(`plays/${puzzle}/${id()}`, { score: score(b.score), points: pts(b.points), guesses, ms: ms(b.ms), device, day: today, ...(h !== null ? { h } : {}) });
    return new Response('ok');
  }
  if (b.kind === 'backfill') {
    // one time: a daily finished before guesses were sent. Add them to that device's play (or record it if it never arrived).
    const puzzle = Number.isInteger(b.puzzle) && b.puzzle >= 0 && b.puzzle < 10000 ? b.puzzle : null;
    if (puzzle === null) return new Response('skip');
    const guesses = (Array.isArray(b.guesses) ? b.guesses : []).slice(0, 6).map((g) => (g !== null && Number.isFinite(+g) && +g > 0 && +g < 1e9 ? +g : null));
    const mine = (await getAll(store, `plays/${puzzle}/`)).filter((p) => p.device === device);
    if (mine.some((p) => Array.isArray(p.guesses) && p.guesses.length)) return new Response('already');
    if (mine.length) {
      const { key, ...p } = mine[0];
      await store.setJSON(key, { ...p, guesses, points: Array.isArray(p.points) && p.points.length === 6 ? p.points : pts(b.points), score: p.score ?? score(b.score) });
    } else {
      await store.setJSON(`plays/${puzzle}/${id()}`, { score: score(b.score), points: pts(b.points), guesses, device, day: today });
    }
    await store.delete(`stats-live/${puzzle}`).catch(() => {});   // so the next results view uses it
    return new Response('ok');
  }
  if (b.kind === 'ab') {   // the results-layout A/B test: a results view or a button tap, with the version the device sees
    const EV = ['view', 'copy', 'share', 'again', 'weekend', 'kofi'];
    if (!['A', 'B'].includes(b.v) || !EV.includes(b.ev)) return new Response('skip');
    const test = String(b.test || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 20), mode = ['daily', 'quick', 'chal'].includes(b.mode) ? b.mode : null;
    await store.setJSON(`ab/${today}/${id()}`, { test, v: b.v, ev: b.ev, ...(mode ? { mode } : {}), device });
    return new Response('ok');
  }
  if (b.kind === 'quick') {
    await store.setJSON(`quick/${today}/${id()}`, { score: score(b.score), points: pts(b.points), chal: !!b.chal, ms: ms(b.ms), device });
    return new Response('ok');
  }
  if (b.kind === 'start') {
    // a game was started: one per device per daily, every quick game
    if (b.mode === 'daily') {
      const puzzle = Number.isInteger(b.puzzle) && b.puzzle >= 0 && b.puzzle < 10000 ? b.puzzle : null;
      if (puzzle === null) return new Response('skip');
      if (!(await store.get(`starts/daily/${puzzle}/${device}`).catch(() => null))) await store.setJSON(`starts/daily/${puzzle}/${device}`, { day: today });
    } else await store.setJSON(`starts/quick/${today}/${id()}`, { device, chal: !!b.chal });
    return new Response('ok');
  }
  if (b.kind === 'signin') {
    if (!(await store.get(`signins/${device}`).catch(() => null))) await store.setJSON(`signins/${device}`, { day: today, uid: String(b.uid || '').slice(0, 40) });
    return new Response('ok');
  }
  if (b.kind === 'share') {
    await store.setJSON(`shares/${today}/${id()}`, { what: b.what === 'challenge' ? 'challenge' : 'results', device });
    return new Response('ok');
  }
  if (b.kind === 'time') {
    // one record per device per day: total active seconds, how many separate visits, and what they did
    const secs = Math.max(0, Math.min(3600, Math.round(+b.secs || 0)));
    if (!secs) return new Response('skip');
    const k = `time/${today}/${device}`, r = (await store.get(k, { type: 'json' }).catch(() => null)) || { secs: 0, sids: [], daily: false, quick: false, other: false };
    const sid = String(b.sid || '').replace(/[^a-z0-9]/g, '').slice(0, 12), u = b.use || {};
    r.secs = Math.min(6 * 3600, r.secs + secs);
    if (sid && !r.sids.includes(sid) && r.sids.length < 50) r.sids.push(sid);
    r.daily = r.daily || !!u.daily; r.quick = r.quick || !!u.quick; r.other = r.other || !!u.other;
    await store.setJSON(k, r);
    return new Response('ok');
  }
  if (b.kind === 'feedback') {
    // Menu → Have feedback?: shown in the admin dashboard. At most 5 a day per device.
    const message = String(b.message || '').replace(/\r/g, '').trim().slice(0, 2000);
    if (!message) return new Response('skip', { status: 400 });
    const mine = (await store.list({ prefix: `feedback/${today}/` }).catch(() => ({ blobs: [] }))).blobs.filter((x) => x.key.endsWith(`-${device}`));
    if (mine.length >= 5) return new Response('too many', { status: 429 });
    const name = String(b.name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
    await store.setJSON(`feedback/${today}/${Date.now()}-${device}`, { name, message, at: Date.now(), ...(b.uid ? { uid: String(b.uid).slice(0, 40) } : {}) });
    return new Response('ok');
  }
  if (b.kind === 'rating') {
    // one rating per device (a later one replaces it); skipped = they tapped Not now
    if (b.skipped) { if (!(await store.get(`ratings/${device}`).catch(() => null))) await store.setJSON(`ratings/${device}`, { skipped: true, day: today }); return new Response('ok'); }
    const stars = Math.round(+b.stars);
    if (!(stars >= 1 && stars <= 5)) return new Response('skip');
    const comment = String(b.comment || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 500);
    await store.setJSON(`ratings/${device}`, { stars, ...(comment ? { comment } : {}), day: today, at: Date.now() });
    return new Response('ok');
  }
  if (b.kind === 'install') {
    // someone answered the browser's "Install app" prompt from the Menu
    await store.setJSON(`installs/${today}/${device}`, { outcome: b.outcome === 'accepted' ? 'accepted' : 'dismissed' });
    return new Response('ok');
  }
  if (b.kind === 'kofi') {
    await store.setJSON(`kofi/${today}/${device}`, { at: Date.now() });
    return new Response('ok');
  }
  return new Response('unknown kind', { status: 400 });
};
