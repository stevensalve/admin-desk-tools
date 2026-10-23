/**
 * Visitor Log & Passes - core logic (pure; the current time is always passed in as "YYYY-MM-DDTHH:MM").
 *
 * State: { nextId, visitors: [{ id, badge, name, company, phone, host, purpose, vehicle, idType, idLast4, inAt, outAt }] }
 * Privacy: the tool never stores a full ID number, only the type of ID and its last four digits.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.VisitorCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const MAX = 5000;
  const PURPOSES = [
    'Meeting',
    'Interview',
    'Delivery',
    'Service / maintenance',
    'Vendor / sales',
    'Audit / inspection',
    'Personal',
    'Other',
  ];
  const ID_TYPES = ['', 'Aadhaar', 'Driving licence', 'PAN', 'Passport', 'Voter ID', 'Company ID', 'Other'];

  const STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
  /** "2026-10-23T14:30" -> minutes since epoch (UTC arithmetic, so no time-zone surprises). Throws for bad input. */
  function toMinutes(stamp) {
    const m = STAMP.exec(String(stamp || ''));
    if (!m) throw new Error('Times must look like 2026-10-23T14:30.');
    OT.parseIsoDate(m[1] + '-' + m[2] + '-' + m[3]);
    if (Number(m[4]) > 23 || Number(m[5]) > 59) throw new Error('That time does not exist.');
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
  }
  const minutesBetween = (a, b) => toMinutes(b) - toMinutes(a);

  function create() {
    return { nextId: 1, visitors: [] };
  }

  /** "98765 43210" / "+91 98765-43210" -> "9876543210", or "" when blank; null when it is not a 10-digit Indian mobile number. */
  function cleanPhone(p) {
    const d = String(p || '').replace(/[^\d]/g, '');
    if (!d) return '';
    const t = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
    return /^[6-9]\d{9}$/.test(t) ? t : null;
  }

  /** "9876543210" -> "98765 43210". */
  const fmtPhone = (p) => (p && p.length === 10 ? p.slice(0, 5) + ' ' + p.slice(5) : p || '');

  /** Last four digits of whatever was typed as an ID number (never the whole number). */
  function last4(text) {
    const d = String(text || '').replace(/[^0-9A-Za-z]/g, '');
    return d.slice(-4).toUpperCase();
  }

  /**
   * Check a visitor in. v: { name, company, phone, host, purpose, vehicle, idType, idNumber }.
   * Returns { state, visitor }. Throws for a missing name or host, or a bad phone number.
   */
  function checkIn(state, v, now) {
    toMinutes(now);
    const name = norm(v.name);
    if (!name) throw new Error('Enter the visitor name.');
    const host = norm(v.host);
    if (!host) throw new Error('Enter who the visitor is meeting.');
    const phone = cleanPhone(v.phone);
    if (phone === null) throw new Error('The phone number should be a 10-digit mobile number.');
    if (state.visitors.length >= MAX) throw new Error('The log is full (' + MAX + ' visitors). Save it and start a new one.');
    const s = copy(state);
    const day = now.slice(2, 10).replace(/-/g, '');
    const todays = s.visitors.filter((x) => x.inAt.slice(0, 10) === now.slice(0, 10)).length;
    const visitor = {
      id: s.nextId++,
      badge: 'V-' + day + '-' + String(todays + 1).padStart(3, '0'),
      name: name.slice(0, 80),
      company: norm(v.company).slice(0, 80),
      phone: phone,
      host: host.slice(0, 80),
      purpose: PURPOSES.indexOf(v.purpose) !== -1 ? v.purpose : 'Other',
      vehicle: norm(v.vehicle).toUpperCase().slice(0, 15),
      idType: ID_TYPES.indexOf(v.idType) !== -1 ? v.idType : '',
      idLast4: v.idType ? last4(v.idNumber) : '',
      inAt: now,
      outAt: '',
    };
    s.visitors.push(visitor);
    return { state: s, visitor: visitor };
  }

  function checkOut(state, id, now) {
    toMinutes(now);
    const s = copy(state);
    const v = s.visitors.find((x) => x.id === id);
    if (!v) throw new Error('No such visitor.');
    if (v.outAt) throw new Error(v.name + ' is already checked out.');
    if (toMinutes(now) < toMinutes(v.inAt)) throw new Error('The check-out time is before the check-in time.');
    v.outAt = now;
    return s;
  }

  const onSite = (state) => state.visitors.filter((v) => !v.outAt);

  /** People still inside after `hours` (for example at closing time, or a long overstay). */
  function overstays(state, now, hours) {
    return onSite(state)
      .map((v) => ({ visitor: v, minutes: minutesBetween(v.inAt, now) }))
      .filter((x) => x.minutes > hours * 60)
      .sort((a, b) => b.minutes - a.minutes);
  }

  /** "2 h 05 min" / "35 min". */
  function duration(minutes) {
    const m = Math.max(0, Math.round(minutes));
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
  }

  /** Everything for one calendar day: entries, counts, average stay, by host and by purpose. */
  function daySummary(state, date) {
    const entries = state.visitors.filter((v) => v.inAt.slice(0, 10) === date);
    const done = entries.filter((v) => v.outAt);
    const stay = done.map((v) => minutesBetween(v.inAt, v.outAt));
    const count = (key) => {
      const m = {};
      entries.forEach((v) => (m[v[key]] = (m[v[key]] || 0) + 1));
      return Object.keys(m)
        .map((k) => ({ key: k, count: m[k] }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    };
    return {
      entries: entries,
      total: entries.length,
      stillInside: entries.length - done.length,
      averageMinutes: stay.length ? Math.round(stay.reduce((a, b) => a + b, 0) / stay.length) : 0,
      byHost: count('host'),
      byPurpose: count('purpose'),
    };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(visitors) {
    const head = [
      'Badge',
      'Name',
      'Company',
      'Phone',
      'Meeting',
      'Purpose',
      'Vehicle',
      'ID type',
      'ID last 4',
      'In',
      'Out',
      'Minutes inside',
    ];
    const rows = visitors.map((v) => [
      v.badge,
      v.name,
      v.company,
      v.phone,
      v.host,
      v.purpose,
      v.vehicle,
      v.idType,
      v.idLast4,
      v.inAt.replace('T', ' '),
      v.outAt.replace('T', ' '),
      v.outAt ? minutesBetween(v.inAt, v.outAt) : '',
    ]);
    return (
      '﻿' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  function sanitize(s) {
    return String(s)
      .replace(/₹/g, 'Rs.')
      .replace(/[^ -~\u00a0-ÿ]/g, '?');
  }

  /** One A6 visitor pass per visitor (a PDF page each). opts: { company, note }. */
  async function buildPassPdf(PDFLib, visitors, opts) {
    if (!visitors.length) throw new Error('Choose at least one visitor.');
    const o = Object.assign({ company: '', note: 'Please wear this pass visibly and return it at reception.' }, opts);
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle('Visitor pass');
    doc.setCreator('Admin Desk Tools');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 297.64;
    const H = 419.53;
    visitors.forEach((v) => {
      const page = doc.addPage([W, H]);
      const t = (s, x, y, size, f, center) => {
        let val = sanitize(s);
        const ff = f || font;
        while (val.length > 1 && ff.widthOfTextAtSize(val, size) > W - 40) val = val.slice(0, -1);
        page.drawText(val, {
          x: center ? (W - ff.widthOfTextAtSize(val, size)) / 2 : x,
          y: y,
          size: size,
          font: ff,
          color: rgb(0.1, 0.1, 0.12),
        });
      };
      page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: rgb(0.11, 0.3, 0.85) });
      page.drawText(sanitize(o.company || 'VISITOR'), { x: 20, y: H - 42, size: 18, font: bold, color: rgb(1, 1, 1) });
      page.drawText('VISITOR PASS', { x: 20, y: H - 60, size: 9, font: font, color: rgb(0.85, 0.9, 1) });
      t(v.name, 0, H - 120, 22, bold, true);
      if (v.company) t(v.company, 0, H - 142, 12, font, true);
      let y = H - 190;
      [
        ['Meeting', v.host],
        ['Purpose', v.purpose],
        ['Date', OT.formatDate(v.inAt.slice(0, 10), 'dmy')],
        ['In', v.inAt.slice(11)],
        ['Vehicle', v.vehicle],
        ['Pass no.', v.badge],
      ].forEach((r) => {
        if (!r[1]) return;
        t(r[0], 20, y, 9, font);
        t(r[1], 90, y, 11, bold);
        y -= 22;
      });
      page.drawLine({ start: { x: 20, y: 70 }, end: { x: W - 20, y: 70 }, thickness: 0.6, color: rgb(0.6, 0.62, 0.68) });
      t(o.note, 20, 50, 7.5, font);
      t('Host signature: ____________________', 20, 28, 8, font);
    });
    return doc.save();
  }

  function serialize(state) {
    return JSON.stringify({ app: 'visitor-log', version: 1, state: state }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved visitor log.');
    }
    const st = d && d.app === 'visitor-log' ? d.state : null;
    if (!st || !Array.isArray(st.visitors)) throw new Error('That file is not a saved visitor log.');
    const out = create();
    st.visitors.slice(0, MAX).forEach((v) => {
      try {
        toMinutes(v.inAt);
        if (v.outAt) toMinutes(v.outAt);
      } catch (e) {
        return;
      }
      const name = norm(v.name);
      if (!name) return;
      out.visitors.push({
        id: out.nextId++,
        badge: norm(v.badge).slice(0, 20),
        name: name.slice(0, 80),
        company: norm(v.company).slice(0, 80),
        phone: cleanPhone(v.phone) || '',
        host: norm(v.host).slice(0, 80),
        purpose: PURPOSES.indexOf(v.purpose) !== -1 ? v.purpose : 'Other',
        vehicle: norm(v.vehicle).toUpperCase().slice(0, 15),
        idType: ID_TYPES.indexOf(v.idType) !== -1 ? v.idType : '',
        idLast4: norm(v.idLast4).slice(0, 4),
        inAt: v.inAt,
        outAt: v.outAt || '',
      });
    });
    return out;
  }

  return {
    PURPOSES: PURPOSES,
    ID_TYPES: ID_TYPES,
    toMinutes: toMinutes,
    minutesBetween: minutesBetween,
    create: create,
    cleanPhone: cleanPhone,
    fmtPhone: fmtPhone,
    last4: last4,
    checkIn: checkIn,
    checkOut: checkOut,
    onSite: onSite,
    overstays: overstays,
    duration: duration,
    daySummary: daySummary,
    toCsv: toCsv,
    sanitize: sanitize,
    buildPassPdf: buildPassPdf,
    serialize: serialize,
    parse: parse,
  };
});
