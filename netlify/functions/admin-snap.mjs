// Works out the admin dashboard's numbers for each preset range (today, 7 days, 30 days, all time) every 15 minutes
// and saves them as snap/{range}, so opening the dashboard reads one ready copy instead of every record.
// Each record is listed once per run and reused for all four ranges. Refresh on the dashboard still works them out live.
import { db } from '../lib/db.mjs';
import { report, presets, saveSnap } from './admin.mjs';

export default async () => {
  const store = db(), t0 = Date.now();
  for (const [p, [from, to]] of Object.entries(presets())) {
    try { await saveSnap(store, p, await report(store, { from, to, reuse: 5 * 60e3 })); }
    catch (e) { console.log('admin snap failed', p, e && e.message); }
  }
  console.log('admin snaps', Date.now() - t0, 'ms');
  return new Response('ok');
};
export const config = { schedule: '*/15 * * * *' };
