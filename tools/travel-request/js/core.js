/**
 * Travel Request Form - core logic (pure; pdf-lib is passed in, shared helpers come from OT).
 *
 * Request: { number, date, traveller: { name, empId, dept, designation }, approver, purpose, project,
 *            from, to, departDate, returnDate, mode, fares: [{ desc, amount }], hotel: { rate, nights }, perDiem: { rate },
 *            local: amount, other: [{ desc, amount }], advancePct, policy: { hotelCap, perDiemCap } }
 * Days = departure to return, both counted. Nights = days - 1 unless set. Per diem is paid per day.
 * The policy caps are only used to raise warnings; they never change the amounts.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.TravelCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const DAY = 86400000;
  const MODES = ['Flight', 'Train', 'Bus', 'Car / taxi', 'Own vehicle', 'Other'];
  const MAX_LINES = 30;

  function create(today) {
    return {
      number: '',
      date: today || '',
      traveller: { name: '', empId: '', dept: '', designation: '' },
      approver: '',
      purpose: '',
      project: '',
      from: '',
      to: '',
      departDate: '',
      returnDate: '',
      mode: 'Flight',
      fares: [
        { desc: 'Onward journey', amount: 0 },
        { desc: 'Return journey', amount: 0 },
      ],
      hotel: { rate: 0, nights: null },
      perDiem: { rate: 0 },
      local: 0,
      other: [],
      advancePct: 0,
      policy: { hotelCap: 0, perDiemCap: 0 },
    };
  }

  /** Days of the trip, both ends counted. Throws when a date is missing or the return is before the departure. */
  function tripDays(depart, ret) {
    const a = OT.parseIsoDate(depart);
    const b = OT.parseIsoDate(ret || depart);
    if (b < a) throw new Error('The return date is before the departure date.');
    return Math.round((b - a) / DAY) + 1;
  }

  const amt = (v) => (Number(v) > 0 ? r2(Number(v)) : 0);

  /**
   * compute(req) -> { days, nights, lines: [{ category, desc, qty, rate, amount }], total, advance, balance, warnings }
   * Does not throw on missing dates (days = 0); validate() lists what to fix.
   */
  function compute(req) {
    let days = 0;
    try {
      days = tripDays(req.departDate, req.returnDate);
    } catch (e) {
      days = 0;
    }
    const nights = req.hotel && Number.isInteger(req.hotel.nights) && req.hotel.nights >= 0 ? req.hotel.nights : Math.max(0, days - 1);
    const lines = [];
    req.fares
      .slice(0, MAX_LINES)
      .forEach(
        (f) =>
          amt(f.amount) > 0 &&
          lines.push({ category: 'Fare', desc: norm(f.desc) || 'Fare', qty: 1, rate: amt(f.amount), amount: amt(f.amount) }),
      );
    const hr = amt(req.hotel.rate);
    if (hr > 0 && nights > 0) lines.push({ category: 'Hotel', desc: 'Hotel', qty: nights, rate: hr, amount: r2(hr * nights) });
    const pd = amt(req.perDiem.rate);
    if (pd > 0 && days > 0) lines.push({ category: 'Meals / per diem', desc: 'Per diem', qty: days, rate: pd, amount: r2(pd * days) });
    if (amt(req.local) > 0)
      lines.push({ category: 'Local travel', desc: 'Local conveyance', qty: 1, rate: amt(req.local), amount: amt(req.local) });
    req.other
      .slice(0, MAX_LINES)
      .forEach(
        (o) =>
          amt(o.amount) > 0 &&
          lines.push({ category: 'Other', desc: norm(o.desc) || 'Other', qty: 1, rate: amt(o.amount), amount: amt(o.amount) }),
      );
    const total = r2(lines.reduce((a, l) => a + l.amount, 0));
    const pct = Math.min(100, Math.max(0, Number(req.advancePct) || 0));
    const advance = r2((total * pct) / 100);
    const warnings = [];
    const cap = amt(req.policy && req.policy.hotelCap);
    if (cap > 0 && hr > cap)
      warnings.push(
        'The hotel rate of Rs. ' + OT.formatInr(hr, 0) + ' a night is above the policy limit of Rs. ' + OT.formatInr(cap, 0) + '.',
      );
    const pcap = amt(req.policy && req.policy.perDiemCap);
    if (pcap > 0 && pd > pcap)
      warnings.push('The per diem of Rs. ' + OT.formatInr(pd, 0) + ' is above the policy limit of Rs. ' + OT.formatInr(pcap, 0) + '.');
    if (days > 30) warnings.push('A trip of ' + days + ' days is unusually long. Check the dates.');
    if (req.hotel && Number.isInteger(req.hotel.nights) && days > 0 && req.hotel.nights > days - 1)
      warnings.push('More hotel nights than the trip allows (' + (days - 1) + ').');
    if (total === 0) warnings.push('No costs have been entered yet.');
    return {
      days: days,
      nights: nights,
      lines: lines,
      total: total,
      advance: advance,
      balance: r2(total - advance),
      warnings: warnings,
      words: OT.inrAmountText(total),
    };
  }

  /** Problems that should be fixed before the form is printed. */
  function validate(req) {
    const e = [];
    if (!norm(req.number)) e.push('Enter a request number.');
    try {
      OT.parseIsoDate(req.date);
    } catch (x) {
      e.push('Enter the request date.');
    }
    if (!norm(req.traveller.name)) e.push('Enter the traveller name.');
    if (!norm(req.purpose)) e.push('Enter the purpose of the trip.');
    if (!norm(req.from) || !norm(req.to)) e.push('Enter where the trip starts and where it goes.');
    try {
      tripDays(req.departDate, req.returnDate);
    } catch (x) {
      e.push(x.message.indexOf('before') !== -1 ? x.message : 'Enter the departure date.');
    }
    if (req.returnDate) {
      try {
        OT.parseIsoDate(req.returnDate);
      } catch (x) {
        e.push('The return date is not valid.');
      }
    }
    if (!(Number(req.advancePct) >= 0 && Number(req.advancePct) <= 100)) e.push('The advance must be between 0 and 100 percent.');
    return e;
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(req, res) {
    const head = ['Request', 'Traveller', 'Trip', 'Category', 'Description', 'Quantity', 'Rate', 'Amount'];
    const rows = res.lines.map((l) => [
      req.number,
      req.traveller.name,
      req.from + ' to ' + req.to,
      l.category,
      l.desc,
      l.qty,
      l.rate,
      l.amount,
    ]);
    rows.push([req.number, req.traveller.name, '', 'Total', '', '', '', res.total]);
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

  function wrap(font, text, size, width) {
    const out = [];
    String(text)
      .split(/\r?\n/)
      .forEach((para) => {
        let line = '';
        sanitize(para)
          .split(/\s+/)
          .forEach((w) => {
            if (!w) return;
            const t = line ? line + ' ' + w : w;
            if (font.widthOfTextAtSize(t, size) <= width) line = t;
            else {
              if (line) out.push(line);
              line = w;
            }
          });
        out.push(line);
      });
    return out;
  }

  /** One-page A4 travel request for approval. */
  async function buildPdf(PDFLib, req, res, meta) {
    const md = meta || {};
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle('Travel request ' + req.number);
    doc.setCreator('Admin Desk Tools');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28;
    const H = 841.89;
    const M = 40;
    const grey = rgb(0.45, 0.47, 0.52);
    let page = doc.addPage([W, H]);
    let y = H - M;
    const t = (s, x, size, f, right) => {
      const v = sanitize(s);
      const ff = f || font;
      page.drawText(v, { x: right ? x - ff.widthOfTextAtSize(v, size) : x, y: y, size: size, font: ff, color: rgb(0.1, 0.1, 0.12) });
    };
    const need = (h) => {
      if (y < M + h) {
        page = doc.addPage([W, H]);
        y = H - M;
      }
    };
    if (md.company) {
      t(md.company, M, 12, bold);
      y -= 18;
    }
    t('TRAVEL REQUEST', M, 18, bold);
    t('No: ' + req.number, W - M, 10, bold, true);
    y -= 14;
    t('Date: ' + OT.formatDate(req.date, 'dmy'), W - M, 10, font, true);
    y -= 24;
    const kv = (label, value, x, w) => {
      t(label, x, 8, font);
      const lines = wrap(bold, value || '-', 10, w).slice(0, 3);
      lines.forEach((l, i) => {
        const keep = y;
        y -= 12 + i * 12;
        t(l, x, 10, bold);
        y = keep;
      });
      return lines.length;
    };
    const row = (items) => {
      let max = 1;
      items.forEach((it) => (max = Math.max(max, kv(it[0], it[1], it[2], it[3]))));
      y -= 14 + max * 12 + 6;
    };
    row([
      ['Traveller', req.traveller.name, M, 160],
      ['Employee ID', req.traveller.empId, M + 180, 90],
      ['Department', req.traveller.dept, M + 290, 110],
      ['Designation', req.traveller.designation, M + 410, 120],
    ]);
    row([
      ['From', req.from, M, 160],
      ['To', req.to, M + 180, 160],
      ['Mode', req.mode, M + 360, 100],
    ]);
    row([
      ['Departure', OT.formatDate(req.departDate, 'dmy'), M, 120],
      ['Return', req.returnDate ? OT.formatDate(req.returnDate, 'dmy') : 'Same day', M + 180, 120],
      ['Days / nights', res.days + ' / ' + res.nights, M + 360, 100],
    ]);
    row([['Purpose of travel', req.purpose, M, W - 2 * M]]);
    if (req.project) row([['Project / cost centre', req.project, M, W - 2 * M]]);
    y -= 4;
    need(40 + res.lines.length * 16);
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 17, color: rgb(0.93, 0.94, 0.96) });
    t('Cost estimate', M + 4, 9, bold);
    t('Qty', M + 300, 9, bold, true);
    t('Rate (Rs.)', M + 390, 9, bold, true);
    t('Amount (Rs.)', W - M - 4, 9, bold, true);
    y -= 20;
    res.lines.forEach((l) => {
      need(30);
      t(l.category + ' - ' + l.desc, M + 4, 9.5, font);
      t(String(l.qty), M + 300, 9.5, font, true);
      t(OT.formatInr(l.rate, 2), M + 390, 9.5, font, true);
      t(OT.formatInr(l.amount, 2), W - M - 4, 9.5, font, true);
      y -= 15;
    });
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.6, color: grey });
    y -= 4;
    [
      ['Total estimate', res.total, true],
      ['Advance requested (' + (Number(req.advancePct) || 0) + '%)', res.advance, false],
      ['Balance to be settled after the trip', res.balance, false],
    ].forEach((r) => {
      need(30);
      t(r[0], W - M - 130, r[2] ? 10.5 : 9.5, r[2] ? bold : font, true);
      t(OT.formatInr(r[1], 2), W - M - 4, r[2] ? 10.5 : 9.5, r[2] ? bold : font, true);
      y -= 15;
    });
    need(40);
    wrap(font, 'Total in words: ' + res.words, 9, W - 2 * M).forEach((l) => {
      t(l, M, 9, font);
      y -= 12;
    });
    if (res.warnings.length) {
      y -= 6;
      need(20 + res.warnings.length * 12);
      t("For the approver's attention", M, 9, bold);
      y -= 13;
      res.warnings.forEach((w) => {
        wrap(font, '- ' + w, 8.5, W - 2 * M).forEach((l) => {
          t(l, M, 8.5, font);
          y -= 11;
        });
      });
    }
    need(110);
    y -= 40;
    [['Traveller', req.traveller.name], ['Approver', req.approver], ['Accounts']].forEach((s, i) => {
      const x = M + i * 175;
      page.drawLine({ start: { x: x, y: y }, end: { x: x + 150, y: y }, thickness: 0.5, color: grey });
      page.drawText(sanitize(s[0] + (s[1] ? ': ' + s[1] : '')), { x: x, y: y - 11, size: 8, font: font, color: grey });
      page.drawText('Date:', { x: x, y: y - 24, size: 8, font: font, color: grey });
    });
    doc.getPages().forEach((p, i, all) =>
      p.drawText('Page ' + (i + 1) + ' of ' + all.length + '   Estimate only; actual claims need bills as per policy.', {
        x: M,
        y: 22,
        size: 7.5,
        font: font,
        color: grey,
      }),
    );
    return doc.save();
  }

  function serialize(req) {
    return JSON.stringify({ app: 'travel-request', version: 1, request: req }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved travel request.');
    }
    const s = d && d.app === 'travel-request' ? d.request : null;
    if (!s || !Array.isArray(s.fares)) throw new Error('That file is not a saved travel request.');
    const str = (v, n) => norm(v).slice(0, n || 120);
    const lines = (a) => (Array.isArray(a) ? a : []).slice(0, MAX_LINES).map((l) => ({ desc: str(l.desc, 80), amount: amt(l.amount) }));
    const tr = s.traveller || {};
    return Object.assign(create(''), {
      number: str(s.number, 40),
      date: OT.toIsoDate(s.date),
      traveller: { name: str(tr.name, 80), empId: str(tr.empId, 20), dept: str(tr.dept, 60), designation: str(tr.designation, 60) },
      approver: str(s.approver, 80),
      purpose: str(s.purpose, 300),
      project: str(s.project, 80),
      from: str(s.from, 60),
      to: str(s.to, 60),
      departDate: OT.toIsoDate(s.departDate),
      returnDate: OT.toIsoDate(s.returnDate),
      mode: MODES.indexOf(s.mode) !== -1 ? s.mode : 'Other',
      fares: lines(s.fares),
      hotel: {
        rate: amt(s.hotel && s.hotel.rate),
        nights: s.hotel && Number.isInteger(s.hotel.nights) && s.hotel.nights >= 0 ? s.hotel.nights : null,
      },
      perDiem: { rate: amt(s.perDiem && s.perDiem.rate) },
      local: amt(s.local),
      other: lines(s.other),
      advancePct: Math.min(100, Math.max(0, Number(s.advancePct) || 0)),
      policy: { hotelCap: amt(s.policy && s.policy.hotelCap), perDiemCap: amt(s.policy && s.policy.perDiemCap) },
    });
  }

  return {
    MODES: MODES,
    create: create,
    tripDays: tripDays,
    compute: compute,
    validate: validate,
    toCsv: toCsv,
    sanitize: sanitize,
    buildPdf: buildPdf,
    serialize: serialize,
    parse: parse,
  };
});
