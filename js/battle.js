// Friendly arena battles in the hub. Two Pokémon walk onto the arena, face off, and take turns
// attacking with a move that matches their type, until one of them is worn out. Nobody gets hurt.
import { CATALOG } from './objects.js';
import { fillEllipse } from './art.js';

// How each type attacks: a projectile kind and its colour, or a tackle for close-range types.
const MOVES = {
  fire: ['ember', '#ff8a3a'], water: ['bubble', '#6ab8ff'], ice: ['bubble', '#bff0ff'], electric: ['bolt', '#ffe23a'],
  grass: ['leaf', '#5ac85a'], bug: ['leaf', '#a8c040'], poison: ['orb', '#b05ad0'], psychic: ['orb', '#ff6aa8'],
  ghost: ['orb', '#7a5ac8'], dark: ['orb', '#5a4a6a'], fairy: ['orb', '#ffa8d8'], dragon: ['orb', '#7a5af0'],
  rock: ['rock', '#b08a5a'], ground: ['rock', '#c8a060'], steel: ['rock', '#c0c8d8'],
};

export class Battle {
  constructor(a, b, world, onFinish) {
    this.a = a; this.b = b; this.world = world; this.onFinish = onFinish;
    const ar = world.arena, [x0, , x1] = CATALOG.arena.bounds(ar);
    const reach = (x1 - x0) * 0.26;
    this.spots = new Map([[a, { x: ar.x - reach, y: ar.y }], [b, { x: ar.x + reach, y: ar.y }]]);
    this.hp = new Map([[a, 1], [b, 1]]);
    this.ready = new Set();
    this.phase = 'gather';
    this.t = 0;
    this.turn = a.traits.energy >= b.traits.energy ? a : b;
    world.battles.push(this);
    for (const [m, o] of [[a, b], [b, a]]) {
      m.interrupt();
      m.battle = this;
      m.activity = 'battle';
      m.label = `Battling ${o.name} in the arena`;
      m.steps = [
        { type: 'walk', to: this.spots.get(m), timeout: 25 },
        { type: 'call', fn: () => this.ready.add(m) },
        { type: 'puppet' },
      ];
    }
  }

  other(m) { return m === this.a ? this.b : this.a; }
  play(m, name, once = true) { m.anim = name; m.animT = 0; if (m.steps[0]) m.steps[0].once = once; }

  update(dt) {
    this.t += dt;
    const { a, b } = this;
    if (this.phase === 'gather') {
      if (this.ready.size === 2) {
        this.phase = 'faceoff'; this.t = 0;
        a.face(b); b.face(a);
        a.say('!'); b.say('!');
        this.world.cheer?.();
      } else if (this.t > 30) this.end(null);
      return;
    }
    if (this.phase === 'faceoff') {
      a.face(b); b.face(a);
      if (this.t > 1.4) { this.phase = 'turn'; this.t = 0; this.hit = false; this.start = { x: this.turn.x, y: this.turn.y }; }
      return;
    }
    if (this.phase === 'turn') return this.runTurn(dt);
    if (this.phase === 'faint' && this.t > 2.8) this.end(this.winner);
  }

  runTurn() {
    const X = this.turn, Y = this.other(X), t = this.t, R = this.world.random;
    const [kind, color] = MOVES[X.types[0]] || MOVES[X.types[1]] || ['tackle', '#ffffff'];
    if (t < 0.02 && !this.played) { this.played = true; this.play(X, kind === 'tackle' ? 'Attack' : 'Shoot'); }
    if (kind === 'tackle') {
      // dash in, strike, dash back
      const k = t < 0.25 ? t / 0.25 : t < 0.5 ? 1 - (t - 0.25) / 0.25 : 0;
      X.x = this.start.x + (Y.x - this.start.x) * 0.55 * k;
      if (t >= 0.25 && !this.hit) this.strike(X, Y, R);
    } else {
      if (t >= 0.15 && !this.fired) {
        this.fired = true;
        this.world.effects.push({ kind, color, x0: X.x, y0: X.headY() + 6, x1: Y.x, y1: Y.headY() + 8, t: 0, dur: 0.45 });
      }
      if (t >= 0.6 && !this.hit) this.strike(X, Y, R);
    }
    if (Y.knock && t > this.knockAt + 0.25) { Y.x -= Y.knock; Y.knock = 0; }
    if (t >= 1.5) {
      X.x = this.start.x;
      if (this.hp.get(Y) <= 0) {
        this.phase = 'faint'; this.t = 0; this.winner = X;
        this.play(Y, 'Sleep', false); Y.say('...');
        this.play(X, 'Pose'); X.say('note');
        this.world.cheer?.();
        for (let i = 0; i < 6; i++) this.world.particles.push({ kind: 'sparkle', x: X.x + (R() - 0.5) * 18, y: X.headY() + R() * 10, vx: 0, vy: -4, life: 0, max: 1.4 });
        return;
      }
      this.turn = Y; this.t = 0; this.hit = this.fired = this.played = false;
      this.start = { x: Y.x, y: Y.y };
      this.play(X, 'Idle', false);
      X.face(Y); Y.face(X);
    }
  }

  strike(X, Y, R) {
    this.hit = true;
    const crit = R() < 0.12;
    const dmg = (0.2 + R() * 0.22) * (crit ? 1.6 : 1);
    this.hp.set(Y, Math.max(0, this.hp.get(Y) - dmg));
    this.play(Y, 'Hurt');
    Y.hurtT = 0.45;
    Y.knock = (Y.x > X.x ? 1 : -1) * 3; Y.x += Y.knock; this.knockAt = this.t;
    if (crit) Y.say('!');
    this.world.effects.push({ kind: 'impact', color: crit ? '#ffe23a' : '#ffffff', x0: Y.x, y0: Y.headY() + 8, x1: Y.x, y1: Y.headY() + 8, t: 0, dur: 0.35 });
  }

  /** Ends the battle. winner is null when it was called off (someone wandered away, the field changed). */
  end(winner) {
    if (this.over) return;
    this.over = true;
    this.world.battles = this.world.battles.filter((x) => x !== this);
    for (const m of [this.a, this.b]) {
      if (m.knock) { m.x -= m.knock; m.knock = 0; }
      m.battle = null;
      m.steps = [];
      m.activity = 'rest';
      m.cooldown = 60 + this.world.random() * 60;
      m.hunger = Math.min(1, m.hunger + 0.15);
    }
    if (winner) {
      const loser = this.other(winner);
      winner.entry.wins = (winner.entry.wins || 0) + 1;
      loser.entry.losses = (loser.entry.losses || 0) + 1;
      winner.say('heart');
      loser.say('sweat');
      loser.steps = [{ type: 'anim', name: 'Sit', dur: 6 }];
    }
    this.onFinish?.(winner);
  }
}

/** Draws move effects (projectiles and hit sparks) and drops the finished ones. */
export function drawEffects(ctx, world, dt) {
  world.effects = world.effects.filter((e) => (e.t += dt) < e.dur);
  for (const e of world.effects) {
    const k = Math.min(1, e.t / e.dur);
    let x = e.x0 + (e.x1 - e.x0) * k, y = e.y0 + (e.y1 - e.y0) * k;
    ctx.fillStyle = e.color;
    switch (e.kind) {
      case 'ember':
        for (let i = 0; i < 4; i++) {
          const kk = Math.max(0, k - i * 0.06), xx = e.x0 + (e.x1 - e.x0) * kk, yy = e.y0 + (e.y1 - e.y0) * kk - Math.sin(kk * Math.PI) * 4;
          ctx.fillStyle = i === 0 ? '#fff2a0' : e.color; fillEllipse(ctx, xx, yy, 2 - i * 0.4, 2 - i * 0.4);
        }
        break;
      case 'bubble':
        for (let i = 0; i < 3; i++) {
          const kk = Math.max(0, k - i * 0.1), xx = e.x0 + (e.x1 - e.x0) * kk, yy = e.y0 + (e.y1 - e.y0) * kk + Math.sin(kk * 12 + i) * 2;
          ctx.strokeStyle = e.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(Math.round(xx) + 0.5, Math.round(yy) + 0.5, 2, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      case 'bolt': {
        ctx.strokeStyle = e.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(e.x0, e.y0);
        const n = 6;
        for (let i = 1; i <= n; i++) {
          const kk = (i / n) * k;
          ctx.lineTo(e.x0 + (e.x1 - e.x0) * kk + (i < n ? (world.random() - 0.5) * 6 : 0), e.y0 + (e.y1 - e.y0) * kk + (i < n ? (world.random() - 0.5) * 6 : 0));
        }
        ctx.stroke();
        break;
      }
      case 'leaf':
        for (let i = 0; i < 3; i++) {
          const kk = Math.max(0, k - i * 0.08), xx = e.x0 + (e.x1 - e.x0) * kk, yy = e.y0 + (e.y1 - e.y0) * kk + Math.cos(kk * 9 + i * 2) * 3;
          const f = Math.floor(e.t * 20 + i) % 2;
          ctx.fillRect(Math.round(xx) - (f ? 2 : 1), Math.round(yy), f ? 4 : 2, f ? 2 : 3);
        }
        break;
      case 'orb':
        ctx.globalAlpha = 0.4; fillEllipse(ctx, x, y, 4, 4); ctx.globalAlpha = 1;
        fillEllipse(ctx, x, y, 2.5, 2.5); ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1);
        break;
      case 'rock':
        y -= Math.sin(k * Math.PI) * 10;
        ctx.fillStyle = '#5a4a3a'; fillEllipse(ctx, x, y + 1, 3, 2);
        ctx.fillStyle = e.color; fillEllipse(ctx, x, y, 3, 2);
        break;
      case 'impact': {
        const r = 2 + k * 7;
        ctx.globalAlpha = 1 - k;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.fillRect(Math.round(e.x0 + Math.cos(a) * r), Math.round(e.y0 + Math.sin(a) * r * 0.7), 1, 1);
          ctx.fillRect(Math.round(e.x0 + Math.cos(a) * r * 0.6), Math.round(e.y0 + Math.sin(a) * r * 0.42), 1, 1);
        }
        ctx.globalAlpha = 1;
        break;
      }
    }
  }
}
