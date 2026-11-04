// The page a shared challenge link points at (/c/CODE). Message apps and social sites read its preview tags,
// so the link says it's a challenge (who sent it, the score to beat); people are sent straight on to the game.
import { db } from '../lib/db.mjs';
import { esc, fmt, SITE_URL } from '../lib/page.mjs';

const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

export default async (req) => {
  const code = cleanCode(new URL(req.url).pathname.split('/')[2]);
  const store = db();
  const c = code ? await store.get(`challenges/${code}`, { type: 'json' }).catch(() => null) : null;
  const game = `${SITE_URL}/${c ? `?c=${code}` : ''}`;
  let title = 'You’ve been challenged! · Daily Banana', desc = 'Play the same 6 questions as your friend and try to beat their score.';
  if (c) {
    const mine = await store.get(`entries/${code}/${c.creator}`, { type: 'json' }).catch(() => null);
    const open = !c.closed && c.closes > Date.now();
    title = c.weekend ? `Weekend challenge: ${c.weekend.tagline} · Daily Banana` : `${c.host || 'A friend'} challenged you! · Daily Banana`;
    desc = c.weekend ? (open ? `6 questions, all measured in ${c.weekend.unit.plural}. Open for 24 hours, one try.` : 'This weekend challenge has ended. See the scoreboard, then play today’s daily.') : open
      ? `Can you beat ${mine ? fmt(mine.score) : 'their score'}? Same 6 questions, open for 24 hours.`
      : `This challenge has ended. See the scoreboard, then play today’s daily.`;
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Daily Banana">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE_URL}/c/${esc(code)}">
<meta property="og:image" content="${SITE_URL}/og-challenge.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="You've been challenged on Daily Banana">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE_URL}/og-challenge.png">
<meta http-equiv="refresh" content="0;url=${esc(game)}">
<link rel="canonical" href="${esc(game)}">
<style>body{margin:0;background:#2A1A0E;color:#FFF3C9;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}</style>
</head><body><p><a href="${esc(game)}" style="color:#FFD43B">Open the challenge</a></p>
<script>location.replace(${JSON.stringify(game)})</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
};

export const config = { path: '/c/*' };
