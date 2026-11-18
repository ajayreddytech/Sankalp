// SANKALP UI: routing, rendering and interactions.
import * as db from './db.js';
import * as L from './logic.js';

// Every name here is checked against the Lucide build in index.html. The search box filters this list.
const ICONS = [
  'target', 'dumbbell', 'book-open', 'droplet', 'moon', 'sun', 'brain', 'heart', 'pen-line', 'leaf',
  'flame', 'footprints', 'coffee', 'apple', 'ban', 'music', 'code', 'languages', 'piggy-bank', 'mountain',
  'sparkles', 'zap', 'star', 'wallet',
  'book-marked', 'bookmark', 'graduation-cap', 'school', 'pencil', 'pen', 'notebook', 'notebook-pen',
  'scroll-text', 'file-text', 'library',
  'bike', 'car', 'plane', 'mountain-snow', 'tent', 'trees', 'waves', 'sprout', 'flower', 'flower-2',
  'bean', 'carrot', 'cherry', 'citrus', 'egg', 'fish', 'ham', 'beef', 'milk', 'cookie', 'cake',
  'alarm-clock', 'timer', 'hourglass', 'calendar', 'calendar-check', 'clock', 'sunrise', 'sunset',
  'cloud', 'cloud-sun', 'rainbow', 'umbrella',
  'bed', 'bed-double', 'armchair', 'lamp', 'house', 'key-round', 'lock', 'shield', 'shield-check',
  'activity', 'heart-pulse', 'stethoscope', 'pill', 'syringe', 'thermometer', 'hand-heart', 'smile', 'laugh',
  'trophy', 'medal', 'crown', 'award', 'gem', 'diamond', 'rocket', 'compass', 'map-pin', 'globe',
  'plane-takeoff', 'anchor',
  'camera', 'image', 'palette', 'brush', 'paintbrush', 'film', 'clapperboard', 'headphones', 'mic',
  'guitar', 'piano', 'drum', 'radio',
  'gamepad-2', 'puzzle', 'dice-5', 'ticket',
  'wrench', 'hammer', 'scissors', 'ruler', 'calculator', 'banknote', 'coins', 'circle-dollar-sign',
  'receipt', 'briefcase',
  'phone', 'smartphone', 'laptop', 'terminal', 'database', 'server', 'bug', 'git-branch',
  'users', 'user-round', 'hand', 'handshake', 'message-circle', 'mail', 'send',
  'eye', 'glasses', 'feather', 'infinity', 'orbit', 'atom', 'flask-conical', 'microscope', 'telescope',
  'swords', 'shield-half', 'flag', 'bell', 'check-check', 'circle-check', 'repeat', 'rotate-ccw',
];
// Presets for quick picking. Any other colour comes from the rectangle or hue slider.
const COLORS = [
  '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#22d3ee', '#14b8a6', '#10b981', '#34d399',
  '#84cc16', '#a3e635', '#eab308', '#fbbf24', '#f59e0b', '#f97316', '#ef4444', '#fb7185',
  '#e11d48', '#ec4899', '#f472b6', '#d946ef', '#a855f7', '#94a3b8', '#e2e8f0', '#78716c',
];

const state = {
  authReady: false,
  user: null,
  goals: [],
  goalsReady: false,
  accTab: 'accomplished',
  lastRouteKey: null,
};
let unsubscribeGoals = null;

const $ = (sel) => document.querySelector(sel);
const view = () => $('#view');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const icon = (name, cls = '') => `<i data-lucide="${esc(name)}" class="${cls}" aria-hidden="true"></i>`;
const refreshIcons = () => window.lucide?.createIcons();

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(`${s}T12:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const typeName = (g) => L.TYPE_LABEL[g.type] || 'Habit';
const keepPhrase = (g) => ({ habit: 'keep this habit', sankalpa: 'keep this sankalpa', smart: 'stick to this goal' })[g.type] || 'keep this habit';

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

// ---------- shared pickers ----------

// Searchable icon grid. With auto: true, an "Auto" choice (empty value) is first and selected by default.
function iconPicker(selected = '', { auto = false } = {}) {
  const names = ICONS.includes(selected) || !selected ? ICONS : [selected, ...ICONS];
  const autoOpt = auto ? `
    <label class="pick auto" data-name="auto">
      <input type="radio" name="icon" value="" checked>
      <span>${icon('wand-sparkles')}<em>Auto, from your title</em></span>
    </label>` : '';
  return `
    <div class="ipick" data-icon-picker>
      <input class="ipick-search" type="search" placeholder="Search icons, e.g. book, heart, moon" aria-label="Search icons" autocomplete="off">
      <div class="picker-grid icons">${autoOpt}${names.map((name) => `
        <label class="pick" data-name="${esc(name)}" title="${esc(name)}">
          <input type="radio" name="icon" value="${esc(name)}" ${!auto && name === selected ? 'checked' : ''}>
          <span>${icon(name)}</span>
        </label>`).join('')}</div>
      <p class="muted ipick-empty" hidden>No icon matches that search.</p>
    </div>`;
}

function wireIconPicker(root) {
  const el = root.querySelector('[data-icon-picker]');
  if (!el) return;
  const search = el.querySelector('.ipick-search');
  const items = [...el.querySelectorAll('.pick')];
  const empty = el.querySelector('.ipick-empty');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase().replace(/\s+/g, '-');
    let shown = 0;
    for (const it of items) {
      const isAuto = it.dataset.name === 'auto';
      const ok = isAuto || !q || it.dataset.name.includes(q);
      it.hidden = !ok;
      if (ok && !isAuto) shown++;
    }
    empty.hidden = shown > 0;
  });
}

// ---------- colour: presets, a saturation/brightness rectangle and a hue slider ----------

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = ([r, g, b]) => `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function colorPicker(selected = COLORS[0]) {
  return `
    <div class="cpick" data-color-picker>
      <div class="hex-row">
        <input class="hex-input" data-hex-input type="text" maxlength="7" placeholder="#8B5CF6" spellcheck="false" autocomplete="off" aria-label="Colour code">
        <span class="cpick-preview" data-preview></span>
      </div>
      <input type="hidden" name="color" value="${esc(selected)}">
      <div class="sv" data-sv><span class="sv-dot" data-dot></span></div>
      <input class="hue" type="range" min="0" max="360" step="1" data-hue aria-label="Hue">
      <div class="sw-row">${COLORS.map((c) => `
        <button type="button" class="sw" data-pick="${c}" style="--c:${c}" aria-label="Use ${c}"></button>`).join('')}</div>
    </div>`;
}

function wireColorPicker(root) {
  const el = root.querySelector('[data-color-picker]');
  if (!el) return;
  const input = el.querySelector('input[name="color"]');
  const sv = el.querySelector('[data-sv]');
  const dot = el.querySelector('[data-dot]');
  const hue = el.querySelector('[data-hue]');
  const preview = el.querySelector('[data-preview]');
  const hexIn = el.querySelector('[data-hex-input]');
  const clamp = (n) => Math.min(1, Math.max(0, n));
  let [h, s, v] = rgbToHsv(...hexToRgb(input.value));

  function paint() {
    const value = rgbToHex(hsvToRgb(h, s, v));
    input.value = value;
    sv.style.setProperty('--h', Math.round(h));
    dot.style.left = `${s * 100}%`;
    dot.style.top = `${(1 - v) * 100}%`;
    dot.style.background = value;
    hue.value = Math.round(h);
    preview.style.background = value;
    if (document.activeElement !== hexIn) hexIn.value = value.toUpperCase();
  }

  // Typing a full code (#RGB or #RRGGBB) selects that colour straight away.
  hexIn.addEventListener('input', () => {
    const m = hexIn.value.trim().replace(/^#?/, '#').match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return;
    const digits = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    [h, s, v] = rgbToHsv(...hexToRgb(`#${digits}`));
    paint();
  });
  hexIn.addEventListener('blur', paint);

  const moveIn = (e) => {
    const r = sv.getBoundingClientRect();
    s = clamp((e.clientX - r.left) / r.width);
    v = clamp(1 - (e.clientY - r.top) / r.height);
    paint();
  };
  sv.addEventListener('pointerdown', (e) => { sv.setPointerCapture(e.pointerId); moveIn(e); });
  sv.addEventListener('pointermove', (e) => { if (sv.hasPointerCapture(e.pointerId)) moveIn(e); });
  hue.addEventListener('input', () => { h = Number(hue.value); paint(); });
  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-pick]')) return;
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    [h, s, v] = rgbToHsv(...hexToRgb(b.dataset.pick));
    paint();
  });
  paint();
}

// ---------- rail (floating left sidebar) ----------

function renderRail() {
  const r = route();
  const active = state.goals.filter((g) => g.status === 'active');
  const cls = (name, id) => (r.name === name && (!id || r.id === id) ? 'rail-item active' : 'rail-item');
  const goalItems = active.map((g) => `
    <a class="${cls('goal', g.id)} goal-item" href="#/goal/${encodeURIComponent(g.id)}"
       data-tip="${esc(g.title)}" style="--c:${g.color}" aria-label="${esc(g.title)}">
      ${icon(g.icon)}
    </a>`).join('');
  $('#rail').innerHTML = `
    <a class="${cls('home')}" href="#/home" data-tip="Home" aria-label="Home">${icon('house')}</a>
    <div class="rail-goals">${goalItems}</div>
    <div class="rail-spacer"></div>
    <a class="${cls('accomplishments')}" href="#/accomplishments" data-tip="Accomplishments" aria-label="Accomplishments">${icon('trophy')}</a>
    <button class="rail-item" data-action="account" data-tip="Account" aria-label="Account">${icon('user')}</button>`;
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

function goalCard(g, today) {
  const j = L.journey(g, today);
  const pct = Math.min(100, Math.round((j.done / g.targetDays) * 100));
  const nxt = L.nextActionText(g, today);
  return `
    <a class="goal-card" href="#/goal/${encodeURIComponent(g.id)}" style="--c:${g.color}">
      <div class="goal-card-top">
        <div class="goal-icon">${icon(g.icon)}</div>
        <div class="goal-meta">
          <h3>${esc(g.title)}</h3>
          <p>${typeName(g)} · ${g.targetDays} days${j.exceptions ? ` · ${j.exceptions} exception${j.exceptions > 1 ? 's' : ''}` : ''}</p>
        </div>
      </div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="goal-card-foot">
        <span>${j.done} / ${g.targetDays}</span>
        <span class="chip ${nxt.kind}">${esc(nxt.text)}</span>
      </div>
    </a>`;
}

function viewHome() {
  const today = L.todayStr();
  const active = state.goals.filter((g) => g.status === 'active');
  const accomplishedCount = L.accomplished(state.goals).length;
  const dueList = active.filter((g) => {
    const k = L.nextActionText(g, today).kind;
    return k === 'today' || k === 'overdue';
  });
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = (state.user.displayName || '').split(' ')[0] || 'there';

  const checkList = dueList.map((g) => {
    const j = L.journey(g, today);
    const av = L.exceptionAvailability(g, j.next.date);
    const label = j.next.date === today ? 'Today' : `Pending · ${fmtDate(j.next.date)}`;
    return `
      <div class="due-row" style="--c:${g.color}">
        <a class="due-title" href="#/goal/${encodeURIComponent(g.id)}">
          <span class="goal-icon sm">${icon(g.icon)}</span>
          <span><strong>${esc(g.title)}</strong><small>${esc(label)}</small></span>
        </a>
        <div class="due-actions">
          <button class="btn yes sm" data-action="checkin" data-goal="${g.id}" data-date="${j.next.date}" data-answer="yes">${icon('check')}Done</button>
          <button class="btn no sm" data-action="checkin" data-goal="${g.id}" data-date="${j.next.date}" data-answer="no" title="${esc(av.ok ? 'Uses an exception' : 'Restarts the journey')}">${icon('x')}Missed</button>
        </div>
      </div>`;
  }).join('');

  const body = active.length === 0 ? `
    <div class="empty">
      <div class="empty-orb">${icon('sprout')}</div>
      <h2>Start your first journey</h2>
      <p class="muted">Build a habit over 66 days, keep a sankalpa for your own number of days, or set a SMART goal with a deadline.</p>
      <button class="btn primary" data-action="new">${icon('plus')}New journey</button>
    </div>` : `
    <section class="block">
      <div class="block-head"><h2>Check in</h2><span class="muted">${dueList.length ? `${dueList.length} open` : 'All caught up'}</span></div>
      ${dueList.length ? `<div class="due-list">${checkList}</div>`
        : `<div class="all-clear">${icon('circle-check')}<span>Nothing waiting. Next days unlock as you check in.</span></div>`}
    </section>
    <section class="block">
      <div class="block-head"><h2>Your journeys</h2></div>
      <div class="goal-grid">${active.map((g) => goalCard(g, today)).join('')}</div>
    </section>`;

  return `
    <div class="page-in-target">
      <header class="hero">
        <p class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1>${greet}, ${esc(name)}</h1>
        <div class="stats">
          <div class="stat">${icon('flame')}<div><strong>${active.length}</strong><span>Active</span></div></div>
          <div class="stat">${icon('trophy')}<div><strong>${accomplishedCount}</strong><span>Accomplished</span></div></div>
        </div>
      </header>
      ${body}
      ${active.length ? `<button class="fab" data-action="new" aria-label="New journey">${icon('plus')}<span>New</span></button>` : ''}
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

function viewGoal(id) {
  const g = state.goals.find((x) => x.id === id);
  if (!g) {
    return `<div class="empty"><h2>Journey not found</h2><a class="btn ghost" href="#/home">Back home</a></div>`;
  }
  const today = L.todayStr();
  const j = L.journey(g, today);
  const pct = Math.min(100, Math.round((j.done / g.targetDays) * 100));
  const r = 54;
  const circ = 2 * Math.PI * r;
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
      ? `A miss uses one of your ${nextExc.remaining} exception${nextExc.remaining > 1 ? 's' : ''} and ${g.type === 'smart' ? 'moves the deadline out by a day' : 'adds a day to the journey'}.`
      : (nextExc.reason === 'too_soon'
        ? `You already used an exception recently. A miss now restarts the journey. The next exception opens on ${fmtDate(nextExc.nextAllowed)}.`
        : nextExc.reason === 'not_allowed'
          ? 'Sankalpas have no exceptions. A miss restarts the journey.'
          : 'All exceptions are used. A miss restarts the journey.');
    panel = `
      <section class="panel checkin-panel">
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
      <div class="block-head"><h2>Earlier attempts</h2></div>
      <div class="attempt-list">${past.slice().reverse().map((h) => `
        <div class="attempt">
          <span class="attempt-n">#${h.attempt}</span>
          <div><strong>${fmtDate(h.startDate)} → ${fmtDate(h.endDate)}</strong>
          <small>${h.doneCount} of ${h.targetDays} days · ${esc(h.reason)}</small></div>
        </div>`).join('')}</div>
    </section>` : '';

  return `
    <div class="page-in-target">
      <header class="goal-head" style="--c:${g.color}">
        <a class="icon-btn back" href="#/home" aria-label="Back">${icon('arrow-left')}</a>
        <div class="goal-title">
          <span class="goal-icon lg">${icon(g.icon)}</span>
          <div>
            <p class="eyebrow">${typeName(g)} · Attempt ${g.attempt}</p>
            <h1>${esc(g.title)}</h1>
            ${g.why ? `<p class="why">${esc(g.why)}</p>` : ''}
          </div>
        </div>
        <button class="icon-btn" data-action="goal-settings" data-goal="${g.id}" aria-label="Edit journey">${icon('pencil')}</button>
      </header>

      <div class="overview">
        <div class="ring">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="${r}" class="ring-bg"></circle>
            <circle cx="60" cy="60" r="${r}" class="ring-fg" style="stroke-dasharray:${circ};stroke-dashoffset:${circ * (1 - pct / 100)}"></circle>
          </svg>
          <div class="ring-label"><strong>${pct}%</strong><span>${j.done}/${g.targetDays}</span></div>
        </div>
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

      ${g.type === 'smart' && g.smart ? smartPlanHTML(g) : ''}
      ${detailsHTML(g)}

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

function viewAccomplishments() {
  const tab = state.accTab;
  const done = L.accomplished(state.goals);
  const misses = L.notAccomplished(state.goals);
  const tabs = `
    <div class="segmented" role="tablist">
      <button role="tab" aria-selected="${tab === 'accomplished'}" class="${tab === 'accomplished' ? 'on' : ''}" data-action="acc-tab" data-tab="accomplished">${icon('trophy')}Accomplished <b>${done.length}</b></button>
      <button role="tab" aria-selected="${tab === 'missed'}" class="${tab === 'missed' ? 'on' : ''}" data-action="acc-tab" data-tab="missed">${icon('circle-x')}Not accomplished <b>${misses.length}</b></button>
    </div>`;

  let list;
  if (tab === 'accomplished') {
    list = done.length ? `<div class="acc-grid">${done.map((g) => {
      const exc = L.exceptionCount(g);
      return `
        <article class="acc-card" style="--c:${g.color}">
          <a class="acc-main" href="#/goal/${encodeURIComponent(g.id)}">
            <div class="goal-icon">${icon(g.icon)}</div>
            <div class="acc-body">
              <h3>${esc(g.title)}</h3>
              <p>${typeName(g)} · ${g.targetDays} days${exc ? ` · ${exc} exception${exc > 1 ? 's' : ''}` : ''}</p>
              <small>Completed ${fmtDate(g.completedAt?.slice(0, 10))}${g.attempt > 1 ? ` · attempt ${g.attempt}` : ''}</small>
            </div>
            <span class="acc-badge">${icon('circle-check')}</span>
          </a>
          <button class="btn ghost sm redo-btn" data-action="redo" data-goal="${g.id}">${icon('rotate-ccw')}Redo</button>
        </article>`;
    }).join('')}</div>` : emptyBlock('trophy', 'Nothing accomplished yet', 'Complete a journey and it will land here.');
  } else {
    list = misses.length ? `<div class="miss-list">${misses.map((m) => `
      <div class="miss-card" style="--c:${m.color}">
        <div class="goal-icon">${icon(m.icon)}</div>
        <div class="acc-body">
          <h3>${esc(m.title)} <span class="attempt-tag">#${m.attempt}</span></h3>
          <p>${fmtDate(m.startDate)} → ${fmtDate(m.endDate)} · ${m.doneCount} of ${m.targetDays} days</p>
          <small>${esc(m.reason)}</small>
        </div>
        <span class="outcome ${m.outcome}">${m.outcome === 'abandoned' ? 'Abandoned' : 'Not kept'}</span>
      </div>`).join('')}</div>` : emptyBlock('sparkles', 'No misses on record', 'Every journey you have started is still on track or accomplished.');
  }

  return `
    <div class="page-in-target">
      <header class="hero">
        <p class="eyebrow">Your record</p>
        <h1>Accomplishments</h1>
        <p class="muted">Nothing is ever deleted. Each attempt stays here, whether it was kept or not.</p>
      </header>
      ${tabs}
      <section class="block">${list}</section>
    </div>`;
}

function emptyBlock(iconName, title, text) {
  return `<div class="empty small"><div class="empty-orb">${icon(iconName)}</div><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p></div>`;
}

// ---------- dialogs ----------

// The five SMART answers as form fields. Used by the create and edit dialogs.
function smartFieldsHTML(values = {}) {
  return L.SMART_FIELDS.map((f) => `
    <label class="field">
      <span>${esc(f.label)}</span>
      <small class="muted field-hint">${esc(f.hint)}</small>
      <textarea name="${f.key}" rows="2" maxlength="500">${esc(values[f.key] || '')}</textarea>
    </label>`).join('');
}

// Shows only the fields that belong to the chosen type.
function showTypeFields(w, type) {
  w.querySelectorAll('[data-only]').forEach((el) => { el.hidden = el.dataset.only !== type; });
  const label = w.querySelector('[data-title-label]');
  if (label) label.textContent = type === 'smart' ? 'Goal' : 'Title';
}

const DETAIL_HINTS = {
  what: 'What exactly you will do',
  how: 'The steps or method you will use',
  where: 'The place or tool you will use',
  when: 'The time of day or schedule',
  more: 'Anything else that matters to you',
};

// Optional detail boxes, folded away until the user opens them.
function detailFieldsHTML(values = {}) {
  const filled = Object.values(values).some(Boolean);
  return `
    <details class="more-details"${filled ? ' open' : ''}>
      <summary>${icon('notebook-pen')} Add details: what, how, where, when</summary>
      ${L.DETAIL_KEYS.map((k) => `
        <label class="field"><span>${esc(L.DETAIL_LABELS[k])} <small class="muted">(optional)</small></span>
          <textarea name="d_${k}" rows="2" maxlength="1000" placeholder="${esc(DETAIL_HINTS[k])}">${esc(values[k] || '')}</textarea></label>`).join('')}
    </details>`;
}

function detailsFormValues(fd) {
  return L.cleanDetails(Object.fromEntries(L.DETAIL_KEYS.map((k) => [k, fd.get('d_' + k)])));
}

function detailsHTML(g) {
  const d = g.details || {};
  const rows = L.DETAIL_KEYS.filter((k) => d[k]);
  if (!rows.length) return '';
  return `
    <section class="block">
      <div class="block-head"><h2>Details</h2></div>
      <div class="smart-plan">${rows.map((k) => `
        <div class="smart-item">
          <span class="smart-k">${esc(L.DETAIL_LABELS[k])}</span>
          <p>${esc(d[k])}</p>
        </div>`).join('')}</div>
    </section>`;
}

function smartFormValues(fd) {
  return Object.fromEntries(L.SMART_FIELDS.map((f) => [f.key, fd.get(f.key)]));
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
      <label class="field"><span data-title-label>Title</span>
        <input name="title" maxlength="80" placeholder="e.g. Read 10 pages, Wake at 5am" required autocomplete="off"></label>
      <label class="field" data-only="sankalpa" hidden><span>Days</span>
        <input name="days" type="number" min="1" max="365" inputmode="numeric" placeholder="e.g. 30"></label>
      <div class="field-row">
        <label class="field"><span>Start date</span>
          <input name="startDate" type="date" value="${today}" required></label>
        <label class="field" data-only="smart" hidden><span>Deadline</span>
          <input name="endDate" type="date" value="${L.addDays(today, 29)}"></label>
      </div>
      <div data-only="smart" hidden>
        <p class="muted form-hint">${icon('target')} Answer each part in your own words. You check in every day until the deadline.</p>
        ${smartFieldsHTML()}
      </div>
      <label class="field"><span>Why (optional)</span>
        <textarea name="why" rows="2" maxlength="500" placeholder="The reason this matters to you"></textarea></label>
      ${detailFieldsHTML()}
      <div class="field"><span>Icon</span>${iconPicker('', { auto: true })}</div>
      <div class="field"><span>Color</span>${colorPicker(COLORS[0])}</div>
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
      form.addEventListener('change', (e) => {
        if (e.target.name === 'type') showTypeFields(w, e.target.value);
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.hidden = true;
        const fd = new FormData(form);
        try {
          const data = L.newGoalData({
            type: fd.get('type'),
            title: fd.get('title'),
            why: fd.get('why'),
            days: fd.get('days'),
            startDate: fd.get('startDate'),
            endDate: fd.get('endDate'),
            smart: smartFormValues(fd),
            details: detailsFormValues(fd),
            icon: fd.get('icon'),
            color: fd.get('color'),
          });
          const id = await db.createGoal(state.user.uid, data);
          close();
          location.hash = `#/goal/${encodeURIComponent(id)}`;
          toast(`${data.title} is on your sidebar`, 'success');
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        }
      });
      wireIconPicker(w);
      wireColorPicker(w);
      setTimeout(() => form.querySelector('[name="title"]').focus(), 60);
    },
  });
}

// Starts a new journey from an accomplished one. The date (and length or deadline) is chosen in the pop-up.
function openRedo(g) {
  if (!g || g.status !== 'completed') return;
  const d = L.redoDefaults(g);
  const body = `
    <form id="redo-form" class="form" novalidate>
      <p class="muted">${esc(g.title)} starts again as a new ${esc(typeName(g).toLowerCase())}. The accomplished record stays where it is.</p>
      <label class="field"><span>Start date</span>
        <input name="startDate" type="date" value="${d.startDate}" required></label>
      ${g.type === 'sankalpa' ? `<label class="field"><span>Days</span>
        <input name="days" type="number" min="1" max="365" inputmode="numeric" value="${d.days}"></label>` : ''}
      ${g.type === 'smart' ? `<label class="field"><span>Deadline</span>
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
            startDate: fd.get('startDate'),
            days: fd.get('days'),
            endDate: fd.get('endDate'),
          });
          const id = await db.createGoal(state.user.uid, data);
          close();
          location.hash = `#/goal/${encodeURIComponent(id)}`;
          toast(`${g.title} is back on your sidebar`, 'success');
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        }
      });
    },
  });
}

function openGoalSettings(g) {
  // The start date can change only before the first check-in, so the grid never shifts under existing days.
  const startEditable = g.status === 'active' && Object.keys(g.checkins || {}).length === 0;
  const body = `
    <form id="edit-form" class="form" novalidate>
      <label class="field"><span>Title</span>
        <input name="title" maxlength="80" required value="${esc(g.title)}"></label>
      <label class="field"><span>Start date${startEditable ? '' : ' (locked after the first check-in)'}</span>
        <input name="startDate" type="date" value="${esc(g.attemptStart)}" ${startEditable ? '' : 'disabled'}></label>
      ${g.type === 'smart' ? `
        ${startEditable
          ? `<label class="field"><span>Deadline</span><input name="endDate" type="date" value="${esc(g.smart?.endDate || '')}"></label>`
          : '<p class="muted form-hint">The deadline is locked after the first check-in.</p>'}
        ${smartFieldsHTML(g.smart || {})}` : ''}
      <label class="field"><span>Why</span>
        <textarea name="why" rows="2" maxlength="500">${esc(g.why)}</textarea></label>
      ${detailFieldsHTML(g.details || {})}
      <div class="field"><span>Icon</span>${iconPicker(g.icon)}</div>
      <div class="field"><span>Color</span>${colorPicker(g.color)}</div>
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
      wireIconPicker(w);
      wireColorPicker(w);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const title = String(fd.get('title') || '').trim();
        if (!title) { errBox.textContent = 'Title cannot be empty.'; errBox.hidden = false; return; }
        try {
          const fields = {
            title: title.slice(0, 80),
            why: String(fd.get('why') || '').trim().slice(0, 500),
            icon: fd.get('icon') || g.icon,
            color: fd.get('color') || g.color,
          };
          fields.details = detailsFormValues(fd);
          if (startEditable) fields.attemptStart = L.normalizeStartDate(fd.get('startDate'));
          if (g.type === 'smart') {
            const start = fields.attemptStart || g.attemptStart;
            const end = startEditable ? L.normalizeEndDate(fd.get('endDate'), start) : g.smart.endDate;
            fields.smart = { ...L.cleanSmart(smartFormValues(fd)), endDate: end };
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
          location.hash = '#/home';
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
        <div class="avatar">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="">` : icon('user')}</div>
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
        ? `This day is recorded as an exception. You have ${av.remaining} left and ${g.type === 'smart' ? 'the deadline moves out by one day' : 'the journey grows by one day'}.`
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
      case 'goal-settings': openGoalSettings(state.goals.find((x) => x.id === act.dataset.goal)); break;
      case 'acc-tab': state.accTab = act.dataset.tab; render(); break;
      case 'redo': openRedo(state.goals.find((x) => x.id === act.dataset.goal)); break;
      default: break;
    }
    return;
  }
  // Touch/keyboard: tapping an open day toggles its check-in popover.
  const cell = e.target.closest('.cell.is-active');
  document.querySelectorAll('.cell.open').forEach((c) => { if (c !== cell) c.classList.remove('open'); });
  if (cell) cell.classList.toggle('open');
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

  let html;
  if (r.name === 'goal') html = viewGoal(r.id);
  else if (r.name === 'accomplishments') html = viewAccomplishments();
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
        (goals) => { state.goals = goals; state.goalsReady = true; render(); },
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
