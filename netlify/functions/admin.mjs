// The admin page's numbers. Needs a signed-in admin account (ADMIN_EMAIL or ADMIN_DISCORD_ID, see lib/auth.mjs).
// GET -> { totals, days: [last 14 days, newest first] }
import { db, json, day, keys, getAll } from '../lib/db.mjs';
import { userFor, isAdminUser } from '../lib/auth.mjs';

const laDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const bananas = (p) => (p.points || []).filter((x) => x >= 90).length;
function sum(games) {
  const n = games.length, pts = games.reduce((t, g) => t + (g.score || 0), 0), ban = games.reduce((t, g) => t + bananas(g), 0);
  return { games: n, points: pts, avg_points: n ? Math.round(pts / n) : null, avg_bananas: n ? Math.round((10 * ban) / n) / 10 : null };
}

export default async (req) => {
  if (!isAdminUser(await userFor(req))) return json({ error: 'not the admin account' }, 401);
  const store = db();
  const [seen, plays, quick, shares, chals, users] = await Promise.all([
    keys(store, 'seen/'), getAll(store, 'plays/'), getAll(store, 'quick/'), getAll(store, 'shares/'), getAll(store, 'challenges/'), getAll(store, 'users/'),
  ]);
  const dayOf = (k) => k.split('/')[1];
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = day(-i);
    const visits = await getAll(store, `visits/${d}/`);
    const dp = plays.filter((p) => p.day === d), dq = quick.filter((q) => dayOf(q.key) === d), ds = shares.filter((s) => dayOf(s.key) === d);
    days.push({
      day: d,
      visitors: visits.length,
      returning: visits.filter((v) => v.first && v.first < d).length,
      new_visitors: visits.filter((v) => !v.first || v.first >= d).length,
      players: new Set([...dp, ...dq].map((g) => g.device)).size,
      dailies: dp.length, quick: dq.length,
      ...sum([...dp, ...dq]),
      shares: ds.length, share_results: ds.filter((s) => s.what === 'results').length, share_challenge: ds.filter((s) => s.what === 'challenge').length,
      challenges: chals.filter((c) => c.created && laDay(c.created) === d).length,
      accounts: users.filter((u) => u.created && laDay(u.created) === d).length,
    });
  }
  const all = [...plays, ...quick];
  const totals = {
    unique_visitors: seen.length,
    players: new Set(all.map((g) => g.device)).size,
    dailies: plays.length, quick: quick.length, challenge_games: quick.filter((q) => q.chal).length,
    ...sum(all),
    shares: shares.length, share_results: shares.filter((s) => s.what === 'results').length, share_challenge: shares.filter((s) => s.what === 'challenge').length,
    challenges: chals.length, accounts: users.length,
  };
  return json({ totals, days });
};
