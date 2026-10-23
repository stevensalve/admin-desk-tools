/* Travel Request Form - user interface. All calculation lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el } = OT;
  const $ = (id) => document.getElementById(id);
  const today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  let req = TravelCore.create(today());

  TravelCore.MODES.forEach((m) => $('mode').appendChild(el('option', { value: m, text: m })));

  function lineRows(hostId, list, label) {
    const host = $(hostId);
    host.textContent = '';
    list.forEach((l, i) => {
      const d = el('input', { type: 'text', maxlength: '80', 'aria-label': label + ' description ' + (i + 1) });
      d.value = l.desc;
      d.addEventListener('input', () => {
        l.desc = d.value;
        refresh();
      });
      const a = el('input', { type: 'number', min: '0', step: 'any', 'aria-label': label + ' amount ' + (i + 1) });
      a.value = l.amount || '';
      a.addEventListener('input', () => {
        l.amount = Number(a.value) || 0;
        refresh();
      });
      const rm = el('button', { type: 'button', text: 'Remove', 'aria-label': 'Remove ' + label + ' ' + (i + 1) });
      rm.addEventListener('click', () => {
        list.splice(i, 1);
        lineRows(hostId, list, label);
        refresh();
      });
      host.appendChild(el('div', { class: 'line' }, [d, a, rm]));
    });
  }

  function pull() {
    req.number = $('number').value;
    req.date = $('date').value;
    req.traveller = { name: $('t-name').value, empId: $('t-id').value, dept: $('t-dept').value, designation: $('t-desig').value };
    req.approver = $('approver').value;
    req.project = $('project').value;
    req.purpose = $('purpose').value;
    req.from = $('from').value;
    req.to = $('to').value;
    req.departDate = $('depart').value;
    req.returnDate = $('return').value;
    req.mode = $('mode').value;
    req.hotel = {
      rate: Number($('hotel-rate').value) || 0,
      nights: $('hotel-nights').value === '' ? null : Math.max(0, Math.round(Number($('hotel-nights').value))),
    };
    req.perDiem = { rate: Number($('perdiem').value) || 0 };
    req.local = Number($('local').value) || 0;
    req.advancePct = Number($('advance').value) || 0;
    req.policy = { hotelCap: Number($('cap-hotel').value) || 0, perDiemCap: Number($('cap-pd').value) || 0 };
  }
  function push() {
    $('number').value = req.number;
    $('date').value = req.date;
    $('t-name').value = req.traveller.name;
    $('t-id').value = req.traveller.empId;
    $('t-dept').value = req.traveller.dept;
    $('t-desig').value = req.traveller.designation;
    $('approver').value = req.approver;
    $('project').value = req.project;
    $('purpose').value = req.purpose;
    $('from').value = req.from;
    $('to').value = req.to;
    $('depart').value = req.departDate;
    $('return').value = req.returnDate;
    $('mode').value = req.mode;
    $('hotel-rate').value = req.hotel.rate;
    $('hotel-nights').value = req.hotel.nights === null ? '' : req.hotel.nights;
    $('perdiem').value = req.perDiem.rate;
    $('local').value = req.local;
    $('advance').value = req.advancePct;
    $('cap-hotel').value = req.policy.hotelCap;
    $('cap-pd').value = req.policy.perDiemCap;
    lineRows('fares', req.fares, 'Fare');
    lineRows('others', req.other, 'Other cost');
    refresh();
  }

  function refresh() {
    pull();
    const res = TravelCore.compute(req);
    const body = $('totals');
    body.textContent = '';
    const rows = [['Days / nights', res.days + ' / ' + res.nights]].concat(
      res.lines.map((l) => [
        l.category + ' - ' + l.desc + (l.qty > 1 ? ' (' + l.qty + ' x ' + OT.formatInr(l.rate, 0) + ')' : ''),
        OT.formatInr(l.amount, 2),
      ]),
    );
    rows.forEach((r) => body.appendChild(el('tr', {}, [el('td', { text: r[0] }), el('td', { text: r[1] })])));
    body.appendChild(
      el('tr', { class: 'strong' }, [el('td', { text: 'Total estimate (Rs.)' }), el('td', { text: OT.formatInr(res.total, 2) })]),
    );
    if (res.advance)
      body.appendChild(
        el('tr', {}, [el('td', { text: 'Advance (' + req.advancePct + '%)' }), el('td', { text: OT.formatInr(res.advance, 2) })]),
      );
    $('words').textContent = res.words;
    const w = $('warnings');
    w.textContent = '';
    res.warnings.forEach((x) => w.appendChild(el('li', { text: x })));
    const p = $('problems');
    p.textContent = '';
    TravelCore.validate(req).forEach((x) => p.appendChild(el('li', { text: x })));
    return res;
  }

  [
    'number',
    'date',
    't-name',
    't-id',
    't-dept',
    't-desig',
    'approver',
    'project',
    'purpose',
    'from',
    'to',
    'depart',
    'return',
    'mode',
    'hotel-rate',
    'hotel-nights',
    'perdiem',
    'local',
    'advance',
    'cap-hotel',
    'cap-pd',
  ].forEach((id) => $(id).addEventListener('input', refresh));
  $('add-fare').addEventListener('click', () => {
    req.fares.push({ desc: '', amount: 0 });
    lineRows('fares', req.fares, 'Fare');
  });
  $('add-other').addEventListener('click', () => {
    req.other.push({ desc: '', amount: 0 });
    lineRows('others', req.other, 'Other cost');
  });
  $('pdf').addEventListener('click', async () => {
    const res = refresh();
    const problems = TravelCore.validate(req);
    if (problems.length) return setStatus($('status'), 'Fix these first: ' + problems[0], 'error');
    const bytes = await TravelCore.buildPdf(PDFLib, req, res, { company: $('company').value.trim() });
    downloadBlob(
      new Blob([bytes], { type: 'application/pdf' }),
      OT.safeFileName('Travel request ' + req.number.replace(/[/\\]/g, '-'), 'travel-request') + '.pdf',
    );
    setStatus($('status'), 'PDF created.', 'ok');
  });
  $('csv').addEventListener('click', () => downloadBlob(TravelCore.toCsv(req, refresh()), 'travel-costs.csv', 'text/csv;charset=utf-8'));
  $('save').addEventListener('click', () => {
    pull();
    downloadBlob(TravelCore.serialize(req), 'travel-request.json', 'application/json');
  });
  $('open').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      req = TravelCore.parse(await readText(f));
      push();
      setStatus($('status'), 'Opened.', 'ok');
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  });
  push();
})();
