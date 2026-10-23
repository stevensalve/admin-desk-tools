'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rb = require('../js/core.js');

const setup = (buffer) =>
  rb.configure(
    rb.create(),
    rb.parseRooms('Board room, 12\nHuddle, 4\nTraining hall, 40').rooms,
    { open: '08:00', close: '20:00' },
    buffer || 0,
  );
const B = (o) =>
  Object.assign(
    { room: 'Board room', date: '2026-10-26', start: '10:00', end: '11:00', title: 'Review', organizer: 'Asha', attendees: 6 },
    o,
  );

test('toMin / fmt', () => {
  assert.equal(rb.toMin('09:30'), 570);
  assert.equal(rb.fmt(570), '09:30');
  assert.throws(() => rb.toMin('25:00'), /Times must look like/);
  assert.throws(() => rb.toMin('9.30'), /Times must look like/);
});

test('parseRooms and configure', () => {
  const r = rb.parseRooms('# rooms\nBoard room, 12\nHuddle: 4\nbad\nHuddle, 6\nZero, 0');
  assert.deepEqual(r.rooms, [
    { name: 'Board room', capacity: 12 },
    { name: 'Huddle', capacity: 4 },
  ]);
  assert.equal(r.errors.length, 3);
  assert.throws(() => rb.configure(rb.create(), [], { open: '08:00', close: '20:00' }, 0), /at least one room/);
  assert.throws(() => rb.configure(setup(), setup().rooms, { open: '20:00', close: '08:00' }, 0), /after opening/);
  assert.throws(() => rb.configure(setup(), setup().rooms, { open: '08:00', close: '20:00' }, 99), /between 0 and 60/);
});

test('book: accepted, clashes, back-to-back, hours, capacity, title', () => {
  let s = rb.book(setup(), B()).state;
  assert.equal(s.bookings.length, 1);
  assert.equal(s.bookings[0].id, 1);
  assert.throws(() => rb.book(s, B({ start: '10:30', end: '11:30', title: 'Other' })), /Clashes with "Review" \(10:00-11:00\)/);
  assert.doesNotThrow(() => rb.book(s, B({ start: '11:00', end: '12:00', title: 'Next' })), 'back-to-back is fine');
  assert.doesNotThrow(() => rb.book(s, B({ room: 'Huddle', attendees: 3, title: 'Other room' })));
  assert.doesNotThrow(() => rb.book(s, B({ date: '2026-10-27', title: 'Other day' })));
  assert.throws(() => rb.book(s, B({ start: '07:00', end: '08:30', title: 'Early' })), /only open 08:00 to 20:00/);
  assert.throws(() => rb.book(s, B({ start: '19:00', end: '21:00', title: 'Late' })), /only open/);
  assert.throws(() => rb.book(s, B({ room: 'Huddle', attendees: 9, title: 'Big' })), /Huddle seats 4, but 9 are coming/);
  assert.throws(() => rb.book(s, B({ end: '09:00', title: 'Backwards' })), /end time must be after/);
  assert.throws(() => rb.book(s, B({ title: ' ' })), /title/);
  assert.throws(() => rb.book(s, B({ room: 'Nowhere', title: 'x' })), /No such room/);
  assert.throws(() => rb.book(s, B({ date: '2026-02-30', title: 'x' })), /valid date/);
  assert.equal(setup().bookings.length, 0, 'inputs are not changed');
});

test('buffer between meetings', () => {
  const s = rb.book(setup(15), B()).state;
  assert.throws(() => rb.book(s, B({ start: '11:00', end: '12:00', title: 'Tight' })), /needs a 15 minute buffer/);
  assert.doesNotThrow(() => rb.book(s, B({ start: '11:15', end: '12:00', title: 'Fine' })));
  assert.doesNotThrow(() => rb.book(s, B({ start: '08:00', end: '09:45', title: 'Before' })));
  assert.throws(() => rb.book(s, B({ start: '08:00', end: '09:50', title: 'Before, too close' })), /buffer/);
});

test('bookSeries: weekly, daily skips weekends, clashes are skipped and reported', () => {
  let s = rb.book(setup(), B({ date: '2026-11-02', title: 'Blocker' })).state;
  const w = rb.bookSeries(s, B({ title: 'Standup' }), 'weekly', 4);
  assert.deepEqual(
    w.created.map((b) => b.date),
    ['2026-10-26', '2026-11-09', '2026-11-16'],
  );
  assert.equal(w.skipped.length, 1);
  assert.equal(w.skipped[0].date, '2026-11-02');
  assert.match(w.skipped[0].reason, /Clashes with "Blocker"/);
  assert.ok(w.created.every((b) => b.series === 1));
  const d = rb.bookSeries(setup(), B({ date: '2026-10-30', title: 'Daily' }), 'daily', 3); // Friday
  assert.deepEqual(
    d.created.map((b) => b.date),
    ['2026-10-30', '2026-11-02', '2026-11-03'],
  );
  assert.throws(() => rb.bookSeries(setup(), B(), 'monthly', 3), /daily or weekly/);
  assert.throws(() => rb.bookSeries(setup(), B(), 'weekly', 1), /2 to 60/);
  assert.throws(() => rb.bookSeries(setup(), B({ attendees: 99 }), 'weekly', 3), /None of the dates could be booked/);
});

test('cancel one or a whole series', () => {
  const r = rb.bookSeries(setup(), B(), 'weekly', 3);
  const one = rb.cancel(r.state, r.created[1].id, false);
  assert.equal(one.bookings.length, 2);
  const all = rb.cancel(r.state, r.created[1].id, true);
  assert.equal(all.bookings.length, 0);
  assert.throws(() => rb.cancel(r.state, 99, false), /No such booking/);
  const solo = rb.book(setup(), B()).state;
  assert.equal(rb.cancel(solo, 1, true).bookings.length, 0, 'wholeSeries on a single booking cancels just it');
});

test('suggest: free rooms that fit, smallest first', () => {
  const s = rb.book(setup(), B({ room: 'Huddle', start: '10:00', end: '11:00', attendees: 2 })).state;
  assert.deepEqual(
    rb.suggest(s, '2026-10-26', '10:00', '11:00', 3).map((r) => r.name),
    ['Board room', 'Training hall'],
  );
  assert.deepEqual(
    rb.suggest(s, '2026-10-26', '10:00', '11:00', 20).map((r) => r.name),
    ['Training hall'],
  );
  assert.deepEqual(
    rb.suggest(s, '2026-10-26', '12:00', '13:00', 2).map((r) => r.name),
    ['Huddle', 'Board room', 'Training hall'],
  );
});

test('freeSlots and day utilisation', () => {
  let s = setup();
  s = rb.book(s, B({ start: '09:00', end: '10:00' })).state;
  s = rb.book(s, B({ start: '13:00', end: '15:00', title: 'Long' })).state;
  assert.deepEqual(rb.freeSlots(s, 'Board room', '2026-10-26', 60), [
    { start: '08:00', end: '09:00' },
    { start: '10:00', end: '13:00' },
    { start: '15:00', end: '20:00' },
  ]);
  assert.deepEqual(rb.freeSlots(s, 'Board room', '2026-10-26', 200), [{ start: '15:00', end: '20:00' }]);
  const d = rb.day(s, '2026-10-26');
  assert.equal(d[0].usedMinutes, 180);
  assert.equal(d[0].percent, 25);
  assert.equal(d[1].bookings.length, 0);
  const b15 = rb.book(setup(15), B({ start: '10:00', end: '11:00' })).state;
  assert.deepEqual(rb.freeSlots(b15, 'Board room', '2026-10-26', 30)[0], { start: '08:00', end: '09:45' });
});

test('toCsv and toIcs', () => {
  const s = rb.bookSeries(setup(), B({ title: 'Weekly, review' }), 'weekly', 2).state;
  const csv = rb.toCsv(s.bookings);
  assert.ok(csv.startsWith('\ufeffDate,Start,End,Room,Title,Organizer,Attendees\r\n'));
  assert.match(csv, /"Weekly, review"/);
  const ics = rb.toIcs(s.bookings, '20261023T000000Z');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /DTSTART:20261026T100000\r\nDTEND:20261026T110000/);
  assert.match(ics, /SUMMARY:Weekly\\, review/);
  assert.match(ics, /LOCATION:Board room/);
  assert.throws(() => rb.toIcs([], 'x'), /timestamp/);
});

test('serialize / parse round-trip, hardening, rules re-applied', () => {
  let s = rb.bookSeries(setup(10), B(), 'weekly', 3).state;
  s = rb.book(s, B({ room: 'Huddle', start: '14:00', end: '15:00', title: 'Solo', attendees: 3 })).state;
  const back = rb.parse(rb.serialize(s));
  assert.deepEqual(
    back.bookings.map((b) => [b.date, b.start, b.room, b.series]),
    s.bookings.map((b) => [b.date, b.start, b.room, b.series]),
  );
  assert.equal(back.buffer, 10);
  assert.equal(back.nextSeries, 2);
  assert.throws(() => rb.parse('x'), /not a saved room plan/);
  assert.throws(() => rb.parse('{"app":"y"}'), /not a saved room plan/);
  const messy = JSON.parse(rb.serialize(s));
  messy.state.bookings.push(
    { room: 'Huddle', date: '2026-10-26', start: '14:30', end: '15:30', title: 'Clash', attendees: 1 },
    { room: 'Ghost', date: '2026-10-26', start: '10:00', end: '11:00', title: 'No room' },
  );
  assert.equal(rb.parse(JSON.stringify(messy)).bookings.length, s.bookings.length, 'bookings that break the rules are dropped');
});
