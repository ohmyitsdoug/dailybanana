// /sitemap.xml: the game, the about/FAQ pages and every published archive page (for search engines).
import { publishedAt } from './archive.mjs';
import { SITE_URL, pad3 } from '../lib/page.mjs';

export const config = { path: '/sitemap.xml' };

export default async (req) => {
  const origin = new URL(req.url).origin;
  const dailies = await fetch(`${origin}/data/dailies.json`).then((r) => r.json()).catch(() => []);
  const now = Date.now();
  const urls = [
    { loc: '/', freq: 'daily' }, { loc: '/archive', freq: 'daily' }, { loc: '/about', freq: 'monthly' }, { loc: '/faq', freq: 'monthly' }, { loc: '/privacy', freq: 'yearly' },
    ...dailies.filter((d) => publishedAt(d) <= now).map((d) => ({ loc: `/archive/${pad3(d.n)}`, freq: 'weekly', mod: new Date(publishedAt(d)).toISOString().slice(0, 10) })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE_URL}${u.loc}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ''}<changefreq>${u.freq}</changefreq></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
