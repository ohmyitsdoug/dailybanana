// Runs every hour at :15 and posts whatever is due (see ../lib/social.mjs for the weekly plan).
// While social/config.live is false (practice), posts are made and shown in the admin Social screen only.
import { db } from '../lib/db.mjs';
import { run } from '../lib/social.mjs';

export default async () => {
  const out = await run(db()).catch((e) => ({ error: String(e.stack || e) }));
  console.log(JSON.stringify(out));
  return new Response('ok');
};
export const config = { schedule: '15 * * * *' };
