/**
 * Shift Roster Planner - core logic (pure).
 *
 * Staff line:  Name; off=sun; leave=2026-11-02..2026-11-04,2026-11-10      (off and leave are optional)
 * Shift line:  CODE, Name, 06:00-14:00, minimum staff                      (a shift may cross midnight: 22:00-06:00)
 * Rules: max days in a row, max shifts per week (Monday to Sunday), and minimum rest hours between two shifts.
 * generate() fills the roster greedily and fairly (people with the fewest shifts of that kind go first); it is
 * deterministic, so the same input gives the same roster. check() lists every rule that a roster breaks, so it also
 * works after manual edits.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.RosterCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const DOWN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MAX_DAYS = 62;
  const MAX_STAFF = 100;

  const weekday = (iso) => new Date(OT.parseIsoDate(iso)).getUTCDay();

  /** Staff lines -> { staff: [{ name, off (0-6 or null), leave: [ISO] }], errors }. */
  function parseStaff(text) {
    const staff = [];
    const errors = [];
    const seen = new Set();
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const parts = line.split(';').map(norm);
        const name = parts[0];
        if (!name) return;
        if (seen.has(name.toLowerCase())) return errors.push('Line ' + (i + 1) + ': ' + name + ' is listed twice.');
        const p = { name: name.slice(0, 60), off: null, leave: [] };
        let bad = '';
        parts.slice(1).forEach((tok) => {
          const m = /^(off|leave)\s*=\s*(.+)$/i.exec(tok);
          if (!m) return (bad = 'could not understand "' + tok + '".');
          if (m[1].toLowerCase() === 'off') {
            const d = DOW[m[2].toLowerCase().slice(0, 3)];
            if (d === undefined) bad = '"' + m[2] + '" is not a weekday.';
            else p.off = d;
          } else {
            m[2].split(',').forEach((r) => {
              const mm = /^\s*(\d{4}-\d{2}-\d{2})(?:\s*\.\.\s*(\d{4}-\d{2}-\d{2}))?\s*$/.exec(r);
              if (!mm) return (bad = 'leave dates should look like 2026-11-02 or 2026-11-02..2026-11-04.');
              try {
                const a = mm[1];
                const b = mm[2] || mm[1];
                if (OT.parseIsoDate(b) < OT.parseIsoDate(a)) return (bad = 'a leave range ends before it starts.');
                if (OT.parseIsoDate(b) - OT.parseIsoDate(a) > 120 * 86400000) return (bad = 'a leave range is longer than 120 days.');
                for (let d = a; OT.parseIsoDate(d) <= OT.parseIsoDate(b); d = OT.addDays(d, 1)) p.leave.push(d);
              } catch (e) {
                bad = 'a leave date does not exist.';
              }
            });
          }
        });
        if (bad) return errors.push('Line ' + (i + 1) + ': ' + bad);
        seen.add(name.toLowerCase());
        staff.push(p);
      });
    return { staff: staff.slice(0, MAX_STAFF), errors: errors };
  }

  const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

  /** Shift lines -> { shifts: [{ code, name, start, end, minutes, need, startMin, endMin }], errors }. */
  function parseShifts(text) {
    const shifts = [];
    const errors = [];
    const seen = new Set();
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const m = /^([A-Za-z0-9]{1,3})\s*,\s*([^,]+?)\s*,\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*,\s*(\d{1,3})$/.exec(line);
        if (!m) return errors.push('Line ' + (i + 1) + ': write it like "M, Morning, 06:00-14:00, 2".');
        const pad = (t) => (t.length === 4 ? '0' + t : t);
        const start = pad(m[3]);
        const end = pad(m[4]);
        if (toMin(start) > 1439 || toMin(end) > 1439 || Number(start.slice(3)) > 59 || Number(end.slice(3)) > 59)
          return errors.push('Line ' + (i + 1) + ': that time does not exist.');
        if (start === end) return errors.push('Line ' + (i + 1) + ': the shift starts and ends at the same time.');
        const code = m[1].toUpperCase();
        if (seen.has(code)) return errors.push('Line ' + (i + 1) + ': code ' + code + ' is used twice.');
        if (code === 'OFF') return errors.push('Line ' + (i + 1) + ': OFF is reserved.');
        seen.add(code);
        const startMin = toMin(start);
        let endMin = toMin(end);
        if (endMin <= startMin) endMin += 1440;
        shifts.push({
          code: code,
          name: m[2].slice(0, 30),
          start: start,
          end: end,
          startMin: startMin,
          endMin: endMin,
          minutes: endMin - startMin,
          need: Number(m[5]),
        });
      });
    return { shifts: shifts, errors: errors };
  }

  const dates = (start, days) => {
    OT.parseIsoDate(start);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new Error('Choose 1 to ' + MAX_DAYS + ' days.');
    return Array.from({ length: days }, (_, i) => OT.addDays(start, i));
  };
  const weekKey = (iso) => OT.addDays(iso, -((weekday(iso) + 6) % 7)); // Monday of that week

  /** Hours of rest between two shifts on consecutive days. */
  function restHours(prev, next) {
    return (next.startMin + 1440 - prev.endMin) / 60;
  }

  function checkConfig(cfg) {
    if (!cfg.staff.length) throw new Error('Add at least one person.');
    if (!cfg.shifts.length) throw new Error('Add at least one shift.');
    if (!(cfg.maxConsecutive >= 1 && cfg.maxConsecutive <= 14)) throw new Error('Days in a row must be between 1 and 14.');
    if (!(cfg.maxPerWeek >= 1 && cfg.maxPerWeek <= 7)) throw new Error('Shifts per week must be between 1 and 7.');
    if (!(cfg.minRest >= 0 && cfg.minRest <= 24)) throw new Error('Minimum rest must be between 0 and 24 hours.');
  }

  /**
   * generate(cfg) cfg: { staff, shifts, start, days, maxConsecutive (6), maxPerWeek (6), minRest (11) }
   * -> { dates, roster: { name: [code or ""] }, gaps: [{ date, code, missing }], cfg }
   */
  function generate(config) {
    const cfg = Object.assign({ maxConsecutive: 6, maxPerWeek: 6, minRest: 11 }, config);
    checkConfig(cfg);
    const ds = dates(cfg.start, cfg.days);
    const byCode = {};
    cfg.shifts.forEach((s) => (byCode[s.code] = s));
    const roster = {};
    cfg.staff.forEach((p) => (roster[p.name] = ds.map(() => '')));
    const counts = {};
    const minutes = {};
    cfg.staff.forEach((p) => {
      counts[p.name] = {};
      minutes[p.name] = 0;
    });
    const leave = {};
    cfg.staff.forEach((p) => (leave[p.name] = new Set(p.leave)));
    const gaps = [];
    const eligible = (p, d, shift) => {
      const date = ds[d];
      if (leave[p.name].has(date)) return false;
      if (p.off !== null && p.off === weekday(date)) return false;
      if (roster[p.name][d]) return false;
      let run = 0;
      for (let k = d - 1; k >= 0 && roster[p.name][k]; k--) run++;
      if (run >= cfg.maxConsecutive) return false;
      const wk = weekKey(date);
      let inWeek = 0;
      for (let k = 0; k < ds.length; k++) if (roster[p.name][k] && weekKey(ds[k]) === wk) inWeek++;
      if (inWeek >= cfg.maxPerWeek) return false;
      const prev = d > 0 ? roster[p.name][d - 1] : '';
      if (prev && restHours(byCode[prev], shift) < cfg.minRest) return false;
      return true;
    };
    for (let d = 0; d < ds.length; d++) {
      cfg.shifts.forEach((shift) => {
        for (let n = 0; n < shift.need; n++) {
          const pool = cfg.staff
            .map((p, i) => ({ p: p, i: i }))
            .filter((x) => eligible(x.p, d, shift))
            .sort(
              (a, b) =>
                (counts[a.p.name][shift.code] || 0) - (counts[b.p.name][shift.code] || 0) ||
                minutes[a.p.name] - minutes[b.p.name] ||
                ((a.i + d) % cfg.staff.length) - ((b.i + d) % cfg.staff.length),
            );
          if (!pool.length) {
            const g = gaps.find((x) => x.date === ds[d] && x.code === shift.code);
            if (g) g.missing++;
            else gaps.push({ date: ds[d], code: shift.code, missing: 1 });
            continue;
          }
          const pick = pool[0].p;
          roster[pick.name][d] = shift.code;
          counts[pick.name][shift.code] = (counts[pick.name][shift.code] || 0) + 1;
          minutes[pick.name] += shift.minutes;
        }
      });
    }
    return { dates: ds, roster: roster, gaps: gaps, cfg: cfg };
  }

  /** Every rule broken by a roster: [{ kind, text }]. */
  function check(plan) {
    const cfg = plan.cfg;
    const ds = plan.dates;
    const byCode = {};
    cfg.shifts.forEach((s) => (byCode[s.code] = s));
    const out = [];
    ds.forEach((date, d) => {
      cfg.shifts.forEach((shift) => {
        const have = cfg.staff.filter((p) => plan.roster[p.name][d] === shift.code).length;
        if (have < shift.need)
          out.push({
            kind: 'cover',
            text: OT.formatDate(date, 'dmy') + ': ' + shift.name + ' has ' + have + ' of ' + shift.need + ' people.',
          });
      });
    });
    cfg.staff.forEach((p) => {
      const row = plan.roster[p.name];
      let run = 0;
      row.forEach((code, d) => {
        const date = ds[d];
        if (!code) {
          run = 0;
          return;
        }
        run++;
        if (run === cfg.maxConsecutive + 1)
          out.push({
            kind: 'consecutive',
            text:
              p.name + ' works more than ' + cfg.maxConsecutive + ' days in a row (from ' + OT.formatDate(ds[d - run + 1], 'dmy') + ').',
          });
        if (p.leave.indexOf(date) !== -1) out.push({ kind: 'leave', text: p.name + ' is on leave on ' + OT.formatDate(date, 'dmy') + '.' });
        if (p.off !== null && p.off === weekday(date))
          out.push({
            kind: 'off',
            text: p.name + ' has ' + DOWN[p.off] + ' as a weekly off but works on ' + OT.formatDate(date, 'dmy') + '.',
          });
        if (d > 0 && row[d - 1] && byCode[row[d - 1]] && byCode[code]) {
          const r = restHours(byCode[row[d - 1]], byCode[code]);
          if (r < cfg.minRest)
            out.push({
              kind: 'rest',
              text: p.name + ' has only ' + Math.round(r * 10) / 10 + ' hours of rest before ' + OT.formatDate(date, 'dmy') + '.',
            });
        }
      });
      const weeks = {};
      row.forEach((code, d) => code && (weeks[weekKey(ds[d])] = (weeks[weekKey(ds[d])] || 0) + 1));
      Object.keys(weeks).forEach(
        (w) =>
          weeks[w] > cfg.maxPerWeek &&
          out.push({
            kind: 'week',
            text: p.name + ' works ' + weeks[w] + ' shifts in the week of ' + OT.formatDate(w, 'dmy') + ' (limit ' + cfg.maxPerWeek + ').',
          }),
      );
    });
    return out;
  }

  /** Change one cell by hand ("" = day off). Returns a new plan. */
  function setCell(plan, name, dayIndex, code) {
    if (!plan.roster[name]) throw new Error('No such person.');
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= plan.dates.length) throw new Error('No such day.');
    if (code && !plan.cfg.shifts.some((s) => s.code === code)) throw new Error('No such shift.');
    const roster = {};
    Object.keys(plan.roster).forEach((k) => (roster[k] = plan.roster[k].slice()));
    roster[name][dayIndex] = code || '';
    return Object.assign({}, plan, { roster: roster });
  }

  /** Per person: shifts by code, hours, weekend days, night shifts (any shift that crosses midnight). */
  function stats(plan) {
    const byCode = {};
    plan.cfg.shifts.forEach((s) => (byCode[s.code] = s));
    return plan.cfg.staff.map((p) => {
      const counts = {};
      let minutes = 0;
      let weekends = 0;
      let nights = 0;
      plan.roster[p.name].forEach((code, d) => {
        if (!code) return;
        counts[code] = (counts[code] || 0) + 1;
        minutes += byCode[code].minutes;
        const w = weekday(plan.dates[d]);
        if (w === 0 || w === 6) weekends++;
        if (byCode[code].endMin > 1440) nights++;
      });
      return {
        name: p.name,
        counts: counts,
        shifts: Object.keys(counts).reduce((a, k) => a + counts[k], 0),
        hours: Math.round((minutes / 60) * 10) / 10,
        weekends: weekends,
        nights: nights,
      };
    });
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  /** Grid CSV: a row per person, a column per day, OFF for days without a shift. */
  function toCsv(plan) {
    const head = ['Name'].concat(plan.dates.map((d) => OT.formatDate(d, 'dmy') + ' ' + DOWN[weekday(d)]));
    const rows = plan.cfg.staff.map((p) => [p.name].concat(plan.roster[p.name].map((c) => c || 'OFF')));
    return (
      '﻿' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  function sample() {
    return {
      staff: [
        'Asha Rao',
        'Ravi Kumar; off=sun',
        'Meera Shah',
        'Zoe Fernandes; leave=2026-11-03..2026-11-05',
        'Kiran Patel',
        'Imran Sheikh',
        'Divya Nair; off=sat',
        'Arjun Mehta',
      ].join('\n'),
      shifts: ['M, Morning, 06:00-14:00, 2', 'A, Afternoon, 14:00-22:00, 2', 'N, Night, 22:00-06:00, 1'].join('\n'),
    };
  }

  return {
    DOWN: DOWN,
    parseStaff: parseStaff,
    parseShifts: parseShifts,
    generate: generate,
    check: check,
    setCell: setCell,
    stats: stats,
    restHours: restHours,
    toCsv: toCsv,
    sample: sample,
  };
});
