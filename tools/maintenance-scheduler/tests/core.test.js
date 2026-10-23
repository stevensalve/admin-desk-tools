'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mc = require('../js/core.js');

const TODAY = '2026-10-23';
const load = () => {
  const r = mc.parseLines(mc.sampleText(), TODAY);
  let s = mc.create();
  r.tasks.forEach((t) => (s = mc.addTask(s, t)));
  return s;
};

test('addMonths / addInterval: clamping and units', () => {
  assert.equal(mc.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(mc.addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(mc.addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(mc.addInterval('2026-10-23', 10, 'days'), '2026-11-02');
  assert.equal(mc.addInterval('2026-10-23', 2, 'weeks'), '2026-11-06');
  assert.equal(mc.addInterval('2024-02-29', 1, 'years'), '2025-02-28');
  assert.throws(() => mc.addInterval('2026-10-23', 1, 'decades'), /days, weeks, months or years/);
});

test('parseEvery understands words and numbers', () => {
  assert.deepEqual(mc.parseEvery('3 months'), { every: 3, unit: 'months' });
  assert.deepEqual(mc.parseEvery('Every 2 weeks'), { every: 2, unit: 'weeks' });
  assert.deepEqual(mc.parseEvery('quarterly'), { every: 3, unit: 'months' });
  assert.deepEqual(mc.parseEvery('yearly'), { every: 1, unit: 'years' });
  assert.deepEqual(mc.parseEvery('90 days'), { every: 90, unit: 'days' });
  assert.deepEqual(mc.parseEvery('1 year'), { every: 1, unit: 'years' });
  assert.equal(mc.parseEvery('sometimes'), null);
  assert.equal(mc.parseEvery('0 days'), null);
});

test('parseLines: sample parses, errors are specific', () => {
  const r = mc.parseLines(mc.sampleText(), TODAY);
  assert.equal(r.errors.length, 0);
  assert.equal(r.tasks.length, 6);
  assert.equal(r.tasks[1].every, 1);
  assert.equal(r.tasks[1].unit, 'years');
  const bad = mc.parseLines('A, B\nA, B, whenever\nA, B, monthly, not-a-date\nA, B, monthly\n# c', TODAY);
  assert.equal(bad.tasks.length, 1);
  assert.equal(bad.tasks[0].lastDone, '');
  assert.equal(bad.tasks[0].firstDue, TODAY);
  assert.equal(bad.errors.length, 3);
});

test('addTask validates; removeTask; no mutation', () => {
  const s = mc.create();
  const ok = { asset: 'Lift', task: 'Inspect', every: 3, unit: 'months', lastDone: '2026-08-20', firstDue: '' };
  const s2 = mc.addTask(s, ok);
  assert.equal(s.tasks.length, 0);
  assert.equal(s2.tasks[0].id, 1);
  assert.equal(s2.tasks[0].firstDue, '', 'firstDue is dropped when a last-done date exists');
  assert.throws(() => mc.addTask(s, Object.assign({}, ok, { asset: ' ' })), /asset or area/);
  assert.throws(() => mc.addTask(s, Object.assign({}, ok, { task: '' })), /what has to be done/);
  assert.throws(() => mc.addTask(s, Object.assign({}, ok, { every: 0 })), /whole number/);
  assert.throws(() => mc.addTask(s, Object.assign({}, ok, { every: 1.5 })), /whole number/);
  assert.throws(() => mc.addTask(s, Object.assign({}, ok, { unit: 'x' })), /days, weeks/);
  assert.throws(() => mc.addTask(s, Object.assign({}, ok, { lastDone: '2026-02-30' })), /does not exist/);
  assert.throws(() => mc.addTask(s, Object.assign({}, ok, { lastDone: '', firstDue: '' })), /Dates must look like/);
  assert.equal(mc.removeTask(s2, 1).tasks.length, 0);
});

test('nextDue and status: overdue, due soon, ok', () => {
  const s = load();
  const rows = mc.status(s, TODAY, 14);
  const by = (a) => rows.find((r) => r.task.asset === a);
  assert.equal(by('Lift 1').due, '2026-11-20');
  assert.equal(by('Lift 1').status, 'ok');
  assert.equal(by('Fire extinguishers').due, '2026-11-05');
  assert.equal(by('Fire extinguishers').status, 'due soon');
  assert.equal(by('Fire extinguishers').daysLeft, 13);
  assert.equal(by('Air conditioners (floor 2)').due, '2026-11-10');
  assert.equal(by('DG set').due, '2026-10-28');
  assert.equal(by('DG set').status, 'due soon');
  assert.equal(by('Water tanks').due, '2026-11-02');
  assert.equal(by('UPS room').due, '2026-10-15');
  assert.equal(by('UPS room').status, 'overdue');
  assert.equal(rows[0].task.asset, 'UPS room', 'most urgent first');
  assert.equal(mc.status(s, TODAY, 0).filter((r) => r.status === 'due soon').length, 0);
  assert.throws(() => mc.status(s, TODAY, 999), /between 0 and 365/);
  assert.throws(() => mc.status(s, 'x'), /Dates must look like/);
});

test('a never-done task is due on its first-due date', () => {
  const s = mc.addTask(mc.create(), { asset: 'New', task: 'Check', every: 1, unit: 'months', lastDone: '', firstDue: '2026-10-30' });
  const r = mc.status(s, TODAY)[0];
  assert.equal(r.due, '2026-10-30');
  assert.equal(r.daysLeft, 7);
});

test('markDone restarts the interval from the day it was done; history; guards', () => {
  let s = load();
  const ups = s.tasks.find((t) => t.asset === 'UPS room');
  s = mc.markDone(s, ups.id, '2026-10-20', 'Replaced 2 cells');
  assert.equal(
    mc.status(s, TODAY).find((r) => r.task.asset === 'UPS room').due,
    '2027-01-20',
    'late work does not bring the next one forward',
  );
  assert.equal(s.history.length, 1);
  assert.equal(s.history[0].note, 'Replaced 2 cells');
  assert.throws(() => mc.markDone(s, ups.id, '2026-10-01'), /before the last time/);
  assert.throws(() => mc.markDone(s, 999, TODAY), /No such task/);
  assert.throws(() => mc.markDone(s, ups.id, 'x'), /Dates must look like/);
  const fresh = mc.addTask(mc.create(), { asset: 'A', task: 'B', every: 1, unit: 'weeks', lastDone: '', firstDue: '2026-10-30' });
  assert.equal(mc.markDone(fresh, 1, '2026-10-25').tasks[0].firstDue, '');
});

test('forecast: repeats inside the range, sorted; overdue appears only if in range; range checks', () => {
  const s = load();
  const f = mc.forecast(s, '2026-10-23', '2027-01-31');
  assert.ok(f.every((x, i) => i === 0 || f[i - 1].date <= x.date));
  const dg = f.filter((x) => x.task.asset === 'DG set').map((x) => x.date);
  assert.deepEqual(dg, ['2026-10-28', '2026-11-28', '2026-12-28', '2027-01-28']);
  assert.ok(!f.some((x) => x.task.asset === 'UPS room' && x.date === '2026-10-15'), 'the overdue date is before the range');
  assert.ok(f.some((x) => x.task.asset === 'UPS room' && x.date === '2027-01-15'));
  assert.equal(
    mc.forecast(s, '2026-10-01', '2026-10-31').filter((x) => x.task.asset === 'UPS room').length,
    1,
    'overdue date inside the range is listed',
  );
  assert.throws(() => mc.forecast(s, '2026-11-01', '2026-10-01'), /before its start/);
  assert.throws(() => mc.forecast(s, '2026-01-01', '2030-01-01'), /up to three years/);
});

test('workload by month and owner', () => {
  const s = load();
  const w = mc.workload(mc.forecast(s, '2026-10-23', '2026-12-31'));
  assert.deepEqual(
    w.months.map((m) => m.key),
    ['2026-10', '2026-11', '2026-12'],
  );
  assert.equal(
    w.months.reduce((a, m) => a + m.count, 0),
    mc.forecast(s, '2026-10-23', '2026-12-31').length,
  );
  assert.equal(w.owners[0].owner, 'Ravi Kumar');
});

test('CSV exports and calendar file', () => {
  let s = load();
  s = mc.markDone(s, 1, '2026-10-22', 'ok, fine');
  const csv = mc.statusCsv(mc.status(s, TODAY));
  assert.ok(csv.startsWith('\ufeffAsset,Task,Location,Every,Last done,Next due,Days left,Status,Owner\r\n'));
  assert.equal(csv.split('\r\n').length, 7);
  assert.match(mc.historyCsv(s), /"ok, fine"/);
  const ics = mc.toIcs(mc.forecast(s, TODAY, '2026-12-31'), '20261023T000000Z');
  assert.ok(ics.includes('BEGIN:VEVENT') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /SUMMARY:DG set: Oil and load test/);
  const uids = ics.match(/UID:.*/g);
  assert.equal(new Set(uids).size, uids.length);
  assert.throws(() => mc.toIcs([], 'x'), /timestamp/);
});

test('serialize / parse round-trip, hardening', () => {
  let s = load();
  s = mc.markDone(s, 2, '2026-10-22', 'done');
  const back = mc.parse(mc.serialize(s));
  assert.deepEqual(
    back.tasks.map((t) => [t.asset, t.every, t.unit, t.lastDone]),
    s.tasks.map((t) => [t.asset, t.every, t.unit, t.lastDone]),
  );
  assert.equal(back.history.length, 1);
  assert.equal(back.history[0].id, 2);
  assert.throws(() => mc.parse('x'), /not a saved maintenance plan/);
  assert.throws(() => mc.parse('{"app":"y"}'), /not a saved maintenance plan/);
  const messy = mc.parse(
    JSON.stringify({
      app: 'maintenance-scheduler',
      state: {
        tasks: [
          { asset: '', task: 'x', every: 1, unit: 'days', lastDone: '2026-01-01' },
          { asset: 'ok', task: 'x', every: 0, unit: 'days', lastDone: '2026-01-01' },
          { asset: 'fine', task: 'x', every: 2, unit: 'weeks', lastDone: '01/01/2026' },
        ],
        history: [{ date: 'bad', asset: 'a' }],
      },
    }),
  );
  assert.equal(messy.tasks.length, 1);
  assert.equal(messy.tasks[0].lastDone, '2026-01-01');
  assert.equal(messy.history.length, 0);
});
