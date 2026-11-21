// Reads the party and the PC boxes out of emulator save files, Gen 1 through Gen 5.
// Every parser validates what it finds (species lists, checksums) rather than
// trusting fixed offsets, so ROM hacks that keep the vanilla layout work too.
import { NAMES, GEN1_TO_NATIONAL, GEN3_TO_NATIONAL } from './data.js';
import { levelFromExp } from './growth.js';

const MAX_SPECIES = NAMES.length - 1;

// ---------- Gen 1 / Gen 2 (Game Boy / Game Boy Color) ----------

const GB_CHARS = (() => {
  const m = {};
  for (let i = 0; i < 26; i++) { m[0x80 + i] = String.fromCharCode(65 + i); m[0xa0 + i] = String.fromCharCode(97 + i); }
  for (let i = 0; i < 10; i++) m[0xf6 + i] = String(i);
  Object.assign(m, { 0x7f: ' ', 0xe0: "'", 0xe3: '-', 0xe6: '?', 0xe7: '!', 0xe8: '.', 0xef: '♂', 0xf5: '♀', 0xf4: ',', 0xf3: '/' });
  return m;
})();

function gbText(b, off, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = b[off + i];
    if (c === 0x50) break;
    if (!(c in GB_CHARS)) return null;
    s += GB_CHARS[c];
  }
  return s;
}

function gbShiny(atkDef, spdSpc) {
  const atk = atkDef >> 4, def = atkDef & 15, spd = spdSpc >> 4, spc = spdSpc & 15;
  return def === 10 && spd === 10 && spc === 10 && [2, 3, 6, 7, 10, 11, 14, 15].includes(atk);
}

// GB lists (party or box): count, species list (count + 0xFF terminator), the structs,
// the OT names (11 bytes each), then the nicknames (11 bytes each). 0xFD in the list marks an egg.
function readGbList(b, off, gen, slots, structSize, dataOff, levelAt) {
  const dvAt = gen === 1 ? 0x1b : 0x15;
  const count = b[off];
  if (count > slots || b[off + 1 + count] !== 0xff) return null;
  const nickOff = dataOff + slots * structSize + slots * 11;
  if (nickOff + slots * 11 > b.length) return null;
  const mons = [];
  for (let i = 0; i < count; i++) {
    const s = dataOff + i * structSize;
    const raw = b[s], listed = b[off + 1 + i];
    const egg = gen === 2 && listed === 0xfd;
    if (raw !== listed && !egg) return null;
    const species = gen === 1 ? GEN1_TO_NATIONAL[raw] : raw;
    const level = b[s + levelAt];
    if (!species || species > 251 || level < 1 || level > 100) return null;
    const nick = gbText(b, nickOff + i * 11, 11);
    if (nick === null) return null;
    // Gen 1/2 have no natures; derive a stable one from the DVs so personality stays consistent.
    const nature = (b[s + dvAt] * 7 + b[s + dvAt + 1] * 13 + species) % 25;
    mons.push({ species, level, nickname: egg ? '' : nick, shiny: gen === 2 && gbShiny(b[s + dvAt], b[s + dvAt + 1]), nature, egg });
  }
  return mons;
}

function readGbParty(b, off, gen) {
  const structSize = gen === 1 ? 44 : 48;
  const mons = readGbList(b, off, gen, 6, structSize, off + 8, gen === 1 ? 0x21 : 0x1f);
  return mons && mons.length ? mons : null;
}

// Box layout is the same idea with 20 slots: the structs start right after the 21-byte species list.
function readGbBox(b, off, gen) {
  const structSize = gen === 1 ? 33 : 32;
  return readGbList(b, off, gen, 20, structSize, off + 22, gen === 1 ? 0x03 : 0x1f);
}

// The box you're using lives in the main bank; the rest are in banks 2 and 3 (6 or 7 boxes each).
// A box's copy in banks 2/3 is stale while it's the current one.
const GB_BOXES = {
  1: { count: 12, perBank: 6, size: 0x462, current: 0x30c0, index: 0x284c },
  gs: { count: 14, perBank: 7, size: 0x450, current: 0x2d6c, index: 0x2724 },
  crystal: { count: 14, perBank: 7, size: 0x450, current: 0x2d10, index: 0x2700 },
};

function readGbBoxes(b, gen, kind) {
  const L = GB_BOXES[kind];
  const cur = b[L.index] & 0x7f;
  const boxes = [];
  for (let i = 0; i < L.count; i++) {
    const off = i === cur ? L.current : (i < L.perBank ? 0x4000 : 0x6000) + (i % L.perBank) * L.size;
    const mons = readGbBox(b, off, gen);
    if (mons && mons.length) boxes.push({ name: `Box ${i + 1}`, mons });
  }
  return boxes;
}

function parseGb(b) {
  const out = [];
  const tries = [
    [0x2865, 2, 'Gen 2 (Crystal)', 'crystal'],
    [0x288a, 2, 'Gen 2 (Gold/Silver)', 'gs'],
    [0x2f2c, 1, 'Gen 1 (Red/Blue/Yellow)', 1],
  ];
  for (const [off, gen, label, kind] of tries) {
    const mons = readGbParty(b, off, gen);
    if (mons) out.push({ label, gen, mons, boxes: readGbBoxes(b, gen, kind) });
  }
  return out;
}

// ---------- Gen 3 (Game Boy Advance) ----------

const ORDERS = [
  'ABCD', 'ABDC', 'ACBD', 'ACDB', 'ADBC', 'ADCB', 'BACD', 'BADC', 'BCAD', 'BCDA', 'BDAC', 'BDCA',
  'CABD', 'CADB', 'CBAD', 'CBDA', 'CDAB', 'CDBA', 'DABC', 'DACB', 'DBAC', 'DBCA', 'DCAB', 'DCBA',
];

const G3_CHARS = (() => {
  const m = { 0x00: ' ' };
  for (let i = 0; i < 26; i++) { m[0xbb + i] = String.fromCharCode(65 + i); m[0xd5 + i] = String.fromCharCode(97 + i); }
  for (let i = 0; i < 10; i++) m[0xa1 + i] = String(i);
  Object.assign(m, { 0xab: '!', 0xac: '?', 0xad: '.', 0xae: '-', 0xb0: '…', 0xb4: "'", 0xb5: '♂', 0xb6: '♀', 0xb8: ',', 0xba: '/' });
  return m;
})();

function g3Text(b, off, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = b[off + i];
    if (c === 0xff) break;
    s += G3_CHARS[c] ?? '';
  }
  return s.trim();
}

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// Reads one PK3: 100 bytes in the party, 80 in a box (no level stored there, so it comes from experience).
function readPk3(b, off, box = false) {
  const pid = u32(b, off), otid = u32(b, off + 4);
  if (pid === 0 && otid === 0) return null;
  const key = (pid ^ otid) >>> 0;
  const dec = new Uint8Array(48);
  for (let i = 0; i < 48; i += 4) {
    const v = (u32(b, off + 0x20 + i) ^ key) >>> 0;
    dec[i] = v & 255; dec[i + 1] = (v >>> 8) & 255; dec[i + 2] = (v >>> 16) & 255; dec[i + 3] = v >>> 24;
  }
  let sum = 0;
  for (let i = 0; i < 48; i += 2) sum = (sum + u16(dec, i)) & 0xffff;
  if (sum !== u16(b, off + 0x1c)) return null;
  const order = ORDERS[pid % 24];
  const block = (letter) => order.indexOf(letter) * 12; // A=growth, B=attacks, C=EVs, D=misc
  const internal = u16(dec, block('A'));
  if (internal === 0) return null;
  const ivWord = u32(dec, block('D') + 4);
  const isEgg = ((ivWord >>> 30) & 1) === 1 || internal === 412;
  const species = internal < GEN3_TO_NATIONAL.length ? GEN3_TO_NATIONAL[internal] : 0;
  const tid = otid & 0xffff, sid = otid >>> 16;
  return {
    species,
    rawSpecies: internal,
    level: box ? (species ? levelFromExp(species, u32(dec, block('A') + 4)) : 0) : b[off + 0x54],
    nickname: g3Text(b, off + 0x08, 10),
    shiny: ((tid ^ sid ^ (pid >>> 16) ^ (pid & 0xffff)) >>> 0) < 8,
    nature: pid % 25,
    egg: isEgg,
  };
}

function parseGen3(b) {
  if (b.length < 0x1c000) return [];
  // Two save slots of 14 sections each; the slot with the higher save index is current.
  const slots = [0, 0xe000].map((base) => {
    const sections = {};
    let index = -1;
    for (let s = 0; s < 14; s++) {
      const o = base + s * 0x1000;
      if (u32(b, o + 0xff8) !== 0x08012025) return null;
      sections[u16(b, o + 0xff4)] = o;
      index = u32(b, o + 0xffc);
    }
    return { sections, index };
  }).filter(Boolean);
  slots.sort((x, y) => y.index - x.index);
  const out = [];
  for (const slot of slots.slice(0, 1)) {
    const sec1 = slot.sections[1];
    if (sec1 === undefined) continue;
    // Ruby/Sapphire/Emerald keep the party at 0x234, FireRed/LeafGreen at 0x34.
    for (const [cOff, label] of [[0x234, 'Gen 3 (Ruby/Sapphire/Emerald)'], [0x34, 'Gen 3 (FireRed/LeafGreen)']]) {
      const count = u32(b, sec1 + cOff);
      if (count < 1 || count > 6) continue;
      const mons = [];
      let ok = true;
      for (let i = 0; i < count; i++) {
        const m = readPk3(b, sec1 + cOff + 4 + i * 100);
        if (!m) { ok = false; break; }
        mons.push(m);
      }
      if (ok) out.push({ label, gen: 3, mons });
    }
    const boxes = readGen3Boxes(b, slot.sections);
    for (const r of out) r.boxes = boxes;
  }
  return out;
}

// The PC is spread over sections 5–13 (3968 bytes of data each, 2000 in the last): the current box
// number, then 14 boxes × 30 Pokémon of 80 bytes, then the box names.
function readGen3Boxes(b, sections) {
  const parts = [];
  for (let id = 5; id <= 13; id++) {
    if (sections[id] === undefined) return [];
    parts.push(b.subarray(sections[id], sections[id] + (id === 13 ? 2000 : 3968)));
  }
  const pc = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { pc.set(p, at); at += p.length; }
  const boxes = [];
  for (let i = 0; i < 14; i++) {
    const mons = [];
    for (let j = 0; j < 30; j++) {
      const m = readPk3(pc, 4 + (i * 30 + j) * 80, true);
      if (m) mons.push(m);
    }
    if (mons.length) boxes.push({ name: g3Text(pc, 4 + 420 * 80 + i * 9, 9) || `Box ${i + 1}`, mons });
  }
  return boxes;
}

// ---------- Gen 4 / Gen 5 (Nintendo DS) ----------

function lcrngDecrypt(src, srcOff, len, seed) {
  const out = new Uint8Array(len);
  let s = seed >>> 0;
  for (let i = 0; i < len; i += 2) {
    s = (Math.imul(s, 0x41c64e6d) + 0x6073) >>> 0;
    const w = u16(src, srcOff + i) ^ (s >>> 16);
    out[i] = w & 255; out[i + 1] = w >>> 8;
  }
  return out;
}

function g4Text(dec, off) {
  let s = '';
  for (let i = 0; i < 11; i++) {
    const c = u16(dec, off + i * 2);
    if (c === 0xffff) break;
    if (c >= 0x121 && c <= 0x12a) s += String(c - 0x121);
    else if (c >= 0x12b && c <= 0x144) s += String.fromCharCode(65 + c - 0x12b);
    else if (c >= 0x145 && c <= 0x15e) s += String.fromCharCode(97 + c - 0x145);
    else if (c === 0x1de) s += ' ';
    else return null; // unknown glyph: fall back to the species name
  }
  return s;
}

function g5Text(dec, off) {
  let s = '';
  for (let i = 0; i < 11; i++) {
    const c = u16(dec, off + i * 2);
    if (c === 0xffff || c === 0) break;
    s += c === 0x246e ? '♂' : c === 0x246d ? '♀' : String.fromCharCode(c);
  }
  return s;
}

// Reads one PK4/PK5 (236/220 bytes in the party, 136 in a box). Returns null unless the checksum matches.
// Box Pokémon have no level stored, so it comes from their experience.
function readPkDs(b, off, gen, box = false) {
  const pid = u32(b, off);
  const chk = u16(b, off + 6);
  const enc = lcrngDecrypt(b, off + 8, 128, chk);
  let sum = 0;
  for (let i = 0; i < 128; i += 2) sum = (sum + u16(enc, i)) & 0xffff;
  if (sum !== chk) return null;
  const order = ORDERS[((pid & 0x3e000) >>> 13) % 24];
  // Un-shuffle into canonical A/B/C/D order (addresses below are relative to 0x08).
  const d = new Uint8Array(128);
  for (let pos = 0; pos < 4; pos++) {
    const letter = order.charCodeAt(pos) - 65;
    d.set(enc.subarray(pos * 32, pos * 32 + 32), letter * 32);
  }
  const species = u16(d, 0x00);
  if (species < 1 || species > (gen === 5 ? 649 : 493)) return null;
  const level = box ? levelFromExp(species, u32(d, 0x08)) : lcrngDecrypt(b, off + 0x88, gen === 5 ? 84 : 100, pid)[0x04];
  if (level < 1 || level > 100) return null;
  const tid = u16(d, 0x04), sid = u16(d, 0x06);
  const ivWord = u32(d, 0x30);
  const nickname = gen === 5 ? g5Text(d, 0x40) : g4Text(d, 0x40);
  return {
    species,
    level,
    nickname: nickname ?? '',
    shiny: ((tid ^ sid ^ (pid >>> 16) ^ (pid & 0xffff)) >>> 0) < 8,
    nature: gen === 5 ? d[0x39] % 25 : pid % 25,
    egg: ((ivWord >>> 30) & 1) === 1,
  };
}

// DS saves have a primary and a backup copy and the party offset differs per game,
// so scan for "count, then that many valid party entries back to back".
function parseDs(b) {
  if (b.length < 0x40000) return [];
  const found = [];
  const seen = new Set();
  for (const [gen, stride] of [[4, 236], [5, 220]]) {
    for (let o = 0; o + 4 + stride <= b.length; o += 4) {
      const count = u32(b, o);
      if (count < 1 || count > 6) continue;
      const mons = [];
      let ok = true;
      for (let i = 0; i < count; i++) {
        const m = readPkDs(b, o + 4 + i * stride, gen);
        if (!m) { ok = false; break; }
        mons.push(m);
      }
      if (!ok) continue;
      // The slot after the last member must not also be a valid Pokémon (else count is wrong).
      if (count < 6 && readPkDs(b, o + 4 + count * stride, gen)) continue;
      const sig = mons.map((m) => `${m.species}:${m.level}:${m.nickname}`).join('|');
      if (seen.has(sig)) continue;
      seen.add(sig);
      found.push({ label: `Gen ${gen} (DS)`, gen, mons, offset: o });
    }
  }
  if (!found.length) return found;
  const boxes = found[0].gen === 5 ? readGen5Boxes(b) : readGen4Boxes(b);
  for (const f of found) f.boxes = boxes;
  // Gen 4 keeps two full copies 0x40000 apart; the footer's save counters say which is newer.
  if (found.length > 1 && found[0].gen === 4) {
    const newer = gen4NewerPartition(b);
    if (newer !== null) {
      const pick = found.filter((f) => (f.offset >= 0x40000 ? 1 : 0) === newer);
      if (pick.length) return pick.map((f) => ({ ...f, label: f.label + ' — latest save' })).concat(found.filter((f) => !pick.includes(f)));
    }
  }
  return found;
}

function readDsBoxes(b, start, count, stride, gen) {
  const boxes = [];
  for (let i = 0; i < count; i++) {
    const mons = [];
    for (let j = 0; j < 30; j++) {
      const off = start + i * stride + j * 136;
      if (off + 136 > b.length) break;
      const m = readPkDs(b, off, gen, true);
      if (m) mons.push(m);
    }
    if (mons.length) boxes.push({ name: `Box ${i + 1}`, mons });
  }
  return boxes;
}

// Gen 4 saves the PC in its own block (separate from the party's block), in each of the two copies.
// Each game puts it somewhere else, so try them all and keep the layout that finds Pokémon.
const GEN4_STORAGE = [
  { start: 0xc100, size: 0x121e0, box: 0xc104, stride: 0xff0 }, // Diamond/Pearl
  { start: 0xcf2c, size: 0x121e4, box: 0xcf30, stride: 0xff0 }, // Platinum
  { start: 0xf700, size: 0x12310, box: 0xf700, stride: 0x1000 }, // HeartGold/SoulSilver
];

function readGen4Boxes(b) {
  let best = [], bestCount = 0;
  for (const L of GEN4_STORAGE) {
    const copies = [0, 0x40000].map((base) => readDsBoxes(b, base + L.box, 18, L.stride, 4));
    const total = (bx) => bx.reduce((n, x) => n + x.mons.length, 0);
    if (!total(copies[0]) && !total(copies[1])) continue;
    // Newer copy by the storage block's own save counters; failing that, the party block's.
    let newer = null;
    const f0 = L.start + L.size - 0x14, f1 = 0x40000 + f0;
    if (f1 + 0x14 <= b.length && u32(b, f0 + 8) === L.size && u32(b, f1 + 8) === L.size) {
      const a = [u32(b, f0), u32(b, f0 + 4)], c = [u32(b, f1), u32(b, f1 + 4)];
      newer = a[0] !== c[0] ? (a[0] > c[0] ? 0 : 1) : (a[1] >= c[1] ? 0 : 1);
    }
    if (newer === null) newer = gen4NewerPartition(b);
    if (newer === null || !total(copies[newer])) newer = total(copies[0]) >= total(copies[1]) ? 0 : 1;
    if (total(copies[newer]) > bestCount) { best = copies[newer]; bestCount = total(copies[newer]); }
  }
  return best;
}

// Gen 5 (Black/White and Black 2/White 2): 24 boxes from 0x400, one box per 0x1000.
function readGen5Boxes(b) { return readDsBoxes(b, 0x400, 24, 0x1000, 5); }

function gen4NewerPartition(b) {
  for (const len of [0xc100, 0xcf2c, 0xf628]) { // Diamond/Pearl, Platinum, HeartGold/SoulSilver
    const f0 = len - 0x14, f1 = 0x40000 + len - 0x14;
    if (u32(b, f0 + 8) !== len || u32(b, f1 + 8) !== len) continue;
    const a = [u32(b, f0), u32(b, f0 + 4)], c = [u32(b, f1), u32(b, f1 + 4)];
    if (a[0] !== c[0]) return a[0] > c[0] ? 0 : 1;
    return a[1] >= c[1] ? 0 : 1;
  }
  return null;
}

// ---------- entry point ----------

/**
 * Returns a list of candidates: [{label, gen, mons, boxes: [{name, mons}]}], where each Pokémon is
 * {species, level, nickname, shiny, nature, egg}. mons is the party; boxes are the PC boxes that have someone in them.
 */
export function parseSave(buffer) {
  const b = new Uint8Array(buffer);
  let results = [];
  if (b.length >= 0x40000) results = parseDs(b);
  if (!results.length && b.length >= 0x1c000) results = parseGen3(b);
  if (!results.length && b.length >= 0x8000) results = parseGb(b);
  for (const r of results) {
    r.boxes ||= [];
    for (const m of [...r.mons, ...r.boxes.flatMap((x) => x.mons)]) {
      if (m.species > MAX_SPECIES) m.species = 0;
      if (!m.nickname) m.nickname = m.egg ? 'Egg' : m.species ? NAMES[m.species] : '???';
    }
  }
  return results;
}
