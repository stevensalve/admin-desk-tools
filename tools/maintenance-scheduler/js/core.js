/**
 * Maintenance Scheduler - core logic (pure; "today" is always passed in).
 *
 * Task: { id, asset, task, location, every, unit ("days" | "weeks" | "months" | "years"), lastDone (ISO or ""), firstDue (ISO), owner, notes }
 * Next due = last done + the interval; a task that was never done is first due on its "firstDue" date.
 * Marking a task done restarts its interval from the day it was actually done (so late work does not pile up).
 * State: { nextId, tasks, history: [{ id, date, asset, task, note }] }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.MaintCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const UNITS = ['days', 'weeks', 'months', 'years'];
  const MAX_TASKS = 500;
  const DAY = 86400000;

  const create = () => ({ nextId: 1, tasks: [], history: [] });

  /** Add months/years to an ISO date, clamping to month end (31 Jan + 1 month = 28/29 Feb). */
  function addMonths(iso, n) {
    const d = new Date(OT.parseIsoDate(iso));
    const day = d.getUTCDate();
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
  }

  /** The date `every` units after `iso`. */
  function addInterval(iso, every, unit) {
    if (unit === 'days') return OT.addDays(iso, every);
    if (unit === 'weeks') return OT.addDays(iso, every * 7);
    if (unit === 'months') return addMonths(iso, every);
    if (unit === 'years') return addMonths(iso, every * 12);
    throw new Error('Choose days, weeks, months or years.');
  }

  /** "3 months", "every 2 weeks", "90 days", "yearly", "monthly", "quarterly", "weekly", "daily" -> { every, unit } or null. */
  function parseEvery(text) {
    const t = norm(text)
      .toLowerCase()
      .replace(/^every\s+/, '');
    const words = {
      daily: [1, 'days'],
      weekly: [1, 'weeks'],
      fortnightly: [2, 'weeks'],
      monthly: [1, 'months'],
      quarterly: [3, 'months'],
      'half-yearly': [6, 'months'],
      halfyearly: [6, 'months'],
      yearly: [1, 'years'],
      annually: [1, 'years'],
      annual: [1, 'years'],
      week: [1, 'weeks'],
      month: [1, 'months'],
      year: [1, 'years'],
      day: [1, 'days'],
    };
    if (words[t]) return { every: words[t][0], unit: words[t][1] };
    const m = /^(\d{1,3})\s*(day|week|month|year)s?$/.exec(t);
    if (!m || Number(m[1]) < 1) return null;
    return { every: Number(m[1]), unit: m[2] + 's' };
  }

  function check(t) {
    if (!norm(t.asset)) throw new Error('Enter the asset or area.');
    if (!norm(t.task)) throw new Error('Enter what has to be done.');
    if (!Number.isInteger(Number(t.every)) || Number(t.every) < 1 || Number(t.every) > 999)
      throw new Error('"Every" must be a whole number from 1 to 999.');
    if (UNITS.indexOf(t.unit) === -1) throw new Error('Choose days, weeks, months or years.');
    if (t.lastDone) OT.parseIsoDate(t.lastDone);
    if (!t.lastDone) OT.parseIsoDate(t.firstDue);
  }

  /** Add a task. t: { asset, task, location, every, unit, lastDone, firstDue, owner, notes }. */
  function addTask(state, t) {
    check(t);
    if (state.tasks.length >= MAX_TASKS) throw new Error('Too many tasks (' + MAX_TASKS + ').');
    const s = copy(state);
    s.tasks.push({
      id: s.nextId++,
      asset: norm(t.asset).slice(0, 80),
      task: norm(t.task).slice(0, 120),
      location: norm(t.location).slice(0, 60),
      every: Math.round(Number(t.every)),
      unit: t.unit,
      lastDone: t.lastDone || '',
      firstDue: t.lastDone ? '' : t.firstDue,
      owner: norm(t.owner).slice(0, 60),
      notes: norm(t.notes).slice(0, 200),
    });
    return s;
  }

  function removeTask(state, id) {
    const s = copy(state);
    s.tasks = s.tasks.filter((t) => t.id !== id);
    return s;
  }

  /** Record that a task was done on `date`; the next due date restarts from then. */
  function markDone(state, id, date, note) {
    OT.parseIsoDate(date);
    const s = copy(state);
    const t = s.tasks.find((x) => x.id === id);
    if (!t) throw new Error('No such task.');
    if (t.lastDone && date < t.lastDone)
      throw new Error('That is before the last time it was done (' + OT.formatDate(t.lastDone, 'dmy') + ').');
    t.lastDone = date;
    t.firstDue = '';
    s.history.push({ id: id, date: date, asset: t.asset, task: t.task, note: norm(note).slice(0, 120) });
    return s;
  }

  const nextDue = (t) => (t.lastDone ? addInterval(t.lastDone, t.every, t.unit) : t.firstDue);

  /**
   * status(state, today, windowDays) -> rows sorted by due date: { task, due, daysLeft, status: "overdue" | "due soon" | "ok" }
   */
  function status(state, today, windowDays) {
    OT.parseIsoDate(today);
    const w = windowDays === undefined ? 14 : windowDays;
    if (!(w >= 0 && w <= 365)) throw new Error('The window must be between 0 and 365 days.');
    return state.tasks
      .map((t) => {
        const due = nextDue(t);
        const daysLeft = Math.round((OT.parseIsoDate(due) - OT.parseIsoDate(today)) / DAY);
        return { task: t, due: due, daysLeft: daysLeft, status: daysLeft < 0 ? 'overdue' : daysLeft <= w ? 'due soon' : 'ok' };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft || a.task.asset.localeCompare(b.task.asset) || a.task.task.localeCompare(b.task.task));
  }

  /**
   * Every due date from `from` to `to` inclusive, assuming each task is done on its due date from now on.
   * An overdue task appears at its due date (before `from`) only if that date is within the range, plus its later repeats.
   */
  function forecast(state, from, to) {
    OT.parseIsoDate(from);
    OT.parseIsoDate(to);
    if (to < from) throw new Error('The end of the range is before its start.');
    if (OT.parseIsoDate(to) - OT.parseIsoDate(from) > 3 * 366 * DAY) throw new Error('Choose a range of up to three years.');
    const out = [];
    state.tasks.forEach((t) => {
      let d = nextDue(t);
      for (let i = 0; i < 1500 && d <= to; i++) {
        if (d >= from) out.push({ date: d, task: t });
        d = addInterval(d, t.every, t.unit);
      }
    });
    out.sort((a, b) => a.date.localeCompare(b.date) || a.task.asset.localeCompare(b.task.asset));
    return out;
  }

  /** Jobs per month and per owner for a forecast: { months: [{ key, count }], owners: [{ owner, count }] }. */
  function workload(items) {
    const m = {};
    const o = {};
    items.forEach((x) => {
      m[x.date.slice(0, 7)] = (m[x.date.slice(0, 7)] || 0) + 1;
      const k = x.task.owner || '(no owner)';
      o[k] = (o[k] || 0) + 1;
    });
    return {
      months: Object.keys(m)
        .sort()
        .map((k) => ({ key: k, count: m[k] })),
      owners: Object.keys(o)
        .map((k) => ({ owner: k, count: o[k] }))
        .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner)),
    };
  }

  /** Parse lines "Asset, Task, Every, Last done, Owner" -> { tasks, errors }. Last done and owner are optional. */
  function parseLines(text, today) {
    const tasks = [];
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const p = line.split(',').map(norm);
        if (p.length < 3)
          return errors.push('Line ' + (i + 1) + ': write it like "Lift 2, Safety inspection, 3 months, 2026-08-15, Ravi".');
        const ev = parseEvery(p[2]);
        if (!ev) return errors.push('Line ' + (i + 1) + ': could not understand "' + p[2] + '". Try "3 months", "2 weeks" or "yearly".');
        const last = p[3] ? OT.toIsoDate(p[3]) : '';
        if (p[3] && !last) return errors.push('Line ' + (i + 1) + ': "' + p[3] + '" is not a date.');
        tasks.push({
          asset: p[0],
          task: p[1],
          location: '',
          every: ev.every,
          unit: ev.unit,
          lastDone: last,
          firstDue: today,
          owner: p[4] || '',
          notes: '',
        });
      });
    return { tasks: tasks, errors: errors };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };
  const csv = (head, rows) =>
    '\ufeff' +
    [head]
      .concat(rows)
      .map((r) => r.map(cell).join(','))
      .join('\r\n');

  function statusCsv(rows) {
    return csv(
      ['Asset', 'Task', 'Location', 'Every', 'Last done', 'Next due', 'Days left', 'Status', 'Owner'],
      rows.map((r) => [
        r.task.asset,
        r.task.task,
        r.task.location,
        r.task.every + ' ' + r.task.unit,
        r.task.lastDone,
        r.due,
        r.daysLeft,
        r.status,
        r.task.owner,
      ]),
    );
  }
  function historyCsv(state) {
    return csv(
      ['Date', 'Asset', 'Task', 'Note'],
      state.history
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((h) => [h.date, h.asset, h.task, h.note]),
    );
  }

  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function toIcs(items, stamp) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) throw new Error('The timestamp must look like 20261023T000000Z.');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Admin Desk Tools//Maintenance Scheduler//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    items.forEach((x, i) => {
      const d = x.date.replace(/-/g, '');
      lines.push(
        'BEGIN:VEVENT',
        'UID:maint-' + x.task.id + '-' + d + '-' + i + '@admin-desk-tools',
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + d,
        'DTEND;VALUE=DATE:' + OT.addDays(x.date, 1).replace(/-/g, ''),
        'SUMMARY:' + esc(x.task.asset + ': ' + x.task.task),
        'DESCRIPTION:' +
          esc(
            (x.task.owner ? 'Owner: ' + x.task.owner + '. ' : '') +
              (x.task.location ? 'Location: ' + x.task.location + '. ' : '') +
              x.task.notes,
          ),
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function serialize(state) {
    return JSON.stringify({ app: 'maintenance-scheduler', version: 1, state: state }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved maintenance plan.');
    }
    const st = d && d.app === 'maintenance-scheduler' ? d.state : null;
    if (!st || !Array.isArray(st.tasks)) throw new Error('That file is not a saved maintenance plan.');
    let s = create();
    const idMap = {};
    st.tasks.slice(0, MAX_TASKS).forEach((t) => {
      try {
        const before = s.nextId;
        s = addTask(s, {
          asset: t.asset,
          task: t.task,
          location: t.location,
          every: t.every,
          unit: t.unit,
          lastDone: OT.toIsoDate(t.lastDone),
          firstDue: OT.toIsoDate(t.firstDue),
          owner: t.owner,
          notes: t.notes,
        });
        idMap[t.id] = before;
      } catch (e) {
        /* skip a damaged task */
      }
    });
    (Array.isArray(st.history) ? st.history : []).slice(0, 5000).forEach((h) => {
      const date = OT.toIsoDate(h.date);
      if (date && norm(h.asset))
        s.history.push({
          id: idMap[h.id] || 0,
          date: date,
          asset: norm(h.asset).slice(0, 80),
          task: norm(h.task).slice(0, 120),
          note: norm(h.note).slice(0, 120),
        });
    });
    return s;
  }

  function sampleText() {
    return [
      'Lift 1, Safety inspection, 3 months, 2026-08-20, Ravi Kumar',
      'Fire extinguishers, Pressure check and refill, yearly, 2025-11-05, Safety officer',
      'Air conditioners (floor 2), Filter cleaning, 2 months, 2026-09-10, Facilities',
      'DG set, Oil and load test, monthly, 2026-09-28, Ravi Kumar',
      'Water tanks, Cleaning, 6 months, 2026-05-02, Housekeeping',
      'UPS room, Battery check, quarterly, 2026-07-15, IT',
    ].join('\n');
  }

  return {
    UNITS: UNITS,
    addMonths: addMonths,
    addInterval: addInterval,
    parseEvery: parseEvery,
    create: create,
    addTask: addTask,
    removeTask: removeTask,
    markDone: markDone,
    nextDue: nextDue,
    status: status,
    forecast: forecast,
    workload: workload,
    parseLines: parseLines,
    statusCsv: statusCsv,
    historyCsv: historyCsv,
    toIcs: toIcs,
    serialize: serialize,
    parse: parse,
    sampleText: sampleText,
  };
});
