// Build mode: place, move, resize and remove things, and paint paths, sand and water.
import { CATALOG, SIZE_NAMES, thumbnail, hitObject, spriteFor } from './objects.js';
import { TERRAIN, CELL, BIOMES, defaultLayout } from './world.js';

const OBJECT_ORDER = ['tree', 'pine', 'palm', 'cactus', 'bush', 'reeds', 'flowers', 'shell', 'boulder', 'rock', 'cave', 'pond', 'waterfall',
  'bowl', 'lantern', 'hay', 'bed', 'house', 'fence', 'arena', 'trainer', 'rug', 'plant', 'window', 'building', 'streetlamp', 'bench', 'trashcan', 'litter'];
const MAX_OBJECTS = 220;
const BRUSHES = [{ r: 0, label: 'S' }, { r: 1, label: 'M' }, { r: 2, label: 'L' }];

export function createEditor({ canvas, getWorld, getScale, getMons, onChange, onBiome }) {
  const ed = { active: false };
  let tool = 'obj:tree', brush = 1, selected = null, gesture = null, hover = null;
  const undo = [];

  // ----- DOM -----
  const bar = document.createElement('div'); bar.id = 'buildbar';
  const hint = document.createElement('div'); hint.id = 'buildhint';
  const sel = document.createElement('div'); sel.id = 'selbar';
  const corner = document.createElement('div'); corner.id = 'buildcorner';
  document.body.append(bar, hint, sel, corner);

  const btn = (cls, html, title, onclick) => {
    const b = document.createElement('button');
    b.className = cls; b.innerHTML = html; b.title = title; b.onclick = onclick;
    return b;
  };
  const group = (label) => { const g = document.createElement('div'); g.className = 'bgroup'; g.dataset.label = label; bar.appendChild(g); return g; };
  const toolButtons = new Map();
  const toolBtn = (g, id, icon, label) => {
    const b = btn('tool', `${icon}<span>${label}</span>`, label, () => setTool(id));
    toolButtons.set(id, b); g.appendChild(b);
  };

  function buildBar() {
    bar.innerHTML = '';
    const done = group('');
    done.appendChild(btn('tool done', '✓<span>Done</span>', 'Done building', () => ed.exit()));
    const tools = group('Tools');
    toolBtn(tools, 'move', '<i class="ico">✋</i>', 'Move');
    toolBtn(tools, 'erase', '<i class="ico">🧹</i>', 'Erase');
    const paint = group('Paint');
    const B = BIOMES[getWorld().biome] || BIOMES.meadow;
    TERRAIN.forEach((T, c) => {
      const sw = c === 0
        ? `<i class="swatch" style="background:${B.ground[0]};border-color:${B.ground[2]}"></i>`
        : `<i class="swatch" style="background:${T.base};border-color:${T.edge}"></i>`;
      toolBtn(paint, 'paint:' + c, sw, c === 0 ? B.groundName : T.label);
    });
    const size = btn('tool brush', '', 'Brush size', () => { brush = (brush + 1) % BRUSHES.length; syncBar(); });
    size.id = 'brushBtn';
    paint.appendChild(size);
    const objs = group('Build');
    for (const type of OBJECT_ORDER) toolBtn(objs, 'obj:' + type, `<img src="${thumbnail(type)}" alt="">`, CATALOG[type].label);
    corner.innerHTML = '';
    corner.appendChild(btn('pill', '↶ Undo', 'Undo', doUndo));
    corner.appendChild(btn('pill', 'Reset', 'Put the original daycare back', () => {
      if (!confirm('Put the daycare back the way it started? (You can undo this.)')) return;
      const w = getWorld();
      snapshot(); w.load(defaultLayout(w.L.W, w.L.H, w.biome)); select(null); onChange();
    }));
    corner.appendChild(btn('pill', 'Export', 'Save this world as a file', exportWorld));
    corner.appendChild(btn('pill', 'Import', 'Load a world file', () => importInput.click()));
    corner.appendChild(btn('pill', 'Clear', 'Empty the whole field', () => {
      if (!confirm('Clear the whole field? Your Pokémon stay. (You can undo this.)')) return;
      snapshot(); getWorld().load({ objects: [], terrain: [] }); select(null); onChange();
    }));
    syncBar();
  }

  function setTool(id) { tool = id; if (!id.startsWith('obj:') && id !== 'move') select(null); syncBar(); }

  function syncBar() {
    for (const [id, b] of toolButtons) b.classList.toggle('on', id === tool);
    const b = bar.querySelector('#brushBtn');
    if (b) {
      b.innerHTML = `<i class="dot s${brush}"></i><span>Brush ${BRUSHES[brush].label}</span>`;
      b.classList.toggle('dim', !(tool.startsWith('paint:') || tool === 'erase'));
    }
    hint.textContent = hintText();
  }

  function hintText() {
    if (tool === 'move') return 'Drag anything to move it, Pokémon too. Tap something to resize or remove it.';
    if (tool === 'erase') return 'Tap or drag over things to remove them. Drag over paths to turn them back into grass.';
    if (tool.startsWith('paint:')) {
      const T = +tool.slice(6) === 0 ? { key: '.', label: (BIOMES[getWorld().biome] || BIOMES.meadow).groundName } : TERRAIN[+tool.slice(6)];
      return T.key === 'w' ? 'Drag to paint shallow water. Water types can splash in it; others walk around.' : `Drag on the ground to paint ${T.label.toLowerCase()}.`;
    }
    const T = CATALOG[tool.slice(4)];
    if (T.brush) return `Drag across the field to lay ${T.label.toLowerCase()}. Drag an existing one to move it.`;
    return `Tap the field to place a ${T.label.toLowerCase()}. Drag things to move them.`;
  }

  // ----- selection -----
  function select(o) { selected = o; renderSel(); }
  function renderSel() {
    sel.innerHTML = '';
    if (!selected || !ed.active) { sel.classList.remove('show'); return; }
    const T = CATALOG[selected.type];
    const name = document.createElement('b'); name.textContent = T.label; sel.appendChild(name);
    if (T.sizes) {
      sel.appendChild(btn('mini', '−', 'Smaller', () => resize(-1)));
      const s = document.createElement('span'); s.textContent = SIZE_NAMES[selected.s]; sel.appendChild(s);
      sel.appendChild(btn('mini', '+', 'Bigger', () => resize(1)));
    }
    if (['tree', 'bush', 'flowers', 'boulder', 'pine', 'palm', 'cactus', 'reeds', 'shell'].includes(selected.type)) {
      sel.appendChild(btn('mini', '🎲', 'Shuffle the look', () => { snapshot(); selected.seed = Math.floor(Math.random() * 1e6); onChange(); }));
    }
    if (T.fixed) { const s = document.createElement('small'); s.textContent = 'Doors to every area stay; you can move them.'; sel.appendChild(s); }
    else sel.appendChild(btn('mini danger', 'Remove', 'Remove', () => { snapshot(); getWorld().remove(selected); select(null); onChange(); }));
    sel.classList.add('show');
    positionSel();
  }
  function resize(d) {
    const T = CATALOG[selected.type];
    const s = Math.max(0, Math.min(T.sizes - 1, selected.s + d));
    if (s === selected.s) return;
    snapshot(); selected.s = s; onChange(); renderSel();
  }
  function positionSel() {
    if (!selected || !sel.classList.contains('show')) return;
    const k = getScale(), sp = spriteFor(selected), off = canvas.getBoundingClientRect().top;
    const top = (selected.y + sp.y0) * k + off, bottom = (selected.y + sp.y0 + sp.cv.height) * k + off;
    const w = sel.offsetWidth, h = sel.offsetHeight;
    let y = top - h - 8;
    if (y < 50) y = bottom + 8;
    y = Math.min(window.innerHeight - h - bar.offsetHeight - 8, y);
    sel.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, selected.x * k - w / 2)) + 'px';
    sel.style.top = Math.max(8, y) + 'px';
  }

  // ----- export / import -----
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.json,application/json';
  importInput.style.display = 'none';
  document.body.appendChild(importInput);

  async function exportWorld() {
    const data = { app: 'pixel-daycare', kind: 'world', savedAt: new Date().toISOString(), ...getWorld().serialize() };
    const name = `daycare-world-${new Date().toISOString().slice(0, 10)}.json`;
    const text = JSON.stringify(data);
    // In the iPad app, hand the file to the app, which opens the share sheet.
    if (window.webkit?.messageHandlers?.share) { window.webkit.messageHandlers.share.postMessage({ name, text }); return; }
    const file = new File([text], name, { type: 'application/json' });
    // On iPad the share sheet offers Save to Files and AirDrop; elsewhere it downloads.
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Pixel Daycare world' }); return; }
    } catch (err) { if (err.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    flash('World saved as ' + name, false);
  }

  importInput.onchange = async () => {
    const f = importInput.files[0];
    importInput.value = '';
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { data = null; }
    if (!data || !Array.isArray(data.objects) || (data.kind && data.kind !== 'world')) { flash('That file isn’t a daycare world.'); return; }
    snapshot();
    getWorld().load(data);
    select(null);
    onChange();
    flash(`Loaded ${f.name}. Undo puts your old world back.`, false);
    // A world from another kind of box (say, a beach) turns this box into that area too.
    if (data.biome && data.biome !== getWorld().biome && onBiome) { ed.exit(); onBiome(data.biome); }
  };

  // ----- undo -----
  function snapshot() { undo.push(JSON.stringify(getWorld().serialize())); if (undo.length > 60) undo.shift(); }
  function doUndo() {
    const s = undo.pop();
    if (!s) return;
    getWorld().load(JSON.parse(s));
    select(null);
    onChange();
  }

  // ----- pointer -----
  const toWorld = (ev) => { const r = canvas.getBoundingClientRect(), k = getScale(); return { x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top) / k }; };

  // Front-most object under the finger. With a brush tool (fence, flowers) only that type can be grabbed,
  // so a stroke that starts on a tree still draws instead of dragging the tree away.
  function topObjectAt(p, onlyType = null) {
    const w = getWorld();
    const order = (o) => (CATALOG[o.type].layer === 'entity' ? 100000 : 0) + o.y;
    return w.objects.filter((o) => (!onlyType || o.type === onlyType) && hitObject(o, p.x, p.y)).sort((a, b) => order(b) - order(a))[0] || null;
  }
  const monAt = (p) => getMons().filter((m) => m.hit(p.x, p.y)).sort((a, b) => b.y - a.y)[0];

  function place(type, p) {
    const w = getWorld();
    if (w.objects.length >= MAX_OBJECTS) { flash('That’s a lot of stuff! Remove something first.'); return null; }
    if (p.y < w.L.buildTop - 4) return null;
    const T = CATALOG[type];
    const [x, y] = T.snap ? T.snap(p.x, p.y) : [p.x, p.y];
    const only = T.single && w.objects.find((o) => o.type === type);
    if (only) { w.move(only, x, y); flash(`There's only one ${T.label.toLowerCase()}, so it moved here.`, false); return only; }
    return w.add(type, x, y);
  }
  function brushPlace(type, p) {
    const T = CATALOG[type], w = getWorld();
    const [x, y] = T.snap ? T.snap(p.x, p.y) : [p.x, p.y];
    const gap = T.brush * 0.9;
    if (w.objects.some((o) => o.type === type && Math.hypot(o.x - x, (o.y - y) * (T.snap ? 4 : 1.5)) < gap)) return false;
    return !!place(type, { x, y });
  }
  function eraseAt(p) {
    const o = topObjectAt(p);
    if (o && !CATALOG[o.type].fixed) { getWorld().remove(o); if (o === selected) select(null); return true; }
    if (o) return false;
    return getWorld().paint(p.x, p.y, 0, BRUSHES[brush].r);
  }
  const along = (a, b, step, fn) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / step));
    let any = false;
    for (let i = 1; i <= n; i++) any = fn({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }) || any;
    return any;
  };

  canvas.addEventListener('pointerdown', (ev) => {
    if (!ed.active) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    const p = toWorld(ev);
    hover = p;
    const before = JSON.stringify(getWorld().serialize());
    gesture = { before, changed: false, last: p };
    if (tool === 'move' || tool.startsWith('obj:')) {
      const m = tool === 'move' && monAt(p);
      if (m) { m.interrupt(); m.held = true; Object.assign(gesture, { kind: 'mon', m, dx: m.x - p.x, dy: m.y - p.y }); select(null); return; }
      const brushType = tool.startsWith('obj:') && CATALOG[tool.slice(4)].brush ? tool.slice(4) : null;
      const o = topObjectAt(p, brushType);
      if (o) { select(o); Object.assign(gesture, { kind: 'drag', o, dx: o.x - p.x, dy: o.y - p.y, start: { x: o.x, y: o.y } }); return; }
      if (tool === 'move') { select(null); gesture.kind = 'none'; return; }
      const type = tool.slice(4);
      if (CATALOG[type].brush) { gesture.kind = 'brush'; gesture.type = type; gesture.changed = brushPlace(type, p); select(null); return; }
      const n = place(type, p);
      if (!n) { gesture.kind = 'none'; return; }
      select(n);
      Object.assign(gesture, { kind: 'drag', o: n, dx: n.x - p.x, dy: n.y - p.y, changed: true });
      return;
    }
    if (tool === 'erase') { gesture.kind = 'erase'; gesture.changed = eraseAt(p); return; }
    if (tool.startsWith('paint:')) { gesture.kind = 'paint'; gesture.code = +tool.slice(6); gesture.changed = getWorld().paint(p.x, p.y, gesture.code, BRUSHES[brush].r); }
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!ed.active) return;
    const p = toWorld(ev);
    hover = p;
    const g = gesture;
    if (!g) return;
    if (g.kind === 'drag') {
      const T = CATALOG[g.o.type];
      let x = p.x + g.dx, y = p.y + g.dy;
      if (T.snap) [x, y] = T.snap(x, y);
      getWorld().move(g.o, x, y);
      if (g.o.x !== g.start?.x || g.o.y !== g.start?.y) g.changed = true;
      sel.classList.remove('show');
    } else if (g.kind === 'mon') {
      g.m.x = p.x + g.dx; g.m.y = p.y + g.dy;
    } else if (g.kind === 'brush') {
      g.changed = along(g.last, p, 3, (q) => brushPlace(g.type, q)) || g.changed;
    } else if (g.kind === 'erase') {
      g.changed = along(g.last, p, 2, eraseAt) || g.changed;
    } else if (g.kind === 'paint') {
      g.changed = along(g.last, p, 2, (q) => getWorld().paint(q.x, q.y, g.code, BRUSHES[brush].r)) || g.changed;
    }
    g.last = p;
  });

  const end = () => {
    const g = gesture;
    gesture = null;
    if (!g) return;
    if (g.kind === 'mon') {
      const q = getWorld().nearestWalkable(g.m.x, g.m.y, g.m.canWade);
      g.m.x = q.x; g.m.y = q.y; g.m.held = false; g.m.say('!');
    }
    if (g.changed) {
      undo.push(g.before); if (undo.length > 60) undo.shift();
      onChange();
    }
    if (selected) renderSel();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (!gesture) hover = null; });

  window.addEventListener('keydown', (ev) => {
    if (!ed.active || ev.target.closest?.('input, textarea')) return;
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && selected && !CATALOG[selected.type].fixed) { snapshot(); getWorld().remove(selected); select(null); onChange(); ev.preventDefault(); }
    else if (ev.key === 'z' && (ev.metaKey || ev.ctrlKey)) { doUndo(); ev.preventDefault(); }
    else if (ev.key === 'Escape') { if (selected) select(null); else ed.exit(); }
  });

  let flashTimer = 0;
  function flash(msg, warn = true) { hint.textContent = msg; hint.classList.toggle('warn', warn); clearTimeout(flashTimer); flashTimer = setTimeout(() => { hint.classList.remove('warn'); syncBar(); }, 2500); }

  // ----- overlay drawn on the canvas -----
  ed.drawOverlay = (ctx, t) => {
    if (!ed.active) return;
    if (selected) {
      const sp = spriteFor(selected);
      const x0 = Math.round(selected.x) + sp.x0 - 1, y0 = Math.round(selected.y) + sp.y0 - 1, w = sp.cv.width + 2, h = sp.cv.height + 2;
      const off = Math.floor(t * 8) % 4;
      for (let i = 0; i < w; i++) {
        ctx.fillStyle = (i + off) % 4 < 2 ? '#ffffff' : '#2a2a3a';
        ctx.fillRect(x0 + i, y0, 1, 1); ctx.fillRect(x0 + w - 1 - i, y0 + h - 1, 1, 1);
      }
      for (let i = 0; i < h; i++) {
        ctx.fillStyle = (i + off) % 4 < 2 ? '#ffffff' : '#2a2a3a';
        ctx.fillRect(x0 + w - 1, y0 + i, 1, 1); ctx.fillRect(x0, y0 + h - 1 - i, 1, 1);
      }
      positionSel();
    }
    if (hover && (tool.startsWith('paint:') || tool === 'erase')) {
      const r = BRUSHES[brush].r, ci = Math.floor(hover.x / CELL), cj = Math.floor(hover.y / CELL);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect((ci - r) * CELL + 0.5, (cj - r) * CELL + 0.5, (2 * r + 1) * CELL - 1, (2 * r + 1) * CELL - 1);
    }
  };

  ed.enter = () => {
    ed.active = true;
    document.body.classList.add('building');
    if (!bar.childElementCount) buildBar(); else syncBar();
    // slide the scene up so the toolbar covers sky instead of the field
    const sky = getWorld().L.buildTop * getScale();
    canvas.style.transform = `translateY(${-Math.min(bar.offsetHeight, Math.max(0, sky - 40))}px)`;
  };
  ed.exit = () => {
    ed.active = false;
    select(null);
    hover = null;
    document.body.classList.remove('building');
    canvas.style.transform = '';
  };
  // Called when the field is rebuilt (resize or another box): the toolbar is redrawn for the new area.
  ed.reset = () => { select(null); gesture = null; if (!ed.active) bar.innerHTML = ''; };
  return ed;
}
