// Bringing your Pokémon in from a save file: the welcome card new visitors see, dropping a save
// anywhere on the page, and the picker that shows the party and every PC box so you can choose who
// moves in (the first 100 are picked for you). The file is read right here; it never leaves the device.
import { parseSave } from './saves.js';
import { iconFor } from './pc.js';
import { NAMES } from './data.js';

export const IMPORT_MAX = 100;
const MAX_FILE = 4 * 1024 * 1024; // the biggest real saves (DS, with emulator footers) are ~0.5 MB

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usable = (m) => m.egg || m.species > 0;

/**
 * room(mode): how many Pokémon fit if we 'replace' everyone or 'add' to who's there.
 * hasResidents(): true if there are Pokémon worth keeping (not just the demo ones).
 * onImport(mons, mode): moves them in; returns how many found a spot.
 */
export function createIngest({ room, hasResidents, onImport, visiting = false }) {
  // ----- the picker -----
  const el = document.createElement('div');
  el.id = 'ingest';
  document.body.appendChild(el);

  const toast = document.createElement('div');
  toast.id = 'toast';
  document.body.appendChild(toast);
  let toastTimer = 0;
  function say(text, ms = 4200) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
  }

  let file = null, results = [], ri = 0, groups = [], picked = new Set(), mode = 'add';
  const key = (g, i) => g + ':' + i;
  const all = () => groups.flatMap((g, gi) => g.mons.map((m, i) => ({ m, k: key(gi, i) }))).filter((x) => usable(x.m));
  const cap = () => Math.max(0, Math.min(IMPORT_MAX, room(mode)));

  function pickFirst() {
    picked = new Set(all().slice(0, cap()).map((x) => x.k));
  }

  function useResult(i) {
    ri = i;
    const r = results[i];
    groups = [{ name: 'Party', mons: r.mons, party: true }, ...r.boxes];
    pickFirst();
    render();
  }

  async function openFile(f) {
    if (!f) return;
    if (visiting) { say("You're visiting someone's house. Go home first to bring in your own Pokémon."); return; }
    file = f;
    if (f.size > MAX_FILE) return showError(`<b>${esc(f.name)}</b> is too big to be a game save.`);
    el.innerHTML = '<div class="pcframe"><div class="pctop"><b>Reading your save…</b></div></div>';
    el.classList.add('show');
    try { results = parseSave(await f.arrayBuffer()); } catch (err) { console.error(err); results = []; }
    if (!results.length) {
      return showError(`Couldn't find any Pokémon in <b>${esc(f.name)}</b>.<br>Pixel Daycare reads battery saves from the Gen 1–5 games (Red/Blue through Black 2/White 2): <code>.sav</code>, <code>.srm</code> or <code>.dsv</code>. Save states (<code>.ss1</code>, <code>.state</code>…) don't work, and some ROM hacks change the save format. You can still add Pokémon by hand in Settings.`);
    }
    mode = hasResidents() ? 'add' : 'replace';
    useResult(0);
  }

  function showError(html) {
    el.innerHTML = `
      <div class="pcframe"><div class="ingerror sheet">
        <h2>Hmm, that didn't work</h2><p>${html}</p>
        <p class="row"><label class="filebtn">Choose another file…<input type="file" class="again"></label><button class="close">Close</button></p>
      </div></div>`;
    el.classList.add('show');
    el.querySelector('.again').onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ''; openFile(f); };
    el.querySelector('.close').onclick = close;
  }

  function close() { el.classList.remove('show'); el.innerHTML = ''; observer.disconnect(); }

  // icons load as their slot scrolls into view, so a full PC doesn't fetch 400 sprites at once
  const observer = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const img = en.target;
      observer.unobserve(img);
      iconFor(JSON.parse(img.dataset.mon)).then((src) => { if (src) img.src = src; else img.replaceWith(Object.assign(document.createElement('span'), { textContent: '?' })); });
    }
  }, { root: el, rootMargin: '200px' });

  function render() {
    observer.disconnect();
    const r = results[ri];
    const total = all().length;
    const unknown = groups.reduce((n, g) => n + g.mons.filter((m) => !usable(m)).length, 0);
    const fitAdd = Math.max(0, Math.min(IMPORT_MAX, room('add')));
    el.innerHTML = `
      <div class="pcframe">
        <div class="pctop">
          <div><b>Bring in your Pokémon</b><small>${esc(file.name)} · ${esc(r.label)} · ${total} Pokémon in the party and ${r.boxes.length} box${r.boxes.length === 1 ? '' : 'es'}</small></div>
          <button class="mini close" aria-label="Close">✕</button>
        </div>
        ${results.length > 1 ? `<p class="ingpick">This save has more than one snapshot. Pick the one that matches your game: <select class="snap">${results.map((x, i) => `<option value="${i}"${i === ri ? ' selected' : ''}>${esc(x.label)}: ${x.mons.map((m) => esc(m.nickname)).slice(0, 3).join(', ')}…</option>`).join('')}</select></p>` : ''}
        <div class="ingbar">
          <div class="ingcount"><b class="n"></b><small>Tap Pokémon to pick or skip them.</small></div>
          <div class="ingtools">
            <button class="mini first">Pick the first ${Math.min(cap(), total)}</button>
            <button class="mini none">Clear</button>
          </div>
          <div class="ingmode">
            <label><input type="radio" name="ingmode" value="replace"${mode === 'replace' ? ' checked' : ''}> Replace who's here now</label>
            <label class="${fitAdd ? '' : 'disabled'}"><input type="radio" name="ingmode" value="add"${mode === 'add' ? ' checked' : ''}${fitAdd ? '' : ' disabled'}> Add to who's here <small>(room for ${fitAdd})</small></label>
          </div>
          <button class="primary go">Move them in</button>
        </div>
        ${unknown ? `<p class="ingnote">${unknown} Pokémon have a species this app doesn't know (usually from a ROM hack) and are left out.</p>` : ''}
        <div class="pcgrid inggrid">${groups.map((g, gi) => `
          <div class="boxcard${g.party ? ' party' : ''}" data-g="${gi}">
            <div class="boxhead"><span class="bname">${esc(g.name)}</span><small class="bcount"></small><button class="mini toggle">All</button></div>
            <div class="slots">${g.mons.map((m, i) => usable(m) ? `
              <button class="slot full pick" data-k="${key(gi, i)}" title="${esc(m.nickname)}${m.egg ? '' : ` (${esc(NAMES[m.species] || '?')})`}${m.level ? ` · Lv ${m.level}` : ''}${m.shiny ? ' · shiny' : ''}">
                <img alt="" data-mon='${esc(JSON.stringify({ species: m.species, shiny: !!m.shiny, egg: !!m.egg }))}'>
                ${m.level ? `<i>${m.level}</i>` : ''}${m.shiny ? '<em>★</em>' : ''}
              </button>` : '<span class="slot unknown" title="Unknown species">?</span>').join('')}
            </div>
          </div>`).join('')}
        </div>
      </div>`;
    el.querySelectorAll('img[data-mon]').forEach((img) => observer.observe(img));
    el.querySelector('.close').onclick = close;
    el.querySelector('.snap')?.addEventListener('change', (ev) => useResult(+ev.target.value));
    el.querySelector('.first').onclick = () => { pickFirst(); sync(); };
    el.querySelector('.none').onclick = () => { picked.clear(); sync(); };
    el.querySelectorAll('input[name=ingmode]').forEach((inp) => {
      inp.onchange = () => {
        mode = inp.value;
        // keep what was picked, trimmed to what fits now
        const order = all().map((x) => x.k).filter((k) => picked.has(k));
        picked = new Set(order.slice(0, cap()));
        el.querySelector('.first').textContent = `Pick the first ${Math.min(cap(), total)}`;
        sync();
      };
    });
    el.querySelectorAll('.slot.pick').forEach((s) => {
      s.onclick = () => {
        const k = s.dataset.k;
        if (picked.has(k)) picked.delete(k);
        else if (picked.size >= cap()) { limit(); return; }
        else picked.add(k);
        sync();
      };
    });
    el.querySelectorAll('.boxcard').forEach((card) => {
      card.querySelector('.toggle').onclick = () => {
        const keys = [...card.querySelectorAll('.slot.pick')].map((s) => s.dataset.k);
        if (keys.every((k) => picked.has(k))) keys.forEach((k) => picked.delete(k));
        else {
          for (const k of keys) { if (picked.size >= cap()) { limit(); break; } picked.add(k); }
        }
        sync();
      };
    });
    el.querySelector('.go').onclick = go;
    sync();
  }

  function limit() {
    const n = el.querySelector('.ingcount');
    n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash');
    say(cap() < IMPORT_MAX ? `There's room for ${cap()} more. Skip someone first, or choose "Replace who's here now".` : `${IMPORT_MAX} is the most that can move in at once. Skip someone first.`);
  }

  function sync() {
    el.querySelector('.ingcount .n').textContent = `${picked.size} of ${Math.min(cap(), all().length)} picked`;
    el.querySelectorAll('.slot.pick').forEach((s) => s.classList.toggle('on', picked.has(s.dataset.k)));
    el.querySelectorAll('.boxcard').forEach((card) => {
      const keys = [...card.querySelectorAll('.slot.pick')].map((s) => s.dataset.k);
      const n = keys.filter((k) => picked.has(k)).length;
      card.querySelector('.bcount').textContent = `${n}/${keys.length}`;
      card.querySelector('.toggle').textContent = keys.length && n === keys.length ? 'None' : 'All';
      card.classList.toggle('dim', n === 0);
    });
    const go = el.querySelector('.go');
    go.disabled = picked.size === 0;
    go.textContent = picked.size ? `Move ${picked.size} in` : 'Pick someone first';
  }

  function go() {
    const chosen = all().filter((x) => picked.has(x.k)).map((x) => x.m);
    if (!chosen.length) return;
    if (mode === 'replace' && hasResidents() && !confirm(`Replace everyone living in your daycare now with these ${chosen.length}?`)) return;
    const placed = onImport(chosen, mode);
    close();
    say(`${placed} Pokémon moved in! They'll head out to the areas they like.`, 6000);
    hideWelcome(true);
  }

  // ----- the welcome card (first visit) -----
  const welcome = document.createElement('div');
  welcome.id = 'welcome';
  welcome.innerHTML = `
    <div class="sheet">
      <h2>Welcome to Pixel Daycare</h2>
      <p>Bring in your Pokémon from a Gen 1–5 save file and watch them live here on their own: roaming between areas, napping, eating and battling in the arena.</p>
      <p><label class="filebtn big">Choose your save file…<input type="file"></label></p>
      <p class="hint">Or drop it anywhere on this page. Works with battery saves (<code>.sav</code>, <code>.srm</code>, <code>.dsv</code>) from Red/Blue through Black 2/White 2. Your save is read on this device and never uploaded.</p>
      <p><button class="later">Look around with the demo Pokémon first</button></p>
    </div>`;
  document.body.appendChild(welcome);
  let onWelcomeDone = () => {};
  welcome.querySelector('input').onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ''; openFile(f); };
  welcome.querySelector('.later').onclick = () => hideWelcome(true);
  function showWelcome(done) { onWelcomeDone = done || (() => {}); welcome.classList.add('show'); }
  function hideWelcome(dismissed) {
    if (!welcome.classList.contains('show')) return;
    welcome.classList.remove('show');
    if (dismissed) onWelcomeDone();
  }

  // ----- drop a save anywhere -----
  const drop = document.createElement('div');
  drop.id = 'dropzone';
  drop.innerHTML = '<div>Drop your save file to bring your Pokémon in</div>';
  document.body.appendChild(drop);
  const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');
  let depth = 0;
  window.addEventListener('dragenter', (ev) => { if (!hasFiles(ev)) return; ev.preventDefault(); depth++; drop.classList.add('show'); });
  window.addEventListener('dragleave', (ev) => { if (!hasFiles(ev)) return; if (--depth <= 0) { depth = 0; drop.classList.remove('show'); } });
  window.addEventListener('dragover', (ev) => { if (hasFiles(ev)) ev.preventDefault(); });
  window.addEventListener('drop', (ev) => {
    if (!hasFiles(ev)) return;
    ev.preventDefault();
    depth = 0;
    drop.classList.remove('show');
    const f = ev.dataTransfer.files[0];
    if (f) openFile(f);
  });

  return { openFile, showWelcome, hideWelcome, say, close, get isOpen() { return el.classList.contains('show'); } };
}
