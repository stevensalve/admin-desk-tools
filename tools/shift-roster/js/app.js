/* Shift Roster Planner - user interface. All planning and checking lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, el } = OT;
  const $ = (id) => document.getElementById(id);
  let plan = null;

  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const nextMonday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((8 - d.getDay()) % 7 || 7));
  $('start').value = nextMonday.getFullYear() + '-' + p2(nextMonday.getMonth() + 1) + '-' + p2(nextMonday.getDate());

  function fillSample() {
    const s = RosterCore.sample();
    $('staff').value = s.staff;
    $('shifts').value = s.shifts;
  }

  function generate() {
    const st = RosterCore.parseStaff($('staff').value);
    const sh = RosterCore.parseShifts($('shifts').value);
    const errors = st.errors.concat(sh.errors);
    try {
      plan = RosterCore.generate({
        staff: st.staff,
        shifts: sh.shifts,
        start: $('start').value,
        days: Number($('days').value),
        maxConsecutive: Number($('consec').value),
        maxPerWeek: Number($('week').value),
        minRest: Number($('rest').value),
      });
    } catch (e) {
      plan = null;
      $('t-roster').hidden = true;
      $('t-stats').hidden = true;
      return setStatus($('status'), e.message, 'error');
    }
    setStatus(
      $('status'),
      errors.length ? errors.slice(0, 3).join(' ') : 'Roster made for ' + plan.cfg.staff.length + ' people.',
      errors.length ? 'warn' : 'ok',
    );
    render();
  }

  function render() {
    if (!plan) return;
    const t = $('t-roster');
    t.hidden = false;
    t.textContent = '';
    t.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          [el('th', { scope: 'col', text: 'Name' })].concat(
            plan.dates.map((dt) => {
              const wd = new Date(dt + 'T00:00:00Z').getUTCDay();
              return el('th', {
                scope: 'col',
                class: wd === 0 || wd === 6 ? 'we' : '',
                text: OT.formatDate(dt, 'dmy').slice(0, 5) + ' ' + RosterCore.DOWN[wd],
              });
            }),
          ),
        ),
      ]),
    );
    const body = el('tbody');
    plan.cfg.staff.forEach((p) => {
      const cells = [el('td', { class: 'name', text: p.name })];
      plan.roster[p.name].forEach((code, i) => {
        const sel = el('select', { 'aria-label': p.name + ' on ' + OT.formatDate(plan.dates[i], 'dmy') });
        sel.appendChild(el('option', { value: '', text: 'OFF' }));
        plan.cfg.shifts.forEach((s) => sel.appendChild(el('option', { value: s.code, text: s.code })));
        sel.value = code;
        sel.addEventListener('change', () => {
          plan = RosterCore.setCell(plan, p.name, i, sel.value);
          render();
        });
        cells.push(el('td', {}, [sel]));
      });
      body.appendChild(el('tr', {}, cells));
    });
    t.appendChild(body);

    const list = $('problems');
    list.textContent = '';
    const problems = RosterCore.check(plan);
    problems.slice(0, 60).forEach((p) => list.appendChild(el('li', { text: p.text })));
    if (problems.length > 60) list.appendChild(el('li', { text: '...and ' + (problems.length - 60) + ' more.' }));
    if (!problems.length) {
      list.style.color = '#15803d';
      list.appendChild(el('li', { text: 'Every shift is covered and no rule is broken.' }));
    } else list.style.color = '';

    const stats = RosterCore.stats(plan);
    const s = $('t-stats');
    s.hidden = false;
    s.textContent = '';
    const codes = plan.cfg.shifts.map((x) => x.code);
    s.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Name']
            .concat(codes, ['Total shifts', 'Hours', 'Weekend days', 'Night shifts'])
            .map((h, i) => el('th', { scope: 'col', class: i ? 'num' : '', text: h })),
        ),
      ]),
    );
    const sb = el('tbody');
    stats.forEach((x) =>
      sb.appendChild(
        el(
          'tr',
          {},
          [el('td', { text: x.name })].concat(
            codes.map((c) => el('td', { class: 'num', text: String(x.counts[c] || 0) })),
            [x.shifts, x.hours, x.weekends, x.nights].map((v) => el('td', { class: 'num', text: String(v) })),
          ),
        ),
      ),
    );
    s.appendChild(sb);
  }

  $('gen').addEventListener('click', generate);
  $('demo').addEventListener('click', () => {
    fillSample();
    generate();
  });
  $('csv').addEventListener('click', () => plan && downloadBlob(RosterCore.toCsv(plan), 'shift-roster.csv', 'text/csv;charset=utf-8'));
  $('print').addEventListener('click', () => window.print());
  fillSample();
})();
