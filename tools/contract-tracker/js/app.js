/* Contract & Renewal Tracker - user interface. All logic lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readArrayBuffer, el } = OT;
  const $ = (id) => document.getElementById(id);
  let contracts = null;
  let rows = null;
  const p2 = (n) => String(n).padStart(2, '0');
  const d = new Date();
  $('today').value = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());

  function run() {
    $('results').hidden = true;
    if (!contracts) return;
    try {
      rows = ContractCore.analyse(contracts, $('today').value, { alertDays: Number($('alert').value) });
    } catch (e) {
      return setStatus($('status'), e.message, 'error');
    }
    const s = ContractCore.summary(rows, 90);
    $('headline').textContent =
      rows.length +
      ' contracts worth Rs. ' +
      OT.formatInr(s.totalValue, 0) +
      ' a year. ' +
      s.count['act now'] +
      ' need action, ' +
      s.count['locked in'] +
      ' are locked in to renew, ' +
      s.count.expired +
      ' have expired. Rs. ' +
      OT.formatInr(s.endingValue, 0) +
      ' a year ends in the next 90 days.';
    const t = $('t-contracts');
    t.textContent = '';
    t.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Contract', 'Owner', 'Ends', 'Notice by', 'Days to end', 'Auto-renews', 'Value / year', 'Status'].map((h, i) =>
            el('th', { scope: 'col', class: i === 4 || i === 6 ? 'num' : '', text: h }),
          ),
        ),
      ]),
    );
    const body = el('tbody');
    rows.forEach((r) =>
      body.appendChild(
        el('tr', {}, [
          el('td', { text: r.name + (r.party ? ' (' + r.party + ')' : '') }),
          el('td', { text: r.owner }),
          el('td', { text: OT.formatDate(r.end, 'dmy') }),
          el('td', { text: r.noticeDays ? OT.formatDate(r.notice, 'dmy') : '-' }),
          el('td', { class: 'num', text: String(r.daysToEnd) }),
          el('td', { text: r.autoRenew ? 'Yes' : 'No' }),
          el('td', { class: 'num', text: r.value ? OT.formatInr(r.value, 0) : '-' }),
          el('td', { class: 'st-' + r.status.replace(' ', '-'), text: r.status }),
        ]),
      ),
    );
    t.appendChild(body);
    $('results').hidden = false;
  }

  function use(aoa, name) {
    const r = ContractCore.rowsToContracts(aoa);
    if (!r.contracts.length) {
      contracts = null;
      $('results').hidden = true;
      return setStatus($('status'), r.errors.join(' '), 'error');
    }
    contracts = r.contracts;
    setStatus(
      $('status'),
      name + ': ' + contracts.length + ' contracts. ' + r.errors.slice(0, 3).join(' '),
      r.errors.length ? 'warn' : 'ok',
    );
    run();
  }
  OT.bindDropzone($('drop'), $('file'), async (files) => {
    try {
      const wb = XLSX.read(await readArrayBuffer(files[0]), { type: 'array', cellDates: true });
      use(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false }), files[0].name);
    } catch (e) {
      setStatus($('status'), 'Could not read that file.', 'error');
    }
  });
  $('demo').addEventListener('click', () => {
    $('today').value = '2026-10-23';
    use(ContractCore.sampleRows(), 'Sample');
  });
  ['today', 'alert'].forEach((id) => $(id).addEventListener('input', run));

  $('make').addEventListener('click', () => {
    if (!rows) return setStatus($('rem-status'), 'Load a file first.', 'warn');
    const owners = ContractCore.summary(rows).byOwner;
    const text = owners.map((o) => ContractCore.reminder(o, $('today').value)).join('\n\n----------\n\n');
    $('rem-out').value = text;
    setStatus($('rem-status'), text ? '' : 'Nothing needs attention.', text ? '' : 'ok');
  });
  $('copy').addEventListener('click', async () => {
    const t = $('rem-out').value;
    if (!t) return setStatus($('rem-status'), 'Write the reminders first.', 'warn');
    setStatus($('rem-status'), (await OT.copyText(t)) ? 'Copied.' : 'Copy failed - select the text and copy it yourself.', 'ok');
  });
  $('csv').addEventListener('click', () => rows && downloadBlob(ContractCore.toCsv(rows), 'contracts.csv', 'text/csv;charset=utf-8'));
  $('ics').addEventListener('click', () => {
    if (!rows) return;
    const n = new Date();
    const stamp =
      n.getUTCFullYear() +
      p2(n.getUTCMonth() + 1) +
      p2(n.getUTCDate()) +
      'T' +
      p2(n.getUTCHours()) +
      p2(n.getUTCMinutes()) +
      p2(n.getUTCSeconds()) +
      'Z';
    downloadBlob(ContractCore.toIcs(rows, $('today').value, stamp), 'contract-dates.ics', 'text/calendar;charset=utf-8');
  });
})();
