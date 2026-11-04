// POST /.netlify/functions/log  (anonymous: a random device ID, no names)
//   { kind:"visit", device }                                  one per device per day
//   { kind:"play",  puzzle, score, points:[6], guesses:[6], device }   a finished daily (guesses: null = no guess)
//   { kind:"quick", score, points:[6], chal, device }         a finished quick game (chal: it was a challenge)
//   { kind:"share", what:"results"|"challenge", device }      someone copied their results or a challenge link
// Netlify Blobs keys: seen/{device} {first day} · visits/{day}/{device} {first} · plays/{puzzle}/{id} · quick/{day}/{id} · shares/{day}/{id}
import { db, cleanDevice, day } from '../lib/db.mjs';

const pts = (x) => (Array.isArray(x) ? x : []).slice(0, 6).map((v) => Math.max(0, Math.min(100, Math.round(+v || 0))));
const score = (x) => Math.max(0, Math.min(600, Math.round(+x || 0)));
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  let b;
  try { b = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  const store = db(), today = day(), device = cleanDevice(b.device);
  if (!device) return new Response('skip');

  if (b.kind === 'visit') {
    let seen = await store.get(`seen/${device}`, { type: 'json' }).catch(() => null);
    if (!seen) { seen = { first: today }; await store.setJSON(`seen/${device}`, seen); }
    await store.setJSON(`visits/${today}/${device}`, { first: seen.first });
    return new Response('ok');
  }
  if (b.kind === 'play') {
    const puzzle = Number.isInteger(b.puzzle) && b.puzzle >= 0 && b.puzzle < 10000 ? b.puzzle : null;
    if (puzzle === null) return new Response('skip');
    const guesses = (Array.isArray(b.guesses) ? b.guesses : []).slice(0, 6).map((g) => (Number.isFinite(+g) && +g > 0 && +g < 1e9 && g !== null ? +g : null));
    await store.setJSON(`plays/${puzzle}/${id()}`, { score: score(b.score), points: pts(b.points), guesses, device, day: today });
    return new Response('ok');
  }
  if (b.kind === 'quick') {
    await store.setJSON(`quick/${today}/${id()}`, { score: score(b.score), points: pts(b.points), chal: !!b.chal, device });
    return new Response('ok');
  }
  if (b.kind === 'share') {
    await store.setJSON(`shares/${today}/${id()}`, { what: b.what === 'challenge' ? 'challenge' : 'results', device });
    return new Response('ok');
  }
  return new Response('unknown kind', { status: 400 });
};
