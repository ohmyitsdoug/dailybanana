// The social post images, drawn on the server (same designs as the mockups Doug approved).
// Every function returns a Canvas (see raster.mjs); call .jpeg() for the file.
import { Canvas } from './raster.mjs';

export const W = 1080, H = 1350;
const L = 84, R = W - 84;
export const BANANA_PX = ['..........bb....', '.........bssb...', '.........bssb...', '.........bydb...', '.........byydb..', '.........byydb..', '.........bylydb.', '........bylyydb.', '........bylyydb.', '.......bylyyydb.', '......bylyyyydb.', '....bbylyyyyddb.', '..bbylyyyyyyddb.', '.bylyyyyyyyddb..', 'bsyyyyyyyyddb...', 'bsdddddddbbb....', '.bbbbbbbbb......'];
const BAN_C = { b: '#3D2411', y: '#FED53C', l: '#FFE46F', d: '#EAA317', s: '#7B4B1F' };
const TH = {
  dark: { bg: '#2A1A0E', ink: '#FFF3C9', mut: '#CDB68C', card: '#382415', acc: '#FFD43B', chipSh: '#FFF3C9', tileSh: '#FFD43B', barBg: '#FFD43B', barInk: '#2A1A0E', barSh: '#FFF3C9' },
  light: { bg: '#FFE36E', ink: '#3B2412', mut: '#6B4F30', card: '#FFFAE0', acc: '#FFD43B', chipSh: '#3B2412', tileSh: '#3B2412', barBg: '#3B2412', barInk: '#FFF0A0', barSh: '#B97E00' },
};

export const fmt = (n) => Number(n).toLocaleString('en-US');
export const shownAns = (n) => (n < 100 ? Math.round(n * 10) / 10 : Math.round(n));   // the answer as players see it
export function nice(n) { if (n < 10) return Math.round(n * 10) / 10; const p = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; }
export const the = (b) => (b.art ? `${b.art} ${b.name}` : b.name);
export const question = (q) => `How many ${q.A.plural} ${q.B.dim} is ${the(q.B)}?`;
const unitWord = (q, n) => (n === 1 ? q.A.name : q.A.plural);

function poster(t, chip, foot) {
  const c = new Canvas(W, H), x = c, T = TH[t];
  const f = (w, px) => { x.font = `${w} ${px}px SG`; };
  const ban = (cx, cy, px, rot = 0, a = 1) => x.sprite(BANANA_PX, BAN_C, cx, cy, px, rot, a);
  const box = (X, Y, w, h, fill, sh, shc) => { if (sh) { x.fillStyle = shc; x.fillRect(X + sh, Y + sh, w, h); } x.fillStyle = fill; x.fillRect(X, Y, w, h); x.lineWidth = 4; x.strokeStyle = T.ink; x.strokeRect(X + 2, Y + 2, w - 4, h - 4); };
  const wrap = (text, w, px, weight = 700) => { f(weight, px); const out = []; let ln = ''; for (const wd of String(text).split(' ')) { const tt = ln ? ln + ' ' + wd : wd; if (x.measureText(tt).width > w && ln) { out.push(ln); ln = wd; } else ln = tt; } out.push(ln); return out; };
  // shrink a headline until it fits in maxLines
  const fit = (text, w, px, maxLines, min = 40, weight = 700) => { let ls; for (;;) { ls = wrap(text, w, px, weight); if (ls.length <= maxLines || px <= min) return { ls, px }; px -= 4; } };
  x.fillStyle = T.bg; x.fillRect(0, 0, W, H);
  box(L, 84, 84, 84, T.card, 6, T.tileSh); ban(L + 42, 126, 56);
  x.textBaseline = 'middle'; f(700, 46); x.fillStyle = T.ink; x.fillText('dailybanana.io', L + 104, 128);
  if (chip) { f(700, 34); const cw = x.measureText(chip).width + 44; box(R - cw - 6, 94, cw, 64, T.acc, 6, T.chipSh); x.fillStyle = '#2A1A0E'; x.fillText(chip, R - cw - 6 + 22, 127); }
  x.textBaseline = 'alphabetic';
  const bar = () => { x.fillStyle = T.barSh; x.fillRect(L + 8, 1156, R - L, 118); box(L, 1148, R - L, 118, T.barBg, 0); f(700, 44); x.textBaseline = 'middle'; x.fillStyle = T.barInk; x.fillText(foot[0], L + 44, 1208); x.textAlign = 'right'; x.fillText(foot[1], R - 44, 1208); x.textAlign = 'left'; x.textBaseline = 'alphabetic'; };
  return { c, x, T, f, ban, box, wrap, fit, bar };
}

// MON · weekly carousel: cover, one slide per daily (hardest round first), end slide
export function monCover(weekLabel, n = 7) {
  const P = poster('light', weekLabel, ['Swipe', '→']), { x, T, f, ban, wrap } = P;
  [[860, 330, 170, 16], [210, 1010, 120, -12], [880, 1000, 110, 10]].forEach(([a, b, c, d]) => ban(a, b, c, d, 0.35));
  f(700, 40); x.fillStyle = T.mut; x.fillText('LAST WEEK’S DAILIES', L, 330);
  f(700, 112); x.fillStyle = T.ink; [`The ${n} that`, 'got everyone.'].forEach((t, i) => x.fillText(t, L, 470 + i * 124));
  x.fillStyle = T.mut; wrap('The hardest question from each day, the real answer, and how everyone did.', R - L, 42, 500).forEach((t, i) => x.fillText(t, L, 760 + i * 56));
  P.bar(); return P.c;
}
// d = { dayName:'Mon', n, q, avg (0-100 or null), within (0-1 or null), i (1-7) }
export function monDay(d, dark) {
  const t = dark ? 'dark' : 'light', P = poster(t, `${d.dayName} · Daily #${String(d.n).padStart(3, '0')}`, [d.dayName, `${d.i} of ${d.of || 7}`]), { x, T, f, box, fit } = P;
  f(700, 34); x.fillStyle = dark ? T.acc : T.ink; x.fillText('HARDEST QUESTION', L, 290);
  const { ls, px } = fit(question(d.q), R - L, 64, 3, 48); x.fillStyle = T.ink; f(700, px); ls.forEach((s, i) => x.fillText(s, L, 380 + i * px * 1.19));
  const sh = dark ? T.acc : T.ink;
  box(L, 600, R - L, 250, T.card, 8, sh); f(500, 36); x.fillStyle = T.mut; x.fillText('The answer: about', L + 40, 670);
  const ans = shownAns(d.q.ans), at = `${fmt(ans)} ${unitWord(d.q, ans)}`;
  let ap = 100; f(700, ap); while (x.measureText(at).width > R - L - 80 && ap > 56) { ap -= 4; f(700, ap); }
  x.fillStyle = T.ink; x.fillText(at, L + 40, 790);
  const w2 = (R - L) / 2 - 12;
  [[d.avg == null ? '–' : String(Math.round(d.avg)), 'average score'], [d.within == null ? '–' : `${Math.round(d.within * 100)}%`, 'got within 10%']].forEach(([v, l], i) => {
    const X = L + i * (w2 + 24); box(X, 890, w2, 200, T.card, 8, sh); f(700, 80); x.fillStyle = T.ink; x.fillText(v, X + 32, 990); f(500, 32); x.fillStyle = T.mut; x.fillText(l, X + 32, 1050);
  });
  P.bar(); return P.c;
}
export function monEnd() {
  const P = poster('light', 'Your turn', ['Play today’s daily', 'dailybanana.io']), { x, T, f, ban } = P;
  ban(W / 2, 820, 260, -12, 0.4);
  f(700, 120); x.fillStyle = T.ink; x.textAlign = 'center'; x.fillText('New week.', W / 2, 430); x.fillText('New dailies.', W / 2, 560);
  f(500, 42); x.fillStyle = T.mut; x.fillText('6 questions a day. Free. No app to download.', W / 2, 660); x.textAlign = 'left';
  P.bar(); return P.c;
}

// TUE (and FRI until the numbers are big) · fun fact
export function factPost(fact) {
  const P = poster('light', 'Fun fact', ['Guess more sizes', 'dailybanana.io']), { x, T, f, ban, wrap } = P;
  ban(W / 2, 960, 230, -14, 0.35);
  f(700, 40); x.fillStyle = T.mut; x.fillText('DID YOU KNOW?', L, 330);
  let px = 72, ls; for (;;) { ls = wrap(fact, R - L, px); if (ls.length <= 6 || px < 44) break; px -= 4; }
  x.fillStyle = T.ink; ls.forEach((t, i) => x.fillText(t, L, 440 + i * px * 1.22));
  P.bar(); return P.c;
}

// WED · guess this (the quick-play round card, generic "you" pin)
export function guessPost(q, a) {
  const c = new Canvas(W, H), x = c;
  const BG = '#2A1A0E', INK = '#FFF3C9', MUT = '#CDB68C', CARD = '#382415', ACC = '#FFD43B', DARK = '#2A1A0E';
  const font = (w, px) => { x.font = `${w} ${px}px SG`; };
  const ban = (px, cx, cy, rot = 0, alpha = 1) => x.sprite(BANANA_PX, BAN_C, cx, cy, px, rot, alpha);
  const box = (X, Y, w, h, fill, sh, shc) => { x.fillStyle = shc; x.fillRect(X + sh, Y + sh, w, h); x.fillStyle = fill; x.fillRect(X, Y, w, h); x.lineWidth = 4; x.strokeStyle = INK; x.strokeRect(X + 2, Y + 2, w - 4, h - 4); };
  const p = a.p;
  x.fillStyle = BG; x.fillRect(0, 0, W, H);
  box(L, 84, 84, 84, CARD, 6, ACC); ban(56, L + 42, 126);
  x.textBaseline = 'middle'; font(700, 46); x.fillStyle = INK; x.fillText('dailybanana.io', L + 104, 128);
  font(700, 36); const chip = 'Quick play', cw = x.measureText(chip).width + 48; box(R - cw - 6, 92, cw, 68, ACC, 6, INK); x.fillStyle = DARK; x.fillText(chip, R - cw - 6 + 24, 128);
  x.textBaseline = 'alphabetic';
  font(500, 40); x.fillStyle = MUT; x.fillText('Approximately…', L, 320);
  const words = question(q).split(' '), lines = []; let qs = 68;
  for (;;) { font(700, qs); lines.length = 0; let ln = ''; for (const w of words) { const t = ln ? ln + ' ' + w : w; if (x.measureText(t).width > R - L && ln) { lines.push(ln); ln = w; } else ln = t; } lines.push(ln); if (lines.length <= 3 || qs <= 48) break; qs -= 4; }
  x.fillStyle = INK; lines.forEach((t, i) => x.fillText(t, L, 320 + qs * 1.2 * (i + 1)));
  const qEnd = 320 + qs * 1.2 * lines.length, hy = Math.max(qEnd + 96, 560), sy = Math.min(hy + 190, 860); let sx = L;
  if (p >= 90) { ban(120, L + 60, sy - 70); sx += 140; }
  font(700, 200); x.fillStyle = INK; x.letterSpacing = '-5px'; x.fillText(String(p), sx - 4, sy); const pw = x.measureText(String(p)).width; x.letterSpacing = '0px';
  font(700, 64); x.fillStyle = MUT; x.fillText('/ 100', sx + pw + 14, sy);
  ban(200, 890, sy - 90, 16, 0.28);
  const ty = 1012;
  x.fillStyle = CARD; x.fillRect(L, ty, R - L, 30); x.lineWidth = 4; x.strokeStyle = INK; x.strokeRect(L + 2, ty + 2, R - L - 4, 26);
  x.fillStyle = ACC; x.fillRect((L + R) / 2 - 4, ty - 24, 8, 78);
  const pos = a.guess <= q.ans ? 50 * a.guess / q.ans : 100 - 50 * q.ans / a.guess;
  const px = L + (R - L) * pos / 100, PIN = 'you'; font(700, 34); const lw = x.measureText(PIN).width + 40, bx = Math.max(L, Math.min(R - lw, px - lw / 2));
  x.fillStyle = INK; x.fillRect(px - 2, ty - 34, 4, 34);
  x.fillStyle = ACC; x.fillRect(bx + 4, ty - 92, lw, 58); x.fillStyle = BG; x.fillRect(bx, ty - 96, lw, 58); x.strokeStyle = INK; x.strokeRect(bx + 2, ty - 94, lw - 4, 54);
  x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(PIN, bx + lw / 2, ty - 67); x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  font(400, 34); x.fillStyle = MUT; x.fillText('too low', L, ty + 92); x.textAlign = 'right'; x.fillText('too high', R, ty + 92);
  font(700, 34); x.fillStyle = ACC; x.textAlign = 'center'; x.fillText('the answer', (L + R) / 2, ty + 92); x.textAlign = 'left';
  x.fillStyle = INK; x.fillRect(L + 8, 1156, R - L, 118); box(L, 1148, R - L, 118, ACC, 0, INK);
  font(700, 44); x.textBaseline = 'middle'; x.fillStyle = DARK; x.fillText('Play free', L + 44, 1208); x.textAlign = 'right'; x.fillText('dailybanana.io', R - 44, 1208); x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  return c;
}

// THU · banana for scale (q.A is the banana)
export function scalePost(q) {
  const P = poster('light', 'Banana for scale', ['How close were you?', 'dailybanana.io']), { x, T, f, fit } = P;
  const B = q.B, cap = B.name.charAt(0).toUpperCase() + B.name.slice(1), ans = shownAns(q.ans);
  const head = `${B.art ? (B.art === 'an' ? 'An' : 'A') + ' ' : ''}${B.art ? B.name : cap} is about`;
  const h = fit(head, R - L, 44, 2, 32, 500); x.fillStyle = T.mut; h.ls.forEach((t, i) => x.fillText(t, L, 320 + i * h.px * 1.2));
  const y0 = 320 + (h.ls.length - 1) * h.px * 1.2;
  let np = 250; f(700, np); while (x.measureText(fmt(ans)).width > R - L && np > 120) { np -= 10; f(700, np); }
  x.fillStyle = T.ink; x.fillText(fmt(ans), L - 8, y0 + 240);
  f(700, 90); x.fillText(`${ans === 1 ? 'banana' : 'bananas'} ${B.dim}.`, L, y0 + 350);
  const n = Math.max(1, Math.min(12, Math.round(ans)));
  for (let i = 0; i < n; i++) x.sprite(BANANA_PX, BAN_C, L + 40 + i * 76, y0 + 500 + (i % 2) * 14, 70, i % 2 ? 8 : -8);
  f(500, 36); x.fillStyle = T.mut; x.fillText('We lined them up. (In our heads.)', L, Math.min(y0 + 640, 1060));
  f(500, 30); x.fillText(`Sizes are typical averages. Real ${B.plural} and bananas vary.`.slice(0, 70), L, Math.min(y0 + 700, 1110));
  P.bar(); return P.c;
}

// FRI · week in review (only once a week has 500+ dailies)
export function weekPost(t) {
  const P = poster('dark', 'This week', ['Join in', 'dailybanana.io']), { x, T, f, ban, box } = P;
  f(700, 84); x.fillStyle = T.ink; x.fillText('This week', L, 320); x.fillText('in review', L, 412); ban(880, 350, 180, 16, 0.28);
  const tiles = [[fmt(t.dailies), 'dailies played'], [fmt(t.bananas), 'bananas earned'], [fmt(t.challenges), 'challenges made'], [`${t.accuracy}%`, 'average accuracy']];
  tiles.forEach(([v, l], i) => { const X = L + (i % 2) * ((R - L) / 2 + 12), Y = 500 + Math.floor(i / 2) * 300, w = (R - L) / 2 - 12; box(X, Y, w, 260, T.card, 8, T.acc); f(700, 96); x.fillStyle = T.ink; x.fillText(v, X + 36, Y + 140); f(500, 36); x.fillStyle = T.mut; x.fillText(l, X + 36, Y + 204); });
  P.bar(); return P.c;
}

// SAT · weekend challenge (themed unit, no house score)
export function weekendPost(wk, code) {
  const P = poster('light', 'Weekend challenge', ['Link in bio', 'dailybanana.io/weekend']), { x, T, f, ban, box, fit, wrap } = P;
  ban(890, 330, 170, -14, 0.35);
  const h = fit(wk.tagline, R - L - 200, 96, 3, 60); x.fillStyle = T.ink; h.ls.forEach((t, i) => x.fillText(t, L, 320 + i * h.px * 1.08));
  const y = 320 + (h.ls.length - 1) * h.px * 1.08 + 90;
  x.fillStyle = T.mut; wrap(`6 questions, all measured in ${wk.plural}. Open all weekend. One try.`, R - L, 40, 500).forEach((t, i) => x.fillText(t, L, y + i * 52));
  box(L, 820, R - L, 250, T.card, 8, T.ink); f(500, 34); x.fillStyle = T.mut; x.fillText('Or tap Join on the home page and enter', L + 40, 890);
  f(700, 96); x.fillStyle = T.ink; x.fillText(code, L + 40, 1010);
  P.bar(); return P.c;
}

// SUN · closest guess of the week. c = { q, guess, points, plays }
export function closestPost(cg) {
  const P = poster('dark', 'Closest guess', ['Play today’s daily', 'dailybanana.io']), { x, T, f, ban, box, fit } = P;
  f(500, 40); x.fillStyle = T.mut; x.fillText('This week’s closest guess', L, 300);
  const qq = fit(question(cg.q), R - L, 62, 2, 44); x.fillStyle = T.ink; f(700, qq.px); qq.ls.forEach((t, i) => x.fillText(t, L, 390 + i * qq.px * 1.19));
  const half = (R - L) / 2 - 12;
  box(L, 560, half, 260, T.card, 8, T.acc); box(L + half + 24, 560, half, 260, T.card, 8, T.acc);
  f(500, 34); x.fillStyle = T.mut; x.fillText('a player guessed', L + 36, 620); x.fillText('the answer', L + half + 60, 620);
  const g = fmt(cg.guess), a = fmt(shownAns(cg.q.ans)); let s = 110; f(700, s); while (Math.max(x.measureText(g).width, x.measureText(a).width) > half - 72 && s > 50) { s -= 6; f(700, s); }
  x.fillStyle = T.ink; x.fillText(g, L + 36, 740); x.fillText(a, L + half + 60, 740);
  ban(L + 60, 930, 90); f(700, 64); x.fillStyle = T.ink; x.fillText(`${cg.points} points.`, L + 130, 955);
  f(500, 36); x.fillStyle = T.mut; x.fillText(`Out of ${fmt(cg.plays)} dailies played.`, L, 1040);
  P.bar(); return P.c;
}

// milestones: a big number and what it counts
export function milestonePost(number, label, sub) {
  const P = poster('light', 'Milestone', ['Thank you!', 'dailybanana.io']), { x, T, f, ban, fit } = P;
  [[180, 330, 110, -16], [540, 300, 90, 12], [900, 340, 110, 20], [230, 1040, 90, 10], [850, 1040, 90, -12]].forEach(([a, b, c, d]) => ban(a, b, c, d, 0.3));
  let np = 250; f(700, np); while (x.measureText(number).width > R - L && np > 120) { np -= 10; f(700, np); }
  x.fillStyle = T.ink; x.textAlign = 'center'; x.fillText(number, W / 2, 760);
  const l = fit(label, R - L, 80, 2, 50); f(700, l.px); l.ls.forEach((t, i) => x.fillText(t, W / 2, 860 + i * l.px * 1.1));
  if (sub) { f(500, 40); x.fillStyle = T.mut; x.fillText(sub, W / 2, 860 + l.ls.length * l.px * 1.1 + 30); }
  x.textAlign = 'left';
  P.bar(); return P.c;
}

// stories are 1080x1920: a feed image centred on the matching background, or a short note
export function storyOf(img, dark) {
  const c = new Canvas(1080, 1920); c.fillStyle = dark ? TH.dark.bg : TH.light.bg; c.fillRect(0, 0, 1080, 1920); c.put(img, 0, 285); return c;
}
function storyCard(t, chip, lines, foot) {
  const c = new Canvas(1080, 1920), x = c, T = TH[t];
  x.fillStyle = T.bg; x.fillRect(0, 0, 1080, 1920);
  const P = poster(t, chip, foot); P.bar(); P.ban(860, 960, 200, -14, 0.35); c.put(P.c, 0, 285);
  let y = 600; for (const [w, px, col, text] of lines) {
    x.font = `${w} ${px}px SG`; x.fillStyle = T[col];
    let ls = [], ln = ''; for (const wd of text.split(' ')) { const tt = ln ? ln + ' ' + wd : wd; if (x.measureText(tt).width > R - L && ln) { ls.push(ln); ln = wd; } else ln = tt; } ls.push(ln);
    for (const s of ls) { y += px * 1.15; x.fillText(s, L, y); } y += px * 0.5;
  }
  return c;
}
// THU morning · answer to Wednesday's question
export function answerStory(q) {
  const ans = shownAns(q.ans);
  return storyCard('dark', 'The answer', [[500, 40, 'mut', 'Yesterday we asked:'], [700, 60, 'ink', question(q)], [500, 40, 'mut', 'The answer: about'], [700, 120, 'acc', fmt(ans)], [700, 60, 'ink', `${unitWord(q, ans)}.`], [500, 38, 'mut', 'How close were you?']], ['Play free', 'dailybanana.io']);
}
// SUN morning · last call for the weekend challenge
export function lastCallStory(wk, code) {
  return storyCard('light', 'Weekend challenge', [[700, 96, 'ink', 'Last call!'], [500, 44, 'mut', `The ${wk.name} challenge closes tonight at midnight Pacific.`], [500, 40, 'mut', 'Tap Join on the home page and enter'], [700, 110, 'ink', code]], ['Link in bio', 'dailybanana.io/weekend']);
}
