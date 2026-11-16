// SANKALP core rules. Pure functions only: no Firebase, no DOM.
// Every journey is stored as a "goal" document. Dates are local calendar strings "YYYY-MM-DD".

export const HABIT_DAYS = 66;
export const MAX_EXCEPTIONS = 2;
export const EXCEPTION_GAP_DAYS = 15; // a second exception must be at least this many days after the first
export const SANKALPA_MIN_DAYS = 1;
export const SANKALPA_MAX_DAYS = 365;

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

// The first matching rule wins, so more specific rules come first.
const ICON_RULES = [
  [/\b(read|reading|book|books|study|studying|learn|pages?)\b/i, 'book-open'],
  [/\b(gym|workout|exercise|lift|weights?|push-?ups?|squats?|strength|fitness)\b/i, 'dumbbell'],
  [/\b(run|running|jog|jogging|walk|walking|steps?|hike|hiking|cycle|cycling)\b/i, 'footprints'],
  [/\b(water|drink|hydrat\w*)\b/i, 'droplet'],
  [/\b(sleep|sleeping|bed|bedtime|night)\b/i, 'moon'],
  [/\b(meditat\w*|mindful\w*|breath\w*|calm|yoga)\b/i, 'brain'],
  [/\b(pray\w*|prayer|temple|worship|gratitude|grateful|faith|god)\b/i, 'heart'],
  [/\b(wake|wakeup|early|morning|sunrise|sun)\b/i, 'sun'],
  [/\b(write|writing|journal\w*|diary|blog|essay)\b/i, 'pen-line'],
  [/\b(diet|healthy|eat\w*|food|fruits?|vegetables?|veggies?|salad|protein|meals?|cook\w*)\b/i, 'apple'],
  [/\b(coffee|tea|chai)\b/i, 'coffee'],
  [/\b(quit|stop|avoid|no|smoking|smoke|cigarettes?|alcohol|sugar|junk|gaming)\b/i, 'ban'],
  [/\b(music|guitar|piano|sing\w*|instrument|violin|drums?)\b/i, 'music'],
  [/\b(code|coding|program\w*|develop\w*|software|python|javascript|project)\b/i, 'code'],
  [/\b(english|hindi|spanish|french|german|language|languages|vocabulary|words)\b/i, 'languages'],
  [/\b(save|saving|money|budget|spend\w*|invest\w*|expenses?)\b/i, 'piggy-bank'],
  [/\b(garden\w*|plant\w*|trees?|nature|outdoors?|green)\b/i, 'leaf'],
  [/\b(focus|deep work|work|career|goals?)\b/i, 'target'],
  [/\b(sankalp\w*|vow|commit\w*|discipline)\b/i, 'mountain'],
];

/** Picks the best icon from the title. The user never has to choose one at creation. */
export function suggestIcon(title, type = 'habit') {
  for (const [pattern, name] of ICON_RULES) {
    if (pattern.test(title || '')) return name;
  }
  return type === 'sankalpa' ? 'mountain' : 'sparkles';
}

// ---------- goal creation ----------

export function newGoalData({ type, title, why = '', days, icon, color, now = new Date() }) {
  const clean = String(title || '').trim();
  if (!clean) throw new Error('Give your habit or sankalpa a title.');
  if (clean.length > 80) throw new Error('Title must be 80 characters or fewer.');
  if (type !== 'habit' && type !== 'sankalpa') throw new Error('Unknown type.');

  let targetDays = HABIT_DAYS;
  if (type === 'sankalpa') {
    targetDays = Math.floor(Number(days));
    if (!Number.isFinite(targetDays) || targetDays < SANKALPA_MIN_DAYS || targetDays > SANKALPA_MAX_DAYS) {
      throw new Error(`Sankalpa length must be between ${SANKALPA_MIN_DAYS} and ${SANKALPA_MAX_DAYS} days.`);
    }
  }
  const iso = now.toISOString();
  const today = todayStr(now);
  return {
    schemaVersion: 1,
    type,
    title: clean,
    why: String(why || '').trim().slice(0, 500),
    targetDays,
    icon: icon || suggestIcon(clean, type),
    color: color || '#8b5cf6',
    status: 'active',
    attempt: 1,
    attemptStart: today,
    checkins: {},          // { "YYYY-MM-DD": "done" | "exception" } for the current attempt
    history: [],           // archived attempts: failed / abandoned (never deleted)
    createdAt: iso,
    updatedAt: iso,
    completedAt: null,
  };
}

// ---------- journey math ----------

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
  const used = exceptionDates(goal);
  if (used.length >= MAX_EXCEPTIONS) {
    return { ok: false, reason: 'exhausted', remaining: 0 };
  }
  const last = used[used.length - 1];
  if (last && diffDays(last, date) < EXCEPTION_GAP_DAYS) {
    return {
      ok: false,
      reason: 'too_soon',
      remaining: MAX_EXCEPTIONS - used.length,
      nextAllowed: addDays(last, EXCEPTION_GAP_DAYS),
    };
  }
  return { ok: true, remaining: MAX_EXCEPTIONS - used.length };
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

function archiveAttempt(goal, { outcome, reason = '', endDate }) {
  return {
    attempt: goal.attempt,
    startDate: goal.attemptStart,
    endDate,
    outcome,              // 'failed' | 'abandoned'
    reason,
    targetDays: goal.targetDays,
    doneCount: doneCount(goal),
    exceptionsUsed: exceptionCount(goal),
    checkins: goal.checkins || {},
  };
}

// ---------- state transitions ----------

/**
 * Applies a yes/no answer to the one open day. Returns { outcome, patch, ... }.
 * patch is a partial goal document that the caller writes (never deletes data).
 */
export function applyCheckin(goal, date, answer, now = new Date()) {
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
  const reason = avail.reason === 'too_soon'
    ? `Missed again within ${EXCEPTION_GAP_DAYS} days of the last exception`
    : 'All exceptions were already used';
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

/** Every archived attempt across goals that did not get accomplished. */
export function notAccomplished(goals) {
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

export function accomplished(goals) {
  return goals
    .filter((g) => g.status === 'completed')
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
}
