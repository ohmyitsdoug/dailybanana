// Admin only: the social auto-poster's queue and switch.
//   GET                                   { live, posts:[…recent, with image URLs], next }
//   POST { action:'live', on }            turn real posting on or off (off = practice)
//   POST { action:'preview', kind }       make one post of that kind now, saved as a practice post (never published)
//   POST { action:'publish', id }         publish one saved post right now
import { db, json } from '../lib/db.mjs';
import { userFor, isAdminUser } from '../lib/auth.mjs';
import { build, save, recent, publish, config, imgUrl, etParts, PLAN } from '../lib/social.mjs';

const KINDS = ['mon', 'tue', 'wed', 'thu_story', 'thu', 'fri', 'sat', 'sun_story', 'sun', 'milestone'];
const view = (r) => ({ ...r, images: r.images.map(imgUrl), story: r.story.map(imgUrl) });

export default async (req) => {
  const store = db();
  if (!isAdminUser(await userFor(req, store))) return json({ error: 'not the admin account' }, 401);
  if (req.method === 'GET') {
    const posts = (await recent(store, 30)).map(view), cfg = await config(store);
    return json({ live: !!cfg.live, posts, plan: PLAN, now: etParts() });
  }
  let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (b.action === 'live') { await store.setJSON('social/config', { live: !!b.on, changed: Date.now() }); return json({ live: !!b.on }); }
  if (b.action === 'preview') {
    if (!KINDS.includes(b.kind)) return json({ error: 'unknown kind' }, 400);
    const post = await build(b.kind, store, { preview: true });
    if (!post) return json({ error: 'Nothing to make for that one right now (not enough data yet).' });
    return json({ post: view(await save(store, post, { date: etParts().date, status: 'preview' })) });
  }
  if (b.action === 'publish') {
    const rec = await store.get(`social/posts/${String(b.id || '').replace(/[^a-z0-9]/g, '')}`, { type: 'json' }).catch(() => null);
    if (!rec) return json({ error: 'not found' }, 404);
    if (rec.status === 'posted') return json({ error: 'Already posted.' }, 409);
    return json({ post: view(await publish(store, rec)) });
  }
  return json({ error: 'unknown action' }, 400);
};
