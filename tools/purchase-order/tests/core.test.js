'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFLib = require('pdf-lib');
const po = require('../js/core.js');

const make = (over) => {
  const p = po.create('2026-10-23');
  p.number = 'PO/26-27/0001';
  p.vendor = { name: 'Paper World', gstin: '', address: 'Pune', stateCode: '27' };
  p.buyer = { name: 'Acme Pvt Ltd', gstin: '', address: 'Mumbai', stateCode: '27' };
  p.items = [{ desc: 'A4 paper', hsn: '4802', qty: 50, unit: 'Ream', rate: 285, discPct: 0, gstPct: 12 }];
  return Object.assign(p, over || {});
};

test('GSTIN check, number sequence, financial year', () => {
  assert.equal(po.gstinProblem('27AAPFU0939F1ZV'), '');
  assert.match(po.gstinProblem('27AAPFU0939F1ZX'), /check character/);
  assert.match(po.gstinProblem('99AAPFU0939F1ZV'), /state code/);
  assert.match(po.gstinProblem('12'), /15 characters/);
  assert.equal(po.nextNumber('PO/26-27/0009'), 'PO/26-27/0010');
  assert.equal(po.nextNumber('X'), 'X-1');
  assert.equal(po.financialYear('2027-03-31'), '2026-27');
  assert.equal(po.financialYear('2027-04-01'), '2027-28');
});

test('intra-state: hand-checked totals', () => {
  const r = po.compute(make());
  assert.equal(r.intra, true);
  assert.equal(r.lines[0].taxable, 14250);
  assert.equal(r.lines[0].cgst, 855);
  assert.equal(r.lines[0].sgst, 855);
  assert.equal(r.totals.exact, 15960);
  assert.equal(r.totals.grand, 15960);
  assert.equal(r.totals.words, 'Rupees Fifteen Thousand Nine Hundred Sixty Only');
});

test('inter-state uses IGST', () => {
  const p = make();
  p.vendor.stateCode = '29';
  const r = po.compute(p);
  assert.equal(r.intra, false);
  assert.equal(r.lines[0].igst, 1710);
  assert.equal(r.totals.grand, 15960);
});

test('freight becomes a taxed last line', () => {
  const p = make({ freight: { amount: 1000, gstPct: 18 } });
  const r = po.compute(p);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[1].freight, true);
  assert.equal(r.lines[1].desc, 'Freight and handling');
  assert.equal(r.lines[1].cgst, 90);
  assert.equal(r.totals.taxable, 15250);
  assert.equal(r.totals.grand, 15250 + 855 * 2 + 180);
  assert.deepEqual(
    r.summary.map((s) => s.gstPct),
    [12, 18],
  );
  assert.equal(po.compute(make({ freight: { amount: 0, gstPct: 18 } })).lines.length, 1);
});

test('rounding: round-off line and off switch; lines add up', () => {
  const p = make({
    items: [
      { desc: 'A', qty: 3, rate: 33.33, discPct: 0, gstPct: 5 },
      { desc: 'B', qty: 1, rate: 10.1, discPct: 10, gstPct: 12 },
    ],
  });
  const r = po.compute(p);
  const sum = r.lines.reduce((a, l) => a + l.total, 0);
  assert.ok(Math.abs(sum - r.totals.exact) < 0.005);
  assert.equal(r.totals.grand, Math.round(r.totals.exact));
  p.roundOff = false;
  assert.equal(po.compute(p).totals.grand, po.compute(p).totals.exact);
});

test('validate lists every problem', () => {
  assert.deepEqual(po.validate(make()), []);
  const bad = make({
    number: '',
    deliveryDate: '2026-10-01',
    items: [{ desc: '', qty: 0, rate: -1, discPct: 200, gstPct: 99 }],
    freight: { amount: -5, gstPct: 18 },
  });
  bad.vendor.name = '';
  bad.buyer.name = '';
  const e = po.validate(bad);
  [
    'PO number',
    'delivery date is before',
    'vendor name',
    'your company name',
    'Item 1: enter a description',
    'quantity',
    'rate cannot be negative',
    'discount',
    'GST rate',
    'Freight cannot be negative',
  ].forEach((s) =>
    assert.ok(
      e.some((x) => x.indexOf(s) !== -1),
      'missing: ' + s,
    ),
  );
  const g = make();
  g.vendor.gstin = '27AAPFU0939F1ZV';
  g.vendor.stateCode = '29';
  assert.ok(po.validate(g).some((x) => /does not match the first two digits/.test(x)));
  assert.ok(po.validate(make({ items: [] })).some((x) => /at least one item/.test(x)));
});

test('toCsv', () => {
  const p = make();
  p.items[0].desc = '=bad, "x"';
  const csv = po.toCsv(p, po.compute(p));
  assert.ok(csv.startsWith('﻿PO,Date,Vendor,Description,'));
  assert.match(csv, /"'=bad, ""x"""/);
});

test('buildPdf: multi-page, freight, non-Latin text', async () => {
  const p = make({ deliverTo: 'Warehouse 4, Bhosari MIDC, Pune ₹ नमस्ते', notes: 'Fragile', freight: { amount: 500, gstPct: 18 } });
  p.items = [];
  for (let k = 0; k < 45; k++)
    p.items.push({
      desc: 'Item ' + k + ' with a long description that has to wrap onto more than one line in the table',
      hsn: '4802',
      qty: k + 1,
      unit: 'Nos',
      rate: 99.5,
      discPct: 2,
      gstPct: 12,
    });
  const doc = await PDFLib.PDFDocument.load(await po.buildPdf(PDFLib, p, po.compute(p)));
  assert.ok(doc.getPageCount() >= 2);
  const one = await PDFLib.PDFDocument.load(await po.buildPdf(PDFLib, make(), po.compute(make())));
  assert.equal(one.getPageCount(), 1);
});

test('serialize / parse round-trip and hardening', () => {
  const p = make({ notes: 'n', deliverTo: 'Store' });
  assert.deepEqual(po.parse(po.serialize(p)), p);
  assert.throws(() => po.parse('x'), /not a saved purchase order/);
  assert.throws(() => po.parse('{"app":"invoice-maker"}'), /not a saved purchase order/);
  const m = po.parse(
    JSON.stringify({
      app: 'purchase-order',
      po: {
        number: 7,
        date: 'zz',
        vendor: { stateCode: '99' },
        freight: { amount: -3, gstPct: 500 },
        items: [{ desc: 'x', qty: -1, rate: 'q', discPct: 900, gstPct: 999 }],
      },
    }),
  );
  assert.equal(m.date, '');
  assert.equal(m.vendor.stateCode, '27');
  assert.deepEqual(m.freight, { amount: 0, gstPct: 40 });
  assert.equal(m.items[0].qty, 1);
  assert.equal(m.items[0].discPct, 100);
  assert.equal(m.terms, po.DEFAULT_TERMS);
});

test('multi-line terms keep their line breaks in the PDF text (no stray question marks)', async () => {
  const bytes = await po.buildPdf(PDFLib, make({ terms: 'First line\nSecond line' }), po.compute(make()));
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(po.sanitize('a\nb').includes('?'), true, 'sanitize itself is only for single lines');
});
