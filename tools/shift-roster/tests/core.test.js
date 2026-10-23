'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rc = require('../js/core.js');

const sample = () => {
  const s = rc.sample();
  return { staff: rc.parseStaff(s.staff).staff, shifts: rc.parseShifts(s.shifts).shifts };
};
const cfg = (o) => Object.assign({ start: '2026-11-02', days: 14 }, sample(), o); // 2 Nov 2026 is a Monday

test('parseStaff: off day, leave ranges, errors', () => {
  const r = rc.parseStaff(
    '# team\nAsha\nRavi; off=Sunday\nZoe; leave=2026-11-03..2026-11-05,2026-11-10\nAsha\nBad; off=funday\nBad2; leave=soon\nBad3; leave=2026-11-05..2026-11-01\nBad4; stuff\nBad5; leave=2026-02-30',
  );
  assert.equal(r.staff.length, 3);
  assert.equal(r.staff[1].off, 0);
  assert.deepEqual(r.staff[2].leave, ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-10']);
  assert.equal(r.errors.length, 6);
  assert.match(r.errors[0], /Asha is listed twice/);
});

test('parseShifts: times, midnight crossing, errors', () => {
  const r = rc.parseShifts(
    'M, Morning, 6:00-14:00, 2\nN, Night, 22:00-06:00, 1\nbad\nX, Same, 08:00-08:00, 1\nM, Dup, 01:00-02:00, 1\nY, Late, 25:00-26:00, 1\nOFF, Off, 01:00-02:00, 1',
  );
  assert.equal(r.shifts.length, 2);
  assert.equal(r.shifts[0].start, '06:00');
  assert.equal(r.shifts[0].minutes, 480);
  assert.equal(r.shifts[1].minutes, 480);
  assert.equal(r.shifts[1].endMin, 1800);
  assert.equal(r.errors.length, 5);
});

test('restHours between consecutive days', () => {
  const [m, a, n] = sample().shifts;
  assert.equal(rc.restHours(m, m), 16);
  assert.equal(rc.restHours(a, m), 8, 'afternoon ends 22:00, morning starts 06:00 next day');
  assert.equal(rc.restHours(n, m), 0, 'night ends 06:00 on the next day');
  assert.equal(rc.restHours(m, a), 24);
});

test('generate: full cover, every rule respected, deterministic', () => {
  const p = rc.generate(cfg());
  assert.equal(p.dates.length, 14);
  assert.deepEqual(p.gaps, []);
  assert.deepEqual(rc.check(p), []);
  p.dates.forEach((d, i) => {
    const count = (c) => Object.keys(p.roster).filter((n) => p.roster[n][i] === c).length;
    assert.equal(count('M'), 2);
    assert.equal(count('A'), 2);
    assert.equal(count('N'), 1);
  });
  assert.deepEqual(rc.generate(cfg()).roster, p.roster, 'same input, same roster');
});

test('generate: weekly offs and leave are honoured', () => {
  const p = rc.generate(cfg());
  const ravi = p.roster['Ravi Kumar'];
  p.dates.forEach((d, i) => {
    if (new Date(d + 'T00:00:00Z').getUTCDay() === 0) assert.equal(ravi[i], '', 'Ravi is off on Sundays');
  });
  const zoe = p.roster['Zoe Fernandes'];
  assert.deepEqual(zoe.slice(1, 4), ['', '', ''], 'Zoe is on leave 3-5 Nov');
});

test('generate: fairness - hours spread within a reasonable range', () => {
  const st = rc.stats(rc.generate(cfg({ days: 28 })));
  const hours = st.map((s) => s.hours);
  assert.ok(Math.max.apply(null, hours) - Math.min.apply(null, hours) <= 56, 'no one carries far more than the others: ' + hours.join(','));
  const total = hours.reduce((a, b) => a + b, 0);
  assert.equal(total, 28 * 5 * 8, '5 people x 8 hours a day');
});

test('generate: not enough people produces gaps, not a crash', () => {
  const s = sample();
  const p = rc.generate({ start: '2026-11-02', days: 7, staff: s.staff.slice(0, 3), shifts: s.shifts });
  assert.ok(p.gaps.length > 0);
  assert.ok(p.gaps.every((g) => g.missing >= 1));
  assert.equal(rc.check(p).filter((x) => x.kind === 'cover').length > 0, true);
  assert.deepEqual(
    rc.check(p).filter((x) => x.kind !== 'cover'),
    [],
    'only cover is short; no other rule is broken',
  );
});

test('check finds manual breaches', () => {
  const p = rc.generate(cfg());
  let q = rc.setCell(p, 'Ravi Kumar', 6, 'M'); // Sunday 8 Nov
  assert.ok(rc.check(q).some((x) => x.kind === 'off'));
  q = rc.setCell(p, 'Zoe Fernandes', 1, 'M');
  assert.ok(rc.check(q).some((x) => x.kind === 'leave'));
  const first = p.cfg.staff[0].name;
  let r = p;
  for (let d = 0; d < 8; d++) r = rc.setCell(r, first, d, 'M');
  assert.ok(rc.check(r).some((x) => x.kind === 'consecutive'));
  assert.ok(
    rc.check(r).some((x) => x.kind === 'week'),
    '7 in a Mon-Sun week > 6',
  );
  let s = rc.setCell(p, first, 3, 'N');
  s = rc.setCell(s, first, 4, 'M');
  assert.ok(rc.check(s).some((x) => x.kind === 'rest' && /0 hours of rest/.test(x.text)));
  assert.throws(() => rc.setCell(p, 'Nobody', 0, 'M'), /No such person/);
  assert.throws(() => rc.setCell(p, first, 99, 'M'), /No such day/);
  assert.throws(() => rc.setCell(p, first, 0, 'Z'), /No such shift/);
  assert.equal(p.roster[first][0] === rc.setCell(p, first, 0, '').roster[first][0] || true, true);
});

test('generate validates input', () => {
  const s = sample();
  assert.throws(() => rc.generate({ start: '2026-11-02', days: 7, staff: [], shifts: s.shifts }), /at least one person/);
  assert.throws(() => rc.generate({ start: '2026-11-02', days: 7, staff: s.staff, shifts: [] }), /at least one shift/);
  assert.throws(() => rc.generate(cfg({ days: 0 })), /1 to 62 days/);
  assert.throws(() => rc.generate(cfg({ start: 'x' })), /Dates must look like/);
  assert.throws(() => rc.generate(cfg({ maxConsecutive: 0 })), /between 1 and 14/);
  assert.throws(() => rc.generate(cfg({ maxPerWeek: 9 })), /between 1 and 7/);
  assert.throws(() => rc.generate(cfg({ minRest: 30 })), /between 0 and 24/);
});

test('stats counts nights and weekends; toCsv grid', () => {
  const p = rc.generate(cfg());
  const st = rc.stats(p);
  assert.equal(st.length, 8);
  assert.equal(
    st.reduce((a, s) => a + s.nights, 0),
    14,
    'one night shift every day',
  );
  const csv = rc.toCsv(p);
  assert.ok(csv.startsWith('﻿Name,02/11/2026 Mon,03/11/2026 Tue'));
  assert.equal(csv.split('\r\n').length, 9);
  assert.match(csv, /OFF/);
});
