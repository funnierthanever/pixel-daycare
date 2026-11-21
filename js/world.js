// The daycare grounds: an editable layout of objects and painted terrain,
// plus walkability, named spots for the Pokémon, sky and lighting.
import { C, fillEllipse, px, rng } from './art.js';
import { CATALOG, drawObject, blocksAt } from './objects.js';

export { rng, fillEllipse };

// ---------- time of day ----------

const KEYS = [
  // hour, ambient tint (multiplied over everything), sky top, sky bottom
  [0, [74, 84, 150], [8, 12, 40], [28, 38, 88]],
  [4.6, [74, 84, 150], [8, 12, 40], [28, 38, 88]],
  [5.6, [150, 124, 176], [60, 64, 140], [210, 140, 150]],
  [6.6, [255, 214, 184], [120, 150, 230], [255, 190, 150]],
  [8, [255, 255, 255], [110, 180, 255], [196, 232, 255]],
  [16.4, [255, 255, 255], [110, 180, 255], [196, 232, 255]],
  [17.8, [255, 194, 150], [96, 110, 200], [255, 160, 110]],
  [19.1, [146, 116, 176], [42, 44, 112], [170, 96, 126]],
  [20.4, [74, 84, 150], [8, 12, 40], [28, 38, 88]],
  [24, [74, 84, 150], [8, 12, 40], [28, 38, 88]],
];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export function lightAt(hour) {
  let i = 0;
  while (i < KEYS.length - 2 && hour >= KEYS[i + 1][0]) i++;
  const [h0, t0, s0, b0] = KEYS[i], [h1, t1, s1, b1] = KEYS[i + 1];
  const f = Math.min(1, Math.max(0, (hour - h0) / (h1 - h0)));
  const tint = mix(t0, t1, f);
  const night = 1 - (tint[0] + tint[1] + tint[2] - 308) / (765 - 308); // 0 in full day, 1 at night
  return { tint, skyTop: mix(s0, s1, f), skyBottom: mix(b0, b1, f), night: Math.min(1, Math.max(0, night)) };
}

export function phaseName(hour) {
  if (hour >= 5 && hour < 8) return 'Morning';
  if (hour >= 8 && hour < 12) return 'Day';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 20) return 'Evening';
  return 'Night';
}

// ---------- terrain ----------

export const CELL = 4;
export const TERRAIN = [
  { key: '.', label: 'Grass' },
  { key: 'p', label: 'Path', base: C.path, edge: C.pathEdge, dot: C.pathDot },
  { key: 's', label: 'Sand', base: C.sand, edge: C.sandEdge, dot: C.sandDot },
  { key: 'w', label: 'Water', base: C.water, edge: C.waterLight, dot: C.waterLight },
  { key: 'n', label: 'Snow', base: '#f2f6fa', edge: '#cfdbe8', dot: '#ffffff' },
  { key: 'r', label: 'Road', base: '#5e5e66', edge: '#d8d0a0', dot: '#6c6c74' },
];
const WATER = 3;

/** The areas a box can be. Each has its own ground, backdrop and starting layout. */
export const BIOMES = {
  meadow: { label: 'Meadow', ground: [C.grass, C.grassLight, C.grassDark], tuft: C.tuft, backdrop: 'hills', hills: [C.hills2, C.hills], back: 'trees', groundName: 'Grass', wall: ['#8fd47a', '#4f9a48'] },
  desert: { label: 'Desert', ground: ['#e3c48a', '#eed6a4', '#d2ac6e'], tuft: '#b98d52', backdrop: 'mesas', back: 'dunes', groundName: 'Dunes', wall: ['#f2c97c', '#c9824a'] },
  river: { label: 'River', ground: ['#5fb05a', '#7acb68', '#4c9848'], tuft: '#3c8236', backdrop: 'hills', hills: ['#9cc9b0', '#76ab92'], back: 'forest', groundName: 'Grass', wall: ['#7cc8d8', '#3f8a6a'] },
  ocean: { label: 'Beach', ground: ['#eedba6', '#f7e9c2', '#dcc58c'], tuft: '#c9ad74', backdrop: 'sea', back: 'none', groundName: 'Sand', wall: ['#8fd0f4', '#e8d49a'] },
  city: { label: 'City', ground: ['#a9a6a2', '#bab7b2', '#97948f'], tuft: '#7e7b76', backdrop: 'skyline', back: 'brick', groundName: 'Pavement', wall: ['#b8c0d0', '#6a7488'] },
  mountain: { label: 'Mountain', ground: ['#9c9282', '#b0a694', '#887e6f'], tuft: '#6f675b', backdrop: 'peaks', back: 'ridge', groundName: 'Rock', wall: ['#c8d8e8', '#7a7064'] },
  hub: { label: 'Hub', indoor: true, ground: ['#c99c66', '#d4a874', '#b98c58'], tuft: '#9c7048', backdrop: 'wall', back: 'none', groundName: 'Floor', wall: ['#f6d27a', '#c9824a'] },
};

const hash = (i, j) => { let h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return (h ^ (h >>> 15)) >>> 0; };

// ---------- layout ----------

function frame(W, H) {
  const skyH = Math.round(H * 0.11);
  const groundTop = Math.round(H * 0.245);
  return { W, H, skyH, groundTop, buildTop: groundTop + 6, paintTop: groundTop + 8, bounds: { x0: 8, x1: W - 8, y0: groundTop + 10, y1: H - 19 } };
}

/** The starting layout for a biome, laid out for this screen size. */
export function defaultLayout(W, H, biome = 'meadow') {
  if (biome === 'desert') return desertLayout(W, H);
  if (biome === 'river') return riverLayout(W, H);
  if (biome === 'ocean') return beachLayout(W, H);
  if (biome === 'city') return cityLayout(W, H);
  if (biome === 'mountain') return mountainLayout(W, H);
  if (biome === 'hub') return hubLayout(W, H);
  return meadowLayout(W, H);
}

function cityLayout(W, H) {
  const S = starter(W, H), { L } = S;
  S.homestead(Math.round(W * 0.04));
  for (let i = 0; i < 3; i++) S.add('building', W * (0.42 + i * 0.2), L.groundTop + 34, 0, i);
  // a road across the front with a crossing
  const roadY = Math.round(H * 0.8);
  for (let x = 0; x < W; x += 2) for (let y = roadY - 7; y <= roadY + 7; y += 2) S.set(x, y, 'r');
  const bowlY = Math.round(H * 0.56);
  for (let i = 0; i < 3; i++) S.add('bowl', W * 0.32 + i * 24, bowlY + (i === 1 ? 6 : 0), 0, i);
  for (const fx of [0.25, 0.5, 0.75, 0.95]) S.add('streetlamp', W * fx, roadY - 10);
  S.add('bench', W * 0.62, H * 0.6); S.add('bench', W * 0.86, H * 0.62);
  S.scatter('trashcan', 4, { top: 50, gap: 30 });
  S.scatter('litter', 10, { top: 50 });
  S.scatter('plant', 3, { top: 50, gap: 30 });
  return S.done('city');
}

function mountainLayout(W, H) {
  const S = starter(W, H), { L } = S;
  S.homestead(Math.round(W * 0.04));
  S.add('cave', W * 0.84, L.groundTop + 40, 0, 7);
  S.add('pond', W * 0.6, L.groundTop + Math.round(H * 0.3), 0);
  // snow lingers near the peaks
  for (let k = 0; k < 7; k++) {
    const cx = S.R() * W, cy = L.paintTop + S.R() * 22, r = 8 + S.R() * 14;
    for (let x = cx - r; x <= cx + r; x += 2) for (let y = cy - r / 2; y <= cy + r / 2; y += 2) if (((x - cx) / r) ** 2 + ((y - cy) / (r / 2)) ** 2 < 1) S.set(x, y, 'n');
  }
  const bowlY = Math.round(H * 0.58);
  for (let i = 0; i < 3; i++) S.add('bowl', W * 0.36 + i * 24, bowlY + (i === 1 ? 6 : 0), 0, i);
  S.add('lantern', W * 0.36 - 18, bowlY - 10);
  S.add('rock', W * 0.2, H * 0.8, 2); S.add('rock', W * 0.7, H * 0.78, 1);
  S.scatter('pine', 8, { size: () => Math.floor(S.R() * 3), gap: 26 });
  S.scatter('boulder', 6, { size: () => Math.floor(S.R() * 3) });
  return S.done('mountain');
}

// The big central house. Doors to every area are added along the back wall (see syncDoors).
function hubLayout(W, H) {
  const S = starter(W, H), { L } = S;
  const floor = L.buildTop;
  for (const fx of [0.3, 0.55, 0.8]) S.add('window', W * fx, floor);
  S.add('rug', W * 0.2, H * 0.6, 2);
  S.add('trainer', W * 0.2, H * 0.56);
  S.add('arena', W * 0.64, H * 0.7, 2);
  S.add('bed', W * 0.1, H * 0.86, 1); S.add('bed', W * 0.27, H * 0.9, 1); S.add('bed', W * 0.94, H * 0.5, 0);
  const bowlY = Math.round(H * 0.45);
  for (let i = 0; i < 3; i++) S.add('bowl', W * 0.38 + i * 22, bowlY + (i === 1 ? 5 : 0), 0, i);
  S.add('lantern', W * 0.07, H * 0.52);
  S.add('plant', W * 0.04, floor + 14, 0, 3); S.add('plant', W * 0.97, floor + 14, 0, 4); S.add('plant', W * 0.5, H * 0.9, 0, 5);
  return S.done('hub');
}

// Shared helpers for building a starting layout.
function starter(W, H) {
  const L = frame(W, H);
  const objects = [];
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL);
  const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));
  const R = rng(W * 7 + H);
  const add = (type, x, y, s = CATALOG[type].def ?? 0, seed = objects.length + 11) => objects.push({ type, x: Math.round(x), y: Math.round(y), s, seed });
  const set = (x, y, k) => { const i = Math.floor(x / CELL), j = Math.floor(y / CELL); if (j >= 0 && j < rows && i >= 0 && i < cols && j * CELL >= L.paintTop) grid[j][i] = k; };
  const cell = (x, y) => grid[Math.floor(y / CELL)]?.[Math.floor(x / CELL)];
  const clear = (x, y, r = 22) => objects.every((o) => Math.hypot(o.x - x, (o.y - y) * 1.6) > (o.type === 'pond' ? 60 : o.type === 'house' ? 50 : r)) && cell(x, y) === '.';
  const scatter = (type, n, opts = {}) => {
    for (let k = 0, placed = 0; k < n * 12 && placed < n; k++) {
      const x = 14 + R() * (W - 28), y = L.groundTop + (opts.top ?? 20) + R() * (H - L.groundTop - (opts.top ?? 20) - 24);
      if (opts.where && !opts.where(x, y)) continue;
      if (!clear(x, y, opts.gap ?? 22)) continue;
      add(type, x, y, opts.size ? opts.size() : CATALOG[type].def ?? 0, 100 + k);
      placed++;
    }
  };
  const homestead = (x0) => {
    const door = { x: x0 + 30, y: L.groundTop + 36 };
    add('house', door.x, door.y);
    add('hay', door.x + 44, door.y + 21, 1);
    return door;
  };
  const fence = (gateX) => { for (let x = 8; x < W + 8; x += 16) if (gateX == null || Math.abs(x - gateX) >= 14) add('fence', x, H - 2); };
  const done = (biome) => ({ v: 1, W, H, biome, objects, terrain: grid.map((r) => r.join('')) });
  return { L, objects, grid, R, add, set, cell, clear, scatter, homestead, fence, done };
}

function desertLayout(W, H) {
  const S = starter(W, H), { L } = S;
  S.homestead(Math.round(W * 0.04));
  // an oasis with palms
  const ox = Math.round(W * 0.74), oy = L.groundTop + Math.round(H * 0.24);
  S.add('pond', ox, oy, 0);
  S.add('palm', ox - 40, oy + 4, 2, 3); S.add('palm', ox + 38, oy - 2, 1, 4); S.add('palm', ox + 18, oy + 26, 0, 5);
  S.add('reeds', ox - 26, oy + 14); S.add('reeds', ox + 28, oy + 12);
  const bowlY = Math.round(H * 0.6);
  for (let i = 0; i < 3; i++) S.add('bowl', W * 0.42 + i * 26, bowlY + (i === 1 ? 6 : 0), 0, i);
  S.add('lantern', W * 0.42 - 18, bowlY - 10);
  S.add('rock', W * 0.2, H * 0.78, 2); S.add('rock', W * 0.62, H * 0.82, 1);
  S.scatter('cactus', 9, { size: () => Math.floor(S.R() * 3), gap: 26 });
  S.scatter('boulder', 4, { size: () => Math.floor(S.R() * 3) });
  S.scatter('flowers', 3);
  S.fence(Math.round(W * 0.2));
  return S.done('desert');
}

function riverLayout(W, H) {
  const S = starter(W, H), { L } = S;
  S.homestead(Math.round(W * 0.04));
  // a river from a waterfall at the back down to the bottom, with a sandy ford to cross
  const srcX = Math.round(W * 0.66), topY = L.paintTop + 10;
  S.add('waterfall', srcX, topY, 0);
  const riverX = (y) => srcX - (y - topY) * 0.32 + Math.sin((y - topY) / 22) * 10;
  const fordY = Math.round(H * 0.64);
  for (let y = topY + 4; y < H + 4; y += 2) {
    const cx = riverX(y), half = 9 + Math.sin(y / 17) * 2;
    for (let x = cx - half - 5; x <= cx + half + 5; x += 2) {
      const inRiver = Math.abs(x - cx) <= half, inFord = Math.abs(y - fordY) < 7;
      if (inRiver && !inFord) S.set(x, y, 'w');
      else if (S.cell(x, y) === '.' && (inFord || Math.abs(x - cx) <= half + 4)) S.set(x, y, 's');
    }
  }
  for (let k = 0; k < 9; k++) { const y = topY + 30 + k * ((H - topY - 40) / 9); if (Math.abs(y - fordY) > 14) S.add('reeds', riverX(y) + (k % 2 ? 1 : -1) * 16, y, 0, k); }
  const bowlY = Math.round(H * 0.5);
  for (let i = 0; i < 3; i++) S.add('bowl', W * 0.28 + i * 24, bowlY + (i === 1 ? 6 : 0), 0, i);
  S.add('lantern', W * 0.28 - 18, bowlY - 10);
  S.add('rock', W * 0.86, H * 0.74, 1);
  S.scatter('tree', 5, { size: () => 1 + Math.floor(S.R() * 2), gap: 30 });
  S.scatter('bush', 4);
  S.scatter('flowers', 8);
  S.fence(Math.round(W * 0.2));
  return S.done('river');
}

function beachLayout(W, H) {
  const S = starter(W, H), { L } = S;
  // the sea fills the back of the field, with a wavy shoreline
  const shore = (x) => L.groundTop + H * 0.2 + Math.sin(x / 37) * 6 + Math.sin(x / 13) * 2;
  for (let x = 0; x < W; x += 2) for (let y = L.paintTop; y < shore(x); y += 2) S.set(x, y, 'w');
  for (let x = 0; x < W; x += 2) S.set(x, shore(x) + 2, 's');
  const door = { x: Math.round(W * 0.12), y: Math.round(H * 0.62) };
  S.add('house', door.x, door.y);
  S.add('hay', door.x + 44, door.y + 21, 1);
  const bowlY = Math.round(H * 0.62);
  for (let i = 0; i < 3; i++) S.add('bowl', W * 0.5 + i * 26, bowlY + (i === 1 ? 6 : 0), 0, i);
  S.add('lantern', W * 0.5 - 18, bowlY - 10);
  S.add('rock', W * 0.78, H * 0.56, 2); S.add('rock', W * 0.33, H * 0.86, 1);
  S.add('boulder', W * 0.6, shore(W * 0.6) - 6, 1); S.add('boulder', W * 0.9, shore(W * 0.9) - 4, 2);
  S.scatter('palm', 5, { top: 50, size: () => Math.floor(S.R() * 3), gap: 34 });
  S.scatter('shell', 8, { top: 50 });
  return S.done('ocean');
}

function meadowLayout(W, H) {
  const L = frame(W, H);
  const { groundTop } = L;
  const objects = [];
  const add = (type, x, y, s = CATALOG[type].def ?? 0, seed = objects.length + 11) => objects.push({ type, x: Math.round(x), y: Math.round(y), s, seed });

  const cabin = { x: Math.round(W * 0.04), y: groundTop - 22 };
  const door = { x: cabin.x + 30, y: cabin.y + 58 };
  add('house', door.x, door.y);
  add('hay', door.x + 16 + 28, door.y + 10 + 11, 1);
  const pond = { cx: Math.round(W * 0.8), cy: groundTop + Math.round(H * 0.17) };
  const fallBase = pond.cy - 25 + 6;
  add('waterfall', pond.cx, fallBase, Math.max(0, Math.min(2, Math.round((fallBase - L.skyH - 45) / 20))));
  add('pond', pond.cx, pond.cy, 1);
  add('rock', W * 0.63, H * 0.79, 1);
  [[0.37, 0.37], [0.585, 0.39], [0.07, 0.84], [0.93, 0.85], [0.3, 0.7]].forEach(([fx, fy], i) => add('tree', W * fx, H * fy, i === 2 ? 2 : 1, 11 + i));
  const bowlY = Math.round(H * 0.56);
  for (let i = 0; i < 3; i++) add('bowl', W * 0.44 + i * 26, bowlY + (i === 1 ? 6 : 0), 0, i);
  add('lantern', W * 0.44 - 18, bowlY - 10);
  const gateX = Math.round(W * 0.2);
  for (let x = 8; x < W + 8; x += 16) if (Math.abs(x - gateX) >= 14) add('fence', x, H - 2);

  // a dirt path from the door down to the gate
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL);
  const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));
  const p0 = { x: door.x, y: door.y + 2 }, p2 = { x: gateX, y: H }, p1 = { x: door.x - 14, y: (door.y + H) / 2 };
  for (let t = 0; t <= 1; t += 0.005) {
    const x = (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
    const y = (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
    for (let dy = -4; dy <= 4; dy += 2) for (let dx = -7; dx <= 7; dx += 2) {
      if ((dx / 7.5) ** 2 + (dy / 4.5) ** 2 > 1) continue;
      const i = Math.floor((x + dx) / CELL), j = Math.floor((y + dy) / CELL);
      if (j >= 0 && j < rows && i >= 0 && i < cols && (y + dy) >= L.paintTop) grid[j][i] = 'p';
    }
  }

  // scattered flowers away from everything else
  const R = rng(1234);
  const busy = (x, y) => objects.some((o) => o.type !== 'fence' && Math.hypot(o.x - x, (o.y - y) * 1.6) < (o.type === 'pond' ? 70 : o.type === 'house' ? 50 : 24))
    || grid[Math.floor(y / CELL)]?.[Math.floor(x / CELL)] !== '.';
  for (let k = 0; k < 40 && objects.filter((o) => o.type === 'flowers').length < 16; k++) {
    const x = 10 + R() * (W - 20), y = groundTop + 18 + R() * (H - groundTop - 36);
    if (!busy(x, y)) add('flowers', x, y, 0, k);
  }
  return { v: 1, W, H, biome: 'meadow', objects, terrain: grid.map((r) => r.join('')) };
}

// ---------- world ----------

export function createWorld(W, H, layout, biome = 'meadow', opts = {}) {
  if (typeof biome !== 'string' || !Object.hasOwn(BIOMES, biome)) biome = 'meadow';
  const L = frame(W, H);
  const R = rng(Date.now() & 0xffff);
  const world = { L, biome, indoor: !!BIOMES[biome].indoor, objects: [], particles: [], effects: [], battles: [], fireflies: [], butterflies: [], random: R, lanternLit: false, time: 0 };
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL);
  const terrain = new Uint8Array(cols * rows);
  world.background = drawGrass(L, biome);
  const tcv = document.createElement('canvas');
  tcv.width = W; tcv.height = H;
  const tctx = tcv.getContext('2d');
  let waterCells = [];
  let nextId = 1;
  const of = (type) => world.objects.filter((o) => o.type === type);

  // ----- terrain -----
  const cellAt = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? -1 : terrain[j * cols + i]);
  world.terrainAt = (x, y) => cellAt(Math.floor(x / CELL), Math.floor(y / CELL));

  function drawCell(i, j) {
    const x = i * CELL, y = j * CELL;
    tctx.clearRect(x, y, CELL, CELL);
    const c = cellAt(i, j);
    if (c <= 0) return;
    const T = TERRAIN[c];
    // At the beach, painted water joins the open sea at the back without a seam.
    const same = (di, dj) => cellAt(i + di, j + dj) === c || cellAt(i + di, j + dj) === -1
      || (c === WATER && biome === 'ocean' && (j + dj) * CELL < L.paintTop);
    tctx.fillStyle = T.base; tctx.fillRect(x, y, CELL, CELL);
    const h = hash(i, j);
    if (c === WATER && biome !== 'ocean' && same(1, 0) && same(-1, 0) && same(0, 1) && same(0, -1) && same(1, 1) && same(-1, -1) && same(1, -1) && same(-1, 1)) {
      if ((i + j) % 2 === 0 && h % 3) { tctx.fillStyle = C.waterDeep; tctx.fillRect(x, y, CELL, CELL); }
    }
    tctx.fillStyle = T.edge;
    if (!same(0, -1)) tctx.fillRect(x, y, CELL, 1);
    if (!same(0, 1)) tctx.fillRect(x, y + CELL - 1, CELL, 1);
    if (!same(-1, 0)) tctx.fillRect(x, y, 1, CELL);
    if (!same(1, 0)) tctx.fillRect(x + CELL - 1, y, 1, CELL);
    // round off outside corners so painted areas don't look boxy
    if (!same(0, -1) && !same(-1, 0)) tctx.clearRect(x, y, 1, 1);
    if (!same(0, -1) && !same(1, 0)) tctx.clearRect(x + CELL - 1, y, 1, 1);
    if (!same(0, 1) && !same(-1, 0)) tctx.clearRect(x, y + CELL - 1, 1, 1);
    if (!same(0, 1) && !same(1, 0)) tctx.clearRect(x + CELL - 1, y + CELL - 1, 1, 1);
    if (c !== WATER && h % 3 === 0) { tctx.fillStyle = T.dot; tctx.fillRect(x + 1 + (h >> 4) % 2, y + 1 + (h >> 6) % 2, 1, 1); }
  }
  function redrawAround(i, j) { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) drawCell(i + di, j + dj); }
  function collectWater() { waterCells = []; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (terrain[j * cols + i] === WATER) waterCells.push([i, j]); }

  /** Paints terrain code c (index into TERRAIN) around canvas point x,y. radius is in cells. */
  world.paint = (x, y, c, radius = 1) => {
    const ci = Math.floor(x / CELL), cj = Math.floor(y / CELL);
    let changed = false;
    for (let dj = -radius; dj <= radius; dj++) for (let di = -radius; di <= radius; di++) {
      if (di * di + dj * dj > radius * radius + (radius > 1 ? 1 : radius)) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= cols || j >= rows || j * CELL < L.paintTop) continue;
      if (terrain[j * cols + i] !== c) { terrain[j * cols + i] = c; changed = true; redrawAround(i, j); }
    }
    if (changed) collectWater();
    return changed;
  };

  // ----- objects -----
  const clampObj = (o) => {
    o.x = Math.round(Math.min(W - 2, Math.max(2, o.x)));
    o.y = Math.round(Math.min(H - 1, Math.max(L.buildTop, o.y)));
    return o;
  };
  world.add = (type, x, y, extra = {}) => {
    const T = CATALOG[type];
    const o = clampObj({ type, x, y, s: T.def ?? 0, seed: Math.floor(Math.random() * 1e6), id: nextId++, ...extra });
    world.objects.push(o);
    world.refresh();
    return o;
  };
  world.remove = (o) => { world.objects = world.objects.filter((p) => p !== o); world.refresh(); };
  world.move = (o, x, y) => { o.x = x; o.y = y; clampObj(o); };

  /** Re-derives the lists the Pokémon use after objects are added or removed. */
  world.refresh = () => {
    world.bowls = of('bowl');
    for (const b of world.bowls) { if (b.fill === undefined) b.fill = 1; if (!b.eaters) b.eaters = new Set(); }
    world.lanterns = world.objects.filter((o) => o.type === 'lantern' || o.type === 'streetlamp');
    world.houses = of('house');
    world.lit = world.objects.filter((o) => CATALOG[o.type].windows);
    world.trainer = of('trainer')[0] || null;
    world.arena = of('arena')[0] || null;
    world.doors = of('door');
    world.waters = world.objects.filter((o) => CATALOG[o.type].water);
    world.falls = of('waterfall');
  };

  world.load = (data) => {
    // A world built on a different screen size is stretched to fit this one.
    const sx = data.W ? W / data.W : 1, sy = data.H ? H / data.H : 1;
    const resize = Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01;
    world.objects = (data.objects || []).filter((o) => o && typeof o.type === 'string' && Object.hasOwn(CATALOG, o.type))
      .map((o) => clampObj({ ...o, x: resize ? o.x * sx : o.x, y: resize ? o.y * sy : o.y, s: Math.min(o.s | 0, (CATALOG[o.type].sizes || 1) - 1), id: nextId++ }));
    terrain.fill(0);
    const src = data.terrain || [];
    for (let j = 0; j < rows; j++) {
      const row = src[resize ? Math.floor(j / sy) : j];
      if (!row || j * CELL < L.paintTop) continue;
      for (let i = 0; i < cols; i++) {
        const ch = row[resize ? Math.floor(i / sx) : i];
        const c = ch ? TERRAIN.findIndex((t) => t.key === ch) : 0;
        if (c > 0) terrain[j * cols + i] = c;
      }
    }
    tctx.clearRect(0, 0, W, H);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (terrain[j * cols + i]) drawCell(i, j);
    collectWater();
    world.refresh();
  };

  world.serialize = () => {
    const out = [];
    for (let j = 0; j < rows; j++) {
      let s = '';
      for (let i = 0; i < cols; i++) s += TERRAIN[terrain[j * cols + i]].key;
      out.push(s.replace(/\.+$/, ''));
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return { v: 1, W, H, biome, objects: world.objects.map(({ type, x, y, s, seed, link }) => (link ? { type, x, y, s, seed, link } : { type, x, y, s, seed })), terrain: out };
  };

  // ----- walkability -----
  const inEll = (w, x, y, k) => ((x - w.cx) / (w.rx * k)) ** 2 + ((y - w.cy) / (w.ry * k)) ** 2 < 1;
  const shapes = () => world.waters.map((o) => CATALOG[o.type].water(o));
  world.isWater = (x, y) => world.terrainAt(x, y) === WATER || shapes().some((w) => inEll(w, x, y, 1));
  world.isWalkable = (x, y, canWade = false) => {
    const b = L.bounds;
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return false;
    for (const o of world.objects) if (!o._skip && blocksAt(o, x, y)) return false;
    for (const w of shapes()) {
      if (!inEll(w, x, y, 1.08)) continue;
      if (!canWade) return false;
      if (inEll(w, x, y, 0.75)) return false; // too deep
      return true;
    }
    if (world.terrainAt(x, y) === WATER && !canWade) return false;
    return true;
  };
  world.segmentClear = (a, b, canWade) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.ceil(d / 3);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!world.isWalkable(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, canWade)) return false;
    }
    return true;
  };
  world.randomPoint = (canWade = false, near = null, radius = 60) => {
    for (let i = 0; i < 60; i++) {
      const x = near ? near.x + (R() * 2 - 1) * radius : L.bounds.x0 + R() * (L.bounds.x1 - L.bounds.x0);
      const y = near ? near.y + (R() * 2 - 1) * radius * 0.6 : L.bounds.y0 + R() * (L.bounds.y1 - L.bounds.y0);
      if (world.isWalkable(x, y, canWade) && !(canWade && world.isWater(x, y))) return { x, y };
    }
    return near ? world.randomPoint(canWade, null) : { x: L.W * 0.5, y: L.H * 0.7 };
  };
  /** Closest walkable point, for Pokémon that end up inside something you just built. */
  world.nearestWalkable = (x, y, canWade = false) => {
    if (world.isWalkable(x, y, canWade)) return { x, y };
    for (let r = 3; r < 200; r += 3) for (let a = 0; a < 16; a++) {
      const p = { x: x + Math.cos(a * Math.PI / 8) * r, y: y + Math.sin(a * Math.PI / 8) * r * 0.7 };
      if (world.isWalkable(p.x, p.y, canWade)) return p;
    }
    return world.randomPoint(canWade);
  };
  world.nearest = (list, p) => list.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] || null;
  const pick = (list) => list[Math.floor(R() * list.length)];

  /**
   * Where Pokémon come and go. In the hub that's the door to the given area; outdoors it's the house
   * (the way into the hub). With no house, they use the left edge of the field.
   */
  world.portal = (areaId) => {
    if (world.indoor) {
      const d = world.doors.find((o) => o.link === areaId);
      if (d) return { x: d.x, y: d.y + 8, door: d };
    } else if (world.houses[0]) {
      const h = world.houses[0];
      return { x: h.x, y: h.y + 6, door: h };
    }
    return { x: 12, y: L.H * 0.72, door: null };
  };

  /** Keeps exactly one hub door per area: adds doors for new areas and removes doors to deleted ones. */
  world.syncDoors = (areaIds) => {
    let changed = false;
    for (const d of of('door')) if (!areaIds.includes(d.link)) { world.objects = world.objects.filter((o) => o !== d); changed = true; }
    for (const id of areaIds) {
      if (world.objects.some((o) => o.type === 'door' && o.link === id)) continue;
      const wall = world.objects.filter((o) => o.type === 'door' || o.type === 'window');
      let best = 24, bestGap = -1;
      for (let x = 20; x <= W - 20; x += 4) {
        const gap = Math.min(...wall.map((o) => Math.abs(o.x - x) - (o.type === 'window' ? 4 : 0)), 999);
        if (gap > bestGap) { bestGap = gap; best = x; }
      }
      world.objects.push(clampObj({ type: 'door', x: best, y: L.buildTop, s: 0, seed: 1, link: id, id: nextId++ }));
      changed = true;
    }
    if (changed) world.refresh();
    return changed;
  };

  // ----- named spots -----
  const hayBeds = () => world.objects.filter((o) => o.type === 'hay' || o.type === 'bed');
  const HAY_W = [36, 56, 76];
  const BED_WIDTH = { hay: [36, 56, 76], bed: [36, 52, 68] };
  world.spots = {
    bed: (i) => {
      const hays = hayBeds();
      if (hays.length) {
        const hay = hays[i % hays.length], k = Math.floor(i / hays.length);
        const w = BED_WIDTH[hay.type][hay.s], mx = hay.x - w / 2, my = hay.y - 11;
        const n = Math.max(1, Math.floor((w - 4) / 13));
        const c = k % n, r = Math.floor(k / n) % 2;
        return { x: mx + 8 + c * 13 + (r ? 6 : 0), y: my + 13 + r * 7 };
      }
      const house = world.houses[0];
      if (house) return { x: house.x - 14 + (i % 4) * 9, y: house.y + 10 + (Math.floor(i / 4) % 3) * 8 };
      return null;
    },
    egg: (i) => {
      const hay = hayBeds()[0];
      if (hay) return { x: hay.x + BED_WIDTH[hay.type][hay.s] / 2 - 7 - i * 9, y: hay.y + 7 };
      const house = world.houses[0];
      if (house) return { x: house.x + 14 + i * 9, y: house.y + 8 };
      return { x: L.W * 0.5 + i * 9, y: L.H * 0.6 };
    },
    shade: (i) => {
      const trees = world.objects.filter((o) => CATALOG[o.type].shade);
      if (!trees.length) return null;
      const t = trees[i % trees.length];
      const side = Math.floor(i / trees.length) % 2 ? 1 : -1;
      return { x: t.x + side * 11, y: t.y + 3, tree: t };
    },
    shore: () => {
      for (let n = 0; n < 24; n++) {
        let p, face;
        if (world.waters.length && (n % 2 === 0 || !waterCells.length)) {
          const o = pick(world.waters), w = CATALOG[o.type].water(o);
          const a = R() * Math.PI * 2;
          p = { x: w.cx + Math.cos(a) * (w.rx + 7), y: w.cy + Math.sin(a) * (w.ry + 6) };
          face = { x: w.cx, y: w.cy };
        } else if (waterCells.length) {
          const [i, j] = pick(waterCells);
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => cellAt(i + a, j + b) !== WATER && cellAt(i + a, j + b) !== -1);
          if (!dirs.length) continue;
          const [a, b] = pick(dirs);
          p = { x: (i + a) * CELL + CELL / 2 + a * 3, y: (j + b) * CELL + CELL / 2 + b * 3 };
          face = { x: i * CELL + 2, y: j * CELL + 2 };
        } else return null;
        if (world.isWalkable(p.x, p.y)) return { ...p, face };
      }
      return null;
    },
    wade: () => {
      for (let n = 0; n < 30; n++) {
        let p;
        if (world.waters.length && (n % 2 === 0 || !waterCells.length)) {
          const o = pick(world.waters), w = CATALOG[o.type].water(o);
          const a = R() * Math.PI * 2, k = 0.8 + R() * 0.2;
          p = { x: w.cx + Math.cos(a) * w.rx * k, y: w.cy + Math.sin(a) * w.ry * k, face: { x: w.cx, y: w.cy } };
        } else if (waterCells.length) {
          const [i, j] = pick(waterCells);
          p = { x: i * CELL + 2, y: j * CELL + 2 };
        } else return null;
        if (world.isWalkable(p.x, p.y, true)) return p;
      }
      return null;
    },
    rock: () => {
      const rocks = of('rock');
      if (!rocks.length) return null;
      const r = pick(rocks), rx = [12, 17, 22][r.s];
      return { x: r.x + (R() * 2 - 1) * rx * 0.6, y: r.y + (R() * 2 - 1) * 2 };
    },
    waterfallView: () => {
      if (!world.falls.length) return null;
      const o = pick(world.falls), fall = CATALOG.waterfall.fall(o);
      for (let n = 0; n < 30; n++) {
        const p = { x: o.x + (R() * 2 - 1) * (26 + n * 2), y: o.y + 12 + R() * (10 + n * 2.5), fall };
        if (world.isWalkable(p.x, p.y)) return p;
      }
      return null;
    },
  };

  world.load(layout || defaultLayout(W, H, biome));
  if (biome === 'hub') world.syncDoors(opts.areas || []);

  // ambient critters
  if (!world.indoor) for (let i = 0; i < 14; i++) world.fireflies.push({ x: R() * W, y: L.groundTop + R() * (H - L.groundTop), p: R() * 10, s: 0.5 + R() });
  if (!world.indoor) for (let i = 0; i < 3; i++) world.butterflies.push({ x: R() * W, y: L.groundTop + 20 + R() * (H - L.groundTop - 40), p: R() * 10, c: ['#fff6c8', '#ffd0ea', '#d8ecff'][i] });

  // ----- drawing -----
  world.drawGround = (ctx, env) => {
    ctx.drawImage(world.background, 0, 0);
    ctx.drawImage(tcv, 0, 0);
    ctx.fillStyle = C.waterLight;
    const tick = Math.floor(env.t * 1.5);
    for (const [i, j] of waterCells) {
      const h = hash(i + tick * 7, j);
      if (h % 11 === 0) ctx.fillRect(i * CELL + (h >> 5) % 2, j * CELL + 1 + (h >> 7) % 2, 3, 1);
    }
    const ground = world.objects.filter((o) => CATALOG[o.type].layer === 'ground').sort((a, b) => a.y - b.y);
    for (const o of ground) drawObject(ctx, o);
    ground.filter((o) => CATALOG[o.type].live)
      .sort((a, b) => (CATALOG[a.type].liveOrder || 0) - (CATALOG[b.type].liveOrder || 0) || a.y - b.y)
      .forEach((o) => CATALOG[o.type].live(ctx, o, env));
  };
  world.entities = (ctx, env) => world.objects.filter((o) => CATALOG[o.type].layer === 'entity')
    .map((o) => ({ y: o.y, draw: () => drawObject(ctx, o, env) }));

  return world;
}

// ---------- static background: hills, grass, the tree line ----------

function drawGrass(L, biome = 'meadow') {
  const B = BIOMES[biome];
  const { W, H, skyH, groundTop } = L;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const R = rng(1234);

  if (B.backdrop === 'hills') {
    for (let x = 0; x < W; x++) {
      const h1 = Math.round(skyH - 6 - 5 * Math.sin(x / 23) - 3 * Math.sin(x / 9 + 1));
      px(ctx, B.hills[0], x, h1, 1, groundTop - h1);
      const h2 = Math.round(skyH + 2 - 4 * Math.sin(x / 31 + 2) - 2 * Math.sin(x / 7));
      px(ctx, B.hills[1], x, h2, 1, groundTop - h2);
    }
  } else if (B.backdrop === 'mesas') {
    // flat-topped mesas on the horizon
    const far = '#e2b088', near = '#c98a5c', top = '#efc79a';
    for (let x = 0; x < W; x++) px(ctx, far, x, skyH + 4 + Math.round(Math.sin(x / 41) * 2), 1, groundTop);
    for (let k = 0; k < Math.ceil(W / 90); k++) {
      const cx = 30 + k * 90 + R() * 30, w = 24 + R() * 30, h = 10 + R() * 12, base = groundTop - 4;
      for (let x = Math.round(cx - w / 2 - 6); x < cx + w / 2 + 6; x++) {
        const edge = Math.max(0, Math.abs(x - cx) - w / 2);
        const y = Math.round(base - h + edge * 1.6);
        px(ctx, near, x, y, 1, base - y + 8);
        if (edge === 0) px(ctx, top, x, y, 1, 1);
      }
    }
  } else if (B.backdrop === 'skyline') {
    for (const [col, win, base, hmin, hmax, step] of [['#9aa6be', '#b8c4dc', groundTop - 2, 14, 30, 13], ['#76829c', '#c8d2e6', groundTop + 2, 10, 24, 17]]) {
      for (let x = -6; x < W; x += step + Math.floor(R() * 8)) {
        const w = step + Math.floor(R() * 10), h = hmin + Math.floor(R() * (hmax - hmin));
        px(ctx, col, x, base - h, w, h + 8);
        for (let y = base - h + 3; y < base - 2; y += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) if (R() < 0.6) px(ctx, win, xx, y, 1, 2);
      }
    }
  } else if (B.backdrop === 'peaks') {
    for (const [col, snow, n, hmax] of [['#a4b2c8', '#f4f8fc', 4, 0.9], ['#86929e', '#eef2f6', 6, 0.6]]) {
      for (let k = 0; k < n; k++) {
        const cx = (k + 0.3 + R() * 0.4) * W / n, h = (groundTop - 4) * (0.45 + R() * 0.5) * hmax + 10, w = h * (1.1 + R() * 0.5), top = groundTop - h;
        for (let x = Math.round(cx - w); x < cx + w; x++) {
          const y = Math.round(top + Math.abs(x - cx) * (h / w) + Math.sin(x * 0.7) * 1.5);
          px(ctx, col, x, y, 1, groundTop - y + 6);
          const cap = Math.max(0, h * 0.28 - Math.abs(x - cx) * (h / w) * 0.35);
          if (cap > 1) px(ctx, snow, x, y, 1, Math.round(cap));
        }
      }
    }
  } else if (B.backdrop === 'wall') {
    // inside the big house: wallpaper, wainscoting and a plank floor
    const floor = L.buildTop;
    px(ctx, '#f2e2c4', 0, 0, W, floor);
    for (let x = 0; x < W; x += 8) px(ctx, '#ead6b2', x, 0, 3, floor);
    px(ctx, '#c89a64', 0, 0, W, 3); px(ctx, '#a8784a', 0, 3, W, 1);
    px(ctx, '#a8784a', 0, floor - 14, W, 14); px(ctx, '#bf8e5c', 0, floor - 14, W, 1);
    for (let x = 4; x < W; x += 20) { px(ctx, '#94683e', x, floor - 11, 16, 1); px(ctx, '#94683e', x, floor - 11, 1, 8); px(ctx, '#c49464', x + 15, floor - 11, 1, 8); px(ctx, '#c49464', x, floor - 4, 16, 1); }
    px(ctx, '#6e4a2c', 0, floor - 1, W, 2);
    for (let y = floor + 1, row = 0; y < H; y += 6, row++) {
      px(ctx, row % 2 ? '#c99c66' : '#c29460', 0, y, W, 6);
      px(ctx, '#9c7048', 0, y + 5, W, 1);
      for (let x = (row * 37) % 60; x < W; x += 48 + ((row * 13) % 30)) px(ctx, '#9c7048', x, y, 1, 5);
      for (let i = 0; i < W / 10; i++) px(ctx, row % 2 ? '#d2a672' : '#b88a58', R() * W, y + 1 + Math.floor(R() * 4), 2 + Math.floor(R() * 3), 1);
    }
    return cv;
  } else if (B.backdrop === 'sea') {
    // open sea to the horizon, meeting the beach at the front
    const horizon = skyH + 4;
    px(ctx, '#78bdf0', 0, horizon, W, 2);
    px(ctx, C.water, 0, horizon + 2, W, L.paintTop - horizon - 2);
    for (let i = 0; i < W * 0.12; i++) px(ctx, C.waterLight, R() * W, horizon + 3 + R() * (L.paintTop - horizon - 4), 2 + Math.floor(R() * 3), 1);
    px(ctx, '#5a9a7a', W * 0.7, horizon - 2, 14, 2); px(ctx, '#4a8a6a', W * 0.7 + 3, horizon - 4, 7, 2); // a little island
  }

  const G = 14, gw = Math.ceil(W / G) + 2, gh = Math.ceil(H / G) + 2;
  const grid = Array.from({ length: gw * gh }, () => R());
  const noise = (x, y) => {
    const gx = x / G, gy = y / G, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const v = (i, j) => grid[(iy + j) * gw + ix + i];
    const a = v(0, 0) + (v(1, 0) - v(0, 0)) * fx, b = v(0, 1) + (v(1, 1) - v(0, 1)) * fx;
    return a + (b - a) * fy;
  };
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const y0 = Math.max(0, B.backdrop === 'sea' ? L.paintTop : groundTop - 8);
  if (W < 1 || H - y0 < 1) return cv; // hidden window, nothing to draw yet
  const img = ctx.getImageData(0, y0, W, H - y0);
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const cols = { n: rgb(B.ground[0]), l: rgb(B.ground[1]), d: rgb(B.ground[2]) };
  for (let y = y0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = noise(x, y) + (R() - 0.5) * 0.08;
      const th = (bayer[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
      const c = n > 0.62 + th * 0.25 ? cols.l : n < 0.3 + th * 0.2 ? cols.d : cols.n;
      const k = ((y - y0) * W + x) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, y0);
  for (let i = 0; i < W * H / 260; i++) {
    const x = Math.round(R() * W), y = Math.round(y0 + 4 + R() * (H - y0 - 4));
    if (biome === 'desert' || biome === 'ocean') { px(ctx, B.tuft, x, y); if (R() < 0.3) px(ctx, B.tuft, x + 1, y); }
    else if (biome === 'city') { if (R() < 0.35) { px(ctx, B.tuft, x, y, 2 + Math.floor(R() * 3), 1); } }
    else if (biome === 'mountain') { px(ctx, B.tuft, x, y); px(ctx, '#c4baa8', x - 1, y - 1); }
    else { px(ctx, B.tuft, x, y); px(ctx, B.tuft, x - 1, y - 1); px(ctx, B.tuft, x + 1, y - 1); }
  }
  if (B.back === 'trees' || B.back === 'forest') {
    const dark = B.back === 'forest' ? '#1f5530' : C.backTree, mid = B.back === 'forest' ? '#2a6a3c' : C.backTree2;
    for (let x = -10; x < W + 10; x += 9) {
      const y = groundTop - 6 + Math.round(Math.sin(x * 0.7) * 2);
      ctx.fillStyle = dark; fillEllipse(ctx, x, y - 4, 9, 9);
    }
    for (let x = -6; x < W + 10; x += 11) {
      const y = groundTop - 2 + Math.round(Math.cos(x * 0.9) * 2);
      ctx.fillStyle = mid; fillEllipse(ctx, x, y, 8, 7);
      ctx.fillStyle = C.leaf; fillEllipse(ctx, x - 2, y - 3, 4, 3);
    }
  } else if (B.back === 'brick') {
    for (let y = groundTop - 6; y < groundTop + 4; y += 3) for (let x = ((y / 3) % 2) * 4 - 4; x < W; x += 8) { px(ctx, '#a0584a', x, y, 7, 2); px(ctx, '#b86a5a', x, y, 7, 1); }
    px(ctx, '#7a3e34', 0, groundTop + 4, W, 1);
  } else if (B.back === 'ridge') {
    for (let x = 0; x < W; x++) {
      const y = Math.round(groundTop - 3 + Math.sin(x / 11) * 2 + Math.sin(x / 4.3) * 1.5);
      px(ctx, '#7a7064', x, y, 1, groundTop + 6 - y);
      px(ctx, '#a69c8c', x, y, 1, 1);
    }
  } else if (B.back === 'dunes') {
    for (let x = 0; x < W; x++) {
      const y = Math.round(groundTop - 4 + Math.sin(x / 19) * 3 + Math.sin(x / 7) * 1);
      px(ctx, '#d6b070', x, y, 1, groundTop + 6 - y);
      px(ctx, '#f2dcaa', x, y, 1, 1);
    }
  }
  return cv;
}

// ---------- per-frame drawing ----------

export function drawSky(ctx, world, hour, t) {
  const { L } = world;
  const lt = lightAt(hour);
  const g = ctx.createLinearGradient(0, 0, 0, L.groundTop);
  g.addColorStop(0, `rgb(${lt.skyTop})`);
  g.addColorStop(1, `rgb(${lt.skyBottom})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.groundTop);
  const dayF = (hour - 5.5) / 13.5; // 5:30 → 19:00
  if (dayF > 0 && dayF < 1) {
    const sx = L.W * (0.05 + 0.9 * dayF), sy = L.skyH - 2 - Math.sin(dayF * Math.PI) * (L.skyH - 8);
    ctx.fillStyle = 'rgba(255,240,180,0.35)'; fillEllipse(ctx, sx, sy, 7, 7);
    ctx.fillStyle = '#fff6c0'; fillEllipse(ctx, sx, sy, 4, 4);
  }
  const nightF = ((hour + 24 - 19) % 24) / 11; // 19:00 → 06:00
  if (nightF > 0 && nightF < 1) {
    const mx = L.W * (0.05 + 0.9 * nightF), my = L.skyH - 2 - Math.sin(nightF * Math.PI) * (L.skyH - 8);
    ctx.fillStyle = '#f2f2e0'; fillEllipse(ctx, mx, my, 4, 4);
    ctx.fillStyle = `rgb(${lt.skyTop})`; fillEllipse(ctx, mx + 2, my - 1, 3, 3);
  }
  if (lt.night < 0.6) {
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - lt.night)})`;
    for (let i = 0; i < 4; i++) {
      const cx = ((t * 2 + i * L.W * 0.31) % (L.W + 60)) - 30, cy = 6 + (i % 3) * 6;
      fillEllipse(ctx, cx, cy, 10, 2); fillEllipse(ctx, cx + 4, cy - 2, 6, 2);
    }
  }
}

export function drawAmbient(ctx, world, hour, t, dt) {
  const { L } = world;
  const lt = lightAt(hour);
  const R = world.random;
  // chimney smoke at breakfast and dinner time
  if ((hour > 5.5 && hour < 9) || (hour > 17 && hour < 21)) {
    const [cx, cy] = CATALOG.house.chimney;
    for (const h of world.houses) {
      if (R() < dt * 2) world.particles.push({ kind: 'smoke', x: h.x + cx, y: h.y + cy, vx: 2 + R() * 2, vy: -6, life: 0, max: 4 });
    }
  }
  for (const f of world.falls) {
    if (R() < dt * 8) world.particles.push({ kind: 'drop', x: f.x - 8 + R() * 16, y: f.y + 2, vx: (R() - 0.5) * 20, vy: -12 - R() * 10, life: 0, max: 0.7 });
  }
  world.particles = world.particles.filter((p) => (p.life += dt) < p.max);
  for (const p of world.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'smoke') {
      const k = p.life / p.max;
      ctx.fillStyle = `rgba(230,230,235,${0.6 * (1 - k)})`;
      fillEllipse(ctx, p.x, p.y, 1 + k * 3, 1 + k * 2);
    } else if (p.kind === 'drop') {
      p.vy += 40 * dt;
      px(ctx, C.foam, p.x, p.y);
    } else if (p.kind === 'sparkle') {
      const on = Math.floor(p.life * 10) % 2;
      if (on) { px(ctx, '#fff6a0', p.x, p.y - 1, 1, 3); px(ctx, '#fff6a0', p.x - 1, p.y, 3, 1); }
    }
  }
  if (lt.night < 0.4) {
    for (const b of world.butterflies) {
      b.p += dt;
      b.x += Math.cos(b.p * 0.7) * 10 * dt + Math.sin(b.p * 3.1) * 6 * dt;
      b.y += Math.sin(b.p * 0.9) * 6 * dt;
      b.x = (b.x + L.W) % L.W;
      b.y = Math.min(L.H - 20, Math.max(L.groundTop + 10, b.y));
      const flap = Math.floor(b.p * 8) % 2;
      px(ctx, b.c, b.x - 1, b.y - 6, flap ? 1 : 2, 1); px(ctx, b.c, b.x + 1, b.y - 6, flap ? 1 : 2, 1);
      px(ctx, '#333', b.x, b.y - 6);
    }
  }
}

/** Darkens the scene for the time of day, then adds warm lights and fireflies. */
export function drawLighting(ctx, world, hour, t) {
  const { L } = world;
  const lt = lightAt(hour);
  // Indoors the lamps are on, so night only dims the room a little.
  const tint = world.indoor ? lt.tint.map((v, i) => Math.round(v + ([255, 232, 205][i] - v) * 0.7)) : lt.tint;
  if (tint.some((v) => v < 255)) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${tint})`;
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.restore();
  }
  const n = lt.night;
  if (n > 0.15) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, r, rgb, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (world.indoor) for (let k = 0; k < 4; k++) glow(L.W * (k + 0.5) / 4, L.buildTop + 20, 70, '255,200,120', 0.16 * n);
    for (const h of world.lit) {
      for (const [wx, wy] of CATALOG[h.type].windows) {
        const x = h.x + wx, y = h.y + wy;
        ctx.fillStyle = `rgba(255,200,90,${0.85 * n})`;
        ctx.fillRect(x - 5, y - 3, 11, 8);
        glow(x, y + 6, 22, '255,180,80', 0.28 * n);
      }
    }
    const flick = 0.9 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.04;
    for (const l of world.lanterns) {
      const gy = l.y - (CATALOG[l.type].glowY || 18);
      glow(l.x, gy, 42, '255,190,90', 0.32 * n * flick);
      glow(l.x, gy, 6, '255,230,160', 0.8 * n);
    }
    for (const f of world.fireflies) {
      const x = (f.x + Math.sin(t * 0.3 * f.s + f.p) * 18 + L.W) % L.W;
      const y = f.y + Math.sin(t * 0.5 * f.s + f.p * 2) * 8;
      const pulse = Math.max(0, Math.sin(t * 1.7 * f.s + f.p * 5));
      if (pulse > 0.05) {
        glow(x, y, 5, '200,255,120', 0.55 * pulse * n);
        ctx.fillStyle = `rgba(230,255,170,${pulse * n})`;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
    ctx.restore();
    if (world.indoor) return;
    ctx.fillStyle = '#ffffff';
    const R = rng(77);
    for (let i = 0; i < 40; i++) {
      const sx = R() * L.W, sy = R() * (L.skyH + 4), tw = Math.sin(t * (1 + R() * 2) + i);
      if (tw > -0.3) { ctx.globalAlpha = n * (0.5 + 0.5 * tw); ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1); }
    }
    ctx.globalAlpha = 1;
  }
}
