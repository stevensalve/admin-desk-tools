/* SOP & Checklist Builder - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el, safeFileName } = OT;
  const $ = (id) => document.getElementById(id);
  let doc = SopCore.create();
  let parsing = false;

  function read() {
    const r = SopCore.parseSteps($('steps').value);
    setStatus($('step-status'), r.errors.join(' '), r.errors.length ? 'warn' : '');
    doc.title = $('title').value.trim();
    doc.docNo = $('docno').value.trim();
    doc.version = $('version').value.trim() || '1.0';
    doc.owner = $('owner').value.trim();
    doc.department = $('dept').value.trim();
    doc.effective = $('eff').value;
    doc.reviewMonths = Number($('review').value) || 0;
    doc.style = $('style').value;
    doc.purpose = $('purpose').value.trim();
    doc.scope = $('scope').value.trim();
    doc.approvals = $('approvals')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
    doc.steps = r.steps;
  }

  function write() {
    $('title').value = doc.title;
    $('docno').value = doc.docNo;
    $('version').value = doc.version;
    $('owner').value = doc.owner;
    $('dept').value = doc.department;
    $('eff').value = doc.effective;
    $('review').value = doc.reviewMonths;
    $('style').value = doc.style;
    $('purpose').value = doc.purpose;
    $('scope').value = doc.scope;
    $('approvals').value = doc.approvals.join(', ');
    $('steps').value = SopCore.stepsToText(doc.steps);
  }

  function render() {
    if (parsing) return;
    read();
    const probs = SopCore.validate(doc);
    const ul = $('problems');
    ul.textContent = '';
    probs.forEach((p) => ul.appendChild(el('li', { text: p })));
    const rv = SopCore.reviewDate(doc);
    $('summary').textContent =
      doc.steps.length +
      ' steps' +
      (SopCore.totalMinutes(doc) ? ', about ' + SopCore.duration(SopCore.totalMinutes(doc)) : '') +
      (rv ? '. Next review ' + OT.formatDate(rv, 'dmy') + '.' : '.');
    const t = $('t-steps');
    t.textContent = '';
    if (!doc.steps.length) return;
    const body = el('tbody');
    doc.steps.forEach((s, i) => {
      const mv = (dir, label) => {
        const b = el('button', { type: 'button', text: label, 'aria-label': (dir < 0 ? 'Move up step ' : 'Move down step ') + (i + 1) });
        b.addEventListener('click', () => {
          doc = SopCore.moveStep(doc, i, dir);
          $('steps').value = SopCore.stepsToText(doc.steps);
          render();
        });
        return b;
      };
      body.appendChild(
        el('tr', {}, [
          el('td', { text: String(i + 1) }),
          el('td', { text: s.text }),
          el('td', { text: s.owner }),
          el('td', { text: s.minutes ? s.minutes + ' min' : '' }),
          el('td', {}, [mv(-1, 'Up'), mv(1, 'Down')]),
        ]),
      );
    });
    t.appendChild(body);
  }

  ['title', 'docno', 'version', 'owner', 'dept', 'eff', 'review', 'style', 'purpose', 'scope', 'approvals', 'steps'].forEach((id) =>
    $(id).addEventListener('input', render),
  );
  $('demo').addEventListener('click', () => {
    doc = SopCore.sample();
    write();
    render();
  });
  $('pdf').addEventListener('click', async () => {
    read();
    const probs = SopCore.validate(doc);
    if (probs.length) return setStatus($('out-status'), probs.join(' '), 'error');
    try {
      const bytes = await SopCore.buildPdf(PDFLib, doc, { checkboxes: $('boxes').checked, company: $('company').value.trim() });
      downloadBlob(bytes, safeFileName((doc.docNo ? doc.docNo + '-' : '') + doc.title) + '.pdf', 'application/pdf');
      setStatus($('out-status'), 'PDF ready.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  $('csv').addEventListener('click', () => {
    read();
    downloadBlob(SopCore.toCsv(doc), 'sop-steps.csv', 'text/csv;charset=utf-8');
  });
  $('save').addEventListener('click', () => {
    read();
    downloadBlob(SopCore.serialize(doc), safeFileName(doc.title || 'sop') + '.json', 'application/json');
  });
  $('open-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      parsing = true;
      doc = SopCore.parse(await readText(f));
      write();
      parsing = false;
      render();
      setStatus($('out-status'), 'Opened "' + doc.title + '".', 'ok');
    } catch (e) {
      parsing = false;
      setStatus($('out-status'), e.message, 'error');
    }
  });
  render();
})();
