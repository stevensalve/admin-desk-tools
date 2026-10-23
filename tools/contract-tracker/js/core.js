/**
 * Contract & Renewal Tracker - core logic (pure; "today" is always passed in).
 *
 * Contract: { line, name, party, type, start, end (ISO), value (per year), noticeDays, autoRenew (bool), owner, notes }
 * Key dates: the END date and the NOTICE DEADLINE (end minus notice days): the last day to tell the other side you will not renew.
 * Status, in order of urgency:
 *   "expired"      the end date has passed
 *   "locked in"    auto-renews and the notice deadline has passed, so it will renew unless it is renegotiated
 *   "act now"      the notice deadline is within the alert window (or has just passed for a contract that does not auto-renew)
 *   "ending soon"  the end date is within the alert window
 *   "active"       nothing due soon
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.ContractCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const DAY = 86400000;
  const ORDER = ['expired', 'locked in', 'act now', 'ending soon', 'active'];

  const HEADERS = {
    name: ['contract', 'contract name', 'name', 'agreement', 'title', 'description'],
    party: ['vendor', 'party', 'supplier', 'counterparty', 'vendor name', 'customer', 'landlord'],
    type: ['type', 'category', 'contract type'],
    start: ['start', 'start date', 'effective date', 'from'],
    end: ['end', 'end date', 'expiry', 'expiry date', 'valid till', 'valid until', 'renewal date', 'to'],
    value: ['value', 'annual value', 'amount', 'yearly value', 'annual cost', 'cost per year', 'contract value'],
    noticeDays: ['notice', 'notice days', 'notice period', 'notice (days)', 'notice period (days)'],
    autoRenew: ['auto renew', 'auto-renew', 'auto renewal', 'auto-renewal', 'autorenew', 'renews automatically'],
    owner: ['owner', 'responsible', 'contract owner', 'managed by', 'department'],
    notes: ['notes', 'remarks', 'comments'],
  };

  const yes = (v) => /^(y|yes|true|1|auto|✓)/i.test(norm(v));

  /** Rows (with header) -> { contracts, errors }. */
  function rowsToContracts(aoa) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { contracts: [], errors: ['The file needs a header row and at least one contract.'] };
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const col = {};
    Object.keys(HEADERS).forEach((k) => (col[k] = head.findIndex((h) => HEADERS[k].indexOf(h) !== -1)));
    if (col.name === -1 || col.end === -1) return { contracts: [], errors: ['Need columns for Contract name and End date.'] };
    const out = [];
    const errors = [];
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const get = (k) => (col[k] === -1 ? '' : r[col[k]]);
      const end = OT.toIsoDate(get('end'));
      if (!end) return errors.push('Row ' + line + ': the end date could not be read, so the row was skipped.');
      const start = OT.toIsoDate(get('start'));
      if (start && start > end) return errors.push('Row ' + line + ': the start date is after the end date, so the row was skipped.');
      const v = norm(get('value'))
        .replace(/,/g, '')
        .replace(/^(rs\.?|inr|₹)\s*/i, '');
      const value = v === '' ? 0 : Number(v);
      const nd = norm(get('noticeDays')).replace(/[^\d.]/g, '');
      if (!Number.isFinite(value) || value < 0)
        return errors.push('Row ' + line + ': the value could not be read, so the row was skipped.');
      out.push({
        line: line,
        name: norm(get('name')) || '(no name)',
        party: norm(get('party')),
        type: norm(get('type')) || 'General',
        start: start,
        end: end,
        value: r2(value),
        noticeDays: nd === '' ? 0 : Math.round(Number(nd)),
        autoRenew: yes(get('autoRenew')),
        owner: norm(get('owner')) || '(no owner)',
        notes: norm(get('notes')),
      });
    });
    return { contracts: out, errors: errors };
  }

  const diff = (a, b) => Math.round((OT.parseIsoDate(a) - OT.parseIsoDate(b)) / DAY);

  /** analyse(contracts, today, opts) opts: { alertDays: 60 } -> rows sorted by urgency then by date. */
  function analyse(contracts, today, opts) {
    const o = Object.assign({ alertDays: 60 }, opts);
    OT.parseIsoDate(today);
    if (!(o.alertDays >= 1 && o.alertDays <= 730)) throw new Error('The alert window must be between 1 and 730 days.');
    const rows = contracts.map((c) => {
      const notice = OT.addDays(c.end, -c.noticeDays);
      const daysToEnd = diff(c.end, today);
      const daysToNotice = diff(notice, today);
      let status = 'active';
      if (daysToEnd < 0) status = 'expired';
      else if (c.autoRenew && daysToNotice < 0) status = 'locked in';
      else if (daysToNotice >= 0 ? daysToNotice <= o.alertDays && c.noticeDays > 0 : false) status = 'act now';
      else if (!c.autoRenew && daysToNotice < 0 && c.noticeDays > 0) status = 'act now';
      else if (daysToEnd <= o.alertDays) status = c.noticeDays > 0 && daysToNotice >= 0 ? 'act now' : 'ending soon';
      return Object.assign({}, c, { notice: notice, daysToEnd: daysToEnd, daysToNotice: daysToNotice, status: status });
    });
    rows.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.daysToEnd - b.daysToEnd || a.name.localeCompare(b.name));
    return rows;
  }

  /** Counts per status, value ending soon, and per-owner counts. */
  function summary(rows, horizonDays) {
    const h = horizonDays || 90;
    const count = {};
    ORDER.forEach((s) => (count[s] = 0));
    rows.forEach((r) => count[r.status]++);
    const endingValue = r2(rows.filter((r) => r.daysToEnd >= 0 && r.daysToEnd <= h).reduce((a, r) => a + r.value, 0));
    const lockedValue = r2(rows.filter((r) => r.status === 'locked in').reduce((a, r) => a + r.value, 0));
    const owners = {};
    rows
      .filter((r) => r.status !== 'active')
      .forEach((r) => {
        owners[r.owner] = owners[r.owner] || { owner: r.owner, items: [] };
        owners[r.owner].items.push(r);
      });
    return {
      count: count,
      endingValue: endingValue,
      lockedValue: lockedValue,
      totalValue: r2(rows.reduce((a, r) => a + r.value, 0)),
      byOwner: Object.keys(owners)
        .sort()
        .map((k) => owners[k]),
      horizon: h,
    };
  }

  /** A reminder for one owner (an entry of summary().byOwner). */
  function reminder(entry) {
    const lines = [
      'Hi ' + (entry.owner === '(no owner)' ? 'team' : entry.owner.split(' ')[0]) + ',',
      '',
      'These contracts need your attention:',
      '',
    ];
    entry.items.forEach((r) => {
      const what =
        r.status === 'expired'
          ? 'ended on ' + OT.formatDate(r.end, 'dmy') + ' (' + Math.abs(r.daysToEnd) + ' days ago)'
          : r.status === 'locked in'
            ? 'will auto-renew on ' +
              OT.formatDate(r.end, 'dmy') +
              '; the notice deadline (' +
              OT.formatDate(r.notice, 'dmy') +
              ') has passed'
            : r.status === 'act now'
              ? r.daysToNotice >= 0
                ? 'tell the other side by ' +
                  OT.formatDate(r.notice, 'dmy') +
                  ' (' +
                  r.daysToNotice +
                  ' days) if you do not want to renew; ends ' +
                  OT.formatDate(r.end, 'dmy')
                : 'notice date ' + OT.formatDate(r.notice, 'dmy') + ' has passed; ends ' + OT.formatDate(r.end, 'dmy')
              : 'ends on ' + OT.formatDate(r.end, 'dmy') + ' (' + r.daysToEnd + ' days)';
      lines.push(
        '- ' +
          r.name +
          (r.party ? ' (' + r.party + ')' : '') +
          ': ' +
          what +
          (r.value ? ', about Rs. ' + OT.formatInr(r.value, 0) + ' a year' : ''),
      );
    });
    lines.push('', 'Please decide whether to renew, renegotiate or end each one, and let us know.', '', 'Thank you');
    return lines.join('\n');
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(rows) {
    const head = [
      'Contract',
      'Party',
      'Type',
      'Owner',
      'Start',
      'End',
      'Notice days',
      'Notice deadline',
      'Auto-renews',
      'Annual value',
      'Days to end',
      'Status',
    ];
    const out = rows.map((r) => [
      r.name,
      r.party,
      r.type,
      r.owner,
      r.start,
      r.end,
      r.noticeDays,
      r.notice,
      r.autoRenew ? 'Yes' : 'No',
      r.value,
      r.daysToEnd,
      r.status,
    ]);
    return (
      '\ufeff' +
      [head]
        .concat(out)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function fold(line) {
    const out = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
      const b = new TextEncoder().encode(ch).length;
      if (bytes + b > 73) {
        out.push(cur);
        cur = ' ';
        bytes = 1;
      }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  /** All-day events for each notice deadline and each end date that is not in the past, with a reminder 7 days before. */
  function toIcs(rows, today, stamp) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) throw new Error('The timestamp must look like 20261023T000000Z.');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Admin Desk Tools//Contract Tracker//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    let n = 0;
    const add = (date, summary, desc) => {
      const d = date.replace(/-/g, '');
      lines.push(
        'BEGIN:VEVENT',
        'UID:contract-' + d + '-' + n++ + '@admin-desk-tools',
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + d,
        'DTEND;VALUE=DATE:' + OT.addDays(date, 1).replace(/-/g, ''),
        'SUMMARY:' + esc(summary),
        'DESCRIPTION:' + esc(desc),
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:' + esc(summary),
        'TRIGGER:-P7D',
        'END:VALARM',
        'END:VEVENT',
      );
    };
    rows.forEach((r) => {
      const who = r.name + (r.party ? ' - ' + r.party : '');
      if (r.noticeDays > 0 && r.notice >= today)
        add(
          r.notice,
          'Notice deadline: ' + who,
          'Last day to give notice' + (r.autoRenew ? ' (auto-renews otherwise)' : '') + '. Owner: ' + r.owner + '.',
        );
      if (r.end >= today) add(r.end, 'Contract ends: ' + who, 'Owner: ' + r.owner + '.' + (r.notes ? ' ' + r.notes : ''));
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function sampleRows() {
    return [
      ['Contract', 'Vendor', 'Type', 'Start Date', 'End Date', 'Annual Value', 'Notice Days', 'Auto Renew', 'Owner'],
      ['Office lease - Pune', 'Sunrise Properties', 'Lease', '01/04/2024', '31/03/2027', '2400000', '90', 'No', 'Asha Rao'],
      ['Housekeeping services', 'CleanCo', 'Service', '01/11/2025', '31/10/2026', '540000', '30', 'Yes', 'Ravi Kumar'],
      ['Printer maintenance', 'Print Supplies Co', 'AMC', '15/01/2026', '14/01/2027', '96000', '30', 'Yes', 'Ravi Kumar'],
      ['Security guards', 'SafeGuard Ltd', 'Service', '01/12/2025', '30/11/2026', '780000', '45', 'No', 'Meera Shah'],
      ['Internet leased line', 'FiberNet', 'Telecom', '01/03/2024', '28/02/2026', '180000', '30', 'No', 'Kiran Patel'],
      ['Pantry supplies', 'Daily Needs', 'Supply', '01/07/2026', '30/06/2027', '120000', '0', 'No', 'Meera Shah'],
    ];
  }

  return {
    ORDER: ORDER,
    rowsToContracts: rowsToContracts,
    analyse: analyse,
    summary: summary,
    reminder: reminder,
    toCsv: toCsv,
    toIcs: toIcs,
    sampleRows: sampleRows,
  };
});
