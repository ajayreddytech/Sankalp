import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGoalData, applyCheckin, applyAbandon, journey, totalCells, addDays, diffDays, notAccomplished, accomplished,
  suggestIcon,
} from '../js/logic.js';

test('icon is chosen automatically from the title', () => {
  assert.equal(suggestIcon('Read 10 pages'), 'book-open');
  assert.equal(suggestIcon('Gym at 6am'), 'dumbbell');
  assert.equal(suggestIcon('Drink 3 litres of water'), 'droplet');
  assert.equal(suggestIcon('No sugar'), 'ban');
  assert.equal(suggestIcon('Walk 8000 steps', 'sankalpa'), 'footprints');
  assert.equal(suggestIcon('Something unusual'), 'sparkles');
  assert.equal(suggestIcon('Something unusual', 'sankalpa'), 'mountain');
  assert.equal(newGoalData({ type: 'habit', title: 'Meditate every morning' }).icon, 'brain');
  assert.equal(newGoalData({ type: 'habit', title: 'Meditate', icon: 'star' }).icon, 'star');
});

// Local-time "now" for a given day, so tests do not depend on timezone.
const at = (dateStr) => new Date(`${dateStr}T12:00:00`);

function newGoal(start = '2026-01-01', extra = {}) {
  return { id: 'g1', ...newGoalData({ type: 'habit', title: 'Read', now: at(start) }), ...extra };
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

test('habit defaults to 66 days and a sankalpa uses the chosen length', () => {
  assert.equal(newGoal().targetDays, 66);
  const s = newGoalData({ type: 'sankalpa', title: 'Walk', days: 30 });
  assert.equal(s.targetDays, 30);
  assert.throws(() => newGoalData({ type: 'sankalpa', title: 'x', days: 0 }));
  assert.throws(() => newGoalData({ type: 'habit', title: '   ' }));
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
  // day 1 done, day 2 miss (exception), day 3 miss again -> too soon -> restart
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
  // day 16 is the first miss (index 15)
  ({ goal: g } = run(g, answers));
  const first = applyCheckin(g, '2026-01-16', 'no', at('2026-01-16'));
  assert.equal(first.outcome, 'exception');
  g = { ...g, ...first.patch };
  // fill days 17..30 (14 more days) then miss on 2026-01-31 -> diff = 15 -> allowed
  const more = [];
  for (let d = 17; d <= 30; d++) more.push([addDays('2026-01-01', d - 1), 'yes']);
  ({ goal: g } = run(g, more));
  const second = applyCheckin(g, '2026-01-31', 'no', at('2026-01-31'));
  assert.equal(second.outcome, 'exception');
  assert.equal(diffDays('2026-01-16', '2026-01-31'), 15);
});

test('third miss is a failure even after a long gap', () => {
  // Jan 1 and Feb 1 are exceptions, every other day up to Feb 28 is done, so Mar 1 is the open day.
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
  const rows = notAccomplished([after]);
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
  assert.equal(newGoalData({ type: 'habit', title: 'Read', startDate: '2025-12-01', now }).attemptStart, '2025-12-01');
  assert.equal(newGoalData({ type: 'habit', title: 'Read', startDate: '', now }).attemptStart, '2026-01-10');
  assert.equal(normalizeStartDate('2026-02-28', now), '2026-02-28');
  assert.throws(() => normalizeStartDate('2026-02-30', now));
  assert.throws(() => normalizeStartDate('10/01/2026', now));
});
