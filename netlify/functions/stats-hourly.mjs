// Every hour: rebuild per-daily totals and "% of players" for the last 14 dailies.
import { db, aggregate } from '../lib/db.mjs';
export const config = { schedule: '@hourly' };
export default async () => { const s = await aggregate(db()); return new Response(`updated ${s.length} dailies`); };
