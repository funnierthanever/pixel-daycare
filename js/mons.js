// Creature behaviour: each one has a body clock, needs, a favourite spot and a
// personality from its nature, and runs a queue of small steps (walk, eat, sleep...).
import { TYPES, NAMES } from './data.js';
import { loadSprite, drawAnim, dirFromVector, animDuration, measureBody } from './sprites.js';
import { HEIGHTS } from './heights.js';
import { rng } from './art.js';
import { Battle } from './battle.js';
import { fillEllipse } from './world.js';
import { CATALOG } from './objects.js';
const CATALOG_ARENA = (o) => CATALOG.arena.bounds(o);

export const NATURES = ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky'];

const ENERGETIC = new Set(['Brave', 'Adamant', 'Naughty', 'Hasty', 'Jolly', 'Naive', 'Rash', 'Impish']);
const SLEEPY = new Set(['Relaxed', 'Lax', 'Quiet', 'Calm', 'Modest', 'Mild']);
const SHY = new Set(['Timid', 'Bashful', 'Careful', 'Quiet']);
const SOCIAL = new Set(['Jolly', 'Naive', 'Docile', 'Gentle', 'Hardy', 'Lonely']);
const GLUTTON = new Set(['Lax', 'Relaxed', 'Naughty', 'Sassy', 'Bold']);

// Species that keep night hours even though their type doesn't say so.
const NOCTURNAL = new Set([35, 36, 173, 41, 42, 169, 48, 49, 96, 97, 163, 164, 167, 168, 313, 314, 337, 401, 402, 527, 528]);
const VERY_SLEEPY = new Set([143, 446, 287, 289, 79, 80, 199]);

const TYPE_COLOR = {
  normal: '#c8c0a0', fire: '#f08a4a', water: '#5a9ae8', grass: '#6ac85a', electric: '#f2d040', ice: '#9ae0e8',
  fighting: '#c0503a', poison: '#a85ab8', ground: '#d8b060', flying: '#a8a0f0', psychic: '#f06a98', bug: '#a8c040',
  rock: '#b8a060', ghost: '#7060a8', dragon: '#7058f0', dark: '#705848', steel: '#b8b8d0', fairy: '#f0a8d0',
};

const FALLBACK = {
  Eat: ['Eat', 'Nod', 'Idle'], Sleep: ['Sleep', 'Laying', 'Idle'], Laying: ['Laying', 'Sleep', 'Sit', 'Idle'],
  Sit: ['Sit', 'Idle'], Hop: ['Hop', 'Pose', 'Idle'], Nod: ['Nod', 'Idle'], Pose: ['Pose', 'Nod', 'Idle'],
  Wake: ['Wake', 'Idle'], LookUp: ['LookUp', 'Idle'], DeepBreath: ['DeepBreath', 'Idle'], Rotate: ['Rotate', 'Nod', 'Idle'],
  Swing: ['Swing', 'Idle'], Walk: ['Walk', 'Idle'], Idle: ['Idle', 'Walk'],
  Attack: ['Attack', 'Shoot', 'Pose', 'Nod', 'Idle'], Shoot: ['Shoot', 'Attack', 'Pose', 'Nod', 'Idle'], Hurt: ['Hurt', 'Idle'],
};

/**
 * How much to scale a sprite so its on-screen height follows the Pokédex height.
 * Real heights span 0.1 m to 14.5 m, so the curve is compressed (logarithmic): a 0.4 m Pikachu
 * stands about 16 px tall, a 2.1 m Snorlax about 35 px, an 8.8 m Onix about 60 px. Each
 * individual also varies a little (entry.size, about ±10%), like real animals do.
 */
function sizeScale(entry, body) {
  const m = (HEIGHTS[entry.species] || 7) / 10;
  const want = (7 + 20 * Math.log(1 + 1.5 * m)) * (entry.size || 1);
  const s = want / Math.max(8, body.h);
  return Math.round(Math.min(2.6, Math.max(0.55, s)) * 8) / 8; // eighth steps keep pixels fairly even
}

/**
 * When a Pokémon wakes and goes to bed. It's worked out from the Pokémon itself (species, nature,
 * personal size), so it stays the same every time, including while it's off in another area.
 */
export function bodyClock(entry) {
  const R = rng(entry.species * 977 + (entry.nature | 0) * 31 + Math.round((entry.size || 1) * 100));
  const types = (TYPES[entry.species] || 'normal').split('/');
  const nature = NATURES[(entry.nature | 0) % 25];
  const nocturnal = types.includes('ghost') || types.includes('dark') || NOCTURNAL.has(entry.species);
  if (nocturnal) return { nocturnal, wake: 18.2 + R() * 1.3, bed: 4.9 + R() * 1.2 };
  if (VERY_SLEEPY.has(entry.species)) return { nocturnal, wake: 8.5 + R(), bed: 18.8 + R() * 0.6 };
  const e = ENERGETIC.has(nature) ? 1.25 : SLEEPY.has(nature) ? 0.8 : 1;
  return {
    nocturnal,
    wake: e > 1 ? 5.6 + R() * 0.6 : e < 1 ? 7 + R() * 1.2 : 6.2 + R() * 0.8,
    bed: e > 1 ? 21 + R() * 1.4 : e < 1 ? 19.8 + R() * 0.7 : 20.4 + R(),
  };
}

const inHours = (h, a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);

let nextId = 1;

export class Mon {
  constructor(entry, world, index, opts = {}) {
    this.id = nextId++;
    this.entry = entry;
    this.world = world;
    this.index = index;
    this.species = entry.species;
    this.name = entry.nickname || NAMES[entry.species];
    this.types = (TYPES[entry.species] || 'normal').split('/');
    this.nature = NATURES[entry.nature % 25];
    const R = world.random;
    const t = (set) => set.has(this.nature);
    this.traits = {
      energy: t(ENERGETIC) ? 1.25 : t(SLEEPY) ? 0.8 : 1,
      social: t(SOCIAL) ? 1.6 : t(SHY) ? 0.4 : 1,
      appetite: t(GLUTTON) ? 1.4 : 1,
      sleepy: t(SLEEPY) || VERY_SLEEPY.has(this.species),
      shy: t(SHY),
    };
    const has = (ty) => this.types.includes(ty);
    Object.assign(this, bodyClock(entry));
    this.canWade = has('water');
    // How keen it is on arena battles.
    this.traits.drive = (has('fighting') ? 2 : 1) * (this.traits.energy > 1 ? 1.5 : 1) * (this.traits.shy ? 0.3 : 1);
    this.favorite = has('water') || has('ice') ? 'pond'
      : has('grass') || has('bug') ? 'shade'
      : has('fire') || has('rock') || has('ground') || has('steel') || has('dragon') ? 'rock'
      : has('ghost') || has('psychic') ? 'fall' : 'field';
    this.speed = 20 * this.traits.energy;
    this.hunger = 0.2 + R() * 0.3;
    this.thirst = R() * 0.4;
    this.steps = [];
    this.anim = 'Idle';
    this.animT = R() * 3;
    this.dir = 0;
    this.emote = null;
    this.label = 'Settling in';
    this.partner = null;
    this.cooldown = 5 + R() * 10;
    this.asleep = false;
    const p = opts.at || world.randomPoint(false);
    this.x = p.x; this.y = p.y;
    this.battle = null;
    this.hurtT = 0;
    if (opts.at) {
      // just came through a door: step out into the room
      const out = world.nearestWalkable(p.x + (R() - 0.5) * 16, p.y + 10 + R() * 10, this.canWade);
      this.activity = 'arrive';
      this.label = 'Just arrived';
      this.steps = [{ type: 'walk', to: out, timeout: 8 }, { type: 'call', fn: () => this.say(R() < 0.5 ? 'note' : '!') }, { type: 'anim', name: 'Idle', dur: 1 }];
    }
    this.sprite = undefined; // undefined = loading, null = no sprite available
    this.scale = 1;
    this.body = { h: 20, w: 20, top: 20 };
    loadSprite(entry.species, entry.shiny).then((s) => {
      this.sprite = s;
      if (s) { this.body = measureBody(s); this.scale = sizeScale(entry, this.body); }
    });
  }

  // ----- helpers -----
  isAwakeTime(h) { return inHours(h, this.wake, this.bed); }
  getAnim(name) {
    if (!this.sprite) return null;
    for (const n of FALLBACK[name] || [name, 'Idle']) if (this.sprite[n]) return this.sprite[n];
    return this.sprite.Idle;
  }
  setAnim(name) { if (this.anim !== name) { this.anim = name; this.animT = 0; } }
  face(p) { const dx = p.x - this.x, dy = p.y - this.y; if (dx || dy) this.dir = dirFromVector(dx, dy); }
  say(kind) { this.emote = { kind, t: 0 }; }
  busyWith(kind) { return this.steps.length && this.activity === kind; }

  sleepSpot() {
    const W = this.world;
    if (this._sleepSpot) return this._sleepSpot;
    let p;
    if (this.nocturnal || this.favorite === 'shade') p = W.spots.shade(this.index);
    else if (this.favorite === 'pond') p = W.spots.shore() || W.spots.bed(this.index);
    else p = W.spots.bed(this.bedIndex ?? this.index);
    p = p || W.spots.bed(this.bedIndex ?? this.index) || W.randomPoint(false);
    if (!W.isWalkable(p.x, p.y)) p = W.randomPoint(false, p, 20);
    this._sleepSpot = p;
    return p;
  }

  /** Called after you change the world: forget old spots and step out of anything built on top of us. */
  worldChanged() {
    this.interrupt();
    this._sleepSpot = null;
    const p = this.world.nearestWalkable(this.x, this.y, this.canWade);
    this.x = p.x; this.y = p.y;
  }

  interrupt() {
    if (this.battle) { const b = this.battle; this.battle = null; b.end(null); }
    if (this.partner) { const o = this.partner; this.partner = null; if (o.partner === this) { o.partner = null; o.steps = []; } }
    for (const b of this.world.bowls) b.eaters.delete(this);
    this.steps = [];
    this.asleep = false;
  }

  // ----- planning -----
  plan(clock, all) {
    const h = clock.hour, W = this.world, R = W.random;
    const go = (activity, label, steps) => { this.activity = activity; this.label = label; this.steps = steps; };
    const near = (p, r = 4) => ({ x: p.x + (R() * 2 - 1) * r, y: p.y + (R() * 2 - 1) * r * 0.5 });

    if (!this.isAwakeTime(h)) {
      const spot = this.sleepSpot();
      const where = this.nocturnal ? 'in the shade' : this.favorite === 'pond' ? 'by the water' : this.favorite === 'shade' ? 'under a tree' : 'on the hay';
      return go('sleep', `Sleeping ${where}`, [
        { type: 'walk', to: spot, label: 'Heading to bed' },
        { type: 'anim', name: 'DeepBreath', once: true },
        { type: 'sleep', until: (c) => this.isAwakeTime(c.hour) },
        { type: 'anim', name: 'Wake', once: true },
        { type: 'call', fn: () => { this.hunger = Math.max(this.hunger, 0.7); this.say(R() < 0.5 ? 'note' : '!'); } },
        { type: 'anim', name: 'DeepBreath', once: true },
      ]);
    }

    // needs first
    if (this.hunger > 0.55) {
      const bowl = W.bowls.filter((b) => b.fill > 0.08 && b.eaters.size < 2)
        .sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y))[0];
      if (bowl) {
        const side = bowl.eaters.size === 0 ? (this.x < bowl.x ? -1 : 1) : -[...bowl.eaters][0].side || 1;
        this.side = side;
        bowl.eaters.add(this);
        const meal = h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'a midnight snack';
        return go('eat', `Having ${meal}`, [
          { type: 'walk', to: { x: bowl.x + side * 11, y: bowl.y + 1 } },
          { type: 'anim', name: 'Eat', dur: 6 + R() * 5 * this.traits.appetite, face: bowl },
          { type: 'call', fn: () => {
            bowl.fill = Math.max(0, bowl.fill - 0.12); bowl.eaters.delete(this); this.hunger = 0;
            this.say(this.traits.appetite > 1 || R() < 0.3 ? 'heart' : 'note');
          } },
          { type: 'anim', name: 'Nod', once: true },
        ]);
      }
      if (this.hunger > 0.95 && !this._waitedForFood && W.bowls.length) {
        this._waitedForFood = true;
        const b = W.bowls[Math.floor(W.bowls.length / 2)];
        return go('hungry', 'Waiting for food…', [
          { type: 'walk', to: W.randomPoint(false, { x: b.x, y: b.y + 14 }, 16) },
          { type: 'call', fn: () => this.say('...') },
          { type: 'anim', name: 'Sit', dur: 20 + R() * 20, face: b },
        ]);
      }
    } else this._waitedForFood = false;

    if (this.thirst > 0.75) {
      const p = this.canWade ? W.spots.wade() : W.spots.shore();
      if (p) {
        return go('drink', this.canWade ? 'Splashing in the pond' : 'Drinking at the pond', [
          { type: 'walk', to: p },
          { type: 'anim', name: this.canWade ? 'Rotate' : 'Eat', dur: this.canWade ? 4 : 3, face: p.face || p },
          { type: 'call', fn: () => { this.thirst = 0; if (this.canWade) this.say('note'); } },
          { type: 'anim', name: 'Idle', dur: this.canWade ? 12 + R() * 20 : 2 },
        ]);
      }
    }

    // a daytime nap for the sleepy ones
    const napSpot = W.spots.shade(this.index + 1);
    if (napSpot && this.traits.sleepy && !this.nocturnal && inHours(h, 12.5, 15.5) && R() < 0.35) {
      const spot = near(napSpot, 3);
      return go('nap', 'Napping in the shade', [
        { type: 'walk', to: spot },
        { type: 'sleep', dur: 40 + R() * 80 },
        { type: 'anim', name: 'Wake', once: true },
      ]);
    }

    // wander off to another area?
    const dest = W.roam?.wantsToLeave(this, h);
    if (dest) {
      const hop = W.roam.nextHop(W.areaId, dest);
      const door = W.portal(hop);
      const name = W.areaName?.(dest) || 'somewhere else';
      return go('leave', `Heading to the ${name}`, [
        { type: 'walk', to: door, timeout: 30 },
        { type: 'call', fn: () => { if (door.door) door.door.openUntil = W.time + 0.8; W.roam.depart(this, dest); } },
      ]);
    }

    // in the hub: arena battles
    if (W.arena && !W.battles.length && this.cooldown <= 0 && R() < 0.22 * this.traits.drive) {
      const rivals = all.filter((o) => o !== this && o.sprite && !o.partner && !o.battle && o.isAwakeTime(h)
        && !['eat', 'sleep', 'nap', 'leave', 'arrive'].includes(o.activity));
      if (rivals.length) {
        const o = rivals[Math.floor(R() * rivals.length)];
        if (o.traits.shy && R() < 0.5) { o.say('sweat'); this.cooldown = 30; }
        else { new Battle(this, o, W, W.onBattle); return; }
      }
    }

    // social play
    if (this.cooldown <= 0 && R() < 0.35 * this.traits.social) {
      const friends = all.filter((o) => o !== this && o.sprite !== undefined && !o.partner && o.isAwakeTime(h)
        && !['eat', 'sleep', 'nap'].includes(o.activity) && Math.hypot(o.x - this.x, o.y - this.y) < 140);
      if (friends.length) {
        const f = friends[Math.floor(R() * friends.length)];
        if (!(f.traits.shy && R() < 0.6)) return startPlay(this, f, W, R);
        this.cooldown = 20;
        f.say('sweat');
      }
    }

    // pick something to do, weighted by personality and favourite spot
    const options = [
      [W.trainer ? 1.6 * this.traits.social : 0, () => {
        const tr = W.trainer, side = R() < 0.5 ? -1 : 1;
        return go('trainer', 'Visiting the trainer', [
          { type: 'walk', to: W.nearestWalkable(tr.x + side * (12 + R() * 6), tr.y + 3 + R() * 4), timeout: 20 },
          { type: 'call', fn: () => { this.face(tr); tr.waveUntil = W.time + 2.5; this.say('heart'); } },
          { type: 'anim', name: 'Nod', once: true, face: tr },
          { type: 'anim', name: 'Sit', dur: 8 + R() * 10, face: tr },
        ]);
      }],
      [W.battles?.length ? 4 : 0, () => {
        const ar = W.arena, [x0, y0, x1, y1] = CATALOG_ARENA(ar);
        const a = R() * Math.PI * 2, p = W.nearestWalkable(ar.x + Math.cos(a) * (x1 - x0) * 0.62, ar.y + Math.sin(a) * (y1 - y0) * 0.7);
        return go('watch', 'Watching the battle', [
          { type: 'walk', to: p, timeout: 15 },
          { type: 'anim', name: 'Sit', dur: 10 + R() * 10, face: ar },
          { type: 'call', fn: () => this.say(R() < 0.5 ? '!' : 'note') },
          { type: 'anim', name: 'Sit', dur: 6, face: ar },
        ]);
      }],
      [3, () => go('wander', 'Wandering around', [
        { type: 'walk', to: W.randomPoint(false, this, 70) },
        { type: 'anim', name: 'Idle', dur: 2 + R() * 4 },
      ])],
      [3, () => this.favoriteSpot(h, go, near)],
      [W.falls.length ? 0.8 : 0, () => {
        const v = W.spots.waterfallView();
        if (!v) return options[0][1]();
        return go('falls', 'Watching the waterfall', [
          { type: 'walk', to: v },
          { type: 'anim', name: 'LookUp', dur: 3 + R() * 3, face: { x: v.fall.x, y: v.fall.top } },
          { type: 'call', fn: () => this.say(R() < 0.5 ? '!' : 'sparkle') },
          { type: 'anim', name: 'Sit', dur: 8 + R() * 10, face: { x: v.fall.x, y: v.fall.bottom } },
        ]);
      }],
      [this.traits.energy > 1 ? 0.7 : 0.2, () => go('spin', 'Feeling lively', [
        { type: 'anim', name: 'Rotate', once: true },
        { type: 'call', fn: () => this.say('note') },
        { type: 'anim', name: 'Hop', once: true },
        { type: 'walk', to: W.randomPoint(false, this, 40) },
      ])],
      [W.lanternLit && W.lanterns.length && (this.types.includes('bug') || this.nocturnal) ? 2 : 0, () => {
        const l = W.nearest(W.lanterns, this);
        return go('lantern', 'Hanging around the lantern', [
          { type: 'walk', to: near({ x: l.x + (R() < 0.5 ? -10 : 10), y: l.y + 4 }, 4) },
          { type: 'anim', name: 'LookUp', dur: 4, face: { x: l.x, y: l.y - 20 } },
          { type: 'anim', name: 'Sit', dur: 15 + R() * 15 },
        ]);
      }],
    ];
    const total = options.reduce((s, o) => s + o[0], 0);
    let pick = R() * total;
    for (const [w, fn] of options) { if ((pick -= w) <= 0) return fn(); }
    return options[0][1]();
  }

  favoriteSpot(h, go, near) {
    const W = this.world, R = W.random;
    switch (this.favorite) {
      case 'pond': {
        const p = this.canWade ? W.spots.wade() : W.spots.shore();
        if (p) return go('pond', this.canWade ? 'Swimming in the pond' : 'Relaxing by the pond', [
          { type: 'walk', to: p },
          { type: 'anim', name: this.canWade ? 'Idle' : 'Sit', dur: 15 + R() * 25 },
          { type: 'call', fn: () => this.canWade && R() < 0.5 && this.say('note') },
          { type: 'anim', name: this.canWade ? 'Rotate' : 'Idle', once: true },
        ]);
        break;
      }
      case 'shade': {
        const sh = W.spots.shade(this.index + Math.floor(R() * 5));
        if (!sh) break;
        return go('shade', 'Lounging under a tree', [
          { type: 'walk', to: near(sh, 4) },
          { type: 'anim', name: 'Sit', dur: 15 + R() * 25 },
        ]);
      }
      case 'rock': {
        const sunny = h > 7 && h < 18;
        const spot = W.spots.rock();
        if (!spot) break;
        return go('rock', sunny ? 'Sunbathing on the rock' : 'Sitting on the rock', [
          { type: 'walk', to: spot },
          { type: 'anim', name: sunny ? 'Laying' : 'Sit', dur: 20 + R() * 25 },
          { type: 'call', fn: () => sunny && this.say('sparkle') },
        ]);
      }
      case 'fall': {
        const v = W.spots.waterfallView();
        if (!v) break;
        return go('falls', 'Gazing at the falls', [
          { type: 'walk', to: v },
          { type: 'anim', name: 'Sit', dur: 15 + R() * 20, face: { x: v.fall.x, y: v.fall.bottom } },
        ]);
      }
    }
    return go('field', 'Lazing in the grass', [
      { type: 'walk', to: W.randomPoint(false) },
      { type: 'anim', name: R() < 0.5 ? 'Sit' : 'Laying', dur: 10 + R() * 20 },
    ]);
  }

  // ----- update -----
  update(dt, clock, all) {
    if (this.held) { this.animT += dt; return; }
    if (this.hurtT > 0) this.hurtT -= dt;
    const hrs = clock.deltaHours;
    this.hunger = Math.min(1, this.hunger + hrs * 0.32 * this.traits.appetite);
    this.thirst = Math.min(1, this.thirst + hrs * 0.22);
    this.cooldown -= dt;
    this.animT += dt;
    if (this.emote) { this.emote.t += dt; if (this.emote.t > 2.6) this.emote = null; }
    if (!this.steps.length) this.plan(clock, all);
    const s = this.steps[0];
    if (!s) return;
    s.t = (s.t || 0) + dt;
    if (this.runStep(s, dt, clock)) this.steps.shift();
  }

  runStep(s, dt, clock) {
    const W = this.world;
    switch (s.type) {
      case 'walk': {
        this.asleep = false;
        const target = typeof s.to === 'function' ? s.to() : s.to;
        if (!target) return true;
        if (typeof s.to === 'function') s.path = [target];
        else if (!s.path) s.path = this.route(target);
        const p = s.path[0];
        if (!p) return true;
        const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
        const stop = s.stopAt || 0.8;
        if (d <= Math.max(stop, 0.8)) {
          s.path.shift();
          if (!s.path.length) return true;
          return false;
        }
        const v = Math.min(d, (s.speed || this.speed) * dt);
        this.x += (dx / d) * v; this.y += (dy / d) * v;
        this.dir = dirFromVector(dx, dy);
        this.setAnim('Walk');
        return s.t > (s.timeout || 25);
      }
      case 'anim': {
        if (s.face) this.face(typeof s.face === 'function' ? s.face() : s.face);
        this.setAnim(s.name);
        const anim = this.getAnim(s.name);
        const dur = s.once ? (anim ? animDuration(anim) : 0.8) : s.dur;
        return s.t >= dur;
      }
      case 'sleep': {
        this.setAnim('Sleep');
        this.asleep = true;
        if (Math.floor(s.t / 5) !== Math.floor((s.t - dt) / 5)) this.say('zzz');
        const done = s.until ? s.until(clock) : s.t >= s.dur;
        if (done) this.asleep = false;
        return done;
      }
      case 'waitFor': {
        if (s.face) this.face(s.face());
        this.setAnim('Idle');
        return s.cond() || s.t > (s.timeout || 12);
      }
      case 'call':
        s.fn();
        return true;
      case 'puppet': // an arena battle is moving this Pokémon around
        return !this.battle;
    }
    return true;
  }

  // Straight line if clear, otherwise via one detour point.
  route(target) {
    const W = this.world, here = { x: this.x, y: this.y };
    if (W.segmentClear(here, target, this.canWade)) return [target];
    for (let i = 0; i < 25; i++) {
      const mid = W.randomPoint(this.canWade, { x: (here.x + target.x) / 2, y: (here.y + target.y) / 2 }, 50 + i * 4);
      if (W.segmentClear(here, mid, this.canWade) && W.segmentClear(mid, target, this.canWade)) return [mid, target];
    }
    return [target];
  }

  // ----- drawing -----
  get wading() { return this.canWade && !this.held && this.world.isWater(this.x, this.y); }

  // Facing used for drawing. While walking they face where they go; otherwise they
  // turn toward the viewer, keeping only the left/right part of where they were looking.
  get viewDir() {
    if (this.anim === 'Walk') return this.dir;
    return [0, 1, 1, 1, 0, 7, 7, 7][this.dir];
  }

  draw(ctx, t) {
    const wading = this.wading;
    const k = this.scale, shadow = Math.max(4, Math.min(16, this.body.w * k * 0.32));
    if (!wading) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; fillEllipse(ctx, this.x, this.y, shadow, Math.max(2, shadow * 0.38)); }
    if (this.sprite === null) return this.drawPlaceholder(ctx, t);
    const anim = this.getAnim(this.anim);
    if (!anim) return;
    const once = this.steps[0]?.once;
    if (this.hurtT > 0 && Math.floor(this.hurtT * 20) % 2) return; // blink when hit
    if (wading) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.x - 130, this.y - 260, 260, 257);
      ctx.clip();
      drawAnim(ctx, anim, this.x, this.y + 2, this.viewDir, this.animT, !once, k);
      ctx.restore();
      ctx.strokeStyle = 'rgba(234,247,255,0.8)';
      ctx.lineWidth = 1;
      const r = 7 + Math.sin(t * 3 + this.id) * 1;
      ctx.beginPath(); ctx.ellipse(Math.round(this.x) + 0.5, Math.round(this.y - 3) + 0.5, r, r * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      drawAnim(ctx, anim, this.x, this.y, this.viewDir, this.animT, !once, k);
    }
  }

  drawPlaceholder(ctx, t) {
    const bob = this.anim === 'Walk' ? Math.abs(Math.sin(this.animT * 10)) * 2 : 0;
    const y = this.y - 6 - bob;
    ctx.fillStyle = '#00000044'; fillEllipse(ctx, this.x, y + 1, 6, 5);
    ctx.fillStyle = TYPE_COLOR[this.types[0]] || '#ccc'; fillEllipse(ctx, this.x, y, 6, 5);
    ctx.fillStyle = '#ffffff55'; fillEllipse(ctx, this.x - 2, y - 2, 2, 1);
    ctx.fillStyle = '#222';
    if (this.asleep) { ctx.fillRect(Math.round(this.x - 3), Math.round(y), 2, 1); ctx.fillRect(Math.round(this.x + 1), Math.round(y), 2, 1); }
    else { ctx.fillRect(Math.round(this.x - 3), Math.round(y - 1), 1, 2); ctx.fillRect(Math.round(this.x + 2), Math.round(y - 1), 1, 2); }
  }

  headY() {
    if (!this.sprite) return this.y - 14;
    return this.y - this.body.top * this.scale - 1;
  }

  drawEmote(ctx) {
    const b = this.battle;
    if (b && b.phase !== 'gather') {
      const hp = b.hp.get(this), w = 18, x = Math.round(this.x - w / 2), y = Math.round(this.headY() - 5);
      ctx.fillStyle = '#2a2a3a'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#5a5a6a'; ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = hp > 0.5 ? '#4ad04a' : hp > 0.2 ? '#f0c030' : '#e04a3a';
      ctx.fillRect(x, y, Math.round(w * hp), 2);
    }
    if (!this.emote) return;
    drawEmote(ctx, this.emote.kind, this.x, this.headY() - (b ? 5 : 0), this.emote.t);
  }

  hit(px, py) {
    return Math.abs(px - this.x) < Math.max(9, this.body.w * this.scale * 0.55) && py > this.headY() - 2 && py < this.y + 5;
  }

  pet() {
    if (this.asleep) { this.say('zzz'); return `${this.name} is fast asleep. Shh!`; }
    if (this.battle) { this.say('!'); return `${this.name} is in the middle of a battle!`; }
    if (this.activity === 'leave') return `${this.name} is ${this.label.toLowerCase()}.`;
    this.interrupt();
    this.activity = 'petted';
    this.label = 'Happy you said hi';
    this.steps = [
      { type: 'call', fn: () => this.say('heart') },
      { type: 'anim', name: 'Nod', once: true },
      { type: 'anim', name: 'Pose', once: true },
    ];
    return null;
  }
}

// Two creatures meet up and play together. Chase for the energetic, a quiet sit for the rest.
function startPlay(a, b, W, R) {
  a.interrupt(); b.interrupt();
  a.partner = b; b.partner = a;
  const mid = W.randomPoint(false, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 20);
  const pa = { x: mid.x - 9, y: mid.y }, pb = { x: mid.x + 9, y: mid.y };
  const ready = { a: false, b: false };
  const chase = (a.traits.energy + b.traits.energy) / 2 >= 1 && R() < 0.7;
  const end = (m) => ({ type: 'call', fn: () => { m.partner = null; m.cooldown = 30 + R() * 40; } });
  const greet = (m, o, key) => [
    { type: 'walk', to: key === 'a' ? pa : pb, timeout: 15 },
    { type: 'call', fn: () => { ready[key] = true; } },
    { type: 'waitFor', cond: () => ready.a && ready.b, face: () => o, timeout: 14 },
    { type: 'call', fn: () => m.say(key === 'a' ? '!' : 'note') },
    { type: 'anim', name: 'Nod', once: true, face: () => o },
  ];
  a.activity = b.activity = 'play';
  if (chase) {
    a.label = `Playing tag with ${b.name}`; b.label = `Playing tag with ${a.name}`;
    const away = () => {
      const dx = b.x - a.x || 1, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const p = { x: b.x + (dx / d) * 50, y: b.y + (dy / d) * 30 };
      return W.isWalkable(p.x, p.y) ? p : W.randomPoint(false, b, 50);
    };
    a.steps = [...greet(a, b, 'a'), { type: 'anim', name: 'Hop', once: true },
      { type: 'walk', to: () => (a.partner ? { x: b.x, y: b.y } : null), stopAt: 8, speed: 32 * a.traits.energy, timeout: 7 },
      { type: 'call', fn: () => { a.say('heart'); b.say('!'); } },
      { type: 'anim', name: 'Pose', once: true, face: () => b }, end(a)];
    const fleeTarget = {};
    b.steps = [...greet(b, a, 'b'),
      { type: 'call', fn: () => Object.assign(fleeTarget, away()) },
      { type: 'walk', to: fleeTarget, speed: 30 * b.traits.energy, timeout: 6 },
      { type: 'waitFor', cond: () => Math.hypot(a.x - b.x, a.y - b.y) < 12, face: () => a, timeout: 6 },
      { type: 'anim', name: 'Hop', once: true }, end(b)];
  } else {
    a.label = `Hanging out with ${b.name}`; b.label = `Hanging out with ${a.name}`;
    const sit = 14 + R() * 16;
    a.steps = [...greet(a, b, 'a'), { type: 'anim', name: 'Sit', dur: sit, face: () => b },
      { type: 'call', fn: () => a.say('heart') }, { type: 'anim', name: 'Idle', dur: 1 }, end(a)];
    b.steps = [...greet(b, a, 'b'), { type: 'anim', name: 'Sit', dur: sit * 0.6, face: () => a },
      { type: 'call', fn: () => b.say('note') }, { type: 'anim', name: 'Sit', dur: sit * 0.4 + 1, face: () => a }, end(b)];
  }
}

export function tryGreet(a, b, R) {
  if (a.partner || b.partner || a.cooldown > 0 || b.cooldown > 0) return false;
  if (a.anim !== 'Walk' || !['wander', 'field', 'spin'].includes(a.activity)) return false;
  if (['eat', 'sleep', 'nap', 'play'].includes(b.activity)) return false;
  a.cooldown = b.cooldown = 25 + R() * 20;
  const emo = b.traits.shy ? 'sweat' : R() < 0.5 ? 'note' : '!';
  a.steps = [{ type: 'anim', name: 'Nod', once: true, face: { x: b.x, y: b.y } }, { type: 'call', fn: () => a.say('!') }, ...a.steps];
  b.steps.unshift({ type: 'call', fn: () => b.say(emo) }, { type: 'anim', name: 'Nod', once: true, face: { x: a.x, y: a.y } });
  return true;
}

// ---------- eggs ----------

export class Egg {
  constructor(world, index) {
    this.world = world;
    this.index = index;
    this.place();
    this.t = Math.random() * 10;
    this.emote = null;
    this.name = 'Egg';
    this.label = 'Waiting to hatch';
  }
  place() { const p = this.world.spots.egg(this.index); this.x = p.x; this.y = p.y; }
  update(dt) { this.t += dt; if (this.emote) { this.emote.t += dt; if (this.emote.t > 2.6) this.emote = null; } }
  draw(ctx) {
    const wob = this.t % 7 < 0.6 ? Math.round(Math.sin(this.t * 30)) : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; fillEllipse(ctx, this.x, this.y, 4, 1);
    ctx.fillStyle = '#d8d0c0'; fillEllipse(ctx, this.x + wob, this.y - 5, 4, 5);
    ctx.fillStyle = '#f8f4ea'; fillEllipse(ctx, this.x + wob, this.y - 6, 3, 4);
    ctx.fillStyle = '#7cc86a'; ctx.fillRect(this.x + wob - 2, this.y - 7, 2, 2); ctx.fillRect(this.x + wob + 1, this.y - 4, 2, 1);
  }
  drawEmote(ctx) { if (this.emote) drawEmote(ctx, this.emote.kind, this.x, this.y - 14, this.emote.t); }
  hit(px, py) { return Math.abs(px - this.x) < 7 && py > this.y - 13 && py < this.y + 3; }
  pet() { this.t = 0; this.emote = { kind: '...', t: 0 }; return 'It moved a little! It might hatch soon.'; }
}

// ---------- emote bubbles ----------

const ICONS = {
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  note: ['..###', '..#.#', '..#..', '###..', '###..'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['###', '..#', '.##', '...', '.#.'],
  sparkle: ['..#..', '..#..', '#####', '..#..', '..#..'],
  sweat: ['..#', '.##', '###', '.#.'],
  '...': ['#.#.#'],
};
const ICON_COLOR = { heart: '#e8486a', note: '#4a7ae0', '!': '#e04a3a', '?': '#4a7ae0', sparkle: '#e8b020', sweat: '#5aaae8', '...': '#555' };

export function drawEmote(ctx, kind, x, y, t) {
  x = Math.round(x); y = Math.round(y);
  if (kind === 'zzz') {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.8 + i * 0.33) % 1;
      const zx = x + 3 + Math.round(k * 7 + i), zy = y + 4 - Math.round(k * 12);
      ctx.globalAlpha = 1 - k;
      const s = i === 2 ? 4 : 3;
      ctx.fillRect(zx, zy, s, 1); ctx.fillRect(zx + s - 2, zy + 1, 1, 1); ctx.fillRect(zx + 1, zy + 2, 1, 1); ctx.fillRect(zx, zy + 3, s, 1);
    }
    ctx.globalAlpha = 1;
    return;
  }
  const icon = ICONS[kind];
  if (!icon) return;
  const pop = t < 0.15 ? 2 : 0;
  const w = 13, h = 11, bx = x - 6, by = y - h - pop + (t > 2.2 ? Math.round((t - 2.2) * 8) : 0);
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(bx + 1, by, w - 2, h); ctx.fillRect(bx, by + 1, w, h - 2);
  ctx.fillRect(x - 1, by + h, 3, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx + 1, by + 1, w - 2, h - 2);
  ctx.fillRect(x, by + h - 1, 1, 2);
  ctx.fillStyle = ICON_COLOR[kind];
  const iw = icon[0].length, ih = icon.length;
  const ox = bx + Math.floor((w - iw) / 2), oy = by + Math.floor((h - ih) / 2);
  icon.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(ox + c, oy + r, 1, 1); });
}
