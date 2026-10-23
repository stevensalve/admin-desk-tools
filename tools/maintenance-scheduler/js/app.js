/* Maintenance Scheduler - user interface. All scheduling lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el } = OT;
  const $ = (id) => document.getElementById(id);
  let state = MaintCore.create();
  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const now = new Date();
  $('today').value = iso(now);
  $('a-first').value = iso(now);
  $('to').value = iso(new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()));

  function render() {
    let rows;
    try {
      rows = MaintCore.status(state, $('today').value, Number($('win').value));
    } catch (e) {
      return setStatus($('status'), e.message, 'error');
    }
    const over = rows.filter((r) => r.status === 'overdue').length;
    const soon = rows.filter((r) => r.status === 'due soon').length;
    $('headline').textContent = rows.length ? rows.length + ' tasks: ' + over + ' overdue, ' + soon + ' due soon.' : 'No tasks yet.';
    const t = $('t-tasks');
    t.hidden = !rows.length;
    t.textContent = '';
    if (rows.length) {
      t.appendChild(
        el('thead', {}, [
          el(
            'tr',
            {},
            ['Asset', 'Task', 'Every', 'Last done', 'Next due', 'Days', 'Status', 'Owner', ''].map((h, i) =>
              el('th', { scope: 'col', class: i === 5 ? 'num' : '', text: h }),
            ),
          ),
        ]),
      );
      const body = el('tbody');
      rows.forEach((r) => {
        const done = el('button', {
          type: 'button',
          text: 'Done today',
          'aria-label': 'Mark ' + r.task.asset + ': ' + r.task.task + ' as done today',
        });
        done.addEventListener('click', () => {
          try {
            state = MaintCore.markDone(state, r.task.id, $('today').value, '');
            render();
          } catch (e) {
            setStatus($('status'), e.message, 'error');
          }
        });
        const rm = el('button', { type: 'button', text: 'Remove', 'aria-label': 'Remove ' + r.task.asset + ': ' + r.task.task });
        rm.addEventListener('click', () => {
          state = MaintCore.removeTask(state, r.task.id);
          render();
        });
        body.appendChild(
          el('tr', {}, [
            el('td', { text: r.task.asset }),
            el('td', { text: r.task.task }),
            el('td', { text: r.task.every + ' ' + r.task.unit }),
            el('td', { text: r.task.lastDone ? OT.formatDate(r.task.lastDone, 'dmy') : 'never' }),
            el('td', { text: OT.formatDate(r.due, 'dmy') }),
            el('td', { class: 'num', text: String(r.daysLeft) }),
            el('td', { class: 'st-' + r.status.replace(' ', '-'), text: r.status }),
            el('td', { text: r.task.owner }),
            el('td', {}, [done, rm]),
          ]),
        );
      });
      t.appendChild(body);
    }
    try {
      const f = MaintCore.forecast(state, $('today').value, $('to').value);
      const w = MaintCore.workload(f);
      $('work').textContent = f.length
        ? f.length +
          ' jobs until ' +
          OT.formatDate($('to').value, 'dmy') +
          '. By month: ' +
          w.months.map((m) => m.key + ' (' + m.count + ')').join(', ') +
          '. Busiest owner: ' +
          w.owners[0].owner +
          ' (' +
          w.owners[0].count +
          ').'
        : 'Nothing falls due in that period.';
    } catch (e) {
      $('work').textContent = e.message;
    }
  }

  $('add').addEventListener('click', () => {
    try {
      state = MaintCore.addTask(state, {
        asset: $('a-asset').value,
        task: $('a-task').value,
        location: '',
        every: Number($('a-every').value),
        unit: $('a-unit').value,
        lastDone: $('a-last').value,
        firstDue: $('a-first').value,
        owner: $('a-owner').value,
        notes: '',
      });
      $('a-asset').value = '';
      $('a-task').value = '';
      setStatus($('status'), 'Added.', 'ok');
      render();
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  });
  $('bulk-add').addEventListener('click', () => {
    const r = MaintCore.parseLines($('bulk').value, $('today').value);
    let added = 0;
    const errors = r.errors.slice();
    r.tasks.forEach((t) => {
      try {
        state = MaintCore.addTask(state, t);
        added++;
      } catch (e) {
        errors.push(t.asset + ': ' + e.message);
      }
    });
    setStatus($('status'), added + ' added. ' + errors.slice(0, 3).join(' '), errors.length ? 'warn' : 'ok');
    render();
  });
  $('demo').addEventListener('click', () => {
    $('bulk').value = MaintCore.sampleText();
    $('today').value = '2026-10-23';
    $('to').value = '2027-01-31';
    $('bulk-add').click();
  });
  ['today', 'win', 'to'].forEach((id) => $(id).addEventListener('input', render));

  const stamp = () => {
    const n = new Date();
    return (
      n.getUTCFullYear() +
      p2(n.getUTCMonth() + 1) +
      p2(n.getUTCDate()) +
      'T' +
      p2(n.getUTCHours()) +
      p2(n.getUTCMinutes()) +
      p2(n.getUTCSeconds()) +
      'Z'
    );
  };
  $('csv').addEventListener('click', () =>
    downloadBlob(
      MaintCore.statusCsv(MaintCore.status(state, $('today').value, Number($('win').value))),
      'maintenance-status.csv',
      'text/csv;charset=utf-8',
    ),
  );
  $('hist').addEventListener('click', () => downloadBlob(MaintCore.historyCsv(state), 'maintenance-history.csv', 'text/csv;charset=utf-8'));
  $('ics').addEventListener('click', () => {
    try {
      downloadBlob(
        MaintCore.toIcs(MaintCore.forecast(state, $('today').value, $('to').value), stamp()),
        'maintenance.ics',
        'text/calendar;charset=utf-8',
      );
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  $('save').addEventListener('click', () => downloadBlob(MaintCore.serialize(state), 'maintenance-plan.json', 'application/json'));
  $('open').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      state = MaintCore.parse(await readText(f));
      setStatus($('out-status'), 'Opened ' + state.tasks.length + ' tasks.', 'ok');
      render();
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  render();
})();
