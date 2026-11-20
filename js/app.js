// SANKALP UI: routing, rendering and interactions.
import * as db from './db.js';
import * as L from './logic.js';
import { ICON_GROUPS, COLOURS, DEFAULT_COLOUR } from './choices.js';

// What each kind of journey means, shown under its column so the three are easy to tell apart.
const TYPE_PLURAL = { habit: 'Habits', sankalpa: 'Sankalpas', smart: 'SMART goals' };
const TYPE_ICON = { habit: 'repeat', sankalpa: 'scroll', smart: 'target' };
const TYPE_SUB = {
  habit: '66 days in a row. Two exception days allowed.',
  sankalpa: 'A vow for the number of days you choose. No exceptions.',
  smart: 'A plan of measurable actions, logged each day toward a deadline.',
};
const OUTCOME_LABEL = { failed: 'Not kept', abandoned: 'Abandoned' };

const state = {
  authReady: false,
  user: null,
  goals: [],
  goalsReady: false,
  accTab: 'accomplished',
  lastRouteKey: null,
  reorder: false,
  dragging: false,
  renderPending: false,
  drafts: {},        // unsaved SMART numbers, keyed "goalId|planIndex|date", kept across re-renders
  loginError: '',
  pickDay: {},       // which finished day a SMART goal's log is showing, by goal id
};
let unsubscribeGoals = null;

const $ = (sel) => document.querySelector(sel);
const view = () => $('#view');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const icon = (name, cls = '') => `<i data-lucide="${esc(name)}" class="${cls}" aria-hidden="true"></i>`;
// Every form field is required unless it says otherwise, so each label carries this star.
const REQ = '<b class="req" title="Required" aria-label="required">*</b>';
const refreshIcons = () => window.lucide?.createIcons();

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(`${s}T12:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Whole numbers stay whole; decimals show one place (1.5, 0.3).
const fmtNum = (n) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
};

const typeName = (g) => L.TYPE_LABEL[g.type] || 'Habit';
const keepPhrase = (g) => ({ habit: 'keep this habit', sankalpa: 'keep this sankalpa', smart: 'stick to this goal' })[g.type] || 'keep this habit';
const sortedActive = () => L.sortByOrder(state.goals.filter((g) => g.status === 'active'));

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
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    wrap.classList.add('leaving');
    setTimeout(() => wrap.remove(), 200);
    onClose?.();
  }
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  onMount?.(wrap, close);
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
  const face = (p) => `<span class="dd-face"><i class="dd-dot" style="--c:${p.hex}"></i><span class="dd-name">${esc(p.name)}</span></span>`;
  const opts = list.map((p) => `
    <button type="button" class="dd-opt colour${p.hex.toUpperCase() === sel ? ' on' : ''}" data-dd-option data-value="${p.hex}" title="${esc(p.name)}">${face(p)}</button>`).join('');
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

function onDragDown(e) {
  if (!state.reorder || e.button > 0) return;
  const item = e.target.closest('[data-drag-list] .drag-item');
  if (!item) return;
  drag.pending = { item, x: e.clientX, y: e.clientY };
}

function onDragMove(e) {
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
  for (const n of container.querySelectorAll('.drag-item')) {
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
  if (!drag.el) return;
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
  if (drag.pending) drag.pending = null;
  if (!drag.el) return;
  cancelAnimationFrame(drag.raf);
  const container = drag.el.parentElement;
  const movedId = drag.el.dataset.id;
  drag.el.classList.remove('drag-source');
  drag.ghost?.remove();
  drag.ghost = null;
  document.body.classList.remove('is-dragging');
  const typeIds = [...container.querySelectorAll('.drag-item')].map((n) => n.dataset.id);
  drag.el = null;
  state.dragging = false;

  const byId = new Map(state.goals.map((g) => [g.id, g]));
  const type = byId.get(movedId)?.type;
  const current = sortedActive().map((g) => g.id);
  let k = 0;
  const merged = current.map((id) => (byId.get(id)?.type === type && k < typeIds.length ? typeIds[k++] : id));
  if (merged.join('|') !== current.join('|')) {
    merged.forEach((id, pos) => { const g = byId.get(id); if (g) g.order = pos; });
    render();
    try {
      await db.saveOrder(state.user.uid, merged);
    } catch (err) {
      toast(err.message || 'Could not save the order.', 'error');
    }
  } else {
    render();
  }
}

// ---------- rail (floating left sidebar, bottom bar on phones) ----------

function renderRail() {
  const r = route();
  const active = sortedActive();
  const cls = (name, id) => (r.name === name && (!id || r.id === id) ? 'rail-item active' : 'rail-item');
  const goalItems = active.map((g) => `
    <a class="${cls('goal', g.id)} goal-item" href="#/goal/${encodeURIComponent(g.id)}"
       data-tip="${esc(g.title)}" style="--c:${g.color}" aria-label="${esc(g.title)}">
      ${icon(g.icon)}
    </a>`).join('');
  $('#rail').innerHTML = `
    <a class="${cls('home')}" href="#/home" data-tip="Check in" aria-label="Check in">${icon('calendar-check')}</a>
    <a class="${cls('journeys')}" href="#/journeys" data-tip="Your journeys" aria-label="Your journeys">${icon('route')}</a>
    <div class="rail-goals">${goalItems}</div>
    <div class="rail-spacer"></div>
    <a class="${cls('accomplishments')}" href="#/accomplishments" data-tip="Accomplishments" aria-label="Accomplishments">${icon('medal')}</a>
    <button class="rail-item" data-action="account" data-tip="Account" aria-label="Account">${icon('circle-user-round')}</button>`;
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
    meta = `SMART goal · ${p.projected.days} days`;
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
    <a class="goal-card" href="#/goal/${encodeURIComponent(g.id)}" style="--c:${g.color}">
      ${goalInner(g, today)}
    </a>`;
}

// A journey card you can drag in reorder mode. It sits in its type's column.
function dragCardHTML(g, today) {
  return `<div class="goal-card drag-item" data-id="${esc(g.id)}" style="--c:${g.color}">${goalInner(g, today)}</div>`;
}

// SMART log for one day: one number box per plan item. Defaults to the open day.
// A finished day can be picked from the day map and edited; the next day only opens once the open day is met.
function smartLogHTML(g, today, pick = null) {
  const p = L.smartProgress(g, today);
  if (p.phase === 'upcoming') return `<p class="muted log-note">Starts ${fmtDate(g.attemptStart)}. You can log numbers from that day.</p>`;
  if (!p.items.length) return '<p class="muted log-note">This goal has no plan yet. Add one from Edit.</p>';
  const usable = pick && pick >= g.attemptStart && pick <= today;
  const date = usable ? pick : p.openDay;
  if (!date) return '<p class="muted log-note">Today is complete. The next day unlocks tomorrow.</p>';
  const isOpen = date === p.openDay;
  const dayLabel = date === today ? 'Today' : `${isOpen ? 'Pending' : 'Day'} · ${fmtDate(date)}`;

  const valueOf = (it) => state.drafts[`${g.id}|${it.index}|${date}`] ?? g.logs?.[date]?.[it.index];
  const needs = p.items.filter((it) => {
    const v = valueOf(it);
    return v === undefined || v === '' || Number(v) < it.dayTarget;
  });
  const needHTML = needs.length
    ? `<p class="log-need">${icon('circle-alert')}<span>Still needed: ${needs.map((it) => `${esc(it.action)} (${fmtNum(it.dayTarget)})`).join(', ')}</span></p>`
    : `<p class="log-ok">${icon('circle-check')}<span>This day is met.</span></p>`;

  const rows = p.items.map((it) => {
    const value = valueOf(it) ?? '';
    return `
      <label class="log-row">
        <span class="log-k"><strong>${esc(it.action)}</strong><small class="muted">Goal ${fmtNum(it.amount)} ${esc(L.periodLabel(it.per))}</small></span>
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
function checkRowHTML(g, today) {
  const nxt = L.nextActionText(g, today);
  const titleLink = (sub) => `
    <a class="due-title" href="#/goal/${encodeURIComponent(g.id)}">
      <span class="goal-icon sm">${icon(g.icon)}</span>
      <span><strong>${esc(g.title)}</strong><small>${esc(sub)}</small></span>
    </a>`;

  if (g.type === 'smart' && g.smart) {
    const p = L.smartProgress(g, today);
    if (p.phase === 'running' && p.openDay && !p.complete) {
      return `
        <div class="due-row smart-due" style="--c:${g.color}">
          ${titleLink(`${nxt.text} · SMART goal`)}
          ${smartLogHTML(g, today)}
        </div>`;
    }
    return `<div class="due-row idle" style="--c:${g.color}">${titleLink(nxt.text)}</div>`;
  }

  if (nxt.kind === 'today' || nxt.kind === 'overdue') {
    const j = L.journey(g, today);
    const av = L.exceptionAvailability(g, j.next.date);
    const label = j.next.date === today ? 'Today' : `Pending · ${fmtDate(j.next.date)}`;
    return `
      <div class="due-row" style="--c:${g.color}">
        ${titleLink(label)}
        <div class="due-actions">
          <button class="btn yes sm" data-action="checkin" data-goal="${g.id}" data-date="${j.next.date}" data-answer="yes">${icon('check')}Done</button>
          <button class="btn no sm" data-action="checkin" data-goal="${g.id}" data-date="${j.next.date}" data-answer="no" title="${esc(av.ok ? 'Uses an exception' : 'Restarts the journey')}">${icon('x')}Missed</button>
        </div>
      </div>`;
  }
  return `<div class="due-row idle" style="--c:${g.color}">${titleLink(nxt.text)}</div>`;
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
}

// Screen 1: Check In. Only the journeys that still need a check-in are listed. Done ones leave the list.
function viewHome() {
  const today = L.todayStr();
  const active = sortedActive();
  const s = L.checkinSummary(state.goals, today);
  const name = (state.user.displayName || '').split(' ')[0] || 'There';
  const due = active.filter((g) => L.needsCheckin(g, today));

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
      ${!due.length ? `<div class="all-clear">${icon('circle-check')}<span>All caught up. Nothing needs a check-in right now.</span></div>` : ''}
      <section class="block">
        ${typeColumns(due, (g) => checkRowHTML(g, today), 'Nothing to check in.')}
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
            <div class="stat"><div><strong>${s.filled}</strong><span>Filled</span></div></div>
            <div class="stat${s.needed ? ' hot' : ''}"><div><strong>${s.needed}</strong><span>To fill</span></div></div>
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
    ? typeColumns(active, (g) => goalCard(g, today), (t) => `No ${TYPE_PLURAL[t].toLowerCase()} yet.`)
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
    <header class="goal-head" style="--c:${g.color}">
      <a class="icon-btn back" href="#/journeys" aria-label="Back">${icon('arrow-left')}</a>
      <div class="goal-title">
        <span class="goal-icon lg">${icon(g.icon)}</span>
        <div>
          <p class="eyebrow">${typeName(g)}</p>
          <h1>${esc(g.title)}</h1>
          ${g.description ? `<p class="desc">${esc(g.description)}</p>` : ''}
          ${g.why ? `<p class="why"><strong>Why:</strong> ${esc(g.why)}</p>` : ''}
        </div>
      </div>
      <button class="icon-btn" data-action="goal-settings" data-goal="${g.id}" aria-label="Edit journey">${icon('pencil')}</button>
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
  } else if (j.next) {
    const isToday = j.next.date === today;
    const consequence = nextExc.ok
      ? `A miss uses one of your ${nextExc.remaining} exception${nextExc.remaining > 1 ? 's' : ''} and adds a day to the journey.`
      : (nextExc.reason === 'too_soon'
        ? `You already used an exception recently. A miss now restarts the journey. The next exception opens on ${fmtDate(nextExc.nextAllowed)}.`
        : nextExc.reason === 'not_allowed'
          ? 'Sankalpas have no exceptions. A miss restarts the journey.'
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
          <div class="kpi"><span>Started</span><strong class="sm">${fmtDate(g.attemptStart)}</strong></div>
        </div>
      </div>

      ${panel}

      <section class="block">
        <div class="block-head">
          <h2>Journey</h2>
          <div class="legend">
            <span><i class="dot d"></i>Done</span><span><i class="dot e"></i>Exception</span>
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

// The pace insight: how many days are left at the current pace, and whether the goal is growing, shrinking or on pace.
function paceNoteHTML(g, p) {
  if (p.complete) return '';
  const n = p.planned.days;
  const end = fmtDate(p.projected.end);
  const left = p.daysLeft;
  const status = p.verdict === 'extended'
    ? { cls: 'behind', word: 'Growing', icon: 'trending-up' }
    : p.verdict === 'ahead'
      ? { cls: 'ahead', word: 'Shrinking', icon: 'trending-down' }
      : { cls: '', word: 'On pace', icon: 'circle-check' };
  const detail = p.verdict === 'extended'
    ? `It was planned for ${n} days. You are behind, so the goal now runs ${p.projected.days} days, ending ${end}. Do a little more each day to bring it back.`
    : p.verdict === 'ahead'
      ? `It was planned for ${n} days. You are ahead, so the goal now runs ${p.projected.days} days, ending ${end}. Keep going and it gets shorter.`
      : `It is planned for ${n} days, ending ${end}. Keep this pace to finish on time.`;
  return `
    <section class="panel pace-panel ${status.cls}">
      ${icon(status.icon)}
      <div>
        <p class="pace-status">${status.word}</p>
        <h3>${left} day${left === 1 ? '' : 's'} left at your current pace</h3>
        <p>${detail}</p>
      </div>
    </section>`;
}

function viewSmartGoal(g, today) {
  const p = L.smartProgress(g, today);
  const pct = Math.round(p.ratio * 100);
  const pick = state.pickDay[g.id] || null;

  let panel = '';
  if (g.status === 'completed') {
    panel = `<section class="panel done-panel">${icon('trophy')}<div><h3>Accomplished on ${fmtDate(g.completedAt?.slice(0, 10))}</h3>
      <p class="muted">Every target in your plan was met.</p></div>
      <a class="btn ghost sm" href="#/accomplishments">View</a>
      <button class="btn primary sm" data-action="redo" data-goal="${g.id}">${icon('rotate-ccw')}Redo</button></section>`;
  } else if (g.status === 'abandoned') {
    panel = `<section class="panel muted-panel">${icon('ban')}<div><h3>Closed</h3><p class="muted">This goal was closed and is listed under Not accomplished.</p></div></section>`;
  } else {
    panel = paceNoteHTML(g, p);
  }

  const logBlock = g.status === 'active' ? `
    <section class="block">
      <div class="block-head"><h2>Log your numbers</h2></div>
      <div class="smart-due">${smartLogHTML(g, today, pick)}</div>
    </section>` : '';

  // Every day from the first to the projected end. Done, open and past days can be picked to edit.
  const cells = p.days.map((d) => {
    const clickable = d.date <= today && d.state !== 'locked';
    const tag = clickable ? 'button' : 'div';
    const attrs = clickable
      ? ` type="button" data-action="day-pick" data-goal="${esc(g.id)}" data-date="${d.date}"`
      : '';
    return `<${tag} class="cell s-${d.state}${pick === d.date ? ' picked' : ''}" style="--i:${Math.min(d.index, 40)}" title="Day ${d.index + 1} · ${fmtDate(d.date)}"${attrs}>${d.state === 'done' ? icon('check') : `<span class="num">${d.index + 1}</span>`}</${tag}>`;
  }).join('');

  const targets = p.items.length
    ? p.items.map((it) => trackRowHTML(it, p.daysLeft)).join('')
    : '<p class="muted">This goal has no plan yet. Add one from Edit.</p>';

  return `
    <div class="page-in-target">
      ${goalHeadHTML(g)}

      <div class="overview">
        ${ringHTML(pct, `${p.items.filter((i) => i.complete).length}/${p.items.length} met`)}
        <div class="kpis">
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
            <span><i class="dot q"></i>Waiting</span><span><i class="dot l"></i>Locked</span>
          </div>
        </div>
        <p class="muted hint">A day is done when every item reaches its daily amount. Tap a finished day to edit it.</p>
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
function trackRowHTML(it, daysLeft) {
  const per = L.periodLabel(it.per);
  const pct = Math.round(it.ratio * 100);
  let needText = 'Target met';
  if (!it.complete) {
    const span = Math.max(1, Math.ceil(daysLeft / (L.PERIOD_DAYS[it.per] || 1)));
    const need = Math.ceil((it.remaining / span) * 10) / 10;
    needText = `${fmtNum(it.remaining)} left · about ${fmtNum(need)} ${per} from here`;
  }
  return `
    <div class="track-row${it.complete ? ' met' : ''}">
      <div class="track-main"><strong>${esc(it.action)}</strong><small class="muted">Goal ${fmtNum(it.amount)} ${esc(per)}</small></div>
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
function typeColumns(items, renderCard, emptyFor, { listClass = '', listAttrs = '' } = {}) {
  return `<div class="type-cols">${L.TYPES.map((type) => {
    const list = items.filter((x) => x.type === type);
    const empty = typeof emptyFor === 'function' ? emptyFor(type) : emptyFor;
    return `
      <section class="type-col" data-type="${type}">
        <header class="type-col-head">${icon(TYPE_ICON[type])}<span>${TYPE_PLURAL[type]}</span><b>${list.length}</b></header>
        <p class="type-col-sub">${esc(TYPE_SUB[type])}</p>
        ${list.length
          ? `<div class="type-col-list ${listClass}" ${listAttrs}>${list.map(renderCard).join('')}</div>`
          : `<p class="muted type-col-empty">${esc(empty)}</p>`}
      </section>`;
  }).join('')}</div>`;
}

// Accomplished and Not accomplished. Each entry is only its title, one status word, and Redo.
// Tapping the title opens the journey for the details.
function viewAccomplishments() {
  const tab = state.accTab;
  const done = L.accomplishedGroups(state.goals);
  const misses = L.notAccomplishedGroups(state.goals, L.todayStr());
  const doneTotal = done.reduce((n, g) => n + g.count, 0);
  const missTotal = misses.reduce((n, g) => n + g.count, 0);
  const countLabel = (text, n) => (n > 1 ? `${text} × ${n}` : text);
  const tabs = `
    <div class="segmented" role="tablist">
      <button role="tab" aria-selected="${tab === 'accomplished'}" class="${tab === 'accomplished' ? 'on' : ''}" data-action="acc-tab" data-tab="accomplished">${icon('trophy')}Accomplished <b>${doneTotal}</b></button>
      <button role="tab" aria-selected="${tab === 'missed'}" class="${tab === 'missed' ? 'on' : ''}" data-action="acc-tab" data-tab="missed">${icon('circle-x')}Not accomplished <b>${missTotal}</b></button>
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
  } else {
    list = typeColumns(misses, (m) => (m.latest.outcome === 'abandoned'
      ? record(m.title, countLabel('Abandoned', m.count), 'abandoned', m.latest.goalId, 'redo-miss')
      : record(m.title, countLabel('Not accomplished', m.count), 'failed', m.latest.goalId, 'redo-miss')), 'No misses in this group.');
  }

  const empty = !done.length && !misses.length;
  return `
    <div class="page-in-target">
      <header class="hero">
        <p class="eyebrow">Your record</p>
        <h1 class="page-title">Accomplishments</h1>
      </header>
      ${tabs}
      <section class="block">${empty && tab === 'accomplished'
        ? emptyBlock('trophy', 'Nothing accomplished yet', 'Complete a journey and it will land here.')
        : empty ? emptyBlock('sparkles', 'No misses on record', 'Every journey you have started is still on track or accomplished.')
          : list}</section>
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
          <p>${esc(g.smart[f.key])}</p>
        </div>`).join('')}</div>
    </section>`;
}

// ---------- dialogs ----------

// The three SMART text parts: Specific, Realistic, Time-bound.
function smartFieldsHTML(values = {}) {
  return L.SMART_FIELDS.map((f) => `
    <label class="field">
      <span>${esc(f.label)} ${REQ}</span>
      <small class="muted field-hint">${esc(f.hint)}</small>
      <textarea name="${f.key}" rows="2" maxlength="500" required>${esc(values[f.key] || '')}</textarea>
    </label>`).join('');
}

function descriptionFieldHTML(value = '') {
  return `
    <label class="field"><span>Description ${REQ}</span>
      <textarea name="description" rows="2" maxlength="1000" required placeholder="What this is, in a sentence or two">${esc(value)}</textarea></label>`;
}

function whyFieldHTML(value = '') {
  return `
    <label class="field"><span>Why ${REQ}</span>
      <textarea name="why" rows="2" maxlength="500" required placeholder="The reason this matters to you">${esc(value)}</textarea></label>`;
}

// One row of the SMART plan: what to do on the left, how much and per day or week on the right.
function planRowHTML(row = {}) {
  return `
    <div class="plan-row" data-plan-row>
      <input name="p_action" maxlength="200" placeholder="e.g. Read a chapter" value="${esc(row.action || '')}" aria-label="Actionable item">
      <div class="plan-measure">
        <input name="p_amount" type="number" min="0" step="any" inputmode="decimal" placeholder="10" value="${esc(row.amount ?? '')}" aria-label="Measurable amount">
        <input type="hidden" name="p_key" value="${row.key ?? ''}">
        <select name="p_per" aria-label="How often">
          ${L.PERIOD_OPTIONS.map(([k, label]) => `<option value="${k}"${(row.per || 'day') === k ? ' selected' : ''}>${label}</option>`).join('')}
        </select>
        <button type="button" class="icon-btn plan-remove" data-plan-remove aria-label="Remove this item">${icon('x')}</button>
      </div>
    </div>`;
}

function planHTML(rows = []) {
  return `
    <div class="field plan-field">
      <span>Plan: actionable and measurable ${REQ}</span>
      <p class="muted field-hint">Left: what you will do. Right: how much, per day or per week. Add one row for each action.</p>
      <div class="plan" data-plan>
        <div class="plan-head" aria-hidden="true"><span>Actionable</span><span>Measurable</span></div>
        <div class="plan-rows" data-plan-rows>${(rows.length ? rows : [{}]).map(planRowHTML).join('')}</div>
        <button type="button" class="btn ghost sm plan-add" data-plan-add>${icon('plus')}Add an item</button>
      </div>
    </div>`;
}

function wirePlan(root) {
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-plan-add]')) {
      const rows = root.querySelector('[data-plan-rows]');
      if (!rows || rows.children.length >= L.MAX_PLAN_ROWS) {
        toast(`Use at most ${L.MAX_PLAN_ROWS} actionable items.`, 'error');
        return;
      }
      rows.insertAdjacentHTML('beforeend', planRowHTML());
      rows.lastElementChild.querySelector('input').focus();
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
  return actions.map((action, i) => ({ action, amount: amounts[i], per: pers[i], key: keys[i] }));
}

function smartFromForm(fd) {
  return {
    ...Object.fromEntries(L.SMART_FIELDS.map((f) => [f.key, fd.get(f.key)])),
    plan: planFromForm(fd),
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
  let text = 'Give a deadline, or leave it empty and give the days.';
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
          ${icon('repeat')}<strong>Habit</strong></label>
        <label class="type-card"><input type="radio" name="type" value="sankalpa">
          ${icon('scroll')}<strong>Sankalpa</strong></label>
        <label class="type-card"><input type="radio" name="type" value="smart">
          ${icon('target')}<strong>SMART goal</strong></label>
      </div>
      <label class="field"><span data-title-label>Habit</span>
        <input name="title" maxlength="80" placeholder="e.g. Read 10 pages, Wake at 5am" required autocomplete="off"></label>
      ${descriptionFieldHTML()}
      ${whyFieldHTML()}
      <div class="field-row">
        <label class="field"><span>Start date ${REQ}</span>
          <input name="startDate" type="date" value="${today}" required></label>
        <label class="field" data-only="sankalpa smart" hidden><span>Days ${REQ}</span>
          <input name="days" type="number" min="1" max="365" inputmode="numeric" placeholder="e.g. 30"></label>
      </div>
      <div class="field-row" data-only="smart" hidden>
        <label class="field"><span>Deadline ${REQ}</span>
          <input name="endDate" type="date"></label>
        <p class="muted form-hint end-hint" data-end-hint>Give a deadline, or leave it empty and give the days.</p>
      </div>
      <div data-only="smart" hidden>
        <p class="muted form-hint">${icon('target')} Describe the goal, then build the plan. You log your numbers every day.</p>
        ${smartFieldsHTML()}
        ${planHTML([])}
      </div>
      <div class="field"><span>Icon ${REQ}</span>${iconDropdown('', { auto: true })}</div>
      <div class="field"><span>Colour ${REQ}</span>${colorDropdown(DEFAULT_COLOUR)}</div>
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
        if (e.target.name === 'type') showTypeFields(w, e.target.value);
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
            why: fd.get('why'),
            days: fd.get('days'),
            startDate: fd.get('startDate'),
            endDate: fd.get('endDate'),
            smart: smartFromForm(fd),
            icon: fd.get('icon'),
            color: fd.get('color'),
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
      <p class="muted">${esc(g.title)} starts again as a new ${esc(typeName(g).toLowerCase())}. The accomplished record stays where it is.</p>
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
  const lengthField = g.type === 'habit' ? '' : `
    <label class="field"><span>Days ${REQ}</span>
      <input name="days" type="number" min="1" max="365" inputmode="numeric" value="${g.targetDays}"></label>`;

  const body = `
    <form id="edit-form" class="form" novalidate>
      <label class="field"><span>${esc(L.TYPE_LABEL[g.type] || 'Habit')} ${REQ}</span>
        <input name="title" maxlength="80" required value="${esc(g.title)}"></label>
      ${descriptionFieldHTML(g.description || '')}
      ${whyFieldHTML(g.why || '')}
      <div class="field-row">
        <label class="field"><span>Start date ${REQ}${startEditable ? '' : ' <small class="muted">(locked after the first check-in)</small>'}</span>
          <input name="startDate" type="date" value="${esc(g.attemptStart)}" ${startEditable ? '' : 'disabled'}></label>
        ${g.type === 'habit' ? '' : lengthField}
      </div>
      ${isSmart ? `
        <label class="field"><span>Deadline ${REQ}</span>
          <input name="endDate" type="date" value="${esc(g.smart.endDate)}"></label>
        <p class="muted form-hint">If you change the days, the deadline follows them. Otherwise the deadline is used.</p>
        ${smartFieldsHTML(g.smart)}
        ${planHTML(g.smart.plan || [])}` : ''}
      <div class="field"><span>Icon ${REQ}</span>${iconDropdown(g.icon)}</div>
      <div class="field"><span>Colour ${REQ}</span>${colorDropdown(g.color)}</div>
      <p class="error" data-error hidden></p>
      <div class="danger-zone">
        <div><strong>Abandon this journey</strong><small class="muted">It moves to Not accomplished. Nothing is deleted.</small></div>
        <button type="button" class="btn danger sm" data-abandon>Abandon</button>
      </div>
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
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.hidden = true;
        const fd = new FormData(form);
        try {
          const title = L.titleCase(String(fd.get('title') || '').trim()).slice(0, 80);
          if (!title) throw new Error('Title cannot be empty.');
          const fields = {
            title,
            description: L.cleanDescription(fd.get('description')),
            why: L.requireWhy(fd.get('why')),
            icon: fd.get('icon') || g.icon,
            color: fd.get('color') || g.color,
          };
          if (startEditable) fields.attemptStart = L.normalizeStartDate(fd.get('startDate'));
          if (g.type === 'sankalpa') fields.targetDays = L.cleanSankalpaDays(g, fd.get('days'));
          if (isSmart) {
            const start = fields.attemptStart || g.attemptStart;
            const days = Math.floor(Number(fd.get('days')));
            // Changing the days moves the deadline; otherwise the chosen deadline stands.
            const end = days !== g.targetDays
              ? L.resolveSmartEnd(start, { days })
              : L.normalizeEndDate(fd.get('endDate'), start);
            const parts = L.cleanSmart(Object.fromEntries(L.SMART_FIELDS.map((f) => [f.key, fd.get(f.key)])));
            fields.smart = { ...parts, plan: L.cleanPlan(planFromForm(fd)), endDate: end };
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
        <button class="menu-item" data-action="export">${icon('download')}<div><strong>Export my data</strong><small class="muted">Download everything as a JSON backup</small></div></button>
        <button class="menu-item danger-text" data-action="reset-account">${icon('rotate-ccw')}<div><strong>Reset account</strong><small class="muted">Deletes every journey and all your data. Your sign-in stays.</small></div></button>
        <button class="menu-item danger-text" data-action="signout">${icon('log-out')}<div><strong>Sign out</strong><small class="muted">Your data stays safe in the cloud</small></div></button>
      </div>`,
  });
}

// ---------- actions ----------

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
          : av.reason === 'not_allowed' ? 'Sankalpas have no exceptions.' : 'All exceptions are used.'}
           The attempt is saved under Not accomplished and the journey restarts tomorrow.`,
      confirmLabel: av.ok ? 'Use exception' : 'Restart',
      danger: !av.ok,
    });
    if (!ok) return;
  }
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
  try {
    const res = await db.saveSmartLog(state.user.uid, goalId, entries);
    for (const k of Object.keys(state.drafts)) {
      if (k.startsWith(`${goalId}|`)) delete state.drafts[k];
    }
    if (res.outcome === 'completed') celebrate(g.title);
    else toast('Numbers saved', 'success');
  } catch (err) {
    toast(err.message || 'Could not save. Check your connection.', 'error');
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
      case 'redo': openRedo(state.goals.find((x) => x.id === act.dataset.goal)); break;
      case 'redo-miss': openRedo(state.goals.find((x) => x.id === act.dataset.goal), { fromMiss: true }); break;
      case 'day-pick':
        state.pickDay[act.dataset.goal] = act.dataset.date;
        render();
        break;
      case 'reorder': state.reorder = !state.reorder; render(); break;
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
}

function onModalRootClick(e) {
  const act = e.target.closest('[data-action]');
  if (!act) return;
  if (act.dataset.action === 'signout') {
    document.querySelector('.modal-backdrop')?.remove();
    db.logout().then(() => toast('Signed out'));
  }
  if (act.dataset.action === 'export') exportData();
  if (act.dataset.action === 'reset-account') resetAccount();
}

async function resetAccount() {
  const ok = await confirmDialog({
    title: 'Reset your account?',
    message: 'Every habit, sankalpa and SMART goal, all history, and your profile data will be permanently deleted. Your account becomes brand new. This cannot be undone.',
    confirmLabel: 'Reset everything',
    danger: true,
  });
  if (!ok) return;
  try {
    const count = await db.resetAccount(state.user.uid);
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
    location.hash = '#/home';
    toast(`Account reset. ${count} journey${count === 1 ? '' : 's'} deleted.`, 'info');
  } catch (err) {
    toast(err.message, 'error');
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
      unsubscribeGoals?.();
      unsubscribeGoals = null;
      render();
      return;
    }
    state.user = user;
    db.ensureUserDoc(user).catch((err) => console.warn('User profile not updated', err));
    if (!unsubscribeGoals) {
      unsubscribeGoals = db.subscribeGoals(
        user.uid,
        (goals) => { state.goals = goals; state.goalsReady = true; ensureOrder(); render(); },
        (err) => toast(`Could not load your data: ${err.message}`, 'error'),
      );
    }
    render();
  });

  // Re-render every minute so day boundaries (and "unlocks tomorrow") update without a reload.
  setInterval(() => { if (state.user) render(); }, 60000);

  render();
}

boot();
