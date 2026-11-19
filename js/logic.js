// SANKALP core rules. Pure functions only: no Firebase, no DOM.
// Every journey is stored as a "goal" document. Dates are local calendar strings "YYYY-MM-DD".
//
// Habits and sankalpas are checked off day by day (yes or no).
// SMART goals are tracked with numbers: a plan of actionable items, each with a measurable
// amount per day or per week, logged as the user goes. A SMART goal has no exceptions.

export const HABIT_DAYS = 66;
export const MAX_EXCEPTIONS = 2;        // habit: max exception days per attempt
export const EXCEPTION_GAP_DAYS = 15;   // habit: a second exception must be at least this many days after the first
export const SANKALPA_MIN_DAYS = 1;
export const SANKALPA_MAX_DAYS = 365;
export const SMART_MAX_DAYS = 365;
export const MAX_PLAN_ROWS = 10;
export const WEEK_DAYS = 7;

// How often a SMART plan item is measured, in days. "per day" is 1, "per month" is 30.
export const PERIOD_DAYS = { day: 1, week: 7, biweekly: 14, month: 30 };
export const PERIOD_OPTIONS = [
  ['day', 'per day'], ['week', 'per week'], ['biweekly', 'per 2 weeks'], ['month', 'per month'],
];
export const periodLabel = (per) => (PERIOD_OPTIONS.find(([k]) => k === per) || PERIOD_OPTIONS[0])[1];

export const TYPES = ['habit', 'sankalpa', 'smart'];
export const TYPE_LABEL = { habit: 'Habit', sankalpa: 'Sankalpa', smart: 'SMART goal' };

// The text parts of a SMART goal. Actionable and measurable are the plan table instead.
export const SMART_FIELDS = [
  { key: 'specific', label: 'Specific', hint: 'What exactly will you do, and where or with whom?' },
  { key: 'realistic', label: 'Realistic', hint: 'Why is this doable with your time, skills and resources?' },
  { key: 'timeBound', label: 'Time-bound', hint: 'When does it start and end, and why that deadline?' },
];

// ---------- date helpers ----------

const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(now = new Date()) {
  return toDateStr(now);
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// number of days from a to b (b - a)
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

// ---------- icon selection ----------

// Keyword rules for the Auto icon. The first matching rule wins, so specific words come first.
// Every icon named here must exist in ICON_GROUPS in js/choices.js (a test checks this).
const ICON_RULES = [
  [/\b(languages?|english|hindi|spanish|french|german|japanese|chinese|vocabulary|vocab)\b/i, 'languages'],
  [/\b(read|reading|book|books|novel|chapters?|pages?)\b/i, 'book-open'],
  [/\b(study|studying|learn|learning|course|lecture|revise|revision|exams?)\b/i, 'graduation-cap'],
  [/\b(gym|workout|exercise|lift|lifting|weights?|push-?ups?|squats?|strength|fitness|training)\b/i, 'dumbbell'],
  [/\b(run|running|jog|jogging|walk|walking|steps?|hike|hiking)\b/i, 'footprints'],
  [/\b(cycle|cycling|bike|biking|ride|riding)\b/i, 'bike'],
  [/\b(swim|swimming|pool)\b/i, 'waves'],
  [/\b(yoga|stretch\w*)\b/i, 'person-standing'],
  [/\b(meditat\w*|mindful\w*|breath\w*|calm|silence|silent)\b/i, 'brain'],
  [/\b(water|hydrat\w*)\b/i, 'droplet'],
  [/\b(coffee|tea|chai)\b/i, 'coffee'],
  [/\b(drink|drinks)\b/i, 'glass-water'],
  [/\b(sleep|sleeping|bedtime|bed|nap|rest)\b/i, 'moon'],
  [/\b(wake|wakeup|early|morning|sunrise|dawn)\b/i, 'sunrise'],
  [/\b(pray\w*|prayer|temple|church|worship|bible|quran|gita|scripture)\b/i, 'church'],
  [/\b(gratitude|grateful|thank\w*)\b/i, 'heart'],
  [/\b(kindness|kind|love|compassion|hug|hugs)\b/i, 'hand-heart'],
  [/\b(write|writing|blog|essay|story|poem|poetry)\b/i, 'pen-line'],
  [/\b(journal\w*|diary|notes?)\b/i, 'notebook-pen'],
  [/\b(quit|stop|avoid|no|smoking|smoke|cigarettes?|alcohol|sugar|junk|gaming)\b/i, 'ban'],
  [/\b(cook\w*|recipes?)\b/i, 'chef-hat'],
  [/\b(diet|healthy|eat\w*|food|meals?|salad)\b/i, 'salad'],
  [/\b(fruits?)\b/i, 'apple'],
  [/\b(vegetables?|veggies?)\b/i, 'carrot'],
  [/\b(protein|eggs?)\b/i, 'egg'],
  [/\b(music|sing|singing|song|songs)\b/i, 'music'],
  [/\b(guitar)\b/i, 'guitar'],
  [/\b(piano)\b/i, 'piano'],
  [/\b(drums?)\b/i, 'drum'],
  [/\b(paint\w*|draw\w*|sketch\w*|art|artist)\b/i, 'palette'],
  [/\b(photo\w*|camera)\b/i, 'camera'],
  [/\b(film|films|movies?|cinema)\b/i, 'clapperboard'],
  [/\b(code|coding|program\w*|develop\w*|software|python|javascript|github|project)\b/i, 'code'],
  [/\b(save|saving|money|budget\w*|spend\w*|expenses?)\b/i, 'piggy-bank'],
  [/\b(invest\w*|stocks?)\b/i, 'chart-line'],
  [/\b(income|salary|earn\w*)\b/i, 'circle-dollar-sign'],
  [/\b(garden\w*|plant\w*|trees?|nature|outdoors?|green|eco)\b/i, 'leaf'],
  [/\b(travel\w*|trip|flight|plane)\b/i, 'plane'],
  [/\b(phone|screen|social|digital|laptop|computer)\b/i, 'smartphone'],
  [/\b(focus|concentrat\w*)\b/i, 'focus'],
  [/\b(work|career|job|office|promotion|interview|resume)\b/i, 'briefcase'],
  [/\b(call|talk|speak|conversation|chat)\b/i, 'message-circle'],
  [/\b(friends?|family|parents?|mom|mum|dad|kids?|partner|relationship)\b/i, 'users'],
  [/\b(clean\w*|tidy|declutter|laundry|chores?)\b/i, 'brush'],
  [/\b(house|home)\b/i, 'house'],
  [/\b(smile|smiling|happy|happiness|joy)\b/i, 'smile'],
  [/\b(games?|gaming|play)\b/i, 'gamepad-2'],
  [/\b(sun|sunlight)\b/i, 'sun'],
  [/\b(sankalp\w*|vow|commit\w*|discipline|consisten\w*)\b/i, 'mountain'],
  [/\b(goals?|aim|achieve\w*|target|milestone)\b/i, 'target'],
  [/\b(timer|pomodoro|minutes?)\b/i, 'timer'],
  [/\b(daily|routine|everyday)\b/i, 'repeat'],
];

/** Picks the best icon from the title. The user never has to choose one at creation. */
export function suggestIcon(title, type = 'habit') {
  for (const [pattern, name] of ICON_RULES) {
    if (pattern.test(title || '')) return name;
  }
  if (type === 'sankalpa') return 'mountain';
  if (type === 'smart') return 'target';
  return 'repeat';
}

// ---------- rules per type ----------

/** Only habits allow exception days. Sankalpas and SMART goals have none. */
export function policyFor(goal) {
  if (goal.type === 'habit') return { maxExceptions: MAX_EXCEPTIONS, gapDays: EXCEPTION_GAP_DAYS };
  return { maxExceptions: 0, gapDays: 0 };
}

// ---------- goal creation ----------

function normalizeDate(value, message) {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(message);
  const [y, m, d] = s.split('-').map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) {
    throw new Error(message);
  }
  return s;
}

/**
 * Validates a "YYYY-MM-DD" start date from a form. Empty means today.
 * Returns the cleaned string or throws a user-facing error.
 */
export function normalizeStartDate(value, now = new Date()) {
  const s = String(value ?? '').trim();
  if (!s) return todayStr(now);
  return normalizeDate(s, 'Pick a valid start date.');
}

/** Number of days a SMART goal runs, both ends included. */
export function smartLength(startDate, endDate) {
  if (endDate < startDate) throw new Error('The deadline must be on or after the start date.');
  const n = diffDays(startDate, endDate) + 1;
  if (n > SMART_MAX_DAYS) throw new Error(`A SMART goal can run for at most ${SMART_MAX_DAYS} days.`);
  return n;
}

export function normalizeEndDate(value, startDate) {
  const end = normalizeDate(value, 'Pick a valid deadline date.');
  smartLength(startDate, end);
  return end;
}

/**
 * A SMART goal ends on a chosen deadline, or on start + number of days when no deadline is given.
 * If both are given, the deadline wins.
 */
export function resolveSmartEnd(startDate, { endDate = '', days = '' } = {}) {
  if (String(endDate ?? '').trim()) return normalizeEndDate(endDate, startDate);
  const n = Math.floor(Number(String(days ?? '').trim()));
  if (!Number.isFinite(n) || n < 1) throw new Error('Enter how many days, or pick a deadline.');
  if (n > SMART_MAX_DAYS) throw new Error(`A SMART goal can run for at most ${SMART_MAX_DAYS} days.`);
  return addDays(startDate, n - 1);
}

// Small words stay lower case in a title, unless they start it.
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'via', 'vs', 'with']);

/** Capitalises the first letter of each word, keeping small words lower case. Everything we store goes through this. */
export function titleCase(text) {
  let first = true;
  return String(text ?? '').split(/(\s+)/).map((part) => {
    if (!part.trim()) return part;
    const isFirst = first;
    first = false;
    if (!isFirst && SMALL_WORDS.has(part.toLowerCase())) return part.toLowerCase();
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join('');
}

/** Checks the three text parts of a SMART goal. Every part is required. */
export function cleanSmart(input = {}) {
  const out = {};
  for (const { key, label } of SMART_FIELDS) {
    const v = titleCase(String(input[key] ?? '').trim());
    if (!v) throw new Error(`Fill in the "${label}" part.`);
    if (v.length > 500) throw new Error(`"${label}" must be 500 characters or fewer.`);
    out[key] = v;
  }
  return out;
}

/**
 * The SMART plan: rows of { action, amount, unit, per }.
 * "per" is 'day' or 'week'. Blank rows are ignored. At least one row is required.
 */
export function cleanPlan(rows = []) {
  const list = (Array.isArray(rows) ? rows : []).filter(
    (r) => r && (String(r.action ?? '').trim() || String(r.amount ?? '').trim()),
  );
  if (!list.length) throw new Error('Add at least one actionable item with an amount.');
  if (list.length > MAX_PLAN_ROWS) throw new Error(`Use at most ${MAX_PLAN_ROWS} actionable items.`);
  const cleaned = list.map((r, i) => {
    const action = titleCase(String(r.action ?? '').trim());
    if (!action) throw new Error(`Row ${i + 1}: describe the actionable item.`);
    if (action.length > 200) throw new Error('Each actionable item must be 200 characters or fewer.');
    const amount = Number(String(r.amount ?? '').trim());
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
      throw new Error(`"${action}": enter a measurable amount above zero.`);
    }
    return {
      action,
      amount,
      unit: '',              // the unit box was removed; the action text says what is counted
      per: PERIOD_DAYS[r.per] ? r.per : 'day',
      key: r.key === undefined || r.key === null || r.key === '' ? null : Number(r.key),
    };
  });
  // Stable keys: a logged number belongs to its item for life, even when rows are edited or added.
  let next = Math.max(-1, ...cleaned.map((p) => (Number.isFinite(p.key) ? p.key : -1))) + 1;
  return cleaned.map((p) => (Number.isFinite(p.key) ? p : { ...p, key: next++ }));
}

/** Every journey needs a reason. It is the first thing shown when the urge to quit arrives. */
export function requireWhy(value) {
  const why = titleCase(String(value ?? '').trim());
  if (!why) throw new Error('Write why this matters to you.');
  return why.slice(0, 500);
}

/** Every journey needs a description too. Everything is required by default. */
export function cleanDescription(value) {
  const text = titleCase(String(value ?? '').trim()).slice(0, 1000);
  if (!text) throw new Error('Write a short description.');
  return text;
}

/** Next position for a new journey, after every existing one. */
export function nextOrder(goals) {
  const top = goals.reduce((m, g) => (Number.isFinite(g.order) ? Math.max(m, g.order) : m), -1);
  return top + 1;
}

/** Journeys in the order the user arranged them. Journeys without a position go last, oldest first. */
export function sortByOrder(goals) {
  return [...goals].sort(
    (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)
      || String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
  );
}

export function newGoalData({
  type, title, description, why, days, endDate, smart, icon, color, startDate, order = null,
  redoOf = null, now = new Date(),
}) {
  const clean = titleCase(String(title || '').trim());
  if (!clean) throw new Error(type === 'smart' ? 'Write your SMART goal.' : 'Give your habit or sankalpa a title.');
  if (clean.length > 80) throw new Error('Title must be 80 characters or fewer.');
  if (!TYPES.includes(type)) throw new Error('Unknown type.');
  const reason = requireWhy(why);

  const start = normalizeStartDate(startDate, now);
  let targetDays = HABIT_DAYS;
  let smartData = null;

  if (type === 'sankalpa') {
    targetDays = Math.floor(Number(days));
    if (!Number.isFinite(targetDays) || targetDays < SANKALPA_MIN_DAYS || targetDays > SANKALPA_MAX_DAYS) {
      throw new Error(`Sankalpa length must be between ${SANKALPA_MIN_DAYS} and ${SANKALPA_MAX_DAYS} days.`);
    }
  }
  if (type === 'smart') {
    const end = resolveSmartEnd(start, { endDate, days });
    targetDays = smartLength(start, end);
    smartData = {
      ...cleanSmart(smart),
      plan: cleanPlan(smart?.plan),
      endDate: end,
    };
  }

  const iso = now.toISOString();
  return {
    schemaVersion: 1,
    type,
    title: clean,
    description: cleanDescription(description),
    why: reason,
    targetDays,
    smart: smartData,        // null unless type is 'smart'
    icon: icon || suggestIcon(clean, type),
    color: color || '#14B8A6',
    status: 'active',
    attempt: 1,
    attemptStart: start,
    checkins: {},           // habit and sankalpa: { "YYYY-MM-DD": "done" | "exception" } for this attempt
    logs: {},               // SMART: { "YYYY-MM-DD": { [planIndex]: number } }. Weekly items use the week's first day.
    history: [],            // archived attempts: failed / abandoned / expired (never deleted)
    redoOf,                 // id of the accomplished journey this one repeats, or null
    order,
    createdAt: iso,
    updatedAt: iso,
    completedAt: null,
  };
}

// ---------- redo ----------

/** Default values for the Redo dialog: start today, same length as before. */
export function redoDefaults(goal, today = todayStr()) {
  return {
    startDate: today,
    days: goal.targetDays,
    endDate: addDays(today, goal.targetDays - 1),
    why: goal.why || '',
    description: goal.description || '',
  };
}

/**
 * Builds a new journey that repeats an accomplished one. The original stays under Accomplishments.
 * Only accomplished journeys can be redone.
 */
export function redoData(goal, { startDate, days, endDate, why, description, order = null, fromMiss = false, now = new Date() } = {}) {
  if (goal.status !== 'completed' && !fromMiss) throw new Error('Only accomplished journeys can be redone.');
  return newGoalData({
    type: goal.type,
    title: goal.title,
    description: description ?? goal.description ?? '',
    why: why ?? goal.why,
    days: goal.type === 'sankalpa' ? (days ?? goal.targetDays) : undefined,
    endDate: goal.type === 'smart' ? endDate : undefined,
    smart: goal.smart || undefined,
    icon: goal.icon,
    color: goal.color,
    startDate,
    order,
    redoOf: goal.id,
    now,
  });
}

/** A sankalpa's length can change, but never below the days already done. */
export function cleanSankalpaDays(goal, value) {
  const n = Math.floor(Number(String(value ?? '').trim()));
  if (!Number.isFinite(n) || n < SANKALPA_MIN_DAYS || n > SANKALPA_MAX_DAYS) {
    throw new Error(`Sankalpa length must be between ${SANKALPA_MIN_DAYS} and ${SANKALPA_MAX_DAYS} days.`);
  }
  const done = doneCount(goal);
  if (n < done) throw new Error(`The length cannot be less than the ${done} days already done.`);
  return n;
}

// ---------- habit and sankalpa math ----------

export function exceptionDates(goal) {
  return Object.keys(goal.checkins || {})
    .filter((k) => goal.checkins[k] === 'exception')
    .sort();
}

export function exceptionCount(goal) {
  return exceptionDates(goal).length;
}

export function doneCount(goal) {
  return Object.values(goal.checkins || {}).filter((v) => v === 'done').length;
}

// Target days plus every exception taken so far: 66 becomes 67, then 68.
export function totalCells(goal) {
  return goal.targetDays + exceptionCount(goal);
}

export function exceptionAvailability(goal, date) {
  const { maxExceptions, gapDays } = policyFor(goal);
  if (maxExceptions === 0) {
    return { ok: false, reason: 'not_allowed', remaining: 0 };
  }
  const used = exceptionDates(goal);
  if (used.length >= maxExceptions) {
    return { ok: false, reason: 'exhausted', remaining: 0 };
  }
  const last = used[used.length - 1];
  if (last && gapDays && diffDays(last, date) < gapDays) {
    return {
      ok: false,
      reason: 'too_soon',
      remaining: maxExceptions - used.length,
      nextAllowed: addDays(last, gapDays),
    };
  }
  return { ok: true, remaining: maxExceptions - used.length };
}

/**
 * Builds the cell list for the journey grid.
 * state: 'done' | 'exception' | 'active' (the one day open for check-in) | 'queued' (unlocked by date
 * but waiting behind an earlier unresolved day) | 'locked' (future day)
 */
export function journey(goal, today) {
  const total = totalCells(goal);
  const cells = [];
  let next = null;
  for (let i = 0; i < total; i++) {
    const date = addDays(goal.attemptStart, i);
    const v = goal.checkins?.[date];
    let state;
    if (v === 'done') state = 'done';
    else if (v === 'exception') state = 'exception';
    else if (date > today) state = 'locked';
    else if (next === null) {
      state = 'active';
      next = { index: i, date };
    } else state = 'queued';
    cells.push({ index: i, date, state });
  }
  return { total, cells, next, done: doneCount(goal), exceptions: exceptionCount(goal) };
}

// ---------- SMART math ----------
//
// Each plan item is logged per day. A day is met when every item reaches its per-day amount
// (a "per week" item needs its weekly amount divided by 7). The first unmet day is the open day:
// the next day only opens once the open day is met, just like the habit grid.
// The end date is not fixed: it follows the pace so far, so it stretches when progress is slow
// and shortens when progress is fast.

export function smartPhase(goal, today = todayStr()) {
  return today < goal.attemptStart ? 'upcoming' : 'running';
}

// Total to reach over the planned length. A "per week" item counts whole weeks.
function itemTotal(goal, p) {
  const period = PERIOD_DAYS[p.per] || 1;
  return period === 1 ? p.amount * goal.targetDays : Math.ceil((p.amount * goal.targetDays) / period);
}

// What one day needs for this item.
function dayTargetOf(p) {
  return p.amount / (PERIOD_DAYS[p.per] || 1);
}

/**
 * Where a SMART goal stands today: targets, the day-by-day map, the open day, and the projected end.
 * Every number is derived from goal.logs, so it always matches what was entered.
 */
export function smartProgress(goal, today = todayStr()) {
  const plan = goal.smart?.plan || [];
  const logs = goal.logs || {};
  const start = goal.attemptStart;
  const plannedDays = goal.targetDays;
  const plannedEnd = goal.smart?.endDate;
  const phase = smartPhase(goal, today);
  const elapsed = phase === 'upcoming' ? 0 : diffDays(start, today) + 1;

  const items = plan.map((p, pos) => {
    const index = Number.isFinite(p.key) ? p.key : pos;
    const total = itemTotal(goal, p);
    let done = 0;
    for (const vals of Object.values(logs)) {
      const v = Number(vals?.[index]);
      if (Number.isFinite(v)) done += v;
    }
    const remaining = Math.max(0, total - done);
    return {
      ...p,
      index,
      total,
      done,
      remaining,
      dayTarget: dayTargetOf(p),
      pace: elapsed ? done / elapsed : 0,         // units per day so far
      ratio: total ? Math.min(1, done / total) : 0,
      complete: done >= total,
    };
  });
  const complete = items.length > 0 && items.every((it) => it.complete);

  const valueOn = (date, index) => Number(logs[date]?.[index] ?? 0);
  const dayMet = (date) => items.length > 0 && items.every((it) => valueOn(date, it.index) >= it.dayTarget);

  // Projection: the slowest item sets the finish. No progress yet means the planned rate.
  let projectedRemaining = 0;
  if (!complete && elapsed > 0) {
    for (const it of items) {
      if (it.remaining <= 0) continue;
      const rate = it.pace > 0 ? it.pace : it.total / plannedDays;   // no progress yet: the planned average
      projectedRemaining = Math.max(projectedRemaining, Math.ceil(it.remaining / rate - 1e-9));
    }
  }
  const projectedEnd = phase === 'upcoming' || complete || projectedRemaining === 0
    ? plannedEnd
    : addDays(today, projectedRemaining - 1);
  const projectedDays = diffDays(start, projectedEnd) + 1;

  // Day map, from the first day to the projected end.
  let openDay = null;
  const days = [];
  for (let i = 0; i < projectedDays; i++) {
    const date = addDays(start, i);
    const met = date <= today ? dayMet(date) : false;
    let state;
    if (date > today) state = 'locked';
    else if (met) state = 'done';
    else if (openDay === null) {
      state = 'active';
      openDay = date;
    } else state = 'queued';
    days.push({ index: i, date, state });
  }

  let zeroDays = 0;
  let loggedDays = 0;
  for (const [date, vals] of Object.entries(logs)) {
    if (date < start || date > today) continue;
    loggedDays++;
    if (items.length && items.every((it) => valueOn(date, it.index) === 0)) zeroDays++;
  }

  // Whether the pace puts the finish later or earlier than planned.
  let verdict = null;
  if (phase === 'running' && !complete) {
    if (projectedDays > plannedDays) verdict = 'extended';
    else if (projectedDays < plannedDays) verdict = 'ahead';
    else verdict = 'on-track';
  }

  const daysLeft = complete ? 0 : Math.max(0, diffDays(today, projectedEnd) + 1);
  const ratio = items.length ? items.reduce((a, it) => a + it.ratio, 0) / items.length : 0;
  return {
    phase,
    items,
    complete,
    ratio,
    days,
    openDay,
    zeroDays,
    loggedDays,
    daysLeft,
    planned: { days: plannedDays, end: plannedEnd },
    projected: { days: projectedDays, end: projectedEnd },
    verdict,
  };
}

/**
 * Saves numbers for a SMART goal. entries: [{ index, date, value }] for any day from the start up to today.
 * Logging the last target marks the goal accomplished.
 */
export function applySmartLog(goal, entries, now = new Date()) {
  if (goal.status !== 'active') throw new Error('This journey is no longer active.');
  if (goal.type !== 'smart' || !goal.smart) throw new Error('Only SMART goals take daily numbers.');
  const today = todayStr(now);
  if (smartPhase(goal, today) === 'upcoming') throw new Error(`This goal starts on ${goal.attemptStart}.`);

  const plan = goal.smart.plan || [];
  const logs = { ...(goal.logs || {}) };
  for (const e of entries || []) {
    const item = plan.find((p, pos) => (Number.isFinite(p.key) ? p.key : pos) === Number(e.index));
    if (!item) throw new Error('That actionable item no longer exists.');
    const v = Number(e.value);
    if (!Number.isFinite(v) || v < 0 || v > 1000000) {
      throw new Error(`Enter a number of zero or more for "${item.action}".`);
    }
    const date = String(e.date || '');
    if (date < goal.attemptStart || date > today) throw new Error('That day is not open for logging yet.');
    logs[date] = { ...(logs[date] || {}), [e.index]: v };
  }

  const iso = now.toISOString();
  const progress = smartProgress({ ...goal, logs }, today);
  const patch = { logs, updatedAt: iso };
  if (progress.complete) {
    patch.status = 'completed';
    patch.completedAt = iso;
  }
  return { outcome: progress.complete ? 'completed' : 'saved', progress, patch };
}

// ---------- state transitions ----------

/**
 * Applies a yes/no answer to the one open day. Returns { outcome, patch, ... }.
 * patch is a partial goal document that the caller writes (never deletes data).
 */
export function applyCheckin(goal, date, answer, now = new Date()) {
  if (goal.type === 'smart') throw new Error('SMART goals are logged with numbers, not yes or no.');
  if (goal.status !== 'active') throw new Error('This journey is no longer active.');
  const today = todayStr(now);
  const iso = now.toISOString();
  const j = journey(goal, today);
  if (!j.next || j.next.date !== date) {
    throw new Error('That day is not open for check-in yet.');
  }

  if (answer === 'yes') {
    const checkins = { ...goal.checkins, [date]: 'done' };
    const done = Object.values(checkins).filter((v) => v === 'done').length;
    if (done >= goal.targetDays) {
      return {
        outcome: 'completed',
        patch: { checkins, status: 'completed', completedAt: iso, updatedAt: iso },
      };
    }
    return { outcome: 'done', patch: { checkins, updatedAt: iso } };
  }

  if (answer !== 'no') throw new Error('Answer must be yes or no.');

  const avail = exceptionAvailability(goal, date);
  if (avail.ok) {
    return {
      outcome: 'exception',
      remaining: avail.remaining - 1,
      patch: { checkins: { ...goal.checkins, [date]: 'exception' }, updatedAt: iso },
    };
  }

  // Failure: archive this attempt and restart the day after the missed day.
  const reason = missReason(avail);
  return {
    outcome: 'failed',
    reason,
    patch: {
      history: [...(goal.history || []), archiveAttempt(goal, { outcome: 'failed', reason, endDate: date })],
      attempt: goal.attempt + 1,
      attemptStart: addDays(date, 1),
      checkins: {},
      updatedAt: iso,
    },
  };
}

/** Why a miss cannot be covered by an exception. Used in the archive and in the UI. */
export function missReason(avail) {
  if (avail.reason === 'not_allowed') return 'Missed a day. Sankalpas have no exceptions';
  if (avail.reason === 'too_soon') return `Missed again within ${EXCEPTION_GAP_DAYS} days of the last exception`;
  return 'All exceptions were already used';
}

function archiveAttempt(goal, { outcome, reason = '', endDate }) {
  const isSmart = goal.type === 'smart' && goal.smart;
  const progress = isSmart ? smartProgress(goal, endDate) : null;
  return {
    attempt: goal.attempt,
    startDate: goal.attemptStart,
    endDate,
    outcome,              // 'failed' | 'abandoned'
    reason,
    targetDays: goal.targetDays,
    targets: isSmart ? goal.smart.plan.length : null,
    doneCount: isSmart ? progress.items.filter((it) => it.complete).length : doneCount(goal),
    exceptionsUsed: exceptionCount(goal),
    checkins: goal.checkins || {},
    logs: isSmart ? (goal.logs || {}) : {},
  };
}

export function applyAbandon(goal, now = new Date()) {
  if (goal.status !== 'active') throw new Error('Only active journeys can be abandoned.');
  const iso = now.toISOString();
  return {
    status: 'abandoned',
    history: [...(goal.history || []), archiveAttempt(goal, { outcome: 'abandoned', reason: 'Abandoned by you', endDate: todayStr(now) })],
    updatedAt: iso,
  };
}

// ---------- read helpers used by the UI ----------

/** Human text for the "today" line of a goal. */
export function nextActionText(goal, today) {
  if (goal.status === 'completed') return { kind: 'completed', text: 'Accomplished' };
  if (goal.status === 'abandoned') return { kind: 'closed', text: 'Closed' };
  if (goal.type === 'smart') {
    if (smartPhase(goal, today) === 'upcoming') return { kind: 'wait', text: `Starts ${goal.attemptStart}` };
    const p = smartProgress(goal, today);
    if (p.complete) return { kind: 'completed', text: 'Accomplished' };
    if (!p.openDay) return { kind: 'wait', text: 'Next day unlocks tomorrow' };
    if (p.openDay === today) return { kind: 'today', text: 'Log today' };
    return { kind: 'overdue', text: `Pending since ${p.openDay}` };
  }
  const j = journey(goal, today);
  if (!j.next) return { kind: 'none', text: '' };
  if (j.next.date === today) return { kind: 'today', text: 'Check in for today' };
  if (j.next.date < today) return { kind: 'overdue', text: `Pending since ${j.next.date}` };
  return { kind: 'wait', text: 'Next day unlocks tomorrow' };
}

export function dayNumber(goal, today) {
  const n = diffDays(goal.attemptStart, today) + 1;
  return Math.max(1, Math.min(n, totalCells(goal)));
}

/**
 * Every attempt that did not get accomplished, across all journeys: archived misses and
 * abandoned attempts, plus SMART goals whose deadline passed while still open.
 */
export function notAccomplished(goals, today = todayStr()) {
  const rows = [];
  for (const g of goals) {
    for (const h of g.history || []) {
      if (h.outcome === 'failed' || h.outcome === 'abandoned') {
        rows.push({ goalId: g.id, title: g.title, type: g.type, icon: g.icon, color: g.color, ...h });
      }
    }
  }
  return rows.sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''));
}

/**
 * Totals for the Check In screen.
 * total: active journeys. open: journeys waiting for a check-in now.
 * needed: fields still to fill across those. filled: journeys already recorded for today.
 */
export function checkinSummary(goals, today = todayStr()) {
  let open = 0;
  let needed = 0;
  let filled = 0;
  const active = goals.filter((g) => g.status === 'active');
  for (const g of active) {
    if (g.type === 'smart' && g.smart) {
      const p = smartProgress(g, today);
      const logs = g.logs || {};
      const entered = (date) => p.items.length > 0 && p.items.every((it) => logs[date]?.[it.index] !== undefined);
      if (entered(today)) filled++;
      if (p.phase === 'running' && !p.complete && p.openDay && !(p.openDay === today && entered(today))) {
        open++;
        needed += p.items.filter((it) => logs[p.openDay]?.[it.index] === undefined).length;
      }
    } else {
      if (g.checkins?.[today]) filled++;
      const kind = nextActionText(g, today).kind;
      if (kind === 'today' || kind === 'overdue') {
        open++;
        needed++;
      }
    }
  }
  return { total: active.length, open, needed, filled };
}

/** True while a journey is waiting for a check-in: a day is due and not yet entered for today. */
export function needsCheckin(goal, today = todayStr()) {
  if (goal.status !== 'active') return false;
  if (goal.type === 'smart' && goal.smart) {
    const p = smartProgress(goal, today);
    const logs = goal.logs || {};
    const enteredToday = p.items.length > 0 && p.items.every((it) => logs[today]?.[it.index] !== undefined);
    return p.phase === 'running' && !p.complete && !!p.openDay && !(p.openDay === today && enteredToday);
  }
  const kind = nextActionText(goal, today).kind;
  return kind === 'today' || kind === 'overdue';
}

export function accomplished(goals) {
  return goals
    .filter((g) => g.status === 'completed')
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
}
