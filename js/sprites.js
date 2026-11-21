// Loads animated sprites from the PMD SpriteCollab repository at runtime.
// Nothing is bundled with this app; the browser fetches and caches the sheets.
// Inside the iPad app, sprites go through the app, which keeps a copy on the device.
export const IN_APP = location.protocol === 'daycare:';
const BASE = IN_APP ? '/sprite/' : 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/';

// Animations the daycare uses. Anything missing falls back to Idle/Walk.
const WANTED = ['Walk', 'Idle', 'Sleep', 'Eat', 'Hop', 'Nod', 'Sit', 'Pose', 'Wake', 'LookUp', 'Laying', 'DeepBreath', 'Rotate', 'Swing', 'Attack', 'Shoot', 'Hurt'];

const cache = new Map();

const pad = (n) => String(n).padStart(4, '0');

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img ' + url));
    img.src = url;
  });
}

async function loadFrom(dir) {
  const res = await fetch(dir + 'AnimData.xml');
  if (!res.ok) throw new Error('no anim data');
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
  const defs = {};
  for (const a of xml.querySelectorAll('Anim')) {
    const name = a.querySelector('Name')?.textContent;
    if (!name) continue;
    const copy = a.querySelector('CopyOf')?.textContent;
    defs[name] = copy ? { copyOf: copy } : {
      fw: +a.querySelector('FrameWidth').textContent,
      fh: +a.querySelector('FrameHeight').textContent,
      durations: [...a.querySelectorAll('Durations > Duration')].map((d) => +d.textContent),
    };
  }
  const resolve = (n, depth = 0) => (defs[n]?.copyOf && depth < 4 ? resolve(defs[n].copyOf, depth + 1) : n);
  const anims = {};
  await Promise.all(WANTED.map(async (want) => {
    const name = resolve(want);
    const def = defs[name];
    if (!def || def.copyOf) return;
    try {
      const img = await loadImage(dir + name + '-Anim.png');
      const rows = Math.max(1, Math.round(img.height / def.fh));
      const total = def.durations.reduce((s, d) => s + d, 0);
      anims[want] = { img, ...def, rows, total };
    } catch { /* missing sheet: skip */ }
  }));
  if (!anims.Walk && !anims.Idle) throw new Error('no usable anims');
  anims.Walk ??= anims.Idle;
  anims.Idle ??= anims.Walk;
  return anims;
}

/** Resolves to an animation set, or null if this species has no sprite yet. */
export function loadSprite(species, shiny) {
  const key = species + (shiny ? 's' : '');
  if (!cache.has(key)) {
    const dir = BASE + pad(species) + '/';
    const p = (shiny ? loadFrom(dir + '0000/0001/').catch(() => loadFrom(dir)) : loadFrom(dir)).catch(() => null);
    cache.set(key, p);
  }
  return cache.get(key);
}

// PMD sheet rows: 0 down, 1 down-right, 2 right, 3 up-right, 4 up, 5 up-left, 6 left, 7 down-left.
export function dirFromVector(dx, dy) {
  const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return (((2 - k) % 8) + 8) % 8;
}

/**
 * Draws one frame with the creature's feet at (x, y).
 * t is seconds since the animation started; loop=false holds the last frame.
 */
export function drawAnim(ctx, anim, x, y, dir, t, loop = true, s = 1) {
  const ticks = Math.floor(t * 60);
  let tick = loop ? ticks % anim.total : Math.min(ticks, anim.total - 1);
  let frame = 0;
  while (frame < anim.durations.length - 1 && tick >= anim.durations[frame]) { tick -= anim.durations[frame]; frame++; }
  const row = anim.rows >= 8 ? dir : 0;
  // PMD frames are centred on the body; feet sit roughly 4px below the centre.
  const w = Math.round(anim.fw * s), h = Math.round(anim.fh * s);
  ctx.drawImage(anim.img, frame * anim.fw, row * anim.fh, anim.fw, anim.fh,
    Math.round(x - w / 2), Math.round(y - 4 * s - h / 2), w, h);
}

/**
 * Size of the visible body in the first Idle frame (facing down), in sprite pixels:
 * { h: height, w: width, top: distance from the feet up to the top of the head }.
 */
export function measureBody(anims) {
  if (anims._body) return anims._body;
  const a = anims.Idle;
  let body = { h: a.fh * 0.6, w: a.fw * 0.6, top: a.fh * 0.5 };
  try {
    const cv = document.createElement('canvas');
    cv.width = a.fw; cv.height = a.fh;
    const g = cv.getContext('2d');
    g.drawImage(a.img, 0, 0, a.fw, a.fh, 0, 0, a.fw, a.fh);
    const d = g.getImageData(0, 0, a.fw, a.fh).data;
    let y0 = a.fh, y1 = -1, x0 = a.fw, x1 = -1;
    for (let y = 0; y < a.fh; y++) for (let x = 0; x < a.fw; x++) {
      if (d[(y * a.fw + x) * 4 + 3] > 40) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    }
    if (y1 >= y0) body = { h: y1 - y0 + 1, w: x1 - x0 + 1, top: a.fh / 2 + 4 - y0 };
  } catch { /* canvas unreadable: keep the estimate */ }
  anims._body = body;
  return body;
}

export function animDuration(anim) { return anim.total / 60; }
