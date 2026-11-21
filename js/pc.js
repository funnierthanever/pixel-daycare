// The PC: every box at a glance, like a Pokémon storage PC. Each box is its own area with its own
// residents. Drag a Pokémon's icon onto another box to move it there; tap a box's picture to visit.
import { NAMES } from './data.js';
import { loadSprite } from './sprites.js';
import { BIOMES, createWorld, drawSky } from './world.js';

const MAX_BOXES = 12;

export function createPC({ getState, persist, perBox, capOf = () => perBox, readOnly = false, moveEntry, getSize, loadLayout, dropLayout, onVisit, onChanged }) {
  const el = document.createElement('div');
  el.id = 'pc';
  document.body.appendChild(el);
  const thumbs = new Map(); // box id -> { key, canvas }

  const boxes = () => getState().boxes;
  const residents = (id) => getState().roster.filter((e) => e.box === id && !e.transit);
  const coming = (id) => getState().roster.filter((e) => e.transit?.to === id).length;
  const PICKABLE = Object.entries(BIOMES).filter(([k]) => k !== 'hub');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wall = (b) => { const [a, c] = BIOMES[b.biome]?.wall || BIOMES.meadow.wall; return `linear-gradient(135deg, ${a}, ${c})`; };

  // ----- pictures -----
  function thumb(box) {
    const layout = loadLayout(box.id);
    const key = box.biome + ':' + (layout ? JSON.stringify(layout).length + ':' + layout.objects.length : 'default');
    const hit = thumbs.get(box.id);
    if (hit && hit.key === key) return hit.canvas;
    const [W, H] = getSize();
    const w = createWorld(W, H, layout, box.biome, { areas: boxes().filter((b) => b.biome !== 'hub').map((b) => b.id) });
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const env = { t: 0.5, night: 0, R: w.random };
    drawSky(g, w, 12, 0);
    w.drawGround(g, env);
    w.entities(g, env).sort((a, b) => a.y - b.y).forEach((e) => e.draw());
    thumbs.set(box.id, { key, canvas: cv });
    return cv;
  }

  // ----- rendering -----
  function render() {
    const state = getState();
    el.innerHTML = `<div class="pcframe">
      <div class="pctop"><div><b>Daycare PC</b><small>Where everyone is right now. Pokémon wander between areas on their own; drag one onto another area to send it there. Tap a picture to go there.</small></div><button class="pcdone">Done</button></div>
      <div class="pcgrid"></div></div>`;
    el.querySelector('.pcdone').onclick = close;
    if (readOnly) { el.querySelector('.pctop small').textContent = 'Where everyone in this house is right now. Tap a picture to go there.'; el.classList.add('readonly'); }
    const grid = el.querySelector('.pcgrid');
    boxes().forEach((b, n) => {
      const list = residents(b.id), cap = capOf(b.id), hub = b.biome === 'hub', incoming = coming(b.id);
      const card = document.createElement('div');
      card.className = 'boxcard' + (b.id === state.box ? ' current' : '') + (hub ? ' hubcard' : '');
      card.dataset.id = b.id;
      card.innerHTML = `
        <div class="boxhead" style="background:${wall(b)}">
          <span class="boxno">${hub ? 'HUB' : 'AREA ' + n}</span><b class="bname">${esc(b.name)}</b>
          <button class="mini rename" title="Rename">✎</button>${!hub ? '<button class="mini del" title="Delete area">✕</button>' : ''}
        </div>
        <div class="thumbwrap" title="Go to this box"></div>
        <div class="slots"></div>
        <div class="boxfoot">${hub ? '<span>The big house</span>' : `<select class="biome">${PICKABLE.map(([k, v]) => `<option value="${k}"${k === b.biome ? ' selected' : ''}>${v.label}</option>`).join('')}</select>`}
          <span>${list.length}/${cap}${incoming ? ` · ${incoming} on the way` : ''}${b.id === state.box ? ' · you’re here' : ''}</span></div>`;
      card.querySelector('.thumbwrap').appendChild(thumb(b));
      card.querySelector('.thumbwrap').onclick = () => { close(); onVisit(b.id); };
      const slots = card.querySelector('.slots');
      for (let i = 0; i < cap; i++) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        const e = list[i];
        if (e) {
          const img = document.createElement('img');
          img.className = 'icon';
          img.alt = e.egg ? 'Egg' : (e.nickname || NAMES[e.species] || '?');
          img.title = img.alt;
          img.draggable = false;
          iconFor(e).then((src) => { if (src) img.src = src; else slot.textContent = '?'; });
          slot.appendChild(img);
          slot.classList.add('full');
          if (!readOnly) slot.addEventListener('pointerdown', (ev) => startDrag(ev, e, img));
        }
        slots.appendChild(slot);
      }
      card.querySelector('.rename').onclick = () => {
        const name = prompt('Name this box', b.name);
        if (name && name.trim()) { b.name = name.trim().slice(0, 24); persist(); render(); onChanged({ renamed: b.id }); }
      };
      card.querySelector('.del')?.addEventListener('click', () => {
        const others = boxes().filter((o) => o !== b);
        const home = others.find((o) => o.biome === 'hub') || others[0];
        const n = list.length;
        if (!confirm(`Delete ${b.name}?${n ? ` Its ${n} Pokémon go back to the ${home.name}.` : ''} Its build is removed.`)) return;
        for (const e of getState().roster) if (e.box === b.id || e.transit?.to === b.id) { e.transit = null; e.box = home.id; }
        state.boxes = others;
        dropLayout(b.id);
        if (state.box === b.id) state.box = others[0].id;
        persist(); render(); onChanged({ deleted: b.id });
      });
      card.querySelector('.biome')?.addEventListener('change', (ev) => {
        const biome = ev.target.value;
        if (!confirm(`Turn ${b.name} into ${BIOMES[biome].label}? It starts over with a fresh ${BIOMES[biome].label.toLowerCase()} layout that you can rebuild.`)) { ev.target.value = b.biome; return; }
        if (b.name === BIOMES[b.biome].label) b.name = BIOMES[biome].label;
        b.biome = biome;
        dropLayout(b.id);
        persist(); render(); onChanged({ biome: b.id });
      });
      grid.appendChild(card);
    });
    if (boxes().length < MAX_BOXES && !readOnly) {
      const add = document.createElement('div');
      add.className = 'boxcard newbox';
      add.innerHTML = `<b>New area</b><small>Pick a kind:</small><div class="biomes">${PICKABLE.map(([k, v]) => `<button data-b="${k}" style="background:${wall({ biome: k })}">${v.label}</button>`).join('')}</div>`;
      add.querySelectorAll('button').forEach((btn) => {
        btn.onclick = () => {
          const biome = btn.dataset.b;
          state.boxes.push({ id: 'b' + Date.now().toString(36), name: BIOMES[biome].label, biome });
          persist(); render(); onChanged({ added: true });
        };
      });
      grid.appendChild(add);
    }
  }

  // ----- drag between boxes -----
  let drag = null;
  function startDrag(ev, entry, img) {
    ev.preventDefault();
    drag = { entry, x0: ev.clientX, y0: ev.clientY, ghost: null, id: ev.pointerId, img };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
  }
  function cardAt(x, y, ghost) {
    if (ghost) ghost.style.display = 'none';
    const c = document.elementFromPoint(x, y)?.closest('.boxcard:not(.newbox)');
    if (ghost) ghost.style.display = '';
    return c;
  }
  function onMove(ev) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 6) return;
      drag.ghost = drag.img.cloneNode();
      drag.ghost.className = 'ghost';
      document.body.appendChild(drag.ghost);
      drag.img.style.opacity = '0.3';
    }
    drag.ghost.style.left = ev.clientX + 'px';
    drag.ghost.style.top = ev.clientY + 'px';
    el.querySelectorAll('.boxcard.target').forEach((c) => c.classList.remove('target'));
    cardAt(ev.clientX, ev.clientY, drag.ghost)?.classList.add('target');
  }
  function onUp(ev) {
    window.removeEventListener('pointermove', onMove);
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.ghost) {
      const card = cardAt(ev.clientX, ev.clientY, d.ghost);
      d.ghost.remove();
      d.img.style.opacity = '';
      const to = card?.dataset.id, from = d.entry.box;
      if (to && to !== from) {
        if (residents(to).length >= capOf(to)) { card.classList.add('full-warn'); setTimeout(() => render(), 600); return; }
        if (moveEntry) moveEntry(d.entry, to); else { d.entry.box = to; persist(); }
        onChanged({ moved: [from, to] });
      }
      render();
    }
  }

  function open() { render(); el.classList.add('show'); }
  function close() { el.classList.remove('show'); }
  return { open, close, get isOpen() { return el.classList.contains('show'); } };
}

const EGG = (() => {
  const cv = document.createElement('canvas');
  cv.width = 12; cv.height = 14;
  const g = cv.getContext('2d');
  g.fillStyle = '#d8d0c0'; g.beginPath(); g.ellipse(6, 8, 5, 6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f8f4ea'; g.beginPath(); g.ellipse(6, 7, 4, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#7cc86a'; g.fillRect(4, 5, 2, 2); g.fillRect(7, 9, 2, 1);
  return cv.toDataURL();
})();

const icons = new Map(); // species+shiny -> Promise<dataURL|null>
/** A small cropped picture of a Pokémon (or an egg), as a data URL. Shared by the PC and the save picker. */
export function iconFor(e) {
  if (e.egg) return Promise.resolve(EGG);
  const k = e.species + (e.shiny ? 's' : '');
  if (!icons.has(k)) {
    icons.set(k, loadSprite(e.species, e.shiny).then((s) => {
      if (!s) return null;
      const a = s.Idle;
      const cv = document.createElement('canvas');
      cv.width = a.fw; cv.height = a.fh;
      const g = cv.getContext('2d');
      g.drawImage(a.img, 0, 0, a.fw, a.fh, 0, 0, a.fw, a.fh);
      try {
        const d = g.getImageData(0, 0, a.fw, a.fh).data;
        let x0 = a.fw, y0 = a.fh, x1 = -1, y1 = -1;
        for (let y = 0; y < a.fh; y++) for (let x = 0; x < a.fw; x++) if (d[(y * a.fw + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        if (x1 < 0) return cv.toDataURL();
        const side = Math.max(x1 - x0, y1 - y0) + 3;
        const out = document.createElement('canvas');
        out.width = out.height = side;
        out.getContext('2d').drawImage(cv, -x0 + Math.floor((side - (x1 - x0)) / 2), -y0 + Math.floor((side - (y1 - y0)) / 2));
        return out.toDataURL();
      } catch { return cv.toDataURL(); }
    }).catch(() => null));
  }
  return icons.get(k);
}
