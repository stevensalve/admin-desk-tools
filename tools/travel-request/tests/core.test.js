'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFLib = require('pdf-lib');
const tr = require('../js/core.js');

const make = (o) => {
  const r = tr.create('2026-10-23');
  r.number = 'TR/26-27/0001';
  r.traveller = { name: 'Asha Rao', empId: 'E102', dept: 'Sales', designation: 'Manager' };
  r.approver = 'Meera Shah';
  r.purpose = 'Client workshop';
  r.from = 'Pune';
  r.to = 'Bengaluru';
  r.departDate = '2026-11-02';
  r.returnDate = '2026-11-05';
  r.fares = [
    { desc: 'Flight PNQ-BLR', amount: 6200 },
    { desc: 'Flight BLR-PNQ', amount: 5800 },
  ];
  r.hotel = { rate: 5000, nights: null };
  r.perDiem = { rate: 1000 };
  r.local = 2000;
  return Object.assign(r, o || {});
};

test('tripDays counts both ends; guards', () => {
  assert.equal(tr.tripDays('2026-11-02', '2026-11-05'), 4);
  assert.equal(tr.tripDays('2026-11-02', ''), 1);
  assert.equal(tr.tripDays('2026-11-02', '2026-11-02'), 1);
  assert.throws(() => tr.tripDays('2026-11-05', '2026-11-02'), /before the departure/);
  assert.throws(() => tr.tripDays('', ''), /Dates must look like/);
});

test('compute: hand-checked 4-day trip', () => {
  const r = tr.compute(make());
  assert.equal(r.days, 4);
  assert.equal(r.nights, 3);
  assert.deepEqual(
    r.lines.map((l) => [l.category, l.qty, l.amount]),
    [
      ['Fare', 1, 6200],
      ['Fare', 1, 5800],
      ['Hotel', 3, 15000],
      ['Meals / per diem', 4, 4000],
      ['Local travel', 1, 2000],
    ],
  );
  assert.equal(r.total, 33000);
  assert.equal(r.advance, 0);
  assert.equal(r.balance, 33000);
  assert.equal(r.words, 'Rupees Thirty Three Thousand Only');
  assert.deepEqual(r.warnings, []);
});

test('advance percentage, explicit nights, extra lines', () => {
  const r = tr.compute(
    make({
      advancePct: 50,
      hotel: { rate: 5000, nights: 2 },
      other: [
        { desc: 'Visa fee', amount: 1500.5 },
        { desc: 'Nothing', amount: 0 },
      ],
    }),
  );
  assert.equal(r.nights, 2);
  assert.equal(r.total, 6200 + 5800 + 10000 + 4000 + 2000 + 1500.5);
  assert.equal(r.advance, r2(r.total / 2));
  assert.equal(r.advance + r.balance, r.total);
  assert.equal(r.lines.filter((l) => l.category === 'Other').length, 1);
});
function r2(n) {
  return Math.round(n * 100) / 100;
}

test('same-day trip: one day, no hotel', () => {
  const r = tr.compute(make({ returnDate: '', hotel: { rate: 5000, nights: null } }));
  assert.equal(r.days, 1);
  assert.equal(r.nights, 0);
  assert.ok(!r.lines.some((l) => l.category === 'Hotel'));
  assert.equal(r.lines.find((l) => l.category === 'Meals / per diem').amount, 1000);
});

test('policy warnings and sanity warnings', () => {
  const r = tr.compute(make({ policy: { hotelCap: 4000, perDiemCap: 800 } }));
  assert.equal(r.warnings.length, 2);
  assert.match(r.warnings[0], /hotel rate of Rs\. 5,000 a night is above the policy limit of Rs\. 4,000/);
  assert.match(r.warnings[1], /per diem of Rs\. 1,000 is above the policy limit of Rs\. 800/);
  assert.match(tr.compute(make({ returnDate: '2026-12-20' })).warnings.join(' '), /unusually long/);
  assert.match(tr.compute(make({ hotel: { rate: 1, nights: 9 } })).warnings.join(' '), /More hotel nights than the trip allows \(3\)/);
  assert.match(tr.compute(tr.create('2026-10-23')).warnings.join(' '), /No costs have been entered/);
  assert.equal(tr.compute(make({ departDate: '' })).days, 0, 'compute does not throw on a missing date');
});

test('validate', () => {
  assert.deepEqual(tr.validate(make()), []);
  const e = tr.validate(make({ number: '', date: '', purpose: '', from: '', departDate: '', advancePct: 120 }));
  ['request number', 'request date', 'purpose', 'where the trip starts', 'departure date', 'between 0 and 100'].forEach((s) =>
    assert.ok(
      e.some((x) => x.indexOf(s) !== -1),
      s,
    ),
  );
  assert.ok(tr.validate(make({ returnDate: '2026-10-01' })).some((x) => /before the departure/.test(x)));
  const n = make();
  n.traveller.name = '';
  assert.ok(tr.validate(n).some((x) => /traveller name/.test(x)));
});

test('toCsv', () => {
  const r = make();
  r.fares[0].desc = '=evil, "x"';
  const csv = tr.toCsv(r, tr.compute(r));
  assert.ok(csv.startsWith('﻿Request,Traveller,Trip,Category,Description,Quantity,Rate,Amount\r\n'));
  assert.match(csv, /"'=evil, ""x"""/);
  assert.match(csv, /,Total,,,,33000$/);
});

test('buildPdf: one page normally, more with many lines; non-Latin text', async () => {
  const r = make({ purpose: 'Workshop at ₹ Corp नमस्ते', project: 'PRJ-9', advancePct: 40, policy: { hotelCap: 4000, perDiemCap: 0 } });
  const one = await PDFLib.PDFDocument.load(await tr.buildPdf(PDFLib, r, tr.compute(r), { company: 'Acme' }));
  assert.equal(one.getPageCount(), 1);
  const many = make({
    other: Array.from({ length: 29 }, (_, i) => ({ desc: 'Expense ' + i, amount: 100 + i })),
    fares: Array.from({ length: 29 }, (_, i) => ({ desc: 'Leg ' + i, amount: 500 })),
  });
  const big = await PDFLib.PDFDocument.load(await tr.buildPdf(PDFLib, many, tr.compute(many)));
  assert.ok(big.getPageCount() >= 2);
});

test('serialize / parse round-trip and hardening', () => {
  const r = make({ advancePct: 25, project: 'P1' });
  assert.deepEqual(tr.parse(tr.serialize(r)), r);
  assert.throws(() => tr.parse('x'), /not a saved travel request/);
  assert.throws(() => tr.parse('{"app":"y"}'), /not a saved travel request/);
  const m = tr.parse(
    JSON.stringify({
      app: 'travel-request',
      request: {
        fares: [{ desc: 'f', amount: -5 }],
        mode: 'Rocket',
        advancePct: 900,
        date: 'zz',
        hotel: { rate: 'x', nights: -2 },
        policy: { hotelCap: -1 },
      },
    }),
  );
  assert.equal(m.mode, 'Other');
  assert.equal(m.advancePct, 100);
  assert.equal(m.date, '');
  assert.equal(m.fares[0].amount, 0);
  assert.deepEqual(m.hotel, { rate: 0, nights: null });
  assert.equal(m.policy.hotelCap, 0);
});
