/* Inventory & Stock Tracker - user interface. All calculation lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readArrayBuffer, el } = OT;
  const $ = (id) => document.getElementById(id);
  let items = [];
  let movements = [];
  let report = null;
  const p2 = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const todayIso = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  $('today').value = todayIso;
  $('m-date').value = todayIso;

  async function rows(file) {
    const wb = XLSX.read(await readArrayBuffer(file), { type: 'array', cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false });
  }

  function useItems(aoa, name) {
    const r = StockCore.rowsToItems(aoa);
    if (!r.items.length) return setStatus($('st-items'), r.errors.join(' '), 'error');
    items = r.items;
    setStatus($('st-items'), name + ': ' + items.length + ' items. ' + r.errors.slice(0, 2).join(' '), r.errors.length ? 'warn' : 'ok');
    fillPicker();
    render();
  }
  function useMoves(aoa, name) {
    const r = StockCore.rowsToMovements(aoa);
    if (!r.movements.length) return setStatus($('st-moves'), r.errors.join(' '), 'error');
    movements = r.movements;
    setStatus(
      $('st-moves'),
      name + ': ' + movements.length + ' movements. ' + r.errors.slice(0, 2).join(' '),
      r.errors.length ? 'warn' : 'ok',
    );
    render();
  }

  function fillPicker() {
    const sel = $('m-sku');
    const prev = sel.value;
    sel.textContent = '';
    items.forEach((i) => sel.appendChild(el('option', { value: i.sku, text: i.sku + ' - ' + i.name })));
    if (items.some((i) => i.sku === prev)) sel.value = prev;
  }

  function render() {
    $('results').hidden = true;
    if (!items.length) return;
    try {
      report = StockCore.report(items, movements, $('today').value, { usageDays: Number($('usage').value) || 30 });
    } catch (e) {
      return setStatus($('m-status'), e.message, 'error');
    }
    const t = report.totals;
    $('headline').textContent =
      t.items +
      ' items worth Rs. ' +
      OT.formatInr(t.value, 0) +
      '. ' +
      t.low +
      ' low, ' +
      t.out +
      ' out of stock' +
      (t.negative ? ', ' + t.negative + ' with negative stock (check the movements)' : '') +
      '.';
    const tb = $('t-stock');
    tb.textContent = '';
    tb.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Item', 'Category', 'On hand', 'Reorder at', 'Status', 'Value', 'Days left', 'Order'].map((h, i) =>
            el('th', { scope: 'col', class: i === 2 || i === 3 || i >= 5 ? 'num' : '', text: h }),
          ),
        ),
      ]),
    );
    const body = el('tbody');
    report.rows.forEach((r) =>
      body.appendChild(
        el('tr', {}, [
          el('td', { text: r.item.name + ' (' + r.item.sku + ')' }),
          el('td', { text: r.item.category }),
          el('td', { class: 'num', text: r.qty + ' ' + r.item.unit }),
          el('td', { class: 'num', text: String(r.item.reorderLevel) }),
          el('td', { class: 'st-' + r.status, text: r.status + (r.idle ? ' (idle)' : '') }),
          el('td', { class: 'num', text: OT.formatInr(r.value, 0) }),
          el('td', { class: 'num', text: r.daysLeft === null ? '-' : String(r.daysLeft) }),
          el('td', { class: 'num', text: r.order ? String(r.order) : '' }),
        ]),
      ),
    );
    tb.appendChild(body);
    const host = $('reorder');
    host.textContent = '';
    if (!report.reorder.length) host.appendChild(el('p', { text: 'Nothing to reorder.' }));
    report.reorder.forEach((g) => {
      const ul = el('ul');
      g.lines.forEach((l) =>
        ul.appendChild(
          el('li', { text: l.name + ' (' + l.sku + '): ' + l.qty + ' ' + l.unit + ' - about Rs. ' + OT.formatInr(l.cost, 0) }),
        ),
      );
      host.appendChild(el('p', {}, [el('strong', { text: g.supplier + ' - about Rs. ' + OT.formatInr(g.cost, 0) })]));
      host.appendChild(ul);
    });
    const ct = $('t-cat');
    ct.textContent = '';
    ct.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Category', 'Items', 'Value'].map((h, i) => el('th', { scope: 'col', class: i ? 'num' : '', text: h })),
        ),
      ]),
    );
    const cb = el('tbody');
    report.byCategory.forEach((c) =>
      cb.appendChild(
        el('tr', {}, [
          el('td', { text: c.category }),
          el('td', { class: 'num', text: String(c.items) }),
          el('td', { class: 'num', text: OT.formatInr(c.value, 0) }),
        ]),
      ),
    );
    ct.appendChild(cb);
    const notes = $('notes');
    notes.textContent = '';
    if (report.unknown.length)
      notes.appendChild(
        el('li', { text: 'Movements for unknown item codes were ignored: ' + report.unknown.slice(0, 8).join(', ') + '.' }),
      );
    if (t.idle) notes.appendChild(el('li', { text: t.idle + ' items have stock but no movement for 90 days (marked idle).' }));
    $('results').hidden = false;
  }

  [
    ['items', useItems],
    ['moves', useMoves],
  ].forEach((p) =>
    OT.bindDropzone($('drop-' + p[0]), $('file-' + p[0]), async (files) => {
      try {
        p[1](await rows(files[0]), files[0].name);
      } catch (e) {
        setStatus($('st-' + p[0]), 'Could not read that file.', 'error');
      }
    }),
  );
  $('demo').addEventListener('click', () => {
    const s = StockCore.sample();
    $('today').value = '2026-10-23';
    $('m-date').value = '2026-10-23';
    useItems(s.items, 'Sample items');
    useMoves(s.movements, 'Sample movements');
  });
  ['today', 'usage'].forEach((id) => $(id).addEventListener('input', render));

  $('m-add').addEventListener('click', () => {
    try {
      movements = StockCore.addMovement(
        items,
        movements,
        { date: $('m-date').value, sku: $('m-sku').value, type: $('m-type').value, qty: Number($('m-qty').value), note: $('m-note').value },
        $('today').value,
      );
      $('m-qty').value = '';
      $('m-note').value = '';
      setStatus($('m-status'), 'Recorded.', 'ok');
      render();
    } catch (e) {
      setStatus($('m-status'), e.message, 'error');
    }
  });
  $('m-csv').addEventListener('click', () =>
    downloadBlob(StockCore.movementsCsv(movements), 'stock-movements.csv', 'text/csv;charset=utf-8'),
  );
  $('csv-stock').addEventListener(
    'click',
    () => report && downloadBlob(StockCore.stockCsv(report), 'stock-report.csv', 'text/csv;charset=utf-8'),
  );
  $('csv-reorder').addEventListener(
    'click',
    () => report && downloadBlob(StockCore.reorderCsv(report), 'reorder-list.csv', 'text/csv;charset=utf-8'),
  );
})();
