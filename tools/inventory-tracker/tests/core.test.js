'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sc = require('../js/core.js');

const TODAY = '2026-10-23';
const load = () => {
  const s = sc.sample();
  return { items: sc.rowsToItems(s.items).items, movements: sc.rowsToMovements(s.movements).movements };
};

test('rowsToItems: headers, defaults, duplicates and bad numbers', () => {
  const r = sc.rowsToItems(sc.sample().items);
  assert.equal(r.errors.length, 0);
  assert.equal(r.items.length, 6);
  assert.equal(r.items[2].sku, 'TONER-HP');
  assert.equal(r.items[2].unitCost, 4200);
  const bad = sc.rowsToItems([
    ['Item', 'Qty', 'Min Stock'],
    ['Pencil', '10', '2'],
    ['Pencil', '5', '1'],
    ['Eraser', 'x', ''],
    ['Ruler', '-3', ''],
    ['', '', ''],
  ]);
  assert.equal(bad.items.length, 1);
  assert.equal(bad.items[0].sku, 'PENCIL', 'a missing code is made from the name');
  assert.equal(bad.items[0].reorderLevel, 2);
  assert.equal(bad.errors.length, 3);
  assert.match(sc.rowsToItems([['Foo'], ['x']]).errors[0], /Item code/);
  assert.match(sc.rowsToItems([['Item']]).errors[0], /header row/);
});

test('rowsToMovements: type words, sign, errors', () => {
  const r = sc.rowsToMovements([
    ['Date', 'Code', 'Type', 'Qty', 'Remarks'],
    ['01/10/2026', 'a', 'Issued', '5', 'x'],
    ['02/10/2026', 'a', 'GRN', '7', ''],
    ['03/10/2026', 'a', 'Adjustment', '-2', ''],
    ['04/10/2026', 'a', '', '-4', ''],
    ['05/10/2026', 'a', '', '9', ''],
    ['xx', 'a', 'in', '1', ''],
    ['06/10/2026', 'a', 'in', '0', ''],
  ]);
  assert.deepEqual(
    r.movements.map((m) => [m.type, m.qty]),
    [
      ['out', 5],
      ['in', 7],
      ['adjust', -2],
      ['out', 4],
      ['in', 9],
    ],
  );
  assert.equal(r.movements[0].sku, 'A');
  assert.equal(r.errors.length, 2);
  assert.match(sc.rowsToMovements([['Foo'], ['x']]).errors[0], /Date, Item code and Qty/);
});

test('stockOn: running balance up to a date, adjustments, unknown SKUs ignored', () => {
  const { items, movements } = load();
  const s = sc.stockOn(items, movements, TODAY);
  assert.equal(s['A4-PAPER'], 13);
  assert.equal(s['PEN-BLUE'], 80);
  assert.equal(s['TONER-HP'], 3);
  assert.equal(s['TEA-BAG'], 5);
  assert.equal(s['HAND-SAN'], 32);
  assert.equal(sc.stockOn(items, movements, '2026-10-09')['A4-PAPER'], 18);
  const adj = sc.stockOn(
    [{ sku: 'X', opening: 10 }],
    [
      { date: '2026-01-01', sku: 'X', type: 'adjust', qty: -3 },
      { date: '2026-01-01', sku: 'Y', type: 'in', qty: 9 },
    ],
    TODAY,
  );
  assert.deepEqual(adj, { X: 7 });
});

test('suggestOrder: whole lots that get back above the level', () => {
  const it = { reorderLevel: 20, reorderQty: 50 };
  assert.equal(sc.suggestOrder(it, 13), 50);
  assert.equal(sc.suggestOrder(it, 21), 0);
  assert.equal(sc.suggestOrder({ reorderLevel: 20, reorderQty: 5 }, 0), 25, '21 needed -> 5 lots of 5');
  assert.equal(sc.suggestOrder({ reorderLevel: 20, reorderQty: 0 }, 5), 35, 'no lot size: back to twice the level');
  assert.equal(sc.suggestOrder(it, -10), 50 * Math.ceil(31 / 50));
});

test('report: statuses, values, usage, reorder list by supplier', () => {
  const { items, movements } = load();
  const r = sc.report(items, movements, TODAY);
  const by = (sku) => r.rows.find((x) => x.item.sku === sku);
  assert.equal(by('A4-PAPER').status, 'low');
  assert.equal(by('A4-PAPER').order, 50);
  assert.equal(by('A4-PAPER').value, 13 * 285);
  assert.equal(by('PEN-BLUE').status, 'low');
  assert.equal(by('TONER-HP').status, 'low');
  assert.equal(by('TEA-BAG').status, 'low');
  assert.equal(by('HAND-SAN').status, 'ok');
  assert.equal(by('HAND-SAN').order, 0);
  assert.equal(by('LAPTOP-BAG').order, 0, 'no reorder level set');
  assert.equal(by('A4-PAPER').perDay, 0.9, '27 used in 30 days');
  assert.equal(by('A4-PAPER').daysLeft, 14);
  assert.equal(by('LAPTOP-BAG').daysLeft, null);
  assert.equal(by('LAPTOP-BAG').idle, true, 'stock with no movement for 90 days');
  assert.equal(r.totals.low, 4);
  assert.equal(r.totals.items, 6);
  assert.equal(
    r.totals.value,
    r.rows.reduce((a, x) => a + x.value, 0),
  );
  const paper = r.reorder.find((g) => g.supplier === 'Paper World');
  assert.equal(paper.lines.length, 2);
  assert.equal(paper.cost, 50 * 285 + 500 * 6);
  assert.deepEqual(
    r.byCategory.map((c) => c.category),
    ['Housekeeping', 'IT consumables', 'Pantry', 'Stationery'],
  );
});

test('report: out of stock, negative stock, unknown SKUs', () => {
  const items = [
    {
      sku: 'A',
      name: 'A',
      category: 'c',
      unit: 'Nos',
      opening: 5,
      reorderLevel: 2,
      reorderQty: 10,
      unitCost: 10,
      supplier: '',
      location: '',
    },
  ];
  const mv = [
    { date: '2026-10-01', sku: 'A', type: 'out', qty: 5, note: '' },
    { date: '2026-10-02', sku: 'ZZ', type: 'in', qty: 1, note: '' },
  ];
  let r = sc.report(items, mv, TODAY);
  assert.equal(r.rows[0].status, 'out');
  assert.equal(r.rows[0].order, 10);
  assert.deepEqual(r.unknown, ['ZZ']);
  assert.equal(r.reorder[0].supplier, '(no supplier)');
  mv.push({ date: '2026-10-03', sku: 'A', type: 'out', qty: 2, note: '' });
  r = sc.report(items, mv, TODAY);
  assert.equal(r.rows[0].status, 'negative');
  assert.equal(r.rows[0].value, 0);
  assert.equal(r.totals.negative, 1);
  assert.throws(() => sc.report(items, mv, 'x'), /Dates must look like/);
});

test('addMovement: validation, stock check, no mutation', () => {
  const { items, movements } = load();
  const out = sc.addMovement(items, movements, { date: TODAY, sku: 'a4-paper', type: 'out', qty: 3, note: 'x' }, TODAY);
  assert.equal(out.length, movements.length + 1);
  assert.equal(movements.length, 9);
  assert.equal(out[out.length - 1].sku, 'A4-PAPER');
  assert.throws(
    () => sc.addMovement(items, movements, { date: TODAY, sku: 'A4-PAPER', type: 'out', qty: 99 }, TODAY),
    /Only 13 Ream of A4 paper ream in stock/,
  );
  assert.throws(() => sc.addMovement(items, movements, { date: TODAY, sku: 'NOPE', type: 'in', qty: 1 }, TODAY), /No item with code NOPE/);
  assert.throws(() => sc.addMovement(items, movements, { date: TODAY, sku: 'A4-PAPER', type: 'in', qty: 0 }, TODAY), /above zero/);
  assert.throws(() => sc.addMovement(items, movements, { date: TODAY, sku: 'A4-PAPER', type: 'in', qty: -2 }, TODAY), /above zero/);
  assert.throws(() => sc.addMovement(items, movements, { date: TODAY, sku: 'A4-PAPER', type: 'adjust', qty: 0 }, TODAY), /other than zero/);
  assert.throws(() => sc.addMovement(items, movements, { date: TODAY, sku: 'A4-PAPER', type: 'adjust', qty: -50 }, TODAY), /Only 13/);
  assert.throws(() => sc.addMovement(items, movements, { date: 'x', sku: 'A4-PAPER', type: 'in', qty: 1 }, TODAY), /Dates must look like/);
  assert.equal(sc.addMovement(items, movements, { date: TODAY, sku: 'A4-PAPER', type: 'adjust', qty: 4 }, TODAY).length, 10);
});

test('CSV exports', () => {
  const { items, movements } = load();
  const r = sc.report(items, movements, TODAY);
  const a = sc.stockCsv(r);
  assert.ok(a.startsWith('﻿SKU,Item,Category,Location,Unit,On hand,Reorder level,Status,'));
  assert.equal(a.split('\r\n').length, 7);
  const b = sc.reorderCsv(r);
  assert.ok(b.startsWith('﻿Supplier,SKU,Item,Unit,Order quantity,Estimated cost\r\n'));
  assert.match(b, /Paper World,A4-PAPER,A4 paper ream,Ream,50,14250/);
});

test('movementsCsv round-trips through rowsToMovements', () => {
  const { movements } = load();
  const lines = sc
    .movementsCsv(movements)
    .replace('\ufeff', '')
    .split('\r\n')
    .map((l) => l.split(','));
  const back = sc.rowsToMovements(lines).movements;
  assert.deepEqual(
    back.map((m) => [m.date, m.sku, m.type, m.qty]),
    movements.map((m) => [m.date, m.sku, m.type, m.qty]),
  );
});
