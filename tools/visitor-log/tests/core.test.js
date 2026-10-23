'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFLib = require('pdf-lib');
const vc = require('../js/core.js');

const NOW = '2026-10-23T10:00';
const V = (o) =>
  Object.assign(
    {
      name: 'Ravi Kumar',
      company: 'Acme',
      phone: '98765 43210',
      host: 'Asha Rao',
      purpose: 'Meeting',
      vehicle: 'mh12 ab 1234',
      idType: 'Aadhaar',
      idNumber: '1234 5678 9012',
    },
    o || {},
  );

test('time helpers', () => {
  assert.equal(vc.minutesBetween('2026-10-23T10:00', '2026-10-23T12:05'), 125);
  assert.equal(vc.minutesBetween('2026-10-23T23:30', '2026-10-24T00:15'), 45);
  assert.throws(() => vc.toMinutes('2026-10-23 10:00'), /must look like/);
  assert.throws(() => vc.toMinutes('2026-10-23T25:00'), /does not exist/);
  assert.throws(() => vc.toMinutes('2026-02-30T10:00'), /does not exist/);
  assert.equal(vc.duration(35), '35 min');
  assert.equal(vc.duration(125), '2 h 05 min');
  assert.equal(vc.duration(-5), '0 min');
});

test('phone and ID helpers', () => {
  assert.equal(vc.cleanPhone('98765 43210'), '9876543210');
  assert.equal(vc.cleanPhone('+91 98765-43210'), '9876543210');
  assert.equal(vc.cleanPhone('09876543210'), '9876543210');
  assert.equal(vc.cleanPhone(''), '');
  assert.equal(vc.cleanPhone('12345'), null);
  assert.equal(vc.cleanPhone('5876543210'), null, 'Indian mobiles start 6-9');
  assert.equal(vc.fmtPhone('9876543210'), '98765 43210');
  assert.equal(vc.last4('1234 5678 9012'), '9012');
  assert.equal(vc.last4('ab-12'), 'AB12');
});

test('checkIn: badge numbers, cleaning, privacy (no full ID kept)', () => {
  let s = vc.create();
  const a = vc.checkIn(s, V(), NOW);
  assert.equal(a.visitor.badge, 'V-261023-001');
  assert.equal(a.visitor.phone, '9876543210');
  assert.equal(a.visitor.vehicle, 'MH12 AB 1234');
  assert.equal(a.visitor.idLast4, '9012');
  assert.ok(!JSON.stringify(a.state).includes('1234 5678'), 'the full ID number is not stored');
  const b = vc.checkIn(a.state, V({ name: 'Meera' }), '2026-10-23T10:30');
  assert.equal(b.visitor.badge, 'V-261023-002');
  assert.equal(b.visitor.id, 2);
  const c = vc.checkIn(b.state, V({ name: 'Zoe' }), '2026-10-24T09:00');
  assert.equal(c.visitor.badge, 'V-261024-001', 'numbering restarts each day');
  assert.equal(s.visitors.length, 0, 'the original state is not changed');
  const none = vc.checkIn(s, V({ idType: '' }), NOW).visitor;
  assert.equal(none.idLast4, '');
  assert.equal(vc.checkIn(s, V({ purpose: 'Whatever' }), NOW).visitor.purpose, 'Other');
});

test('checkIn validation', () => {
  const s = vc.create();
  assert.throws(() => vc.checkIn(s, V({ name: ' ' }), NOW), /visitor name/);
  assert.throws(() => vc.checkIn(s, V({ host: '' }), NOW), /who the visitor is meeting/);
  assert.throws(() => vc.checkIn(s, V({ phone: '123' }), NOW), /10-digit mobile/);
  assert.throws(() => vc.checkIn(s, V(), 'now'), /must look like/);
  assert.equal(vc.checkIn(s, V({ phone: '' }), NOW).visitor.phone, '', 'phone is optional');
});

test('checkOut, on-site list and overstays', () => {
  let s = vc.create();
  s = vc.checkIn(s, V({ name: 'A' }), '2026-10-23T09:00').state;
  s = vc.checkIn(s, V({ name: 'B' }), '2026-10-23T13:00').state;
  s = vc.checkOut(s, 1, '2026-10-23T09:50');
  assert.equal(s.visitors[0].outAt, '2026-10-23T09:50');
  assert.deepEqual(
    vc.onSite(s).map((v) => v.name),
    ['B'],
  );
  assert.throws(() => vc.checkOut(s, 1, '2026-10-23T10:00'), /already checked out/);
  assert.throws(() => vc.checkOut(s, 9, '2026-10-23T10:00'), /No such visitor/);
  assert.throws(() => vc.checkOut(s, 2, '2026-10-23T12:00'), /before the check-in/);
  const o = vc.overstays(s, '2026-10-23T18:00', 4);
  assert.equal(o.length, 1);
  assert.equal(o[0].minutes, 300);
  assert.equal(vc.overstays(s, '2026-10-23T14:00', 4).length, 0);
});

test('daySummary', () => {
  let s = vc.create();
  s = vc.checkIn(s, V({ name: 'A', host: 'Asha', purpose: 'Meeting' }), '2026-10-23T09:00').state;
  s = vc.checkIn(s, V({ name: 'B', host: 'Asha', purpose: 'Delivery' }), '2026-10-23T10:00').state;
  s = vc.checkIn(s, V({ name: 'C', host: 'Ravi', purpose: 'Meeting' }), '2026-10-23T11:00').state;
  s = vc.checkIn(s, V({ name: 'D', host: 'Ravi' }), '2026-10-22T11:00').state;
  s = vc.checkOut(s, 1, '2026-10-23T10:00');
  s = vc.checkOut(s, 2, '2026-10-23T10:30');
  const d = vc.daySummary(s, '2026-10-23');
  assert.equal(d.total, 3);
  assert.equal(d.stillInside, 1);
  assert.equal(d.averageMinutes, 45);
  assert.deepEqual(d.byHost, [
    { key: 'Asha', count: 2 },
    { key: 'Ravi', count: 1 },
  ]);
  assert.deepEqual(
    d.byPurpose.map((p) => p.key),
    ['Meeting', 'Delivery'],
  );
  assert.equal(vc.daySummary(s, '2026-01-01').total, 0);
});

test('toCsv: guards formulas, shows minutes inside', () => {
  let s = vc.create();
  s = vc.checkIn(s, V({ name: '=HYPERLINK("x")', company: 'A, B' }), '2026-10-23T09:00').state;
  s = vc.checkOut(s, 1, '2026-10-23T09:45');
  const csv = vc.toCsv(s.visitors);
  assert.ok(csv.startsWith('﻿Badge,Name,Company,Phone,Meeting,Purpose,Vehicle,ID type,ID last 4,In,Out,Minutes inside\r\n'));
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"A, B"/);
  assert.match(csv, /,45$/);
});

test('buildPassPdf: one page per visitor; empty list rejected; non-Latin text', async () => {
  let s = vc.create();
  s = vc.checkIn(s, V({ name: 'नमस्ते Ravi', company: 'Acme ₹' }), NOW).state;
  s = vc.checkIn(s, V({ name: 'Meera' }), NOW).state;
  const bytes = await vc.buildPassPdf(PDFLib, s.visitors, { company: 'Acme Pvt Ltd' });
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2);
  await assert.rejects(() => vc.buildPassPdf(PDFLib, [], {}), /at least one visitor/);
});

test('serialize / parse round-trip, hardening', () => {
  let s = vc.create();
  s = vc.checkIn(s, V(), NOW).state;
  s = vc.checkOut(s, 1, '2026-10-23T11:00');
  const back = vc.parse(vc.serialize(s));
  assert.deepEqual(back.visitors, s.visitors);
  assert.equal(back.nextId, 2);
  assert.throws(() => vc.parse('x'), /not a saved visitor log/);
  assert.throws(() => vc.parse('{"app":"y"}'), /not a saved visitor log/);
  const messy = vc.parse(
    JSON.stringify({
      app: 'visitor-log',
      state: {
        visitors: [
          { name: 'A', inAt: 'bad' },
          { name: '', inAt: NOW },
          { name: 'ok', inAt: NOW, phone: '123', purpose: 'zzz', idType: 'zzz', outAt: 'bad' },
          { name: 'fine', inAt: NOW, phone: '9876543210' },
        ],
      },
    }),
  );
  assert.equal(messy.visitors.length, 1, 'bad rows and rows with a bad check-out time are dropped');
  assert.equal(messy.visitors[0].name, 'fine');
});
