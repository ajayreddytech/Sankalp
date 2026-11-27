// SANKALP UI: routing, rendering and interactions.
import * as db from './db.js';
import * as L from './logic.js';
import { ICON_GROUPS, COLOURS, DEFAULT_COLOUR } from './choices.js';
import { renderMarkdown } from './markdown.js';

// What each kind of journey means, shown under its column so the three are easy to tell apart.
const TYPE_PLURAL = { habit: 'Habits', sankalpa: 'Sankalpas', smart: 'SMART Goals' };
const TYPE_ICON = { habit: 'toggle-right', sankalpa: 'signature', smart: 'locate-fixed' };
const TYPE_SUB = {
  habit: '66 days in a row. No exceptions.',
  sankalpa: 'A vow for the number of days you choose. No exceptions.',
  smart: 'A plan of measurable actions, logged each day toward a deadline.',
};
// A journey colour must be a six-digit hex value. Anything else falls back to the default, so nothing odd reaches the page.
const colour = (c) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? c : '#14B8A6');

const state = {
  authReady: false,
  user: null,
  goals: [],
  goalsReady: false,
  accTab: 'accomplished',
  checkView: null,   // Check In: 'today' | 'overdue' | 'tomorrow' when one group is open, null for the default list
  lastRouteKey: null,
  reorder: false,
  dragging: false,
  renderPending: false,
  drafts: {},        // unsaved SMART numbers, keyed "goalId|planIndex|date", kept across re-renders
  loginError: '',
  openType: null,    // which type column (habit, sankalpa, smart) is open on Check In or Your Journeys
  rewards: [],       // the user's rewards, with the journeys attached to each
  railType: null,   // the bar's type panel that is open: 'habit' | 'sankalpa' | 'smart', or null
};
let unsubscribeRewards = null;
let unsubscribeGoals = null;

const $ = (sel) => document.querySelector(sel);
const view = () => $('#view');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const icon = (name, cls = '') => `<i data-lucide="${esc(name)}" class="${cls}" aria-hidden="true"></i>`;
// Fields that must be filled carry this star. Create-journey fields are optional and have none.
const REQ = '<b class="req" title="Required" aria-label="required">*</b>';
const refreshIcons = () => window.lucide?.createIcons();
// Free text, WhatsApp style: *bold*, _italic_, ~strike~ (and older **bold**). Line breaks show as line breaks.
// Escaped first, so typed text never becomes markup. A marker must touch the words, as in WhatsApp.
const rich = (s) => esc(s)
  .replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
  .replace(/(^|[^\w*])\*([^*\n]+?)\*(?=[^\w*]|$)/g, '$1<b>$2</b>')
  .replace(/(^|[^\w_])_([^_\n]+?)_(?=[^\w_]|$)/g, '$1<i>$2</i>')
  .replace(/(^|[^\w~])~([^~\n]+?)~(?=[^\w~]|$)/g, '$1<s>$2</s>');

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(`${s}T12:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// The start box on a journey page: "Started 3 Jan 2026", or "Starting tomorrow · 21 Nov 2026".
function startKpiHTML(g, today) {
  const s = L.startInfo(g.attemptStart, today);
  return `<div class="kpi"><span>${s.word}</span><strong class="sm">${s.text ? `${esc(s.text)} · ` : ''}${fmtDate(g.attemptStart)}</strong></div>`;
}

// Whole numbers stay whole; decimals show one place (1.5, 0.3).
const fmtNum = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return String(v);
};

const typeName = (g) => L.TYPE_LABEL[g.type] || 'Habit';
const keepPhrase = (g) => ({ habit: 'keep this habit', sankalpa: 'keep this sankalpa', smart: 'stick to this goal' })[g.type] || 'keep this habit';
// The standard order: habits first, then SMART goals, then sankalpas. Within a type, the saved order.
const typeOrdered = (goals) => {
  const list = L.sortByOrder(goals);
  return L.TYPES.flatMap((t) => list.filter((g) => g.type === t))
    .concat(list.filter((g) => !L.TYPES.includes(g.type)));
};
const sortedActive = () => typeOrdered(state.goals.filter((g) => g.status === 'active'));
// A percentage with at most one decimal: 42, 42.5, 0.8.
const fmtPct = (n) => `${Math.round(n * 10) / 10}%`;

function route() {
  const [name = 'home', id = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'home', id: decodeURIComponent(id) };
}

// ---------- toast & modal helpers ----------

function toast(msg, kind = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  $('#toast-root').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// Free-text boxes grow to show all their text, so nothing hides behind a scroll.
const fit = (ta) => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
const fitAll = (root) => root.querySelectorAll('textarea[data-rich]').forEach(fit);

// Every field's value in a dialog's form, as one string. Used to tell whether anything was typed.
const formSnapshot = (root) => [...new FormData(root.querySelector('form')).entries()]
  .map(([k, v]) => `${k}=${v}`).join('\n');

function openModal({ title, body, footer = '', wide = false, onMount, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <section class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="sheet-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
      </header>
      <div class="sheet-body">${body}</div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
    </section>`;
  $('#modal-root').appendChild(wrap);
  refreshIcons();

  let closed = false;
  let baseline = null;     // the form as it was opened; set once the dialog is built
  let asking = false;      // a "discard?" question is open
  const onKey = (e) => { if (e.key === 'Escape') requestClose(); };
  const onResize = () => fitAll(wrap);
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    wrap.classList.add('leaving');
    setTimeout(() => wrap.remove(), 200);
    onClose?.();
  }
  // Closing a form with typed changes asks first, so nothing is lost by a stray tap or Escape.
  async function requestClose() {
    if (closed || asking) return;
    const dirty = baseline !== null && formSnapshot(wrap) !== baseline;
    if (dirty) {
      asking = true;
      const discard = await confirmDialog({
        title: 'Discard your changes?',
        message: 'What you typed here has not been saved.',
        confirmLabel: 'Discard',
        danger: true,
      });
      asking = false;
      if (!discard) return;
    }
    close();
  }
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  // Every free-text box in this dialog grows as you type. Text between ** ** shows bold in the preview under it.
  wrap.addEventListener('input', (e) => {
    const ta = e.target;
    if (!ta.matches('textarea[data-rich]')) return;
    fit(ta);
    const pv = ta.nextElementSibling;
    if (pv?.classList.contains('rich-preview')) {
      pv.innerHTML = rich(ta.value);
      pv.hidden = !hasBold(ta.value);
    } else if (pv?.classList.contains('rich-wrap')) {
      pv.querySelector('.preview-body').innerHTML = rich(ta.value);
      pv.hidden = !hasBold(ta.value);
    }
    const mf = ta.closest('[data-md-field]');
    if (mf) syncMarkdown(mf);
  });
  wrap.addEventListener('change', (e) => {
    if (e.target.matches?.('[data-md-toggle]')) syncMarkdown(e.target.closest('[data-md-field]'));
  });
  fitAll(wrap);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) requestClose();
    const btn = e.target.closest('[data-preview-toggle]');
    if (btn) {
      const box = btn.closest('.preview-wrap');
      box.classList.toggle('open');
      btn.textContent = box.classList.contains('open') ? 'Show less' : 'Show full preview';
    }
  });
  onMount?.(wrap, close);
  if (wrap.querySelector('form')) baseline = formSnapshot(wrap);
  return { wrap, close };
}

function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      body: `<p class="muted">${message}</p>`,
      footer: `<button class="btn ghost" data-close>Cancel</button>
               <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirmLabel)}</button>`,
      onMount: (w, close) => {
        w.querySelector('[data-ok]').addEventListener('click', () => {
          answered = true;
          resolve(true);
          close();
        });
      },
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

function celebrate(title) {
  const el = document.createElement('div');
  el.className = 'celebrate';
  const colors = ['#34d399', '#8b5cf6', '#22d3ee', '#fbbf24', '#fb7185'];
  let confetti = '';
  for (let i = 0; i < 70; i++) {
    confetti += `<span style="left:${Math.random() * 100}%;animation-delay:${Math.random() * 0.8}s;
      background:${colors[i % colors.length]};transform:rotate(${Math.random() * 360}deg)"></span>`;
  }
  el.innerHTML = `
    <div class="confetti">${confetti}</div>
    <div class="celebrate-card">
      <div class="trophy-orb">${icon('trophy')}</div>
      <p class="eyebrow">Accomplished</p>
      <h2>${esc(title)}</h2>
      <p class="muted">Every day of it is in your record now.</p>
      <button class="btn primary" data-go>View accomplishments</button>
    </div>`;
  document.body.appendChild(el);
  refreshIcons();
  const dismiss = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
  };
  el.querySelector('[data-go]').addEventListener('click', () => {
    dismiss();
    location.hash = '#/accomplishments';
  });
  setTimeout(dismiss, 6000);
}

// ---------- dropdowns: icon and colour pickers ----------
// A dropdown opens on press. It closes when an option is picked, on Escape, when focus moves
// to another field, or when the user taps anywhere else.

function dropdown({ kind, name, value, valueHTML, optionsHTML, search = false }) {
  return `
    <div class="dd ${kind}" data-dd>
      <input type="hidden" name="${name}" value="${esc(value)}">
      <button type="button" class="dd-trigger" data-dd-toggle aria-haspopup="listbox" aria-expanded="false">
        <span class="dd-value">${valueHTML}</span>
        <span class="dd-caret">${icon('chevron-down')}</span>
      </button>
      <div class="dd-panel" hidden>
        ${search ? '<input class="dd-search" type="search" placeholder="Search icons, e.g. pray, money, run, read" aria-label="Search icons" autocomplete="off">' : ''}
        <div class="dd-options" role="listbox">${optionsHTML}</div>
        ${search ? '<p class="muted dd-empty" hidden>No icon matches that search.</p>' : ''}
      </div>
    </div>`;
}

// Icons: empty value means "Auto, from your title" when auto is true.
// The catalogue is shown in groups. An icon is listed once, in the first group it appears in.
const AUTO_LABEL = 'Auto, from your title';

function iconOptionHTML(name, tags, selected) {
  return `
    <button type="button" class="dd-opt${name === selected ? ' on' : ''}" data-dd-option data-value="${esc(name)}"
      data-name="${esc(name)}" data-tags="${esc(tags)}" title="${esc(name)}">
      <span class="dd-face">${icon(name)}<span class="dd-name">${esc(name)}</span></span>
    </button>`;
}

function iconGroupsHTML(selected) {
  const seen = new Set();
  const groups = ICON_GROUPS.map((group) => {
    const fresh = group.icons.filter(([name]) => !seen.has(name));
    fresh.forEach(([name]) => seen.add(name));
    if (!fresh.length) return '';
    return `<p class="dd-group">${esc(group.name)}</p>
      <div class="dd-group-grid">${fresh.map(([name, tags]) => iconOptionHTML(name, tags, selected)).join('')}</div>`;
  });
  // An icon from an older version that is not in the catalogue still shows, so it can be kept.
  if (selected && !seen.has(selected)) {
    groups.unshift(`<p class="dd-group">Current</p><div class="dd-group-grid">${iconOptionHTML(selected, '', selected)}</div>`);
  }
  return groups.join('');
}

function iconDropdown(selected = '', { auto = false } = {}) {
  const autoOn = auto && !selected;
  const autoOpt = auto ? `
    <button type="button" class="dd-opt wide${autoOn ? ' on' : ''}" data-dd-option data-value="" data-name="auto" data-tags="auto suggested">
      <span class="dd-face">${icon('wand-sparkles')}<span class="dd-name">${AUTO_LABEL}</span></span>
    </button>` : '';
  const face = selected
    ? `<span class="dd-face">${icon(selected)}<span class="dd-name">${esc(selected)}</span></span>`
    : `<span class="dd-face">${icon('wand-sparkles')}<span class="dd-name">${AUTO_LABEL}</span></span>`;
  return dropdown({
    kind: 'icons', name: 'icon', value: autoOn ? '' : selected, valueHTML: face,
    optionsHTML: autoOpt + iconGroupsHTML(selected), search: true,
  });
}

// Shows which icon Auto will pick, from the title typed so far.
function syncAutoIcon(w) {
  const dd = w.querySelector('[data-dd].icons');
  if (!dd || dd.querySelector('input[type="hidden"]').value !== '') return;
  const title = w.querySelector('[name="title"]')?.value || '';
  const type = w.querySelector('input[name="type"]:checked')?.value || 'habit';
  const name = L.suggestIcon(title, type);
  dd.querySelector('.dd-value').innerHTML = `<span class="dd-face">${icon(name)}<span class="dd-name">${AUTO_LABEL}: ${esc(name)}</span></span>`;
  refreshIcons();
}

// Colours: thirty distinct swatches. Each one shows its name.
function colorDropdown(selected = DEFAULT_COLOUR) {
  const sel = String(selected).toUpperCase();
  const known = COLOURS.some((p) => p.hex.toUpperCase() === sel);
  const list = known ? COLOURS : [{ name: 'Current colour', hex: selected }, ...COLOURS];
  const current = list.find((p) => p.hex.toUpperCase() === sel) || list[0];
  const face = (p) => `<span class="dd-face"><i class="dd-dot" style="--c:${colour(p.hex)}"></i><span class="dd-name">${esc(p.name)}</span></span>`;
  const opts = list.map((p) => `
    <button type="button" class="dd-opt colour${p.hex.toUpperCase() === sel ? ' on' : ''}" data-dd-option data-value="${esc(p.hex)}" title="${esc(p.name)}">${face(p)}</button>`).join('');
  return dropdown({ kind: 'colors', name: 'color', value: current.hex, valueHTML: face(current), optionsHTML: opts });
}

function wireDropdowns(root) {
  const setOpen = (dd, open) => {
    dd.classList.toggle('open', open);
    dd.querySelector('[data-dd-toggle]').setAttribute('aria-expanded', String(open));
    dd.querySelector('.dd-panel').hidden = !open;
  };
  const closeAll = (except = null) => {
    root.querySelectorAll('[data-dd].open').forEach((d) => { if (d !== except) setOpen(d, false); });
  };

  root.addEventListener('click', (e) => {
    const dd = e.target.closest('[data-dd]');
    if (dd && e.target.closest('[data-dd-toggle]')) {
      const open = !dd.classList.contains('open');
      closeAll(dd);
      setOpen(dd, open);
      return;
    }
    const opt = e.target.closest('[data-dd-option]');
    if (opt && dd) {
      dd.querySelector('input[type="hidden"]').value = opt.dataset.value;
      dd.querySelector('.dd-value').innerHTML = opt.querySelector('.dd-face').outerHTML;
      dd.querySelectorAll('[data-dd-option]').forEach((o) => o.classList.toggle('on', o === opt));
      setOpen(dd, false);
      dd.querySelector('[data-dd-toggle]').focus({ preventScroll: true });
      return;
    }
    if (!dd) closeAll();
  });

  // Moving to another field closes the dropdown.
  root.addEventListener('focusin', (e) => closeAll(e.target.closest('[data-dd]')));

  // Every word typed must appear in the icon's name or its search words. Empty groups hide with their icons.
  root.addEventListener('input', (e) => {
    if (!e.target.matches('.dd-search')) return;
    const terms = e.target.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const panel = e.target.closest('.dd-panel');
    let shown = 0;
    panel.querySelectorAll('.dd-group-grid').forEach((grid) => {
      let any = false;
      grid.querySelectorAll('[data-dd-option]').forEach((o) => {
        const hay = `${o.dataset.name} ${o.dataset.tags || ''}`.toLowerCase();
        const ok = terms.every((t) => hay.includes(t));
        o.hidden = !ok;
        if (ok) { any = true; shown++; }
      });
      grid.hidden = !any;
      const head = grid.previousElementSibling;
      if (head?.classList.contains('dd-group')) head.hidden = !any;
    });
    panel.querySelector('.dd-empty').hidden = shown > 0;
  });

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = root.querySelector('[data-dd].open');
    if (!open) return;
    e.stopPropagation();   // Escape closes the dropdown, not the whole dialog
    setOpen(open, false);
    open.querySelector('[data-dd-toggle]').focus({ preventScroll: true });
  });
}

// ---------- drag and drop reordering (mouse and touch) ----------
// In reorder mode, press a journey and drag it. The list makes room as it moves, and the page
// scrolls when the pointer gets close to the top or bottom edge of the screen.

const drag = { pending: null, el: null, ghost: null, x: 0, y: 0, offX: 0, offY: 0, raf: 0 };
// Things that can be dragged to a new place: journey cards, and the journey icons in the rail.
const DRAG_SEL = '.drag-item, .rail-drag';

// Rail icons: with a mouse, press and move. On a phone, press and hold, so a swipe still scrolls the strip.
const RAIL_HOLD_MS = 350;
let railHold = null;               // { x, y, timer } while a touch press waits for its hold
let railSuppressClickUntil = 0;    // a drag ends with a click on the icon; that click must not open the journey

function cancelRailHold() {
  if (railHold) { clearTimeout(railHold.timer); railHold = null; }
}

function onRailDown(e) {
  if (e.button > 0) return;
  const item = e.target.closest('.rail-sheet-goals .rail-drag');
  if (!item) return;
  if (e.pointerType === 'touch') {
    const { clientX: x, clientY: y } = e;
    railHold = {
      x,
      y,
      timer: setTimeout(() => {
        railHold = null;
        drag.x = x;
        drag.y = y;
        startDrag(item, { clientX: x, clientY: y });
      }, RAIL_HOLD_MS),
    };
    return;
  }
  drag.pending = { item, x: e.clientX, y: e.clientY };
}

// Saves a new order for one type's journeys. The other types keep their places in the shared order.
async function saveTypeOrder(type, typeIds) {
  const byId = new Map(state.goals.map((g) => [g.id, g]));
  const current = sortedActive().map((g) => g.id);
  let k = 0;
  const merged = current.map((id) => (byId.get(id)?.type === type && k < typeIds.length ? typeIds[k++] : id));
  if (merged.join('|') === current.join('|')) { render(); return; }
  merged.forEach((id, pos) => { const g = byId.get(id); if (g) g.order = pos; });
  render();
  try {
    await db.saveOrder(state.user.uid, merged);
  } catch (err) {
    toast(err.message || 'Could not save the order.', 'error');
  }
}

function onDragDown(e) {
  if (!state.reorder || e.button > 0) return;
  const item = e.target.closest('[data-drag-list] .drag-item');
  if (!item) return;
  drag.pending = { item, x: e.clientX, y: e.clientY };
}

function onDragMove(e) {
  // A touch press that moves before its hold is a scroll, not a drag.
  if (railHold && Math.hypot(e.clientX - railHold.x, e.clientY - railHold.y) > 8) cancelRailHold();
  if (!drag.pending && !drag.el) return;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (!drag.el) {
    if (Math.hypot(e.clientX - drag.pending.x, e.clientY - drag.pending.y) < 6) return;
    startDrag(drag.pending.item, e);
    drag.pending = null;
  }
  moveGhost();
  placeItem();
}

function startDrag(item, e) {
  const r = item.getBoundingClientRect();
  drag.el = item;
  drag.offX = e.clientX - r.left;
  drag.offY = e.clientY - r.top;
  const ghost = item.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = `${r.width}px`;
  document.body.appendChild(ghost);
  drag.ghost = ghost;
  item.classList.add('drag-source');
  document.body.classList.add('is-dragging');
  state.dragging = true;
  drag.raf = requestAnimationFrame(autoScroll);
}

function moveGhost() {
  if (!drag.ghost) return;
  drag.ghost.style.left = `${drag.x - drag.offX}px`;
  drag.ghost.style.top = `${drag.y - drag.offY}px`;
}

// Moves the dragged journey to the slot under the pointer, by nearest card and its half.
function placeItem() {
  const el = drag.el;
  if (!el) return;
  const container = el.parentElement;
  let best = null;
  let bestD = Infinity;
  for (const n of container.querySelectorAll(DRAG_SEL)) {
    if (n === el) continue;
    const r = n.getBoundingClientRect();
    const d = (r.left + r.width / 2 - drag.x) ** 2 + (r.top + r.height / 2 - drag.y) ** 2;
    if (d < bestD) { bestD = d; best = n; }
  }
  if (!best) return;
  const r = best.getBoundingClientRect();
  const sameRow = drag.y >= r.top && drag.y <= r.bottom;
  const before = sameRow ? drag.x < r.left + r.width / 2 : drag.y < r.top + r.height / 2;
  if (before) {
    if (best.previousElementSibling !== el) container.insertBefore(el, best);
  } else if (best.nextElementSibling !== el) {
    container.insertBefore(el, best.nextElementSibling);
  }
}

// Scrolls the page while the pointer rests near the top or bottom edge.
function autoScroll() {
  if (!drag.el || drag.el.closest('#rail')) return;   // the rail scrolls itself; the page stays still
  const edge = 96;
  const top = 26;
  const vh = window.innerHeight;
  let dy = 0;
  if (drag.y < edge) dy = -Math.min(top, Math.ceil(top * (1 - Math.max(0, drag.y) / edge)));
  else if (drag.y > vh - edge) dy = Math.min(top, Math.ceil(top * (1 - Math.max(0, vh - drag.y) / edge)));
  if (dy) {
    window.scrollBy(0, dy);
    moveGhost();
    placeItem();
  }
  drag.raf = requestAnimationFrame(autoScroll);
}

// A journey moves only within its own type column. The other types keep their places in the shared order.
async function endDrag() {
  cancelRailHold();
  if (drag.pending) drag.pending = null;
  if (!drag.el) return;
  cancelAnimationFrame(drag.raf);
  const container = drag.el.parentElement;
  const movedId = drag.el.dataset.id;
  drag.el.classList.remove('drag-source');
  drag.ghost?.remove();
  drag.ghost = null;
  document.body.classList.remove('is-dragging');
  const typeIds = [...container.querySelectorAll(DRAG_SEL)].map((n) => n.dataset.id);
  drag.el = null;
  state.dragging = false;

  if (container.classList.contains('rail-sheet-goals')) railSuppressClickUntil = Date.now() + 400;
  const type = state.goals.find((g) => g.id === movedId)?.type;
  return saveTypeOrder(type, typeIds);
}

// ---------- rail (floating left sidebar, bottom bar on phones) ----------

function renderRail() {
  const r = route();
  const cls = (name) => (r.name === name ? 'rail-item active' : 'rail-item');
  // Three type buttons, icons only. Each opens a panel with that type's journeys, which can be reordered.
  const typeBtns = L.TYPES.map((t) => {
    const open = state.railType === t;
    return `<button class="rail-item rail-type${open ? ' active' : ''}" data-action="rail-type" data-type="${t}"
      data-tip="${TYPE_PLURAL[t]}" aria-label="${TYPE_PLURAL[t]}" aria-expanded="${open}" aria-controls="rail-sheet">${icon(TYPE_ICON[t])}</button>`;
  }).join('');
  let panel = '';
  if (state.railType) {
    const list = sortedActive().filter((g) => g.type === state.railType);
    // Reorder by press and hold, then drag (with a mouse, press and move).
    const rows = list.map((g) => `
    <div class="rail-sheet-row rail-drag" data-id="${esc(g.id)}" style="--c:${colour(g.color)}">
      <a class="rail-item goal-item${r.name === 'goal' && r.id === g.id ? ' active' : ''}" href="#/goal/${encodeURIComponent(g.id)}" aria-label="${esc(g.title)}">
        ${icon(g.icon)}<span>${esc(g.title)}</span>
      </a>
    </div>`).join('');
    const name = TYPE_PLURAL[state.railType];
    panel = `
    <div class="rail-sheet" id="rail-sheet">
      <p class="rail-sheet-head">${icon(TYPE_ICON[state.railType])}<span>${name}</span></p>
      ${list.length ? `<div class="rail-sheet-goals">${rows}</div>` : `<p class="rail-sheet-empty muted">No ${name.toLowerCase()} yet.</p>`}
    </div>`;
  }
  // Keep the panel's scroll position: rebuilding the rail would otherwise jump it back to the top.
  const keepY = $('#rail .rail-sheet-goals')?.scrollTop ?? 0;
  $('#rail').innerHTML = `
    <a class="${cls('home')}" href="#/home" data-tip="Check in" aria-label="Check in">${icon('calendar-check')}</a>
    <a class="${cls('journeys')}" href="#/journeys" data-tip="Your journeys" aria-label="Your journeys">${icon('route')}</a>
    <div class="rail-types">${typeBtns}</div>
    <div class="rail-spacer"></div>
    <a class="${cls('accomplishments')}" href="#/accomplishments" data-tip="Accomplishments" aria-label="Accomplishments">${icon('award')}</a>
    <button class="rail-item" data-action="account" data-tip="Account" aria-label="Account">${icon('circle-user-round')}</button>
    ${panel}`;
  const list = $('#rail .rail-sheet-goals');
  if (list) list.scrollTop = keepY;
  // On a laptop the panel opens beside its button.
  const btn = state.railType && $(`#rail .rail-type[data-type="${state.railType}"]`);
  if (btn) $('#rail .rail-sheet')?.style.setProperty('--sheet-top', `${btn.offsetTop}px`);
}

// Closes the bar's type panel without rebuilding the page.
function closeTypePanel() {
  if (!state.railType) return;
  state.railType = null;
  $('#rail .rail-sheet')?.remove();
  document.querySelectorAll('#rail .rail-type').forEach((b) => {
    b.classList.remove('active');
    b.setAttribute('aria-expanded', 'false');
  });
}

// ---------- views ----------

function viewLogin(error = '') {
  return `
    <section class="login page-in">
      <div class="login-card">
        <div class="brand-mark">${icon('sparkles')}</div>
        <h1>SANKALP</h1>
        <p class="tagline">Build habits. Keep your sankalpas. Walk the journey one day at a time.</p>
        <button class="btn google" data-action="login">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          Continue with Google
        </button>
        ${error ? `<p class="error">${esc(error)}</p>` : ''}
        <p class="fine">Your journeys are stored in your own Firestore account.</p>
      </div>
    </section>`;
}

function viewSetup() {
  return `
    <section class="login page-in">
      <div class="login-card">
        <div class="brand-mark">${icon('settings')}</div>
        <h1>Almost there</h1>
        <p class="tagline">Add your Firebase web config to <code>js/config.js</code>, then reload.</p>
      </div>
    </section>`;
}

// What every journey card shows, used by both the normal cards and the drag cards.
function goalInner(g, today) {
  const nxt = L.nextActionText(g, today);
  let pct;
  let meta;
  let foot;
  if (g.type === 'smart' && g.smart) {
    const p = L.smartProgress(g, today);
    pct = Math.round(p.ratio * 100);
    meta = `SMART Goal · ${p.projected.days} days`;
    foot = `<span>${pct}% of targets</span>`;
  } else {
    const j = L.journey(g, today);
    pct = Math.min(100, Math.round((j.done / g.targetDays) * 100));
    meta = `${typeName(g)} · ${g.targetDays} days${j.exceptions ? ` · ${j.exceptions} exception${j.exceptions > 1 ? 's' : ''}` : ''}`;
    foot = `<span>${j.done} / ${g.targetDays}</span>`;
  }
  return `
    <div class="goal-card-top">
      <div class="goal-icon">${icon(g.icon)}</div>
      <div class="goal-meta">
        <h3>${esc(g.title)}</h3>
        <p>${esc(meta)}</p>
      </div>
    </div>
    <div class="bar"><span style="width:${pct}%"></span></div>
    <div class="goal-card-foot">
      ${foot}
      <span class="chip ${nxt.kind}">${esc(nxt.text)}</span>
    </div>`;
}

function goalCard(g, today) {
  return `
    <a class="goal-card" href="#/goal/${encodeURIComponent(g.id)}" style="--c:${colour(g.color)}">
      ${goalInner(g, today)}
    </a>`;
}

// A journey card you can drag in reorder mode. It sits in its type's column.
function dragCardHTML(g, today) {
  return `<div class="goal-card drag-item" data-id="${esc(g.id)}" style="--c:${colour(g.color)}">${goalInner(g, today)}</div>`;
}

// SMART log for one day: one number box per plan item. Defaults to the open day.
// Only the check-in day can be logged. The next day only opens once the open day is met.
function smartLogHTML(g, today) {
  const p = L.smartProgress(g, today);
  if (p.phase === 'upcoming') return `<p class="muted log-note">Starts ${fmtDate(g.attemptStart)}. You can log numbers from that day.</p>`;
  if (!p.items.length) return '<p class="muted log-note">This goal has no plan yet. Add one from Edit.</p>';
  // The overdue day before comes first while it is open; otherwise the current check-in day.
  const date = p.openDay ?? L.checkinDay(g, today);
  const dayLabel = date === today ? 'Today' : `Pending · ${fmtDate(date)}`;

  const valueOf = (it) => state.drafts[`${g.id}|${it.index}|${date}`] ?? g.logs?.[date]?.[it.index];
  const needs = p.items.filter((it) => {
    const v = valueOf(it);
    return v === undefined || v === '' || !L.metAmount(v, L.dayTargetOf(it, date));
  });
  const needHTML = needs.length
    ? `<p class="log-need">${icon('circle-alert')}<span>Still needed: ${needs.map((it) => `${esc(it.action)} (${fmtNum(L.dayTargetOf(it, date))})`).join(', ')}</span></p>`
    : `<p class="log-ok">${icon('circle-check')}<span>This day is met.</span></p>`;

  const rows = p.items.map((it) => {
    const value = valueOf(it) ?? '';
    return `
      <label class="log-row">
        <span class="log-k"><strong>${rich(it.action)}</strong>${g.smart?.notes && it.note ? `<span class="log-note">${rich(it.note)}</span>` : ''}<small class="muted">Goal ${fmtNum(it.amount)} ${esc(L.periodLabel(it.per, it.unit))}</small></span>
        <input type="number" min="0" step="any" inputmode="decimal" placeholder="0" value="${esc(value)}"
          data-log-index="${it.index}" data-log-date="${date}" aria-label="${esc(it.action)}">
      </label>`;
  }).join('');

  return `
    <form class="smart-log" data-smart-form data-goal="${esc(g.id)}" novalidate>
      <p class="eyebrow log-day">${dayLabel}</p>
      ${needHTML}
      ${rows}
      <div class="smart-log-foot">
        <button type="button" class="btn primary sm" data-action="smart-save" data-goal="${esc(g.id)}">${icon('check')}Save numbers</button>
      </div>
    </form>`;
}

// One row of the check-in screen: the controls when a day is due, otherwise a quiet line.
function checkRowHTML(g, today, view = null) {
  const nxt = L.nextActionText(g, today);
  const overdueTag = L.isOverdue(g, today) ? '<span class="overdue-tag">Overdue</span>' : '';
  // Next-day journeys: what is logged today is for the day before.
  const ydayTag = L.isNextMorning(g) ? '<span class="yday-tag">For yesterday</span>' : '';
  const titleLink = (sub) => `
    <a class="due-title" href="#/goal/${encodeURIComponent(g.id)}">
      <span class="goal-icon sm">${icon(g.icon)}</span>
      <span><strong>${esc(g.title)}${overdueTag}</strong><small>${esc(sub)}</small></span>
    </a>`;

  // The Tomorrow group is a preview: no buttons, because nothing is due yet.
  if (view === 'tomorrow') {
    return `<div class="due-row idle" style="--c:${colour(g.color)}">${titleLink('Due tomorrow')}</div>`;
  }

  if (g.type === 'smart' && g.smart) {
    const p = L.smartProgress(g, today);
    if (p.phase === 'running' && !p.complete && L.nextDueDate(g, today)) {
      return `
        <div class="due-row smart-due" style="--c:${colour(g.color)}">
          ${ydayTag}
          ${titleLink(`${nxt.text} · SMART Goal`)}
          ${smartLogHTML(g, today)}
        </div>`;
    }
    return `<div class="due-row idle" style="--c:${colour(g.color)}">${ydayTag}${titleLink(nxt.text)}</div>`;
  }

  if (nxt.kind === 'today' || nxt.kind === 'overdue') {
    const j = L.journey(g, today);
    const av = L.exceptionAvailability(g, j.next.date);
    const label = j.next.date === today ? 'Today' : `Pending · ${fmtDate(j.next.date)}`;
    return `
      <div class="due-row" style="--c:${colour(g.color)}">
        ${ydayTag}
        ${titleLink(label)}
        <div class="due-actions">
          <button class="btn yes sm" data-action="checkin" data-goal="${g.id}" data-date="${j.next.date}" data-answer="yes">${icon('check')}Done</button>
          <button class="btn no sm" data-action="checkin" data-goal="${g.id}" data-date="${j.next.date}" data-answer="no" title="${esc(av.ok ? 'Uses an exception' : 'Restarts the journey')}">${icon('x')}Missed</button>
        </div>
      </div>`;
  }
  return `<div class="due-row idle" style="--c:${colour(g.color)}">${ydayTag}${titleLink(nxt.text)}</div>`;
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
}

// Screen 1: Check In. Only the journeys that still need a check-in are listed. Done ones leave the list.
function viewHome() {
  const today = L.todayStr();
  const active = sortedActive();
  const c = L.checkinCounts(state.goals, today);
  const name = (state.user.displayName || '').split(' ')[0] || 'There';
  const due = active.filter((g) => L.needsCheckin(g, today));
  // A tapped number opens its own list. With none open, the list is everything due now.
  const view = state.checkView;
  const shown = view ? active.filter((g) => L.inCheckinGroup(g, view, today)) : due;
  const emptyText = { today: 'Nothing due today.', overdue: 'Nothing overdue.', tomorrow: 'Nothing due tomorrow.' }[view] || 'Nothing to check in.';
  const tile = (key, n, label, hot = false) => `
    <button type="button" class="stat stat-btn${hot ? ' hot' : ''}${view === key ? ' on' : ''}" data-action="check-view" data-view="${key}" aria-pressed="${view === key}">
      <div><strong>${n}</strong><span>${label}</span></div>
    </button>`;

  const editBtn = active.length > 1 ? `
    <button class="icon-btn edit-btn reorder-toggle${state.reorder ? ' on' : ''}" data-action="reorder"
      aria-label="${state.reorder ? 'Finish reordering' : 'Reorder journeys'}" title="${state.reorder ? 'Done' : 'Reorder'}">${icon(state.reorder ? 'check' : 'pencil')}</button>` : '';

  let body;
  if (!active.length) {
    body = `
      <div class="empty">
        <div class="empty-orb">${icon('sprout')}</div>
        <h2>Nothing to check in yet</h2>
        <p class="muted">Start a journey under Your Journeys, and it will show up here.</p>
      </div>`;
  } else if (state.reorder) {
    body = `
      <section class="block">
        <p class="muted hint">Drag a journey up or down inside its column. Each type keeps its own column. Your Journeys shows the same order.</p>
        ${typeColumns(active, (g) => dragCardHTML(g, today), (t) => `No ${TYPE_PLURAL[t].toLowerCase()} to reorder.`,
          { listClass: 'drag-list', listAttrs: 'data-drag-list' })}
      </section>`;
  } else {
    body = `
      ${!view && !due.length ? `<div class="all-clear">${icon('circle-check')}<span>All caught up. Nothing needs a check-in right now.</span></div>` : ''}
      <section class="block">
        ${typeColumns(shown, (g) => checkRowHTML(g, today, view), emptyText, { collapsible: !view })}
      </section>`;
  }

  return `
    <div class="page-in-target">
      <header class="hero">
        <p class="eyebrow">${greeting()}, ${esc(name)}</p>
        <h1 class="page-title">Check In</h1>
        ${active.length ? `
        <div class="checkin-bar">
          <div class="stats summary">
            ${tile('today', c.today, 'Today', c.today > 0)}
            ${c.overdue || view === 'overdue' ? tile('overdue', c.overdue, 'Overdue', true) : ''}
            ${tile('tomorrow', c.tomorrow, 'Tomorrow')}
          </div>
          ${editBtn}
        </div>` : ''}
      </header>
      ${body}
    </div>`;
}

// Screen 2: Your Journeys. No editing here: New Journey is the one centred action.
function viewJourneys() {
  const today = L.todayStr();
  const active = sortedActive();
  const list = active.length
    ? typeColumns(active, (g) => goalCard(g, today), (t) => `No ${TYPE_PLURAL[t].toLowerCase()} yet.`, { collapsible: true })
    : `<div class="empty small">
        <div class="empty-orb">${icon('sprout')}</div>
        <h3>No journeys yet</h3>
        <p class="muted">Press New Journey to begin.</p>
      </div>`;

  return `
    <div class="page-in-target">
      <header class="hero">
        <p class="eyebrow">Your record</p>
        <h1 class="page-title">Your Journeys</h1>
        <div class="stats summary">
          <div class="stat"><div><strong>${active.length}</strong><span>Active</span></div></div>
        </div>
      </header>
      <div class="center-action">
        <button class="btn primary big" data-action="new">${icon('plus')}New Journey</button>
      </div>
      ${list}
    </div>`;
}

function cellHTML(c, g, today, av) {
  const n = c.index + 1;
  const style = `--i:${Math.min(c.index, 40)}`;
  if (c.state === 'done') {
    return `<div class="cell s-done" style="${style}" title="Day ${n} · ${fmtDate(c.date)}">${icon('check')}</div>`;
  }
  if (c.state === 'exception') {
    return `<div class="cell s-exception" style="${style}" title="Exception · ${fmtDate(c.date)}">${icon('shield')}</div>`;
  }
  if (c.state === 'active') {
    const caption = av.ok
      ? `Miss = exception (${av.remaining} left)`
      : (av.reason === 'too_soon' ? `Miss = restart. Exception opens ${fmtDate(av.nextAllowed)}` : 'Miss = restart');
    return `
      <div class="cell s-active is-active" style="${style}" tabindex="0" title="Day ${n} · ${fmtDate(c.date)}">
        <span class="num">${n}</span>
        <div class="cell-actions" role="group" aria-label="Check in day ${n}">
          <button class="yes" data-action="checkin" data-goal="${g.id}" data-date="${c.date}" data-answer="yes" aria-label="Done">${icon('check')}</button>
          <button class="no" data-action="checkin" data-goal="${g.id}" data-date="${c.date}" data-answer="no" aria-label="Missed">${icon('x')}</button>
          <small>${esc(caption)}</small>
        </div>
      </div>`;
  }
  return `<div class="cell s-${c.state}" style="${style}" title="Day ${n} · ${fmtDate(c.date)}"><span class="num">${n}</span></div>`;
}

function goalHeadHTML(g) {
  return `
    <header class="goal-head" style="--c:${colour(g.color)}">
      <a class="icon-btn back" href="#/journeys" aria-label="Back">${icon('arrow-left')}</a>
      <div class="goal-title">
        <span class="goal-icon lg">${icon(g.icon)}</span>
        <div>
          <p class="eyebrow">${typeName(g)}</p>
          <h1>${esc(g.title)}</h1>
          ${g.description ? (g.type === 'smart' && g.descMarkdown
            ? `<div class="desc md">${renderMarkdown(g.description)}</div>`
            : `<p class="desc">${rich(g.description)}</p>`) : ''}
          ${g.why ? `<p class="why"><strong>Why:</strong> ${rich(g.why)}</p>` : ''}
        </div>
      </div>
      ${g.status === 'deleted' ? '' : `<button class="icon-btn" data-action="goal-settings" data-goal="${g.id}" aria-label="Edit journey">${icon('pencil')}</button>`}
    </header>`;
}

function ringHTML(pct, centre) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  return `
    <div class="ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="${r}" class="ring-bg"></circle>
        <circle cx="60" cy="60" r="${r}" class="ring-fg" style="stroke-dasharray:${circ};stroke-dashoffset:${circ * (1 - pct / 100)}"></circle>
      </svg>
      <div class="ring-label"><strong>${pct}%</strong><span>${centre}</span></div>
    </div>`;
}

function viewHabitGoal(g, today) {
  const j = L.journey(g, today);
  const pct = Math.min(100, Math.round((j.done / g.targetDays) * 100));
  const dayNum = L.dayNumber(g, today);
  const policy = L.policyFor(g);
  const nextExc = L.exceptionAvailability(g, j.next?.date || today);

  let panel;
  if (g.status === 'completed') {
    panel = `<section class="panel done-panel">${icon('trophy')}<div><h3>Accomplished on ${fmtDate(g.completedAt?.slice(0, 10))}</h3>
      <p class="muted">You completed ${g.targetDays} days${j.exceptions ? ` with ${j.exceptions} exception${j.exceptions > 1 ? 's' : ''}` : ''}.</p></div>
      <a class="btn ghost sm" href="#/accomplishments">View</a>
      <button class="btn primary sm" data-action="redo" data-goal="${g.id}">${icon('rotate-ccw')}Redo</button></section>`;
  } else if (g.status === 'abandoned') {
    panel = `<section class="panel muted-panel">${icon('ban')}<div><h3>Closed</h3><p class="muted">This journey was abandoned and is listed under Not accomplished.</p></div></section>`;
  } else if (g.status === 'deleted') {
    panel = `<section class="panel muted-panel">${icon('trash-2')}<div><h3>Deleted</h3><p class="muted">This journey is listed under Deleted. You can redo it from there.</p></div></section>`;
  } else if (j.next) {
    const isToday = j.next.date === today;
    const consequence = nextExc.ok
      ? `A miss uses one of your ${nextExc.remaining} exception${nextExc.remaining > 1 ? 's' : ''} and adds a day to the journey.`
      : (nextExc.reason === 'too_soon'
        ? `You already used an exception recently. A miss now restarts the journey. The next exception opens on ${fmtDate(nextExc.nextAllowed)}.`
        : nextExc.reason === 'not_allowed'
          ? 'No exceptions. A miss restarts the journey.'
          : 'All exceptions are used. A miss restarts the journey.');
    panel = `
      <section class="panel checkin-panel compact">
        <div class="checkin-copy">
          <p class="eyebrow">${isToday ? 'Today' : 'Pending'} · ${fmtDate(j.next.date)}</p>
          <h3>Did you ${keepPhrase(g)} on this day?</h3>
          <p class="muted">${esc(consequence)}</p>
        </div>
        <div class="answer-row">
          <button class="btn yes" data-action="checkin" data-goal="${g.id}" data-date="${j.next.date}" data-answer="yes">${icon('check')}Yes, done</button>
          <button class="btn no" data-action="checkin" data-goal="${g.id}" data-date="${j.next.date}" data-answer="no">${icon('x')}Missed</button>
        </div>
      </section>`;
  } else if (today < g.attemptStart) {
    panel = `<section class="panel muted-panel">${icon('calendar')}<div><h3>Not started yet</h3><p class="muted">Starts ${fmtDate(g.attemptStart)}.</p></div></section>`;
  } else {
    panel = `<section class="panel muted-panel">${icon('circle-check')}<div><h3>Today is checked</h3><p class="muted">The next day unlocks tomorrow.</p></div></section>`;
  }

  const past = (g.history || []).filter((h) => h.outcome === 'failed' || h.outcome === 'abandoned');
  const pastHTML = past.length ? `
    <section class="block">
      <div class="block-head"><h2>Past runs</h2></div>
      <div class="attempt-list">${past.slice().reverse().map((h) => `
        <div class="attempt">
          <div><strong>${fmtDate(h.startDate)} → ${fmtDate(h.endDate)}</strong>
          <small>${h.doneCount} of ${h.targetDays} days · ${esc(h.reason)}</small></div>
        </div>`).join('')}</div>
    </section>` : '';

  return `
    <div class="page-in-target">
      ${goalHeadHTML(g)}

      <div class="overview">
        ${ringHTML(pct, `${j.done}/${g.targetDays}`)}
        <div class="kpis">
          <div class="kpi"><span>Day</span><strong>${dayNum}<small> / ${j.total}</small></strong></div>
          ${policy.maxExceptions
            ? `<div class="kpi"><span>Exceptions left</span><strong>${policy.maxExceptions - j.exceptions}<small> / ${policy.maxExceptions}</small></strong></div>`
            : '<div class="kpi"><span>Exceptions</span><strong class="sm">None</strong></div>'}
          <div class="kpi"><span>Journey length</span><strong>${j.total}<small> days</small></strong></div>
          ${startKpiHTML(g, today)}
        </div>
      </div>

      ${panel}

      <section class="block">
        <div class="block-head">
          <h2>Journey</h2>
          <div class="legend">
            <span><i class="dot d"></i>Done</span>${j.exceptions ? '<span><i class="dot e"></i>Exception</span>' : ''}
            <span><i class="dot a"></i>Open</span><span><i class="dot l"></i>Locked</span>
          </div>
        </div>
        <p class="muted hint">Hover a glowing circle to check in. On touch, tap it.</p>
        <div class="journey">
          ${j.cells.map((c) => cellHTML(c, g, today, nextExc)).join('')}
        </div>
      </section>
      ${pastHTML}
    </div>`;
}

// The daily brief: pace, how far the finish moves, what to focus on, what is going well, what today needs, insights.
function paceNoteHTML(g, p, b) {
  if (p.complete) return '';
  if (b.status === 'upcoming') {
    return `
    <section class="panel pace-panel">
      ${icon('calendar')}
      <div>
        <p class="pace-status">Not started</p>
        <h3>Starts ${fmtDate(g.attemptStart)}</h3>
      </div>
    </section>`;
  }
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const end = fmtDate(p.projected.end);
  const planEnd = fmtDate(p.planned.end);
  const left = p.daysLeft;
  const status = b.status === 'behind'
    ? { cls: 'behind', word: 'Lagging', icon: 'trending-up' }
    : b.status === 'ahead'
      ? { cls: 'ahead', word: 'Ahead', icon: 'trending-down' }
      : { cls: '', word: 'On pace', icon: 'circle-check' };
  const headline = b.status === 'behind'
    ? `${plural(b.shift, 'day')} late at this pace (${end}).`
    : b.status === 'ahead'
      ? `${plural(-b.shift, 'day')} early at this pace (${end}).`
      : `On track for ${planEnd}.`;
  const unitText = (it) => (it.unit ? ` ${esc(it.unit)}` : '');
  const focusRows = b.focus.map((it) => `<strong>${rich(it.action)}</strong> ${fmtNum(it.done)} of ${fmtNum(it.expected)}${unitText(it)}${it.catchUp ? ` · ~${plural(it.catchUp, 'day')} behind` : ''}`);
  const strongRows = b.strengths.map((it) => `<strong>${rich(it.action)}</strong> ${Math.round(it.ratio * 100)}%`);
  const todayRows = b.today.map((it) => `<strong>${rich(it.action)}</strong> ${fmtNum(it.todayShort)}${unitText(it)} left`);
  const list = (title, rows, emptyText) => `<div class="brief-col"><h4>${title}</h4>${rows.length
    ? `<ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>`
    : `<p class="muted">${emptyText}</p>`}</div>`;
  return `
    <section class="panel pace-panel ${status.cls}">
      ${icon(status.icon)}
      <div>
        <p class="pace-status">${status.word}</p>
        <h3>${left} day${left === 1 ? '' : 's'} left at your current pace</h3>
        <p>${headline}</p>
        <div class="brief-grid">
          ${list('Focus', focusRows, 'All on track')}
          ${list('Doing well', strongRows, 'Log to see')}
          ${list('Today', todayRows, 'All done')}
          ${list('Insights', [
            ...(b.shift ? [b.shift > 0
              ? `Planned ${planEnd}, extended to ${end} for your pace`
              : `Planned ${planEnd}, now ${end} for your pace`] : []),
            ...b.insights,
          ], 'Log to see')}
        </div>
      </div>
    </section>`;
}

// What a day cell shows: a tick when done, the percentage when partial, a cross when missed, otherwise its day number.
function cellContent(d) {
  if (d.state === 'done') return icon('check');
  if (d.state === 'missed') return icon('x');
  if (d.state === 'partial') {
    return `<span class="tide"><span class="wave"></span></span><span class="num">${d.percent}%</span>`;
  }
  return `<span class="num">${d.index + 1}</span>`;
}

function viewSmartGoal(g, today) {
  const p = L.smartProgress(g, today);
  const pct = Math.round(p.ratio * 100);

  let panel = '';
  if (g.status === 'completed') {
    panel = `<section class="panel done-panel">${icon('trophy')}<div><h3>Accomplished on ${fmtDate(g.completedAt?.slice(0, 10))}</h3>
      <p class="muted">Every target in your plan was met.</p></div>
      <a class="btn ghost sm" href="#/accomplishments">View</a>
      <button class="btn primary sm" data-action="redo" data-goal="${g.id}">${icon('rotate-ccw')}Redo</button></section>`;
  } else if (g.status === 'abandoned') {
    panel = `<section class="panel muted-panel">${icon('ban')}<div><h3>Closed</h3><p class="muted">This goal was closed and is listed under Not accomplished.</p></div></section>`;
  } else if (g.status === 'deleted') {
    panel = `<section class="panel muted-panel">${icon('trash-2')}<div><h3>Deleted</h3><p class="muted">This goal is listed under Deleted. You can redo it from there.</p></div></section>`;
  } else {
    panel = paceNoteHTML(g, p, L.smartBrief(g, today));
  }

  const logBlock = g.status === 'active' ? `
    <section class="block">
      <div class="block-head"><h2>Log your numbers</h2></div>
      <div class="smart-due">${smartLogHTML(g, today)}</div>
    </section>` : '';

  // Every day from the first to the projected end. Days are closed once they pass, so the map is read-only.
  const cells = p.days.map((d) => {
    const partial = d.state === 'partial' ? `Only ${d.percent}% of goal met for the day` : '';
    return `<div class="cell s-${d.state}" style="--i:${Math.min(d.index, 40)};--pct:${d.percent ?? 0}" title="Day ${d.index + 1} · ${fmtDate(d.date)}${partial ? ` · ${partial}` : ''}"${partial ? ` aria-label="${partial}"` : ''}>${cellContent(d)}</div>`;
  }).join('');

  const targets = p.items.length
    ? p.items.map((it) => trackRowHTML(it, p.daysLeft, !!g.smart?.notes)).join('')
    : '<p class="muted">This goal has no plan yet. Add one from Edit.</p>';

  return `
    <div class="page-in-target">
      ${goalHeadHTML(g)}

      <div class="overview">
        ${ringHTML(pct, `${p.items.filter((i) => i.complete).length}/${p.items.length} met`)}
        <div class="kpis">
          ${startKpiHTML(g, today)}
          <div class="kpi"><span>Days left</span><strong>${p.daysLeft}</strong></div>
          <div class="kpi"><span>Zero days</span><strong>${p.zeroDays}</strong></div>
          <div class="kpi"><span>Days logged</span><strong>${p.loggedDays}</strong></div>
          <div class="kpi"><span>End date</span><strong class="sm">${fmtDate(p.projected.end)}</strong></div>
        </div>
      </div>

      ${panel}
      ${logBlock}

      <section class="block">
        <div class="block-head">
          <h2>Day by day</h2>
          <div class="legend">
            <span><i class="dot d"></i>Done</span><span><i class="dot a"></i>Open</span>
            <span><i class="dot p"></i>Partial</span><span><i class="dot m"></i>Missed</span><span><i class="dot l"></i>Locked</span>
          </div>
        </div>
        <p class="muted hint">A day you don't log stays open as overdue through the next day, then it closes: done, partial by its percentage, or missed.</p>
        <div class="journey">${cells}</div>
      </section>

      <section class="block">
        <div class="block-head"><h2>Targets</h2></div>
        <div class="track-list">${targets}</div>
      </section>

      ${smartPlanHTML(g)}
    </div>`;
}

// One target: done so far, what is left, and what it takes per day from here to finish.
function trackRowHTML(it, daysLeft, notes = false) {
  const per = L.periodLabel(it.per, it.unit);
  const pct = Math.round(it.ratio * 100);
  let needText = 'Target met';
  if (!it.complete) {
    const span = Math.max(1, Math.ceil(daysLeft / (L.PERIOD_DAYS[it.per] || 1)));
    const need = Math.ceil((it.remaining / span) * 10) / 10;
    needText = `${fmtNum(it.remaining)} left · about ${fmtNum(need)} ${per} from here`;
  }
  return `
    <div class="track-row${it.complete ? ' met' : ''}">
      <div class="track-main"><strong>${rich(it.action)}</strong>${notes && it.note ? `<span class="log-note">${rich(it.note)}</span>` : ''}<small class="muted">Goal ${fmtNum(it.amount)} ${esc(per)}</small></div>
      <div class="track-meter">
        <div class="bar"><span style="width:${pct}%"></span></div>
        <small>${fmtNum(it.done)} of ${fmtNum(it.total)} · ${pct}%</small>
      </div>
      <small class="track-need">${needText}</small>
    </div>`;
}

function viewGoal(id) {
  const g = state.goals.find((x) => x.id === id);
  if (!g) {
    return `<div class="empty"><h2>Journey not found</h2><a class="btn ghost" href="#/journeys">Back to your journeys</a></div>`;
  }
  const today = L.todayStr();
  return g.type === 'smart' && g.smart ? viewSmartGoal(g, today) : viewHabitGoal(g, today);
}

// Three columns on a wide screen, one stack on a phone. Each column is one type, with what that type means underneath.
// emptyFor is the text for an empty column: a string, or a function of the type.
// Collapsible: each column's header is a drop-down. Only one is open at a time, so opening
// another closes the one before it. Closed by default; state.openType holds the open one.
function typeColumns(items, renderCard, emptyFor, { listClass = '', listAttrs = '', collapsible = false } = {}) {
  return `<div class="type-cols">${L.TYPES.map((type) => {
    const list = items.filter((x) => x.type === type);
    const empty = typeof emptyFor === 'function' ? emptyFor(type) : emptyFor;
    const open = !collapsible || state.openType === type;
    const bodyHTML = list.length
      ? `<div class="type-col-list ${listClass}" ${listAttrs}>${list.map(renderCard).join('')}</div>`
      : `<p class="muted type-col-empty">${esc(empty)}</p>`;
    const panel = `
      <div class="type-col-panel" id="type-panel-${type}"${open ? '' : ' hidden'}>
        <p class="type-col-sub">${esc(TYPE_SUB[type])}</p>
        ${bodyHTML}
      </div>`;
    const head = collapsible
      ? `<button type="button" class="type-col-head type-col-toggle" data-action="type-toggle" data-type="${type}"
          aria-expanded="${open}" aria-controls="type-panel-${type}">
          ${icon(TYPE_ICON[type])}<span>${TYPE_PLURAL[type]}</span><b>${list.length}</b>${icon('chevron-down', 'type-col-caret')}
        </button>`
      : `<header class="type-col-head">${icon(TYPE_ICON[type])}<span>${TYPE_PLURAL[type]}</span><b>${list.length}</b></header>`;
    return `
      <section class="type-col${collapsible ? ' is-collapsible' : ''}${open ? ' is-open' : ''}" data-type="${type}">
        ${head}
        ${collapsible ? panel : `<p class="type-col-sub">${esc(TYPE_SUB[type])}</p>${bodyHTML}`}
      </section>`;
  }).join('')}</div>`;
}

// Accomplished and Not accomplished. Each entry is only its title, one status word, and Redo.
// Tapping the title opens the journey for the details.
function viewAccomplishments() {
  const tab = state.accTab;
  const done = L.accomplishedGroups(state.goals);
  const misses = L.notAccomplishedGroups(state.goals, L.todayStr());
  const deleted = L.deletedGroups(state.goals);
  const doneTotal = done.reduce((n, g) => n + g.count, 0);
  const missTotal = misses.reduce((n, g) => n + g.count, 0);
  const deletedTotal = deleted.reduce((n, g) => n + g.count, 0);
  const countLabel = (text, n) => (n > 1 ? `${text} × ${n}` : text);
  const tabs = `
    <div class="segmented" role="tablist">
      <button role="tab" aria-selected="${tab === 'accomplished'}" class="${tab === 'accomplished' ? 'on' : ''}" data-action="acc-tab" data-tab="accomplished">${icon('trophy')}Accomplished <b>${doneTotal}</b></button>
      <button role="tab" aria-selected="${tab === 'missed'}" class="${tab === 'missed' ? 'on' : ''}" data-action="acc-tab" data-tab="missed">${icon('circle-x')}Not accomplished <b>${missTotal}</b></button>
      <button role="tab" aria-selected="${tab === 'deleted'}" class="${tab === 'deleted' ? 'on' : ''}" data-action="acc-tab" data-tab="deleted">${icon('trash-2')}Deleted <b>${deletedTotal}</b></button>
    </div>`;

  const record = (title, status, tone, goalId, redoAction) => `
    <article class="rec-card">
      <a class="rec-title" href="#/goal/${encodeURIComponent(goalId)}">${esc(title)}</a>
      <div class="rec-side">
        <span class="rec-status ${tone}">${esc(status)}</span>
        <button class="btn ghost sm" data-action="${redoAction}" data-goal="${esc(goalId)}">${icon('rotate-ccw')}Redo</button>
      </div>
    </article>`;

  let list;
  if (tab === 'accomplished') {
    list = typeColumns(done, (g) => record(g.title, countLabel('Accomplished', g.count), 'ok', g.latest.goalId, 'redo'), 'Nothing accomplished in this group yet.');
  } else if (tab === 'deleted') {
    list = typeColumns(deleted, (d) => record(d.title, countLabel('Deleted', d.count), 'deleted', d.latest.goalId, 'redo-miss'), 'Nothing deleted in this group.');
  } else {
    list = typeColumns(misses, (m) => (m.latest.outcome === 'abandoned'
      ? record(m.title, countLabel('Abandoned', m.count), 'abandoned', m.latest.goalId, 'redo-miss')
      : record(m.title, countLabel('Not accomplished', m.count), 'failed', m.latest.goalId, 'redo-miss')), 'No misses in this group.');
  }

  const empty = !done.length && !misses.length;
  let body = list;
  if (tab === 'deleted') {
    if (!deleted.length) body = emptyBlock('trash-2', 'Nothing deleted', 'Journeys you delete land here, with their history, ready to redo.');
  } else if (empty) {
    body = tab === 'accomplished'
      ? emptyBlock('trophy', 'Nothing accomplished yet', 'Complete a journey and it will land here.')
      : emptyBlock('sparkles', 'No misses on record', 'Every journey you have started is still on track or accomplished.');
  }
  return `
    <div class="page-in-target acc-page">
      <header class="hero">
        <p class="eyebrow">Your record</p>
        <h1 class="page-title">Accomplishments</h1>
      </header>
      ${tabs}
      <section class="block">${body}</section>
    </div>`;
}

function emptyBlock(iconName, title, text) {
  return `<div class="empty small"><div class="empty-orb">${icon(iconName)}</div><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p></div>`;
}

function smartPlanHTML(g) {
  return `
    <section class="block">
      <div class="block-head"><h2>Your SMART plan</h2><span class="muted">Deadline ${fmtDate(g.smart.endDate)}</span></div>
      <div class="smart-plan">${L.SMART_FIELDS.map((f) => `
        <div class="smart-item">
          <span class="smart-k">${esc(f.label)}</span>
          <p>${rich(g.smart[f.key])}</p>
        </div>`).join('')}</div>
    </section>`;
}

// ---------- dialogs ----------

// The three SMART text parts: Specific, Realistic, Time-bound.
// A free-text box. Enter starts a new line and the box grows to fit. Typing **text** in it is shown bold in the preview under it.
// True when the text has any formatting, so the live preview shows.
const hasBold = (s) => rich(String(s ?? '')) !== esc(String(s ?? ''));
// A preview that shows about two lines, with a button to show all of it.
function previewBodyHTML(html, hideButton = false) {
  return `<button type="button" class="preview-toggle" data-preview-toggle${hideButton ? ' hidden' : ''}>Show full preview</button><div class="preview-body rich-preview">${html}</div>`;
}

function richBoxHTML({ name, value = '', max, req = false, placeholder = '', rows = 1, aria = '', cls = '', collapsible = false }) {
  const box = `<textarea class="auto${cls ? ` ${cls}` : ''}" data-rich name="${name}" rows="${rows}" maxlength="${max}"${req ? ' required' : ''}${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}${aria ? ` aria-label="${esc(aria)}"` : ''}>${esc(value)}</textarea>`;
  if (collapsible) return box + `<div class="preview-wrap rich-wrap"${hasBold(value) ? '' : ' hidden'}>${previewBodyHTML(rich(value))}</div>`;
  return box + `<span class="rich-preview" aria-hidden="true"${hasBold(value) ? '' : ' hidden'}>${rich(value)}</span>`;
}

function smartFieldsHTML(values = {}, req = true) {
  return L.SMART_FIELDS.map((f) => `
    <label class="field">
      <span>${esc(f.label)}${req ? ` ${REQ}` : ''}</span>
      <small class="muted field-hint">${esc(f.hint)}</small>
      ${richBoxHTML({ name: f.key, value: values[f.key] || '', max: 500, req, rows: 2 })}
    </label>`).join('');
}

// SMART goals get a Markdown checkbox above the box and a live Markdown preview under it.
// markdown: null means no checkbox (other types); otherwise the checkbox's starting state.
// smartOnly hides only the Markdown switch unless the type is SMART (the create form).
function descriptionFieldHTML(value = '', req = true, { markdown = null, smartOnly = false } = {}) {
  const text = richBoxHTML({ name: 'description', value, max: 1000, req, rows: 2, placeholder: 'What this is, in a sentence or two', aria: 'Description', collapsible: true });
  if (markdown === null) return `
    <label class="field"><span>Description${req ? ` ${REQ}` : ''}</span>
      ${text}</label>`;
  // The Markdown switch sits on the same line as the label, on the right.
  return `
    <div class="md-field${markdown ? ' md-on' : ''}" data-md-field>
      <div class="md-head">
        <span class="md-title">Description${req ? ` ${REQ}` : ''}</span>
        <label class="md-toggle"${smartOnly ? ' data-only="smart" hidden' : ''}><input type="checkbox" name="descMarkdown" data-md-toggle${markdown ? ' checked' : ''}> Markdown</label>
      </div>
      ${text}
      <div class="md-preview preview-wrap">${previewBodyHTML(markdown ? renderMarkdown(value) : '', !markdown || !value.trim())}</div>
    </div>`;
}

// Shows or hides the Markdown preview under a description box, and fills it from the text.
function syncMarkdown(field) {
  const on = !!field.querySelector('[data-md-toggle]')?.checked;
  field.classList.toggle('md-on', on);
  const html = on ? renderMarkdown(field.querySelector('textarea').value) : '';
  const wrap = field.querySelector('.md-preview');
  wrap.querySelector('.preview-body').innerHTML = html;
  wrap.querySelector('.preview-toggle').hidden = !html;
}

function whyFieldHTML(value = '', req = true) {
  return `
    <label class="field"><span>Why${req ? ` ${REQ}` : ''}</span>
      ${richBoxHTML({ name: 'why', value, max: 500, req, rows: 2, placeholder: 'The reason this matters to you' })}</label>`;
}

// For things that can only be checked the next morning. Each day is then recorded the day after it.
// Same look as the other choices: two cards. "Next day" is for things you can only tell about the next morning.
function nextMorningFieldHTML(checked = false) {
  return `
    <div class="field"><span>Check-in</span>
      <small class="muted field-hint">Next day: for what you can only tell the next morning.</small>
      <div class="type-toggle two" role="radiogroup" aria-label="Check-in">
        <label class="type-card"><input type="radio" name="nextMorning" value="same"${checked ? '' : ' checked'}><strong>Same day</strong></label>
        <label class="type-card"><input type="radio" name="nextMorning" value="next"${checked ? ' checked' : ''}><strong>Next day</strong></label>
      </div>
    </div>`;
}

// One row of the SMART plan: what to do on the left, how much and per day or week on the right.
// The note box is always in the form (hidden until the notes switch is on), so a saved note is never lost.
function planRowHTML(row = {}) {
  return `
    <div class="plan-row" data-plan-row>
      <div class="plan-action">${richBoxHTML({ name: 'p_action', value: row.action || '', max: 200, placeholder: 'e.g. Read a chapter', aria: 'Actionable item' })}</div>
      <input name="p_amount" type="number" min="0" step="any" inputmode="decimal" placeholder="10" value="${esc(row.amount ?? '')}" aria-label="Measurable amount">
      <div class="plan-setup">
        <input name="p_unit" maxlength="20" list="unit-list" autocomplete="off" value="${esc(L.planUnit(row).unit)}" placeholder="unit" aria-label="Unit, for example hr or pomodoros (optional)">
        <select name="p_per" aria-label="How often">
          ${L.PERIOD_OPTIONS.map(([k, label]) => `<option value="${k}" title="${esc(label)}"${L.planUnit(row).per === k ? ' selected' : ''}>${L.PERIOD_SHORT[k] || label}</option>`).join('')}
        </select>
      </div>
      <div class="plan-cell">
        <div class="plan-total-row">
          <input name="p_total" type="number" min="0" step="any" inputmode="decimal" placeholder="Total for the whole goal" aria-label="Total for the whole goal">
          <button type="button" class="icon-btn plan-remove" data-plan-remove aria-label="Remove this item">${icon('x')}</button>
        </div>
        <small class="muted plan-total-hint" data-total-hint></small>
      </div>
      <input type="hidden" name="p_key" value="${row.key ?? ''}">
      <div class="plan-note">
        ${richBoxHTML({ name: 'p_note', value: row.note || '', max: 300, placeholder: 'Note: what this item means, in your own words', aria: 'Note for this item' })}
      </div>
    </div>`;
}

function planHTML(rows = [], req = true, notes = false) {
  return `
    <div class="field plan-field">
      <span>Plan: actionable and measurable${req ? ` ${REQ}` : ''}</span>
      <p class="muted field-hint">Left: what you do. Right: how much, and how often.</p>
      <label class="check-row"><input type="checkbox" name="smartNotes" data-notes-toggle${notes ? ' checked' : ''}> Add a note to each actionable item</label>
      <div class="plan${notes ? ' show-notes' : ''}" data-plan>
        <datalist id="unit-list">${L.UNIT_SUGGESTIONS.map((u) => `<option value="${esc(u)}">`).join('')}</datalist>
        <div class="plan-head" aria-hidden="true"><span>Actionable</span><span>Measurable</span></div>
        <div class="plan-rows" data-plan-rows>${(rows.length ? rows : [{}]).map(planRowHTML).join('')}</div>
        <button type="button" class="btn ghost sm plan-add" data-plan-add>${icon('plus')}Add an item</button>
      </div>
    </div>`;
}

// The start date in the open form (today when blank).
function goalStartIn(root) {
  const f = root.querySelector('form');
  return f?.querySelector('[name="startDate"]')?.value || L.todayStr();
}

// Days the goal runs, from the dates in the open form. 0 while they are not valid yet.
function goalDaysIn(root) {
  const f = root.querySelector('form');
  const val = (n) => f?.querySelector(`[name="${n}"]`)?.value || '';
  const start = goalStartIn(root);
  try {
    return L.smartLength(start, L.resolveSmartEnd(start, { endDate: val('endDate'), days: val('days') }));
  } catch {
    return 0;
  }
}

// Each row with a total: the amount box becomes the total divided over the goal, per the row's period.
function refreshTotals(root) {
  const days = goalDaysIn(root);
  const start = goalStartIn(root);
  root.querySelectorAll('[data-plan-row]').forEach((row) => {
    const totalEl = row.querySelector('[name="p_total"]');
    const hint = row.querySelector('[data-total-hint]');
    if (!totalEl.value.trim()) { hint.textContent = ''; return; }
    const per = row.querySelector('[name="p_per"]').value;
    const unit = row.querySelector('[name="p_unit"]').value.trim();
    const value = L.perPeriodAmount(totalEl.value, days, per, unit, start);
    if (value === null) {
      hint.textContent = days ? 'Enter a total above zero.' : 'Pick the start date and the deadline (or days) to divide the total.';
      return;
    }
    row.querySelector('[name="p_amount"]').value = value;
    hint.textContent = `${totalEl.value} over ${days} days = ${value} ${L.periodLabel(per, unit)}`;
  });
}

const TOTAL_TRIGGERS = ['p_total', 'p_per', 'p_unit', 'startDate', 'endDate', 'days'];

function wirePlan(root) {
  const onField = (e) => { if (TOTAL_TRIGGERS.includes(e.target.name)) refreshTotals(root); };
  root.addEventListener('input', onField);
  root.addEventListener('change', (e) => {
    onField(e);
    if (!e.target.matches('[data-notes-toggle]')) return;
    const plan = root.querySelector('[data-plan]');
    plan.classList.toggle('show-notes', e.target.checked);
    fitAll(plan);
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-plan-add]')) {
      const rows = root.querySelector('[data-plan-rows]');
      if (!rows || rows.children.length >= L.MAX_PLAN_ROWS) {
        toast(`Use at most ${L.MAX_PLAN_ROWS} actionable items.`, 'error');
        return;
      }
      rows.insertAdjacentHTML('beforeend', planRowHTML());
      const row = rows.lastElementChild;
      fitAll(row);
      row.querySelector('textarea').focus();
      return;
    }
    const rm = e.target.closest('[data-plan-remove]');
    if (rm) rm.closest('[data-plan-row]').remove();
  });
}

function planFromForm(fd) {
  const actions = fd.getAll('p_action');
  const amounts = fd.getAll('p_amount');
  const pers = fd.getAll('p_per');
  const keys = fd.getAll('p_key');
  const notes = fd.getAll('p_note');
  const units = fd.getAll('p_unit');
  return actions.map((action, i) => ({ action, amount: amounts[i], per: pers[i], key: keys[i], note: notes[i], unit: units[i] }));
}

function smartFromForm(fd) {
  return {
    ...Object.fromEntries(L.SMART_FIELDS.map((f) => [f.key, fd.get(f.key)])),
    plan: planFromForm(fd),
    notes: fd.get('smartNotes') === 'on',
  };
}

// Shows only the fields that belong to the chosen type. data-only lists types, e.g. "sankalpa smart".
function showTypeFields(w, type) {
  w.querySelectorAll('[data-only]').forEach((el) => { el.hidden = !el.dataset.only.split(' ').includes(type); });
  const label = w.querySelector('[data-title-label]');
  if (label) label.textContent = L.TYPE_LABEL[type] || 'Habit';
}

// "Ends on ..." under the days and deadline fields of a SMART goal.
function updateEndHint(form) {
  const hint = form.querySelector('[data-end-hint]');
  if (!hint) return;
  const start = form.querySelector('[name="startDate"]').value;
  const days = Math.floor(Number(form.querySelector('[name="days"]').value));
  const end = form.querySelector('[name="endDate"]').value;
  let text = 'Or leave it blank and give the days.';
  if (end) text = `Deadline set to ${fmtDate(end)}.`;
  else if (start && days > 0) text = `Ends on ${fmtDate(L.addDays(start, days - 1))}.`;
  hint.textContent = text;
}

function openCreate() {
  const today = L.todayStr();
  const body = `
    <form id="create-form" class="form" novalidate>
      <div class="type-toggle three" role="radiogroup" aria-label="Type">
        <label class="type-card"><input type="radio" name="type" value="habit" checked>
          ${icon(TYPE_ICON.habit)}<strong>Habit</strong></label>
        <label class="type-card"><input type="radio" name="type" value="smart">
          ${icon(TYPE_ICON.smart)}<strong>SMART Goal</strong></label>
        <label class="type-card"><input type="radio" name="type" value="sankalpa">
          ${icon(TYPE_ICON.sankalpa)}<strong>Sankalpa</strong></label>
      </div>
      <label class="field"><span data-title-label>Habit</span>
        <input name="title" maxlength="80" placeholder="e.g. Read 10 pages, Wake at 5am" autocomplete="off"></label>
      ${descriptionFieldHTML('', false, { markdown: false, smartOnly: true })}
      ${whyFieldHTML('', false)}
      <div class="field-row">
        <label class="field"><span>Start date</span>
          <input name="startDate" type="date" value="${today}"></label>
        <label class="field" data-only="sankalpa smart" hidden><span>Days ${REQ}</span>
          <input name="days" type="number" min="1" max="365" inputmode="numeric" placeholder="e.g. 30"></label>
      </div>
      ${nextMorningFieldHTML(false)}
      <div class="field-row" data-only="smart" hidden>
        <label class="field"><span>Deadline ${REQ}</span>
          <small class="muted field-hint" data-end-hint>Or leave it blank and give the days.</small>
          <input name="endDate" type="date"></label>
      </div>
      <div data-only="smart" hidden>
                ${smartFieldsHTML({}, false)}
        ${planHTML([], false)}
      </div>
      <div class="field"><span>Icon</span>${iconDropdown('', { auto: true })}</div>
      <div class="field"><span>Colour</span>${colorDropdown(DEFAULT_COLOUR)}</div>
      <p class="error" data-error hidden></p>
    </form>`;
  const footer = `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" form="create-form" type="submit">Start journey</button>`;
  openModal({
    title: 'New journey',
    body,
    footer,
    onMount: (w, close) => {
      const form = w.querySelector('#create-form');
      const errBox = w.querySelector('[data-error]');
      wireDropdowns(w);
      wirePlan(w);
      form.addEventListener('change', (e) => {
        if (e.target.name === 'type') {
          showTypeFields(w, e.target.value);
          fitAll(w);   // the SMART boxes were hidden when the dialog opened, so they could not be measured then
        }
        syncAutoIcon(w);
      });
      form.addEventListener('input', () => {
        updateEndHint(form);
        syncAutoIcon(w);
      });
      // Picking Auto again shows its suggestion straight away.
      w.addEventListener('click', (e) => { if (e.target.closest('[data-dd-option]')) syncAutoIcon(w); });
      syncAutoIcon(w);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.hidden = true;
        const fd = new FormData(form);
        try {
          const data = L.newGoalData({
            type: fd.get('type'),
            title: fd.get('title'),
            description: fd.get('description'),
            descMarkdown: fd.get('descMarkdown') === 'on',
            why: fd.get('why'),
            days: fd.get('days'),
            startDate: fd.get('startDate'),
            endDate: fd.get('endDate'),
            smart: smartFromForm(fd),
            icon: fd.get('icon'),
            color: fd.get('color'),
            nextMorning: fd.get('nextMorning') === 'next',
            order: L.nextOrder(state.goals),
          });
          const id = await db.createGoal(state.user.uid, data);
          close();
          location.hash = `#/goal/${encodeURIComponent(id)}`;
          toast(`${data.title} is on your journeys`, 'success');
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        }
      });
      setTimeout(() => form.querySelector('[name="title"]').focus(), 60);
    },
  });
}

// Starts a new journey from an accomplished one. The date (and length or deadline) is chosen in the pop-up.
function openRedo(g, { fromMiss = false } = {}) {
  if (!g || (g.status !== 'completed' && !fromMiss)) return;
  const d = L.redoDefaults(g);
  const body = `
    <form id="redo-form" class="form" novalidate>
      <p class="muted">${esc(g.title)} starts again as a new ${esc(typeName(g).toLowerCase())}. The ${g.status === 'deleted' ? 'deleted' : 'accomplished'} record stays where it is.</p>
      ${descriptionFieldHTML(d.description)}
      ${whyFieldHTML(d.why)}
      <label class="field"><span>Start date ${REQ}</span>
        <input name="startDate" type="date" value="${d.startDate}" required></label>
      ${g.type === 'sankalpa' ? `<label class="field"><span>Days ${REQ}</span>
        <input name="days" type="number" min="1" max="365" inputmode="numeric" value="${d.days}" required></label>` : ''}
      ${g.type === 'smart' ? `<label class="field"><span>Deadline ${REQ}</span>
        <input name="endDate" type="date" value="${d.endDate}" required></label>` : ''}
      ${g.type === 'habit' ? `<p class="muted form-hint">A habit is always ${L.HABIT_DAYS} days.</p>` : ''}
      <p class="error" data-error hidden></p>
    </form>`;
  openModal({
    title: 'Redo this journey',
    body,
    footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" form="redo-form" type="submit">${icon('rotate-ccw')}Start again</button>`,
    onMount: (w, close) => {
      const form = w.querySelector('#redo-form');
      const errBox = w.querySelector('[data-error]');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.hidden = true;
        const fd = new FormData(form);
        try {
          const data = L.redoData(g, {
            fromMiss,
            startDate: fd.get('startDate'),
            days: fd.get('days'),
            endDate: fd.get('endDate'),
            why: fd.get('why'),
            description: fd.get('description'),
            order: L.nextOrder(state.goals),
          });
          const id = await db.createGoal(state.user.uid, data);
          close();
          location.hash = `#/goal/${encodeURIComponent(id)}`;
          toast(`${g.title} is back on your journeys`, 'success');
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        }
      });
    },
  });
}

// Edit: every field that the user could fill in when creating the journey.
// Habits keep their 66 days. A sankalpa's length, and a SMART goal's dates and plan, can all change.
function openGoalSettings(g) {
  if (!g) return;
  const isSmart = g.type === 'smart' && g.smart;
  const hasCheckins = Object.keys(g.checkins || {}).length > 0;
  // Habits and sankalpas keep their grid by day, so the start date locks after the first check-in.
  // SMART goals keep their numbers by date, so their dates and plan stay editable.
  const startEditable = isSmart || (g.status === 'active' && !hasCheckins);
  // Only what the journey cannot work without is required: a sankalpa's days, and a SMART goal's days or deadline.
  const lengthField = g.type === 'habit' ? '' : `
    <label class="field"><span>Days${g.type === 'sankalpa' || isSmart ? ` ${REQ}` : ''}</span>
      <input name="days" type="number" min="1" max="365" inputmode="numeric" value="${g.targetDays}"></label>`;

  const body = `
    <form id="edit-form" class="form" novalidate>
      <label class="field"><span>${esc(L.TYPE_LABEL[g.type] || 'Habit')}</span>
        <input name="title" maxlength="80" value="${esc(g.title)}"></label>
      ${descriptionFieldHTML(g.description || '', false, isSmart ? { markdown: !!g.descMarkdown } : {})}
      ${whyFieldHTML(g.why || '', false)}
      <div class="field-row">
        <label class="field"><span>Start date${startEditable ? '' : ' <small class="muted">(locked after the first check-in)</small>'}</span>
          <input name="startDate" type="date" value="${esc(g.attemptStart)}" ${startEditable ? '' : 'disabled'}></label>
        ${g.type === 'habit' ? '' : lengthField}
      </div>
      ${nextMorningFieldHTML(L.isNextMorning(g))}
      ${isSmart ? `
        <label class="field"><span>Deadline ${REQ}</span>
          <small class="muted field-hint">Fill one. The other follows.</small>
          <input name="endDate" type="date" value="${esc(g.smart.endDate)}"></label>
                ${smartFieldsHTML(g.smart, false)}
        ${planHTML(g.smart.plan || [], false, !!g.smart.notes)}` : ''}
      <div class="field"><span>Icon</span>${iconDropdown(g.icon)}</div>
      <div class="field"><span>Colour</span>${colorDropdown(g.color)}</div>
      <p class="error" data-error hidden></p>
      <div class="danger-zone">
        <div><strong>Abandon this journey</strong><small class="muted">It moves to Not accomplished. Nothing is deleted.</small></div>
        <button type="button" class="btn danger sm" data-abandon>Abandon</button>
      </div>
      ${g.status === 'completed' ? '' : `<div class="danger-zone">
        <div><strong>Delete this journey</strong><small class="muted">It moves to Deleted, with its history. You can redo it from there.</small></div>
        <button type="button" class="btn danger sm" data-delete>Delete</button>
      </div>`}
    </form>`;
  openModal({
    title: 'Edit journey',
    body,
    footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" form="edit-form" type="submit">Save</button>`,
    onMount: (w, close) => {
      const form = w.querySelector('#edit-form');
      const errBox = w.querySelector('[data-error]');
      wireDropdowns(w);
      wirePlan(w);
      // SMART goals: fill the days or the deadline, and the other one follows.
      if (isSmart) {
        form.addEventListener('input', (e) => {
          const startVal = form.querySelector('[name="startDate"]').value;
          const daysEl = form.querySelector('[name="days"]');
          const endEl = form.querySelector('[name="endDate"]');
          if (!startVal) return;
          if (e.target === daysEl) {
            const n = Math.floor(Number(daysEl.value));
            if (n >= 1 && n <= L.SMART_MAX_DAYS) endEl.value = L.addDays(startVal, n - 1);
          } else if (e.target === endEl && endEl.value) {
            try { daysEl.value = L.smartLength(startVal, endEl.value); } catch { /* deadline before start: leave the days */ }
          }
        });
      }
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.hidden = true;
        const fd = new FormData(form);
        try {
          // A blank title keeps the current name; blank text parts, plan, icon and colour are allowed.
          const title = L.titleCase(String(fd.get('title') || '').trim()).slice(0, 80) || g.title;
          const fields = {
            title,
            description: L.optionalText(fd.get('description'), 1000),
            why: L.optionalText(fd.get('why'), 500),
            ...(isSmart ? { descMarkdown: fd.get('descMarkdown') === 'on' } : {}),
            icon: fd.get('icon') || g.icon,
            color: fd.get('color') || g.color,
          };
          // A blank start date keeps the current one (it is never reset to today).
          if (startEditable && String(fd.get('startDate') || '').trim()) {
            fields.attemptStart = L.normalizeStartDate(fd.get('startDate'));
          }
          if (g.type === 'sankalpa') fields.targetDays = L.cleanSankalpaDays(g, fd.get('days'));
          fields.nextMorning = fd.get('nextMorning') === 'next';
          if (isSmart) {
            const start = fields.attemptStart || g.attemptStart;
            const daysText = String(fd.get('days') ?? '').trim();
            const dayCountChanged = daysText !== '' && Math.floor(Number(daysText)) !== g.targetDays;
            // Changing the days moves the deadline. Otherwise a given deadline stands, and with no deadline the days are used.
            // Blank days and blank deadline is the one case that fails: resolveSmartEnd says what is missing.
            const end = dayCountChanged || !String(fd.get('endDate') || '').trim()
              ? L.resolveSmartEnd(start, { days: daysText })
              : L.normalizeEndDate(fd.get('endDate'), start);
            const parts = L.cleanSmart(Object.fromEntries(L.SMART_FIELDS.map((f) => [f.key, fd.get(f.key)])), { optional: true });
            fields.smart = {
              ...parts,
              plan: L.cleanPlan(planFromForm(fd), { optional: true }),
              notes: fd.get('smartNotes') === 'on',
              endDate: end,
            };
            fields.targetDays = L.smartLength(start, end);
          }
          await db.updateGoalDetails(state.user.uid, g.id, fields);
          close();
          toast('Saved', 'success');
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        }
      });
      w.querySelector('[data-abandon]').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Abandon this journey?',
          message: `"${esc(g.title)}" will be closed and listed under Not accomplished. Your progress is kept.`,
          confirmLabel: 'Abandon',
          danger: true,
        });
        if (!ok) return;
        try {
          await db.abandon(state.user.uid, g.id);
          close();
          location.hash = '#/journeys';
          toast('Journey closed and recorded', 'info');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
      w.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Delete this journey?',
          message: `"${esc(g.title)}" moves to Deleted. Its history is kept, and you can redo it from there.`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        try {
          await db.softDeleteGoal(state.user.uid, g.id);
          close();
          location.hash = '#/journeys';
          toast('Journey moved to Deleted', 'info');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  });
}

function openAccount() {
  const u = state.user;
  openModal({
    title: 'Account',
    body: `
      <div class="account">
        <div class="avatar">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="">` : icon('user-round')}</div>
        <div><strong>${esc(u.displayName || 'Signed in')}</strong><small class="muted">${esc(u.email || '')}</small></div>
      </div>
      <div class="menu">
        <button class="menu-item" data-action="rewards">${icon('gift')}<div><strong>Rewards</strong></div></button>
        <button class="menu-item" data-action="export">${icon('download')}<div><strong>Export my data</strong></div></button>
        <button class="menu-item danger-text" data-action="signout">${icon('log-out')}<div><strong>Sign out</strong></div></button>
      </div>`,
  });
}

// ---------- rewards: a prize, the journeys that earn it, and a claim once they are all accomplished ----------

// The open Rewards panel: its element, and whether it shows the list or the form for one reward.
const rewardUI = { wrap: null, mode: 'list', editId: null, expanded: new Set() };

function openRewards() {
  rewardUI.mode = 'list';
  rewardUI.editId = null;
  openModal({
    title: 'Rewards',
    wide: true,
    body: '<div class="rewards-body"></div>',
    onMount: (wrap) => {
      rewardUI.wrap = wrap;
      wrap.addEventListener('click', onRewardsClick);
      wrap.addEventListener('submit', onRewardsSubmit);
      wrap.addEventListener('change', onRewardsChange);
      wrap.addEventListener('input', onRewardsInput);
      // Enter in the gift box adds the gift, rather than saving the whole reward.
      wrap.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('[data-pkg-draft]')) {
          e.preventDefault();
          addPackageItem(e.target.closest('form'));
        }
      });
      paintRewards({ force: true });
    },
    onClose: () => { rewardUI.wrap = null; },
  });
}

// Redraws the open panel. The form is left alone while it is open, so what is typed is never lost.
function paintRewards({ force = false } = {}) {
  const body = rewardUI.wrap?.querySelector('.rewards-body');
  if (!body || (!force && rewardUI.mode === 'form')) return;
  body.innerHTML = rewardUI.mode === 'form' ? rewardFormHTML() : rewardsListHTML();
  // The entrance animation plays only after a deliberate change (opening, saving, claiming), not on each refresh.
  body.classList.toggle('enter', force);
  refreshIcons();
}

function rewardsListHTML() {
  const open = state.rewards.filter((r) => !r.claimedAt);
  const claimed = state.rewards
    .filter((r) => r.claimedAt)
    .sort((a, b) => String(b.claimedAt).localeCompare(String(a.claimedAt)));
  const claimedRows = claimed.map((r, i) => `
    <div class="reward-done" style="--i:${i}">
      ${icon('package-open')}
      <span class="reward-done-title">${esc(r.title)}</span>
      <small>${esc(fmtDate(String(r.claimedAt).slice(0, 10)))}</small>
      <button class="icon-btn reward-del" data-action="rw-delete" data-id="${esc(r.id)}" aria-label="Delete ${esc(r.title)}">${icon('trash-2')}</button>
    </div>`).join('');
  return `
    <header class="reward-hero">
      <p class="reward-hero-sub">Pick a treat for yourself, attach the journeys that earn it, and open it when they are all done.</p>
      <button class="btn primary reward-new" data-action="rw-new">${icon('plus')}New reward</button>
    </header>
    ${open.length
      ? `<div class="reward-list">${open.map((r, i) => rewardCardHTML(r, i)).join('')}</div>`
      : `<div class="reward-empty">
          <div class="reward-empty-orb">${icon('gift')}</div>
          <h3>No rewards yet</h3>
          <p class="muted">Add a reward, and it will show how close you are to opening it.</p>
        </div>`}
    ${claimed.length ? `<section class="reward-claimed"><h3 class="reward-claimed-title">${icon('package-open')}Opened rewards</h3>${claimedRows}</section>` : ''}`;
}

// A reward's look is three choices: its icon, how it moves, and its colours. Each reward saves its own choices.
// Grouped by the ways people celebrate. The first 8 must stay first and in this order (see LEGACY_LOOKS).
const REWARD_ICONS = [
  { key: 'gift', icon: 'gift', label: 'Gift', group: 'Classic Prizes' },
  { key: 'box', icon: 'package', label: 'Box', group: 'Classic Prizes' },
  { key: 'crown', icon: 'crown', label: 'Crown', group: 'Marking the Moment' },
  { key: 'award', icon: 'award', label: 'Award', group: 'Marking the Moment' },
  { key: 'trophy', icon: 'trophy', label: 'Trophy', group: 'Marking the Moment' },
  { key: 'medal', icon: 'medal', label: 'Medal', group: 'Marking the Moment' },
  { key: 'ticket', icon: 'ticket', label: 'Ticket', group: 'Experiences' },
  { key: 'party', icon: 'party-popper', label: 'Party', group: 'Friends & Family' },
  // Food and drinks
  { key: 'dinner', icon: 'utensils-crossed', label: 'Dinner Out', group: 'Good Food' },
  { key: 'fine-dining', icon: 'utensils', label: 'Fine Dining', group: 'Good Food' },
  { key: 'pizza', icon: 'pizza', label: 'Pizza', group: 'Good Food' },
  { key: 'burger', icon: 'sandwich', label: 'Burger', group: 'Good Food' },
  { key: 'soup', icon: 'soup', label: 'Comfort Food', group: 'Good Food' },
  { key: 'croissant', icon: 'croissant', label: 'Brunch', group: 'Good Food' },
  { key: 'cake', icon: 'cake', label: 'Cake', group: 'Good Food' },
  { key: 'cake-slice', icon: 'cake-slice', label: 'Cake Slice', group: 'Good Food' },
  { key: 'dessert', icon: 'dessert', label: 'Dessert', group: 'Good Food' },
  { key: 'ice-cream', icon: 'ice-cream-cone', label: 'Ice Cream', group: 'Good Food' },
  { key: 'candy', icon: 'candy', label: 'Candy', group: 'Good Food' },
  { key: 'cookie', icon: 'cookie', label: 'Cookie', group: 'Good Food' },
  { key: 'coffee', icon: 'coffee', label: 'Coffee', group: 'Good Food' },
  { key: 'soda', icon: 'cup-soda', label: 'Milkshake', group: 'Good Food' },
  { key: 'wine', icon: 'wine', label: 'Wine', group: 'Good Food' },
  { key: 'cocktail', icon: 'martini', label: 'Cocktail', group: 'Good Food' },
  { key: 'beer', icon: 'beer', label: 'Beer', group: 'Good Food' },
  // Long drives
  { key: 'car', icon: 'car', label: 'Car', group: 'Long Drives' },
  { key: 'road-trip', icon: 'car-front', label: 'Road Trip', group: 'Long Drives' },
  { key: 'full-tank', icon: 'fuel', label: 'Full Tank', group: 'Long Drives' },
  { key: 'caravan', icon: 'caravan', label: 'Caravan', group: 'Long Drives' },
  { key: 'route', icon: 'map-pinned', label: 'Scenic Route', group: 'Long Drives' },
  { key: 'compass', icon: 'compass', label: 'Compass', group: 'Long Drives' },
  { key: 'bike', icon: 'bike', label: 'Bike Ride', group: 'Long Drives' },
  // Trips and getaways
  { key: 'plane', icon: 'plane', label: 'Trip', group: 'Mini Vacations' },
  { key: 'take-off', icon: 'plane-takeoff', label: 'Take Off', group: 'Mini Vacations' },
  { key: 'luggage', icon: 'luggage', label: 'Luggage', group: 'Mini Vacations' },
  { key: 'hotel', icon: 'hotel', label: 'Hotel Stay', group: 'Mini Vacations' },
  { key: 'map', icon: 'map', label: 'Map', group: 'Mini Vacations' },
  { key: 'beach', icon: 'tree-palm', label: 'Beach', group: 'Mini Vacations' },
  { key: 'train', icon: 'train', label: 'Train Journey', group: 'Mini Vacations' },
  { key: 'cruise', icon: 'ship', label: 'Cruise', group: 'Mini Vacations' },
  { key: 'sailboat', icon: 'sailboat', label: 'Sailing', group: 'Mini Vacations' },
  // Love and romance
  { key: 'heart', icon: 'heart', label: 'Heart', group: 'Love & Romance' },
  { key: 'passion', icon: 'flame', label: 'Passion', group: 'Love & Romance' },
  { key: 'together', icon: 'heart-handshake', label: 'Together', group: 'Love & Romance' },
  { key: 'date-night', icon: 'wine', label: 'Date Night', group: 'Love & Romance' },
  { key: 'moon', icon: 'moon-star', label: 'Moon', group: 'Love & Romance' },
  { key: 'flower', icon: 'flower-2', label: 'Flowers', group: 'Love & Romance' },
  // Shopping
  { key: 'shopping', icon: 'shopping-bag', label: 'Shopping', group: 'Treat Yourself' },
  { key: 'cart', icon: 'shopping-cart', label: 'Shopping Spree', group: 'Treat Yourself' },
  { key: 'shirt', icon: 'shirt', label: 'Clothes', group: 'Treat Yourself' },
  { key: 'watch', icon: 'watch', label: 'Watch', group: 'Treat Yourself' },
  { key: 'gem', icon: 'gem', label: 'Jewellery', group: 'Treat Yourself' },
  { key: 'phone', icon: 'smartphone', label: 'Phone', group: 'Treat Yourself' },
  { key: 'laptop', icon: 'laptop', label: 'Laptop', group: 'Treat Yourself' },
  { key: 'headphones', icon: 'headphones', label: 'Headphones', group: 'Treat Yourself' },
  // Friends and family
  { key: 'friends', icon: 'users', label: 'Friends', group: 'Friends & Family' },
  // Rest and pampering
  { key: 'spa', icon: 'bath', label: 'Spa', group: 'Rest & Pampering' },
  { key: 'lazy-day', icon: 'sofa', label: 'Lazy Day', group: 'Rest & Pampering' },
  { key: 'sleep-in', icon: 'bed-double', label: 'Sleep In', group: 'Rest & Pampering' },
  { key: 'sparkles', icon: 'sparkles', label: 'Sparkles', group: 'Rest & Pampering' },
  // Experiences
  { key: 'movie', icon: 'clapperboard', label: 'Movie', group: 'Experiences' },
  { key: 'popcorn', icon: 'popcorn', label: 'Popcorn', group: 'Experiences' },
  { key: 'concert', icon: 'mic-vocal', label: 'Concert', group: 'Experiences' },
  { key: 'music', icon: 'music', label: 'Music', group: 'Experiences' },
  { key: 'theatre', icon: 'drama', label: 'Theatre', group: 'Experiences' },
  { key: 'fair', icon: 'ferris-wheel', label: 'Theme Park', group: 'Experiences' },
  // Hobbies
  { key: 'game', icon: 'gamepad-2', label: 'Gaming', group: 'Hobbies' },
  { key: 'guitar', icon: 'guitar', label: 'Guitar', group: 'Hobbies' },
  { key: 'book', icon: 'book-open', label: 'Book', group: 'Hobbies' },
  { key: 'camera', icon: 'camera', label: 'Camera', group: 'Hobbies' },
  { key: 'palette', icon: 'palette', label: 'Art', group: 'Hobbies' },
  { key: 'paintbrush', icon: 'paintbrush', label: 'Painting', group: 'Hobbies' },
  // Outdoors
  { key: 'mountain', icon: 'mountain', label: 'Mountains', group: 'Outdoors' },
  { key: 'forest', icon: 'tree-pine', label: 'Forest', group: 'Outdoors' },
  { key: 'tent', icon: 'tent', label: 'Camping', group: 'Outdoors' },
  { key: 'sea', icon: 'waves', label: 'Sea', group: 'Outdoors' },
  { key: 'sunset', icon: 'sunset', label: 'Sunset', group: 'Outdoors' },
  { key: 'binoculars', icon: 'binoculars', label: 'Exploring', group: 'Outdoors' },
  { key: 'fishing', icon: 'fish', label: 'Fishing', group: 'Outdoors' },
  { key: 'snow', icon: 'snowflake', label: 'Snow', group: 'Outdoors' },
  { key: 'rainbow', icon: 'rainbow', label: 'Rainbow', group: 'Outdoors' },
  // Marking the moment
  { key: 'star', icon: 'star', label: 'Star', group: 'Marking the Moment' },
  { key: 'ribbon', icon: 'ribbon', label: 'Ribbon', group: 'Marking the Moment' },
  { key: 'photos', icon: 'images', label: 'Photos', group: 'Marking the Moment' },
  { key: 'journal', icon: 'notebook-pen', label: 'Journal', group: 'Marking the Moment' },
  { key: 'rocket', icon: 'rocket', label: 'Rocket', group: 'Marking the Moment' },
];
// The order the icon groups are listed in.
const REWARD_ICON_GROUPS = ['Classic Prizes', 'Good Food', 'Long Drives', 'Mini Vacations', 'Love & Romance', 'Treat Yourself',
  'Friends & Family', 'Rest & Pampering', 'Experiences', 'Hobbies', 'Outdoors', 'Marking the Moment'];

const REWARD_ANIMS = [
  { key: 'bob', cls: 'anim-bob', label: 'Bob' },
  { key: 'spin', cls: 'anim-spin', label: 'Spin' },
  { key: 'pulse', cls: 'anim-pulse', label: 'Pulse' },
  { key: 'wobble', cls: 'anim-wobble', label: 'Wobble' },
  { key: 'hop', cls: 'anim-hop', label: 'Hop' },
  { key: 'swing', cls: 'anim-swing', label: 'Swing' },
  { key: 'flip', cls: 'anim-flip', label: 'Flip' },
  { key: 'float', cls: 'anim-float', label: 'Float' },
  { key: 'levitate', cls: 'anim-levitate', label: 'Levitate' },
  { key: 'breathe', cls: 'anim-breathe', label: 'Breathe' },
  { key: 'heartbeat', cls: 'anim-heartbeat', label: 'Heartbeat' },
  { key: 'bounce', cls: 'anim-bounce', label: 'Bounce' },
  { key: 'jelly', cls: 'anim-jelly', label: 'Jelly' },
  { key: 'tada', cls: 'anim-tada', label: 'Ta-da' },
  { key: 'sway', cls: 'anim-sway', label: 'Sway' },
  { key: 'tilt', cls: 'anim-tilt', label: '3D Tilt' },
  { key: 'orbit', cls: 'anim-orbit', label: 'Orbit' },
  { key: 'shimmer', cls: 'anim-shimmer', label: 'Shimmer' },
  { key: 'ripple', cls: 'anim-ripple', label: 'Ripple' },
  { key: 'glow', cls: 'anim-glow', label: 'Glow' },
  { key: 'still', cls: 'anim-still', label: 'Still' },
  { key: 'drive', cls: 'anim-drive', label: 'Cruising (Long Drive)' },
  { key: 'take-off', cls: 'anim-takeoff', label: 'Take Off (Trip)' },
  { key: 'waves', cls: 'anim-waves', label: 'On the Waves (Beach)' },
  { key: 'savour', cls: 'anim-savour', label: 'Savour (Good Food)' },
  { key: 'cheers', cls: 'anim-cheers', label: 'Cheers (Drinks)' },
  { key: 'flutter', cls: 'anim-flutter', label: 'Flutter (Romance)' },
  { key: 'dance', cls: 'anim-dance', label: 'Dance (Party)' },
  { key: 'unwind', cls: 'anim-unwind', label: 'Unwind (Rest)' },
  { key: 'firework', cls: 'anim-firework', label: 'Firework (Big Win)' },
];
// Pastel colours that glow on the dark background. The keys are kept, so rewards saved earlier keep their colour.
const REWARD_COLOURS = [
  { key: 'violet', label: 'Lavender', from: '#c4b5fd', to: '#f0abfc', spark: '#f5d0fe' },
  { key: 'gold', label: 'Butter', from: '#fde68a', to: '#fcd34d', spark: '#fef9c3' },
  { key: 'rose', label: 'Rose', from: '#f9a8d4', to: '#fda4af', spark: '#fce7f3' },
  { key: 'emerald', label: 'Mint', from: '#6ee7b7', to: '#5eead4', spark: '#ccfbf1' },
  { key: 'sky', label: 'Sky', from: '#7dd3fc', to: '#a5b4fc', spark: '#e0f2fe' },
  { key: 'coral', label: 'Peach', from: '#fdba74', to: '#fda4af', spark: '#ffedd5' },
  { key: 'teal', label: 'Aqua', from: '#67e8f9', to: '#93c5fd', spark: '#cffafe' },
  { key: 'lilac', label: 'Lilac', from: '#d8b4fe', to: '#c4b5fd', spark: '#f3e8ff' },
  { key: 'periwinkle', label: 'Periwinkle', from: '#a5b4fc', to: '#c7d2fe', spark: '#e0e7ff' },
  { key: 'blush', label: 'Blush', from: '#fbcfe8', to: '#fecdd3', spark: '#fff1f2' },
  { key: 'cotton-candy', label: 'Cotton Candy', from: '#f9a8d4', to: '#a5f3fc', spark: '#fdf4ff' },
  { key: 'sunset', label: 'Sunset', from: '#fdba74', to: '#f9a8d4', spark: '#fff7ed' },
  { key: 'apricot', label: 'Apricot', from: '#fed7aa', to: '#fdba74', spark: '#fff7ed' },
  { key: 'lemon', label: 'Lemon', from: '#fef08a', to: '#bef264', spark: '#fefce8' },
  { key: 'champagne', label: 'Champagne', from: '#fef3c7', to: '#fcd34d', spark: '#fffbeb' },
  { key: 'rose-gold', label: 'Rose Gold', from: '#fecaca', to: '#fcd34d', spark: '#fff1f2' },
  { key: 'pistachio', label: 'Pistachio', from: '#d9f99d', to: '#86efac', spark: '#f7fee7' },
  { key: 'matcha', label: 'Matcha', from: '#bbf7d0', to: '#a3e635', spark: '#f0fdf4' },
  { key: 'seafoam', label: 'Seafoam', from: '#99f6e4', to: '#a7f3d0', spark: '#f0fdfa' },
  { key: 'ice', label: 'Ice', from: '#e0f2fe', to: '#a5f3fc', spark: '#ffffff' },
  { key: 'aurora', label: 'Aurora', from: '#6ee7b7', to: '#c4b5fd', spark: '#ecfeff' },
  { key: 'opal', label: 'Opal', from: '#a5f3fc', to: '#f5d0fe', spark: '#ffffff' },
  { key: 'pearl', label: 'Pearl', from: '#f1f5f9', to: '#ddd6fe', spark: '#ffffff' },
  { key: 'sunset-drive', label: 'Sunset Drive', from: '#fdba74', to: '#c4b5fd', spark: '#ffedd5' },
  { key: 'night-drive', label: 'Night Drive', from: '#a5b4fc', to: '#f0abfc', spark: '#e0e7ff' },
  { key: 'ocean', label: 'Ocean', from: '#7dd3fc', to: '#5eead4', spark: '#ecfeff' },
  { key: 'sandy-beach', label: 'Sandy Beach', from: '#fde68a', to: '#fed7aa', spark: '#fffbeb' },
  { key: 'candlelight', label: 'Candlelight', from: '#fde68a', to: '#fda4af', spark: '#fff7ed' },
  { key: 'rose-wine', label: 'Rosé', from: '#fda4af', to: '#f0abfc', spark: '#fff1f2' },
  { key: 'strawberry', label: 'Strawberry Cream', from: '#fecdd3', to: '#fef3c7', spark: '#fff1f2' },
  { key: 'berry', label: 'Berry', from: '#f9a8d4', to: '#c4b5fd', spark: '#fdf4ff' },
  { key: 'spa', label: 'Spa', from: '#a7f3d0', to: '#ddd6fe', spark: '#f0fdfa' },
  { key: 'forest', label: 'Forest Mist', from: '#86efac', to: '#5eead4', spark: '#f0fdf4' },
];
// Sparkles: what twinkles around the gift.
const REWARD_SPARKLES = [
  { key: 'stars', label: 'Stars' },
  { key: 'hearts', label: 'Hearts (Romance)' },
  { key: 'confetti', label: 'Confetti (Party)' },
  { key: 'fireworks', label: 'Fireworks (Big Win)' },
  { key: 'bubbles', label: 'Bubbles (Spa, Drinks)' },
  { key: 'fireflies', label: 'Fireflies (Night Drive)' },
  { key: 'petals', label: 'Petals (Love, Rest)' },
  { key: 'steam', label: 'Steam (Good Food)' },
  { key: 'snow', label: 'Snow (Mountains)' },
  { key: 'sunbeams', label: 'Sunbeams (Beach, Outdoors)' },
];
// Rewards saved before they had their own look get one from these first options, so they never change.
const LEGACY_LOOKS = { icons: 8, anims: 7, colours: 7 };
const pickOption = (list, key) => list.find((x) => x.key === key) || null;

// The look for a set of choices, resolved to what the page needs.
function lookFor(st) {
  const ic = pickOption(REWARD_ICONS, st.icon);
  const an = pickOption(REWARD_ANIMS, st.anim);
  const co = pickOption(REWARD_COLOURS, st.color);
  const sp = pickOption(REWARD_SPARKLES, st.sparkle) || REWARD_SPARKLES[0];
  return {
    icon: ic.icon, anim: an.cls, from: co.from, to: co.to, spark: co.spark, fx: sp.key,
    style: { icon: ic.key, anim: an.key, color: co.key, sparkle: sp.key },
  };
}

// A starting look by position, so the first few rewards differ in colour, icon and motion.
function styleForIndex(i) {
  return {
    icon: REWARD_ICONS[i % LEGACY_LOOKS.icons].key,
    anim: REWARD_ANIMS[i % LEGACY_LOOKS.anims].key,
    color: REWARD_COLOURS[i % LEGACY_LOOKS.colours].key,
  };
}

// Rewards saved before the choices existed get a look from their old number or their id, so they never change.
function rewardLook(r) {
  const st = r.style;
  if (st && pickOption(REWARD_ICONS, st.icon) && pickOption(REWARD_ANIMS, st.anim) && pickOption(REWARD_COLOURS, st.color)) {
    return lookFor(st);
  }
  let n = Number.isInteger(r.look) ? r.look : 0;
  if (!Number.isInteger(r.look)) {
    for (const ch of String(r.id)) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return lookFor(styleForIndex(n));
}

// The look a new reward starts with: the first colour that no other reward uses yet.
function defaultRewardStyle(rewards) {
  const used = new Set(rewards.map((r) => rewardLook(r).style.color));
  const free = REWARD_COLOURS.find((c) => !used.has(c.key));
  const st = styleForIndex(rewards.length);
  return free ? { ...st, color: free.key } : st;
}

// Sparkles around each gift: [left %, top %, delay in seconds, size in px, twinkle length in seconds].
const REWARD_SPARKS = [
  [6, 14, 0, 14, 2.6], [88, 6, 0.8, 11, 2.2], [96, 56, 1.5, 9, 2.9], [4, 70, 2.1, 10, 2.4],
  [50, -4, 0.4, 12, 3.1], [56, 102, 1.2, 8, 2.3], [24, -2, 1.8, 6, 1.9], [76, 96, 2.5, 7, 2.7],
];
// Tiny glints that drift up and fade: [left %, top %, delay in seconds].
const REWARD_GLINTS = [[18, 60, 0], [80, 70, 1.1], [36, 84, 2.0], [64, 30, 0.6], [90, 34, 1.6]];

const lookVars = (look) => `--from:${look.from};--to:${look.to};--spark:${look.spark}`;

// The moving icon, with its sparkles. Used on each reward and in the live preview.
function rewardStageHTML(look) {
  const sparks = REWARD_SPARKS.map(([x, y, d, s, t], k) => `<i class="reward-spark" style="left:${x}%;top:${y}%;--s:${s}px;--k:${k};animation-delay:${d}s;animation-duration:${t}s"></i>`).join('')
    + REWARD_GLINTS.map(([x, y, d]) => `<i class="reward-glint" style="left:${x}%;top:${y}%;animation-delay:${d}s"></i>`).join('');
  return `
    <div class="reward-stage fx-${look.fx || 'stars'}">
      <span class="reward-glow" aria-hidden="true"></span>
      ${sparks}
      <div class="reward-orb ${look.anim}">${icon(look.icon)}</div>
    </div>`;
}

function rewardCardHTML(r, i = 0) {
  const p = L.rewardProgress(r, state.goals);
  const look = rewardLook(r);
  const expanded = rewardUI.expanded.has(r.id);
  const statusOf = (j) => {
    if (j.done) return 'Accomplished';
    if (!j.goal) return 'No longer on record';
    return j.goal.status === 'active' ? `${j.pct}% · In progress` : 'Not accomplished';
  };
  // The attached journeys in the standard order; ones no longer on record go last.
  const rank = new Map(typeOrdered(p.journeys.map((j) => j.goal).filter(Boolean)).map((g, k) => [g.id, k]));
  const ordered = [...p.journeys].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  const rows = ordered.map((j) => `
    <li class="${j.done ? 'done' : ''}">${icon(j.done ? 'circle-check' : 'circle')}<span>${esc(j.goal?.title || 'Removed journey')}</span><small>${statusOf(j)}</small></li>`).join('');
  const countText = p.total
    ? `${p.done} of ${p.total} ${p.total === 1 ? 'journey' : 'journeys'} accomplished`
    : 'No journeys attached yet';
  const moreLabel = expanded ? 'Hide journeys' : `Show ${p.total} ${p.total === 1 ? 'journey' : 'journeys'}`;
  const due = rewardDueDate(r);
  const today = L.todayStr();
  const late = !!due && !p.ready && due < today;
  const daysLeft = due ? L.diffDays(today, due) : null;
  const dueText = !due ? ''
    : late ? `Deadline passed on ${fmtDate(due)}`
      : daysLeft === 0 ? `Due today, ${fmtDate(due)}`
        : `Due ${fmtDate(due)} · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  return `
    <article class="reward-card${p.ready ? ' ready' : ''}${late ? ' late' : ''}" style="--i:${i};${lookVars(look)}">
      ${rewardStageHTML(look)}
      <h3 class="reward-title">${esc(r.title)}</h3>
      ${rewardStackHTML(r.items || [])}
      ${r.note ? `<p class="reward-note">${esc(r.note)}</p>` : ''}
      <div class="reward-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-label="Progress toward ${esc(r.title)}">
        ${p.total ? `<div class="reward-pcts">
          <span class="reward-pct"><b>${fmtPct(p.exactPct)}</b> so far</span>
          <span class="reward-today${p.todayPct > 0 ? ' up' : ''}"><b>+${fmtPct(p.todayPct)}</b> today</span>
        </div>` : ''}
        <div class="reward-bar"><span style="width:${p.pct}%"></span></div>
        <small class="reward-count">${p.ready ? 'Ready to open!' : countText}</small>
        ${dueText ? `<small class="reward-due${late ? ' late' : ''}">${dueText}</small>` : ''}
      </div>
      ${p.total ? `
      <button type="button" class="reward-more${expanded ? ' open' : ''}" data-action="rw-more" data-id="${esc(r.id)}" aria-expanded="${expanded}">
        <span>${moreLabel}</span>${icon('chevron-down')}
      </button>
      <div class="reward-drawer${expanded ? ' open' : ''}">
        <div class="reward-drawer-inner"><ul class="reward-journeys">${rows}</ul></div>
      </div>` : ''}
      <div class="reward-foot">
        ${p.ready ? `<button class="btn primary reward-claim" data-action="rw-claim" data-id="${esc(r.id)}">${icon('party-popper')}Open and claim</button>` : ''}
        <button class="btn ghost sm" data-action="rw-edit" data-id="${esc(r.id)}">${icon('pencil')}Edit</button>
        <button class="btn ghost sm" data-action="rw-delete" data-id="${esc(r.id)}">${icon('trash-2')}Delete</button>
      </div>
    </article>`;
}

// ---------- auto-picking a reward's look from its name, note and gifts ----------
// Each theme is a matching animation, colour and sparkles.
const LOOK_THEMES = {
  drive: { anim: 'drive', color: 'sunset-drive', sparkle: 'fireflies' },
  trip: { anim: 'take-off', color: 'sky', sparkle: 'stars' },
  beach: { anim: 'waves', color: 'ocean', sparkle: 'sunbeams' },
  food: { anim: 'savour', color: 'candlelight', sparkle: 'steam' },
  sweet: { anim: 'jelly', color: 'strawberry', sparkle: 'stars' },
  drinks: { anim: 'cheers', color: 'rose-wine', sparkle: 'bubbles' },
  romance: { anim: 'flutter', color: 'berry', sparkle: 'hearts' },
  passion: { anim: 'heartbeat', color: 'candlelight', sparkle: 'petals' },
  shopping: { anim: 'tada', color: 'rose-gold', sparkle: 'stars' },
  tech: { anim: 'tilt', color: 'periwinkle', sparkle: 'stars' },
  party: { anim: 'dance', color: 'cotton-candy', sparkle: 'confetti' },
  rest: { anim: 'unwind', color: 'spa', sparkle: 'bubbles' },
  show: { anim: 'tada', color: 'night-drive', sparkle: 'stars' },
  hobby: { anim: 'jelly', color: 'pistachio', sparkle: 'stars' },
  outdoors: { anim: 'float', color: 'forest', sparkle: 'sunbeams' },
  snow: { anim: 'float', color: 'ice', sparkle: 'snow' },
  win: { anim: 'firework', color: 'champagne', sparkle: 'fireworks' },
};
// Words to look for, the icon they mean, and its theme. More specific words come first.
const LOOK_RULES = [
  [/long drive|road ?trip|drive|driving|ride out/, 'road-trip', 'drive'],
  [/\bcar\b|\bsuv\b/, 'car', 'drive'],
  [/caravan|camper|\brv\b/, 'caravan', 'drive'],
  [/bike|cycling|cycle|motorcycle/, 'bike', 'drive'],
  [/scenic|route|highway/, 'route', 'drive'],
  [/flight|\bfly\b|airport|plane/, 'take-off', 'trip'],
  [/hotel|resort|staycation|\bstay\b/, 'hotel', 'trip'],
  [/beach|island|coast|goa|maldives|bali/, 'beach', 'beach'],
  [/cruise|\bship\b/, 'cruise', 'beach'],
  [/sail|boat/, 'sailboat', 'beach'],
  [/\bsea\b|ocean|swim|scuba|snorkel/, 'sea', 'beach'],
  [/train/, 'train', 'trip'],
  [/vacation|holiday|getaway|\btrip\b|travel|tour|abroad|weekend away/, 'plane', 'trip'],
  [/fine dining|buffet|michelin/, 'fine-dining', 'food'],
  [/pizza/, 'pizza', 'food'],
  [/burger|sandwich|fries|shawarma/, 'burger', 'food'],
  [/biryani|soup|noodles|ramen|curry|thali|comfort food/, 'soup', 'food'],
  [/brunch|breakfast|croissant|bakery|pancake/, 'croissant', 'food'],
  [/ice ?cream|gelato|sundae/, 'ice-cream', 'sweet'],
  [/cake|birthday/, 'cake', 'sweet'],
  [/dessert|pastry|sweets?|chocolate|brownie|waffle/, 'dessert', 'sweet'],
  [/candy/, 'candy', 'sweet'],
  [/cookie/, 'cookie', 'sweet'],
  [/coffee|cafe|latte|cappuccino/, 'coffee', 'food'],
  [/shake|smoothie|juice|soda/, 'soda', 'sweet'],
  [/wine|champagne/, 'wine', 'drinks'],
  [/cocktail|drinks?|\bbar\b|\bpub\b|mocktail/, 'cocktail', 'drinks'],
  [/beer/, 'beer', 'drinks'],
  [/dinner|restaurant|\bdine\b|\bmeal\b|feast|lunch|food|eat out|treat myself to/, 'dinner', 'food'],
  [/\bsex\b|sexy|intima|sensual|passion|desire|hot night/, 'passion', 'passion'],
  [/date night|\bdate\b/, 'date-night', 'romance'],
  [/anniversary|together|couple/, 'together', 'romance'],
  [/flowers?|roses?|bouquet/, 'flower', 'romance'],
  [/romance|romantic|\blove\b|partner|wife|husband|girlfriend|boyfriend|kiss|cuddle/, 'heart', 'romance'],
  [/jewel|\bring\b|necklace|bracelet|earring|diamond|\bgold\b/, 'gem', 'shopping'],
  [/watch/, 'watch', 'shopping'],
  [/clothes|shirt|dress|outfit|jacket|shoes|sneakers|saree|kurta/, 'shirt', 'shopping'],
  [/iphone|phone/, 'phone', 'tech'],
  [/laptop|macbook|computer|\bpc\b|ipad|tablet/, 'laptop', 'tech'],
  [/headphones|earbuds|airpods|speaker/, 'headphones', 'tech'],
  [/shopping spree|\bspree\b/, 'cart', 'shopping'],
  [/shop|mall|\bbuy\b|amazon/, 'shopping', 'shopping'],
  [/party|celebrat|\bclub\b/, 'party', 'party'],
  [/friends|family|\bgang\b|reunion|hangout|get together/, 'friends', 'party'],
  [/spa\b|massage|sauna|bath/, 'spa', 'rest'],
  [/sleep|\bnap\b|lie in/, 'sleep-in', 'rest'],
  [/lazy|relax|chill|\brest\b|day off|unwind/, 'lazy-day', 'rest'],
  [/concert|\bgig\b|live show|festival/, 'concert', 'show'],
  [/theme park|amusement|disney|wonderla|\bfair\b/, 'fair', 'show'],
  [/theatre|theater|\bplay\b|stand ?up|comedy/, 'theatre', 'show'],
  [/movie|cinema|film|netflix|series|binge/, 'movie', 'show'],
  [/popcorn/, 'popcorn', 'show'],
  [/music|song|album|vinyl/, 'music', 'show'],
  [/game|gaming|playstation|ps5|xbox|console|nintendo/, 'game', 'hobby'],
  [/guitar|piano|instrument/, 'guitar', 'hobby'],
  [/\bbooks?\b|novel|kindle|reading/, 'book', 'hobby'],
  [/camera|photography|lens/, 'camera', 'hobby'],
  [/paint|\bart\b|sketch|canvas/, 'palette', 'hobby'],
  [/snow|\bski|manali|shimla|kashmir|gulmarg/, 'snow', 'snow'],
  [/trek|hike|hiking|mountain|hills?|himalaya/, 'mountain', 'outdoors'],
  [/camp/, 'tent', 'outdoors'],
  [/forest|jungle|nature|woods/, 'forest', 'outdoors'],
  [/safari|wildlife|explore/, 'binoculars', 'outdoors'],
  [/fishing|\bfish\b/, 'fishing', 'outdoors'],
  [/sunset|sunrise/, 'sunset', 'outdoors'],
  [/trophy|\bwin\b|award|achievement|milestone|promotion|graduat/, 'trophy', 'win'],
  [/journal|diary/, 'journal', 'win'],
  [/photos|album/, 'photos', 'win'],
];

/** The best look for the words typed: the name counts most, then the gifts, then the note. Null if nothing matches. */
function autoLook({ title = '', note = '', items = [] }) {
  const parts = [[title, 3], [items.join(' · '), 2], [note, 1]].map(([t, w]) => [String(t).toLowerCase(), w]);
  let best = null;
  LOOK_RULES.forEach(([re, iconKey, theme], order) => {
    let score = 0;
    for (const [t, w] of parts) if (re.test(t)) score += w;
    if (score && (!best || score > best.score)) best = { score, order, iconKey, theme };
  });
  if (!best) return null;
  return { icon: best.iconKey, ...LOOK_THEMES[best.theme] };
}

// Applies the auto-picked look to the drop-downs the user has not set by hand.
function applyAutoLook(form) {
  if (!form) return;
  const fd = new FormData(form);
  const look = autoLook({
    title: fd.get('title') || '',
    note: fd.get('note') || '',
    items: fd.getAll('item').concat(String(fd.get('draft') || '').trim() ? [fd.get('draft')] : []),
  });
  if (!look) return;
  let changed = false;
  for (const name of ['icon', 'anim', 'color', 'sparkle']) {
    const sel = form.querySelector(`select[name="${name}"]`);
    if (!sel || sel.dataset.manual || !look[name] || sel.value === look[name]) continue;
    if (![...sel.options].some((o) => o.value === look[name])) continue;
    sel.value = look[name];
    changed = true;
  }
  if (changed) refreshLookPreview(form, true);
}

// Redraws the preview from the four drop-downs.
function refreshLookPreview(form, auto = false) {
  const fd = new FormData(form);
  const st = { icon: fd.get('icon'), anim: fd.get('anim'), color: fd.get('color'), sparkle: fd.get('sparkle') };
  if (!pickOption(REWARD_ICONS, st.icon) || !pickOption(REWARD_ANIMS, st.anim) || !pickOption(REWARD_COLOURS, st.color)) return;
  const preview = form.querySelector('[data-look-preview]');
  if (!preview) return;
  preview.outerHTML = lookPreviewHTML(lookFor(st), auto);
  refreshIcons();
}

// The three look choices in the form, each its own drop-down: icon, animation and colour.
function lookChoicesHTML(st, keep = false) {
  const manual = keep ? ' data-manual="1"' : '';
  const opt = (o, current) => `<option value="${o.key}"${o.key === current ? ' selected' : ''}>${o.label}</option>`;
  const select = (name, label, list, current) => `
    <label class="field look-field"><span>${label}</span>
      <select name="${name}"${manual}>${list.map((o) => opt(o, current)).join('')}</select>
    </label>`;
  // Icons are grouped by the ways people celebrate.
  const icons = REWARD_ICON_GROUPS.map((gname) => `<optgroup label="${gname}">${REWARD_ICONS.filter((o) => o.group === gname).map((o) => opt(o, st.icon)).join('')}</optgroup>`).join('');
  return `
    <div class="rw-look-opts">
      <label class="field look-field"><span>Icon</span><select name="icon"${manual}>${icons}</select></label>
      ${select('anim', 'Animation', REWARD_ANIMS, st.anim)}
      ${select('color', 'Colour', REWARD_COLOURS, st.color)}
      ${select('sparkle', 'Sparkles', REWARD_SPARKLES, st.sparkle || 'stars')}
    </div>`;
}

// The live preview at the top of the form. It follows the choices as they are changed.
function lookPreviewHTML(look, auto = false) {
  return `<div class="look-preview" data-look-preview style="${lookVars(look)}">${rewardStageHTML(look)}<p class="look-preview-name">${auto ? `${icon('wand-sparkles')}Picked for you` : 'Preview'}</p></div>`;
}

// A burst of confetti in the reward's own colours, over the Rewards panel.
function burstConfetti(look) {
  const wrap = rewardUI.wrap;
  if (!wrap) return;
  const colours = [look.from, look.to, look.spark, '#ffffff'];
  const layer = document.createElement('div');
  layer.className = 'reward-burst';
  layer.innerHTML = Array.from({ length: 48 }, (_, i) => {
    const a = Math.random() * Math.PI * 2;
    const d = 120 + Math.random() * 240;
    return `<span style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d - 70).toFixed(0)}px;--r:${Math.round(Math.random() * 720 - 360)}deg;--c:${colours[i % colours.length]};--delay:${(Math.random() * 0.15).toFixed(2)}s"></span>`;
  }).join('');
  wrap.appendChild(layer);
  setTimeout(() => layer.remove(), 1900);
}

// The day a reward is due: the deadline it was saved with, or else the end of its last journey.
// The gifts packed into a reward: one line in brackets, separated by commas.
function rewardStackHTML(items = []) {
  if (!items.length) return '';
  return `<p class="stack-text">(${items.map((t) => esc(t)).join(', ')})</p>`;
}

// The package field in the form: type a gift, press Add (or Enter), and each one appears as a row.
function packageFieldHTML(items = []) {
  return `
    <div class="pkg-field">
      <div class="pkg-add">
        <input type="text" name="draft" data-pkg-draft maxlength="${L.MAX_REWARD_ITEM_TITLE}" placeholder="For example, Dinner out">
        <button type="button" class="btn ghost sm" data-action="rw-item-add">${icon('plus')}Add</button>
      </div>
      <div class="pkg-list" data-pkg-list>${items.map(pkgRowHTML).join('')}</div>
    </div>`;
}

function pkgRowHTML(text) {
  return `<div class="pkg-row"><input type="hidden" name="item" value="${esc(text)}"><span>${esc(text)}</span><button type="button" class="icon-btn pkg-remove" data-action="rw-item-remove" aria-label="Remove ${esc(text)}">${icon('x')}</button></div>`;
}

// Adds the typed gift to the package list, if there is room and it is not empty.
function addPackageItem(form) {
  const input = form.querySelector('[data-pkg-draft]');
  const errBox = form.querySelector('[data-error]');
  const text = L.titleCase(String(input.value || '').trim());
  if (!text) return;
  if (form.querySelectorAll('input[name="item"]').length >= L.MAX_REWARD_ITEMS) {
    errBox.textContent = `A package holds up to ${L.MAX_REWARD_ITEMS} gifts.`;
    errBox.hidden = false;
    return;
  }
  form.querySelector('[data-pkg-list]').insertAdjacentHTML('beforeend', pkgRowHTML(text));
  input.value = '';
  errBox.hidden = true;
  applyAutoLook(form);
  input.focus();
}

function rewardDueDate(r) {
  return r.deadline || L.latestJourneyDeadline(r.goalIds || [], state.goals);
}

function deadlineHint(lastEnd) {
  return lastEnd
    ? `Last journey ends ${fmtDate(lastEnd)}. Can't be earlier.`
    : 'Set to when the last journey ends.';
}

function rewardFormHTML() {
  const editing = rewardUI.editId ? state.rewards.find((r) => r.id === rewardUI.editId) : null;
  const r = editing || { title: '', note: '', goalIds: [] };
  const lastEnd = L.latestJourneyDeadline(r.goalIds || [], state.goals) || '';
  const st = editing ? rewardLook(editing).style : defaultRewardStyle(state.rewards);
  const choices = L.rewardChoices(state.goals);
  // Grouped by type (habits, SMART goals, sankalpas); in progress first, then accomplished, each in the saved order.
  const pickRow = (g) => `
      <label class="check-row reward-pick">
        <input type="checkbox" name="goalIds" value="${esc(g.id)}"${r.goalIds.includes(g.id) ? ' checked' : ''}>
        <span>${icon(g.icon)}${esc(g.title)}</span>
        <small class="rw-status${g.status === 'completed' ? ' done' : ''}">${g.status === 'completed' ? 'Accomplished' : 'In progress'}</small>
      </label>`;
  const picks = choices.length
    ? L.TYPES.map((t) => {
      const ofType = choices.filter((g) => g.type === t);
      if (!ofType.length) return '';
      const list = [...L.sortByOrder(ofType.filter((g) => g.status === 'active')), ...L.sortByOrder(ofType.filter((g) => g.status !== 'active'))];
      return `<p class="reward-pick-type">${icon(TYPE_ICON[t])}<span>${TYPE_PLURAL[t]}</span></p>${list.map(pickRow).join('')}`;
    }).join('')
    : '<p class="muted">Start a journey first, then come back here to attach it to a reward.</p>';
  return `
    <form id="reward-form" class="form rw-form" novalidate>
      <section class="rw-card rw-look">
        ${lookPreviewHTML(lookFor(st))}
        ${lookChoicesHTML(st, !!editing)}
      </section>
      <section class="rw-card">
        <h3 class="rw-sec">${icon('gift')}Reward</h3>
        <label class="field"><span>Name ${REQ}</span>
          <input name="title" maxlength="${L.MAX_REWARD_TITLE}" placeholder="For example, a movie night" value="${esc(r.title)}" required></label>
        <label class="field"><span>Note</span>
          <input name="note" maxlength="${L.MAX_REWARD_NOTE}" placeholder="Optional" value="${esc(r.note || '')}"></label>
      </section>
      <section class="rw-card">
        <h3 class="rw-sec">${icon('package')}Gifts in this package</h3>
        ${packageFieldHTML(r.items || [])}
      </section>
      <section class="rw-card">
        <h3 class="rw-sec">${icon('route')}Journeys that earn it</h3>
        <div class="reward-picks">${picks}</div>
      </section>
      <section class="rw-card">
        <h3 class="rw-sec">${icon('calendar')}Deadline</h3>
        <label class="field">
          <input type="date" name="deadline" min="${esc(lastEnd)}" value="${esc(r.deadline || lastEnd)}" aria-label="Deadline">
          <small class="field-hint" data-deadline-hint>${deadlineHint(lastEnd)}</small></label>
      </section>
      <p class="error" data-error hidden></p>
      <div class="rw-actions">
        <button type="button" class="btn ghost" data-action="rw-back">Cancel</button>
        <button type="submit" class="btn primary">${icon('check')}Save reward</button>
      </div>
    </form>`;
}

// Keeps the live preview in step with the icon, movement and colour chosen in the form.
function onRewardsChange(e) {
  const form = e.target.closest('#reward-form');
  if (!form) return;
  // Picking journeys moves the deadline up to their last end, and never below it.
  if (e.target.name === 'goalIds') {
    const ids = [...form.querySelectorAll('input[name="goalIds"]:checked')].map((n) => n.value);
    const last = L.latestJourneyDeadline(ids, state.goals) || '';
    const input = form.querySelector('input[name="deadline"]');
    if (input) {
      input.min = last;
      if (last && (!input.value || input.value < last)) input.value = last;
      const hint = form.querySelector('[data-deadline-hint]');
      if (hint) hint.textContent = deadlineHint(last);
    }
    return;
  }
  if (e.target.matches('select[name="icon"], select[name="anim"], select[name="color"], select[name="sparkle"]')) {
    e.target.dataset.manual = '1';   // chosen by hand: auto-pick leaves it alone from now on
    refreshLookPreview(form);
  }
}

// Typing the name or note picks a look to match (only for the choices not set by hand).
function onRewardsInput(e) {
  if (e.target.matches('#reward-form input[name="title"], #reward-form input[name="note"], #reward-form [data-pkg-draft]')) {
    applyAutoLook(e.target.closest('form'));
  }
}

const newRewardId = () => (crypto.randomUUID
  ? crypto.randomUUID()
  : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

// Saves the whole rewards list. The panel updates at once; the cloud copy follows.
async function changeRewards(next, message, kind = 'info') {
  state.rewards = next;
  paintRewards({ force: true });
  toast(message, kind);
  try {
    await db.saveRewards(state.user.uid, next);
  } catch (err) {
    toast(err.message || 'Could not save the reward.', 'error');
  }
}

async function onRewardsClick(e) {
  const btn = e.target.closest('[data-action^="rw-"]');
  if (!btn) return;
  const { action } = btn.dataset;
  const id = btn.dataset.id;
  if (action === 'rw-new' || action === 'rw-edit') {
    rewardUI.mode = 'form';
    rewardUI.editId = action === 'rw-edit' ? id : null;
    paintRewards({ force: true });
    return;
  }
  if (action === 'rw-back') {
    rewardUI.mode = 'list';
    rewardUI.editId = null;
    paintRewards({ force: true });
    return;
  }
  if (action === 'rw-item-add') {
    addPackageItem(btn.closest('form'));
    return;
  }
  if (action === 'rw-item-remove') {
    const form = btn.closest('form');
    btn.closest('.pkg-row')?.remove();
    applyAutoLook(form);
    return;
  }
  if (action === 'rw-more') {
    // Opens or closes the journeys under one reward, in place, so the rest of the panel does not redraw.
    const card = btn.closest('.reward-card');
    const on = !rewardUI.expanded.has(id);
    if (on) rewardUI.expanded.add(id); else rewardUI.expanded.delete(id);
    card?.querySelector('.reward-drawer')?.classList.toggle('open', on);
    btn.classList.toggle('open', on);
    btn.setAttribute('aria-expanded', String(on));
    const n = card ? card.querySelectorAll('.reward-journeys li').length : 0;
    btn.querySelector('span').textContent = on ? 'Hide journeys' : `Show ${n} ${n === 1 ? 'journey' : 'journeys'}`;
    return;
  }
  const reward = state.rewards.find((r) => r.id === id);
  if (!reward) return;
  if (action === 'rw-claim') {
    // Only a reward whose journeys are all accomplished can be claimed.
    if (!L.rewardProgress(reward, state.goals).ready) return;
    // The gift opens with confetti, then the reward moves to the opened list.
    btn.disabled = true;
    btn.closest('.reward-card')?.classList.add('opening');
    burstConfetti(rewardLook(reward));
    await new Promise((resolve) => setTimeout(resolve, 650));
    const claimedAt = new Date().toISOString();
    await changeRewards(
      state.rewards.map((r) => (r.id === id ? { ...r, claimedAt } : r)),
      `Reward claimed: ${reward.title}`,
      'success',
    );
    return;
  }
  if (action === 'rw-delete') {
    const yes = await confirmDialog({
      title: 'Delete this reward?',
      message: `"${esc(reward.title)}" will be removed. Its journeys are kept.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (yes) await changeRewards(state.rewards.filter((r) => r.id !== id), 'Reward deleted');
  }
}

function onRewardsSubmit(e) {
  if (!e.target.matches('#reward-form')) return;
  e.preventDefault();
  const form = e.target;
  const errBox = form.querySelector('[data-error]');
  errBox.hidden = true;
  const fd = new FormData(form);
  let data;
  try {
    data = L.cleanReward({
      title: fd.get('title'),
      note: fd.get('note'),
      goalIds: fd.getAll('goalIds'),
      items: [...fd.getAll('item'), fd.get('draft') || ''],   // a gift typed but not yet added is kept too
    });
    data.deadline = L.cleanDeadline(fd.get('deadline'), data.goalIds, state.goals);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
    return;
  }
  const st = { icon: fd.get('icon'), anim: fd.get('anim'), color: fd.get('color'), sparkle: fd.get('sparkle') || 'stars' };
  if (!pickOption(REWARD_ICONS, st.icon) || !pickOption(REWARD_ANIMS, st.anim) || !pickOption(REWARD_COLOURS, st.color) || !pickOption(REWARD_SPARKLES, st.sparkle)) {
    errBox.textContent = 'Choose an icon, an animation, a colour and sparkles.';
    errBox.hidden = false;
    return;
  }
  data.style = st;
  const editId = rewardUI.editId;
  const next = editId
    ? state.rewards.map((r) => (r.id === editId ? { ...r, ...data } : r))
    : [...state.rewards, { id: newRewardId(), ...data, createdAt: new Date().toISOString(), claimedAt: null }];
  rewardUI.mode = 'list';
  rewardUI.editId = null;
  changeRewards(next, editId ? 'Reward saved' : 'Reward added', 'success');
}

// ---------- actions ----------

const checkinsInFlight = new Set();

async function checkin(goalId, date, answer) {
  const g = state.goals.find((x) => x.id === goalId);
  if (!g) return;
  if (answer === 'no') {
    const av = L.exceptionAvailability(g, date);
    const ok = await confirmDialog({
      title: av.ok ? 'Use an exception?' : 'Restart this journey?',
      message: av.ok
        ? `This day is recorded as an exception. You have ${av.remaining} left and the journey grows by one day.`
        : `${av.reason === 'too_soon'
          ? `You missed again within ${L.policyFor(g).gapDays} days of your last exception.`
          : av.reason === 'not_allowed' ? 'There are no exceptions.' : 'All exceptions are used.'}
           The attempt is saved under Not accomplished and the journey restarts tomorrow.`,
      confirmLabel: av.ok ? 'Use exception' : 'Restart',
      danger: !av.ok,
    });
    if (!ok) return;
  }
  // A second tap on the same day while the first is still saving is ignored.
  const key = `${goalId}|${date}`;
  if (checkinsInFlight.has(key)) return;
  checkinsInFlight.add(key);
  try {
    const res = await db.checkIn(state.user.uid, goalId, date, answer);
    if (res.outcome === 'completed') {
      celebrate(g.title);
    } else if (res.outcome === 'failed') {
      toast('Journey restarted. The attempt is saved under Not accomplished.', 'error');
    } else if (res.outcome === 'exception') {
      toast(`Exception used. ${res.remaining} left.`, 'info');
    } else {
      toast('Done. The next day is unlocked.', 'success');
    }
  } catch (err) {
    toast(err.message || 'Could not save. Check your connection.', 'error');
  } finally {
    checkinsInFlight.delete(key);
  }
}

async function saveSmart(goalId, form) {
  const g = state.goals.find((x) => x.id === goalId);
  if (!g || !form) return;
  const filled = [...form.querySelectorAll('[data-log-index]')].filter((i) => i.value.trim() !== '');
  if (!filled.length) {
    toast('Type a number first. Use 0 for nothing done.', 'error');
    return;
  }
  const entries = filled.map((i) => ({
    index: Number(i.dataset.logIndex),
    date: i.dataset.logDate,
    value: i.value.trim(),
  }));
  if (checkinsInFlight.has(goalId)) return;   // a second press while the first save runs is ignored
  checkinsInFlight.add(goalId);
  try {
    const res = await db.saveSmartLog(state.user.uid, goalId, entries);
    for (const k of Object.keys(state.drafts)) {
      if (k.startsWith(`${goalId}|`)) delete state.drafts[k];
    }
    if (res.outcome === 'completed') celebrate(g.title);
    else toast('Numbers saved', 'success');
  } catch (err) {
    toast(err.message || 'Could not save. Check your connection.', 'error');
  } finally {
    checkinsInFlight.delete(goalId);
  }
}

// Sankalpas saved before the fix can be finished in the database but still marked active, with nothing left to do.
// Marks them accomplished once, so the record in Firestore matches the rules.
function repairFinishedSankalpas() {
  if (!state.user) return;
  for (const g of state.goals) {
    if (g.status === 'active' && g.type === 'sankalpa' && L.doneCount(g) >= g.targetDays) {
      const now = new Date().toISOString();
      db.updateGoalDetails(state.user.uid, g.id, { status: 'completed', completedAt: now })
        .catch((err) => console.warn('Could not finish sankalpa', err));
    }
  }
}

// Journeys made before ordering existed get a position once, so the order is stable from then on.
function ensureOrder() {
  if (!state.user) return;
  const active = sortedActive();
  if (active.length && active.some((g) => !Number.isFinite(g.order))) {
    db.saveOrder(state.user.uid, active.map((g) => g.id)).catch((err) => console.warn('Could not save order', err));
  }
}

async function exportData() {
  try {
    const data = await db.exportAll(state.user.uid);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sankalp-export-${L.todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Export downloaded', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function onViewClick(e) {
  const act = e.target.closest('[data-action]');
  if (act) {
    const { action } = act.dataset;
    switch (action) {
      case 'new': openCreate(); break;
      case 'checkin': checkin(act.dataset.goal, act.dataset.date, act.dataset.answer); break;
      case 'smart-save': saveSmart(act.dataset.goal, act.closest('[data-smart-form]')); break;
      case 'goal-settings': openGoalSettings(state.goals.find((x) => x.id === act.dataset.goal)); break;
      case 'acc-tab': state.accTab = act.dataset.tab; render(); break;
      case 'check-view': state.checkView = state.checkView === act.dataset.view ? null : act.dataset.view; render(); break;
      case 'redo': openRedo(state.goals.find((x) => x.id === act.dataset.goal)); break;
      case 'redo-miss': openRedo(state.goals.find((x) => x.id === act.dataset.goal), { fromMiss: true }); break;
      case 'reorder': state.reorder = !state.reorder; render(); break;
      case 'type-toggle': state.openType = state.openType === act.dataset.type ? null : act.dataset.type; render(); break;
      default: break;
    }
    return;
  }
  // Touch/keyboard: tapping an open day toggles its check-in popover.
  const cell = e.target.closest('.cell.is-active');
  document.querySelectorAll('.cell.open').forEach((c) => { if (c !== cell) c.classList.remove('open'); });
  if (cell) cell.classList.toggle('open');
}

// Keeps what the user has typed into a SMART number box, so the minute refresh does not wipe it.
function onViewInput(e) {
  const inp = e.target.closest?.('[data-log-index]');
  if (!inp) return;
  const form = inp.closest('[data-smart-form]');
  state.drafts[`${form.dataset.goal}|${inp.dataset.logIndex}|${inp.dataset.logDate}`] = inp.value;
}

function onRailClick(e) {
  const acc = e.target.closest('[data-action="account"]');
  if (acc) openAccount();
  // A type button opens its panel; tapping it again closes it.
  const tb = e.target.closest('[data-action="rail-type"]');
  if (tb) {
    if (state.railType === tb.dataset.type) closeTypePanel();
    else {
      state.railType = tb.dataset.type;
      renderRail();
      refreshIcons();
    }
    return;
  }
  // Choosing a journey from the panel opens it; the panel closes once the page changes.
  if (e.target.closest('.rail-sheet a')) setTimeout(closeTypePanel, 0);
}

// Tapping anywhere outside the type panel closes it, including the bar's other icons.
// The type buttons are left out: they switch or close the panel themselves.
function onDocPointerDown(e) {
  if (state.railType && !e.target.closest('.rail-sheet, .rail-type')) closeTypePanel();
}

function onModalRootClick(e) {
  const act = e.target.closest('[data-action]');
  if (!act) return;
  if (act.dataset.action === 'signout') {
    document.querySelector('.modal-backdrop')?.remove();
    db.logout().then(() => toast('Signed out'));
  }
  if (act.dataset.action === 'export') exportData();
  if (act.dataset.action === 'rewards') {
    document.querySelector('.modal-backdrop')?.remove();
    openRewards();
  }
}

// ---------- render loop ----------

function render() {
  // Never rebuild the screen while a journey is being dragged: that would drop it.
  if (state.dragging) {
    state.renderPending = true;
    return;
  }
  if (!state.authReady) {
    $('#rail').hidden = true;
    view().innerHTML = `<div class="splash"><div class="brand-mark pulse">${icon('sparkles')}</div></div>`;
    refreshIcons();
    return;
  }
  if (!state.user) {
    $('#rail').hidden = true;
    view().innerHTML = viewLogin(state.loginError || '');
    refreshIcons();
    return;
  }
  $('#rail').hidden = false;
  renderRail();

  const r = route();
  const routeKey = r.name === 'goal' ? `goal:${r.id}` : r.name;
  const changed = routeKey !== state.lastRouteKey;
  state.lastRouteKey = routeKey;
  if (r.name !== 'home' && r.name !== 'journeys') state.reorder = false;
  // Each screen opens with every column closed.
  if (changed) state.openType = null;
  if (changed) state.railType = null;

  let html;
  if (r.name === 'goal') html = viewGoal(r.id);
  else if (r.name === 'accomplishments') html = viewAccomplishments();
  else if (r.name === 'journeys') html = viewJourneys();
  else html = viewHome();

  const v = view();
  // Only animate when the screen itself changes, so live updates do not replay entrance animations.
  v.classList.toggle('page-in', changed);
  v.innerHTML = html;
  refreshIcons();
  if (changed) setTimeout(() => v.classList.remove('page-in'), 1200);
  paintRewards();
}

// ---------- boot ----------

async function boot() {
  view().addEventListener('click', onViewClick);
  view().addEventListener('input', onViewInput);
  view().addEventListener('pointerdown', onDragDown);
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  $('#rail').addEventListener('click', onRailClick);
  $('#rail').addEventListener('pointerdown', onRailDown);
  // While a held journey is dragged, the finger moves it instead of scrolling the panel.
  window.addEventListener('touchmove', (e) => { if (drag.el) e.preventDefault(); }, { passive: false });
  // A long press on a journey in a type panel starts a drag, not the browser's link menu.
  $('#rail').addEventListener('contextmenu', (e) => { if (e.target.closest('.rail-sheet-row')) e.preventDefault(); });
  document.addEventListener('pointerdown', onDocPointerDown);
  // The rail's links must not start the browser's own link drag, which would fight our drag.
  $('#rail').addEventListener('dragstart', (e) => e.preventDefault());
  // The click that ends a rail drag must not open the journey.
  $('#rail').addEventListener('click', (e) => {
    if (Date.now() < railSuppressClickUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  $('#modal-root').addEventListener('click', onModalRootClick);
  window.addEventListener('hashchange', render);
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="login"]')) {
      state.loginError = '';
      db.login().catch((err) => {
        state.loginError = err.message || 'Sign-in failed';
        render();
      });
    }
  });

  if (!db.init()) {
    state.authReady = true;
    view().innerHTML = viewSetup();
    $('#rail').hidden = true;
    return;
  }

  db.completeRedirectLogin().catch((err) => toast(`Sign-in failed: ${err.message}`, 'error'));

  db.onAuthChange((user) => {
    state.authReady = true;
    if (!user) {
      state.user = null;
      state.goals = [];
      state.rewards = [];
      unsubscribeGoals?.();
      unsubscribeGoals = null;
      unsubscribeRewards?.();
      unsubscribeRewards = null;
      render();
      return;
    }
    state.user = user;
    db.ensureUserDoc(user).catch((err) => console.warn('User profile not updated', err));
    if (!unsubscribeGoals) {
      unsubscribeGoals = db.subscribeGoals(
        user.uid,
        (goals) => { state.goals = goals; state.goalsReady = true; ensureOrder(); repairFinishedSankalpas(); render(); },
        (err) => toast(`Could not load your data: ${err.message}`, 'error'),
      );
    }
    if (!unsubscribeRewards) {
      unsubscribeRewards = db.subscribeRewards(
        user.uid,
        (rewards) => { state.rewards = rewards; paintRewards(); },
        (err) => console.warn('Rewards not loaded', err),
      );
    }
    render();
  });

  // Re-render every minute so day boundaries (and "unlocks tomorrow") update without a reload.
  // Skipped while a number box in the page has the cursor, so a half-typed number is never replaced.
  setInterval(() => {
    const a = document.activeElement;
    const typing = !!a && view().contains(a) && a.matches('input, textarea, select');
    if (state.user && !typing) render();
  }, 60000);

  render();
}

boot();
