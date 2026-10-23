/* Incident & Complaint Log - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el } = OT;
  const $ = (id) => document.getElementById(id);
  let state = IncidentCore.create();
  const p2 = (n) => String(n).padStart(2, '0');
  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  };
  $('n-date').value = today();

  const opts = (sel, first, items) => {
    const prev = sel.value;
    sel.textContent = '';
    if (first !== null) sel.appendChild(el('option', { value: '', text: first }));
    items.forEach((x) => sel.appendChild(el('option', { value: x, text: x })));
    if (items.indexOf(prev) !== -1 || prev === '') sel.value = prev;
  };
  opts($('n-sev'), null, IncidentCore.SEVERITIES);
  $('n-sev').value = 'Medium';
  opts($('f-status'), 'All statuses', IncidentCore.STATUSES);
  opts($('f-sev'), 'All severities', IncidentCore.SEVERITIES);

  function buildSla() {
    const box = $('sla');
    box.textContent = '';
    IncidentCore.SEVERITIES.forEach((s) => {
      const inp = el('input', { type: 'number', min: '0', max: '365', id: 'sla-' + s, value: String(state.sla[s]) });
      inp.addEventListener('change', () => {
        const sla = {};
        IncidentCore.SEVERITIES.forEach((k) => (sla[k] = Number($('sla-' + k).value)));
        try {
          state = IncidentCore.setSla(state, sla);
          setStatus($('status'), 'Targets updated.', 'ok');
        } catch (e) {
          setStatus($('status'), e.message, 'error');
        }
      });
      box.appendChild(el('div', {}, [el('label', { for: 'sla-' + s, text: s }), inp]));
    });
  }

  function filter() {
    return {
      text: $('f-text').value,
      status: $('f-status').value,
      severity: $('f-sev').value,
      category: $('f-cat').value,
      openOnly: $('f-open').checked,
      overdueOnly: $('f-over').checked,
    };
  }

  const run = (fn, ok) => {
    try {
      state = fn(state);
      if (ok) setStatus($('status'), ok, 'ok');
      render();
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  };

  function render() {
    const t = today();
    const m = IncidentCore.summary(state, t);
    const stat = (label, v, bad) => el('div', { class: 'stat' + (bad ? ' bad' : '') }, [el('b', { text: String(v) }), label]);
    const box = $('stats');
    box.textContent = '';
    [
      stat('Open', m.open),
      stat('Overdue', m.overdue, m.overdue > 0),
      stat('Resolved', m.resolved),
      stat('Avg days to resolve', m.averageDays === null ? '-' : m.averageDays),
      stat('Resolved within target', m.withinTarget === null ? '-' : m.withinTarget + '%'),
    ].forEach((s) => box.appendChild(s));
    const parts = [];
    if (m.open) {
      parts.push(
        'Open by severity: ' +
          m.bySeverity
            .filter((x) => x.count)
            .map((x) => x.key + ' ' + x.count)
            .join(', ') +
          '.',
      );
      parts.push('By category: ' + m.byCategory.map((x) => x.key + ' ' + x.count).join(', ') + '.');
      parts.push('By owner: ' + m.byAssignee.map((x) => x.key + ' ' + x.count).join(', ') + '.');
      parts.push('Oldest open: ' + m.oldestOpen.ref + ' (' + m.oldestOpen.ageDays + ' days).');
    } else parts.push(m.total ? 'Nothing open.' : 'The log is empty.');
    $('breakdown').textContent = parts.join(' ');

    const cats = Array.from(new Set(state.incidents.map((i) => i.category))).sort();
    opts($('f-cat'), 'All categories', cats);
    const dl = $('cats');
    dl.textContent = '';
    cats.forEach((c) => dl.appendChild(el('option', { value: c })));

    const rows = IncidentCore.list(state, t, filter());
    const tbl = $('t-log');
    tbl.textContent = '';
    $('empty').hidden = rows.length > 0;
    if (!rows.length) return;
    tbl.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Ref', 'Incident', 'Severity', 'Status', 'Owner', 'Reported', 'Due', 'Notes'].map((h) => el('th', { scope: 'col', text: h })),
        ),
      ]),
    );
    const body = el('tbody');
    rows.forEach((r) => {
      const status = el(
        'select',
        { 'aria-label': 'Status of ' + r.ref },
        IncidentCore.STATUSES.map((s) => el('option', { value: s, text: s })),
      );
      status.value = r.status;
      status.addEventListener('change', () => run((s) => IncidentCore.setStatus(s, r.id, status.value, t)));
      const sev = el(
        'select',
        { 'aria-label': 'Severity of ' + r.ref },
        IncidentCore.SEVERITIES.map((s) => el('option', { value: s, text: s })),
      );
      sev.value = r.severity;
      sev.addEventListener('change', () => run((s) => IncidentCore.setSeverity(s, r.id, sev.value)));
      const who = el('input', { type: 'text', value: r.assignedTo, 'aria-label': 'Owner of ' + r.ref, maxlength: '60' });
      who.addEventListener('change', () => run((s) => IncidentCore.assign(s, r.id, who.value)));
      const note = el('input', {
        type: 'text',
        placeholder: 'Add note, press Enter',
        'aria-label': 'New note for ' + r.ref,
        maxlength: '300',
      });
      note.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && note.value.trim()) run((s) => IncidentCore.addNote(s, r.id, t, note.value));
      });
      const due = r.open
        ? OT.formatDate(r.dueOn, 'dmy') + (r.overdue ? ' (' + -r.daysToDue + ' days late)' : r.daysToDue === 0 ? ' (today)' : '')
        : r.late
          ? 'Resolved late'
          : 'Resolved ' + OT.formatDate(r.resolvedOn, 'dmy');
      const history = r.notes.map((n) => el('div', { class: 'hint', text: OT.formatDate(n.date, 'dmy') + ': ' + n.text }));
      body.appendChild(
        el('tr', {}, [
          el('td', { text: r.ref }),
          el('td', {}, [
            el('strong', { text: r.title }),
            el('div', { class: 'hint', text: [r.category, r.location, r.reportedBy && 'by ' + r.reportedBy].filter(Boolean).join(' / ') }),
          ]),
          el('td', {}, [el('span', { class: 'pill ' + r.severity, text: r.severity }), el('div', { class: 'noprint' }, [sev])]),
          el('td', {}, [status]),
          el('td', {}, [who]),
          el('td', { text: OT.formatDate(r.reportedOn, 'dmy') + ' (' + r.ageDays + 'd)' }),
          el('td', { class: r.overdue ? 'late' : '', text: due }),
          el('td', {}, history.concat([note])),
        ]),
      );
    });
    tbl.appendChild(body);
  }

  $('add').addEventListener('click', () => {
    try {
      const r = IncidentCore.add(state, {
        title: $('n-title').value,
        category: $('n-cat').value,
        severity: $('n-sev').value,
        reportedBy: $('n-by').value,
        reportedOn: $('n-date').value,
        location: $('n-loc').value,
        assignedTo: $('n-who').value,
      });
      state = r.state;
      setStatus($('status'), r.incident.ref + ' logged. Due ' + OT.formatDate(r.incident.dueOn, 'dmy') + '.', 'ok');
      $('n-title').value = '';
      render();
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  });
  $('demo').addEventListener('click', () => {
    state = IncidentCore.sample(today());
    buildSla();
    render();
  });
  ['f-text', 'f-status', 'f-sev', 'f-cat', 'f-open', 'f-over'].forEach((id) => $(id).addEventListener('input', render));
  $('csv').addEventListener('click', () =>
    downloadBlob(IncidentCore.toCsv(IncidentCore.list(state, today(), filter())), 'incident-log.csv', 'text/csv;charset=utf-8'),
  );
  $('print').addEventListener('click', () => window.print());
  $('save').addEventListener('click', () => downloadBlob(IncidentCore.serialize(state), 'incident-log.json', 'application/json'));
  $('open-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      state = IncidentCore.parse(await readText(f));
      buildSla();
      render();
      setStatus($('out-status'), 'Opened ' + state.incidents.length + ' incidents.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  buildSla();
  render();
})();
