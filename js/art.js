// Shared pixel-art helpers and palette.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const C = {
  grass: '#6fbf5a', grassDark: '#5aa64a', grassLight: '#86d46a', tuft: '#4a8f3e',
  path: '#d9c08a', pathEdge: '#bfa36c', pathDot: '#c8ad76',
  sand: '#ead6a0', sandEdge: '#cfb780', sandDot: '#f6e8c0',
  trunk: '#7a5232', trunkDark: '#5a3a22',
  leafDark: '#2f7a3e', leaf: '#3f9a4c', leafLight: '#5cb85a', leafHi: '#86d46e',
  pineDark: '#1f5a36', pine: '#2f7a46', pineHi: '#4a9a5a',
  backTree: '#2a6438', backTree2: '#337a42',
  rock: '#8d929e', rockLight: '#aeb3bd', rockDark: '#686c78', moss: '#5f9a4a',
  waterDeep: '#3576c8', water: '#4a94dc', waterLight: '#78bdf0', foam: '#eaf7ff',
  wall: '#ecd0a0', wallLine: '#cfa978', roof: '#c4534b', roofDark: '#9b3d39', roofLight: '#dd6e5e',
  door: '#7a4a2a', windowDay: '#a6d8f0', frame: '#8a5a34',
  fence: '#cfa472', fenceDark: '#a27a4c',
  hay: '#e8c860', hayDark: '#c9a443', hayLight: '#f6dc84',
  bowl: '#a86e3c', bowlRim: '#c88e52', bowlDark: '#7c4e28',
  hills: '#86b7a6', hills2: '#a2cbb6',
};

export const BERRIES = ['#e44a4a', '#4a6ee0', '#f27ab4', '#f2cf3a', '#8a4ad8'];
export const FLOWERS = ['#ffffff', '#ffe066', '#ff9ac8', '#c8a0ff', '#ff8060'];

export function fillEllipse(ctx, cx, cy, rx, ry) {
  for (let y = -ry; y <= ry; y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)));
    ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
  }
}

export function px(ctx, color, x, y, w = 1, h = 1) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
