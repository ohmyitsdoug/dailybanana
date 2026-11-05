// The public pages' shared look (archive pages are rendered on the server so search engines and AI tools can read them).
export const SITE_URL = 'https://dailybanana.io';
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmt = (n) => Number(n).toLocaleString('en-US');
export const SCORE_V2 = '2026-11-05';
export const shownAns = (n) => (n < 100 ? Math.round(n * 10) / 10 : Math.round(n));   // Nov 5: tenths under 100, whole numbers from 100
export const SCORE_V3 = '2026-11-05';
export const roundAns = (n) => (n<10?Math.round(n*10)/10:n<100?Math.round(n):n<1000?Math.round(n/10)*10:n<10000?Math.round(n/50)*50:Math.round(n/500)*500);   // from Nov 5 (v1.1)
export function nice(n) { if (n < 10) return Math.round(n * 10) / 10; const p = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; }
export function len(cm) {
  const m = cm >= 100000 ? `${fmt(nice(cm / 100000))} km` : cm >= 100 ? `${fmt(nice(cm / 100))} m` : `${nice(cm)} cm`;
  const ft = cm / 30.48, i = cm >= 30.48 * 5280 ? `${fmt(nice(ft / 5280))} mi` : ft >= 3 ? `${fmt(nice(ft))} ft` : `${nice(cm / 2.54)} in`;
  return `${m} (${i})`;
}
export const fmtDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const shortDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const pad3 = (n) => String(n).padStart(3, '0');

const CSS = `
:root{--bg:#FFF0A0;--ink:#3B2412;--mut:#6B4F30;--card:#FFFAE0;--line:#E6D38A;--acc:#FFD43B;--accsh:#B97E00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#2A1A0E;--ink:#FFF3C9;--mut:#CDB68C;--card:#382415;--line:#4E3622;--accsh:#FFD43B}}
:root[data-theme="dark"]{--bg:#2A1A0E;--ink:#FFF3C9;--mut:#CDB68C;--card:#382415;--line:#4E3622;--accsh:#FFD43B}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Space Grotesk",system-ui,sans-serif;line-height:1.5}
main{max-width:760px;margin:0 auto;padding:20px 16px 48px}
a{color:inherit}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:2px solid var(--ink);padding-bottom:12px;font-weight:700}
.logo{display:flex;align-items:center;gap:8px;font-size:19px;text-decoration:none}
.top nav{display:flex;gap:14px;font-size:14px;font-weight:500}
h1{font-size:40px;letter-spacing:-1.5px;line-height:1.05;margin:26px 0 6px}
h2{font-size:24px;margin:34px 0 10px;letter-spacing:-.5px}
h3{font-size:17px;margin:0}
.eyebrow{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--mut)}
.lead{font-size:18px;margin:0 0 6px}
.mut{color:var(--mut)} .small{font-size:13px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:18px 0}
.stat{border:2px solid var(--ink);background:var(--card);padding:10px 12px;display:flex;flex-direction:column}
.stat b{font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums}
.stat span{font-size:13px;color:var(--mut)}
.stat.big{box-shadow:4px 4px 0 var(--accsh)}
.round{border-bottom:1px solid var(--line);padding:16px 0}
.round .q{font-size:19px;font-weight:700;line-height:1.25}
.round .a{margin:4px 0 0}
.mini{display:block;position:relative;height:6px;margin:18px 6px 10px;background:var(--line)}
.mini .c{position:absolute;left:50%;top:-6px;bottom:-6px;width:2px;margin-left:-1px;background:var(--accsh)}
.mini .avg{position:absolute;top:50%;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;background:var(--acc);border:2px solid var(--ink);transform:rotate(45deg)}
.ends{display:flex;justify-content:space-between;font-size:12px;color:var(--mut)}
.legend{font-size:12px;color:var(--mut);display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.legend i{display:inline-block;vertical-align:middle;margin-right:5px}
.bars{display:flex;flex-direction:column;gap:4px;margin:8px 0}
.bar{display:grid;grid-template-columns:70px 1fr 44px;gap:8px;align-items:center;font-size:13px;font-variant-numeric:tabular-nums}
.bar .t{height:14px;background:var(--card);border:2px solid var(--ink)}
.bar .t div{height:100%;background:var(--acc)}
.cta{display:inline-flex;align-items:center;gap:10px;height:56px;padding:0 22px;background:var(--ink);color:var(--bg);font-weight:700;font-size:17px;text-decoration:none;box-shadow:4px 4px 0 var(--accsh);margin:12px 0}
.list{border-top:2px solid var(--ink)}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px 2px;border-bottom:1px solid var(--line);text-decoration:none}
.row b{font-size:17px}
.faq details{border-bottom:1px solid var(--line);padding:12px 0}
.faq summary{font-weight:700;font-size:17px;cursor:pointer}
.faq p{margin:8px 0 0}
footer{margin-top:44px;font-size:13px;color:var(--mut);display:flex;flex-direction:column;gap:4px}
`;
export const BANANA_SVG = (px = 24) => `<img src="/banana.svg" width="${px}" height="${px}" alt="">`;

export function page({ title, description, path, body, jsonld = [] }) {
  const url = SITE_URL + path;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-96.png" sizes="96x96" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="article"><meta property="og:site_name" content="Daily Banana">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${SITE_URL}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
<script>try{const t=JSON.parse(localStorage.getItem('snug:theme'));if(t)document.documentElement.dataset.theme=t}catch(_){}</script>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head><body><main>
<div class="top"><a class="logo" href="/">${BANANA_SVG(24)}dailybanana.io</a><nav><a href="/archive">Archive</a><a href="/about">About</a><a href="/faq">FAQ</a></nav></div>
${body}
<footer><span>© 2026 · Powered by <a href="https://playsmidgen.com/?utm_source=dailybanana&utm_medium=game&utm_campaign=footer">Smidgen Games</a></span><span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span></footer>
</main></body></html>`;
}
