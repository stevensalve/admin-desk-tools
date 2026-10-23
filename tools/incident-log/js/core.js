/**
 * Incident & Complaint Log - core logic (pure; "today" is always passed in).
 *
 * Incident: { id, ref, title, category, severity, reportedBy, reportedOn (ISO), location, assignedTo, status, dueOn (ISO),
 *             resolvedOn (ISO or ""), notes: [{ date, text }] }
 * The due date comes from the target (SLA) in days for the severity, counted from the day it was reported.
 * Statuses: Open, In progress, Waiting, Resolved, Closed. "Resolved" and "Closed" count as finished.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.IncidentCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
  const STATUSES = ['Open', 'In progress', 'Waiting', 'Resolved', 'Closed'];
  const DONE = ['Resolved', 'Closed'];
  const DEFAULT_SLA = { Critical: 1, High: 3, Medium: 7, Low: 14 };
  const MAX = 5000;
  const DAY = 86400000;

  const create = () => ({ nextId: 1, sla: Object.assign({}, DEFAULT_SLA), incidents: [] });

  function setSla(state, sla) {
    SEVERITIES.forEach((s) => {
      if (!Number.isInteger(sla[s]) || sla[s] < 0 || sla[s] > 365)
        throw new Error('The target for ' + s + ' must be a whole number of days from 0 to 365.');
    });
    const o = copy(state);
    o.sla = Object.assign({}, sla);
    return o;
  }

  /** Log an incident. i: { title, category, severity, reportedBy, reportedOn, location, assignedTo }. Returns { state, incident }. */
  function add(state, i) {
    const title = norm(i.title);
    if (!title) throw new Error('Describe the incident in a few words.');
    if (SEVERITIES.indexOf(i.severity) === -1) throw new Error('Choose a severity.');
    OT.parseIsoDate(i.reportedOn);
    if (state.incidents.length >= MAX) throw new Error('The log is full (' + MAX + ' incidents). Save it and start a new one.');
    const s = copy(state);
    const id = s.nextId++;
    const inc = {
      id: id,
      ref: 'INC-' + String(id).padStart(4, '0'),
      title: title.slice(0, 120),
      category: norm(i.category).slice(0, 40) || 'General',
      severity: i.severity,
      reportedBy: norm(i.reportedBy).slice(0, 60),
      reportedOn: i.reportedOn,
      location: norm(i.location).slice(0, 60),
      assignedTo: norm(i.assignedTo).slice(0, 60),
      status: 'Open',
      dueOn: OT.addDays(i.reportedOn, s.sla[i.severity]),
      resolvedOn: '',
      notes: [],
    };
    s.incidents.push(inc);
    return { state: s, incident: inc };
  }

  function find(s, id) {
    const inc = s.incidents.find((x) => x.id === id);
    if (!inc) throw new Error('No such incident.');
    return inc;
  }

  /** Change the status. Resolving or closing needs a date (when it was fixed); reopening clears it. */
  function setStatus(state, id, status, date) {
    if (STATUSES.indexOf(status) === -1) throw new Error('Choose a status.');
    const s = copy(state);
    const inc = find(s, id);
    if (DONE.indexOf(status) !== -1) {
      OT.parseIsoDate(date);
      if (date < inc.reportedOn) throw new Error('It cannot be resolved before it was reported.');
      if (!inc.resolvedOn) inc.resolvedOn = date;
    } else inc.resolvedOn = '';
    inc.status = status;
    return s;
  }

  function assign(state, id, who) {
    const s = copy(state);
    find(s, id).assignedTo = norm(who).slice(0, 60);
    return s;
  }

  /** Change the severity; the due date is worked out again from the reported date. */
  function setSeverity(state, id, severity) {
    if (SEVERITIES.indexOf(severity) === -1) throw new Error('Choose a severity.');
    const s = copy(state);
    const inc = find(s, id);
    inc.severity = severity;
    inc.dueOn = OT.addDays(inc.reportedOn, s.sla[severity]);
    return s;
  }

  function addNote(state, id, date, text) {
    OT.parseIsoDate(date);
    if (!norm(text)) throw new Error('Write a note.');
    const s = copy(state);
    find(s, id).notes.push({ date: date, text: norm(text).slice(0, 300) });
    return s;
  }

  const isOpen = (i) => DONE.indexOf(i.status) === -1;
  const diff = (a, b) => Math.round((OT.parseIsoDate(a) - OT.parseIsoDate(b)) / DAY);

  /** Rows for display: each incident with ageDays, daysToDue (negative = late) and overdue; optional filters. Most urgent first. */
  function list(state, today, filter) {
    OT.parseIsoDate(today);
    const f = Object.assign(
      { status: '', severity: '', category: '', assignedTo: '', openOnly: false, overdueOnly: false, text: '' },
      filter,
    );
    const q = norm(f.text).toLowerCase();
    return state.incidents
      .map((i) => {
        const open = isOpen(i);
        const daysToDue = diff(i.dueOn, open ? today : i.resolvedOn);
        return Object.assign({}, i, {
          open: open,
          ageDays: diff(open ? today : i.resolvedOn, i.reportedOn),
          daysToDue: daysToDue,
          overdue: open ? daysToDue < 0 : false,
          late: !open && daysToDue < 0,
        });
      })
      .filter(
        (r) =>
          (!f.status || r.status === f.status) &&
          (!f.severity || r.severity === f.severity) &&
          (!f.category || r.category === f.category) &&
          (!f.assignedTo || r.assignedTo === f.assignedTo) &&
          (!f.openOnly || r.open) &&
          (!f.overdueOnly || r.overdue) &&
          (!q || (r.title + ' ' + r.ref + ' ' + r.location + ' ' + r.reportedBy).toLowerCase().indexOf(q) !== -1),
      )
      .sort(
        (a, b) =>
          Number(b.open) - Number(a.open) ||
          (a.open
            ? a.daysToDue - b.daysToDue || SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)
            : b.resolvedOn.localeCompare(a.resolvedOn)) ||
          a.id - b.id,
      );
  }

  /** Totals: open, overdue, by severity/category/assignee, average days to resolve, share resolved within target. */
  function summary(state, today) {
    const rows = list(state, today);
    const open = rows.filter((r) => r.open);
    const done = rows.filter((r) => !r.open);
    const count = (arr, key) => {
      const m = {};
      arr.forEach((r) => (m[r[key] || '(none)'] = (m[r[key] || '(none)'] || 0) + 1));
      return Object.keys(m)
        .map((k) => ({ key: k, count: m[k] }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    };
    const days = done.map((r) => r.ageDays);
    return {
      total: rows.length,
      open: open.length,
      overdue: open.filter((r) => r.overdue).length,
      resolved: done.length,
      averageDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      withinTarget: done.length ? Math.round((done.filter((r) => !r.late).length / done.length) * 100) : null,
      bySeverity: SEVERITIES.map((s) => ({ key: s, count: open.filter((r) => r.severity === s).length })),
      byCategory: count(open, 'category'),
      byAssignee: count(open, 'assignedTo'),
      oldestOpen: open.length ? open.reduce((a, r) => (r.ageDays > a.ageDays ? r : a)) : null,
    };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(rows) {
    const head = [
      'Ref',
      'Title',
      'Category',
      'Severity',
      'Status',
      'Reported on',
      'Reported by',
      'Location',
      'Assigned to',
      'Due on',
      'Resolved on',
      'Age (days)',
      'Overdue',
      'Notes',
    ];
    const out = rows.map((r) => [
      r.ref,
      r.title,
      r.category,
      r.severity,
      r.status,
      r.reportedOn,
      r.reportedBy,
      r.location,
      r.assignedTo,
      r.dueOn,
      r.resolvedOn,
      r.ageDays,
      r.overdue ? 'Yes' : r.late ? 'Resolved late' : 'No',
      r.notes.map((n) => n.date + ': ' + n.text).join(' | '),
    ]);
    return (
      '﻿' +
      [head]
        .concat(out)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  function serialize(state) {
    return JSON.stringify({ app: 'incident-log', version: 1, state: state }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved incident log.');
    }
    const st = d && d.app === 'incident-log' ? d.state : null;
    if (!st || !Array.isArray(st.incidents)) throw new Error('That file is not a saved incident log.');
    let s = create();
    const sla = {};
    SEVERITIES.forEach(
      (k) => (sla[k] = st.sla && Number.isInteger(st.sla[k]) && st.sla[k] >= 0 && st.sla[k] <= 365 ? st.sla[k] : DEFAULT_SLA[k]),
    );
    s = setSla(s, sla);
    st.incidents.slice(0, MAX).forEach((i) => {
      try {
        const r = add(s, {
          title: i.title,
          category: i.category,
          severity: i.severity,
          reportedBy: i.reportedBy,
          reportedOn: OT.toIsoDate(i.reportedOn),
          location: i.location,
          assignedTo: i.assignedTo,
        });
        s = r.state;
        const inc = s.incidents[s.incidents.length - 1];
        const due = OT.toIsoDate(i.dueOn);
        if (due) inc.dueOn = due;
        if (STATUSES.indexOf(i.status) !== -1) inc.status = i.status;
        const res = OT.toIsoDate(i.resolvedOn);
        inc.resolvedOn = DONE.indexOf(inc.status) !== -1 ? res || inc.reportedOn : '';
        (Array.isArray(i.notes) ? i.notes : []).slice(0, 100).forEach((n) => {
          const nd = OT.toIsoDate(n.date);
          if (nd && norm(n.text)) inc.notes.push({ date: nd, text: norm(n.text).slice(0, 300) });
        });
      } catch (e) {
        /* skip a damaged incident */
      }
    });
    return s;
  }

  function sample(today) {
    let s = create();
    const mk = (title, category, severity, daysAgo, who, loc, by) => {
      s = add(s, {
        title: title,
        category: category,
        severity: severity,
        reportedBy: by,
        reportedOn: OT.addDays(today, -daysAgo),
        location: loc,
        assignedTo: who,
      }).state;
      return s.incidents[s.incidents.length - 1].id;
    };
    mk('Lift 2 stuck between floors', 'Facilities', 'Critical', 0, 'Ravi Kumar', 'Tower B', 'Reception');
    const a = mk('AC not cooling in conference room', 'Facilities', 'Medium', 12, 'Ravi Kumar', 'Floor 3', 'Asha Rao');
    mk('Wi-Fi drops every afternoon', 'IT', 'High', 6, 'Kiran Patel', 'Floor 2', 'Meera Shah');
    const c = mk('Pantry coffee machine leaking', 'Pantry', 'Low', 10, 'Housekeeping', 'Pantry', 'Zoe Fernandes');
    mk('Visitor complaint: long wait at reception', 'Complaint', 'Medium', 3, '', 'Reception', 'Visitor');
    s = setStatus(s, a, 'In progress', today);
    s = addNote(s, a, OT.addDays(today, -10), 'Technician visited; needs gas refill.');
    s = setStatus(s, c, 'Resolved', OT.addDays(today, -2));
    return s;
  }

  return {
    SEVERITIES: SEVERITIES,
    STATUSES: STATUSES,
    DEFAULT_SLA: DEFAULT_SLA,
    create: create,
    setSla: setSla,
    add: add,
    setStatus: setStatus,
    assign: assign,
    setSeverity: setSeverity,
    addNote: addNote,
    list: list,
    summary: summary,
    toCsv: toCsv,
    serialize: serialize,
    parse: parse,
    sample: sample,
  };
});
