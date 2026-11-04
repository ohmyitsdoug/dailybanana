// A tiny canvas for the server: just what the social post images need (rects, outlined boxes,
// text in Space Grotesk, pixel bananas), drawn in plain JS so it runs on Netlify with no native
// packages. Text shapes come from opentype.js; the JPEG comes from jpeg-js (both vendored, MIT).
import { parse } from './vendor/opentype/opentype.mjs';
import encodeJpeg from './vendor/jpeg-encoder.cjs';

const SS = 4; // sub-rows per pixel, for smooth edges

// fonts load once per warm function: from disk when given a folder, otherwise from the live site
const FONTS = {};
export async function loadFonts(base) {
  if (FONTS[700]) return;
  const files = { 400: 'SpaceGrotesk-Regular.ttf', 500: 'SpaceGrotesk-Medium.ttf', 700: 'SpaceGrotesk-Bold.ttf' };
  await Promise.all(Object.entries(files).map(async ([w, f]) => {
    let buf;
    if (/^https?:/.test(base)) { const r = await fetch(`${base}/fonts/${f}`); if (!r.ok) throw new Error(`font ${f}: ${r.status}`); buf = await r.arrayBuffer(); }
    else { const fs = await import('node:fs'); const b = fs.readFileSync(`${base}/${f}`); buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
    FONTS[w] = parse(buf);
  }));
}

const hex = (c) => { const h = c.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };

export class Canvas {
  constructor(w, h) {
    this.width = w; this.height = h;
    this.px = new Uint8ClampedArray(w * h * 4).fill(255);
    this.acc = new Float32Array(w + 2);
    this.fillStyle = '#000000'; this.strokeStyle = '#000000'; this.lineWidth = 1; this.globalAlpha = 1;
    this.font = '400 16px sans-serif'; this.textAlign = 'left'; this.textBaseline = 'alphabetic'; this.letterSpacing = '0px';
  }
  getContext() { return this; }

  // ---- filling shapes (polygons with nonzero winding, anti-aliased) ----
  _fill(polys, color) {
    const edges = [];
    let y0 = Infinity, y1 = -Infinity;
    for (const p of polys) for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length];
      if (ay === by) continue;
      const d = by > ay ? 1 : -1;
      edges.push(d > 0 ? [ax, ay, bx, by, 1] : [bx, by, ax, ay, -1]);
      y0 = Math.min(y0, ay, by); y1 = Math.max(y1, ay, by);
    }
    if (!edges.length) return;
    const [r, g, b] = hex(color), a = this.globalAlpha, W = this.width, acc = this.acc, P = this.px;
    const py0 = Math.max(0, Math.floor(y0)), py1 = Math.min(this.height, Math.ceil(y1));
    edges.sort((e, f) => e[1] - f[1]);
    const xs = [];
    for (let py = py0; py < py1; py++) {
      let lo = W, hi = 0;
      for (let s = 0; s < SS; s++) {
        const sy = py + (s + 0.5) / SS;
        xs.length = 0;
        for (const e of edges) { if (e[1] > sy) break; if (e[3] > sy) xs.push([e[0] + (sy - e[1]) * (e[2] - e[0]) / (e[3] - e[1]), e[4]]); }
        if (!xs.length) continue;
        xs.sort((m, n) => m[0] - n[0]);
        let wind = 0, start = 0;
        for (const [x, d] of xs) {
          const was = wind; wind += d;
          if (was === 0 && wind !== 0) start = x;
          else if (was !== 0 && wind === 0) {
            const xa = Math.max(0, start), xb = Math.min(W, x);
            if (xb <= xa) continue;
            const ia = Math.floor(xa), ib = Math.floor(xb);
            lo = Math.min(lo, ia); hi = Math.max(hi, ib + 1);
            if (ia === ib) acc[ia] += xb - xa;
            else { acc[ia] += ia + 1 - xa; for (let i = ia + 1; i < ib; i++) acc[i] += 1; if (ib < W) acc[ib] += xb - ib; }
          }
        }
      }
      for (let i = lo; i < Math.min(hi, W); i++) {
        const c = Math.min(1, acc[i] / SS) * a; acc[i] = 0;
        if (c <= 0) continue;
        const o = (py * W + i) * 4;
        P[o] += (r - P[o]) * c; P[o + 1] += (g - P[o + 1]) * c; P[o + 2] += (b - P[o + 2]) * c;
      }
      for (let i = hi; i < W + 2; i++) if (acc[i]) acc[i] = 0; else break;
    }
  }
  fillRect(x, y, w, h) { this._fill([[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]], this.fillStyle); }
  strokeRect(x, y, w, h) {
    const l = this.lineWidth / 2, c = this.fillStyle;
    this.fillStyle = this.strokeStyle;
    this.fillRect(x - l, y - l, w + 2 * l, 2 * l); this.fillRect(x - l, y + h - l, w + 2 * l, 2 * l);
    this.fillRect(x - l, y + l, 2 * l, h - 2 * l); this.fillRect(x + w - l, y + l, 2 * l, h - 2 * l);
    this.fillStyle = c;
  }

  // ---- text ----
  _font() { const m = /(\d+)\s+(\d+(?:\.\d+)?)px/.exec(this.font) || [0, 400, 16]; const w = +m[1] >= 600 ? 700 : +m[1] >= 500 ? 500 : 400; return { f: FONTS[w], size: +m[2] }; }
  _layout(text) {
    const { f, size } = this._font(), sc = size / f.unitsPerEm, ls = parseFloat(this.letterSpacing) || 0;
    const gl = f.stringToGlyphs(String(text)), pos = []; let x = 0;
    gl.forEach((g, i) => { pos.push(x); x += (g.advanceWidth || 0) * sc + ls; if (i < gl.length - 1) x += f.getKerningValue(g, gl[i + 1]) * sc; });
    return { f, size, gl, pos, width: x - (gl.length ? ls : 0) };
  }
  measureText(text) { return { width: this._layout(text).width }; }
  fillText(text, x, y) {
    const L = this._layout(text), { f, size } = L;
    if (this.textAlign === 'center') x -= L.width / 2; else if (this.textAlign === 'right' || this.textAlign === 'end') x -= L.width;
    if (this.textBaseline === 'middle') { const asc = f.ascender, des = -f.descender; y += size * (asc - des) / (asc + des) / 2; }
    else if (this.textBaseline === 'top') { y += size * f.ascender / (f.ascender - f.descender); }
    const polys = [];
    L.gl.forEach((g, i) => {
      let cur = null, px = 0, py = 0;
      for (const c of g.getPath(x + L.pos[i], y, size).commands) {
        if (c.type === 'M') { if (cur && cur.length > 2) polys.push(cur); cur = [[c.x, c.y]]; px = c.x; py = c.y; }
        else if (c.type === 'L') { cur.push([c.x, c.y]); px = c.x; py = c.y; }
        else if (c.type === 'Q') { const n = Math.max(2, Math.ceil(Math.hypot(c.x - px, c.y - py) / 3)); for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; cur.push([u * u * px + 2 * u * t * c.x1 + t * t * c.x, u * u * py + 2 * u * t * c.y1 + t * t * c.y]); } px = c.x; py = c.y; }
        else if (c.type === 'C') { const n = Math.max(2, Math.ceil(Math.hypot(c.x - px, c.y - py) / 3)); for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; cur.push([u * u * u * px + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * py + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y]); } px = c.x; py = c.y; }
        else if (c.type === 'Z') { if (cur && cur.length > 2) polys.push(cur); cur = null; }
      }
      if (cur && cur.length > 2) polys.push(cur);
    });
    this._fill(polys, this.fillStyle);
  }

  // ---- pixel art: a grid of colour keys, centred at (cx,cy), px wide, tilted rot degrees ----
  sprite(grid, colors, cx, cy, px, rot = 0, alpha = 1) {
    const gw = Math.max(...grid.map((r) => r.length)), gh = grid.length, cell = px / gw, h = cell * gh;
    const t = -rot * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t), R = Math.hypot(px, h) / 2 + 1;
    const W = this.width, P = this.px, N = 3, C = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, hex(v)]));
    for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(this.height, Math.ceil(cy + R)); y++)
      for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(W, Math.ceil(cx + R)); x++) {
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const dx = x + (i + 0.5) / N - cx, dy = y + (j + 0.5) / N - cy;
          const u = Math.floor((dx * cs - dy * sn + px / 2) / cell), v = Math.floor((dx * sn + dy * cs + h / 2) / cell);
          const k = v >= 0 && v < gh && u >= 0 ? grid[v][u] : undefined, col = k && C[k];
          if (col) { sr += col[0]; sg += col[1]; sb += col[2]; n++; }
        }
        if (!n) continue;
        const c = n / (N * N) * alpha, o = (y * W + x) * 4;
        P[o] += (sr / n - P[o]) * c; P[o + 1] += (sg / n - P[o + 1]) * c; P[o + 2] += (sb / n - P[o + 2]) * c;
      }
  }

  // paste another canvas at (x,y), no scaling
  put(src, x, y) {
    for (let r = 0; r < src.height; r++) {
      const ty = y + r; if (ty < 0 || ty >= this.height) continue;
      const a = r * src.width * 4, b = (ty * this.width + x) * 4;
      this.px.set(src.px.subarray(a, a + src.width * 4), b);
    }
  }

  jpeg(quality = 92) { return Buffer.from(encodeJpeg({ data: this.px, width: this.width, height: this.height }, quality).data); }
}
