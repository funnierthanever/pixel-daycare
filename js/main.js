import { NAMES } from './data.js';
import { createIngest } from './ingest.js';
import { hitObject } from './objects.js';
import { createWorld, drawSky, drawAmbient, drawLighting, lightAt, phaseName, BIOMES } from './world.js';
import { Mon, Egg, tryGreet } from './mons.js';
import { createEditor } from './editor.js';
import { createPC } from './pc.js';
import { createRoam, favoriteArea } from './roam.js';
import { drawEffects } from './battle.js';
import { updateTrainer, drawTrainerEmote } from './trainer.js';
import { makeCode, linkFor, codeFrom, readCode, visitCodeInUrl } from './visit.js';

// Trainer look: Kenney's RPG Urban Pack characters (CC0), six people with walk cycles.
const trainerSheet = new Image();
let trainerReady = false;
trainerSheet.onload = () => { trainerReady = true; };
trainerSheet.src = 'assets/trainer.png';

const MAX_MONS = 16;
const STORE_KEY = 'daycare.v1';
const WORLD_KEY = 'daycare.world.v1';

// ---------- persistence ----------
const store = {
  load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; } },
  save(data) { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* private mode etc. */ } },
};

const DEMO = [1, 4, 7, 25, 133, 92, 163, 143, 258].map((species, i) => ({
  species, nickname: '', level: 5 + i, shiny: false, nature: (i * 7 + 3) % 25, egg: false, source: 'demo',
}));

// Visiting someone? Their house comes from the link and lives only in memory; your own house is untouched.
const visitCode = visitCodeInUrl();
const visit = visitCode ? await readCode(visitCode) : null;
if (visitCode && !visit) {
  history.replaceState(null, '', location.pathname + location.search);
  setTimeout(() => alert("That visit link didn't work. It may have been cut off when it was copied."), 300);
}
const home = store.load();
const state = visit ? visit.state : (home || { roster: DEMO, timeMode: 'live', previewHour: 12, speed: 1 });
const persist = visit ? () => {} : () => store.save(state);
const me = { look: home?.trainerLook || 0, name: home?.trainerName || '' };
if (visit) document.documentElement.classList.add('visiting');

// ---------- boxes ----------
// Like PC boxes: each box is its own area (meadow, desert, river, beach…) with its own residents.
// The first time, four starter boxes are made and the demo Pokémon move into fitting homes.
if (!state.boxes) {
  state.boxes = [
    { id: 'b1', name: 'Meadow', biome: 'meadow' },
    { id: 'b2', name: 'Desert', biome: 'desert' },
    { id: 'b3', name: 'River', biome: 'river' },
    { id: 'b4', name: 'Beach', biome: 'ocean' },
  ];
  state.box = 'b1';
  const home = { 4: 'b2', 1: 'b3', 258: 'b3', 7: 'b4', 25: 'b4' };
  for (const e of state.roster) e.box = e.box || (e.source === 'demo' && home[e.species]) || 'b1';
  persist();
}
// The connected world: a giant hub house in the middle, with a door to every area. Pokémon roam
// between areas on their own. Older saves get the hub plus the City and Mountain areas added.
if (!state.boxes.some((b) => b.biome === 'hub')) {
  state.boxes.unshift({ id: 'hub', name: 'Hub', biome: 'hub' });
  if (!state.boxes.some((b) => b.biome === 'city')) state.boxes.push({ id: 'b5', name: 'City', biome: 'city' });
  if (!state.boxes.some((b) => b.biome === 'mountain')) state.boxes.push({ id: 'b6', name: 'Mountain', biome: 'mountain' });
  state.box = 'hub';
  // Everyone starts in the big house, then heads out to the areas they like over the next few minutes.
  for (const e of state.roster) { e.box = 'hub'; e.transit = null; e.stay = (state.sim?.hours || 0) + Math.random() * 0.08; }
}
state.sim ||= { hours: 0 };
const HUB_ID = state.boxes.find((b) => b.biome === 'hub').id;
if (!state.boxes.some((b) => b.id === state.box)) state.box = HUB_ID;
for (const e of state.roster) {
  if (!e.transit && !state.boxes.some((b) => b.id === e.box)) e.box = HUB_ID;
  if (e.transit && !state.boxes.some((b) => b.id === e.transit.to)) { e.transit = null; e.box = HUB_ID; }
  if (!e.egg && e.size == null) e.size = Math.round((0.9 + Math.random() * 0.2) * 100) / 100;
}
persist();
const currentBox = () => state.boxes.find((b) => b.id === state.box);
const capOf = (id) => (state.boxes.find((b) => b.id === id)?.biome === 'hub' ? 30 : MAX_MONS);
const inBox = (id = state.box) => state.roster.filter((e) => e.box === id && !e.transit);
const areaInfo = () => new Map(state.boxes.map((b) => [b.id, { biome: b.biome, name: b.name, wall: BIOMES[b.biome]?.wall }]));
let areasForDraw = areaInfo();

// Each box's build is kept separately. Until you edit a box, its default layout adapts to the screen.
const worldKey = (id) => (id === 'b1' ? WORLD_KEY : `${WORLD_KEY}.${id}`);
const worldStore = visit ? {
  load(id = state.box) { return visit.layouts[id] || null; },
  save(data, id = state.box) { visit.layouts[id] = data; },
  drop(id) { delete visit.layouts[id]; },
} : {
  load(id = state.box) { try { return JSON.parse(localStorage.getItem(worldKey(id))) || null; } catch { return null; } },
  save(data, id = state.box) { try { localStorage.setItem(worldKey(id), JSON.stringify(data)); } catch { /* storage full or blocked */ } },
  drop(id) { try { localStorage.removeItem(worldKey(id)); } catch { /* blocked */ } },
};

// ---------- canvas & world ----------
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
let world, mons = [], eggs = [], scale = 1;

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  scale = Math.max(1, Math.round(vh / 265));
  const W = Math.ceil(vw / scale), H = Math.ceil(vh / scale);
  canvas.width = W; canvas.height = H;
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
  ctx.imageSmoothingEnabled = false;
  const saved = worldStore.load();
  const outdoor = state.boxes.filter((b) => b.biome !== 'hub').map((b) => b.id);
  world = createWorld(W, H, saved, currentBox().biome, { areas: outdoor });
  if (world.indoor && saved && saved.objects.filter((o) => o.type === 'door').length !== outdoor.length) worldStore.save(world.serialize());
  world.roam = roam;
  world.areaId = state.box;
  world.areaName = (id) => state.boxes.find((b) => b.id === id)?.name;
  world.onBattle = () => persist();
  world.cheer = () => { for (const o of world.objects) if (o.type === 'trainer') o.waveUntil = world.time + 2.5; };
  // When visiting, your own trainer comes along and walks around the host's hub.
  if (visit && world.indoor) {
    const near = world.trainer || { x: W * 0.3, y: H * 0.6 };
    const spot = world.nearestWalkable(near.x + 40, near.y + 10);
    world.objects.push({ type: 'trainer', guest: true, look: me.look, x: Math.round(spot.x), y: Math.round(spot.y), s: 0, seed: 2, id: 9999 });
  }
  areasForDraw = areaInfo();
  editor.reset();
  spawn();
  renderBoxbar();
}

function spawn() {
  for (const m of mons) m.interrupt();
  const hour = clock.hour;
  mons = []; eggs = [];
  const list = inBox().slice(0, capOf(state.box));
  let bed = 0, sized = false;
  for (const e of list) if (!e.egg && e.size == null) { e.size = Math.round((0.9 + Math.random() * 0.2) * 100) / 100; sized = true; }
  if (sized) persist();
  list.forEach((e, i) => {
    if (e.egg) { eggs.push(new Egg(world, eggs.length)); return; }
    if (!e.species) return;
    const m = new Mon(e, world, i);
    if (!m.nocturnal && m.favorite !== 'shade' && m.favorite !== 'pond') m.bedIndex = bed++;
    // Start already tucked in if it's their bedtime, rather than everyone stampeding to bed.
    if (!m.isAwakeTime(hour)) { const s = m.sleepSpot(); m.x = s.x; m.y = s.y; }
    mons.push(m);
  });
}

// ---------- roaming ----------
const roam = createRoam({
  getState: () => state,
  persist,
  viewing: () => state.box,
  // A Pokémon came through a door into the area on screen.
  onArrive(e, from) {
    if (!world || !e.species) return;
    const p = world.portal(world.indoor ? from : HUB_ID);
    if (p.door) p.door.openUntil = world.time + 0.8;
    mons.push(new Mon(e, world, mons.length, { at: p }));
  },
  // A Pokémon on screen walked out through a door.
  onDepart(mon) {
    mons = mons.filter((m) => m !== mon);
    if (cardFor === mon) cardEl.classList.remove('show');
  },
});

// ---------- clock ----------
const clock = { hour: 12, deltaHours: 0 };
let lastReal = performance.now();

function liveHour() { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }

function tickClock(dtReal) {
  const prev = clock.hour;
  if (state.timeMode === 'live') clock.hour = liveHour();
  else {
    state.previewHour = (state.previewHour + (dtReal * state.speed) / 3600) % 24;
    clock.hour = state.previewHour;
  }
  let d = clock.hour - prev;
  if (d < -12) d += 24;
  clock.deltaHours = Math.max(0, Math.min(d, 1));
  // meal times: bowls get refilled
  for (const meal of [0, 6, 12, 18]) {
    if (crossed(prev, clock.hour, meal)) refillBowls();
  }
  return Math.abs(d) > 0.3; // big jump (slider)
}
const crossed = (a, b, m) => (a <= b ? a < m && b >= m : a < m || b >= m) && a !== b;

function refillBowls() {
  for (const b of world.bowls) {
    b.fill = 1;
    for (let i = 0; i < 4; i++) world.particles.push({ kind: 'sparkle', x: b.x + (Math.random() - 0.5) * 14, y: b.y - 4 - Math.random() * 6, vx: 0, vy: -3, life: 0, max: 1.2 });
  }
}

// ---------- build mode ----------
const editor = createEditor({
  canvas,
  getWorld: () => world,
  getScale: () => scale,
  getMons: () => mons,
  onBiome(biome) {
    if (typeof biome !== 'string' || !Object.hasOwn(BIOMES, biome)) return;
    currentBox().biome = biome;
    persist();
    layout();
  },
  onChange() {
    worldStore.save(world.serialize());
    if (world.trainer) { world.trainer.home = null; world.trainer.ai = null; }
    for (const m of mons) m.worldChanged();
    for (const e of eggs) e.place();
  },
});

// ---------- main loop ----------
let t = 0, greetTimer = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - lastReal) / 1000));
  lastReal = now;
  t += dt;
  const jumped = tickClock(dt);
  if (jumped) for (const m of mons) m.interrupt();
  world.lanternLit = lightAt(clock.hour).night > 0.3;

  world.time = t;
  roam.tick(clock.deltaHours, clock.hour);
  for (const m of mons) m.update(dt, clock, mons);
  for (const b of [...world.battles]) b.update(dt);
  if (!editor.active) for (const o of world.objects) if (o.type === 'trainer') updateTrainer(world, mons, dt, o);
  for (const e of eggs) e.update(dt);
  greetTimer -= dt;
  if (greetTimer <= 0) {
    greetTimer = 0.5;
    for (let i = 0; i < mons.length; i++) for (let j = i + 1; j < mons.length; j++) {
      const a = mons[i], b = mons[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 16 && world.random() < 0.3) tryGreet(a, b, world.random) || tryGreet(b, a, world.random);
    }
  }

  // draw (always daylight while building, so you can see what you're doing)
  const hour = editor.active ? 12 : clock.hour;
  const lt = lightAt(hour);
  const env = { t, night: lt.night, R: world.random, areas: areasForDraw, sky: { top: lt.skyTop, bottom: lt.skyBottom },
    trainerSheet: trainerReady ? trainerSheet : null, trainerLook: state.trainerLook || 0 };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSky(ctx, world, hour, t);
  world.drawGround(ctx, env);
  const ents = [
    ...world.entities(ctx, env),
    ...mons.map((m) => ({ y: m.y, draw: () => m.draw(ctx, t) })),
    ...eggs.map((e) => ({ y: e.y, draw: () => e.draw(ctx) })),
  ].sort((a, b) => a.y - b.y);
  for (const e of ents) e.draw();
  drawEffects(ctx, world, dt);
  drawAmbient(ctx, world, hour, t, dt);
  drawLighting(ctx, world, hour, t);
  for (const m of mons) m.drawEmote(ctx);
  for (const e of eggs) e.drawEmote(ctx);
  drawTrainerEmote(ctx, world);
  editor.drawOverlay(ctx, t);

  updateHud();
  requestAnimationFrame(frame);
}

// ---------- HUD & interaction ----------
const $ = (id) => document.getElementById(id);
const clockEl = $('clock');
let hudShown = '';
function updateHud() {
  const h = Math.floor(clock.hour), m = Math.floor((clock.hour % 1) * 60);
  const s = `${h}:${String(m).padStart(2, '0')} · ${phaseName(clock.hour)}${state.timeMode === 'preview' ? ' (preview)' : ''}`;
  if (s !== hudShown) { clockEl.textContent = s; hudShown = s; }
  if (cardFor && cardEl.classList.contains('show')) positionCard();
}

const cardEl = $('card');
let cardFor = null, cardTimer = 0;
function positionCard() {
  const x = cardFor.x * scale, y = (cardFor.headY ? cardFor.headY() : cardFor.y - 14) * scale;
  cardEl.style.left = Math.min(window.innerWidth - cardEl.offsetWidth - 8, Math.max(8, x - cardEl.offsetWidth / 2)) + 'px';
  cardEl.style.top = Math.max(8, y - cardEl.offsetHeight - 22) + 'px';
}
function showCard(ent, note) {
  cardFor = ent;
  const isMon = ent instanceof Mon;
  const e = ent.entry;
  cardEl.innerHTML = isMon
    ? `<b>${esc(ent.name)}</b>${e.shiny ? ' <span class="shiny">★</span>' : ''}<br>
       <small>${esc(NAMES[ent.species])}${e.level ? ' · Lv ' + e.level : ''} · ${ent.nature}</small><br>
       <span>${esc(note || ent.label)}</span><br>
       <small>${ent.nocturnal ? 'Night owl' : 'Early bird'} · favourite area: ${esc(favoriteArea(e, state.boxes)?.name || '—')}${e.wins || e.losses ? ` · arena ${e.wins || 0}W ${e.losses || 0}L` : ''}</small>`
    : `<b>Egg</b><br><span>${esc(note || ent.label)}</span>`;
  cardEl.classList.add('show');
  positionCard();
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => cardEl.classList.remove('show'), 5000);
}
function showTrainerCard(tr) {
  tr.waveUntil = world.time + 2.5;
  const here = mons.length, champ = [...state.roster].filter((e) => e.wins).sort((a, b) => b.wins - a.wins)[0];
  cardFor = { x: tr.x, y: tr.y, headY: () => tr.y - 30 };
  tr.emote = { kind: 'note', t: 0 };
  const title = tr.guest ? `${esc(me.name || 'You')} <small>(visiting)</small>` : visit ? esc(visit.owner) : esc(state.trainerName || 'You');
  const sub = tr.guest ? 'Just dropping by' : visit ? 'Owner of this house' : 'The trainer of this house';
  cardEl.innerHTML = `<b>${title}</b><br><small>${sub}</small><br><span>${here} Pokémon in the hub right now.</span>${champ ? `<br><small>Arena champ: ${esc(champ.nickname || NAMES[champ.species])} (${champ.wins} wins)</small>` : ''}`;
  cardEl.classList.add('show');
  positionCard();
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => cardEl.classList.remove('show'), 5000);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Buttons react when the finger lifts instead of waiting for Safari's click, which can arrive late
// (iOS holds it while deciding whether a tap is part of a double-tap). Mouse clicks are untouched.
{
  let down = null, lastType = 'mouse';
  document.addEventListener('pointerdown', (e) => {
    lastType = e.pointerType;
    down = e.pointerType === 'touch' ? { b: e.target.closest('button'), x: e.clientX, y: e.clientY } : null;
  }, true);
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || !down?.b) return;
    const b = e.target.closest('button') || document.elementFromPoint(e.clientX, e.clientY)?.closest('button');
    if (b === down.b && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 14) b.click();
    down = null;
  }, true);
  document.addEventListener('click', (e) => {
    if (e.isTrusted && lastType === 'touch' && e.target.closest?.('button')) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
}

// Touches on the field are handled as pointer events. Cancelling the touch stops iOS from treating a tap
// as the first half of a double-tap zoom, which would swallow the next tap on a button.
canvas.addEventListener('touchstart', (ev) => ev.preventDefault(), { passive: false });

let swipe = null;
canvas.addEventListener('pointerdown', (ev) => {
  requestWakeLock();
  if (editor.active) return;
  swipe = { x: ev.clientX, y: ev.clientY, t: performance.now() };
  const x = ev.clientX / scale, y = ev.clientY / scale;
  const hit = [...mons, ...eggs].filter((m) => m.hit(x, y)).sort((a, b) => b.y - a.y)[0];
  const tr = hit ? null : world.objects.find((o) => o.type === 'trainer' && Math.abs(x - o.x) < 10 && y > o.y - 30 && y < o.y + 3);
  if (hit) showCard(hit, hit.pet());
  else if (tr) showTrainerCard(tr);
  else cardEl.classList.remove('show');
  if (!hit && !tr) swipe.door = doorAt(x, y);
  showChrome();
});

// Doors in the hub lead to their area; an area's house leads back into the hub.
function doorAt(x, y) {
  const o = world.objects.filter((o) => (o.type === 'door' || (o.type === 'house' && !world.indoor)) && hitObject(o, x, y)).sort((a, b) => b.y - a.y)[0];
  if (!o) return null;
  const to = o.type === 'door' ? o.link : HUB_ID;
  return to && to !== state.box && state.boxes.some((b) => b.id === to) ? to : null;
}
function goThrough(to) {
  const from = state.boxes.indexOf(currentBox()), i = state.boxes.findIndex((b) => b.id === to);
  cardEl.classList.remove('show');
  switchBox(to, i >= from ? 1 : -1);
}
// With a mouse, show a hand over doors so it's clear they can be clicked.
canvas.addEventListener('pointermove', (ev) => {
  if (ev.pointerType !== 'mouse' || editor.active) return;
  canvas.style.cursor = doorAt(ev.clientX / scale, ev.clientY / scale) ? 'pointer' : '';
});
// Swipe left or right across the field to flip to the next box.
canvas.addEventListener('pointerup', (ev) => {
  const s = swipe;
  swipe = null;
  if (!s || editor.active) return;
  const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
  if (Math.abs(dx) > 90 && Math.abs(dy) < Math.abs(dx) * 0.6 && performance.now() - s.t < 800) {
    cardEl.classList.remove('show');
    stepBox(dx < 0 ? 1 : -1);
  } else if (s.door && Math.hypot(dx, dy) < 12) goThrough(s.door);
});

// ---------- box header & switching ----------
function renderBoxbar() {
  const b = currentBox(), i = state.boxes.indexOf(b);
  const [a, c] = BIOMES[b.biome]?.wall || BIOMES.meadow.wall;
  $('boxbar').style.background = `linear-gradient(135deg, ${a}, ${c})`;
  $('boxNo').textContent = b.biome === 'hub' ? 'THE BIG HOUSE' : `AREA ${i} OF ${state.boxes.length - 1}`;
  $('boxName').textContent = b.name;
  $('boxPrev').disabled = $('boxNext').disabled = state.boxes.length < 2;
}
function stepBox(d) {
  const i = state.boxes.indexOf(currentBox());
  switchBox(state.boxes[(i + d + state.boxes.length) % state.boxes.length].id, d);
}
// Slides the old box out and the new one in, like flipping PC boxes.
function switchBox(id, dir = 1) {
  if (id === state.box || editor.active) return;
  const snap = document.createElement('canvas');
  snap.width = canvas.width; snap.height = canvas.height;
  snap.getContext('2d').drawImage(canvas, 0, 0);
  snap.className = 'snap';
  snap.style.width = canvas.style.width; snap.style.height = canvas.style.height;
  document.body.appendChild(snap);
  state.box = id;
  persist();
  layout();
  canvas.style.transition = 'none';
  canvas.style.transform = `translateX(${dir * 100}%)`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    canvas.style.transition = '';
    canvas.style.transform = '';
    snap.style.transform = `translateX(${-dir * 100}%)`;
  }));
  setTimeout(() => snap.remove(), 450);
}

const pc = createPC({
  getState: () => state,
  persist,
  perBox: MAX_MONS,
  capOf,
  readOnly: !!visit,
  moveEntry: (e, to) => roam.teleport(e, to),
  getSize: () => [canvas.width, canvas.height],
  loadLayout: (id) => worldStore.load(id),
  dropLayout: (id) => worldStore.drop(id),
  onVisit: (id) => {
    const from = state.boxes.indexOf(currentBox()), to = state.boxes.findIndex((b) => b.id === id);
    switchBox(id, to >= from ? 1 : -1);
  },
  onChanged(what) {
    // Rebuild the field if the box on screen changed (residents moved, area changed, box deleted).
    areasForDraw = areaInfo();
    if (what.biome === state.box || what.deleted || what.added || (what.moved && what.moved.includes(state.box)) || what.biome) layout();
    else renderBoxbar();
  },
});

// fade the corner buttons when idle so the display stays clean
let chromeTimer = 0;
function showChrome() {
  document.body.classList.remove('idle');
  if (editor.active) return;
  clearTimeout(chromeTimer);
  chromeTimer = setTimeout(() => document.body.classList.add('idle'), 6000);
}

// ---------- settings panel ----------
const panel = $('panel');
$('open').onclick = () => { renderRoster(); syncTimeUi(); renderLooks(); panel.classList.add('show'); };

// Pick how your trainer looks (front-facing frame of each character in the sheet).
function renderLooks() {
  const box = $('trainerLooks');
  box.innerHTML = '';
  if (!trainerReady) { box.textContent = 'Loading…'; trainerSheet.addEventListener('load', renderLooks, { once: true }); return; }
  for (let i = 0; i < 6; i++) {
    const b = document.createElement('button');
    b.className = 'look' + ((state.trainerLook || 0) === i ? ' on' : '');
    b.title = ['Green shirt', 'Red hair', 'Grey hair', 'Hard hat', 'Bald', 'Dark hair'][i];
    const cv = document.createElement('canvas');
    cv.width = cv.height = 16;
    cv.getContext('2d').drawImage(trainerSheet, 16, i * 48, 16, 16, 0, 0, 16, 16);
    b.appendChild(cv);
    b.onclick = () => { state.trainerLook = i; persist(); renderLooks(); };
    box.appendChild(b);
  }
}
$('close').onclick = () => panel.classList.remove('show');
$('build').onclick = () => { cardEl.classList.remove('show'); editor.enter(); };
$('pcBtn').onclick = () => { cardEl.classList.remove('show'); pc.open(); };

// ---------- visiting ----------
const goHome = () => { history.replaceState(null, '', location.pathname + location.search); location.reload(); };
// Clicking a visit link while the daycare is already open only changes the part after '#', which
// doesn't reload the page on its own, so reload when a different visit code shows up.
window.addEventListener('hashchange', () => { if (visitCodeInUrl() !== visitCode) location.reload(); });
if (visit) $('visitText').textContent = `Visiting ${visit.owner}'s house`;
$('goHome').onclick = $('goHome2').onclick = goHome;
$('visitFriend').onclick = () => {
  const code = codeFrom(prompt('Paste a visit link or code from a friend:') || '');
  if (!code) return;
  location.hash = 'visit=' + code;
  location.reload();
};
$('trainerName').value = state.trainerName || '';
$('trainerName').onchange = () => { state.trainerName = $('trainerName').value.trim().slice(0, 16); persist(); };
$('shareForm').onsubmit = async (ev) => {
  ev.preventDefault();
  state.trainerName = $('trainerName').value.trim().slice(0, 16);
  persist();
  const out = $('shareResult');
  out.innerHTML = 'Packing up your house…';
  const layouts = Object.fromEntries(state.boxes.map((b) => [b.id, worldStore.load(b.id)]));
  let link;
  try { link = linkFor(await makeCode(state, layouts)); } catch (err) { out.innerHTML = '<p class="warn">Sharing needs a newer browser (Safari 16.4 or later).</p>'; return; }
  const title = `${state.trainerName || 'My'}${state.trainerName ? "'s" : ''} Pixel Daycare`;
  out.innerHTML = '<p class="ok">Here is your visit link. Anyone who opens it sees your house as it is now.</p>';
  const ta = document.createElement('textarea');
  ta.readOnly = true; ta.value = link; ta.onclick = () => ta.select();
  const copy = document.createElement('button');
  copy.textContent = 'Copy link';
  copy.onclick = async () => { try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied!'; } catch { ta.select(); } };
  out.append(ta, copy);
  if (window.webkit?.messageHandlers?.share) window.webkit.messageHandlers.share.postMessage({ url: link, title });
  else if (navigator.share) navigator.share({ title, url: link }).catch(() => {});
};
$('boxPrev').onclick = () => stepBox(-1);
$('boxNext').onclick = () => stepBox(1);

const dl = $('names');
NAMES.forEach((n, i) => { if (i) { const o = document.createElement('option'); o.value = n; dl.appendChild(o); } });

function renderRoster() {
  const ul = $('roster');
  ul.innerHTML = '';
  state.roster.forEach((e, i) => {
    if (e.box !== state.box) return;
    const li = document.createElement('li');
    const sp = e.egg ? 'Egg' : NAMES[e.species] || `Unknown #${e.rawSpecies ?? '?'}`;
    const nick = e.nickname && e.nickname !== sp ? `${esc(e.nickname)} <small>(${esc(sp)})</small>` : esc(sp);
    li.innerHTML = `<span>${nick}${e.level ? ` <small>Lv ${e.level}</small>` : ''}</span>`;
    if (!e.egg) {
      const star = document.createElement('button');
      star.className = 'mini' + (e.shiny ? ' on' : '');
      star.textContent = '★'; star.title = 'Shiny';
      star.onclick = () => { e.shiny = !e.shiny; commit(); };
      li.appendChild(star);
    }
    const move = document.createElement('select');
    move.className = 'mini'; move.title = 'Move to another box';
    move.innerHTML = state.boxes.map((b) => `<option value="${b.id}"${b.id === e.box ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
    move.onchange = () => {
      if (inBox(move.value).length >= capOf(move.value)) { alert('That area is full.'); move.value = e.box; return; }
      roam.teleport(e, move.value); commit();
    };
    li.appendChild(move);
    const del = document.createElement('button');
    del.className = 'mini'; del.textContent = '✕'; del.title = 'Remove';
    del.onclick = () => { state.roster.splice(i, 1); commit(); };
    li.appendChild(del);
    ul.appendChild(li);
  });
  $('count').textContent = `in ${currentBox().name}: ${inBox().length}/${capOf(state.box)}`;
}
function commit() { persist(); renderRoster(); spawn(); }

$('addForm').onsubmit = (ev) => {
  ev.preventDefault();
  const q = $('addName').value.trim().toLowerCase();
  if (!q) return;
  let species = /^\d+$/.test(q) ? +q : NAMES.findIndex((n) => n.toLowerCase() === q);
  if (!(species > 0 && species < NAMES.length)) { $('addMsg').textContent = 'Not found — pick a name from the list (Gen 1–5).'; return; }
  if (inBox().length >= capOf(state.box)) { $('addMsg').textContent = 'This box is full. Open the PC to pick another box.'; return; }
  state.roster.push({ species, nickname: $('addNick').value.trim(), level: 0, shiny: $('addShiny').checked, nature: Math.floor(Math.random() * 25), egg: false, source: 'manual', box: state.box });
  $('addName').value = ''; $('addNick').value = ''; $('addShiny').checked = false; $('addMsg').textContent = '';
  commit();
};

$('clearDemo').onclick = () => { state.roster = state.roster.filter((e) => e.source !== 'demo'); commit(); };

// ---------- bringing Pokémon in from a save ----------
// Who moves in where: the first dozen (your party comes first) arrive in the hub so you see them
// right away; the rest go straight to the area they like best, or the hub, or anywhere with room.
function placeImport(mons, mode) {
  if (mode === 'replace') state.roster = [];
  const where = (e) => e.box ?? e.transit?.to;
  const count = new Map(state.boxes.map((b) => [b.id, state.roster.filter((e) => where(e) === b.id).length]));
  const room = (id) => id && count.get(id) < capOf(id);
  const now = state.sim.hours;
  let placed = 0;
  mons.forEach((m, i) => {
    const e = { species: m.species, nickname: m.nickname || '', level: m.level | 0, shiny: !!m.shiny, nature: m.nature | 0, egg: !!m.egg, source: 'save' };
    const fav = e.egg ? null : favoriteArea(e, state.boxes)?.id;
    const id = i < 12 && room(HUB_ID) ? HUB_ID : room(fav) ? fav : room(HUB_ID) ? HUB_ID : state.boxes.find((b) => room(b.id))?.id;
    if (!id) return;
    e.box = id;
    e.stay = now + 0.05 + Math.random() * 0.2;
    if (!e.egg) e.size = Math.round((0.9 + Math.random() * 0.2) * 100) / 100;
    count.set(id, count.get(id) + 1);
    state.roster.push(e);
    placed++;
  });
  state.welcomed = true;
  state.box = HUB_ID;
  persist();
  layout();
  renderRoster();
  return placed;
}
const capacity = () => state.boxes.reduce((n, b) => n + capOf(b.id), 0);
const ingest = createIngest({
  room: (mode) => capacity() - (mode === 'replace' ? 0 : state.roster.length),
  hasResidents: () => state.roster.some((e) => e.source !== 'demo'),
  onImport: placeImport,
  visiting: !!visit,
});
$('saveFile').onchange = (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  panel.classList.remove('show');
  ingest.openFile(file);
};
// New visitors see the welcome card over the demo until they bring Pokémon in or say "later".
if (!visit && !state.welcomed && !state.roster.some((e) => e.source === 'save')) {
  ingest.showWelcome(() => { state.welcomed = true; persist(); });
}

// time controls
function syncTimeUi() {
  $('live').checked = state.timeMode === 'live';
  $('preview').checked = state.timeMode === 'preview';
  $('hour').value = state.previewHour;
  $('speed').value = String(state.speed);
  $('previewControls').classList.toggle('disabled', state.timeMode === 'live');
}
$('live').onchange = $('preview').onchange = () => {
  state.timeMode = $('live').checked ? 'live' : 'preview';
  if (state.timeMode === 'preview') state.previewHour = clock.hour;
  persist(); syncTimeUi();
};
$('hour').oninput = () => { state.timeMode = 'preview'; state.previewHour = +$('hour').value; syncTimeUi(); persist(); };
$('speed').onchange = () => { state.speed = +$('speed').value; persist(); };

// ---------- keep the screen on ----------
let wakeLock = null;
async function requestWakeLock() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* not allowed */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') requestWakeLock(); });

if ('serviceWorker' in navigator && window.isSecureContext && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
if (location.protocol === 'daycare:') document.documentElement.classList.add('native');

// ---------- go ----------
clock.hour = state.timeMode === 'live' ? liveHour() : state.previewHour;
layout();
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 200); });
showChrome();
requestAnimationFrame(frame);
window.__daycare = { state, get mons() { return mons; }, clock, get world() { return world; }, editor, pc, ingest, switchBox, roam, frame };


