import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICON_NAMES, COLOURS, ICON_GROUPS } from '../js/choices.js';
import {
  newGoalData, applyCheckin, applyAbandon, journey, totalCells, addDays, diffDays, notAccomplished, accomplished,
  suggestIcon, redoData, redoDefaults, exceptionAvailability, cleanPlan, resolveSmartEnd, smartProgress, titleCase,
  applySmartLog, smartPhase, sortByOrder, nextOrder, optionalText, nextActionText, checkinSummary, cleanSankalpaDays,
  cleanSmart, checkinDay, dayNumber, periodLabel, perPeriodAmount, isNextMorning, startInfo,
} from '../js/logic.js';

const WHY = 'It makes me feel steady';
const DESC = 'A short line about it';

test('icon is chosen automatically from the title', () => {
  assert.equal(suggestIcon('Read 10 pages'), 'book-open');
  assert.equal(suggestIcon('Gym at 6am'), 'dumbbell');
  assert.equal(suggestIcon('Drink 3 litres of water'), 'droplet');
  assert.equal(suggestIcon('No sugar'), 'ban');
  assert.equal(suggestIcon('Walk 8000 steps', 'sankalpa'), 'footprints');
  assert.equal(suggestIcon('Something unusual'), 'repeat');
  assert.equal(suggestIcon('Something unusual', 'sankalpa'), 'mountain');
  assert.equal(suggestIcon('Something unusual', 'smart'), 'target');
  assert.equal(newGoalData({ type: 'habit', title: 'Meditate every morning', why: WHY, description: DESC }).icon, 'brain');
  assert.equal(newGoalData({ type: 'habit', title: 'Meditate', why: WHY, description: DESC, icon: 'star' }).icon, 'star');
});

test('auto icon picks the personal-development area a title is about', () => {
  assert.equal(suggestIcon('Learn Spanish'), 'languages');
  assert.equal(suggestIcon('Pray every day'), 'church');
  assert.equal(suggestIcon('Save 500 a month'), 'piggy-bank');
  assert.equal(suggestIcon('Call my mum'), 'message-circle');
  assert.equal(suggestIcon('Practise guitar'), 'guitar');
  assert.equal(suggestIcon('Cook a healthy meal'), 'chef-hat');
  assert.equal(suggestIcon('Write a journal entry'), 'pen-line');
  assert.equal(suggestIcon('Phone-free evening'), 'smartphone');
});

test('every icon the auto rules can pick exists in the icon catalogue', () => {
  const catalogue = new Set(ICON_NAMES);
  for (const title of ['Learn Spanish', 'Pray', 'Save money', 'Call mum', 'Guitar', 'Cook', 'Journal', 'Phone', 'Gym', 'Run', 'Drink water', 'Sleep early', 'Walk', 'Kindness', 'Clean the flat', 'Travel', 'Work', 'Focus', 'Sun', 'Timer', 'Game', 'Daily', 'Smile', 'Goal', 'No sugar', 'Read', 'Study', 'Music', 'Coffee', 'Tea', 'Fruit', 'Vegetables', 'Egg', 'Meditate', 'Swim', 'Yoga', 'Invest', 'Income', 'Garden', 'Family', 'Partner', 'Movie', 'Paint', 'Photo', 'Code', 'Sankalp']) {
    for (const type of ['habit', 'sankalpa', 'smart']) {
      assert.ok(catalogue.has(suggestIcon(title, type)), `${title} (${type}) picked an icon missing from the catalogue`);
    }
  }
});

// Local-time "now" for a given day, so tests do not depend on timezone.
const at = (dateStr) => new Date(`${dateStr}T12:00:00`);

function newGoal(start = '2026-01-01', extra = {}) {
  return { id: 'g1', ...newGoalData({ type: 'habit', title: 'Read', why: WHY, description: DESC, now: at(start) }), ...extra };
}

// Applies a sequence of answers, each on the open day, returns final goal + outcomes.
function run(goal, answers) {
  const outcomes = [];
  let g = goal;
  for (const [date, answer] of answers) {
    const res = applyCheckin(g, date, answer, at(date));
    outcomes.push(res.outcome);
    g = { ...g, ...res.patch };
  }
  return { goal: g, outcomes };
}

test('why is optional when creating and when editing: blank stays blank', () => {
  assert.equal(newGoalData({ type: 'habit', title: 'Read' }).why, '');
  assert.equal(newGoalData({ type: 'habit', title: 'Read', why: '   ' }).why, '');
  assert.equal(optionalText('  because  ', 500), 'Because');
  assert.equal(optionalText('   ', 500), '');
});

test('description is optional and trimmed when creating; details boxes are gone', () => {
  const g = newGoalData({ type: 'habit', title: 'Read', why: WHY, description: '  10 pages a night  ' });
  assert.equal(g.description, '10 Pages a Night');
  assert.equal(newGoalData({ type: 'habit', title: 'Read', why: WHY }).description, '');
  assert.equal(newGoalData({ type: 'habit', title: 'Read', why: WHY, description: '   ' }).description, '');
  assert.equal('details' in g, false);
});

test('the icon catalogue has no repeated names within a group, and every icon name is a plain Lucide name', () => {
  for (const group of ICON_GROUPS) {
    const names = group.icons.map(([name]) => name);
    assert.equal(new Set(names).size, names.length, `${group.name} repeats an icon`);
    for (const name of names) assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/, name);
  }
  assert.ok(ICON_NAMES.length >= 200, 'catalogue should cover every area of personal development');
});

test('there are thirty distinct colours, and the default is one of them', () => {
  assert.equal(COLOURS.length, 30);
  assert.equal(new Set(COLOURS.map((c) => c.hex.toUpperCase())).size, 30);
  assert.equal(new Set(COLOURS.map((c) => c.name)).size, 30);
  assert.ok(COLOURS.some((c) => c.hex === '#14B8A6'));
});

test('habit defaults to 66 days and a sankalpa uses the chosen length', () => {
  assert.equal(newGoal().targetDays, 66);
  const s = newGoalData({ type: 'sankalpa', title: 'Walk', days: 30, why: WHY, description: DESC });
  assert.equal(s.targetDays, 30);
  assert.throws(() => newGoalData({ type: 'sankalpa', title: 'x', days: 0, why: WHY, description: DESC }));
  assert.equal(newGoalData({ type: 'habit', title: '   ', why: WHY, description: DESC }).title, 'Habit');
});

test('only the earliest unresolved day is open; future days are locked', () => {
  const g = newGoal('2026-01-01');
  const j = journey(g, '2026-01-02');
  assert.equal(j.next.date, '2026-01-01');
  assert.equal(j.cells[0].state, 'active');
  assert.equal(j.cells[1].state, 'queued'); // 2026-01-02 is today, but day 1 is still unresolved
});

test('yes marks green and unlocks the next day', () => {
  let g = newGoal('2026-01-01');
  ({ goal: g } = run(g, [['2026-01-01', 'yes']]));
  const j = journey(g, '2026-01-02');
  assert.equal(j.cells[0].state, 'done');
  assert.equal(j.next.date, '2026-01-02');
});

test('check-in on a closed day is rejected', () => {
  const g = newGoal('2026-01-01');
  assert.throws(() => applyCheckin(g, '2026-01-05', 'yes', at('2026-01-05')));
});

test('first miss uses an exception and the journey grows by one day', () => {
  const { goal, outcomes } = run(newGoal('2026-01-01'), [['2026-01-01', 'no']]);
  assert.deepEqual(outcomes, ['exception']);
  assert.equal(totalCells(goal), 67);
  assert.equal(goal.attempt, 1);
});

test('a second miss within 15 days restarts the journey from the next day', () => {
  let g = newGoal('2026-01-01');
  ({ goal: g } = run(g, [['2026-01-01', 'yes'], ['2026-01-02', 'no']]));
  const res = applyCheckin(g, '2026-01-03', 'no', at('2026-01-03'));
  assert.equal(res.outcome, 'failed');
  const next = { ...g, ...res.patch };
  assert.equal(next.attempt, 2);
  assert.equal(next.attemptStart, '2026-01-04');
  assert.deepEqual(next.checkins, {});
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].outcome, 'failed');
  assert.equal(next.history[0].doneCount, 1);
  assert.equal(next.history[0].exceptionsUsed, 1);
  assert.equal(next.history[0].checkins['2026-01-01'], 'done'); // nothing lost
});

test('a second exception is allowed once 15 days have passed', () => {
  let g = newGoal('2026-01-01');
  const answers = [];
  for (let d = 1; d <= 15; d++) answers.push([addDays('2026-01-01', d - 1), 'yes']);
  ({ goal: g } = run(g, answers));
  const first = applyCheckin(g, '2026-01-16', 'no', at('2026-01-16'));
  assert.equal(first.outcome, 'exception');
  g = { ...g, ...first.patch };
  const more = [];
  for (let d = 17; d <= 30; d++) more.push([addDays('2026-01-01', d - 1), 'yes']);
  ({ goal: g } = run(g, more));
  const second = applyCheckin(g, '2026-01-31', 'no', at('2026-01-31'));
  assert.equal(second.outcome, 'exception');
  assert.equal(diffDays('2026-01-16', '2026-01-31'), 15);
});

test('third miss is a failure even after a long gap', () => {
  const checkins = {};
  for (let i = 0; i < 59; i++) {
    const d = addDays('2026-01-01', i);
    checkins[d] = d === '2026-01-01' || d === '2026-02-01' ? 'exception' : 'done';
  }
  const g = newGoal('2026-01-01', { checkins });
  const res = applyCheckin(g, '2026-03-01', 'no', at('2026-03-01'));
  assert.equal(res.outcome, 'failed');
  assert.match(res.reason, /already used/);
});

test('completing the target marks the goal accomplished', () => {
  let g = newGoal('2026-01-01');
  const answers = [];
  for (let i = 0; i < 66; i++) answers.push([addDays('2026-01-01', i), 'yes']);
  ({ goal: g } = run(g, answers));
  assert.equal(g.status, 'completed');
  assert.ok(g.completedAt);
  assert.equal(accomplished([{ ...g, id: 'g1' }]).length, 1);
  assert.throws(() => applyCheckin(g, '2026-03-08', 'yes', at('2026-03-08')));
});

test('exception extends completion: 66 target + 1 exception needs 67 cells, still 66 dones', () => {
  let g = newGoal('2026-01-01');
  const answers = [['2026-01-01', 'no']];
  for (let i = 1; i < 67; i++) answers.push([addDays('2026-01-01', i), 'yes']);
  ({ goal: g } = run(g, answers));
  assert.equal(g.status, 'completed');
  assert.equal(journey(g, '2026-03-10').done, 66);
});

test('abandon archives the attempt into the not accomplished log', () => {
  const g = newGoal('2026-01-01');
  const patch = applyAbandon(g, at('2026-01-10'));
  const after = { ...g, ...patch };
  assert.equal(after.status, 'abandoned');
  const rows = notAccomplished([after], '2026-01-10');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome, 'abandoned');
});

test('date arithmetic is timezone-safe', () => {
  assert.equal(addDays('2026-02-27', 1), '2026-02-28');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(diffDays('2026-03-01', '2026-02-28'), -1);
});

test('a chosen start date becomes the first day; blank means today', async () => {
  const { normalizeStartDate } = await import('../js/logic.js');
  const now = new Date(2026, 0, 10, 9, 0, 0);
  assert.equal(newGoalData({ type: 'habit', title: 'Read', why: WHY, description: DESC, startDate: '2025-12-01', now }).attemptStart, '2025-12-01');
  assert.equal(newGoalData({ type: 'habit', title: 'Read', why: WHY, description: DESC, startDate: '', now }).attemptStart, '2026-01-10');
  assert.equal(normalizeStartDate('2026-02-28', now), '2026-02-28');
  assert.throws(() => normalizeStartDate('2026-02-30', now));
  assert.throws(() => normalizeStartDate('10/01/2026', now));
});

// ---------- sankalpa: no exceptions ----------

test('a sankalpa has no exceptions: the first miss restarts it', () => {
  const g = { id: 's1', ...newGoalData({ type: 'sankalpa', title: 'Walk', why: WHY, description: DESC, days: 10, startDate: '2026-01-01', now: at('2026-01-01') }) };
  const res = applyCheckin(g, '2026-01-01', 'no', at('2026-01-01'));
  assert.equal(res.outcome, 'failed');
  assert.match(res.reason, /no exceptions/);
  assert.equal(exceptionAvailability(g, '2026-01-01').reason, 'not_allowed');
});

// ---------- SMART goals ----------

const planInput = [
  { action: 'Run', amount: 3, per: 'week' },
  { action: 'Walk after dinner', amount: 20, per: 'day' },
];
const smartInput = {
  specific: 'Run 5 km in the park near home',
  realistic: 'I already walk daily and have 30 minutes free',
  timeBound: 'Start now, finish 5 km non-stop by the deadline',
  plan: planInput,
};
const smartBase = { type: 'smart', title: 'Run 5 km', why: WHY, description: DESC, smart: smartInput };
const smartGoal = (id, opts) => ({ id, ...newGoalData({ ...smartBase, ...opts }) });

test('a SMART goal runs from its start to its deadline, both days included', () => {
  const s = smartGoal('s', { startDate: '2026-01-01', endDate: '2026-01-30', now: at('2026-01-01') });
  assert.equal(s.type, 'smart');
  assert.equal(s.targetDays, 30);
  assert.equal(s.smart.endDate, '2026-01-30');
  assert.equal(s.smart.specific, 'Run 5 Km in the Park Near Home');
  assert.equal(s.smart.plan.length, 2);
  assert.equal(s.icon, 'footprints');
  assert.deepEqual(s.logs, {});
});

test('a SMART goal can end on a number of days instead of a deadline', () => {
  assert.equal(resolveSmartEnd('2026-01-01', { days: 30 }), '2026-01-30');
  assert.equal(resolveSmartEnd('2026-01-01', { endDate: '2026-02-01', days: 5 }), '2026-02-01'); // deadline wins
  assert.throws(() => resolveSmartEnd('2026-01-01', {}), /days/);
  const s = smartGoal('s2', { startDate: '2026-01-01', days: 14, now: at('2026-01-01') });
  assert.equal(s.targetDays, 14);
  assert.equal(s.smart.endDate, '2026-01-14');
});

test('a SMART goal text parts and plan are optional, but it still needs a valid deadline', () => {
  const base = { ...smartBase, startDate: '2026-01-01', endDate: '2026-01-30', now: at('2026-01-01') };
  assert.equal(newGoalData({ ...base, smart: { ...smartInput, realistic: '  ' } }).smart.realistic, '');
  assert.deepEqual(newGoalData({ ...base, smart: { ...smartInput, plan: [] } }).smart.plan, []);
  assert.throws(() => cleanSmart({ ...smartInput, realistic: '  ' }), /Realistic/);
  assert.throws(() => newGoalData({ ...base, endDate: '2025-12-31' }), /on or after/);
  assert.throws(() => newGoalData({ ...base, endDate: '', days: '' }), /days/);
});

test('plan rows: blank rows are dropped, amounts must be above zero, per defaults to day, no unit', () => {
  const plan = cleanPlan([{ action: 'read chapters', amount: '10', per: 'week' }, { action: '', amount: '' }, { action: 'sleep early', amount: 1 }]);
  assert.deepEqual(plan, [
    { action: 'Read Chapters', amount: 10, unit: '', per: 'week', note: '', key: 0 },
    { action: 'Sleep Early', amount: 1, unit: '', per: 'day', note: '', key: 1 },
  ]);
  assert.throws(() => cleanPlan([{ action: 'Read', amount: 0 }]), /above zero/);
  assert.throws(() => cleanPlan([{ action: '', amount: 5 }]), /describe/);
});

test('titles, descriptions, reasons and plan text are stored with each word capitalised, small words excepted', () => {
  assert.equal(titleCase('read 10 pages a day'), 'Read 10 Pages a Day');
  assert.equal(titleCase('the lord of the rings'), 'The Lord of the Rings');
  assert.equal(titleCase('run by the river'), 'Run by the River');
  const g = newGoalData({ type: 'habit', title: 'morning walk', description: 'after breakfast', why: 'feel good' });
  assert.equal(g.title, 'Morning Walk');
  assert.equal(g.description, 'After Breakfast');
  assert.equal(g.why, 'Feel Good');
});

test('SMART goals have no exceptions: a missed day is not a yes or no check-in', () => {
  const s = smartGoal('m1', { startDate: '2026-01-01', endDate: '2026-01-03', now: at('2026-01-01') });
  assert.throws(() => applyCheckin(s, '2026-01-01', 'no', at('2026-01-01')), /numbers/);
  assert.equal(exceptionAvailability(s, '2026-01-01').reason, 'not_allowed');
});

test('weekly items: the weekly total is spread over the goal, and a day needs one seventh of it', () => {
  const s = smartGoal('w', { startDate: '2026-01-01', endDate: '2026-01-14', now: at('2026-01-01') });
  const p = smartProgress(s, '2026-01-01');
  const run = p.items[0];
  assert.equal(run.total, 6);            // 3 a week over 14 days
  assert.ok(Math.abs(run.dayTarget - 3 / 7) < 1e-9);
  assert.equal(p.items[1].total, 280);   // 20 a day over 14 days
});

test('the day map: a day stays open until its numbers are met, then the next day opens', () => {
  // Plan: walk 20 a day, run 3 a week (day target 3/7). Day 1 is only half done.
  let s = smartGoal('d1', { startDate: '2026-01-01', endDate: '2026-01-30', now: at('2026-01-01') });
  let r = applySmartLog(s, [{ index: 1, date: '2026-01-01', value: '10' }], at('2026-01-01'));
  s = { ...s, ...r.patch };
  let p = smartProgress(s, '2026-01-01');
  assert.equal(p.openDay, '2026-01-01');
  assert.equal(p.days[0].state, 'active');

  r = applySmartLog(s, [{ index: 1, date: '2026-01-01', value: '20' }, { index: 0, date: '2026-01-01', value: '1' }], at('2026-01-01'));
  s = { ...s, ...r.patch };
  p = smartProgress(s, '2026-01-02');
  assert.equal(p.days[0].state, 'done');
  assert.equal(p.openDay, '2026-01-02');
  assert.equal(p.days[1].state, 'active');
});

test('a missed day stays open: later days queue behind it', () => {
  const s = smartGoal('d2', { startDate: '2026-01-01', endDate: '2026-01-30', now: at('2026-01-01') });
  const p = smartProgress(s, '2026-01-03');
  assert.equal(p.openDay, '2026-01-01');
  assert.equal(p.days[1].state, 'queued');
  assert.equal(p.days[2].state, 'queued');
  assert.equal(p.days[3].state, 'locked');
});

test('a slow pace stretches the end date and reports that it was extended', () => {
  // Planned 10 days at 1 a day. After 4 days only 2 are done: 8 left at 0.5 a day = 16 more days.
  const s = smartGoal('e1', { startDate: '2026-01-01', endDate: '2026-01-10', now: at('2026-01-01') });
  const plan = [{ action: 'Read', amount: 1, per: 'day' }];
  const g = { ...s, smart: { ...s.smart, plan } };
  const p = smartProgress({ ...g, logs: { '2026-01-04': { 0: 2 } } }, '2026-01-04');
  assert.equal(p.planned.days, 10);
  assert.equal(p.projected.end, '2026-01-19');
  assert.equal(p.projected.days, 19);
  assert.equal(p.verdict, 'extended');
});

test('a fast pace shortens the end date and reports that it is ahead', () => {
  const s = smartGoal('e2', { startDate: '2026-01-01', endDate: '2026-01-10', now: at('2026-01-01') });
  const plan = [{ action: 'Read', amount: 1, per: 'day' }];
  const g = { ...s, smart: { ...s.smart, plan }, logs: { '2026-01-01': { 0: 2 }, '2026-01-02': { 0: 2 }, '2026-01-03': { 0: 2 }, '2026-01-04': { 0: 2 } } };
  const p = smartProgress(g, '2026-01-04');
  assert.equal(p.verdict, 'ahead');
  assert.ok(p.projected.days < p.planned.days);
});

test('no progress yet keeps the planned end date', () => {
  const s = smartGoal('e3', { startDate: '2026-01-01', endDate: '2026-01-10', now: at('2026-01-01') });
  const p = smartProgress(s, '2026-01-01');
  assert.equal(p.projected.end, '2026-01-10');
  assert.equal(p.verdict, 'on-track');
});

test('zero days are days where every item was logged as zero', () => {
  let s = smartGoal('z', { startDate: '2026-01-01', endDate: '2026-01-30', now: at('2026-01-01') });
  s = { ...s, ...applySmartLog(s, [{ index: 0, date: '2026-01-01', value: '0' }, { index: 1, date: '2026-01-01', value: '0' }], at('2026-01-01')).patch };
  s = { ...s, ...applySmartLog(s, [{ index: 1, date: '2026-01-02', value: '15' }], at('2026-01-02')).patch };
  const p = smartProgress(s, '2026-01-02');
  assert.equal(p.zeroDays, 1);
  assert.equal(p.loggedDays, 2);
});

test('logging the last target completes the SMART goal', () => {
  const plan = [{ action: 'Read', amount: 1, per: 'day' }];
  let g = { ...smartGoal('p5', { startDate: '2026-01-01', endDate: '2026-01-03', now: at('2026-01-01') }), smart: { ...smartInput, plan, endDate: '2026-01-03' } };
  g = { ...g, targetDays: 3 };
  for (const d of ['2026-01-01', '2026-01-02']) {
    const r = applySmartLog(g, [{ index: 0, date: d, value: '1' }], at(d));
    assert.equal(r.outcome, 'saved');
    g = { ...g, ...r.patch };
  }
  const last = applySmartLog(g, [{ index: 0, date: '2026-01-03', value: '1' }], at('2026-01-03'));
  assert.equal(last.outcome, 'completed');
  assert.equal({ ...g, ...last.patch }.status, 'completed');
});

test('SMART logging is refused before the start and for days not yet reached', () => {
  const s = smartGoal('p6', { startDate: '2026-01-05', endDate: '2026-01-10', now: at('2026-01-01') });
  assert.equal(smartPhase(s, '2026-01-04'), 'upcoming');
  assert.throws(() => applySmartLog(s, [{ index: 1, date: '2026-01-05', value: '5' }], at('2026-01-04')), /starts/);
  assert.throws(() => applySmartLog(s, [{ index: 1, date: '2026-01-06', value: '5' }], at('2026-01-05')), /not open/);
  assert.throws(() => applySmartLog(s, [{ index: 1, date: '2026-01-05', value: '-1' }], at('2026-01-05')), /zero or more/);
});

test('a SMART goal never expires on its own: the end date moves with the pace', () => {
  const s = smartGoal('p7', { startDate: '2026-01-01', endDate: '2026-01-05', now: at('2026-01-01') });
  assert.equal(notAccomplished([s], '2026-02-01').length, 0);
  assert.equal(nextActionText(s, '2026-01-02').kind, 'overdue');
});

test('abandoning a SMART goal records how many targets were met', () => {
  const s = smartGoal('p8', { startDate: '2026-01-01', endDate: '2026-01-30', now: at('2026-01-01') });
  const r = applySmartLog(s, [{ index: 1, date: '2026-01-01', value: '20' }], at('2026-01-01'));
  const g = { ...s, ...r.patch };
  const after = { ...g, ...applyAbandon(g, at('2026-01-02')) };
  const rows = notAccomplished([after], '2026-01-02');
  assert.equal(rows[0].outcome, 'abandoned');
  assert.equal(rows[0].targets, 2);
  assert.equal(rows[0].doneCount, 0);
});

// ---------- ordering ----------

test('journeys sort by the saved order; ones without an order go last, oldest first', () => {
  const goals = [
    { id: 'c', order: null, createdAt: '2026-01-03' },
    { id: 'a', order: 1, createdAt: '2026-01-02' },
    { id: 'b', order: 0, createdAt: '2026-01-01' },
    { id: 'd', createdAt: '2026-01-01' },
  ];
  assert.deepEqual(sortByOrder(goals).map((g) => g.id), ['b', 'a', 'd', 'c']);
});

test('a new journey goes to the end of the saved order', () => {
  assert.equal(nextOrder([]), 0);
  assert.equal(nextOrder([{ order: 0 }, { order: 4 }, { order: null }]), 5);
});

// ---------- redo ----------

test('redo starts a new journey with the same settings and links back to the original', () => {
  let g = { id: 'orig', ...newGoalData({ type: 'habit', title: 'Read 10 pages', why: 'Learn', description: 'Nightly', startDate: '2026-01-01', now: at('2026-01-01') }) };
  const answers = [];
  for (let i = 0; i < 66; i++) answers.push([addDays('2026-01-01', i), 'yes']);
  ({ goal: g } = run(g, answers));
  assert.equal(g.status, 'completed');

  const again = redoData(g, { startDate: '2026-04-01', now: at('2026-04-01') });
  assert.equal(again.title, 'Read 10 Pages');
  assert.equal(again.why, 'Learn');
  assert.equal(again.description, 'Nightly');
  assert.equal(again.targetDays, 66);
  assert.equal(again.attemptStart, '2026-04-01');
  assert.equal(again.status, 'active');
  assert.equal(again.redoOf, 'orig');
  assert.deepEqual(again.checkins, {});
});

test('redo of a sankalpa or SMART goal takes the chosen length or deadline and resets the numbers', () => {
  const s = { id: 'x', ...newGoalData({ type: 'sankalpa', title: 'Walk', why: WHY, description: DESC, days: 12, startDate: '2026-01-01', now: at('2026-01-01') }), status: 'completed' };
  assert.equal(redoData(s, { startDate: '2026-02-01', days: 20, now: at('2026-02-01') }).targetDays, 20);

  const m = { id: 'y', ...newGoalData({ ...smartBase, startDate: '2026-01-01', endDate: '2026-01-10', now: at('2026-01-01') }), status: 'completed' };
  const d = redoDefaults(m, '2026-02-01');
  assert.equal(d.endDate, '2026-02-10');
  assert.equal(d.why, 'It Makes Me Feel Steady');
  const again = redoData(m, { startDate: '2026-02-01', endDate: d.endDate, now: at('2026-02-01') });
  assert.equal(again.targetDays, 10);
  assert.equal(again.smart.specific, 'Run 5 Km in the Park Near Home');
  assert.equal(again.smart.plan.length, 2);
  assert.deepEqual(again.logs, {});
});

test('only accomplished journeys can be redone', () => {
  const g = { id: 'a', ...newGoalData({ type: 'habit', title: 'Read', why: WHY, description: DESC, startDate: '2026-01-01', now: at('2026-01-01') }) };
  assert.throws(() => redoData(g, { startDate: '2026-02-01' }), /accomplished/);
});

// ---------- v6: stable plan keys, more periods, check-in summary, redo of misses ----------

test('plan items keep their key when the plan is edited, so logged numbers stay with their item', () => {
  let s = smartGoal('k1', { startDate: '2026-01-01', endDate: '2026-01-30', now: at('2026-01-01') });
  s = { ...s, ...applySmartLog(s, [{ index: 1, date: '2026-01-01', value: '20' }], at('2026-01-01')).patch };
  // Edit: put a new item first, keep the walk (key 1) second.
  const edited = cleanPlan([
    { action: 'Stretch', amount: 5, per: 'day' },
    { action: 'Walk after dinner', amount: 20, per: 'day', key: 1 },
    { action: 'Run', amount: 3, per: 'week', key: 0 },
  ]);
  assert.deepEqual(edited.map((p) => p.key), [2, 1, 0]);
  const g = { ...s, smart: { ...s.smart, plan: edited } };
  const p = smartProgress(g, '2026-01-01');
  assert.equal(p.items.find((it) => it.action === 'Walk After Dinner').done, 20);
  assert.equal(p.items.find((it) => it.action === 'Stretch').done, 0);
});

test('SMART periods: every two weeks and every month are supported', () => {
  const s = smartGoal('per', { startDate: '2026-01-01', endDate: '2026-02-11', now: at('2026-01-01') }); // 42 days
  const plan = cleanPlan([
    { action: 'Review', amount: 1, per: 'biweekly' },
    { action: 'Measure', amount: 2, per: 'month' },
  ]);
  const p = smartProgress({ ...s, smart: { ...s.smart, plan } }, '2026-01-01');
  assert.equal(p.items[0].total, 3);   // 42 days / 14
  assert.equal(p.items[1].total, 3);   // ceil(2 * 42 / 30)
  assert.ok(Math.abs(p.items[0].dayTarget - 1 / 14) < 1e-9);
});

test('check-in summary counts journeys, open ones, fields still to fill, and filled today', () => {
  const today = '2026-01-05';
  const habit = { id: 'h', ...newGoalData({ type: 'habit', title: 'Read', why: WHY, description: DESC, startDate: '2026-01-01', now: at('2026-01-01') }) };
  const habitDone = { ...habit, id: 'hd', checkins: { '2026-01-01': 'done', '2026-01-02': 'done', '2026-01-03': 'done', '2026-01-04': 'done', '2026-01-05': 'done' } };
  const smart = smartGoal('s', { startDate: '2026-01-01', endDate: '2026-01-30', now: at('2026-01-01') });
  const done = [{ ...habitDone, status: 'active' }];
  const summary = checkinSummary([habit, habitDone, smart, { ...habit, id: 'x', status: 'completed' }], today);
  assert.equal(summary.total, 3);             // completed one is not active
  assert.equal(summary.filled, 1);            // habitDone recorded for today
  assert.equal(summary.open, 2);              // habit waiting on day 1, SMART day 1 open
  assert.equal(summary.needed, 1 + 2);        // one habit tick + two SMART fields (plan has two items)
  assert.equal(done.length, 1);
});

test('a missed journey can be redone from its record, with the same settings', () => {
  const g = { id: 'm1', ...newGoalData({ type: 'habit', title: 'Read', why: WHY, description: DESC, startDate: '2026-01-01', now: at('2026-01-01') }), status: 'abandoned' };
  assert.throws(() => redoData(g, { startDate: '2026-02-01' }), /accomplished/);
  const again = redoData(g, { startDate: '2026-02-01', fromMiss: true, now: at('2026-02-01') });
  assert.equal(again.title, 'Read');
  assert.equal(again.redoOf, 'm1');
});

test('a sankalpa length can change, but not below the days already done', () => {
  const g = { id: 'sk', ...newGoalData({ type: 'sankalpa', title: 'Walk', why: WHY, description: DESC, days: 10, startDate: '2026-01-01', now: at('2026-01-01') }), checkins: { '2026-01-01': 'done', '2026-01-02': 'done' } };
  assert.equal(cleanSankalpaDays(g, '20'), 20);
  assert.throws(() => cleanSankalpaDays(g, '1'), /already done/);
  assert.throws(() => cleanSankalpaDays(g, '0'), /between/);
});

test('Kāma Digvijaya Saṅkalpaṁ is checked in the morning after its day, in any type', () => {
  const title = 'Kāma Digvijaya Saṅkalpaṁ';
  assert.equal(checkinDay({ title }, '2026-01-05'), '2026-01-04');
  assert.equal(checkinDay({ title: 'kama  digvijaya sankalpam' }, '2026-01-05'), '2026-01-04');
  assert.equal(checkinDay({ title: 'Read' }, '2026-01-05'), '2026-01-05');

  const g = { id: 'k', ...newGoalData({ type: 'sankalpa', title, days: 3, now: at('2026-01-01') }) };
  // On the start day nothing is open: the first day is recorded tomorrow morning.
  assert.equal(journey(g, '2026-01-01').next, null);
  assert.equal(nextActionText(g, '2026-01-01').kind, 'wait');
  // Next morning, yesterday is the open day. Today stays locked.
  assert.equal(journey(g, '2026-01-02').next.date, '2026-01-01');
  assert.equal(nextActionText(g, '2026-01-02').text, 'Check in for yesterday');
  assert.throws(() => applyCheckin(g, '2026-01-02', 'yes', at('2026-01-02')), /not open/);
  const res = applyCheckin(g, '2026-01-01', 'yes', at('2026-01-02'));
  assert.equal(res.patch.checkins['2026-01-01'], 'done');
  assert.equal(checkinSummary([{ ...g, checkins: res.patch.checkins }], '2026-01-02').filled, 1);
});

test('a SMART goal named Kāma Digvijaya Saṅkalpaṁ logs yesterday, never today', () => {
  const plan = cleanPlan([{ action: 'Chant', amount: 10, per: 'day' }]);
  const g = {
    id: 's',
    ...newGoalData({
      type: 'smart', title: 'Kāma Digvijaya Saṅkalpaṁ', days: 3, startDate: '2026-01-01', now: at('2026-01-01'),
      smart: { specific: 'Chant daily', realistic: 'Ten minutes', timeBound: 'Three days', plan },
    }),
  };
  assert.throws(() => applySmartLog(g, [{ index: 0, date: '2026-01-01', value: 5 }], at('2026-01-01')), /not open/);
  const res = applySmartLog(g, [{ index: 0, date: '2026-01-01', value: 5 }], at('2026-01-02'));
  assert.equal(res.patch.logs['2026-01-01'][0], 5);
  assert.equal(nextActionText({ ...g, logs: res.patch.logs }, '2026-01-02').text, 'Log yesterday');
});

test('other journeys still check in on the same day', () => {
  const g = newGoal('2026-01-01');
  assert.equal(nextActionText(g, '2026-01-01').text, 'Check in for today');
});

test('plan items keep an optional note, and bold markers survive title case', () => {
  const plan = cleanPlan([{ action: 'read chapters', amount: 2, per: 'day', note: 'one chapter in the morning' }]);
  assert.equal(plan[0].note, 'One Chapter in the Morning');
  assert.equal(cleanPlan([{ action: 'Read', amount: 1 }])[0].note, '');
  assert.equal(titleCase('**morning routine**\nwake at 5'), '**Morning Routine**\nWake at 5');
  assert.equal(titleCase('plain text'), 'Plain Text');
});

test('the notes switch is stored on a SMART goal', () => {
  const plan = cleanPlan([{ action: 'Read', amount: 1 }]);
  const base = { specific: 'A', realistic: 'B', timeBound: 'C', plan };
  const on = newGoalData({ type: 'smart', title: 'Notes on', days: 2, smart: { ...base, notes: true }, now: at('2026-01-01') });
  const off = newGoalData({ type: 'smart', title: 'Notes off', days: 2, smart: base, now: at('2026-01-01') });
  assert.equal(on.smart.notes, true);
  assert.equal(off.smart.notes, false);
});

test('a next-morning journey counts only the days checked in, not the calendar', () => {
  const g = { id: 'k', ...newGoalData({ type: 'sankalpa', title: 'Kāma Digvijaya Saṅkalpaṁ', days: 10, now: at('2026-01-01') }) };
  assert.equal(dayNumber(g, '2026-01-09'), 1);            // nothing checked in yet, however many days passed
  const res = applyCheckin(g, '2026-01-01', 'yes', at('2026-01-02'));
  const after = { ...g, checkins: res.patch.checkins };
  assert.equal(dayNumber(after, '2026-01-09'), 1);       // still only one check-in
  assert.equal(dayNumber({ ...g, title: 'Read' }, '2026-01-09'), 9);   // other journeys keep the calendar count
});

test('hours per day and Pomodoros per day plan items count per day', () => {
  const plan = cleanPlan([{ action: 'Deep work', amount: 2, per: 'day', unit: 'hr' }, { action: 'Focus', amount: 4, per: 'pomodoros-day' }]);
  assert.deepEqual(plan.map((p) => [p.per, p.unit]), [['day', 'hr'], ['day', 'pomodoros']]);   // old choice still reads as a unit
  assert.equal(periodLabel('day', 'pomodoros'), 'pomodoros per day');
  assert.equal(periodLabel('week'), 'per week');
  assert.equal(cleanPlan([{ action: 'Read', amount: 1, per: 'bogus' }])[0].per, 'day');
  const g = { id: 'h', ...newGoalData({ type: 'smart', title: 'Deep work', days: 5, now: at('2026-01-01'), smart: { specific: 'A', realistic: 'B', timeBound: 'C', plan } }) };
  const p = smartProgress({ ...g, logs: { '2026-01-01': { 0: 1, 1: 4 } } }, '2026-01-01');
  assert.equal(p.items[0].total, 10);   // 2 hours a day for 5 days
  assert.equal(p.items[1].total, 20);   // 4 Pomodoros a day for 5 days
});

test('a total over the whole goal divides into an amount per period', () => {
  assert.equal(perPeriodAmount(30, 10, 'day'), 3);          // 30 items over 10 days is 3 a day
  assert.equal(perPeriodAmount(10, 30, 'day', 'hr'), 0.33);  // a measured unit keeps two decimals
  assert.equal(perPeriodAmount(10, 30, 'day'), 1);           // whole things round up, so the 10 is reached
  assert.equal(perPeriodAmount(10, 30, 'day', 'pomodoros'), 1);
  assert.equal(perPeriodAmount(12, 14, 'week'), 6);         // 12 over two weeks is 6 a week
  assert.equal(perPeriodAmount(20, 5, 'hours-day'), 4);     // hours per day works the same
  assert.equal(perPeriodAmount('', 10, 'day'), null);
  assert.equal(perPeriodAmount(5, 0, 'day'), null);
  assert.equal(perPeriodAmount(-2, 10, 'day'), null);
});

test('a journey that starts in the future shows no day until its start day', () => {
  const g = { id: 'f', ...newGoalData({ type: 'habit', title: 'Read', now: at('2026-01-10') }) };
  g.attemptStart = '2026-01-15';
  assert.equal(dayNumber(g, '2026-01-10'), 0);
  assert.equal(dayNumber(g, '2026-01-14'), 0);
  assert.equal(dayNumber(g, '2026-01-15'), 1);
  assert.equal(dayNumber(g, '2026-01-16'), 2);
});

test('the name matches in any capitals, with or without accents and punctuation', () => {
  for (const title of ['KĀMA DIGVIJAYA SAṄKALPAṀ', 'kama digvijaya sankalpam', 'Kama Digvijaya Sankalpam', 'Kama-Digvijaya, Sankalpam!', '  kāma   digvijaya saṅkalpaṁ ']) {
    assert.equal(isNextMorning({ title }), true, title);
  }
  assert.equal(isNextMorning({ title: 'Kama Digvijaya Sankalpa' }), false);
});

test('WhatsApp-style markers keep their first letter capitalised', () => {
  assert.equal(titleCase('_italic_ text'), '_Italic_ Text');
  assert.equal(titleCase('~strike~ word'), '~Strike~ Word');
  assert.equal(titleCase('*bold* word'), '*Bold* Word');
});

test('a journey page says Started once its day has come, and Starting before, with how far away', () => {
  const today = '2026-11-20';
  assert.deepEqual(startInfo('2026-11-20', today), { word: 'Started', text: null });
  assert.deepEqual(startInfo('2026-11-01', today), { word: 'Started', text: null });
  assert.deepEqual(startInfo('2026-11-21', today), { word: 'Starting', text: 'Tomorrow' });
  assert.deepEqual(startInfo('2026-11-22', today), { word: 'Starting', text: 'Day After Tomorrow' });
  assert.deepEqual(startInfo('2026-11-27', today), { word: 'Starting', text: 'In 7 Days' });
  assert.deepEqual(startInfo('2026-12-02', today), { word: 'Starting', text: 'In 12 Days' });
  assert.deepEqual(startInfo('2026-12-15', today), { word: 'Starting', text: 'Next Month' });
  assert.deepEqual(startInfo('2027-02-10', today), { word: 'Starting', text: null });
});
