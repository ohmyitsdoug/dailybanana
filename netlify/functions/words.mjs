// GET /.netlify/functions/words  -> words added after launch that are live in the game
import { db, json } from '../lib/db.mjs';
export default async () => {
  const live = await db().get('live-words', { type: 'json' }).catch(() => null);
  return json(live || [], 200, { 'cache-control': 'public, max-age=300' });
};
