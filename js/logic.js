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
export const MAX_PROJECTED_DAYS = 730;  // a SMART projection never runs more than this many days past today

// How often a SMART plan item is measured, in days. "per day" is 1, "per month" is 30.
// weekday and weekend count one day each, but only on those days of the week (see CALENDAR_PERIODS).
export const PERIOD_DAYS = {
  day: 1, weekday: 1, weekend: 1, twodays: 2, threedays: 3, week: 7, biweekly: 14,
  month: 30, quarter: 90, sixmonths: 180, year: 365,
};
// Periods that depend on the day of the week: the weekdays they count (0 = Sunday, 6 = Saturday).
export const CALENDAR_PERIODS = { weekday: [1, 2, 3, 4, 5], weekend: [0, 6] };
export const PERIOD_OPTIONS = [
  ['day', 'per day'], ['weekday', 'per weekday'], ['weekend', 'per weekend'],
  ['twodays', 'per 2 days'], ['threedays', 'per 3 days'], ['week', 'per week'],
  ['biweekly', 'per 2 weeks'], ['month', 'per month'], ['quarter', 'per quarter'],
  ['sixmonths', 'per 6 months'], ['year', 'per year'],
];
// Units a plan item can count in (hours, Pomodoros...). Blank means a plain count. Any unit can be typed.
export const UNIT_SUGGESTIONS = ['hr', 'min', 'pomodoros', 'pages', 'steps', 'km', 'glasses', 'L', 'kcal', 'reps', 'sets', 'words', 'sessions', 'times', 'days', 'chapters'];
// Earlier dropdown choices, kept so a plan saved with them still reads correctly.
const LEGACY_PER = {
  'hours-day': { per: 'day', unit: 'hr' },
  'pomodoros-day': { per: 'day', unit: 'pomodoros' },
};

/** The period and unit of a plan item, whichever way it was saved. */
export function planUnit(p = {}) {
  const legacy = LEGACY_PER[p.per];
  if (legacy) return { ...legacy };
  return { per: PERIOD_DAYS[p.per] ? p.per : 'day', unit: String(p.unit ?? '').trim().slice(0, 20) };
}
// Short names for the period dropdown in the SMART plan, so it fits a phone. Same meaning as the long names.
export const PERIOD_SHORT = {
  day: '/day', weekday: '/wkday', weekend: '/wkend', twodays: '/2d', threedays: '/3d', week: '/wk',
  biweekly: '/2wk', month: '/mo', quarter: '/qtr', sixmonths: '/6mo', year: '/yr',
};
// "per day", or "hr per day" when the item has a unit.
export const periodLabel = (per, unit = '') => {
  const label = (PERIOD_OPTIONS.find(([k]) => k === per) || PERIOD_OPTIONS[0])[1];
  return unit ? `${unit} ${label}` : label;
};

export const TYPES = ['habit', 'smart', 'sankalpa'];   // the order shown everywhere
export const TYPE_LABEL = { habit: 'Habit', sankalpa: 'Sankalpa', smart: 'SMART Goal' };

// The text parts of a SMART goal. Actionable and measurable are the plan table instead.
export const SMART_FIELDS = [
  { key: 'specific', label: 'Specific', hint: 'What exactly, where, with whom?' },
  { key: 'realistic', label: 'Realistic', hint: 'Why is it doable for you?' },
  { key: 'timeBound', label: 'Time-bound', hint: 'When it starts and ends.' },
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

// ---------- next-morning check-in ----------
//
// One journey is checked in the morning after its day: on a given day you record yesterday,
// because the day cannot be known until it is over. Matched by name, ignoring case and accents.
const NEXT_MORNING_NAME = 'kama digvijaya sankalpam';
// Plain lower-case English words: accents, capitals, punctuation and extra spaces are ignored.
const foldName = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// A journey chosen in the form ("check in the next day") is saved as nextMorning. Journeys saved before
// that option existed have no setting, so the name decides for them.
export function isNextMorning(goal) {
  if (typeof goal?.nextMorning === 'boolean') return goal.nextMorning;
  return foldName(goal?.title) === NEXT_MORNING_NAME;
}

/** The day whose check-in is open today. Normally today; for a next-morning journey, yesterday. */
export function checkinDay(goal, today) {
  return isNextMorning(goal) ? addDays(today, -1) : today;
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

/** No journey allows exception days: habits, sankalpas and SMART goals all restart on a miss.
 * Exceptions taken before this rule stay in their records. */
export function policyFor() {
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

/**
 * Capitalises the first letter of each word, keeping small words lower case. Everything we store goes through this.
 * Words the user wrote on purpose are left exactly as typed: links, emails, names with capitals (iPhone, eBay),
 * and acronyms (USA, HR). A word after a full stop starts a new sentence.
 */
export function titleCase(text) {
  let first = true;
  return String(text ?? '').split(/(\s+)/).map((part) => {
    if (!part.trim()) return part;
    const isFirst = first;
    first = /[.!?]$/.test(part.trim());
    // Bold, italic and strike markers in front of a word are kept as they are; the word after them is cased.
    const lead = part.match(/^[*_~]*/)[0];
    const word = part.slice(lead.length);
    if (/[@\/:]|\.[a-z]/i.test(word)) return part;                 // emails, links, domains
    if (/[A-Z]/.test(word.slice(1))) return part;                   // iPhone, eBay: capitals already chosen
    if (word.length > 1 && word === word.toUpperCase()) return part; // USA, HR: acronyms
    if (!isFirst && SMALL_WORDS.has(word.toLowerCase())) return lead + word.toLowerCase();
    return lead + word.charAt(0).toUpperCase() + word.slice(1);
  }).join('');
}

/** Checks the three text parts of a SMART goal. Every part is required unless optional is true. */
export function cleanSmart(input = {}, { optional = false } = {}) {
  const out = {};
  for (const { key, label } of SMART_FIELDS) {
    const v = titleCase(String(input[key] ?? '').trim());
    if (!v && optional) { out[key] = ''; continue; }
    if (!v) throw new Error(`Fill in the "${label}" part.`);
    if (v.length > 500) throw new Error(`"${label}" must be 500 characters or fewer.`);
    out[key] = v;
  }
  return out;
}

/**
 * The SMART plan: rows of { action, amount, unit, per }.
 * "per" is 'day' or 'week'. Blank rows are ignored. At least one row is required unless optional is true.
 */
export function cleanPlan(rows = [], { optional = false } = {}) {
  const list = (Array.isArray(rows) ? rows : []).filter(
    (r) => r && (String(r.action ?? '').trim() || String(r.amount ?? '').trim()),
  );
  if (!list.length && optional) return [];
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
      unit: planUnit(r).unit,   // what is counted, e.g. "hr" or "pomodoros"; blank is a plain count
      per: planUnit(r).per,
      note: optionalText(r.note, 300),   // optional; shown only when the goal has notes switched on
      key: r.key === undefined || r.key === null || r.key === '' ? null : Number(r.key),
    };
  });
  // Stable keys: a logged number belongs to its item for life, even when rows are edited or added.
  let next = Math.max(-1, ...cleaned.map((p) => (Number.isFinite(p.key) ? p.key : -1))) + 1;
  return cleaned.map((p) => (Number.isFinite(p.key) ? p : { ...p, key: next++ }));
}

// Units that count whole things (a blank unit is a plain count). Any other unit, such as hr, L or km, may be fractional.
const WHOLE_UNITS = new Set(['', 'min', 'pomodoros', 'pages', 'steps', 'glasses', 'reps', 'sets', 'words', 'sessions', 'times', 'days', 'chapters']);

/**
 * Divides a total over the whole goal into an amount per period.
 * Takes the period (per day, per week...), the days of the goal, and the unit into account:
 * whole things round up, so the total is always reached; other units keep two decimals.
 * e.g. 30 over 10 days, per day, is 3. Returns null when the total or the days are not valid.
 */
export function perPeriodAmount(total, days, per, unit = '', start = null) {
  const t = Number(String(total ?? '').trim());
  const n = Math.floor(Number(days));
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(n) || n < 1) return null;
  const periods = CALENDAR_PERIODS[per]
    ? (start ? countCalendarDays(per, start, n) : (n * CALENDAR_PERIODS[per].length) / 7)
    : n / (PERIOD_DAYS[per] || 1);
  const raw = t / periods;
  if (WHOLE_UNITS.has(String(unit ?? '').trim().toLowerCase())) return Math.ceil(+raw.toFixed(6));
  return Math.round(raw * 1e6) / 1e6;   // keep precision so the total still adds up to what was typed
}

// Amounts are shown with two decimals, so a typed 3.33 must count as meeting a target of 3.3333.
const AMOUNT_SLACK = 0.005;
/** True when a logged value reaches a target, allowing for the rounding shown on screen. */
export const metAmount = (value, target, days = 1) => Number(value) >= target - AMOUNT_SLACK * days;

/** Why and description are optional, both when creating and editing a journey: blank stays blank. */
export function optionalText(value, max) {
  return titleCase(String(value ?? '').trim()).slice(0, max);
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
  redoOf = null, nextMorning = null, descMarkdown = false, now = new Date(),
}) {
  if (!TYPES.includes(type)) throw new Error('Unknown type.');
  // Everything is optional when creating. A blank title is named after the type.
  const clean = titleCase(String(title || '').trim()) || TYPE_LABEL[type];
  if (clean.length > 80) throw new Error('Title must be 80 characters or fewer.');
  const reason = optionalText(why, 500);

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
      ...cleanSmart(smart, { optional: true }),
      plan: cleanPlan(smart?.plan, { optional: true }),
      notes: !!smart?.notes,   // a note box for each actionable item
      endDate: end,
    };
  }

  const iso = now.toISOString();
  return {
    schemaVersion: 1,
    type,
    title: clean,
    description: optionalText(description, 1000),
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
    // Checked in the next day: each day is recorded the morning after it. Without a choice, the name decides.
    nextMorning: nextMorning ?? isNextMorning({ title: clean }),
    descMarkdown: type === 'smart' && !!descMarkdown,   // SMART goals only: the description is shown as Markdown
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
    nextMorning: isNextMorning(goal),
    descMarkdown: !!goal.descMarkdown,
    now,
  });
}

/** A sankalpa's length can change, but never below the days already done. */
export function cleanSankalpaDays(goal, value) {
  const n = Math.floor(Number(String(value ?? '').trim()));
  if (!Number.isFinite(n) || n < SANKALPA_MIN_DAYS || n > SANKALPA_MAX_DAYS) {
    throw new Error(`Sankalpa length must be between ${SANKALPA_MIN_DAYS} and ${SANKALPA_MAX_DAYS} days.`);
  }
  // Equal to the days done would finish it with nothing left to check in, so it must stay above them.
  const done = doneCount(goal);
  if (n <= done) throw new Error(`The length must be more than the ${done} days already done.`);
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
  const day = checkinDay(goal, today);
  const cells = [];
  let next = null;
  for (let i = 0; i < total; i++) {
    const date = addDays(goal.attemptStart, i);
    const v = goal.checkins?.[date];
    let state;
    if (v === 'done') state = 'done';
    else if (v === 'exception') state = 'exception';
    else if (date > day) state = 'locked';
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

/** True when every plan item has a number entered for the date (zeros count). A plan with no items is never complete. */
export function entriesComplete(goal, items, date) {
  return items.length > 0 && items.every((it) => goal.logs?.[date]?.[it.index] !== undefined);
}

export function smartPhase(goal, today = todayStr()) {
  return today < goal.attemptStart ? 'upcoming' : 'running';
}

// Total to reach over the planned length. A "per week" item counts whole weeks.
function itemTotal(goal, p) {
  if (CALENDAR_PERIODS[p.per]) return p.amount * countCalendarDays(p.per, goal.attemptStart, goal.targetDays);
  const period = PERIOD_DAYS[p.per] || 1;
  return period === 1 ? p.amount * goal.targetDays : Math.ceil((p.amount * goal.targetDays) / period);
}

/** Whether a weekday or weekend item counts on this date. Other periods count every day. */
export function countsOn(per, date) {
  const days = CALENDAR_PERIODS[per];
  return days ? days.includes(parseDate(date).getUTCDay()) : true;
}

/** How many days from start, over n days, a weekday or weekend item counts. */
export function countCalendarDays(per, start, n) {
  let count = 0;
  for (let i = 0; i < n; i++) if (countsOn(per, addDays(start, i))) count++;
  return count;
}

// What one day needs for this item. On a given date, a weekday or weekend item needs nothing on the other days.
export function dayTargetOf(p, date = null) {
  if (date && !countsOn(p.per, date)) return 0;
  return p.amount / (PERIOD_DAYS[p.per] || 1);
}

/**
 * How much of a day's targets were reached, 0 to 100, averaged over the items due that day
 * (each item counts at most its full daily amount). Null when no item is due that day.
 */
function dayPercent(items, logs, date) {
  const due = items.filter((it) => dayTargetOf(it, date) > 0);
  if (!due.length) return null;
  const sum = due.reduce((s, it) => s + Math.min(1, Number(logs[date]?.[it.index] ?? 0) / dayTargetOf(it, date)), 0);
  return Math.floor((sum / due.length) * 100);
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
  const day = checkinDay(goal, today);   // the last day that can be logged today

  const items = plan.map((raw, pos) => {
    const p = { ...raw, ...planUnit(raw) };
    const index = Number.isFinite(p.key) ? p.key : pos;
    const total = itemTotal(goal, p);
    // Only numbers logged inside the goal's own dates count (not before its start, not after today).
    let done = 0;
    for (const [date, vals] of Object.entries(logs)) {
      if (date < start || date > today) continue;
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
      complete: metAmount(done, total, plannedDays),
    };
  });
  const complete = items.length > 0 && items.every((it) => it.complete);

  const valueOn = (date, index) => Number(logs[date]?.[index] ?? 0);
  const dayMet = (date) => items.length > 0 && items.every((it) => metAmount(valueOn(date, it.index), dayTargetOf(it, date)));

  // Projection: the slowest item sets the finish. No progress yet means the planned rate.
  let projectedRemaining = 0;
  if (!complete && elapsed > 0) {
    for (const it of items) {
      if (it.remaining <= 0) continue;
      const rate = it.pace > 0 ? it.pace : it.total / plannedDays;   // no progress yet: the planned average
      projectedRemaining = Math.max(projectedRemaining, Math.ceil(it.remaining / rate - 1e-9));
    }
    // A very slow pace would push the finish centuries away and build an enormous day map. Cap it.
    projectedRemaining = Math.min(projectedRemaining, MAX_PROJECTED_DAYS);
  }
  const projectedEnd = phase === 'upcoming' || complete || projectedRemaining === 0
    ? plannedEnd
    : addDays(today, projectedRemaining - 1);
  const projectedDays = diffDays(start, projectedEnd) + 1;

  // Day map, from the first day to the projected end. The current day can be logged, and so can the
  // day before it while its numbers are not all entered (it shows as overdue). Older days are closed:
  // met is done, anything logged is partial, and nothing logged is missed.
  const graceDay = addDays(day, -1);
  let openDay = null;
  const days = [];
  for (let i = 0; i < projectedDays; i++) {
    const date = addDays(start, i);
    let state;
    let percent = null;
    if (date > day) state = 'locked';
    else if (dayMet(date)) state = 'done';
    else if (date === graceDay && !entriesComplete(goal, items, date)) {
      state = 'active';
      openDay ??= date;
    } else if (date < day) {
      percent = dayPercent(items, logs, date) ?? 0;
      state = percent > 0 ? 'partial' : 'missed';
    } else {
      state = 'active';
      openDay ??= date;
    }
    days.push({ index: i, date, state, percent });
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
 * The daily brief for a SMART goal: pace, how far the finish moves, what to focus on, what is going well,
 * what today still needs, and a few insights. Built only from smartProgress, so it matches the numbers on the page.
 */
export function smartBrief(goal, today = todayStr()) {
  const p = smartProgress(goal, today);
  const empty = { status: 'on-pace', shift: 0, focus: [], strengths: [], today: [], insights: [] };
  if (p.phase === 'upcoming') return { ...empty, status: 'upcoming' };
  if (p.complete) return { ...empty, status: 'complete' };

  const start = goal.attemptStart;
  const day = checkinDay(goal, today);   // the check-in day: what should be done by now
  const round1 = (n) => Math.round(n * 10) / 10;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const items = p.items.map((it) => {
    // What this item should have reached by the check-in day, from its daily amounts.
    let expected = 0;
    for (let d = start; d <= day; d = addDays(d, 1)) expected += dayTargetOf(it, d);
    const gap = round1(it.done - expected);
    const perDay = p.planned.days ? it.total / p.planned.days : 0;   // average amount per day over the plan
    const todayNeed = dayTargetOf(it, day);
    const todayDone = Number(goal.logs?.[day]?.[it.index] ?? 0);
    return {
      action: it.action,
      unit: it.unit || '',
      done: it.done,
      total: it.total,
      expected: round1(expected),
      gap,
      ratio: it.ratio,
      complete: it.complete,
      catchUp: gap < 0 && perDay > 0 ? Math.ceil(-gap / perDay - 1e-9) : 0,   // days' worth of work behind
      todayShort: Math.max(0, round1(todayNeed - todayDone)),
    };
  });

  const status = p.verdict === 'extended' ? 'behind' : p.verdict === 'ahead' ? 'ahead' : 'on-pace';
  const shift = p.projected.days - p.planned.days;   // more than 0: the finish moves later

  const focus = items.filter((i) => !i.complete && i.gap < 0).sort((a, b) => a.gap - b.gap).slice(0, 2);
  const strengths = items.filter((i) => i.gap >= 0 && i.done > 0).sort((a, b) => b.ratio - a.ratio).slice(0, 2);
  const dueToday = items.filter((i) => i.todayShort > 0);

  const insights = [];
  const elapsed = day >= start ? diffDays(start, day) + 1 : 0;
  if (elapsed > 0) {
    const met = p.days.filter((d) => d.state === 'done').length;
    insights.push(`${met} of ${elapsed} days met`);
  }
  if (p.zeroDays) insights.push(`${plural(p.zeroDays, 'zero day')}`);
  if (!p.loggedDays) insights.push('Log today to start');
  if (status === 'ahead') insights.push('Keep these amounts');

  return {
    status,
    shift,
    focus,
    strengths,
    today: dueToday,
    insights,
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
  // The current day, or the overdue day before it while it is still open.
  const day = checkinDay(goal, today);
  const before = smartProgress(goal, today).days;
  const isOpen = (date) => date === day || before.some((d) => d.date === date && d.state === 'active');
  for (const e of entries || []) {
    const item = plan.find((p, pos) => (Number.isFinite(p.key) ? p.key : pos) === Number(e.index));
    if (!item) throw new Error('That actionable item no longer exists.');
    const v = Number(e.value);
    if (!Number.isFinite(v) || v < 0 || v > 1000000) {
      throw new Error(`Enter a number of zero or more for "${item.action}".`);
    }
    const date = String(e.date || '');
    if (date > day) throw new Error('That day is not open for logging yet.');
    if (!isOpen(date) || date < goal.attemptStart) throw new Error('That day is closed. Only the current day, or a missed day before it, can be logged.');
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
      // The new attempt starts the day after the miss, or today if that day has already passed.
      attemptStart: addDays(date, 1) > today ? addDays(date, 1) : today,
      checkins: {},
      updatedAt: iso,
    },
  };
}

/** Why a miss cannot be covered by an exception. Used in the archive and in the UI. */
export function missReason(avail) {
  if (avail.reason === 'not_allowed') return 'Missed a day. No exceptions';
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

/** Deleting keeps the journey and its history: it moves to the Deleted tab, and can be redone from there. */
export function applyDelete(goal, now = new Date()) {
  if (goal.status === 'deleted') throw new Error('This journey is already deleted.');
  if (goal.status === 'completed') throw new Error('Accomplished journeys cannot be deleted. They stay under Accomplished.');
  const iso = now.toISOString();
  return { status: 'deleted', deletedAt: iso, updatedAt: iso };
}

// ---------- read helpers used by the UI ----------

/** Human text for the "today" line of a goal. */
export function nextActionText(goal, today) {
  if (goal.status === 'completed') return { kind: 'completed', text: 'Accomplished' };
  if (goal.status === 'abandoned') return { kind: 'closed', text: 'Closed' };
  if (goal.status === 'deleted') return { kind: 'closed', text: 'Deleted' };
  const day = checkinDay(goal, today);
  const yesterday = day !== today;   // next-morning journeys: today's entry is for yesterday
  if (goal.type === 'smart') {
    if (smartPhase(goal, today) === 'upcoming') return { kind: 'wait', text: `Starts ${goal.attemptStart}` };
    const p = smartProgress(goal, today);
    if (p.complete) return { kind: 'completed', text: 'Accomplished' };
    if (!p.items.length) return { kind: 'wait', text: 'Add a plan to start logging' };
    if (!p.openDay) return { kind: 'wait', text: 'Next day unlocks tomorrow' };
    if (p.openDay === day) return { kind: 'today', text: yesterday ? 'Log yesterday' : 'Log today' };
    return { kind: 'overdue', text: `Pending since ${p.openDay}` };
  }
  const j = journey(goal, today);
  // A next-morning journey on its start day: nothing is open until tomorrow morning.
  if (!j.next) return yesterday && today === goal.attemptStart ? { kind: 'wait', text: 'Next day unlocks tomorrow' } : { kind: 'none', text: '' };
  if (j.next.date === day) return { kind: 'today', text: yesterday ? 'Check in for yesterday' : 'Check in for today' };
  if (j.next.date < day) return { kind: 'overdue', text: `Pending since ${j.next.date}` };
  return { kind: 'wait', text: 'Next day unlocks tomorrow' };
}

/**
 * How a journey's start is worded on its page. "Started" once the start day has come.
 * Before it, "Starting" with how far away: tomorrow, day after tomorrow, in N days, next month.
 * text is null when only the date should show.
 */
export function startInfo(start, today = todayStr()) {
  if (start <= today) return { word: 'Started', text: null };
  const days = diffDays(today, start);
  if (days === 1) return { word: 'Starting', text: 'Tomorrow' };
  if (days === 2) return { word: 'Starting', text: 'Day After Tomorrow' };
  if (days <= 13) return { word: 'Starting', text: `In ${days} Days` };
  const [y, m] = today.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  if (start.slice(0, 7) === nextMonth) return { word: 'Starting', text: 'Next Month' };
  return { word: 'Starting', text: null };
}

export function dayNumber(goal, today) {
  // Nothing is counted before the start day.
  if (today < goal.attemptStart) return 0;
  // Next-morning journeys count only the days checked in, never the calendar.
  if (isNextMorning(goal)) {
    return Math.max(1, Math.min(Object.keys(goal.checkins || {}).length, totalCells(goal)));
  }
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
    const day = checkinDay(g, today);
    if (g.type === 'smart' && g.smart) {
      const p = smartProgress(g, today);
      const logs = g.logs || {};
      const entered = (date) => entriesComplete(g, p.items, date);
      if (entered(day)) filled++;
      if (p.phase === 'running' && !p.complete && p.items.length && p.openDay && !(p.openDay === day && entered(day))) {
        open++;
        needed += p.items.filter((it) => logs[p.openDay]?.[it.index] === undefined).length;
      }
    } else {
      if (g.checkins?.[day]) filled++;
      const kind = nextActionText(g, today).kind;
      if (kind === 'today' || kind === 'overdue') {
        open++;
        needed++;
      }
    }
  }
  return { total: active.length, open, needed, filled };
}

/** The day a journey next needs a check-in: its first day not yet done, or null when nothing is left. */
export function nextDueDate(goal, today = todayStr()) {
  if (goal.type === 'smart' && goal.smart) {
    const p = smartProgress(goal, today);
    if (p.complete || !p.items.length) return null;
    // A SMART day is checked in once every plan item has a number for it (zeros count).
    // A partly entered day stays due until the rest is entered.
    const day = checkinDay(goal, today);
    // The day before stays due (overdue) until its numbers are entered; older days are closed.
    const open = p.days.find((d) => d.date >= addDays(day, -1) && !entriesComplete(goal, p.items, d.date));
    return open ? open.date : null;
  }
  const cell = journey(goal, today).cells.find((c) => c.state !== 'done' && c.state !== 'exception');
  return cell ? cell.date : null;
}

/** True when a journey's check-in is for an earlier day and is still open. */
export function isOverdue(goal, today = todayStr()) {
  const due = nextDueDate(goal, today);
  return !!due && due < checkinDay(goal, today);
}

/**
 * What the Check In screen counts, one journey in one place:
 * today: check-in due today and not yet done. overdue: an earlier day still open.
 * tomorrow: next check-in is tomorrow, including journeys already done today.
 */
export function checkinCounts(goals, today = todayStr()) {
  const active = goals.filter((g) => g.status === 'active');
  const count = (group) => active.filter((g) => inCheckinGroup(g, group, today)).length;
  return { today: count('today'), overdue: count('overdue'), tomorrow: count('tomorrow') };
}

/** Whether an active journey belongs to one of the Check In groups: 'today', 'overdue' or 'tomorrow'. */
export function inCheckinGroup(goal, group, today = todayStr()) {
  if (group === 'overdue') return isOverdue(goal, today);
  const due = nextDueDate(goal, today);
  if (!due) return false;
  if (group === 'today') return due === checkinDay(goal, today);
  if (group === 'tomorrow') return due === checkinDay(goal, addDays(today, 1));
  return false;
}

/** True while a journey is waiting for a check-in: a day is due and not yet entered for today. */
export function needsCheckin(goal, today = todayStr()) {
  if (goal.status !== 'active') return false;
  if (goal.type === 'smart' && goal.smart) {
    const due = nextDueDate(goal, today);
    return !!due && due <= checkinDay(goal, today);
  }
  const kind = nextActionText(goal, today).kind;
  return kind === 'today' || kind === 'overdue';
}

export function accomplished(goals) {
  return goals
    .filter((g) => g.status === 'completed')
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
}

// ---------- grouping for the Accomplishments tab ----------

const titleKey = (title) => String(title || '').trim().toLowerCase();

/** The day a sankalpa was accomplished: its last check-in. */
function accomplishedDay(goal) {
  const done = Object.keys(goal.checkins || {}).filter((k) => goal.checkins[k] === 'done').sort();
  return done[done.length - 1] || String(goal.completedAt || '').slice(0, 10);
}

// Joins rows with the same key into one group. Each group has its count and its newest row (latest).
function groupRows(rows, keyOf) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.values()]
    .map((items) => {
      items.sort((a, b) => (b.when || '').localeCompare(a.when || ''));
      const latest = items[0];
      return { type: latest.type, title: latest.title, count: items.length, latest, items };
    })
    .sort((a, b) => (b.latest.when || '').localeCompare(a.latest.when || ''));
}

/**
 * Accomplished journeys, one group per journey (same type and title). Sankalpas accomplished one after another,
 * each redo starting the day after the last one ended with no gap, become a habit once their days add up to HABIT_DAYS (66) or more.
 */
export function accomplishedGroups(goals) {
  const rows = accomplished(goals).map((g) => ({
    goalId: g.id,
    title: g.title,
    type: g.type,
    days: g.targetDays || 0,
    start: g.attemptStart || '',
    end: g.type === 'sankalpa' ? accomplishedDay(g) : String(g.completedAt || '').slice(0, 10),
    when: g.completedAt || '',
  }));

  const sankalpasByTitle = new Map();
  for (const r of rows.filter((x) => x.type === 'sankalpa')) {
    const k = titleKey(r.title);
    if (!sankalpasByTitle.has(k)) sankalpasByTitle.set(k, []);
    sankalpasByTitle.get(k).push(r);
  }
  for (const list of sankalpasByTitle.values()) {
    list.sort((a, b) => a.start.localeCompare(b.start));
    let run = [];
    // A run is a block of accomplishments with no gap day. Its days add up; 66 or more makes it a habit.
    const closeRun = () => {
      const total = run.reduce((sum, r) => sum + r.days, 0);
      if (run.length && total >= HABIT_DAYS) run.forEach((r) => { r.type = 'habit'; });
      run = [];
    };
    for (const r of list) {
      const prev = run[run.length - 1];
      if (prev && r.start !== addDays(prev.end, 1)) closeRun();
      run.push(r);
    }
    closeRun();
  }

  return groupRows(rows, (r) => `${r.type}|${titleKey(r.title)}`);
}

/** Not accomplished, one group per journey and outcome, so repeated misses show how many times. */
export function notAccomplishedGroups(goals, today = todayStr()) {
  const rows = notAccomplished(goals, today).map((m) => ({ ...m, when: m.endDate || '' }));
  return groupRows(rows, (r) => `${r.type}|${titleKey(r.title)}|${r.outcome}`);
}

/** Deleted journeys, one group per type and title, so repeated deletes show how many times. */
export function deletedGroups(goals) {
  const rows = goals
    .filter((g) => g.status === 'deleted')
    .map((g) => ({ goalId: g.id, title: g.title, type: g.type, when: String(g.deletedAt || '').slice(0, 10) }));
  return groupRows(rows, (r) => `${r.type}|${titleKey(r.title)}`);
}

/**
 * A fresh start for an active journey: same title, reason, length and settings, but no check-ins, numbers
 * or past runs, beginning on startDate. A SMART goal's deadline moves to keep its length.
 */
export function restartPatch(goal, startDate, now = new Date()) {
  const iso = now.toISOString();
  const patch = {
    attempt: 1,
    attemptStart: normalizeDate(startDate, 'Pick a valid start date.'),
    checkins: {},
    logs: {},
    history: [],
    completedAt: null,
    updatedAt: iso,
  };
  if (goal.type === 'smart' && goal.smart) {
    patch.smart = { ...goal.smart, endDate: addDays(patch.attemptStart, goal.targetDays - 1) };
  }
  return patch;
}

// ---------- rewards ----------
// A reward is a prize you pick for yourself. It has journeys attached. Its progress is how many of those
// journeys are accomplished, and it can be claimed once every attached journey is accomplished.

export const MAX_REWARD_TITLE = 60;
export const MAX_REWARD_NOTE = 200;
export const MAX_REWARD_ITEMS = 10;          // gifts packed into one reward
export const MAX_REWARD_ITEM_TITLE = 60;

/** Checks and tidies a reward typed in the form. Throws a message the user can read. */
export function cleanReward(input = {}) {
  const title = String(input.title ?? '').trim();
  if (!title) throw new Error('Give the reward a name.');
  if (title.length > MAX_REWARD_TITLE) throw new Error(`Reward name must be ${MAX_REWARD_TITLE} characters or fewer.`);
  const items = [...new Set((input.items || []).map((x) => titleCase(String(x).trim())).filter(Boolean))];
  if (items.length > MAX_REWARD_ITEMS) throw new Error(`A package holds up to ${MAX_REWARD_ITEMS} gifts.`);
  if (items.some((x) => x.length > MAX_REWARD_ITEM_TITLE)) throw new Error(`Each gift must be ${MAX_REWARD_ITEM_TITLE} characters or fewer.`);
  const goalIds = [...new Set((input.goalIds || []).map(String).filter(Boolean))];
  return { title, note: optionalText(input.note, MAX_REWARD_NOTE), goalIds, items };
}

/**
 * How far one journey has got, from 0 to 1. An accomplished journey is 1. Otherwise: a habit or sankalpa is its
 * days done out of its target days, and a SMART goal is its plan's progress. A journey that is abandoned or deleted
 * stays where it was, and it cannot be accomplished.
 */
export function journeyFraction(goal, today = todayStr()) {
  if (!goal) return 0;
  if (goal.status === 'completed') return 1;
  if (goal.status !== 'active') return 0;
  if (goal.type === 'smart') return Math.min(1, smartProgress(goal, today).ratio || 0);
  return goal.targetDays ? Math.min(1, doneCount(goal) / goal.targetDays) : 0;
}

/**
 * A journey as it stood before today's check-in: the entry for the day checked in today is taken out.
 * A journey accomplished today counts as still in progress.
 */
function beforeToday(goal, today) {
  if (!goal) return goal;
  const finishedToday = goal.status === 'completed' && goal.completedAt && todayStr(new Date(goal.completedAt)) === today;
  if (goal.status !== 'active' && !finishedToday) return goal;
  const day = checkinDay(goal, today);
  const checkins = { ...(goal.checkins || {}) };
  const logs = { ...(goal.logs || {}) };
  delete checkins[day];
  delete logs[day];
  return { ...goal, status: 'active', checkins, logs };
}

/**
 * Progress of one reward against the journeys on record. Its bar is the average progress of its journeys, each one
 * moving as the journey moves day by day. It is ready to open only when every journey is accomplished.
 * A journey that is no longer on record counts as 0.
 */
export function rewardProgress(reward, goals = [], today = todayStr()) {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const journeys = (reward.goalIds || []).map((id) => {
    const goal = byId.get(id) || null;
    const fraction = journeyFraction(goal, today);
    const before = journeyFraction(beforeToday(goal, today), today);
    return { id, goal, done: goal?.status === 'completed', fraction, before, pct: Math.round(fraction * 100) };
  });
  const total = journeys.length;
  const done = journeys.filter((j) => j.done).length;
  const avg = total ? journeys.reduce((n, j) => n + j.fraction, 0) / total : 0;
  const avgBefore = total ? journeys.reduce((n, j) => n + j.before, 0) / total : 0;
  return {
    total,
    done,
    pct: Math.round(avg * 100),
    exactPct: avg * 100,                                  // progress so far, unrounded
    todayPct: Math.max(0, (avg - avgBefore) * 100),       // what today's check-ins added
    ready: total > 0 && done === total && !reward.claimedAt,
    journeys,
  };
}

/**
 * The last day a journey can run. A habit or sankalpa ends on its last day of cells (its target days, plus any
 * exception days taken). A SMART goal ends on its deadline.
 */
export function journeyDeadline(goal) {
  if (!goal) return null;
  if (goal.type === 'smart' && goal.smart?.endDate) return goal.smart.endDate;
  if (!goal.attemptStart) return null;
  return addDays(goal.attemptStart, Math.max(0, totalCells(goal) - 1));
}

/** The latest journey deadline among the given journeys: the earliest a reward can be due. */
export function latestJourneyDeadline(goalIds = [], goals = []) {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const days = goalIds.map((id) => journeyDeadline(byId.get(id))).filter(Boolean);
  return days.length ? days.sort().at(-1) : null;
}

/**
 * The deadline a reward is saved with. Blank means the last journey's end. A deadline can't be before that,
 * since the reward could never be opened in time.
 */
export function cleanDeadline(value, goalIds = [], goals = []) {
  const last = latestJourneyDeadline(goalIds, goals);
  const d = String(value ?? '').trim() || last;
  if (!d) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Pick a valid deadline date.');
  if (last && d < last) throw new Error(`The deadline can't be before ${last}, when the last journey ends.`);
  return d;
}

/** Journeys that can be attached to a reward: the ones in progress, and the ones already accomplished. */
export function rewardChoices(goals = []) {
  return goals.filter((g) => g.status === 'active' || g.status === 'completed');
}
