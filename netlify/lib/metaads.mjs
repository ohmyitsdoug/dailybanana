// Meta ad spend, read-only (Marketing API, ads_read). Needs META_ADS_TOKEN (a system user token) in Netlify's environment;
// META_AD_ACCOUNT_ID is optional (defaults to Daily Banana's ad account). Kept for 3 hours in meta/ads so the
// dashboard doesn't ask Meta on every view. Returns { connected, at, campaigns:[{ id, name, status, from, to, spend, impressions, clicks }], error }
const V = 'v21.0', KEEP = 3 * 3600e3;
const ET = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

async function graph(path, token) {
  const r = await fetch(`https://graph.facebook.com/${V}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((j.error && j.error.message) || `Meta answered ${r.status}`);
  return j.data || [];
}

export async function metaAds(store, { fresh = false } = {}) {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return { connected: false };
  const act = String(process.env.META_AD_ACCOUNT_ID || 'act_607646691723139').replace(/^(\d)/, 'act_$1');
  const kept = await store.get('meta/ads', { type: 'json' }).catch(() => null);
  if (kept && !fresh && Date.now() - kept.at < KEEP) return kept;
  try {
    const [camps, ins] = await Promise.all([
      graph(`${act}/campaigns?fields=id,name,effective_status,start_time,stop_time&limit=100`, token),
      graph(`${act}/insights?level=campaign&date_preset=maximum&fields=campaign_id,spend,impressions,clicks&limit=200`, token),
    ]);
    const byId = new Map(ins.map((x) => [x.campaign_id, x]));
    const campaigns = camps.map((c) => {
      const i = byId.get(c.id) || {};
      return { id: c.id, name: c.name, status: c.effective_status, from: c.start_time ? ET(Date.parse(c.start_time)) : null, to: c.stop_time ? ET(Date.parse(c.stop_time)) : null,
        spend: Math.round(100 * (+i.spend || 0)) / 100, impressions: +i.impressions || 0, clicks: +i.clicks || 0 };
    }).filter((c) => c.spend > 0 || c.status === 'ACTIVE');
    const out = { connected: true, at: Date.now(), campaigns };
    await store.setJSON('meta/ads', out).catch(() => {});
    return out;
  } catch (e) {
    // keep showing the last good numbers, with the error
    return kept ? { ...kept, error: e.message } : { connected: true, at: Date.now(), campaigns: [], error: e.message };
  }
}
