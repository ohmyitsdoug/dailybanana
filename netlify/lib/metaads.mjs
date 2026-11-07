// Meta ad spend, read-only (Marketing API, ads_read). Needs META_ADS_TOKEN (a system user token) in Netlify's environment;
// META_AD_ACCOUNT_ID is optional (defaults to Daily Banana's ad account). Kept for 3 hours in meta/ads so the
// dashboard doesn't ask Meta on every view. Returns { connected, at, campaigns:[{ id, name, status, from, to, spend, impressions, clicks }], error }
const V = 'v21.0', KEEP = 3 * 3600e3;
// only campaigns with "Daily Banana" in their name are shown (the ad account also runs Smidgen Games ads)
const ET = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

async function graph(path, token, tries = 2) {
  let r;
  try {
    r = await fetch(`https://graph.facebook.com/${V}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15e3) });
  } catch (e) {
    if (tries > 1) { await new Promise((ok) => setTimeout(ok, 800)); return graph(path, token, tries - 1); }   // one retry, after a moment
    const c = e.cause || {};   // "fetch failed" hides the real reason here
    throw new Error(`couldn't reach Meta: ${[c.code, c.message || e.message].filter(Boolean).join(' ')}`);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((j.error && j.error.message) || `Meta answered ${r.status}`);
  return j.data || [];
}

export async function metaAds(store, { fresh = false } = {}) {
  const token = String(process.env.META_ADS_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  if (!token) return { connected: false };
  // just the account number, even if a full Ads Manager link or "act_…" was pasted
  const raw = String(process.env.META_AD_ACCOUNT_ID || '');
  const DEFAULT = '607646691723139';   // Daily Banana's ad account (Smidgen Games)
  let act = 'act_' + ((raw.match(/act[_=]?(\d{6,})/) || raw.match(/(\d{6,})/) || [])[1] || DEFAULT);
  // a META_AD_ACCOUNT_ID this token can't read falls back to the Daily Banana account
  if (act !== 'act_' + DEFAULT) { try { await graph(`${act}?fields=id`, token, 1); } catch (e) { if (/\(#200\)|permission/i.test(e.message)) act = 'act_' + DEFAULT; } }
  const kept = await store.get('meta/ads', { type: 'json' }).catch(() => null);
  if (kept && !fresh && Date.now() - kept.at < (kept.error ? 15 * 60e3 : KEEP)) return kept;   // a failure is remembered for 15 minutes, so it can't slow every view
  try {
    const camps = await graph(`${act}/campaigns?fields=id,name,effective_status,start_time,stop_time&limit=100`, token);
    const ins = await graph(`${act}/insights?level=campaign&date_preset=maximum&fields=campaign_id,spend,impressions,clicks&limit=200`, token);
    const byId = new Map(ins.map((x) => [x.campaign_id, x]));
    const campaigns = camps.map((c) => {
      const i = byId.get(c.id) || {};
      return { id: c.id, name: c.name, status: c.effective_status, from: c.start_time ? ET(Date.parse(c.start_time)) : null, to: c.stop_time ? ET(Date.parse(c.stop_time)) : null,
        spend: Math.round(100 * (+i.spend || 0)) / 100, impressions: +i.impressions || 0, clicks: +i.clicks || 0 };
    }).filter((c) => /daily\s*banana/i.test(c.name || ''));   // the ad account is shared with Smidgen: only Daily Banana campaigns
    const out = { connected: true, at: Date.now(), campaigns };
    await store.setJSON('meta/ads', out).catch(() => {});
    return out;
  } catch (e) {
    // say which account was asked for and what the token can do, so a mismatch is easy to spot
    try {
      const perms = await graph('me/permissions', token, 1);
      const ok = perms.filter((p) => p.status === 'granted').map((p) => p.permission);
      e.message += ` · asked for ${act}${raw ? ' (from META_AD_ACCOUNT_ID)' : ''} · this token has: ${ok.length ? ok.join(', ') : 'no permissions'}`;
    } catch (e2) { e.message += ` · asked for ${act}${raw ? ' (from META_AD_ACCOUNT_ID)' : ''}`; }
    console.error(`meta ads: ${e.message}`);
    // keep showing the last good numbers, with the error
    const out = kept ? { ...kept, at: Date.now(), error: e.message } : { connected: true, at: Date.now(), campaigns: [], error: e.message };
    await store.setJSON('meta/ads', out).catch(() => {});
    return out;
  }
}
