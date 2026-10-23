/**
 * Meeting Room Planner - core logic (pure).
 *
 * State: { nextId, nextSeries, rooms: [{ name, capacity }], hours: { open: "08:00", close: "20:00" }, buffer (minutes between bookings),
 *          bookings: [{ id, series, room, date, start, end, title, organizer, attendees }] }
 * Rules: a booking must sit inside opening hours, must not overlap another booking in the same room (back-to-back is fine
 * unless a buffer is set), and the attendee count must fit the room.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.RoomCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const MAX_BOOKINGS = 5000;

  /** "09:30" -> 570. Throws for anything that is not a time. */
  function toMin(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('Times must look like 09:30.');
    return Number(m[1]) * 60 + Number(m[2]);
  }
  const fmt = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  const weekday = (iso) => new Date(OT.parseIsoDate(iso)).getUTCDay();

  function create() {
    return { nextId: 1, nextSeries: 1, rooms: [], hours: { open: '08:00', close: '20:00' }, buffer: 0, bookings: [] };
  }

  /** "Board room, 12" lines -> { rooms, errors }. */
  function parseRooms(text) {
    const rooms = [];
    const errors = [];
    const seen = new Set();
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const m = /^(.+?)\s*[,:;\t]\s*(\d{1,3})$/.exec(line);
        if (!m) return errors.push('Line ' + (i + 1) + ': write it like "Board room, 12" (name, then seats).');
        const name = norm(m[1]).slice(0, 40);
        if (seen.has(name.toLowerCase())) return errors.push('Line ' + (i + 1) + ': ' + name + ' is listed twice.');
        if (Number(m[2]) < 1) return errors.push('Line ' + (i + 1) + ': a room needs at least 1 seat.');
        seen.add(name.toLowerCase());
        rooms.push({ name: name, capacity: Number(m[2]) });
      });
    return { rooms: rooms, errors: errors };
  }

  function configure(state, rooms, hours, buffer) {
    const s = copy(state);
    if (!rooms.length) throw new Error('Add at least one room.');
    const open = toMin(hours.open);
    const close = toMin(hours.close);
    if (close <= open) throw new Error('Closing time must be after opening time.');
    if (!(buffer >= 0 && buffer <= 60)) throw new Error('The buffer must be between 0 and 60 minutes.');
    s.rooms = rooms;
    s.hours = { open: fmt(open), close: fmt(close) };
    s.buffer = Math.round(buffer);
    return s;
  }

  const overlaps = (aS, aE, bS, bE, buffer) => aS < bE + buffer && bS < aE + buffer;

  /** The first problem with a proposed booking, or "" when it fits. ignoreId lets an existing booking be moved. */
  function problem(state, b, ignoreId) {
    const room = state.rooms.find((r) => r.name === b.room);
    if (!room) return 'No such room.';
    try {
      OT.parseIsoDate(b.date);
    } catch (e) {
      return 'Choose a valid date.';
    }
    let s;
    let e;
    try {
      s = toMin(b.start);
      e = toMin(b.end);
    } catch (x) {
      return x.message;
    }
    if (e <= s) return 'The end time must be after the start time.';
    if (s < toMin(state.hours.open) || e > toMin(state.hours.close))
      return 'The room is only open ' + state.hours.open + ' to ' + state.hours.close + '.';
    const n = Number(b.attendees) || 0;
    if (n > room.capacity) return room.name + ' seats ' + room.capacity + ', but ' + n + ' are coming.';
    const clash = state.bookings.find(
      (x) => x.id !== ignoreId && x.room === b.room && x.date === b.date && overlaps(s, e, toMin(x.start), toMin(x.end), state.buffer),
    );
    if (clash)
      return (
        'Clashes with "' +
        clash.title +
        '" (' +
        clash.start +
        '-' +
        clash.end +
        ')' +
        (state.buffer ? ', which needs a ' + state.buffer + ' minute buffer' : '') +
        '.'
      );
    return '';
  }

  /** Add one booking. b: { room, date, start, end, title, organizer, attendees }. Returns { state, booking }; throws with the reason. */
  function book(state, b) {
    if (!norm(b.title)) throw new Error('Give the meeting a title.');
    const why = problem(state, b);
    if (why) throw new Error(why);
    if (state.bookings.length >= MAX_BOOKINGS) throw new Error('Too many bookings. Save this plan and start a new one.');
    const s = copy(state);
    const booking = {
      id: s.nextId++,
      series: 0,
      room: b.room,
      date: b.date,
      start: fmt(toMin(b.start)),
      end: fmt(toMin(b.end)),
      title: norm(b.title).slice(0, 80),
      organizer: norm(b.organizer).slice(0, 60),
      attendees: Number(b.attendees) > 0 ? Math.round(Number(b.attendees)) : 0,
    };
    s.bookings.push(booking);
    return { state: s, booking: booking };
  }

  /**
   * Repeat a booking. repeat: "daily" (weekdays Mon-Fri) or "weekly", `count` occurrences including the first (2-60).
   * Dates that clash are skipped and reported. Returns { state, created: [booking], skipped: [{ date, reason }] }.
   */
  function bookSeries(state, b, repeat, count) {
    if (repeat !== 'daily' && repeat !== 'weekly') throw new Error('Choose daily or weekly.');
    if (!Number.isInteger(count) || count < 2 || count > 60) throw new Error('Repeat 2 to 60 times.');
    if (!norm(b.title)) throw new Error('Give the meeting a title.');
    let s = copy(state);
    const series = s.nextSeries++;
    const created = [];
    const skipped = [];
    let date = b.date;
    let made = 0;
    for (let guard = 0; made < count && guard < 400; guard++) {
      if (repeat === 'daily' && (weekday(date) === 0 || weekday(date) === 6)) {
        date = OT.addDays(date, 1);
        continue;
      }
      const one = Object.assign({}, b, { date: date });
      const why = problem(s, one);
      if (why) skipped.push({ date: date, reason: why });
      else {
        const r = book(s, one);
        r.booking.series = series;
        s = r.state;
        s.bookings[s.bookings.length - 1].series = series;
        created.push(s.bookings[s.bookings.length - 1]);
      }
      made++;
      date = OT.addDays(date, repeat === 'weekly' ? 7 : 1);
    }
    if (!created.length) throw new Error('None of the dates could be booked. First problem: ' + skipped[0].reason);
    return { state: s, created: created, skipped: skipped };
  }

  /** Cancel one booking, or the whole series with wholeSeries = true. */
  function cancel(state, id, wholeSeries) {
    const b = state.bookings.find((x) => x.id === id);
    if (!b) throw new Error('No such booking.');
    const s = copy(state);
    s.bookings = s.bookings.filter((x) => (wholeSeries && b.series ? x.series !== b.series : x.id !== id));
    return s;
  }

  /** Rooms that are free and big enough for the slot, smallest suitable room first. */
  function suggest(state, date, start, end, attendees) {
    return state.rooms
      .filter((r) => !problem(state, { room: r.name, date: date, start: start, end: end, attendees: attendees }))
      .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
  }

  /** Free stretches of at least `minMinutes` in a room on a day: [{ start, end }]. */
  function freeSlots(state, room, date, minMinutes) {
    const open = toMin(state.hours.open);
    const close = toMin(state.hours.close);
    const taken = state.bookings
      .filter((x) => x.room === room && x.date === date)
      .map((x) => [toMin(x.start), toMin(x.end)])
      .sort((a, b) => a[0] - b[0]);
    const out = [];
    let cur = open;
    taken.forEach((t) => {
      const free = Math.max(cur, 0);
      const stop = t[0] - state.buffer;
      if (stop - free >= minMinutes) out.push({ start: fmt(free), end: fmt(stop) });
      cur = Math.max(cur, t[1] + state.buffer);
    });
    if (close - cur >= minMinutes) out.push({ start: fmt(cur), end: fmt(close) });
    return out;
  }

  /** One day: per room the bookings in time order plus how much of the open hours is booked. */
  function day(state, date) {
    const open = toMin(state.hours.open);
    const close = toMin(state.hours.close);
    return state.rooms.map((r) => {
      const list = state.bookings.filter((x) => x.room === r.name && x.date === date).sort((a, b) => toMin(a.start) - toMin(b.start));
      const used = list.reduce((a, x) => a + (toMin(x.end) - toMin(x.start)), 0);
      return { room: r, bookings: list, usedMinutes: used, percent: Math.round((used / (close - open)) * 100) };
    });
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(bookings) {
    const head = ['Date', 'Start', 'End', 'Room', 'Title', 'Organizer', 'Attendees'];
    const rows = bookings
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.room.localeCompare(b.room))
      .map((b) => [b.date, b.start, b.end, b.room, b.title, b.organizer, b.attendees || '']);
    return (
      '\ufeff' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  /** Calendar events using "floating" local times, so they show at the same clock time wherever they are opened. */
  function toIcs(bookings, stamp) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) throw new Error('The timestamp must look like 20261023T000000Z.');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Admin Desk Tools//Room Planner//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    bookings.forEach((b) => {
      const d = b.date.replace(/-/g, '');
      lines.push(
        'BEGIN:VEVENT',
        'UID:room-' + b.id + '-' + d + '@admin-desk-tools',
        'DTSTAMP:' + stamp,
        'DTSTART:' + d + 'T' + b.start.replace(':', '') + '00',
        'DTEND:' + d + 'T' + b.end.replace(':', '') + '00',
        'SUMMARY:' + esc(b.title),
        'LOCATION:' + esc(b.room),
        'DESCRIPTION:' + esc((b.organizer ? 'Organizer: ' + b.organizer + '. ' : '') + (b.attendees ? b.attendees + ' attendees.' : '')),
        'END:VEVENT',
      );
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function serialize(state) {
    return JSON.stringify({ app: 'room-booking', version: 1, state: state }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved room plan.');
    }
    const st = d && d.app === 'room-booking' ? d.state : null;
    if (!st || !Array.isArray(st.rooms) || !Array.isArray(st.bookings)) throw new Error('That file is not a saved room plan.');
    const rooms = parseRooms(st.rooms.map((r) => norm(r.name).replace(/[,\n]/g, ' ') + ', ' + Number(r.capacity)).join('\n')).rooms;
    let s = configure(
      create(),
      rooms,
      { open: (st.hours && st.hours.open) || '08:00', close: (st.hours && st.hours.close) || '20:00' },
      Number(st.buffer) || 0,
    );
    st.bookings.slice(0, MAX_BOOKINGS).forEach((b) => {
      try {
        const r = book(s, b);
        r.booking.series = Number(b.series) > 0 ? Number(b.series) : 0;
        s = r.state;
        s.bookings[s.bookings.length - 1].series = r.booking.series;
        s.nextSeries = Math.max(s.nextSeries, r.booking.series + 1);
      } catch (e) {
        /* skip a booking that no longer fits the rules */
      }
    });
    return s;
  }

  return {
    toMin: toMin,
    fmt: fmt,
    create: create,
    parseRooms: parseRooms,
    configure: configure,
    problem: problem,
    book: book,
    bookSeries: bookSeries,
    cancel: cancel,
    suggest: suggest,
    freeSlots: freeSlots,
    day: day,
    toCsv: toCsv,
    toIcs: toIcs,
    serialize: serialize,
    parse: parse,
  };
});
