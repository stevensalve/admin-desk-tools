/* Visitor Log & Passes - user interface. All logic lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el } = OT;
  const $ = (id) => document.getElementById(id);
  let state = VisitorCore.create();
  let dirty = false;

  const p2 = (n) => String(n).padStart(2, '0');
  const nowStamp = () => {
    const d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  };
  $('day').value = nowStamp().slice(0, 10);
  VisitorCore.PURPOSES.forEach((p) => $('purpose').appendChild(el('option', { value: p, text: p })));
  VisitorCore.ID_TYPES.forEach((p) => $('idtype').appendChild(el('option', { value: p, text: p || '(none)' })));

  function changed() {
    dirty = true;
    render();
  }

  async function printPass(visitor) {
    const bytes = await VisitorCore.buildPassPdf(PDFLib, [visitor], { company: '' });
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), OT.safeFileName('pass-' + visitor.badge, 'pass') + '.pdf');
  }

  function doCheckIn(withPass) {
    try {
      const r = VisitorCore.checkIn(
        state,
        {
          name: $('name').value,
          company: $('company').value,
          phone: $('phone').value,
          host: $('host').value,
          purpose: $('purpose').value,
          vehicle: $('vehicle').value,
          idType: $('idtype').value,
          idNumber: $('idnum').value,
        },
        nowStamp(),
      );
      state = r.state;
      ['name', 'company', 'phone', 'host', 'vehicle', 'idnum'].forEach((id) => ($(id).value = ''));
      setStatus($('status'), r.visitor.name + ' checked in. Pass ' + r.visitor.badge + '.', 'ok');
      changed();
      if (withPass) printPass(r.visitor);
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  }
  $('checkin').addEventListener('click', () => doCheckIn(true));
  $('checkin-only').addEventListener('click', () => doCheckIn(false));

  function head(table, cols) {
    table.textContent = '';
    table.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          cols.map((c) => el('th', { scope: 'col', text: c })),
        ),
      ]),
    );
    const b = el('tbody');
    table.appendChild(b);
    return b;
  }

  function render() {
    const now = nowStamp();
    const inside = VisitorCore.onSite(state);
    $('site-count').textContent = inside.length + (inside.length === 1 ? ' person is' : ' people are') + ' on site.';
    const t = $('t-site');
    t.hidden = !inside.length;
    if (inside.length) {
      const over = new Set(VisitorCore.overstays(state, now, Number($('limit').value) || 4).map((x) => x.visitor.id));
      const body = head(t, ['Pass', 'Name', 'Company', 'Meeting', 'Since', 'Inside for', 'Actions']);
      inside.forEach((v) => {
        const out = el('button', { type: 'button', text: 'Check out', 'aria-label': 'Check out ' + v.name });
        out.addEventListener('click', () => {
          try {
            state = VisitorCore.checkOut(state, v.id, nowStamp());
            changed();
          } catch (e) {
            setStatus($('status'), e.message, 'error');
          }
        });
        const pr = el('button', { type: 'button', text: 'Pass', 'aria-label': 'Print pass for ' + v.name });
        pr.addEventListener('click', () => printPass(v));
        body.appendChild(
          el('tr', {}, [
            el('td', { text: v.badge }),
            el('td', { text: v.name }),
            el('td', { text: v.company }),
            el('td', { text: v.host }),
            el('td', {
              text:
                v.inAt.slice(11) + (v.inAt.slice(0, 10) !== now.slice(0, 10) ? ' (' + OT.formatDate(v.inAt.slice(0, 10), 'dmy') + ')' : ''),
            }),
            el('td', { class: over.has(v.id) ? 'over' : '', text: VisitorCore.duration(VisitorCore.minutesBetween(v.inAt, now)) }),
            el('td', {}, [out, pr]),
          ]),
        );
      });
    }
    const day = $('day').value;
    const s = VisitorCore.daySummary(state, day);
    $('day-summary').textContent = s.total
      ? s.total +
        ' visitors on ' +
        OT.formatDate(day, 'dmy') +
        ', ' +
        s.stillInside +
        ' still inside. Average stay ' +
        VisitorCore.duration(s.averageMinutes) +
        '. Busiest host: ' +
        s.byHost[0].key +
        ' (' +
        s.byHost[0].count +
        ').'
      : 'No visitors on this day.';
    const dt = $('t-day');
    dt.hidden = !s.total;
    if (s.total) {
      const body = head(dt, ['Pass', 'Name', 'Company', 'Phone', 'Meeting', 'Purpose', 'In', 'Out']);
      s.entries.forEach((v) =>
        body.appendChild(
          el(
            'tr',
            {},
            [
              v.badge,
              v.name,
              v.company,
              VisitorCore.fmtPhone(v.phone),
              v.host,
              v.purpose,
              v.inAt.slice(11),
              v.outAt ? v.outAt.slice(11) : '-',
            ].map((x) => el('td', { text: x })),
          ),
        ),
      );
    }
  }

  $('day').addEventListener('input', render);
  $('limit').addEventListener('input', render);
  $('csv').addEventListener('click', () =>
    downloadBlob(
      VisitorCore.toCsv(VisitorCore.daySummary(state, $('day').value).entries),
      'visitors-' + $('day').value + '.csv',
      'text/csv;charset=utf-8',
    ),
  );
  $('csv-all').addEventListener('click', () =>
    downloadBlob(VisitorCore.toCsv(state.visitors), 'visitors-all.csv', 'text/csv;charset=utf-8'),
  );
  $('save').addEventListener('click', () => {
    downloadBlob(VisitorCore.serialize(state), 'visitor-log.json', 'application/json');
    dirty = false;
    setStatus($('out-status'), 'Saved.', 'ok');
  });
  $('open').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      state = VisitorCore.parse(await readText(f));
      dirty = false;
      setStatus($('out-status'), 'Opened ' + state.visitors.length + ' visitors.', 'ok');
      render();
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  setInterval(render, 60000);
  render();
})();
