// Daily at 12:10 UTC (just after a daily finishes everywhere and its archive page goes up):
// tell IndexNow search engines (Bing, Yandex, Naver, Seznam, Yep) about the new archive page right away.
// Key file: /2f4c0fdcc9a04615b0548d5f3037c5d5.txt at the site root (IndexNow keys are public by design).
import { publishedAt } from './archive.mjs';
import { SITE_URL, pad3 } from '../lib/page.mjs';

export const config = { schedule: '10 12 * * *' };
const KEY = '2f4c0fdcc9a04615b0548d5f3037c5d5';

export async function ping(urls) {
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE_URL).host, key: KEY, keyLocation: `${SITE_URL}/${KEY}.txt`, urlList: urls }),
  });
  return r.status;
}

export default async () => {
  const dailies = await fetch(`${SITE_URL}/data/dailies.json`).then((r) => r.json()).catch(() => []);
  const now = Date.now();
  // pages that went up in the last day (a little extra so a late run still catches them)
  const fresh = dailies.filter((d) => publishedAt(d) <= now && now - publishedAt(d) < 30 * 3600e3).map((d) => `${SITE_URL}/archive/${pad3(d.n)}`);
  if (!fresh.length) return new Response('nothing new');
  const status = await ping([...fresh, `${SITE_URL}/archive`, `${SITE_URL}/sitemap.xml`]);
  console.log('IndexNow', status, fresh.join(' '));
  return new Response(`IndexNow ${status}`);
};
