/**
 * Purchase Order Maker - core logic (pure; pdf-lib is passed in, shared helpers come from OT).
 *
 * PO shape:
 *   { number, date, deliveryDate, vendor: { name, gstin, address, stateCode }, buyer: { name, gstin, address, stateCode },
 *     deliverTo, items: [{ desc, hsn, qty, unit, rate, discPct, gstPct }], freight: { amount, gstPct }, terms, notes, roundOff }
 * GST rule used: vendor and buyer in the same state -> CGST + SGST (half each); otherwise IGST.
 * Every line (and the freight line) is rounded to paise, so the printed totals always add up.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.PoCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const STATES = {
    '01': 'Jammu and Kashmir',
    '02': 'Himachal Pradesh',
    '03': 'Punjab',
    '04': 'Chandigarh',
    '05': 'Uttarakhand',
    '06': 'Haryana',
    '07': 'Delhi',
    '08': 'Rajasthan',
    '09': 'Uttar Pradesh',
    10: 'Bihar',
    11: 'Sikkim',
    12: 'Arunachal Pradesh',
    13: 'Nagaland',
    14: 'Manipur',
    15: 'Mizoram',
    16: 'Tripura',
    17: 'Meghalaya',
    18: 'Assam',
    19: 'West Bengal',
    20: 'Jharkhand',
    21: 'Odisha',
    22: 'Chhattisgarh',
    23: 'Madhya Pradesh',
    24: 'Gujarat',
    26: 'Dadra and Nagar Haveli and Daman and Diu',
    27: 'Maharashtra',
    29: 'Karnataka',
    30: 'Goa',
    31: 'Lakshadweep',
    32: 'Kerala',
    33: 'Tamil Nadu',
    34: 'Puducherry',
    35: 'Andaman and Nicobar Islands',
    36: 'Telangana',
    37: 'Andhra Pradesh',
    38: 'Ladakh',
    97: 'Other Territory',
  };
  const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const MAX_ITEMS = 100;
  const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const DEFAULT_TERMS =
    'Payment: within 30 days of receipt of goods and a correct tax invoice.\nGoods must match the description, quantity and specification above.\nPlease quote the PO number on the delivery challan and invoice.';

  function gstinCheckChar(first14) {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      const p = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
      sum += Math.floor(p / 36) + (p % 36);
    }
    return CHARS[(36 - (sum % 36)) % 36];
  }

  /** "" (blank is allowed) or a description of what is wrong with a GSTIN. */
  function gstinProblem(value) {
    const g = norm(value).toUpperCase();
    if (!g) return '';
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return 'GSTIN must be 15 characters, like 27AAPFU0939F1ZV.';
    if (!STATES[g.slice(0, 2)]) return 'The first two digits of the GSTIN are not a known state code.';
    if (gstinCheckChar(g) !== g[14]) return 'The GSTIN check character does not match - please re-check it.';
    return '';
  }

  /** "PO/26-27/0007" -> "PO/26-27/0008". */
  function nextNumber(n) {
    const s = norm(n);
    const m = /^(.*?)(\d+)$/.exec(s);
    if (!m) return s ? s + '-1' : '1';
    return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0');
  }

  /** Indian financial year of an ISO date: 2026-10-23 -> "2026-27". */
  function financialYear(iso) {
    const d = new Date(OT.parseIsoDate(iso));
    const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return y + '-' + String((y + 1) % 100).padStart(2, '0');
  }

  function create(today) {
    return {
      number: '',
      date: today || '',
      deliveryDate: '',
      vendor: { name: '', gstin: '', address: '', stateCode: '27' },
      buyer: { name: '', gstin: '', address: '', stateCode: '27' },
      deliverTo: '',
      items: [{ desc: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, discPct: 0, gstPct: 18 }],
      freight: { amount: 0, gstPct: 18 },
      terms: DEFAULT_TERMS,
      notes: '',
      roundOff: true,
    };
  }

  /** Problems that should stop the PO from being issued. */
  function validate(po) {
    const e = [];
    if (!norm(po.number)) e.push('Enter a PO number.');
    try {
      OT.parseIsoDate(po.date);
    } catch (x) {
      e.push('Enter the PO date.');
    }
    if (po.deliveryDate) {
      try {
        if (OT.parseIsoDate(po.deliveryDate) < OT.parseIsoDate(po.date)) e.push('The delivery date is before the PO date.');
      } catch (x) {
        e.push('The delivery date is not valid.');
      }
    }
    if (!norm(po.vendor.name)) e.push('Enter the vendor name.');
    if (!norm(po.buyer.name)) e.push('Enter your company name.');
    [
      ['vendor', 'Vendor'],
      ['buyer', 'Buyer'],
    ].forEach((w) => {
      const p = gstinProblem(po[w[0]].gstin);
      if (p) e.push(w[1] + ': ' + p);
      const g = norm(po[w[0]].gstin).toUpperCase();
      if (g && !p && g.slice(0, 2) !== po[w[0]].stateCode) e.push(w[1] + ': the state does not match the first two digits of the GSTIN.');
    });
    if (!po.items.length) e.push('Add at least one item.');
    po.items.forEach((it, i) => {
      const n = i + 1;
      if (!norm(it.desc)) e.push('Item ' + n + ': enter a description.');
      if (!(Number(it.qty) > 0)) e.push('Item ' + n + ': quantity must be more than zero.');
      if (!(Number(it.rate) >= 0)) e.push('Item ' + n + ': rate cannot be negative.');
      if (!(Number(it.discPct) >= 0 && Number(it.discPct) <= 100)) e.push('Item ' + n + ': discount must be between 0 and 100.');
      if (!(Number(it.gstPct) >= 0 && Number(it.gstPct) <= 40)) e.push('Item ' + n + ': GST rate must be between 0 and 40.');
    });
    if (!(Number(po.freight.amount) >= 0)) e.push('Freight cannot be negative.');
    return e;
  }

  /** Work out every line and the totals. Returns { intra, lines, summary, totals }. The freight (if any) is the last line. */
  function compute(po) {
    const intra = !!po.vendor.stateCode && po.vendor.stateCode === po.buyer.stateCode;
    const src = po.items.slice(0, MAX_ITEMS).map((it) => ({
      desc: it.desc,
      hsn: it.hsn,
      unit: it.unit,
      qty: it.qty,
      rate: it.rate,
      discPct: it.discPct,
      gstPct: it.gstPct,
      freight: false,
    }));
    if (Number(po.freight && po.freight.amount) > 0)
      src.push({
        desc: 'Freight and handling',
        hsn: '',
        unit: '',
        qty: 1,
        rate: Number(po.freight.amount),
        discPct: 0,
        gstPct: po.freight.gstPct,
        freight: true,
      });
    const lines = src.map((it) => {
      const qty = Math.max(0, Number(it.qty) || 0);
      const rate = Math.max(0, Number(it.rate) || 0);
      const disc = Math.min(100, Math.max(0, Number(it.discPct) || 0));
      const gst = Math.max(0, Number(it.gstPct) || 0);
      const gross = r2(qty * rate);
      const discount = r2((gross * disc) / 100);
      const taxable = r2(gross - discount);
      let cgst = 0;
      let sgst = 0;
      let igst = 0;
      if (intra) {
        cgst = r2((taxable * gst) / 200);
        sgst = cgst;
      } else igst = r2((taxable * gst) / 100);
      const tax = r2(cgst + sgst + igst);
      return {
        desc: norm(it.desc),
        hsn: norm(it.hsn),
        unit: norm(it.unit),
        qty: qty,
        rate: rate,
        discPct: disc,
        gstPct: gst,
        gross: gross,
        discount: discount,
        taxable: taxable,
        cgst: cgst,
        sgst: sgst,
        igst: igst,
        tax: tax,
        total: r2(taxable + tax),
        freight: it.freight,
      };
    });
    const by = {};
    lines.forEach((l) => {
      const k = String(l.gstPct);
      by[k] = by[k] || { gstPct: l.gstPct, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      ['taxable', 'cgst', 'sgst', 'igst'].forEach((f) => (by[k][f] = r2(by[k][f] + l[f])));
    });
    const summary = Object.keys(by)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => by[String(k)]);
    const sum = (f) => r2(lines.reduce((a, l) => a + l[f], 0));
    const totals = { taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), tax: sum('tax') };
    totals.exact = r2(totals.taxable + totals.tax);
    totals.roundOff = po.roundOff ? r2(Math.round(totals.exact) - totals.exact) : 0;
    totals.grand = r2(totals.exact + totals.roundOff);
    totals.words = OT.inrAmountText(totals.grand);
    return { intra: intra, lines: lines, summary: summary, totals: totals };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(po, res) {
    const head = [
      'PO',
      'Date',
      'Vendor',
      'Description',
      'HSN/SAC',
      'Qty',
      'Unit',
      'Rate',
      'Discount %',
      'Taxable',
      'GST %',
      'CGST',
      'SGST',
      'IGST',
      'Line total',
    ];
    const rows = res.lines.map((l) => [
      po.number,
      po.date,
      po.vendor.name,
      l.desc,
      l.hsn,
      l.qty,
      l.unit,
      l.rate,
      l.discPct,
      l.taxable,
      l.gstPct,
      l.cgst,
      l.sgst,
      l.igst,
      l.total,
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
              while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
                let k = line.length - 1;
                while (k > 1 && font.widthOfTextAtSize(line.slice(0, k), size) > width) k--;
                out.push(line.slice(0, k));
                line = line.slice(k);
              }
            }
          });
        out.push(line);
      });
    return out;
  }

  /** A4 purchase-order PDF (extra pages when there are many items). */
  async function buildPdf(PDFLib, po, res) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle('Purchase order ' + po.number);
    doc.setCreator('Admin Desk Tools');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28;
    const H = 841.89;
    const M = 36;
    const ink = rgb(0.1, 0.1, 0.12);
    const grey = rgb(0.45, 0.47, 0.52);
    let page;
    let y;
    const t = (s, x, size, f, right) => {
      const v = sanitize(s);
      const ff = f || font;
      page.drawText(v, { x: right ? x - ff.widthOfTextAtSize(v, size) : x, y: y, size: size, font: ff, color: ink });
    };
    const fit = (s, f, size, w) => {
      let v = sanitize(s);
      while (v.length > 1 && f.widthOfTextAtSize(v, size) > w) v = v.slice(0, -1);
      return v;
    };
    const cols = [
      { h: '#', x: M, w: 18 },
      { h: 'Description', x: M + 18, w: 160 },
      { h: 'HSN/SAC', x: M + 180, w: 50 },
      { h: 'Qty', x: M + 232, w: 52 },
      { h: 'Rate', x: M + 290, w: 56 },
      { h: 'Disc %', x: M + 350, w: 34 },
      { h: 'GST %', x: M + 388, w: 36 },
      { h: 'Amount', x: W - M, w: 70 },
    ];
    const header = () => {
      page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 17, color: rgb(0.93, 0.94, 0.96) });
      cols.forEach((c, i) => t(c.h, i < 3 ? c.x : c.x + c.w, 8, bold, i >= 3));
      y -= 18;
    };
    const newPage = () => {
      page = doc.addPage([W, H]);
      y = H - M - 10;
    };
    newPage();
    t('PURCHASE ORDER', M, 18, bold);
    t('PO no: ' + po.number, W - M, 10, bold, true);
    y -= 14;
    t('Date: ' + OT.formatDate(po.date, 'dmy'), W - M, 10, font, true);
    if (po.deliveryDate) {
      y -= 13;
      t('Deliver by: ' + OT.formatDate(po.deliveryDate, 'dmy'), W - M, 10, font, true);
    }
    y -= 26;
    const party = (label, p, x) => {
      const keep = y;
      t(label, x, 8, bold);
      y -= 13;
      t(fit(p.name, bold, 11, 240), x, 11, bold);
      wrap(font, p.address || '', 9, 240)
        .slice(0, 4)
        .forEach((l) => {
          y -= 12;
          t(l, x, 9, font);
        });
      if (norm(p.gstin)) {
        y -= 12;
        t('GSTIN: ' + norm(p.gstin).toUpperCase(), x, 9, font);
      }
      y -= 12;
      t('State: ' + (STATES[p.stateCode] || '-') + ' (' + (p.stateCode || '-') + ')', x, 9, font);
      const low = y;
      y = keep;
      return low;
    };
    const a = party('VENDOR', po.vendor, M);
    const b = party('BUYER (BILL TO)', po.buyer, W / 2 + 6);
    y = Math.min(a, b) - 14;
    if (norm(po.deliverTo)) {
      t('DELIVER TO', M, 8, bold);
      y -= 12;
      wrap(font, po.deliverTo, 9, W - 2 * M)
        .slice(0, 3)
        .forEach((l) => {
          t(l, M, 9, font);
          y -= 12;
        });
    }
    y -= 12;
    header();
    res.lines.forEach((l, i) => {
      if (y < 210) {
        newPage();
        header();
      }
      const rowY = y;
      t(l.freight ? '' : String(i + 1), cols[0].x, 8.5, font);
      const dl = wrap(font, l.desc, 8.5, cols[1].w).slice(0, 3);
      dl.forEach((ln, k) => {
        y = rowY - k * 10;
        t(ln, cols[1].x, 8.5, font);
      });
      y = rowY;
      t(fit(l.hsn, font, 8.5, cols[2].w), cols[2].x, 8.5, font);
      t(l.freight ? '' : l.qty + (l.unit ? ' ' + l.unit : ''), cols[3].x + cols[3].w, 8.5, font, true);
      t(OT.formatInr(l.rate, 2), cols[4].x + cols[4].w, 8.5, font, true);
      t(l.discPct ? String(l.discPct) : '', cols[5].x + cols[5].w, 8.5, font, true);
      t(l.gstPct + '%', cols[6].x + cols[6].w, 8.5, font, true);
      t(OT.formatInr(l.total, 2), W - M, 8.5, font, true);
      y = rowY - Math.max(1, dl.length) * 10 - 4;
      page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.84) });
    });
    if (y < 230) newPage();
    y -= 8;
    const T = res.totals;
    const row = (label, v, strong) => {
      t(label, W - M - 110, strong ? 10 : 9, strong ? bold : font, true);
      t(OT.formatInr(v, 2), W - M, strong ? 10 : 9, strong ? bold : font, true);
      y -= 14;
    };
    row('Taxable value', T.taxable);
    if (res.intra) {
      row('CGST', T.cgst);
      row('SGST', T.sgst);
    } else row('IGST', T.igst);
    if (T.roundOff) row('Round off', T.roundOff);
    page.drawLine({ start: { x: W - M - 230, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.6, color: grey });
    y -= 2;
    row('Total (Rs.)', T.grand, true);
    y -= 4;
    wrap(bold, 'Amount in words: ' + T.words, 9, W - 2 * M).forEach((l) => {
      t(l, M, 9, bold);
      y -= 12;
    });
    [
      ['Terms and conditions', po.terms],
      ['Notes', po.notes],
    ].forEach((blk) => {
      if (!norm(blk[1])) return;
      y -= 8;
      if (y < 130) newPage();
      t(blk[0], M, 8, bold);
      y -= 11;
      wrap(font, blk[1], 8.5, W - 2 * M)
        .slice(0, 12)
        .forEach((l) => {
          if (y < 90) newPage();
          t(l, M, 8.5, font);
          y -= 10.5;
        });
    });
    if (y < 110) newPage();
    y = Math.min(y - 30, 90);
    ['Prepared by', 'Approved by', 'Vendor acceptance'].forEach((label, i) => {
      const x = M + i * 180;
      page.drawLine({ start: { x: x, y: y }, end: { x: x + 150, y: y }, thickness: 0.5, color: grey });
      page.drawText(label, { x: x, y: y - 11, size: 8, font: font, color: grey });
    });
    doc.getPages().forEach((p, i, all) => {
      p.drawText('Page ' + (i + 1) + ' of ' + all.length + '   This is a computer-generated purchase order.', {
        x: M,
        y: 22,
        size: 7.5,
        font: font,
        color: grey,
      });
    });
    return doc.save();
  }

  function serialize(po) {
    return JSON.stringify({ app: 'purchase-order', version: 1, po: po }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved purchase order.');
    }
    const s = d && d.app === 'purchase-order' ? d.po : null;
    if (!s || !Array.isArray(s.items)) throw new Error('That file is not a saved purchase order.');
    const str = (v, max) => norm(v).slice(0, max || 200);
    const party = (p) => ({
      name: str(p && p.name, 120),
      gstin: str(p && p.gstin, 15).toUpperCase(),
      address: String((p && p.address) || '').slice(0, 400),
      stateCode: STATES[p && p.stateCode] ? p.stateCode : '27',
    });
    const fr = s.freight || {};
    return Object.assign(create(''), {
      number: str(s.number, 40),
      date: OT.toIsoDate(s.date),
      deliveryDate: OT.toIsoDate(s.deliveryDate),
      vendor: party(s.vendor),
      buyer: party(s.buyer),
      deliverTo: String(s.deliverTo || '').slice(0, 400),
      items: s.items.slice(0, MAX_ITEMS).map((it) => ({
        desc: str(it.desc, 300),
        hsn: str(it.hsn, 12),
        qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
        unit: str(it.unit, 10),
        rate: Number(it.rate) >= 0 ? Number(it.rate) : 0,
        discPct: Number(it.discPct) >= 0 ? Math.min(100, Number(it.discPct)) : 0,
        gstPct: Number(it.gstPct) >= 0 ? Math.min(40, Number(it.gstPct)) : 18,
      })),
      freight: {
        amount: Number(fr.amount) >= 0 ? Number(fr.amount) : 0,
        gstPct: Number(fr.gstPct) >= 0 ? Math.min(40, Number(fr.gstPct)) : 18,
      },
      terms: String(s.terms === undefined ? DEFAULT_TERMS : s.terms).slice(0, 1500),
      notes: String(s.notes || '').slice(0, 1000),
      roundOff: s.roundOff !== false,
    });
  }

  return {
    STATES: STATES,
    GST_RATES: GST_RATES,
    DEFAULT_TERMS: DEFAULT_TERMS,
    gstinProblem: gstinProblem,
    nextNumber: nextNumber,
    financialYear: financialYear,
    create: create,
    validate: validate,
    compute: compute,
    toCsv: toCsv,
    sanitize: sanitize,
    buildPdf: buildPdf,
    serialize: serialize,
    parse: parse,
  };
});
