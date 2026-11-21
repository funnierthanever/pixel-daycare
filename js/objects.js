// Everything you can build in the daycare. Each type knows how to draw itself,
// where it blocks walking, and how big it is. Positions are the object's "foot"
// point: where it touches the ground, used for sorting front-to-back.
import { C, BERRIES, FLOWERS, fillEllipse, px, rng } from './art.js';

const ell = (dx, dy, rx, ry) => (dx / rx) ** 2 + (dy / ry) ** 2 < 1;
const inRect = (dx, dy, [x0, y0, x1, y1]) => dx >= x0 && dx < x1 && dy >= y0 && dy < y1;

const TREE_R = [13, 16, 19];
const PINE_H = [20, 26, 32];
const BUSH_R = [6, 8, 10];
const ROCK_R = [12, 17, 22];
const BOULDER_R = [6, 8, 10];
const HAY_W = [36, 56, 76];
const POND = [[30, 15], [50, 25], [70, 34]];
const FALL_H = [45, 65, 85];

const fallSpread = (h) => Math.ceil(22 + h * 0.35 + 12);

export const CATALOG = {
  tree: {
    label: 'Tree', layer: 'entity', sizes: 3, def: 1,
    bounds: (o) => { const r = TREE_R[o.s]; return [-r - 5, Math.floor(-12 - r * 1.75 - 3), r + 6, 8]; },
    paint(g, o) {
      const r = TREE_R[o.s], R = rng(o.seed);
      g.fillStyle = 'rgba(20,60,20,0.25)'; fillEllipse(g, 2, 1, r + 2, 5);
      px(g, C.trunkDark, -3, -12, 7, 12); px(g, C.trunk, -2, -12, 4, 12); px(g, C.trunkDark, -5, -1, 11, 2);
      const cy = -12 - r * 0.75;
      g.fillStyle = C.leafDark; fillEllipse(g, 0, cy + 2, r, r * 0.8);
      g.fillStyle = C.leaf;
      fillEllipse(g, -r * 0.35, cy - 1, r * 0.62, r * 0.55);
      fillEllipse(g, r * 0.35, cy, r * 0.62, r * 0.55);
      fillEllipse(g, 0, cy - r * 0.35, r * 0.6, r * 0.45);
      g.fillStyle = C.leafLight;
      fillEllipse(g, -r * 0.4, cy - r * 0.35, r * 0.32, r * 0.22);
      fillEllipse(g, r * 0.1, cy - r * 0.55, r * 0.3, r * 0.18);
      for (let i = 0; i < 10; i++) px(g, C.leafHi, (R() - 0.6) * r * 1.2, cy + (R() - 0.7) * r);
      for (let i = 0; i < 4; i++) px(g, '#e44a4a', (R() - 0.5) * r * 1.3, cy + (R() - 0.3) * r * 0.9, 2, 2);
    },
    blocks: (dx, dy) => dx * dx + (dy * 2) ** 2 < 36,
    shade: true,
  },
  pine: {
    label: 'Pine', layer: 'entity', sizes: 3, def: 1,
    bounds: (o) => { const h = PINE_H[o.s]; return [-Math.ceil(h * 0.45) - 3, -Math.ceil(h * 1.2) - 8, Math.ceil(h * 0.45) + 5, 6]; },
    paint(g, o) {
      const h = PINE_H[o.s], w = h * 0.42, R = rng(o.seed);
      g.fillStyle = 'rgba(20,60,20,0.25)'; fillEllipse(g, 2, 1, w * 0.8 + 2, 4);
      px(g, C.trunkDark, -2, -6, 5, 6); px(g, C.trunk, -1, -6, 2, 6);
      const th = Math.round(h * 0.45);
      for (let k = 0; k < 3; k++) {
        const base = -5 - k * Math.round(h * 0.26), half0 = w * (1 - k * 0.22);
        for (let yy = 0; yy <= th; yy++) {
          const half = Math.round(half0 * (yy / th));
          const y = base - th + yy;
          px(g, C.pineDark, -half, y, half * 2 + 1, 1);
          if (half > 1) px(g, C.pine, -half + 1, y, half, 1);
          if (yy > 1 && half > 3 && yy % 3 === 0) px(g, C.pineHi, -half + 2, y, Math.max(1, half - 3), 1);
        }
      }
      for (let i = 0; i < 4; i++) px(g, C.pineHi, (R() - 0.6) * w, -10 - R() * h * 0.8);
    },
    blocks: (dx, dy) => dx * dx + (dy * 2) ** 2 < 25,
    shade: true,
  },
  bush: {
    label: 'Bush', layer: 'entity', sizes: 3, def: 1,
    bounds: (o) => { const r = BUSH_R[o.s]; return [-r - 2, -Math.ceil(r * 1.5) - 3, r + 4, 5]; },
    paint(g, o) {
      const r = BUSH_R[o.s], R = rng(o.seed);
      g.fillStyle = 'rgba(20,60,20,0.25)'; fillEllipse(g, 1, 1, r + 1, 3);
      g.fillStyle = C.leafDark; fillEllipse(g, 0, -r * 0.65, r, r * 0.72);
      g.fillStyle = C.leaf; fillEllipse(g, -1, -r * 0.8, r - 1.5, r * 0.55);
      g.fillStyle = C.leafLight; fillEllipse(g, -r * 0.35, -r * 1.05, r * 0.35, r * 0.22);
      if (o.seed % 2) for (let i = 0; i < 3; i++) px(g, BERRIES[(o.seed + i) % 3 === 0 ? 0 : (o.seed + i) % 5], (R() - 0.5) * r * 1.3, -r * 0.4 - R() * r * 0.7, 2, 2);
    },
    blocks: (dx, dy, o) => dx * dx + (dy * 2) ** 2 < (BUSH_R[o.s] * 0.8) ** 2,
  },
  flowers: {
    label: 'Flowers', layer: 'ground', brush: 8,
    bounds: () => [-8, -5, 9, 6],
    paint(g, o) {
      const R = rng(o.seed), col = FLOWERS[o.seed % FLOWERS.length];
      for (let j = 0; j < 5; j++) {
        const x = (R() - 0.5) * 14, y = (R() - 0.5) * 7;
        px(g, C.tuft, x, y + 1); px(g, col, x, y);
      }
    },
  },
  rock: {
    label: 'Sunny rock', layer: 'ground', sizes: 3, def: 1,
    bounds: (o) => { const rx = ROCK_R[o.s], ry = Math.round(rx * 0.42); return [-rx - 2, -ry - 3, rx + 4, ry + 4]; },
    paint(g, o) {
      const rx = ROCK_R[o.s], ry = Math.round(rx * 0.42);
      g.fillStyle = 'rgba(0,0,0,0.18)'; fillEllipse(g, 1, 3, rx + 2, ry);
      g.fillStyle = C.rockDark; fillEllipse(g, 0, 1, rx, ry);
      g.fillStyle = C.rock; fillEllipse(g, 0, -1, rx - 1, ry - 1);
      g.fillStyle = C.rockLight; fillEllipse(g, -4, -3, rx * 0.5, 2);
    },
    hit: (dx, dy, o) => { const rx = ROCK_R[o.s]; return ell(dx, dy, rx + 2, rx * 0.42 + 3); },
  },
  boulder: {
    label: 'Boulder', layer: 'entity', sizes: 3, def: 1,
    bounds: (o) => { const r = BOULDER_R[o.s]; return [-r - 2, -Math.ceil(r * 1.6) - 2, r + 3, 5]; },
    paint(g, o) {
      const r = BOULDER_R[o.s];
      g.fillStyle = 'rgba(0,0,0,0.2)'; fillEllipse(g, 1, 1, r + 1, 3);
      g.fillStyle = C.rockDark; fillEllipse(g, 0, -r * 0.7, r, r * 0.8);
      g.fillStyle = C.rock; fillEllipse(g, -1, -r * 0.85, r - 1.5, r * 0.62);
      g.fillStyle = C.rockLight; fillEllipse(g, -r * 0.35, -r * 1.15, r * 0.35, r * 0.2);
      if (o.seed % 3 === 0) { g.fillStyle = C.moss; fillEllipse(g, r * 0.2, -r * 1.35, r * 0.4, 1); }
    },
    blocks: (dx, dy, o) => dx * dx + (dy * 2) ** 2 < BOULDER_R[o.s] ** 2,
  },
  bowl: {
    label: 'Berry bowl', layer: 'entity',
    bounds: () => [-9, -8, 10, 6],
    paint(g) {
      g.fillStyle = 'rgba(0,0,0,0.2)'; fillEllipse(g, 1, 2, 8, 3);
      g.fillStyle = C.bowlDark; fillEllipse(g, 0, 0, 8, 4);
      g.fillStyle = C.bowl; fillEllipse(g, 0, -1, 8, 3);
      g.fillStyle = C.bowlDark; fillEllipse(g, 0, -2, 6, 2);
    },
    live(ctx, o) {
      const n = Math.ceil((o.fill ?? 1) * 7);
      const spots = [[-3, -3], [0, -3], [3, -3], [-2, -5], [1, -5], [-1, -4], [2, -6]];
      for (let i = 0; i < n; i++) {
        const [dx, dy] = spots[i];
        px(ctx, BERRIES[(o.seed + i) % BERRIES.length], o.x + dx, o.y + dy, 2, 2);
        px(ctx, '#ffffff', o.x + dx, o.y + dy);
      }
      px(ctx, C.bowlRim, o.x - 7, o.y - 2, 14, 1);
    },
    blocks: (dx, dy) => dx * dx + (dy * 2) ** 2 < 49,
  },
  lantern: {
    label: 'Lantern', layer: 'entity',
    bounds: () => [-4, -24, 5, 2],
    paint(g) {
      px(g, '#5a3a22', -1, -18, 2, 18);
      px(g, '#3a2a1a', -3, -22, 6, 1); px(g, '#3a2a1a', -3, -15, 6, 1);
      px(g, '#d8d0b0', -2, -21, 4, 6);
      px(g, '#3a2a1a', -2, -23, 4, 1);
      g.fillStyle = 'rgba(0,0,0,0.2)'; fillEllipse(g, 1, 0, 3, 1);
    },
    live(ctx, o, env) { if (env.night > 0.3) px(ctx, '#ffe9a0', o.x - 2, o.y - 21, 4, 6); },
    blocks: (dx, dy) => dx * dx + (dy * 2) ** 2 < 16,
    hit: (dx, dy) => Math.abs(dx) < 6 && dy > -25 && dy < 3,
  },
  hay: {
    label: 'Hay bed', layer: 'ground', sizes: 3, def: 1,
    bounds: (o) => { const w = HAY_W[o.s]; return [-w / 2, -11, w / 2 + 2, 14]; },
    paint(g, o) {
      const w = HAY_W[o.s], h = 22, x = -w / 2, y = -11, R = rng(o.seed);
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + 1, y + 2, w, h);
      g.fillStyle = C.hayDark; g.fillRect(x, y, w, h);
      g.fillStyle = C.hay; g.fillRect(x + 1, y + 1, w - 2, h - 3);
      for (let i = 0; i < w * 1.25; i++) px(g, R() < 0.5 ? C.hayLight : C.hayDark, x + 1 + R() * (w - 4), y + 1 + R() * (h - 4), 3, 1);
    },
  },
  house: {
    label: 'House', layer: 'entity',
    bounds: () => [-34, -66, 44, 6],
    paint(g) {
      const x = -30, y = -58, w = 70, h = 58, wallTop = y + 22;
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 3, y + h - 2, w, 5);
      px(g, C.wallLine, x + 2, wallTop, w - 4, h - 22);
      px(g, C.wall, x + 3, wallTop, w - 6, h - 23);
      for (let yy = wallTop + 5; yy < y + h - 1; yy += 5) px(g, C.wallLine, x + 3, yy, w - 6, 1);
      for (let i = 0; i < 24; i++) {
        const inset = Math.max(0, 12 - i);
        px(g, i % 4 === 3 ? C.roofDark : C.roof, x - 3 + inset, y + i, w + 6 - inset * 2, 1);
      }
      px(g, C.roofLight, x + 9, y + 1, w - 18, 1);
      px(g, C.roofDark, x - 3, y + 23, w + 6, 2);
      px(g, '#8a8f9c', x + w - 18, y - 6, 7, 12); px(g, '#6d717d', x + w - 19, y - 7, 9, 2);
      px(g, C.frame, -7, y + h - 18, 14, 18);
      px(g, C.door, -6, y + h - 17, 12, 17);
      px(g, '#e8b84a', 3, y + h - 9, 2, 2);
      for (const wx of [x + 8, x + w - 20]) {
        px(g, C.frame, wx - 1, wallTop + 6, 14, 11);
        px(g, C.windowDay, wx, wallTop + 7, 12, 9);
        px(g, '#ffffff', wx + 1, wallTop + 8, 3, 2);
        px(g, C.frame, wx + 5, wallTop + 7, 1, 9); px(g, C.frame, wx, wallTop + 11, 12, 1);
      }
      px(g, C.frame, -9, y + 13, 18, 9);
      px(g, '#f6e6c0', -8, y + 14, 16, 7);
      g.fillStyle = '#ffffff'; fillEllipse(g, 0, y + 17, 2, 3);
      px(g, '#6fbf5a', -2, y + 17); px(g, '#6fbf5a', 1, y + 16);
    },
    blocks: (dx, dy) => dx > -34 && dx < 44 && dy > -30 && dy < 4,
    hit: (dx, dy) => dx > -34 && dx < 44 && dy > -66 && dy < 2,
    windows: [[-16, -25], [26, -25]],
    chimney: [25, -66],
  },
  pond: {
    label: 'Pond', layer: 'ground', sizes: 3, def: 1, liveOrder: 0,
    bounds: (o) => { const [rx, ry] = POND[o.s]; return [-rx - 9, -ry - 6, rx + 9, ry + 8]; },
    paint(g, o) {
      const [rx, ry] = POND[o.s];
      g.fillStyle = '#c9b88a'; fillEllipse(g, 0, 1, rx + 5, ry + 4);
      for (let a = 0; a < Math.PI * 2; a += 0.22 * 50 / rx) {
        const x = Math.cos(a) * (rx + 4), y = Math.sin(a) * (ry + 3);
        if (y < -ry + 3) continue;
        g.fillStyle = C.rockDark; fillEllipse(g, x, y + 1, 4, 2);
        g.fillStyle = C.rock; fillEllipse(g, x, y, 3, 2);
        px(g, C.rockLight, x - 1, y - 1, 2, 1);
      }
    },
    live(ctx, o, env) {
      const [rx, ry] = POND[o.s], t = env.t;
      ctx.fillStyle = C.water; fillEllipse(ctx, o.x, o.y, rx, ry);
      ctx.fillStyle = C.waterDeep; fillEllipse(ctx, o.x, o.y + 2, rx * 0.72, ry * 0.62);
      ctx.fillStyle = C.waterLight;
      for (let i = 0; i < 16; i++) {
        const a = i * 2.4 + t * 0.15, r = 0.25 + ((i * 37) % 60) / 100;
        const x = o.x + Math.cos(a) * rx * r, y = o.y + Math.sin(a * 1.3) * ry * r * 0.9;
        if ((Math.floor(t * 2 + i) % 3) !== 0) ctx.fillRect(Math.round(x), Math.round(y), 3, 1);
      }
      for (const [dx, dy] of [[-0.55, 0.35], [-0.4, 0.5], [0.5, 0.45]]) {
        const x = o.x + dx * rx, y = o.y + dy * ry + Math.sin(t + dx * 9) * 0.6;
        ctx.fillStyle = '#3f9a4c'; fillEllipse(ctx, x, y, 4, 2);
        px(ctx, C.water, x + 2, y - 1, 2, 1);
      }
    },
    water: (o) => { const [rx, ry] = POND[o.s]; return { cx: o.x, cy: o.y, rx, ry }; },
    hit: (dx, dy, o) => { const [rx, ry] = POND[o.s]; return ell(dx, dy, rx + 5, ry + 4); },
  },
  waterfall: {
    label: 'Waterfall', layer: 'ground', sizes: 3, def: 1, liveOrder: 1,
    bounds: (o) => { const h = FALL_H[o.s], s = fallSpread(h); return [-s, -h - 20, s + 1, 14]; },
    paint(g, o) {
      const h = FALL_H[o.s], R = rng(o.seed);
      const n = Math.round(60 * h / 65);
      for (let i = 0; i < n; i++) {
        const y = -h - 8 + R() * (h + 4);
        const spread = 22 + (y + h) * 0.35;
        const x = (R() * 2 - 1) * spread;
        const r = 5 + R() * 6;
        g.fillStyle = C.rockDark; fillEllipse(g, x, y + 1, r, r * 0.7);
        g.fillStyle = C.rock; fillEllipse(g, x, y, r - 1, r * 0.7 - 1);
        g.fillStyle = C.rockLight; fillEllipse(g, x - 1, y - 2, r * 0.45, r * 0.25);
        if (R() < 0.3) { g.fillStyle = C.moss; fillEllipse(g, x + 2, y - r * 0.5, r * 0.4, 1); }
      }
      g.fillStyle = '#c9b88a'; fillEllipse(g, 0, 5, 21, 8);
      for (let a = 0.2; a < Math.PI - 0.2; a += 0.35) {
        const x = Math.cos(a) * 20, y = 4 + Math.sin(a) * 7;
        g.fillStyle = C.rockDark; fillEllipse(g, x, y + 1, 3, 2);
        g.fillStyle = C.rock; fillEllipse(g, x, y, 2, 1);
      }
    },
    live(ctx, o, env) {
      const h = FALL_H[o.s], t = env.t, fx = o.x - 8, fw = 16, top = o.y - h, bottom = o.y + 2;
      ctx.fillStyle = C.water; fillEllipse(ctx, o.x, o.y + 4, 17, 5);
      for (let k = 0; k < 3; k++) {
        const ph = ((t * 0.5 + k / 3) % 1);
        ctx.strokeStyle = `rgba(234,247,255,${0.55 * (1 - ph)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(o.x + 0.5, bottom + 3.5, 6 + ph * 22, 2 + ph * 8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < fw; i++) {
        const edge = i === 0 || i === fw - 1;
        px(ctx, edge ? C.waterDeep : C.water, fx + i, top, 1, bottom - top);
        const speed = 70 + ((i * 13) % 5) * 9;
        for (let s = 0; s < 3; s++) {
          const len = 5 + ((i * 7 + s * 11) % 6);
          const y = top + ((t * speed + s * 23 + i * 17) % (bottom - top + len)) - len;
          const y0 = Math.max(top, y), y1 = Math.min(bottom, y + len);
          if (y1 > y0) px(ctx, s === 0 ? C.foam : C.waterLight, fx + i, y0, 1, y1 - y0);
        }
      }
      px(ctx, C.foam, fx - 1, top, fw + 2, 2);
      const R = env.R;
      for (let i = 0; i < 26; i++) px(ctx, R() < 0.6 ? C.foam : C.waterLight, fx - 4 + R() * (fw + 8), bottom - 2 + R() * 6, 2, 1);
    },
    water: (o) => ({ cx: o.x, cy: o.y + 4, rx: 17, ry: 5 }),
    blocks: (dx, dy, o) => Math.abs(dx) < 26 + Math.max(0, -dy) * 0.3 && dy < -1 && dy > -FALL_H[o.s] - 12,
    hit: (dx, dy, o) => { const h = FALL_H[o.s]; return Math.abs(dx) < 22 + Math.max(0, -dy) * 0.3 && dy > -h - 10 && dy < 10; },
    fall: (o) => ({ x: o.x, top: o.y - FALL_H[o.s], bottom: o.y }),
  },
  fence: {
    label: 'Fence', layer: 'entity', brush: 16,
    snap: (x, y) => [Math.round((x - 8) / 16) * 16 + 8, Math.round(y / 4) * 4],
    bounds: () => [-9, -14, 10, 2],
    paint(g) {
      px(g, C.fenceDark, -8, -9, 16, 1); px(g, C.fence, -8, -10, 16, 1);
      px(g, C.fenceDark, -8, -4, 16, 1); px(g, C.fence, -8, -5, 16, 1);
      px(g, C.fenceDark, -2, -13, 4, 13); px(g, C.fence, -2, -13, 3, 12);
      px(g, '#e6bf8c', -2, -13, 3, 1);
    },
    blocks: (dx, dy) => Math.abs(dx) < 9 && Math.abs(dy) < 3,
    hit: (dx, dy) => Math.abs(dx) < 9 && dy > -15 && dy < 3,
  },
};

const CACTUS_H = [12, 18, 24];
const PALM_H = [24, 32, 40];
const CACTUS = { dark: '#2f6e3a', mid: '#4f9a52', light: '#7cc070' };

Object.assign(CATALOG, {
  palm: {
    label: 'Palm', layer: 'entity', sizes: 3, def: 1, shade: true,
    bounds: (o) => { const h = PALM_H[o.s]; return [-Math.ceil(h * 0.62) - 4, -h - 14, Math.ceil(h * 0.62) + 10, 6]; },
    paint(g, o) {
      const h = PALM_H[o.s], lean = (o.seed % 2 ? 1 : -1) * h * 0.18, R = rng(o.seed);
      g.fillStyle = 'rgba(20,60,20,0.22)'; fillEllipse(g, lean + 2, 1, h * 0.35 + 2, 4);
      let tx = 0, ty = 0;
      for (let i = 0; i <= h; i++) {
        const k = i / h, x = Math.sin(k * 1.3) * lean, y = -i;
        px(g, i % 4 === 0 ? C.trunkDark : C.trunk, x - 2, y, 4, 1);
        px(g, C.trunkDark, x + 1, y, 1, 1);
        tx = x; ty = y;
      }
      const L = h * 0.5;
      for (const a of [-2.9, -2.4, -1.9, -1.25, -0.7, -0.25]) {
        for (let t = 0; t <= 1; t += 0.06) {
          const x = tx + Math.cos(a) * L * t, y = ty + Math.sin(a) * L * t * 0.7 + t * t * L * 0.55;
          g.fillStyle = C.leafDark; fillEllipse(g, x, y + 1, 2.4 - t * 1.2, 1.4);
          g.fillStyle = t < 0.6 ? C.leaf : C.leafLight; fillEllipse(g, x, y, 2 - t, 1);
        }
      }
      for (let i = 0; i < 3; i++) px(g, '#6a4a2a', tx - 3 + i * 2 + (R() < 0.5 ? 0 : 1), ty + 2, 2, 2);
    },
    blocks: (dx, dy) => dx * dx + (dy * 2) ** 2 < 16,
  },
  cactus: {
    label: 'Cactus', layer: 'entity', sizes: 3, def: 1,
    bounds: (o) => [-11, -CACTUS_H[o.s] - 3, 12, 4],
    paint(g, o) {
      const h = CACTUS_H[o.s], R = rng(o.seed);
      g.fillStyle = 'rgba(80,50,20,0.22)'; fillEllipse(g, 1, 1, 5, 2);
      const column = (x, y0, y1, w) => {
        px(g, CACTUS.dark, x, y0 + 1, w, y1 - y0 - 1); px(g, CACTUS.dark, x + 1, y0, w - 2, 1);
        px(g, CACTUS.mid, x + 1, y0 + 1, w - 2, y1 - y0 - 1);
        px(g, CACTUS.light, x + 1, y0 + 1, 1, y1 - y0 - 2);
      };
      column(-3, -h, 0, 6);
      if (o.s > 0 || o.seed % 2) { const ay = -Math.round(h * 0.55); px(g, CACTUS.dark, -7, ay, 5, 3); px(g, CACTUS.mid, -6, ay + 1, 4, 1); column(-8, ay - 6, ay + 3, 4); }
      if (o.s > 1 || o.seed % 3 === 0) { const ay = -Math.round(h * 0.7); px(g, CACTUS.dark, 2, ay, 5, 3); px(g, CACTUS.mid, 2, ay + 1, 4, 1); column(4, ay - 5, ay + 3, 4); }
      for (let i = 0; i < h / 2; i++) px(g, '#e8f0c0', -3 + Math.floor(R() * 6), -h + 2 + Math.floor(R() * (h - 3)));
      if (o.seed % 4 === 0) { px(g, '#ff8ab0', -1, -h - 1, 2, 2); px(g, '#ffd23a', 0, -h - 1); }
    },
    blocks: (dx, dy) => dx * dx + (dy * 2) ** 2 < 20,
  },
  reeds: {
    label: 'Reeds', layer: 'entity', brush: 6,
    bounds: () => [-6, -15, 7, 2],
    paint(g, o) {
      const R = rng(o.seed);
      for (let i = 0; i < 4; i++) {
        const x = -4 + i * 2.5 + R(), hgt = 8 + Math.floor(R() * 6);
        px(g, '#4a8a3a', x, -hgt, 1, hgt);
        if (i % 2 === 0) { px(g, '#7a4a28', x - 0.5, -hgt - 2, 2, 4); }
        else px(g, '#6aaa4a', x + 1, -hgt + 3, 1, 3);
      }
    },
  },
  shell: {
    label: 'Seashells', layer: 'ground', brush: 8,
    bounds: () => [-7, -4, 8, 5],
    paint(g, o) {
      const R = rng(o.seed);
      for (let i = 0; i < 3; i++) {
        const x = Math.round((R() - 0.5) * 10), y = Math.round((R() - 0.5) * 5);
        if ((o.seed + i) % 3 === 0) { // starfish
          px(g, '#f08a4a', x, y - 1, 1, 3); px(g, '#f08a4a', x - 1, y, 3, 1); px(g, '#ffb070', x, y);
        } else { // shell
          px(g, '#f6d6e0', x - 1, y, 3, 1); px(g, '#f6d6e0', x, y - 1); px(g, '#d8a0b4', x + 1, y);
        }
      }
    },
  },
});

export const SIZE_NAMES = ['Small', 'Medium', 'Large'];

// Pre-rendered sprite per (type, size, seed) so static art isn't redrawn every frame.
const cache = new Map();
export function spriteFor(o) {
  const key = `${o.type}:${o.s | 0}:${o.seed | 0}`;
  let c = cache.get(key);
  if (!c) {
    const T = CATALOG[o.type];
    const [x0, y0, x1, y1] = T.bounds(o).map(Math.round);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, x1 - x0); cv.height = Math.max(1, y1 - y0);
    const g = cv.getContext('2d');
    g.translate(-x0, -y0);
    T.paint(g, o);
    c = { cv, x0, y0 };
    cache.set(key, c);
  }
  return c;
}

export function drawObject(ctx, o, env) {
  const s = spriteFor(o);
  ctx.drawImage(s.cv, Math.round(o.x) + s.x0, Math.round(o.y) + s.y0);
  const T = CATALOG[o.type];
  if (T.live && T.layer === 'entity' && env) T.live(ctx, o, env);
}

/** True if x,y touches a visible pixel of the object (within a small finger-friendly margin). */
export function hitObject(o, x, y) {
  const T = CATALOG[o.type], dx = x - o.x, dy = y - o.y;
  if (T.hit) return T.hit(dx, dy, o);
  if (!inRect(dx, dy, T.bounds(o).map((v, i) => v + (i < 2 ? -2 : 2)))) return false;
  const sp = spriteFor(o);
  if (!sp.alpha) {
    try { sp.alpha = sp.cv.getContext('2d').getImageData(0, 0, sp.cv.width, sp.cv.height).data; } catch { return true; }
  }
  const cx = Math.round(dx) - sp.x0, cy = Math.round(dy) - sp.y0;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    const X = cx + i, Y = cy + j;
    if (X >= 0 && Y >= 0 && X < sp.cv.width && Y < sp.cv.height && sp.alpha[(Y * sp.cv.width + X) * 4 + 3] > 90) return true;
  }
  return false;
}

export function blocksAt(o, x, y) {
  const T = CATALOG[o.type];
  return T.blocks ? T.blocks(x - o.x, y - o.y, o) : false;
}

/** A small preview image of an object type for the build toolbar. */
export function thumbnail(type, size = 44) {
  const T = CATALOG[type];
  const o = { type, x: 0, y: 0, s: T.sizes ? Math.min(1, T.sizes - 1) : 0, seed: 7, fill: 1 };
  const [x0, y0, x1, y1] = T.bounds(o).map(Math.round);
  const w = x1 - x0, h = y1 - y0;
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const g = src.getContext('2d');
  const oo = { ...o, x: -x0, y: -y0 };
  const s = spriteFor(o);
  g.drawImage(s.cv, 0, 0);
  if (T.live) T.live(g, oo, { t: 0.4, night: 0, R: rng(3) });
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const k = Math.max(1, Math.floor(Math.min(size / w, size / h)));
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
  if (k * w > size || k * h > size) {
    const f = Math.min(size / w, size / h);
    octx.drawImage(src, (size - w * f) / 2, (size - h * f) / 2, w * f, h * f);
  } else octx.drawImage(src, Math.floor((size - w * k) / 2), Math.floor((size - h * k) / 2), w * k, h * k);
  return out.toDataURL();
}

// ---------- the hub house, the city and the mountains ----------

const ARENA = [[100, 48], [130, 60], [160, 72]];
const BED_W = [36, 52, 68];
const RUG_W = [60, 90, 120];
// Tiny pixel icons for door signs, one per area type (5x5, '#' = filled).
const SIGN_ICON = {
  meadow: ['.#.#.', '#####', '.###.', '..#..', '..#..'], desert: ['..#..', '#.#..', '###.#', '..###', '..#..'],
  river: ['..#..', '.###.', '#####', '#####', '.###.'], ocean: ['.....', '#..#.', '.##.#', '.....', '#####'],
  city: ['#.##.', '#.##.', '####.', '#####', '#####'], mountain: ['..#..', '.###.', '.###.', '#####', '#####'],
};

Object.assign(CATALOG, {
  door: {
    label: 'Door', layer: 'ground', fixed: true, liveOrder: 2,
    bounds: () => [-12, -36, 13, 3],
    paint(g) {
      px(g, '#5a3a22', -11, -35, 22, 35); px(g, '#7a5232', -10, -34, 20, 34);
      px(g, '#8a5e38', -9, -33, 18, 33);
      for (let y = -30; y < -1; y += 7) px(g, '#6e4a2c', -8, y, 16, 1);
      px(g, '#e8b84a', 5, -16, 2, 2);
      px(g, '#3a2a1a', -12, 0, 24, 2);
    },
    live(ctx, o, env) {
      const a = env.areas?.get(o.link);
      if ((o.openUntil || 0) > env.t) { px(ctx, '#1e1410', o.x - 9, o.y - 33, 18, 33); px(ctx, '#3a2a1a', o.x - 9, o.y - 33, 3, 33); }
      const [c1, c2] = a?.wall || ['#ccc', '#999'];
      px(ctx, '#3a2a1a', o.x - 8, o.y - 46, 16, 10);
      px(ctx, c1, o.x - 7, o.y - 45, 14, 4); px(ctx, c2, o.x - 7, o.y - 41, 14, 4);
      const icon = SIGN_ICON[a?.biome];
      if (icon) icon.forEach((row, r) => { for (let c = 0; c < 5; c++) if (row[c] === '#') px(ctx, '#ffffff', o.x - 2 + c, o.y - 45 + r * 1.6, 1, 1); });
    },
    hit: (dx, dy) => Math.abs(dx) < 13 && dy > -47 && dy < 3,
  },
  window: {
    label: 'Window', layer: 'ground', liveOrder: 2,
    bounds: () => [-15, -46, 16, -14],
    paint(g) {
      px(g, '#7a5232', -15, -46, 30, 3); px(g, '#7a5232', -15, -19, 30, 3);
      px(g, '#7a5232', -15, -46, 3, 30); px(g, '#7a5232', 12, -46, 3, 30);
      px(g, '#c89a64', -16, -16, 32, 2);
    },
    live(ctx, o, env) {
      const top = env.sky?.top || [110, 180, 255], bottom = env.sky?.bottom || [196, 232, 255];
      for (let y = 0; y < 24; y++) {
        const k = y / 23, c = top.map((v, i) => Math.round(v + (bottom[i] - v) * k));
        ctx.fillStyle = `rgb(${c})`; ctx.fillRect(o.x - 12, o.y - 43 + y, 24, 1);
      }
      if ((env.night || 0) > 0.5) { px(ctx, '#ffffff', o.x - 8, o.y - 40); px(ctx, '#ffffff', o.x + 5, o.y - 36); px(ctx, '#ffffff', o.x - 2, o.y - 30); }
      px(ctx, '#7a5232', o.x - 1, o.y - 43, 2, 24); px(ctx, '#7a5232', o.x - 12, o.y - 32, 24, 2);
      px(ctx, 'rgba(255,255,255,0.35)', o.x - 10, o.y - 41, 3, 6);
    },
  },
  arena: {
    label: 'Arena', layer: 'ground', sizes: 3, def: 1,
    bounds: (o) => { const [w, h] = ARENA[o.s]; return [-w / 2 - 2, -h / 2 - 2, w / 2 + 3, h / 2 + 3]; },
    paint(g, o) {
      const [w, h] = ARENA[o.s], x = -w / 2, y = -h / 2;
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + 1, y + 2, w, h);
      px(g, '#2f5f9e', x, y, w, h); px(g, '#4f86cf', x + 2, y + 2, w - 4, h - 4);
      px(g, '#5a92d8', x + 2, y + 2, w - 4, Math.floor((h - 4) / 2));
      px(g, '#eaf2ff', x + 5, y + 5, w - 10, 1); px(g, '#eaf2ff', x + 5, y + h - 6, w - 10, 1);
      px(g, '#eaf2ff', x + 5, y + 5, 1, h - 10); px(g, '#eaf2ff', x + w - 6, y + 5, 1, h - 10);
      px(g, '#eaf2ff', -0.5, y + 5, 1, h - 10);
      g.strokeStyle = '#eaf2ff'; g.lineWidth = 1; g.beginPath(); g.ellipse(0.5, 0.5, h * 0.22 * 1.6, h * 0.22, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#e04a3a'; fillEllipse(g, 0, -1, 4, 2); g.fillStyle = '#ffffff'; fillEllipse(g, 0, 1, 4, 1);
      px(g, '#2a2a3a', -4, 0, 9, 1); px(g, '#ffffff', 0, 0);
    },
    hit: (dx, dy, o) => { const [w, h] = ARENA[o.s]; return Math.abs(dx) < w / 2 && Math.abs(dy) < h / 2; },
  },
  trainer: {
    label: 'Trainer', layer: 'entity', single: true,
    bounds: () => [-16, -32, 17, 3],
    paint(g) { g.fillStyle = 'rgba(0,0,0,0.22)'; fillEllipse(g, 0, 0, 6, 2); },
    live(ctx, o, env) {
      // Kenney's RPG Urban Pack characters (CC0): columns face left, down, up, right; rows are stand, step, step.
      const sheet = env.trainerSheet;
      if (sheet) {
        const col = { left: 0, down: 1, up: 2, right: 3 }[o.facing || 'down'];
        const step = o.moving ? [1, 0, 2, 0][Math.floor(env.t * 7) % 4] : 0;
        // standing still: a slow breath, one pixel up and down
        const breath = o.moving ? 0 : Math.floor(env.t * 1.1 + (o.seed || 0) * 0.37) % 2;
        const row = ((o.look ?? env.trainerLook ?? 0) % 6) * 3 + step;
        ctx.drawImage(sheet, col * 16, row * 16, 16, 16, Math.round(o.x) - 16, Math.round(o.y) - 31 - breath, 32, 32);
        return;
      }
      const bob = Math.floor(env.t * 1.2) % 2, wave = (o.waveUntil || 0) > env.t, x = o.x, y = o.y - bob;
      px(ctx, '#2a2a3a', x - 3, y - 4, 2, 4); px(ctx, '#2a2a3a', x + 1, y - 4, 2, 4);           // legs
      px(ctx, '#3a3a52', x - 3, y - 10, 6, 6);                                                     // shorts
      px(ctx, '#3a6ad0', x - 4, y - 17, 8, 8); px(ctx, '#ffffff', x - 1, y - 17, 2, 7);            // jacket
      px(ctx, '#f2c8a0', x - 6, y - 15, 2, 5);                                                     // left arm
      if (wave && Math.floor(env.t * 6) % 2) px(ctx, '#f2c8a0', x + 4, y - 22, 2, 6); else px(ctx, '#f2c8a0', x + 4, y - 15, 2, 5);
      px(ctx, '#f2c8a0', x - 3, y - 22, 6, 5);                                                     // face
      px(ctx, '#2a2a3a', x - 2, y - 20, 1, 1); px(ctx, '#2a2a3a', x + 1, y - 20, 1, 1);
      px(ctx, '#3a2a20', x - 4, y - 22, 1, 3); px(ctx, '#3a2a20', x + 3, y - 22, 1, 3);           // hair
      px(ctx, '#d04040', x - 4, y - 25, 8, 3); px(ctx, '#ffffff', x - 1, y - 25, 2, 2); px(ctx, '#d04040', x - 1, y - 22, 6, 1); // cap
    },
    blocks: (dx, dy) => dx * dx + (dy * 2) ** 2 < 25,
    hit: (dx, dy) => Math.abs(dx) < 10 && dy > -30 && dy < 3,
  },
  bed: {
    label: 'Pet bed', layer: 'ground', sizes: 3, def: 1,
    bounds: (o) => { const w = BED_W[o.s]; return [-w / 2 - 2, -12, w / 2 + 3, 14]; },
    paint(g, o) {
      const w = BED_W[o.s];
      g.fillStyle = 'rgba(0,0,0,0.15)'; fillEllipse(g, 1, 3, w / 2 + 1, 10);
      g.fillStyle = '#a04e44'; fillEllipse(g, 0, 1, w / 2, 11);
      g.fillStyle = '#c86a5a'; fillEllipse(g, 0, 0, w / 2 - 1, 10);
      g.fillStyle = '#f2d8c0'; fillEllipse(g, 0, 2, w / 2 - 5, 7);
      g.fillStyle = '#e8c8ae'; for (let x = -w / 2 + 8; x < w / 2 - 6; x += 6) g.fillRect(Math.round(x), -2, 1, 9);
    },
  },
  rug: {
    label: 'Rug', layer: 'ground', sizes: 3, def: 1,
    bounds: (o) => { const w = RUG_W[o.s]; return [-w / 2 - 1, -Math.ceil(w * 0.22) - 1, w / 2 + 2, Math.ceil(w * 0.22) + 2]; },
    paint(g, o) {
      const w = RUG_W[o.s], h = w * 0.22;
      g.fillStyle = '#8a3a3a'; fillEllipse(g, 0, 0, w / 2, h);
      g.fillStyle = '#e8c070'; fillEllipse(g, 0, 0, w / 2 - 3, h - 2);
      g.fillStyle = '#b84a4a'; fillEllipse(g, 0, 0, w / 2 - 6, h - 4);
      g.fillStyle = '#e8c070'; fillEllipse(g, 0, 0, w * 0.18, h * 0.45);
    },
  },
  plant: {
    label: 'Plant', layer: 'entity',
    bounds: () => [-8, -24, 9, 3],
    paint(g, o) {
      const R = rng(o.seed);
      g.fillStyle = 'rgba(0,0,0,0.2)'; fillEllipse(g, 0, 0, 5, 2);
      px(g, '#a8583a', -4, -8, 8, 8); px(g, '#c8704a', -5, -9, 10, 2); px(g, '#8a4630', 2, -7, 1, 7);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (R() - 0.5) * 2.4, L = 7 + R() * 8;
        for (let t = 0; t < 1; t += 0.12) { g.fillStyle = t < 0.7 ? C.leaf : C.leafLight; fillEllipse(g, Math.cos(a) * L * t, -9 + Math.sin(a) * L * t, 1.5, 1); }
      }
    },
    blocks: (dx, dy) => dx * dx + (dy * 2) ** 2 < 16,
  },
  trashcan: {
    label: 'Trash can', layer: 'entity',
    bounds: () => [-6, -15, 7, 3],
    paint(g, o) {
      g.fillStyle = 'rgba(0,0,0,0.22)'; fillEllipse(g, 0, 0, 5, 2);
      px(g, '#5c6470', -4, -11, 8, 11); px(g, '#7c8490', -3, -11, 6, 11);
      for (let x = -2; x < 3; x += 2) px(g, '#5c6470', x, -10, 1, 9);
      px(g, '#4a525e', -5, -13, 10, 2); px(g, '#4a525e', -1, -15, 2, 2);
      if (o.seed % 2) { px(g, '#e8e0c8', 3, -14, 3, 2); px(g, '#8ac06a', -5, -14, 2, 1); }
    },
    blocks: (dx, dy) => dx * dx + (dy * 2) ** 2 < 20,
  },
  litter: {
    label: 'Litter', layer: 'ground', brush: 8,
    bounds: () => [-7, -4, 8, 5],
    paint(g, o) {
      const R = rng(o.seed);
      for (let i = 0; i < 4; i++) {
        const x = Math.round((R() - 0.5) * 12), y = Math.round((R() - 0.5) * 6);
        const k = (o.seed + i) % 3;
        if (k === 0) { px(g, '#e8e4d8', x, y, 2, 2); px(g, '#c8c4b8', x + 1, y + 1); }
        else if (k === 1) { px(g, '#c04a3a', x, y, 2, 1); px(g, '#d8d8d8', x + 2, y); }
        else px(g, '#6a8a4a', x, y, 1, 2);
      }
    },
  },
  bench: {
    label: 'Bench', layer: 'entity',
    bounds: () => [-13, -12, 14, 3],
    paint(g) {
      g.fillStyle = 'rgba(0,0,0,0.2)'; fillEllipse(g, 0, 0, 12, 2);
      px(g, '#4a4a52', -11, -5, 2, 5); px(g, '#4a4a52', 9, -5, 2, 5);
      px(g, '#9a6a3a', -12, -6, 24, 2); px(g, '#b8844a', -12, -6, 24, 1);
      px(g, '#9a6a3a', -12, -11, 24, 2); px(g, '#b8844a', -12, -11, 24, 1);
      px(g, '#4a4a52', -11, -10, 1, 4); px(g, '#4a4a52', 10, -10, 1, 4);
    },
    blocks: (dx, dy) => Math.abs(dx) < 12 && Math.abs(dy) < 3,
  },
  streetlamp: {
    label: 'Street lamp', layer: 'entity', glowY: 31,
    bounds: () => [-5, -36, 6, 2],
    paint(g) {
      g.fillStyle = 'rgba(0,0,0,0.2)'; fillEllipse(g, 0, 0, 3, 1);
      px(g, '#3a3e48', -1, -30, 2, 30); px(g, '#3a3e48', -2, -2, 4, 2);
      px(g, '#3a3e48', -4, -35, 8, 2); px(g, '#d8d0b0', -3, -33, 6, 3);
    },
    live(ctx, o, env) { if (env.night > 0.3) px(ctx, '#ffe9a0', o.x - 3, o.y - 33, 6, 3); },
    blocks: (dx, dy) => dx * dx + (dy * 2) ** 2 < 9,
  },
  building: {
    label: 'Building', layer: 'entity',
    bounds: () => [-28, -70, 30, 4],
    paint(g, o) {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-26, -2, 56, 5);
      const wall = o.seed % 2 ? '#b8645a' : '#8a96a8', dark = o.seed % 2 ? '#94483f' : '#6c7888';
      px(g, dark, -27, -66, 54, 66); px(g, wall, -26, -65, 52, 65);
      for (let y = -62; y < -14; y += 12) for (let x = -22; x < 22; x += 11) { px(g, '#3a4458', x, y, 7, 8); px(g, '#a6d8f0', x + 1, y + 1, 5, 6); }
      px(g, '#4a4a52', -27, -70, 54, 4);
      px(g, '#3a3a42', -5, -14, 10, 14); px(g, '#5a5a62', -4, -13, 8, 13);
      px(g, o.seed % 3 ? '#3f9a4c' : '#d04a3a', -10, -18, 20, 3);
    },
    blocks: (dx, dy) => dx > -28 && dx < 28 && dy > -26 && dy < 3,
    hit: (dx, dy) => dx > -28 && dx < 28 && dy > -70 && dy < 3,
    windows: [[-18, -58], [-7, -58], [4, -58], [15, -58], [-18, -46], [15, -46], [-18, -34], [4, -34]],
  },
  cave: {
    label: 'Cave', layer: 'entity', shade: true,
    bounds: () => [-26, -30, 27, 4],
    paint(g, o) {
      const R = rng(o.seed);
      g.fillStyle = 'rgba(0,0,0,0.2)'; fillEllipse(g, 0, 1, 25, 4);
      g.fillStyle = C.rockDark; fillEllipse(g, 0, -12, 25, 16);
      g.fillStyle = C.rock; fillEllipse(g, -2, -14, 22, 14);
      for (let i = 0; i < 8; i++) { g.fillStyle = C.rockLight; fillEllipse(g, (R() - 0.5) * 34, -14 - R() * 12, 3, 1.5); }
      g.fillStyle = '#1a1612'; fillEllipse(g, 0, -6, 9, 8); g.fillRect(-9, -6, 19, 6);
      g.fillStyle = C.moss; fillEllipse(g, 10, -24, 5, 1);
    },
    blocks: (dx, dy) => dx * dx + (dy * 2.2) ** 2 < 420 && dy < -1,
  },
});
