// POST /.netlify/functions/log  (anonymous: a random device ID, no names)
//   { kind:"visit", device, src:{s,m,c} }                     one per device per day; src = where the device first came from
//   { kind:"signin", device, uid }                            someone signed in on this device (first time per device)
//   { kind:"play",  puzzle, score, points:[6], guesses:[6], device }   a finished daily (guesses: null = no guess)
//   { kind:"quick", score, points:[6], chal, device }         a finished quick game (chal: it was a challenge)
//   { kind:"start", mode:"daily"|"quick", puzzle, chal, device }  a game was started (daily: once per device per puzzle)
//   { kind:"share", what:"results"|"challenge", device }      someone copied their results or a challenge link
//   { kind:"backfill", puzzle, score, points, guesses, device } one time: guesses for a daily finished before they were sent
// Netlify Blobs keys: seen/{device} {first day} · visits/{day}/{device} {first} · plays/{puzzle}/{id} · quick/{day}/{id} · shares/{day}/{id}
import { db, cleanDevice, day, getAll } from '../lib/db.mjs';

const pts = (x) => (Array.isArray(x) ? x : []).slice(0, 6).map((v) => Math.max(0, Math.min(100, Math.round(+v || 0))));
const score = (x) => Math.max(0, Math.min(600, Math.round(+x || 0)));
const ms = (x) => { const n = Math.round(+x || 0); return n > 0 && n < 6 * 60e3 ? n : null; };
const tag = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9_.\-]/g, '').slice(0, 40);
const cleanSrc = (x) => (x && typeof x === 'object' && tag(x.s) ? { s: tag(x.s), m: tag(x.m), c: tag(x.c) } : null);
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default async (req) => {
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
    await store.setJSON(`visits/${today}/${device}`, { first: seen.first });
    return new Response('ok');
  }
  if (b.kind === 'play') {
    const puzzle = Number.isInteger(b.puzzle) && b.puzzle >= 0 && b.puzzle < 10000 ? b.puzzle : null;
    if (puzzle === null) return new Response('skip');
    const guesses = (Array.isArray(b.guesses) ? b.guesses : []).slice(0, 6).map((g) => (Number.isFinite(+g) && +g > 0 && +g < 1e9 && g !== null ? +g : null));
    await store.setJSON(`plays/${puzzle}/${id()}`, { score: score(b.score), points: pts(b.points), guesses, ms: ms(b.ms), device, day: today });
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
  return new Response('unknown kind', { status: 400 });
};
