/* Meeting Room Planner - user interface. All booking rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el } = OT;
  const $ = (id) => document.getElementById(id);
  let state = RoomCore.create();
  const p2 = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const todayIso = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  $('b-date').value = todayIso;
  $('v-date').value = todayIso;

  function applySettings() {
    const r = RoomCore.parseRooms($('rooms').value);
    try {
      state = RoomCore.configure(state, r.rooms, { open: $('open').value, close: $('close').value }, Number($('buffer').value) || 0);
      setStatus($('set-status'), r.errors.join(' '), r.errors.length ? 'warn' : '');
    } catch (e) {
      return setStatus($('set-status'), e.message, 'error');
    }
    const sel = $('b-room');
    const prev = sel.value;
    sel.textContent = '';
    state.rooms.forEach((x) => sel.appendChild(el('option', { value: x.name, text: x.name + ' (' + x.capacity + ')' })));
    if (state.rooms.some((x) => x.name === prev)) sel.value = prev;
    render();
  }

  function slot() {
    return {
      room: $('b-room').value,
      date: $('b-date').value,
      start: $('b-start').value,
      end: $('b-end').value,
      title: $('b-title').value,
      organizer: $('b-org').value,
      attendees: Number($('b-att').value) || 0,
    };
  }

  $('book').addEventListener('click', () => {
    try {
      if ($('b-rep').value) {
        const r = RoomCore.bookSeries(state, slot(), $('b-rep').value, Number($('b-count').value));
        state = r.state;
        setStatus(
          $('status'),
          r.created.length +
            ' booked.' +
            (r.skipped.length
              ? ' Skipped: ' +
                r.skipped
                  .slice(0, 4)
                  .map((s) => OT.formatDate(s.date, 'dmy') + ' (' + s.reason + ')')
                  .join('; ')
              : ''),
          r.skipped.length ? 'warn' : 'ok',
        );
      } else {
        state = RoomCore.book(state, slot()).state;
        setStatus($('status'), 'Booked.', 'ok');
      }
      $('v-date').value = $('b-date').value;
      render();
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  });

  $('suggest').addEventListener('click', () => {
    const s = slot();
    try {
      const rooms = RoomCore.suggest(state, s.date, s.start, s.end, s.attendees);
      $('suggestion').textContent = rooms.length
        ? 'Free for ' +
          s.attendees +
          ' people at ' +
          s.start +
          '-' +
          s.end +
          ': ' +
          rooms.map((r) => r.name + ' (' + r.capacity + ')').join(', ') +
          '.'
        : 'No room is free and big enough for that slot.';
    } catch (e) {
      $('suggestion').textContent = e.message;
    }
  });

  function render() {
    const date = $('v-date').value;
    if (!date) return;
    const open = RoomCore.toMin(state.hours.open);
    const close = RoomCore.toMin(state.hours.close);
    const step = 30;
    const first = Math.floor(open / step) * step;
    const cols = [];
    for (let m = first; m < close; m += step) cols.push(m);
    const dayRooms = RoomCore.day(state, date);
    const t = $('t-grid');
    t.textContent = '';
    t.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          [el('th', { class: 'room', scope: 'col', text: 'Room (' + OT.formatDate(date, 'dmy') + ')' })]
            .concat(cols.map((m) => el('th', { scope: 'col', text: m % 60 === 0 ? String(m / 60) : '' })))
            .concat([el('th', { scope: 'col', text: 'Used' })]),
        ),
      ]),
    );
    const body = el('tbody');
    dayRooms.forEach((r) => {
      const cells = [el('td', { class: 'room', text: r.room.name + ' (' + r.room.capacity + ')' })];
      for (let i = 0; i < cols.length; i++) {
        const m = cols[i];
        const b = r.bookings.find((x) => RoomCore.toMin(x.start) < m + step && RoomCore.toMin(x.end) > m);
        if (b && RoomCore.toMin(b.start) < m + step && (RoomCore.toMin(b.start) >= m || i === 0)) {
          let span = 1;
          while (i + span < cols.length && RoomCore.toMin(b.end) > cols[i + span]) span++;
          cells.push(el('td', { class: 'busy', colspan: String(span), title: b.start + '-' + b.end + ' ' + b.title, text: b.title }));
          i += span - 1;
        } else cells.push(el('td', { class: m < open ? 'closed' : '' }));
      }
      cells.push(el('td', { text: r.percent + '%' }));
      body.appendChild(el('tr', {}, cells));
    });
    t.appendChild(body);

    const list = $('t-list');
    const all = dayRooms
      .reduce((a, r) => a.concat(r.bookings), [])
      .sort((a, b) => a.start.localeCompare(b.start) || a.room.localeCompare(b.room));
    list.hidden = !all.length;
    list.textContent = '';
    if (all.length) {
      list.appendChild(
        el('thead', {}, [
          el(
            'tr',
            {},
            ['Time', 'Room', 'Meeting', 'Booked by', 'People', ''].map((h) => el('th', { scope: 'col', text: h })),
          ),
        ]),
      );
      const lb = el('tbody');
      all.forEach((b) => {
        const cancel = el('button', { type: 'button', class: 'noprint', text: 'Cancel', 'aria-label': 'Cancel ' + b.title });
        cancel.addEventListener('click', () => {
          const whole = b.series && window.confirm('This meeting repeats. OK cancels the whole series; Cancel removes only this one.');
          state = RoomCore.cancel(state, b.id, !!whole);
          render();
        });
        lb.appendChild(
          el('tr', {}, [
            el('td', { text: b.start + '-' + b.end }),
            el('td', { text: b.room }),
            el('td', { text: b.title }),
            el('td', { text: b.organizer }),
            el('td', { text: b.attendees ? String(b.attendees) : '' }),
            el('td', {}, [cancel]),
          ]),
        );
      });
      list.appendChild(lb);
    }
  }

  ['rooms', 'open', 'close', 'buffer'].forEach((id) => $(id).addEventListener('input', applySettings));
  $('v-date').addEventListener('input', render);
  $('csv').addEventListener('click', () => downloadBlob(RoomCore.toCsv(state.bookings), 'room-bookings.csv', 'text/csv;charset=utf-8'));
  $('ics').addEventListener('click', () => {
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
    downloadBlob(RoomCore.toIcs(state.bookings, stamp), 'room-bookings.ics', 'text/calendar;charset=utf-8');
  });
  $('print').addEventListener('click', () => window.print());
  $('save').addEventListener('click', () => downloadBlob(RoomCore.serialize(state), 'room-plan.json', 'application/json'));
  $('open-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      state = RoomCore.parse(await readText(f));
      $('rooms').value = state.rooms.map((r) => r.name + ', ' + r.capacity).join('\n');
      $('open').value = state.hours.open;
      $('close').value = state.hours.close;
      $('buffer').value = state.buffer;
      applySettings();
      setStatus($('out-status'), 'Opened ' + state.bookings.length + ' bookings.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  applySettings();
})();
