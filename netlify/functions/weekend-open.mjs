// Opens the weekend challenge at midnight Eastern at the start of Saturday. Runs at 04:00 and 05:00 UTC on
// Saturdays (midnight in daylight and standard time) and only acts when it's 12am Saturday in New York.
// The Saturday 10:15am post then points to it. Closes at midnight Pacific on Sunday (see openWeekend).
import { db } from '../lib/db.mjs';
import { etParts, weekendFor, openWeekend, data } from '../lib/social.mjs';

export default async () => {
  const { date, dow, h } = etParts();
  if (dow !== 6 || h !== 0) return new Response('not now');
  const wk = await weekendFor(date);
  if (!wk) return new Response('no weekend unit for ' + date);
  const rec = await openWeekend(db(), wk, await data('items'));
  console.log('weekend open', JSON.stringify(rec));
  return new Response('ok');
};
export const config = { schedule: '0 4,5 * * 6' };
