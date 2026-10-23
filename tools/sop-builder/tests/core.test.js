'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sop = require('../js/core.js');

test('parseSteps: columns, numbering stripped, errors, blank lines', () => {
  const r = sop.parseSteps('1. Open the gate | Guard | 5 | before 8am\n\n- Check lights|Guard\n* Lock up | | abc\n| Guard | 2');
  assert.equal(r.steps.length, 3);
  assert.deepEqual(r.steps[0], { text: 'Open the gate', owner: 'Guard', minutes: 5, notes: 'before 8am' });
  assert.equal(r.steps[1].text, 'Check lights');
  assert.equal(r.steps[2].minutes, 0);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /Line 4: minutes "abc"/);
  assert.match(r.errors[1], /Line 5 has no step text/);
  assert.deepEqual(sop.parseSteps('').steps, []);
});

test('parseSteps caps the number of steps', () => {
  const r = sop.parseSteps(Array.from({ length: 250 }, (_, i) => 'Step ' + i).join('\n'));
  assert.equal(r.steps.length, 200);
  assert.match(r.errors[0], /first 200/);
});

test('stepsToText round-trips through parseSteps', () => {
  const d = sop.sample();
  assert.deepEqual(sop.parseSteps(sop.stepsToText(d.steps)).steps, d.steps);
});

test('moveStep swaps without mutating and ignores edges', () => {
  const d = sop.sample();
  const m = sop.moveStep(d, 0, 1);
  assert.equal(m.steps[1].text, d.steps[0].text);
  assert.notEqual(d.steps[0].text, m.steps[0].text);
  assert.equal(sop.moveStep(d, 0, -1), d);
  assert.equal(sop.moveStep(d, 99, 1), d);
});

test('totals and duration text', () => {
  assert.equal(sop.totalMinutes(sop.sample()), 10);
  assert.equal(sop.duration(0), '');
  assert.equal(sop.duration(45), '45 min');
  assert.equal(sop.duration(60), '1 h');
  assert.equal(sop.duration(135), '2 h 15 min');
});

test('reviewDate adds months and clamps month ends', () => {
  const d = sop.create();
  d.effective = '2026-04-01';
  assert.equal(sop.reviewDate(d), '2027-04-01');
  d.effective = '2026-08-31';
  d.reviewMonths = 6;
  assert.equal(sop.reviewDate(d), '2027-02-28');
  d.effective = '2027-08-31';
  d.reviewMonths = 6;
  assert.equal(sop.reviewDate(d), '2028-02-29', 'leap year');
  d.reviewMonths = 0;
  assert.equal(sop.reviewDate(d), '');
  d.effective = '';
  assert.equal(sop.reviewDate(d), '');
});

test('validate', () => {
  assert.deepEqual(sop.validate(sop.sample()), []);
  const e = sop.create();
  const p = sop.validate(e);
  assert.ok(p.some((x) => /title/.test(x)) && p.some((x) => /one step/.test(x)));
  const d = sop.sample();
  d.steps.forEach((s) => (s.owner = ''));
  assert.ok(sop.validate(d).some((x) => /owner/.test(x)));
  d.effective = '2026-02-30';
  assert.ok(sop.validate(d).some((x) => /effective date/.test(x)));
  d.reviewMonths = 500;
  assert.ok(sop.validate(d).some((x) => /Review period/.test(x)));
});

test('CSV has BOM, numbering and a formula guard', () => {
  const d = sop.create();
  d.steps = sop.parseSteps('=SUM(A1) | Ann | 3 | a, "b"').steps;
  const csv = sop.toCsv(d);
  assert.ok(csv.startsWith('﻿Step,Action'));
  assert.ok(csv.indexOf("1,'=SUM(A1),Ann,3,") !== -1);
  assert.ok(csv.indexOf('"a, ""b"""') !== -1);
});

test('sanitize keeps Latin-1, converts rupee and smart quotes', () => {
  assert.equal(sop.sanitize('₹5 “ok” – café'), 'Rs.5 "ok" ? café');
});

test('serialize/parse round trip, cleaning and bad files', () => {
  const d = sop.sample();
  d.style = 'checklist';
  assert.deepEqual(sop.parse(sop.serialize(d)), d);
  const dirty = JSON.parse(sop.serialize(d));
  dirty.doc.steps[0].text = 'a|b\nc';
  dirty.doc.style = 'weird';
  dirty.doc.reviewMonths = 'x';
  const back = sop.parse(JSON.stringify(dirty));
  assert.equal(back.steps[0].text, 'a b c');
  assert.equal(back.style, 'sop');
  assert.equal(back.reviewMonths, 12);
  assert.throws(() => sop.parse('nope'), /not a saved SOP/);
  assert.throws(() => sop.parse('{"app":"x"}'), /not a saved SOP/);
});

test('buildPdf makes a multi-page document with a long procedure', async () => {
  const PDFLib = require('../vendor/pdf-lib.min.js');
  const d = sop.sample();
  d.steps = sop.parseSteps(
    Array.from({ length: 60 }, (_, i) => 'Step number ' + i + ' ' + 'word '.repeat(30) + ' | Owner | 2 | A note about this step').join(
      '\n',
    ),
  ).steps;
  const bytes = await sop.buildPdf(PDFLib, d, { checkboxes: true, company: 'Acme' });
  assert.equal(Buffer.from(bytes).slice(0, 5).toString(), '%PDF-');
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 2);
});
