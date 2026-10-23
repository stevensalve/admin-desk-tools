'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ic = require('../js/core.js');

const TODAY = '2026-10-23';
const inc = (o) =>
  Object.assign(
    { title: 'Leak', category: 'Facilities', severity: 'High', reportedBy: 'Asha', reportedOn: TODAY, location: 'F2', assignedTo: 'Ravi' },
    o || {},
  );

test('add: reference, due date from the target, validation, no mutation', () => {
  const s0 = ic.create();
  const r = ic.add(s0, inc());
  assert.equal(r.incident.ref, 'INC-0001');
  assert.equal(r.incident.dueOn, '2026-10-26', 'High = 3 days');
  assert.equal(r.incident.status, 'Open');
  assert.equal(s0.incidents.length, 0);
  assert.equal(ic.add(r.state, inc({ severity: 'Critical' })).incident.dueOn, '2026-10-24');
  assert.equal(ic.add(r.state, inc({ severity: 'Low' })).incident.ref, 'INC-0002');
  assert.equal(ic.add(s0, inc({ category: ' ' })).incident.category, 'General');
  assert.throws(() => ic.add(s0, inc({ title: ' ' })), /Describe the incident/);
  assert.throws(() => ic.add(s0, inc({ severity: 'Huge' })), /Choose a severity/);
  assert.throws(() => ic.add(s0, inc({ reportedOn: '2026-02-30' })), /does not exist/);
});

test('setSla changes future due dates and validates', () => {
  const s = ic.setSla(ic.create(), { Critical: 0, High: 2, Medium: 5, Low: 10 });
  assert.equal(ic.add(s, inc()).incident.dueOn, '2026-10-25');
  assert.equal(ic.add(s, inc({ severity: 'Critical' })).incident.dueOn, TODAY, '0 days = same day');
  assert.throws(() => ic.setSla(ic.create(), { Critical: -1, High: 2, Medium: 5, Low: 10 }), /Critical must be a whole number/);
  assert.throws(() => ic.setSla(ic.create(), { Critical: 1, High: 2.5, Medium: 5, Low: 10 }), /High must be/);
});

test('setStatus: resolve needs a sensible date, reopen clears it, closing keeps the first resolved date', () => {
  let s = ic.add(ic.create(), inc({ reportedOn: '2026-10-20' })).state;
  assert.throws(() => ic.setStatus(s, 1, 'Resolved', '2026-10-19'), /before it was reported/);
  assert.throws(() => ic.setStatus(s, 1, 'Resolved', ''), /Dates must look like/);
  assert.throws(() => ic.setStatus(s, 1, 'Done', TODAY), /Choose a status/);
  assert.throws(() => ic.setStatus(s, 9, 'Open', TODAY), /No such incident/);
  s = ic.setStatus(s, 1, 'Resolved', '2026-10-22');
  assert.equal(s.incidents[0].resolvedOn, '2026-10-22');
  s = ic.setStatus(s, 1, 'Closed', '2026-10-23');
  assert.equal(s.incidents[0].resolvedOn, '2026-10-22');
  s = ic.setStatus(s, 1, 'In progress', TODAY);
  assert.equal(s.incidents[0].resolvedOn, '');
});

test('assign, severity change recomputes due date, notes', () => {
  let s = ic.add(ic.create(), inc()).state;
  s = ic.assign(s, 1, '  Kiran  ');
  assert.equal(s.incidents[0].assignedTo, 'Kiran');
  s = ic.setSeverity(s, 1, 'Low');
  assert.equal(s.incidents[0].dueOn, '2026-11-06');
  assert.throws(() => ic.setSeverity(s, 1, 'x'), /Choose a severity/);
  s = ic.addNote(s, 1, TODAY, 'Called the vendor');
  assert.deepEqual(s.incidents[0].notes, [{ date: TODAY, text: 'Called the vendor' }]);
  assert.throws(() => ic.addNote(s, 1, TODAY, ' '), /Write a note/);
});

test('list: age, overdue, late-resolved, order and filters', () => {
  const s = ic.sample(TODAY);
  const rows = ic.list(s, TODAY);
  assert.equal(rows.length, 5);
  const by = (t) => rows.find((r) => r.title.indexOf(t) === 0);
  assert.equal(by('AC not').ageDays, 12);
  assert.equal(by('AC not').dueOn, '2026-10-18');
  assert.equal(by('AC not').overdue, true);
  assert.equal(by('AC not').daysToDue, -5);
  assert.equal(by('Wi-Fi').overdue, true, 'reported 6 days ago, High = 3 days');
  assert.equal(by('Lift').overdue, false);
  assert.equal(by('Pantry').open, false);
  assert.equal(by('Pantry').late, false, 'Low = 14 days, resolved on day 8');
});

test('list filters and ordering', () => {
  const s = ic.sample(TODAY);
  const rows = ic.list(s, TODAY);
  assert.equal(rows[0].title.indexOf('AC not'), 0, 'most overdue first');
  assert.equal(rows[rows.length - 1].open, false, 'finished last');
  assert.equal(ic.list(s, TODAY, { openOnly: true }).length, 4);
  assert.equal(ic.list(s, TODAY, { overdueOnly: true }).length, 2);
  assert.equal(ic.list(s, TODAY, { category: 'IT' }).length, 1);
  assert.equal(ic.list(s, TODAY, { text: 'wi-fi' }).length, 1);
  assert.equal(ic.list(s, TODAY, { status: 'In progress' }).length, 1);
});

test('summary', () => {
  const m = ic.summary(ic.sample(TODAY), TODAY);
  assert.equal(m.total, 5);
  assert.equal(m.open, 4);
  assert.equal(m.overdue, 2);
  assert.equal(m.averageDays, 8);
  assert.equal(m.withinTarget, 100);
  assert.equal(m.oldestOpen.ageDays, 12);
  assert.equal(m.bySeverity.find((x) => x.key === 'Critical').count, 1);
  assert.equal(m.byCategory[0].key, 'Facilities');
  assert.equal(ic.summary(ic.create(), TODAY).averageDays, null);
});

test('CSV guards formulas and quotes', () => {
  const s = ic.add(ic.create(), inc({ title: '=cmd, "x"' })).state;
  const csv = ic.toCsv(ic.list(s, TODAY));
  assert.ok(csv.startsWith('﻿Ref,'));
  assert.ok(csv.indexOf('"\'=cmd, ""x"""') !== -1);
});

test('serialize/parse round trip and bad files', () => {
  const s = ic.sample(TODAY);
  const back = ic.parse(ic.serialize(s));
  assert.deepEqual(ic.list(back, TODAY), ic.list(s, TODAY));
  assert.equal(back.incidents[1].notes.length, 1);
  assert.throws(() => ic.parse('nope'), /not a saved incident log/);
  assert.throws(() => ic.parse('{"app":"x"}'), /not a saved incident log/);
});
