// Visiting other people's houses. A house (its areas, builds, Pokémon and trainer) is packed into a
// short compressed code that travels inside a link. Opening the link shows that house as a guest:
// nothing is saved, and nothing in your own house changes.
import { BIOMES } from './world.js';
import { CATALOG } from './objects.js';

// Where the public web version lives (GitHub Pages). Links made inside the iPad app or on your Mac
// point here so anyone can open them in a browser.
export const PUBLIC_URL = 'https://funnierthanever.github.io/pixel-daycare/';

const b64url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x4000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x4000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function squeeze(text) {
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unsqueeze(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

/** Packs a house into a code. layouts maps area id -> saved layout (or null for an unedited area). */
export async function makeCode(state, layouts) {
  const ids = state.boxes.map((b) => b.id);
  const where = (e) => ids.indexOf(e.box ?? e.transit?.to);
  const house = {
    v: 1,
    n: (state.trainerName || '').slice(0, 16),
    l: state.trainerLook || 0,
    b: state.boxes.map((b) => [b.name, b.biome]),
    w: state.boxes.map((b) => layouts[b.id] || null),
    r: state.roster.filter((e) => e.species || e.egg).slice(0, 120).map((e) => [
      e.egg ? 0 : e.species, e.nickname || '', e.shiny ? 1 : 0, e.nature | 0, Math.round((e.size || 1) * 100), e.level | 0,
      Math.max(0, where(e)), e.wins | 0, e.losses | 0, e.egg ? 1 : 0,
    ]),
  };
  return b64url(await squeeze(JSON.stringify(house)));
}

/** A shareable link for a code. */
export function linkFor(code) {
  const onPages = location.protocol === 'https:' && location.hostname.endsWith('github.io');
  const base = onPages ? location.origin + location.pathname : PUBLIC_URL;
  return `${base}#visit=${code}`;
}

/** Pulls a code out of whatever was pasted: a full link or just the code. */
export function codeFrom(text) {
  const m = String(text || '').match(/visit=([A-Za-z0-9_-]+)/) || String(text || '').trim().match(/^([A-Za-z0-9_-]{16,})$/);
  return m ? m[1] : null;
}

// ---------- reading a code (untrusted: it came from a stranger's link) ----------

const str = (v, max) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f<>]/g, '').slice(0, max);
const int = (v, lo, hi, d = lo) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);

function cleanLayout(w) {
  if (!w || typeof w !== 'object' || !Array.isArray(w.objects)) return null;
  const W = int(w.W, 100, 2000, 400), H = int(w.H, 100, 2000, 270);
  return {
    v: 1, W, H,
    objects: w.objects.slice(0, 400).filter((o) => o && typeof o.type === 'string' && Object.hasOwn(CATALOG, o.type)).map((o) => {
      const out = { type: o.type, x: int(o.x, 0, W), y: int(o.y, 0, H), s: int(o.s, 0, 2), seed: int(o.seed, 0, 1e6) };
      if (o.type === 'door') out.link = str(o.link, 20);
      return out;
    }),
    terrain: (Array.isArray(w.terrain) ? w.terrain : []).slice(0, 200).map((row) => str(row, 600).replace(/[^.pswnr]/g, '.')),
  };
}

/** Turns a code back into a house the app can show. Returns null if it isn't a valid house code. */
export async function readCode(code) {
  let h;
  try { h = JSON.parse(await unsqueeze(unb64url(code))); } catch { return null; }
  if (!h || h.v !== 1 || !Array.isArray(h.b) || !Array.isArray(h.r)) return null;
  const boxes = h.b.slice(0, 12).map((b, i) => ({
    id: i === 0 && b[1] === 'hub' ? 'hub' : 'v' + i,
    name: str(b?.[0], 24) || 'Area',
    biome: typeof b?.[1] === 'string' && Object.hasOwn(BIOMES, b[1]) ? b[1] : 'meadow',
  }));
  if (!boxes.some((b) => b.biome === 'hub')) boxes.unshift({ id: 'hub', name: 'Hub', biome: 'hub' });
  const hub = boxes.find((b) => b.biome === 'hub');
  // door links inside saved layouts point at the owner's area ids; map them to ours by position
  const layouts = {};
  (Array.isArray(h.w) ? h.w : []).slice(0, boxes.length).forEach((w, i) => {
    const lay = cleanLayout(w);
    if (!lay || !boxes[i]) return;
    if (boxes[i].biome === 'hub') lay.objects = lay.objects.filter((o) => o.type !== 'door'); // doors are rebuilt for this visit
    layouts[boxes[i].id] = lay;
  });
  const roster = h.r.slice(0, 120).map((r) => {
    const egg = r?.[9] === 1, species = egg ? 0 : int(r?.[0], 1, 649, 0);
    if (!egg && !species) return null;
    const box = boxes[int(r?.[6], 0, boxes.length - 1)] || hub;
    return {
      species, nickname: str(r?.[1], 12), shiny: r?.[2] === 1, nature: int(r?.[3], 0, 24), size: int(r?.[4], 80, 120, 100) / 100,
      level: int(r?.[5], 0, 100), box: box.id, wins: int(r?.[7], 0, 9999), losses: int(r?.[8], 0, 9999), egg, source: 'visit',
    };
  }).filter(Boolean);
  return {
    owner: str(h.n, 16) || 'A trainer',
    state: { roster, boxes, box: hub.id, timeMode: 'live', previewHour: 12, speed: 1, sim: { hours: 0 }, trainerLook: int(h.l, 0, 5), trainerName: str(h.n, 16) },
    layouts,
  };
}

/** The visit code in this page's address, if any. */
export function visitCodeInUrl() { return codeFrom(location.hash); }
