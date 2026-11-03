// Quick-play challenges: share the exact same 6 questions with friends for 24 hours.
//   GET  ?code=ABC123&device=…      the challenge and its scoreboard
//   GET  ?host=device               the open challenge this device started, if any
//   POST {action:'create', device, name, rounds, score, marks, playedAt}   within 1 hour of finishing a quick game
//   POST {action:'play',   code, device, name, score, marks}               once per device, while it's open
//   POST {action:'close',  code, device}                                  the person who started it can close it early
// Stored in Netlify Blobs (store "matryo"):
//   challenges/{code}           { code, rounds, creator, host, created, closes, closed }
//   entries/{code}/{device}     { name, score, marks, at }
//   hosting/{device}            { code, closes }   one open challenge per person
import { db, json, cleanDevice, getAll } from '../lib/db.mjs';

const HOUR = 3600e3, OPEN_FOR = 24 * HOUR, MAKE_WITHIN = HOUR, ROUNDS = 6, MAX = ROUNDS * 100;
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const cleanName = (s) => String(s || '').replace(/[<>"&]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Someone';
const cleanScore = (n) => Math.max(0, Math.min(MAX, Math.round(+n || 0)));
const cleanMarks = (s) => [...String(s || '')].slice(0, ROUNDS).join('');
const isOpen = (c, now = Date.now()) => c && !c.closed && c.closes > now;

async function view(store, code, device) {
  const c = await store.get(`challenges/${code}`, { type: 'json' }).catch(() => null);
  if (!c) return null;
  const entries = (await getAll(store, `entries/${code}/`))
    .map((e) => ({ name: e.name, score: e.score, marks: e.marks, at: e.at, you: e.key.endsWith('/' + device) }))
    .sort((a, b) => b.score - a.score || a.at - b.at);
  return { code, host: c.host, rounds: c.rounds, created: c.created, closes: c.closes, open: isOpen(c), closed: !!c.closed, mine: !!device && c.creator === device, entries };
}

export default async (req) => {
  const store = db(), now = Date.now();
  if (req.method === 'GET') {
    const u = new URL(req.url);
    const host = cleanDevice(u.searchParams.get('host'));
    if (host) {
      const h = await store.get(`hosting/${host}`, { type: 'json' }).catch(() => null);
      const c = h && (await store.get(`challenges/${h.code}`, { type: 'json' }).catch(() => null));
      return json(isOpen(c, now) ? { code: c.code, closes: c.closes } : {});
    }
    const v = await view(store, cleanCode(u.searchParams.get('code')), cleanDevice(u.searchParams.get('device')));
    return v ? json(v) : json({ error: 'not found' }, 404);
  }
  if (req.method !== 'POST') return new Response('GET or POST', { status: 405 });
  let b;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const device = cleanDevice(b.device);
  if (!device) return json({ error: 'no device' }, 400);

  if (b.action === 'create') {
    const played = +b.playedAt || 0;
    if (!(played > now - MAKE_WITHIN - 60e3 && played < now + 60e3)) return json({ error: 'Challenge links can only be made within an hour of finishing a quick game.' }, 400);
    const rounds = Array.isArray(b.rounds) ? b.rounds.slice(0, ROUNDS).map((r) => ({ a: String(r && r.a || '').slice(0, 60), b: String(r && r.b || '').slice(0, 60) })) : [];
    if (rounds.length !== ROUNDS || rounds.some((r) => !r.a || !r.b)) return json({ error: 'bad rounds' }, 400);
    const h = await store.get(`hosting/${device}`, { type: 'json' }).catch(() => null);
    const old = h && (await store.get(`challenges/${h.code}`, { type: 'json' }).catch(() => null));
    if (isOpen(old, now)) return json({ error: 'You already have an open challenge.', code: old.code, closes: old.closes }, 409);
    let code = newCode();
    for (let i = 0; i < 5 && (await store.get(`challenges/${code}`).catch(() => null)); i++) code = newCode();
    const name = cleanName(b.name);
    const c = { code, rounds, creator: device, host: name, created: now, closes: now + OPEN_FOR, closed: false };
    await store.setJSON(`challenges/${code}`, c);
    await store.setJSON(`entries/${code}/${device}`, { name, score: cleanScore(b.score), marks: cleanMarks(b.marks), at: now });
    await store.setJSON(`hosting/${device}`, { code, closes: c.closes });
    return json(await view(store, code, device));
  }

  const code = cleanCode(b.code);
  const c = await store.get(`challenges/${code}`, { type: 'json' }).catch(() => null);
  if (!c) return json({ error: 'not found' }, 404);

  if (b.action === 'play') {
    if (!isOpen(c, now)) return json({ error: 'This challenge is closed.', ...(await view(store, code, device)) }, 409);
    const have = await store.get(`entries/${code}/${device}`).catch(() => null);
    if (!have) await store.setJSON(`entries/${code}/${device}`, { name: cleanName(b.name), score: cleanScore(b.score), marks: cleanMarks(b.marks), at: now });
    return json(await view(store, code, device));
  }
  if (b.action === 'close') {
    if (c.creator !== device) return json({ error: 'Only the person who started it can close it.' }, 403);
    c.closed = true; c.closes = Math.min(c.closes, now);
    await store.setJSON(`challenges/${code}`, c);
    await store.delete(`hosting/${device}`).catch(() => {});
    return json(await view(store, code, device));
  }
  return json({ error: 'unknown action' }, 400);
};
