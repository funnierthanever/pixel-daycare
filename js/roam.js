// Roaming: every Pokémon moves between areas on its own. Where it likes to go depends on what it is
// (its types, plus a few species with famous homes), and every trip passes through the hub house.
// Pokémon on screen walk to a door and leave; the ones elsewhere are tracked here in the background.
import { TYPES } from './data.js';
import { bodyClock } from './mons.js';

// How much each type likes each kind of area (0 = not at all, 3 = loves it).
const LIKES = {
  meadow: { normal: 2, grass: 2, bug: 3, flying: 2, fairy: 3, electric: 1 },
  desert: { ground: 2, fire: 3, rock: 2, dark: 1, poison: 1 },
  river: { water: 3, grass: 2, bug: 2, normal: 1, dragon: 1 },
  ocean: { water: 3, flying: 1, ice: 1 },
  city: { poison: 3, steel: 3, electric: 3, normal: 2, dark: 2, psychic: 2, fighting: 1, ghost: 1 },
  mountain: { rock: 3, ground: 3, fighting: 2, ice: 3, dragon: 2, steel: 1, flying: 1 },
};

// Species whose home is famous enough to override their types.
const HOMES = {
  27: 'mountain', 28: 'mountain', 74: 'mountain', 75: 'mountain', 76: 'mountain', 95: 'mountain', 208: 'mountain', 41: 'mountain', 42: 'mountain', 66: 'mountain', 67: 'mountain', 246: 'mountain',
  568: 'city', 569: 'city', 88: 'city', 89: 'city', 109: 'city', 110: 'city', 19: 'city', 20: 'city', 52: 'city', 53: 'city', 81: 'city', 82: 'city', 100: 'city', 101: 'city', 137: 'city', 479: 'city',
  551: 'desert', 552: 'desert', 553: 'desert', 328: 'desert', 329: 'desert', 330: 'desert', 331: 'desert', 332: 'desert', 449: 'desert', 450: 'desert', 343: 'desert', 344: 'desert',
  54: 'river', 55: 'river', 129: 'river', 130: 'river', 60: 'river', 61: 'river', 118: 'river', 119: 'river', 194: 'river', 195: 'river', 258: 'river', 259: 'river',
  72: 'ocean', 73: 'ocean', 120: 'ocean', 121: 'ocean', 116: 'ocean', 117: 'ocean', 170: 'ocean', 171: 'ocean', 222: 'ocean', 320: 'ocean', 321: 'ocean', 7: 'ocean',
  1: 'meadow', 25: 'meadow', 133: 'meadow', 10: 'meadow', 12: 'meadow', 43: 'meadow', 191: 'meadow', 187: 'meadow',
};

const AREA_CAP = 16, HUB_CAP = 30;
const TRAVEL = 0.004;   // in-game hours to go through a door (about 15 seconds of real time)
const HUB_PASS = 0.012; // time spent crossing the hub when nobody is watching it

/** How much a Pokémon likes a kind of area. */
export function affinity(entry, biome) {
  if (biome === 'hub') return 1.4;
  const [t1, t2] = (TYPES[entry.species] || 'normal').split('/');
  const L = LIKES[biome] || {};
  let a = Math.max(L[t1] || 0, (L[t2] || 0) * 0.8);
  if (HOMES[entry.species] === biome) a += 3;
  return a;
}

/** The area this Pokémon likes best (not counting the hub). */
export function favoriteArea(entry, boxes) {
  let best = null, score = -1;
  for (const b of boxes) if (b.biome !== 'hub') { const s = affinity(entry, b.biome); if (s > score) { score = s; best = b; } }
  return best;
}

export function createRoam({ getState, persist, viewing, onArrive, onDepart }) {
  const state = () => getState();
  const R = Math.random;
  const now = () => state().sim.hours;
  const boxOf = (id) => state().boxes.find((b) => b.id === id);
  const awake = (e, h) => { const c = bodyClock(e); return c.wake <= c.bed ? h >= c.wake && h < c.bed : h >= c.wake || h < c.bed; };
  const heading = (id) => state().roster.filter((e) => e.box === id || e.transit?.to === id).length;
  const cap = (id) => (boxOf(id)?.biome === 'hub' ? HUB_CAP : AREA_CAP);

  function stayFor(e, id) {
    const b = boxOf(id);
    if (!b) return 0.2;
    if (b.biome === 'hub') return 0.12 + R() * 0.35;
    return 0.15 + affinity(e, b.biome) * 0.12 + R() * 0.4;
  }

  /** Picks where to go next; returns the current area to mean "stay a while longer". */
  function choose(e, from) {
    const options = [];
    for (const b of state().boxes) {
      if (b.id !== from && heading(b.id) >= cap(b.id)) continue;
      let w = (1 + affinity(e, b.biome)) ** 2;
      if (b.id === from) w *= 1.4;              // a bit of a homebody
      if (b.biome === 'hub') w += 3;            // everyone drops by the house now and then
      options.push([w, b.id]);
    }
    const total = options.reduce((s, o) => s + o[0], 0);
    let pick = R() * total;
    for (const [w, id] of options) if ((pick -= w) <= 0) return id;
    return from;
  }

  function startTrip(e, from, to) {
    const viaHub = boxOf(from)?.biome !== 'hub' && boxOf(to)?.biome !== 'hub';
    e.box = null;
    e.transit = { from, to, next: viaHub ? 'hub' : to, at: now() + TRAVEL };
  }

  function arrive(e) {
    const { from, to, next } = e.transit;
    if (next === to) {
      e.transit = null;
      e.box = to;
      e.stay = now() + stayFor(e, to);
      if (to === viewing()) onArrive(e, from);
      return;
    }
    // Reached the hub on the way somewhere else.
    const hub = next;
    if (hub === viewing()) {
      e.transit = null;
      e.box = hub;
      e.passTo = to; // the Pokémon crosses the hub on screen and leaves through the right door
      onArrive(e, from);
    } else {
      e.transit = { from: hub, to, next: to, at: now() + HUB_PASS };
    }
  }

  return {
    /** Advances the background world by dh in-game hours. */
    tick(dh, hour) {
      const s = state();
      if (!s.sim) s.sim = { hours: 0 };
      s.sim.hours += dh;
      let changed = false;
      for (const e of s.roster) {
        if (e.egg) continue;
        if (e.transit) { if (now() >= e.transit.at) { arrive(e); changed = true; } continue; }
        if (e.box === viewing()) continue; // on screen: the Pokémon decides for itself (see wantsToLeave)
        if (e.stay == null) { e.stay = now() + stayFor(e, e.box) * R(); changed = true; }
        if (now() < e.stay || !awake(e, hour)) continue;
        const to = choose(e, e.box);
        if (to === e.box) e.stay = now() + stayFor(e, to);
        else startTrip(e, e.box, to);
        changed = true;
      }
      if (changed) persist();
    },

    /** Asked by an on-screen Pokémon between activities: returns where it wants to go, or null. */
    wantsToLeave(mon, hour) {
      const e = mon.entry;
      if (e.egg || mon.battle || mon.partner || mon.hunger > 0.6) return null;
      if (e.passTo) { const to = e.passTo; e.passTo = null; return to; }
      if (e.stay == null) e.stay = now() + stayFor(e, e.box) * R();
      if (now() < e.stay || !mon.isAwakeTime(hour)) return null;
      const to = choose(e, e.box);
      if (to === e.box) { e.stay = now() + stayFor(e, to); return null; }
      return to;
    },

    /** The door to use from the area on screen when heading to `to`. */
    nextHop(from, to) {
      if (boxOf(from)?.biome === 'hub') return to;
      return boxOf(to)?.biome === 'hub' ? to : state().boxes.find((b) => b.biome === 'hub')?.id;
    },

    /** An on-screen Pokémon has walked through the door. */
    depart(mon, to) {
      const e = mon.entry, from = e.box;
      onDepart(mon);
      startTrip(e, from, to);
      if (boxOf(from)?.biome === 'hub') e.transit.next = to; // already in the hub: straight there
      persist();
    },

    /** Moves a Pokémon right away (dragged in the PC). */
    teleport(e, to) { e.transit = null; e.passTo = null; e.box = to; e.stay = now() + stayFor(e, to); persist(); },
  };
}
