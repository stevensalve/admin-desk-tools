/**
 * SOP & Checklist Builder - core logic (pure).
 *
 * Doc: { title, docNo, version, owner, department, effective (ISO), reviewMonths, purpose, scope, style ('sop'|'checklist'),
 *        steps: [{ text, owner, minutes, notes }], approvals: [role names] }
 * Step lines can be typed as: step text | owner | minutes | notes
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.SopCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const MAX_STEPS = 200;

  const create = () => ({
    title: '',
    docNo: '',
    version: '1.0',
    owner: '',
    department: '',
    effective: '',
    reviewMonths: 12,
    purpose: '',
    scope: '',
    style: 'sop',
    steps: [],
    approvals: ['Prepared by', 'Reviewed by', 'Approved by'],
  });

  /** Turn typed lines into steps. Blank lines are ignored; a minutes value that is not a number is reported. */
  function parseSteps(text) {
    const steps = [];
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((line, idx) => {
        if (!line.trim()) return;
        const p = line.split('|').map(norm);
        const body = p[0].replace(/^(\d+[.)]|[-*•])\s*/, '');
        if (!body) return errors.push('Line ' + (idx + 1) + ' has no step text.');
        let minutes = 0;
        if (p[2]) {
          const n = Number(p[2]);
          if (!isFinite(n) || n < 0 || n > 10000)
            errors.push('Line ' + (idx + 1) + ': minutes "' + p[2] + '" is not a valid number; used 0.');
          else minutes = Math.round(n);
        }
        if (steps.length < MAX_STEPS)
          steps.push({ text: body.slice(0, 300), owner: (p[1] || '').slice(0, 60), minutes: minutes, notes: (p[3] || '').slice(0, 300) });
        else if (steps.length === MAX_STEPS) errors.push('Only the first ' + MAX_STEPS + ' steps are used.');
      });
    return { steps: steps, errors: errors };
  }

  const stepsToText = (steps) =>
    steps.map((s) => [s.text, s.owner, s.minutes || '', s.notes].join(' | ').replace(/( \| )+$/, '')).join('\n');

  function moveStep(doc, i, dir) {
    const j = i + dir;
    if (i < 0 || i >= doc.steps.length || j < 0 || j >= doc.steps.length) return doc;
    const d = copy(doc);
    const t = d.steps[i];
    d.steps[i] = d.steps[j];
    d.steps[j] = t;
    return d;
  }

  const totalMinutes = (doc) => doc.steps.reduce((a, s) => a + (s.minutes || 0), 0);

  function duration(min) {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return ((h ? h + ' h ' : '') + (m ? m + ' min' : '')).trim();
  }

  /** Review date = effective date + review months (month-end safe). */
  function reviewDate(doc) {
    if (!doc.effective || !doc.reviewMonths) return '';
    const d = new Date(OT.parseIsoDate(doc.effective));
    const t = d.getUTCFullYear() * 12 + d.getUTCMonth() + Number(doc.reviewMonths);
    const y = Math.floor(t / 12);
    const m = t % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last))).toISOString().slice(0, 10);
  }

  function validate(doc) {
    const p = [];
    if (!norm(doc.title)) p.push('Add a title.');
    if (!doc.steps.length) p.push('Add at least one step.');
    if (doc.effective) {
      try {
        OT.parseIsoDate(doc.effective);
      } catch (e) {
        p.push('The effective date is not a real date.');
      }
    }
    if (!Number.isInteger(Number(doc.reviewMonths)) || doc.reviewMonths < 0 || doc.reviewMonths > 120)
      p.push('Review period must be 0 to 120 months.');
    if (doc.style !== 'sop' && doc.style !== 'checklist') p.push('Choose SOP or checklist.');
    const nobody = doc.steps.filter((s) => !s.owner).length;
    if (doc.steps.length && nobody === doc.steps.length) p.push('No step has an owner. Add one so people know who does it.');
    return p;
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(doc) {
    const head = ['Step', 'Action', 'Owner', 'Minutes', 'Notes'];
    const rows = doc.steps.map((s, i) => [i + 1, s.text, s.owner, s.minutes || '', s.notes]);
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
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
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

  /** A4 SOP or checklist. With checkboxes, each step gets an empty box (always on for the checklist style). */
  async function buildPdf(PDFLib, doc, opts) {
    const o = Object.assign({ checkboxes: false, company: '' }, opts);
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    pdf.setTitle(sanitize(doc.title || 'SOP'));
    pdf.setCreator('Admin Desk Tools');
    const W = 595.28;
    const H = 841.89;
    const M = 42;
    const grey = rgb(0.45, 0.47, 0.52);
    const ink = rgb(0.1, 0.1, 0.12);
    const boxes = o.checkboxes || doc.style === 'checklist';
    let page = pdf.addPage([W, H]);
    let y = H - M;
    const text = (s, x, size, f, right) => {
      const v = sanitize(s);
      const ff = f || font;
      page.drawText(v, { x: right ? x - ff.widthOfTextAtSize(v, size) : x, y: y, size: size, font: ff, color: ink });
    };
    const need = (h) => {
      if (y < M + 20 + h) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
    };
    const para = (s, size, f, x, width, lead) => {
      wrap(f || font, s, size, width || W - 2 * M).forEach((l) => {
        need(lead || size + 3);
        text(l, x === undefined ? M : x, size, f);
        y -= lead || size + 3.5;
      });
    };
    if (o.company) {
      text(o.company, M, 10, bold);
      y -= 14;
    }
    para(doc.title || 'Untitled', 18, bold, M, W - 2 * M, 22);
    para(doc.style === 'checklist' ? 'CHECKLIST' : 'STANDARD OPERATING PROCEDURE', 9, font, M, W - 2 * M, 14);
    y -= 2;
    const meta = [
      ['Doc no.', doc.docNo],
      ['Version', doc.version],
      ['Owner', doc.owner],
      ['Department', doc.department],
      ['Effective', doc.effective ? OT.formatDate(doc.effective, 'dmy') : ''],
      ['Next review', reviewDate(doc) ? OT.formatDate(reviewDate(doc), 'dmy') : ''],
    ].filter((m) => m[1]);
    if (meta.length) {
      const cw = (W - 2 * M) / 3;
      meta.forEach((m, i) => {
        const x = M + (i % 3) * cw;
        if (i % 3 === 0 && i) y -= 26;
        const keep = y;
        text(m[0], x, 7.5, font);
        y -= 11;
        wrap(bold, m[1], 9.5, cw - 8)
          .slice(0, 1)
          .forEach((l) => text(l, x, 9.5, bold));
        y = keep;
      });
      y -= 30;
    }
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.6, color: grey });
    y -= 6;
    [
      ['Purpose', doc.purpose],
      ['Scope', doc.scope],
    ].forEach((s) => {
      if (!norm(s[1])) return;
      need(40);
      text(s[0], M, 10.5, bold);
      y -= 14;
      para(s[1], 9.5, font, M, W - 2 * M, 13);
      y -= 6;
    });
    need(60);
    text('Procedure' + (totalMinutes(doc) ? '  (about ' + duration(totalMinutes(doc)) + ')' : ''), M, 10.5, bold);
    y -= 8;
    page.drawRectangle({ x: M, y: y - 14, width: W - 2 * M, height: 16, color: rgb(0.93, 0.94, 0.96) });
    y -= 10;
    const xText = M + (boxes ? 48 : 30);
    const xOwner = W - M - 140;
    if (boxes) text('Done', M + 2, 7.5, bold);
    text('No.', boxes ? M + 24 : M + 4, 8.5, bold);
    text('Action', xText, 8.5, bold);
    text('Owner', xOwner, 8.5, bold);
    text('Time', W - M - 4, 8.5, bold, true);
    y -= 14;
    doc.steps.forEach((s, i) => {
      const lines = wrap(font, s.text, 9.5, xOwner - xText - 10);
      const nl = s.notes ? wrap(font, 'Note: ' + s.notes, 8.5, xOwner - xText - 10) : [];
      need((lines.length + nl.length) * 12 + 8);
      const top = y;
      if (boxes) page.drawRectangle({ x: M + 4, y: y - 2, width: 9, height: 9, borderColor: ink, borderWidth: 0.8 });
      text(String(i + 1), boxes ? M + 24 : M + 4, 9.5, bold);
      lines.forEach((l) => {
        text(l, xText, 9.5, font);
        y -= 12;
      });
      nl.forEach((l) => {
        page.drawText(l, { x: xText, y: y, size: 8.5, font: font, color: grey });
        y -= 11;
      });
      const after = y;
      y = top;
      wrap(font, s.owner || '', 9, 130)
        .slice(0, 2)
        .forEach((l, k) => {
          page.drawText(l, { x: xOwner, y: top - k * 11, size: 9, font: font, color: ink });
        });
      if (s.minutes) text(s.minutes + ' min', W - M - 4, 9, font, true);
      y = after - 5;
      page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.25, color: rgb(0.85, 0.86, 0.88) });
    });
    if (doc.approvals.length) {
      need(80);
      y -= 34;
      const n = Math.min(doc.approvals.length, 4);
      const cw = (W - 2 * M) / n;
      doc.approvals.slice(0, n).forEach((r, i) => {
        const x = M + i * cw;
        page.drawLine({ start: { x: x, y: y }, end: { x: x + cw - 16, y: y }, thickness: 0.5, color: grey });
        page.drawText(sanitize(r), { x: x, y: y - 11, size: 8, font: font, color: grey });
        page.drawText('Name / date:', { x: x, y: y - 23, size: 8, font: font, color: grey });
      });
    }
    pdf
      .getPages()
      .forEach((p, i, all) =>
        p.drawText(
          sanitize((doc.docNo ? doc.docNo + '  ' : '') + (doc.title || '')).slice(0, 70) + '   Page ' + (i + 1) + ' of ' + all.length,
          { x: M, y: 22, size: 7.5, font: font, color: grey },
        ),
      );
    return pdf.save();
  }

  function serialize(doc) {
    return JSON.stringify({ app: 'sop-builder', version: 1, doc: doc }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved SOP.');
    }
    const s = d && d.app === 'sop-builder' ? d.doc : null;
    if (!s || !Array.isArray(s.steps)) throw new Error('That file is not a saved SOP.');
    const doc = create();
    ['title', 'docNo', 'version', 'owner', 'department', 'purpose', 'scope'].forEach(
      (k) => (doc[k] = norm(s[k]).slice(0, k === 'purpose' || k === 'scope' ? 1000 : 120)),
    );
    doc.version = doc.version || '1.0';
    doc.effective = OT.toIsoDate(s.effective) || '';
    doc.reviewMonths = Number.isInteger(s.reviewMonths) && s.reviewMonths >= 0 && s.reviewMonths <= 120 ? s.reviewMonths : 12;
    doc.style = s.style === 'checklist' ? 'checklist' : 'sop';
    doc.steps = parseSteps(
      s.steps
        .slice(0, MAX_STEPS)
        .map((x) =>
          [x && x.text, x && x.owner, x && x.minutes, x && x.notes]
            .map((v) => String(v === undefined || v === null ? '' : v).replace(/[|\r\n]/g, ' '))
            .join('|'),
        )
        .join('\n'),
    ).steps;
    doc.approvals = Array.isArray(s.approvals)
      ? s.approvals
          .slice(0, 4)
          .map((a) => norm(a).slice(0, 40))
          .filter(Boolean)
      : doc.approvals;
    return doc;
  }

  function sample() {
    const d = create();
    d.title = 'Visitor reception and badge issue';
    d.docNo = 'ADM-SOP-001';
    d.owner = 'Admin Manager';
    d.department = 'Administration';
    d.effective = '2026-04-01';
    d.purpose = 'Make sure every visitor is identified, logged and escorted so the premises stay secure.';
    d.scope = 'All visitors to the head office, including vendors and interview candidates.';
    d.steps = parseSteps(
      [
        'Greet the visitor and ask who they are meeting | Receptionist | 1',
        'Check a government photo ID and record the last four characters | Receptionist | 2 | Do not photocopy the ID',
        'Call the host to confirm the visit | Receptionist | 2',
        'Issue a printed pass and note the check-in time | Receptionist | 1',
        'Host collects the visitor from reception | Host | 3 | Visitors must not walk in alone',
        'Collect the pass and log the check-out time | Receptionist | 1',
      ].join('\n'),
    ).steps;
    return d;
  }

  return {
    create: create,
    parseSteps: parseSteps,
    stepsToText: stepsToText,
    moveStep: moveStep,
    totalMinutes: totalMinutes,
    duration: duration,
    reviewDate: reviewDate,
    validate: validate,
    toCsv: toCsv,
    sanitize: sanitize,
    buildPdf: buildPdf,
    serialize: serialize,
    parse: parse,
    sample: sample,
  };
});
