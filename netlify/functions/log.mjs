// POST /.netlify/functions/log  (anonymous; nobody needs an account)
// { kind: "visit", device }
// { kind: "miss", word, puzzle, lo, hi, device }   an unknown word typed into the gap lo..hi, once per player per day
// { kind: "play", puzzle, words, score, reached, steps, device }     a finished daily
import { db, clean, cleanDevice, day } from '../lib/db.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  let b;
  try { b = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  const store = db(), today = day(), device = cleanDevice(b.device);
  if (!device) return new Response('skip');
  const puzzle = Number.isInteger(b.puzzle) && b.puzzle > 0 && b.puzzle < 10000 ? b.puzzle : null;

  if (b.kind === 'visit') {
    await store.set(`visits/${today}/${device}`, '1');
    return new Response('ok');
  }
  if (b.kind === 'miss') {
    const word = clean(b.word);
    if (word.length < 3) return new Response('skip');
    // v0.2: the word was typed into the gap between the day's two ends, so it's somewhere between lo and hi
    const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 100 ? n : null; };
    await store.setJSON(`misses/${today}/${word}/${device}`, { lo: num(b.lo), hi: num(b.hi), puzzle });
    return new Response('ok');
  }
  if (b.kind === 'play' && puzzle) {
    const words = (Array.isArray(b.words) ? b.words : []).slice(0, 60).map(clean).filter(Boolean);
    const seen = await store.get(`players/${device}`, { type: 'json' }).catch(() => null);
    if (!seen) await store.setJSON(`players/${device}`, { first: today });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await store.setJSON(`plays/${puzzle}/${id}`, {
      words, score: Math.max(0, Math.min(100000, Math.round(+b.score || 0))), reached: !!b.reached,
      steps: words.length, device, day: today, returning: !!(seen && seen.first < today),
    });
    return new Response('ok');
  }
  return new Response('unknown kind', { status: 400 });
};
