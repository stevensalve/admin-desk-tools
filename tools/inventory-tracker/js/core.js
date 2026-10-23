/**
 * Inventory & Stock Tracker - core logic (pure; "today" is always passed in).
 *
 * Item:     { sku, name, category, unit, opening, reorderLevel, reorderQty, unitCost, supplier, location }
 * Movement: { date (ISO), sku, type: "in" | "out" | "adjust", qty, note }   (adjust sets a signed correction, e.g. -3 for 3 lost)
 * Stock on hand = opening + all "in" - all "out" + all "adjust" up to the chosen date.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.StockCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const DAY = 86400000;

  const IH = {
    sku: ['sku', 'item code', 'code', 'item id', 'part no', 'part number', 'stock code'],
    name: ['item', 'item name', 'name', 'description', 'product'],
    category: ['category', 'group', 'type', 'class'],
    unit: ['unit', 'uom', 'unit of measure'],
    opening: ['opening', 'opening stock', 'opening qty', 'quantity', 'qty', 'stock', 'on hand', 'current stock'],
    reorderLevel: ['reorder level', 'reorder point', 'min stock', 'minimum stock', 'min qty', 'minimum', 'reorder'],
    reorderQty: ['reorder qty', 'reorder quantity', 'order qty', 'order quantity', 'lot size'],
    unitCost: ['unit cost', 'cost', 'rate', 'price', 'unit price', 'purchase rate'],
    supplier: ['supplier', 'vendor', 'preferred supplier'],
    location: ['location', 'bin', 'rack', 'store', 'shelf'],
  };
  const MH = {
    date: ['date', 'txn date', 'movement date'],
    sku: ['sku', 'item code', 'code', 'item id', 'part no', 'item'],
    type: ['type', 'movement', 'in/out', 'txn type'],
    qty: ['qty', 'quantity', 'units'],
    note: ['note', 'notes', 'remarks', 'reference', 'narration'],
  };

  function num(v) {
    const t = norm(v).replace(/,/g, '');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }
  function columns(head, map) {
    const h = head.map((x) => norm(x).toLowerCase());
    const col = {};
    Object.keys(map).forEach((k) => (col[k] = h.findIndex((x) => map[k].indexOf(x) !== -1)));
    return col;
  }
  const usable = (aoa) => (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));

  /** Spreadsheet rows -> { items, errors }. */
  function rowsToItems(aoa) {
    const rows = usable(aoa);
    if (rows.length < 2) return { items: [], errors: ['The file needs a header row and at least one item.'] };
    const col = columns(rows[0], IH);
    if (col.sku === -1 && col.name === -1) return { items: [], errors: ['Need an Item code (SKU) or Item name column.'] };
    const items = [];
    const errors = [];
    const seen = new Set();
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const get = (k) => (col[k] === -1 ? '' : r[col[k]]);
      const name = norm(get('name'));
      const sku =
        norm(get('sku')).toUpperCase() ||
        name
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '-')
          .slice(0, 20);
      if (!sku) return;
      if (seen.has(sku)) return errors.push('Row ' + line + ': ' + sku + ' is listed twice, so the later row was skipped.');
      const n = {};
      for (const k of ['opening', 'reorderLevel', 'reorderQty', 'unitCost']) {
        const v = num(get(k));
        if (Number.isNaN(v) || (v !== null && v < 0))
          return errors.push('Row ' + line + ': ' + k + ' is not a number of zero or more, so the row was skipped.');
        n[k] = v === null ? 0 : v;
      }
      seen.add(sku);
      items.push({
        sku: sku,
        name: name || sku,
        category: norm(get('category')) || 'General',
        unit: norm(get('unit')) || 'Nos',
        opening: n.opening,
        reorderLevel: n.reorderLevel,
        reorderQty: n.reorderQty,
        unitCost: n.unitCost,
        supplier: norm(get('supplier')),
        location: norm(get('location')),
      });
    });
    return { items: items, errors: errors };
  }

  /** Spreadsheet rows -> { movements, errors }. The type can be In/Out/Receipt/Issue/Adjust. */
  function rowsToMovements(aoa) {
    const rows = usable(aoa);
    if (rows.length < 2) return { movements: [], errors: ['The file needs a header row and at least one movement.'] };
    const col = columns(rows[0], MH);
    if (col.date === -1 || col.sku === -1 || col.qty === -1) return { movements: [], errors: ['Need Date, Item code and Qty columns.'] };
    const out = [];
    const errors = [];
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const date = OT.toIsoDate(r[col.date]);
      const q = num(r[col.qty]);
      if (!date) return errors.push('Row ' + line + ': the date could not be read, so the row was skipped.');
      if (q === null || Number.isNaN(q) || q === 0)
        return errors.push('Row ' + line + ': the quantity could not be read, so the row was skipped.');
      const t = col.type === -1 ? '' : norm(r[col.type]).toLowerCase();
      let type = /^(in|receipt|received|purchase|grn|inward)/.test(t)
        ? 'in'
        : /^(out|issue|issued|consum|sale|dispatch|outward)/.test(t)
          ? 'out'
          : /^adj/.test(t)
            ? 'adjust'
            : q < 0
              ? 'out'
              : 'in';
      out.push({
        date: date,
        sku: norm(r[col.sku]).toUpperCase(),
        type: type,
        qty: type === 'adjust' ? q : Math.abs(q),
        note: col.note === -1 ? '' : norm(r[col.note]),
      });
    });
    return { movements: out, errors: errors };
  }

  /** Validate and add one movement (does not change its inputs). Refuses to take out more than is in stock. */
  function addMovement(items, movements, m, today) {
    const sku = norm(m.sku).toUpperCase();
    const item = items.find((i) => i.sku === sku);
    if (!item) throw new Error('No item with code ' + sku + '.');
    OT.parseIsoDate(m.date);
    const q = Number(m.qty);
    if (!Number.isFinite(q) || q === 0 || (m.type !== 'adjust' && q < 0))
      throw new Error(m.type === 'adjust' ? 'Enter a quantity other than zero (negative for a loss).' : 'Enter a quantity above zero.');
    if (['in', 'out', 'adjust'].indexOf(m.type) === -1) throw new Error('Choose in, out or adjust.');
    const mv = { date: m.date, sku: sku, type: m.type, qty: q, note: norm(m.note).slice(0, 120) };
    if (m.type === 'out' || (m.type === 'adjust' && q < 0)) {
      const have = stockOn(items, movements, m.date || today)[sku];
      if (have !== undefined && have < Math.abs(q))
        throw new Error('Only ' + have + ' ' + item.unit + ' of ' + item.name + ' in stock on that date.');
    }
    return movements.concat([mv]);
  }

  /** { sku: quantity on hand } on a date (inclusive). */
  function stockOn(items, movements, date) {
    const s = {};
    items.forEach((i) => (s[i.sku] = i.opening));
    movements.forEach((m) => {
      if (date && m.date > date) return;
      if (s[m.sku] === undefined) return;
      s[m.sku] = r2(s[m.sku] + (m.type === 'in' ? m.qty : m.type === 'out' ? -m.qty : m.qty));
    });
    return s;
  }

  /** Quantity to order so the item is back above its reorder level, in whole lots of reorderQty. */
  function suggestOrder(item, qty) {
    if (qty > item.reorderLevel) return 0;
    const need = item.reorderLevel - qty + 1;
    if (item.reorderQty > 0) return Math.ceil(need / item.reorderQty) * item.reorderQty;
    return Math.ceil(item.reorderLevel * 2 - qty);
  }

  /**
   * report(items, movements, today, opts) opts: { usageDays (default 30) }
   * -> { rows: [{ item, qty, status ("out" | "low" | "ok" | "negative"), value, order, orderCost, perDay, daysLeft, lastMove, idle }], totals, byCategory, reorder (grouped by supplier), unknown }
   */
  function report(items, movements, today, opts) {
    const o = Object.assign({ usageDays: 30, idleDays: 90 }, opts);
    OT.parseIsoDate(today);
    const stock = stockOn(items, movements, today);
    const known = new Set(items.map((i) => i.sku));
    const unknown = Array.from(new Set(movements.filter((m) => !known.has(m.sku)).map((m) => m.sku)));
    const from = OT.addDays(today, -o.usageDays);
    const rows = items.map((item) => {
      const qty = stock[item.sku];
      const mine = movements.filter((m) => m.sku === item.sku && m.date <= today);
      const used = r2(mine.filter((m) => m.type === 'out' && m.date > from).reduce((a, m) => a + m.qty, 0));
      const perDay = r2(used / o.usageDays);
      const last = mine.reduce((a, m) => (m.date > a ? m.date : a), '');
      const idle = qty > 0 && (!last || Math.round((OT.parseIsoDate(today) - OT.parseIsoDate(last)) / DAY) > o.idleDays);
      const status = qty < 0 ? 'negative' : qty === 0 ? 'out' : item.reorderLevel > 0 && qty <= item.reorderLevel ? 'low' : 'ok';
      const order =
        item.reorderLevel > 0 || item.reorderQty > 0
          ? status === 'low' || status === 'out' || status === 'negative'
            ? suggestOrder(item, qty)
            : 0
          : 0;
      return {
        item: item,
        qty: qty,
        status: status,
        value: r2(Math.max(0, qty) * item.unitCost),
        order: order,
        orderCost: r2(order * item.unitCost),
        perDay: perDay,
        daysLeft: perDay > 0 && qty > 0 ? Math.floor(qty / perDay) : null,
        lastMove: last,
        idle: idle,
      };
    });
    const cat = {};
    rows.forEach((r) => {
      const c = (cat[r.item.category] = cat[r.item.category] || { category: r.item.category, items: 0, value: 0 });
      c.items++;
      c.value = r2(c.value + r.value);
    });
    const sup = {};
    rows
      .filter((r) => r.order > 0)
      .forEach((r) => {
        const k = r.item.supplier || '(no supplier)';
        const g = (sup[k] = sup[k] || { supplier: k, lines: [], cost: 0 });
        g.lines.push({ sku: r.item.sku, name: r.item.name, unit: r.item.unit, qty: r.order, cost: r.orderCost });
        g.cost = r2(g.cost + r.orderCost);
      });
    return {
      rows: rows,
      totals: {
        items: rows.length,
        value: r2(rows.reduce((a, r) => a + r.value, 0)),
        low: rows.filter((r) => r.status === 'low').length,
        out: rows.filter((r) => r.status === 'out').length,
        negative: rows.filter((r) => r.status === 'negative').length,
        idle: rows.filter((r) => r.idle).length,
      },
      byCategory: Object.keys(cat)
        .sort()
        .map((k) => cat[k]),
      reorder: Object.keys(sup)
        .sort()
        .map((k) => sup[k]),
      unknown: unknown,
    };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };
  const csv = (head, rows) =>
    '﻿' +
    [head]
      .concat(rows)
      .map((r) => r.map(cell).join(','))
      .join('\r\n');

  function stockCsv(rep) {
    return csv(
      [
        'SKU',
        'Item',
        'Category',
        'Location',
        'Unit',
        'On hand',
        'Reorder level',
        'Status',
        'Unit cost',
        'Value',
        'Days of stock left',
        'Suggested order',
      ],
      rep.rows.map((r) => [
        r.item.sku,
        r.item.name,
        r.item.category,
        r.item.location,
        r.item.unit,
        r.qty,
        r.item.reorderLevel,
        r.status,
        r.item.unitCost,
        r.value,
        r.daysLeft === null ? '' : r.daysLeft,
        r.order || '',
      ]),
    );
  }
  function reorderCsv(rep) {
    const rows = [];
    rep.reorder.forEach((g) => g.lines.forEach((l) => rows.push([g.supplier, l.sku, l.name, l.unit, l.qty, l.cost])));
    return csv(['Supplier', 'SKU', 'Item', 'Unit', 'Order quantity', 'Estimated cost'], rows);
  }

  /** Movements in the same layout that rowsToMovements reads, so the file can be opened again next time. */
  function movementsCsv(movements) {
    return csv(
      ['Date', 'Item Code', 'Type', 'Qty', 'Note'],
      movements.map((m) => [m.date, m.sku, m.type, m.qty, m.note]),
    );
  }

  function sample() {
    return {
      items: [
        ['Item Code', 'Item', 'Category', 'Unit', 'Opening Stock', 'Reorder Level', 'Reorder Qty', 'Unit Cost', 'Supplier', 'Location'],
        ['A4-PAPER', 'A4 paper ream', 'Stationery', 'Ream', '40', '20', '50', '285', 'Paper World', 'Store 1'],
        ['PEN-BLUE', 'Blue ball pen', 'Stationery', 'Nos', '200', '100', '500', '6', 'Paper World', 'Store 1'],
        ['TONER-HP', 'HP toner cartridge', 'IT consumables', 'Nos', '6', '3', '5', '4200', 'Print Supplies Co', 'Store 2'],
        ['TEA-BAG', 'Tea bags (100)', 'Pantry', 'Box', '12', '10', '24', '180', 'Daily Needs', 'Pantry'],
        ['HAND-SAN', 'Hand sanitiser 500ml', 'Housekeeping', 'Nos', '30', '15', '48', '95', 'Daily Needs', 'Store 1'],
        ['LAPTOP-BAG', 'Laptop bag', 'IT consumables', 'Nos', '10', '0', '0', '1200', '', 'Store 2'],
      ],
      movements: [
        ['Date', 'Item Code', 'Type', 'Qty', 'Note'],
        ['01/10/2026', 'A4-PAPER', 'Out', '12', 'Accounts'],
        ['08/10/2026', 'A4-PAPER', 'Out', '10', 'HR'],
        ['15/10/2026', 'A4-PAPER', 'Out', '5', 'Admin'],
        ['05/10/2026', 'PEN-BLUE', 'Out', '120', 'Joining kits'],
        ['12/10/2026', 'TONER-HP', 'Out', '3', 'Printer 2'],
        ['14/10/2026', 'TEA-BAG', 'Out', '4', ''],
        ['18/10/2026', 'TEA-BAG', 'Out', '3', ''],
        ['20/10/2026', 'HAND-SAN', 'Out', '8', ''],
        ['21/10/2026', 'HAND-SAN', 'In', '10', 'GRN-221'],
      ],
    };
  }

  return {
    rowsToItems: rowsToItems,
    rowsToMovements: rowsToMovements,
    addMovement: addMovement,
    stockOn: stockOn,
    suggestOrder: suggestOrder,
    report: report,
    stockCsv: stockCsv,
    reorderCsv: reorderCsv,
    movementsCsv: movementsCsv,
    sample: sample,
  };
});
