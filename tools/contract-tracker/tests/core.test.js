'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ct = require('../js/core.js');

const TODAY = '2026-10-23';
const C = (o) =>
  Object.assign(
    {
      line: 2,
      name: 'X',
      party: '',
      type: 'General',
      start: '',
      end: '2027-12-31',
      value: 0,
      noticeDays: 30,
      autoRenew: false,
      owner: 'Asha',
      notes: '',
    },
    o,
  );
const status = (o, opts) => ct.analyse([C(o)], TODAY, opts)[0].status;

test('rowsToContracts: sample, flags, bad rows', () => {
  const r = ct.rowsToContracts(ct.sampleRows());
  assert.equal(r.errors.length, 0);
  assert.equal(r.contracts.length, 6);
  assert.equal(r.contracts[1].autoRenew, true);
  assert.equal(r.contracts[0].end, '2027-03-31');
  assert.equal(r.contracts[0].value, 2400000);
  const bad = ct.rowsToContracts([
    ['Name', 'End Date', 'Start', 'Value'],
    ['A', 'never', '', ''],
    ['B', '01/01/2027', '01/02/2027', ''],
    ['C', '01/01/2027', '', 'x'],
    ['D', '01/01/2027', '', 'Rs. 1,000'],
  ]);
  assert.equal(bad.contracts.length, 1);
  assert.equal(bad.contracts[0].value, 1000);
  assert.equal(bad.contracts[0].owner, '(no owner)');
  assert.equal(bad.errors.length, 3);
  assert.match(ct.rowsToContracts([['Foo'], ['x']]).errors[0], /Contract name and End date/);
  assert.match(ct.rowsToContracts([['Name']]).errors[0], /header row/);
});

test('status rules', () => {
  assert.equal(status({ end: '2026-10-22' }), 'expired');
  assert.equal(status({ end: '2026-10-23' }), 'act now', 'ends today: notice already passed, no auto-renew');
  assert.equal(status({ end: '2026-12-15', noticeDays: 30 }), 'act now', 'notice deadline 15 Nov is within 60 days');
  assert.equal(status({ end: '2027-03-01', noticeDays: 30 }), 'active', 'notice 29 Jan is 98 days away');
  assert.equal(
    status({ end: '2026-11-10', noticeDays: 30, autoRenew: true }),
    'locked in',
    'auto-renews and the 11 Oct deadline has passed',
  );
  assert.equal(status({ end: '2026-11-10', noticeDays: 0, autoRenew: false }), 'ending soon', 'no notice period, ends within the window');
  assert.equal(status({ end: '2027-03-01', noticeDays: 0 }), 'active');
  assert.equal(status({ end: '2027-03-01', noticeDays: 30 }, { alertDays: 120 }), 'act now', 'a wider window brings it in');
  assert.equal(
    status({ end: '2026-12-20', noticeDays: 0, autoRenew: true }),
    'ending soon',
    'auto-renew with no notice period: nothing locked',
  );
  assert.throws(() => ct.analyse([], TODAY, { alertDays: 0 }), /between 1 and 730/);
  assert.throws(() => ct.analyse([], 'x'), /Dates must look like/);
});

test('analyse: dates and sort order', () => {
  const rows = ct.analyse(ct.rowsToContracts(ct.sampleRows()).contracts, TODAY);
  assert.deepEqual(
    rows.map((r) => r.status),
    ['expired', 'locked in', 'act now', 'act now', 'active', 'active'],
  );
  assert.equal(rows[0].name, 'Internet leased line');
  const hk = rows.find((r) => r.name === 'Housekeeping services');
  assert.equal(hk.notice, '2026-10-01');
  assert.equal(hk.daysToEnd, 8);
  assert.equal(hk.daysToNotice, -22);
  assert.equal(rows[2].name, 'Security guards', 'ends 30 Nov');
  assert.equal(rows[2].notice, '2026-10-16');
  const lease = rows.find((r) => r.name.startsWith('Office lease'));
  assert.equal(lease.status, 'active');
});

test('summary', () => {
  const rows = ct.analyse(ct.rowsToContracts(ct.sampleRows()).contracts, TODAY);
  const s = ct.summary(rows, 90);
  assert.deepEqual(s.count, { expired: 1, 'locked in': 1, 'act now': 2, 'ending soon': 0, active: 2 });
  assert.equal(s.endingValue, 540000 + 780000 + 96000, 'housekeeping, security and the printer AMC end within 90 days');
  assert.equal(s.lockedValue, 540000);
  assert.equal(s.totalValue, 2400000 + 540000 + 96000 + 780000 + 180000 + 120000);
  assert.deepEqual(
    s.byOwner.map((o) => o.owner),
    ['Kiran Patel', 'Meera Shah', 'Ravi Kumar'],
  );
});

test('reminder wording per status', () => {
  const rows = ct.analyse(ct.rowsToContracts(ct.sampleRows()).contracts, TODAY);
  const s = ct.summary(rows);
  const ravi = ct.reminder(
    s.byOwner.find((o) => o.owner === 'Ravi Kumar'),
    TODAY,
  );
  assert.match(ravi, /^Hi Ravi,/);
  assert.match(
    ravi,
    /Housekeeping services \(CleanCo\): will auto-renew on 31\/10\/2026; the notice deadline \(01\/10\/2026\) has passed, about Rs\. 5,40,000 a year/,
  );
  const meera = ct.reminder(
    s.byOwner.find((o) => o.owner === 'Meera Shah'),
    TODAY,
  );
  assert.match(meera, /Security guards \(SafeGuard Ltd\): notice date 16\/10\/2026 has passed; ends 30\/11\/2026/);
  const kiran = ct.reminder(
    s.byOwner.find((o) => o.owner === 'Kiran Patel'),
    TODAY,
  );
  assert.match(kiran, /ended on 28\/02\/2026 \(237 days ago\)/);
  assert.match(ct.reminder({ owner: '(no owner)', items: [rows[0]] }, TODAY), /^Hi team,/);
});

test('toCsv', () => {
  const csv = ct.toCsv(ct.analyse(ct.rowsToContracts(ct.sampleRows()).contracts, TODAY));
  assert.ok(
    csv.startsWith('\ufeffContract,Party,Type,Owner,Start,End,Notice days,Notice deadline,Auto-renews,Annual value,Days to end,Status\r\n'),
  );
  assert.equal(csv.split('\r\n').length, 7);
});

test('toIcs: notice deadlines and end dates that are not past', () => {
  const rows = ct.analyse(ct.rowsToContracts(ct.sampleRows()).contracts, TODAY);
  const ics = ct.toIcs(rows, TODAY, '20261023T000000Z');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(
    (ics.match(/BEGIN:VEVENT/g) || []).length,
    7,
    'lease 2, printer 2, and one each for housekeeping, security and pantry (their notice dates are past or zero); the expired one gives none',
  );
  assert.match(ics, /SUMMARY:Contract ends: Security guards - SafeGuard Ltd/);
  assert.match(ics, /TRIGGER:-P7D/);
  assert.doesNotMatch(ics, /Internet leased line/);
  ics.split('\r\n').forEach((l) => assert.ok(new TextEncoder().encode(l).length <= 75));
  const uids = ics.match(/UID:.*/g);
  assert.equal(new Set(uids).size, uids.length);
  assert.throws(() => ct.toIcs(rows, TODAY, 'nope'), /timestamp/);
});
