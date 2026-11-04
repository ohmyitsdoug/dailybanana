// Serves the social post images (/social-img/ID.jpg) so Instagram and Facebook can fetch them.
import { db } from '../lib/db.mjs';

export default async (req) => {
  const id = new URL(req.url).pathname.split('/').pop().replace(/\.jpg$/, '').replace(/[^a-z0-9]/g, '');
  const b = id ? await db().get(`social/img/${id}`, { type: 'arrayBuffer' }).catch(() => null) : null;
  if (!b) return new Response('not found', { status: 404 });
  return new Response(b, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
};
export const config = { path: '/social-img/*' };
