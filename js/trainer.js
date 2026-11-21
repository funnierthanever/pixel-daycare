// Your trainer in the hub: strolls around the house, turns to Pokémon that come to say hi,
// walks over to give a Pokémon some attention, and cheers from the sideline during arena battles.
import { CATALOG } from './objects.js';
import { drawEmote } from './mons.js';

const SPEED = 17;

function face(tr, p) {
  const dx = p.x - tr.x, dy = p.y - tr.y;
  tr.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}

function say(tr, kind) { tr.emote = { kind, t: 0 }; }

// Straight-line check that ignores the trainer's own footprint.
function clear(world, tr, to) {
  tr._skip = true;
  const ok = world.isWalkable(to.x, to.y) && world.segmentClear(tr, to, false);
  tr._skip = false;
  return ok;
}

function pickTarget(world, tr, mons) {
  const R = world.random;
  const home = tr.home || (tr.home = { x: tr.x, y: tr.y });
  const awake = mons.filter((m) => m.sprite && !m.asleep && !m.battle && m.activity !== 'leave');
  const options = [
    [3, () => ({ ...home, why: 'home' })],
    [2, () => ({ ...world.randomPoint(false, tr, 90), why: 'stroll' })],
    [world.bowls.length ? 1 : 0, () => { const b = world.bowls[Math.floor(R() * world.bowls.length)]; return { x: b.x + 14, y: b.y + 6, why: 'bowls' }; }],
    [awake.length ? 2.5 : 0, () => { const m = awake[Math.floor(R() * awake.length)]; return { x: m.x + (m.x > tr.x ? -14 : 14), y: m.y + 2, why: 'pet', mon: m }; }],
  ];
  const total = options.reduce((s, o) => s + o[0], 0);
  let k = R() * total;
  for (const [w, fn] of options) if ((k -= w) <= 0) return fn();
  return { ...home, why: 'home' };
}

/** Moves the trainer around. Call once per frame while the hub is on screen. */
export function updateTrainer(world, mons, dt, tr = world.trainer) {
  if (!tr) return;
  const R = world.random;
  if (tr.emote) { tr.emote.t += dt; if (tr.emote.t > 2.6) tr.emote = null; }
  if (tr.held) { tr.moving = false; return; }
  const ai = tr.ai || (tr.ai = { mode: 'idle', t: 2 + R() * 4 });

  // A Pokémon came over to say hi: stop and look at it.
  const visitor = mons.find((m) => m.activity === 'trainer' && Math.hypot(m.x - tr.x, m.y - tr.y) < 36);
  if (visitor) {
    face(tr, visitor);
    tr.moving = false;
    if (ai.mode !== 'greet') { ai.mode = 'greet'; tr.waveUntil = world.time + 2; say(tr, 'heart'); }
    ai.t = 2;
    return;
  }
  if (ai.mode === 'greet') { ai.mode = 'idle'; ai.t = 1 + R() * 2; }

  // A battle is on: go watch from the side of the arena.
  if (world.battles.length && world.arena && ai.why !== 'cheer') {
    const ar = world.arena, [x0, , x1, y1] = CATALOG.arena.bounds(ar);
    const spot = world.nearestWalkable(ar.x + (R() - 0.5) * (x1 - x0) * 0.5, ar.y + y1 + 10);
    Object.assign(ai, { mode: 'walk', target: spot, why: 'cheer' });
  }
  if (!world.battles.length && ai.why === 'cheer' && ai.mode === 'idle') { ai.why = null; ai.t = 1 + R() * 3; }

  if (ai.mode === 'walk') {
    const to = ai.target, dx = to.x - tr.x, dy = to.y - tr.y, d = Math.hypot(dx, dy);
    if (d < 1.5 || ai.stuck > 3) {
      tr.moving = false;
      ai.mode = 'idle';
      ai.stuck = 0;
      ai.t = ai.why === 'cheer' ? 999 : 4 + R() * 8;
      if (ai.why === 'cheer') { if (world.arena) face(tr, world.arena); }
      else if (ai.why === 'pet' && ai.target.mon && Math.hypot(ai.target.mon.x - tr.x, ai.target.mon.y - tr.y) < 30) {
        const m = ai.target.mon;
        face(tr, m);
        say(tr, 'heart');
        if (!m.asleep && !m.battle && m.activity !== 'leave') { m.face(tr); m.say('heart'); }
      } else if (ai.why === 'home') tr.facing = 'down';
      return;
    }
    const step = Math.min(d, SPEED * dt);
    const next = { x: tr.x + (dx / d) * step, y: tr.y + (dy / d) * step };
    tr._skip = true;
    const ok = world.isWalkable(next.x, next.y);
    tr._skip = false;
    if (!ok) { ai.stuck = (ai.stuck || 0) + dt; return; }
    tr.x = next.x; tr.y = next.y;
    tr.moving = true;
    face(tr, to);
    return;
  }

  // idle: cheer now and then during a battle, otherwise wait and then go somewhere
  tr.moving = false;
  if (ai.why === 'cheer') {
    if (world.arena) face(tr, world.arena);
    if (R() < dt * 0.3) { tr.waveUntil = world.time + 1.2; say(tr, R() < 0.5 ? '!' : 'note'); }
    return;
  }
  // glance around now and then, mostly facing out into the room
  if (R() < dt * 0.25) tr.facing = R() < 0.5 ? 'down' : R() < 0.5 ? 'left' : 'right';
  ai.t -= dt;
  if (ai.t <= 0) {
    for (let tries = 0; tries < 5; tries++) {
      const target = pickTarget(world, tr, mons);
      if (clear(world, tr, target)) { Object.assign(ai, { mode: 'walk', target, why: target.why, stuck: 0 }); return; }
    }
    ai.t = 2;
  }
}

export function drawTrainerEmote(ctx, world) {
  for (const tr of world.objects) if (tr.type === 'trainer' && tr.emote) drawEmote(ctx, tr.emote.kind, tr.x, tr.y - 31, tr.emote.t);
}
