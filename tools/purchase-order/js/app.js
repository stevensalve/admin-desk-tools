/* Purchase Order Maker - user interface. All calculation lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el } = OT;
  const $ = (id) => document.getElementById(id);
  const today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  let po = PoCore.create(today());

  const stateOptions = (sel) =>
    Object.keys(PoCore.STATES).forEach((c) => sel.appendChild(el('option', { value: c, text: c + ' - ' + PoCore.STATES[c] })));
  const rateOptions = (sel) => PoCore.GST_RATES.forEach((r) => sel.appendChild(el('option', { value: String(r), text: r + '%' })));

  function pull() {
    po.number = $('number').value;
    po.date = $('date').value;
    po.deliveryDate = $('delivery').value;
    po.vendor = { name: $('v-name').value, gstin: $('v-gstin').value, address: $('v-addr').value, stateCode: $('v-state').value };
    po.buyer = { name: $('b-name').value, gstin: $('b-gstin').value, address: $('b-addr').value, stateCode: $('b-state').value };
    po.deliverTo = $('deliver').value;
    po.freight = { amount: Number($('freight').value) || 0, gstPct: Number($('freight-gst').value) };
    po.terms = $('terms').value;
    po.notes = $('notes').value;
    po.roundOff = $('round').checked;
  }
  function push() {
    $('number').value = po.number;
    $('date').value = po.date;
    $('delivery').value = po.deliveryDate;
    $('v-name').value = po.vendor.name;
    $('v-gstin').value = po.vendor.gstin;
    $('v-addr').value = po.vendor.address;
    $('v-state').value = po.vendor.stateCode;
    $('b-name').value = po.buyer.name;
    $('b-gstin').value = po.buyer.gstin;
    $('b-addr').value = po.buyer.address;
    $('b-state').value = po.buyer.stateCode;
    $('deliver').value = po.deliverTo;
    $('freight').value = po.freight.amount;
    $('freight-gst').value = String(po.freight.gstPct);
    $('terms').value = po.terms;
    $('notes').value = po.notes;
    $('round').checked = po.roundOff;
    buildRows();
    refresh();
  }

  const FIELDS = [
    ['desc', 'text', 'desc'],
    ['hsn', 'text', ''],
    ['qty', 'number', ''],
    ['unit', 'text', ''],
    ['rate', 'number', ''],
    ['discPct', 'number', ''],
    ['gstPct', 'select', ''],
  ];
  const LABELS = {
    desc: 'Description',
    hsn: 'HSN or SAC',
    qty: 'Quantity',
    unit: 'Unit',
    rate: 'Rate',
    discPct: 'Discount percent',
    gstPct: 'GST percent',
  };

  function buildRows() {
    const body = $('items');
    body.textContent = '';
    po.items.forEach((it, i) => {
      const cells = FIELDS.map((f) => {
        let input;
        if (f[1] === 'select') {
          input = el('select', { 'aria-label': LABELS[f[0]] + ' for item ' + (i + 1) });
          const rates = PoCore.GST_RATES.slice();
          if (rates.indexOf(Number(it.gstPct)) === -1) rates.push(Number(it.gstPct));
          rates.forEach((r) => input.appendChild(el('option', { value: String(r), text: r + '%' })));
          input.value = String(it.gstPct);
        } else {
          input = el('input', {
            type: f[1],
            'aria-label': LABELS[f[0]] + ' for item ' + (i + 1),
            step: 'any',
            min: f[1] === 'number' ? '0' : null,
          });
          input.value = it[f[0]];
        }
        input.addEventListener('input', () => {
          it[f[0]] =
            f[1] === 'text' ? input.value : f[1] === 'select' ? Number(input.value) : input.value === '' ? '' : Number(input.value);
          refresh();
        });
        return el('td', { class: f[2] }, [input]);
      });
      const rm = el('button', { type: 'button', text: 'Remove', 'aria-label': 'Remove item ' + (i + 1) });
      rm.addEventListener('click', () => {
        po.items.splice(i, 1);
        buildRows();
        refresh();
      });
      body.appendChild(el('tr', {}, cells.concat([el('td', { class: 'amt' }), el('td', {}, [rm])])));
    });
  }

  function refresh() {
    pull();
    const res = PoCore.compute(po);
    Array.prototype.forEach.call($('items').children, (tr, i) => {
      if (res.lines[i]) tr.querySelector('.amt').textContent = OT.formatInr(res.lines[i].total, 2);
    });
    const T = res.totals;
    const rows = [['Taxable value', T.taxable]];
    if (res.intra) rows.push(['CGST', T.cgst], ['SGST', T.sgst]);
    else rows.push(['IGST', T.igst]);
    if (T.roundOff) rows.push(['Round off', T.roundOff]);
    const body = $('totals');
    body.textContent = '';
    rows.forEach((r) => body.appendChild(el('tr', {}, [el('td', { text: r[0] }), el('td', { text: OT.formatInr(r[1], 2) })])));
    body.appendChild(el('tr', { class: 'strong' }, [el('td', { text: 'Total (Rs.)' }), el('td', { text: OT.formatInr(T.grand, 2) })]));
    $('words').firstChild.textContent = T.words;
    $('tax-kind').textContent = res.intra
      ? 'Vendor and buyer are in the same state: CGST and SGST apply, half each.'
      : 'Different states: IGST applies.';
    const list = $('problems');
    list.textContent = '';
    PoCore.validate(po).forEach((p) => list.appendChild(el('li', { text: p })));
    return res;
  }

  [
    'number',
    'date',
    'delivery',
    'v-name',
    'v-gstin',
    'v-addr',
    'v-state',
    'b-name',
    'b-gstin',
    'b-addr',
    'b-state',
    'deliver',
    'freight',
    'freight-gst',
    'terms',
    'notes',
    'round',
  ].forEach((id) => $(id).addEventListener('input', refresh));

  $('add').addEventListener('click', () => {
    po.items.push({ desc: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, discPct: 0, gstPct: 18 });
    buildRows();
    refresh();
  });
  $('pdf').addEventListener('click', async () => {
    const res = refresh();
    const problems = PoCore.validate(po);
    if (problems.length) return setStatus($('status'), 'Fix these first: ' + problems[0], 'error');
    const bytes = await PoCore.buildPdf(PDFLib, po, res);
    downloadBlob(
      new Blob([bytes], { type: 'application/pdf' }),
      OT.safeFileName('PO ' + po.number.replace(/[/\\]/g, '-'), 'purchase-order') + '.pdf',
    );
    setStatus($('status'), 'PDF created.', 'ok');
  });
  $('csv').addEventListener('click', () => downloadBlob(PoCore.toCsv(po, refresh()), 'purchase-order-lines.csv', 'text/csv;charset=utf-8'));
  $('next').addEventListener('click', () => {
    pull();
    po.number = PoCore.nextNumber(po.number);
    push();
    setStatus($('status'), 'Number advanced. Update the date and items for the new order.', 'ok');
  });
  $('save').addEventListener('click', () => {
    pull();
    downloadBlob(PoCore.serialize(po), 'purchase-order.json', 'application/json');
  });
  $('open').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      po = PoCore.parse(await readText(f));
      push();
      setStatus($('status'), 'Opened.', 'ok');
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  });

  stateOptions($('v-state'));
  stateOptions($('b-state'));
  rateOptions($('freight-gst'));
  $('freight-gst').value = '18';
  push();
})();
