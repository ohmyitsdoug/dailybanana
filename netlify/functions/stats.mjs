// GET /.netlify/functions/stats?n=12  -> { plays, pct: { word: % of rounds that used it } } for one daily
import { db, json } from '../lib/db.mjs';
export default async (req) => {
  const n = parseInt(new URL(req.url).searchParams.get('n'), 10);
  if (!(n > 0)) return json({ plays: 0, pct: {} });
  const s = await db().get(`stats/${n}`, { type: 'json' }).catch(() => null);
  return json({ plays: s?.plays || 0, pct: s?.pct || {} }, 200, { 'cache-control': 'public, max-age=300' });
};
