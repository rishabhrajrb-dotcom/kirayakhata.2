// Invoice rendering: HTML preview + jsPDF output from the SAME document object so they match.
// Layout follows CGST Rule 46 (tax invoice) / Rule 49 (bill of supply) particulars:
// supplier + recipient name, address, state & code, GSTIN; number; date; SAC; description;
// taxable value; rate + amount per tax head; place of supply; reverse-charge statement;
// signature; copy marking (Rule 48). inv = { doc, snapshot, number, draftNumber, status, demo }
// PDFs use built-in Helvetica/Times and "Rs." (core fonts have no rupee glyph). English only.
import { formatINR } from '/shared/money.js';
import { amountInWords } from '/shared/words.js';
import { formatDate } from '/shared/dates.js';
import { STATES } from '/shared/compliance-config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (p) => formatINR(p, { symbol: '' });
const stateLine = (code) => (code ? `${STATES[code] || ''}, Code: ${code}` : '');

export function invoiceLabel(inv) { return inv.number || inv.draftNumber || 'DRAFT'; }
function isDraft(inv) { return inv.status !== 'issued' || inv.demo; }

/** Rows for the Rule 46(k)(l) tax table: one row per SAC + rate. */
export function taxRows(doc) {
  const rows = {};
  for (const l of doc.lines) {
    const t = l.tax;
    if (!t.components?.length) continue;
    const k = `${t.sac}|${t.rateBp}|${t.treatment}`;
    const r = rows[k] || (rows[k] = { sac: t.sac, treatment: t.treatment, taxable: 0, cgst: { bp: 0, amt: 0 }, sgst: { bp: 0, amt: 0, name: 'SGST' }, igst: { bp: 0, amt: 0 } });
    r.taxable += l.amountPaise;
    for (const c of t.components) {
      if (c.name === 'CGST') { r.cgst.bp = c.bp; r.cgst.amt += c.amountPaise; }
      else if (c.name === 'SGST' || c.name === 'UTGST') { r.sgst.bp = c.bp; r.sgst.amt += c.amountPaise; r.sgst.name = c.name; }
      else if (c.name === 'IGST') { r.igst.bp = c.bp; r.igst.amt += c.amountPaise; }
    }
  }
  return Object.values(rows);
}

function titles(doc) {
  const map = {
    TAX_INVOICE: ['Tax Invoice', ''],
    TAX_INVOICE_RCM: ['Tax Invoice', 'Tax payable by the recipient on reverse charge basis'],
    BILL_OF_SUPPLY: ['Bill of Supply', 'Exempt supply — no GST charged'],
    RENT_BILL: ['Rent Invoice', 'Supplier not registered under GST — not a tax invoice'],
    RENT_BILL_RCM: ['Rent Invoice', 'Supplier not registered under GST. GST is payable by the recipient under reverse charge (Notification 13/2017-CT(Rate), entry 5AB); the recipient issues a self-invoice.'],
    CREDIT_NOTE: ['Credit Note', 'Draft — review required'],
    UNDETERMINED: ['Draft', 'Tax treatment pending'],
  };
  return map[doc.documentType] || [doc.documentTitle || 'Invoice', ''];
}

const isGstDoc = (doc) => ['TAX_INVOICE', 'TAX_INVOICE_RCM', 'BILL_OF_SUPPLY'].includes(doc.documentType);
const rcmText = (doc) => (doc.documentType === 'TAX_INVOICE' || doc.documentType === 'TAX_INVOICE_RCM' ? (doc.reverseCharge ? 'Yes' : 'No') : null);

export function renderInvoiceHTML(inv, { copy = 'ORIGINAL FOR RECIPIENT' } = {}) {
  const { doc, snapshot } = inv;
  const s = snapshot.supplier; const t = snapshot.tenant; const p = snapshot.property;
  const tpl = snapshot.templateId || 'classic';
  const [title, subtitle] = titles(doc);
  const sameAddr = (t.billingAddress || '').trim() === (p.address || '').trim();
  const gst = isGstDoc(doc);
  const rcm = rcmText(doc);
  const rows = taxRows(doc);
  const lines = doc.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}<br><small>${esc(p.name)}${p.unitLabel ? ' · ' + esc(p.unitLabel) : ''} · ${esc(formatDate(l.from))} – ${esc(formatDate(l.to))}${l.prorated ? ` (${l.days}/${l.periodDays} days)` : ''}</small></td><td>${esc(l.tax.sac || '—')}</td><td class="r">${money(l.amountPaise)}</td></tr>`).join('');
  const taxTable = rows.length ? `<table class="taxtable"><thead><tr><th>SAC</th><th class="r">Taxable value</th><th class="r">CGST</th><th class="r">${esc(rows[0].sgst.name)}</th><th class="r">IGST</th><th class="r">Total tax</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.sac)}</td><td class="r">${money(r.taxable)}</td><td class="r">${r.cgst.bp ? `${r.cgst.bp / 100}%<br>${money(r.cgst.amt)}` : '—'}</td><td class="r">${r.sgst.bp ? `${r.sgst.bp / 100}%<br>${money(r.sgst.amt)}` : '—'}</td><td class="r">${r.igst.bp ? `${r.igst.bp / 100}%<br>${money(r.igst.amt)}` : '—'}</td><td class="r">${money(r.cgst.amt + r.sgst.amt + r.igst.amt)}</td></tr>`).join('')}</tbody></table>${doc.reverseCharge ? '<div class="rcm-note">Tax shown above is payable by the recipient under reverse charge and is <b>not</b> included in the amount due.</div>' : ''}` : '';
  const head = tpl === 'letterhead'
    ? `<div class="band"><div><div class="org">${esc(s.legalName)}</div>${s.tradeName ? `<div class="org-sub">${esc(s.tradeName)}</div>` : ''}<div class="org-sub">${esc(s.address)}</div></div><div style="text-align:right">${s.gstin ? `GSTIN: <b>${esc(s.gstin)}</b>` : 'Not registered under GST'}<br>${esc(stateLine(s.stateCode))}</div></div>` : '';
  return `<div class="inv tpl-${esc(tpl)}" role="img" aria-label="${esc(title)} ${esc(doc.title)}, total Rs. ${money(doc.totalPaise)}">
    ${isDraft(inv) ? '<div class="watermark" aria-hidden="true">DRAFT</div>' : ''}
    ${head}
    <div class="copy-label">${esc(copy)}</div>
    <div class="inv-head">
      <div>
        ${tpl !== 'letterhead' ? `<div style="font-weight:600;font-size:1.15em">${esc(s.legalName)}</div>${s.tradeName ? `<div>${esc(s.tradeName)}</div>` : ''}<div class="muted">${esc(s.address)}</div><div>State: ${esc(stateLine(s.stateCode))}</div><div>${s.gstin ? `GSTIN: <b>${esc(s.gstin)}</b>` : 'Not registered under GST'}</div>${s.email || s.phone ? `<div class="muted">${esc([s.email, s.phone].filter(Boolean).join(' · '))}</div>` : ''}` : ''}
        <div class="inv-title" style="margin-top:6px">${esc(title)}</div>
        <div class="inv-sub">${esc(doc.title)}</div>
        ${subtitle ? `<div class="doc-type">${esc(subtitle)}</div>` : ''}
      </div>
      <div class="meta">
        <span>Invoice no. <b>${esc(invoiceLabel(inv))}</b></span>
        <span>Date of issue <b>${esc(formatDate(doc.invoiceDate))}</b></span>
        <span>Due date <b>${esc(formatDate(doc.dueDate))}</b></span>
        <span>Service period <b>${esc(formatDate(doc.servicePeriod.from))} – ${esc(formatDate(doc.servicePeriod.to))}</b></span>
        <span>Place of supply <b>${esc(stateLine(p.stateCode))}</b></span>
        ${rcm ? `<span>Tax payable on reverse charge <b>${rcm}</b></span>` : ''}
        ${snapshot.agreement?.poNumber ? `<span>PO / ref. <b>${esc(snapshot.agreement.poNumber)}</b></span>` : ''}
      </div>
    </div>
    <div class="parties">
      <div><div class="lbl">Details of recipient (bill to)</div><b>${esc(t.legalName)}</b><div>${esc(t.billingAddress)}</div><div>State: ${esc(stateLine(t.stateCode))}</div><div>${t.gstin ? `GSTIN: <b>${esc(t.gstin)}</b>` : 'Unregistered'}</div></div>
      <div><div class="lbl">Property / service location</div><b>${esc(p.name)}${p.unitLabel ? ' · ' + esc(p.unitLabel) : ''}</b><div>${sameAddr ? 'Same as recipient address' : esc(p.address)}</div><div>State: ${esc(stateLine(p.stateCode))}</div></div>
    </div>
    <table><thead><tr><th>#</th><th>Description of service</th><th>SAC</th><th class="r">Taxable value (Rs.)</th></tr></thead><tbody>${lines}</tbody></table>
    ${taxTable}
    <div class="totals">
      <div><span>Total taxable value</span><span>${money(doc.taxablePaise)}</span></div>
      ${doc.landlordTaxPaise ? `<div><span>Total GST charged</span><span>${money(doc.landlordTaxPaise)}</span></div>` : ''}
      <div class="grand"><span>Total invoice value</span><span>Rs. ${money(doc.totalPaise)}</span></div>
    </div>
    <div class="words"><b>Amount in words:</b> ${esc(amountInWords(doc.totalPaise))}${doc.landlordTaxPaise ? `<br><b>Tax in words:</b> ${esc(amountInWords(doc.landlordTaxPaise))}` : ''}</div>
    ${doc.notes ? `<div class="words"><b>Terms:</b> ${esc(doc.notes)}</div>` : ''}
    <div class="foot">
      <div>${s.bank ? `<div class="lbl">Bank details</div>${esc(s.bank.holder)} · ${esc(s.bank.bankName)}<br>A/c ${esc(s.bank.account)} · IFSC ${esc(s.bank.ifsc)}${s.bank.upi ? ` · UPI ${esc(s.bank.upi)}` : ''}` : ''}${doc.tds && doc.tds.amountPaise ? `<div style="margin-top:4px">Expected TDS (${esc(doc.tds.section)}): Rs. ${money(doc.tds.amountPaise)} — deducted by tenant; not a discount.</div>` : ''}</div>
      <div class="sign">${gst ? '<div style="font-size:.9em">Certified that the particulars given above are true and correct.</div>' : ''}For ${esc(s.legalName)}<div class="line">Authorised signatory${s.signatoryName ? ` · ${esc(s.signatoryName)}${s.signatoryDesignation ? `, ${esc(s.signatoryDesignation)}` : ''}` : ''}</div></div>
    </div>
    <div class="prepared"><span>Prepared with KirayaKhata — verify before filing.</span><span>Rules ${esc(doc.rulesetVersion)}${isDraft(inv) ? ' · DRAFT / DEMO' : ''}</span></div>
  </div>`;
}

// ---------------- PDF ----------------
function getJsPDF() {
  const j = window.jspdf && window.jspdf.jsPDF;
  if (!j) throw new Error('PDF library not loaded');
  return j;
}
const C = { ink: [30, 36, 51], muted: [74, 81, 99], soft: [107, 114, 134], ledger: [142, 27, 27], marigold: [224, 161, 0], rule: [228, 231, 238], band: [59, 30, 46], warn: [255, 243, 214], head: [243, 236, 239] };

export function invoicePDF(inv, { copy = 'ORIGINAL FOR RECIPIENT' } = {}) {
  const JsPDF = getJsPDF();
  const pdf = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
  const { doc, snapshot } = inv;
  const s = snapshot.supplier; const t = snapshot.tenant; const p = snapshot.property;
  const tpl = snapshot.templateId || 'classic';
  const [title, subtitle] = titles(doc);
  const W = 210; const M = 14; const CW = W - 2 * M; const H = 297;
  let y = M;
  const set = (size, style = 'normal', color = C.ink, font = 'helvetica') => { pdf.setFont(font, style); pdf.setFontSize(size); pdf.setTextColor(...color); };
  const text = (str, x, yy, opts) => pdf.text(String(str ?? ''), x, yy, opts);
  const wrap = (str, w) => pdf.splitTextToSize(String(str ?? ''), w);
  const hr = (yy, color = C.rule, wdt = 0.3) => { pdf.setDrawColor(...color); pdf.setLineWidth(wdt); pdf.line(M, yy, W - M, yy); };
  const draft = isDraft(inv);
  const gst = isGstDoc(doc);
  const rcm = rcmText(doc);
  const watermark = () => {
    if (!draft) return;
    pdf.saveGraphicsState(); pdf.setGState(new pdf.GState({ opacity: 0.08 }));
    set(70, 'bold', C.ledger); text('DRAFT / DEMO', W / 2, H / 2, { align: 'center', angle: 30 });
    pdf.restoreGraphicsState();
  };
  const footer = () => { set(7, 'normal', C.soft); text('Prepared with KirayaKhata — verify before filing.', M, H - 8); text(`Rules ${doc.rulesetVersion}${draft ? ' · DRAFT / DEMO' : ''}`, W - M, H - 8, { align: 'right' }); };
  const newPageIfNeeded = (need) => { if (y + need > H - 16) { footer(); pdf.addPage(); watermark(); y = M + 4; } };

  watermark();
  // Header band / supplier block
  if (tpl === 'letterhead') {
    pdf.setFillColor(...C.band); pdf.rect(0, 0, W, 32, 'F');
    set(14, 'bold', [255, 255, 255]); text(s.legalName, M, 12);
    set(8, 'normal', [235, 225, 232]);
    const sa = [...(s.tradeName ? [s.tradeName] : []), ...wrap(s.address, 105)];
    sa.slice(0, 3).forEach((l, i) => text(l, M, 17 + i * 4));
    text(s.gstin ? `GSTIN: ${s.gstin}` : 'Not registered under GST', W - M, 12, { align: 'right' });
    text(`State: ${stateLine(s.stateCode)}`, W - M, 17, { align: 'right' });
    y = 38;
  } else {
    if (tpl === 'modern') { pdf.setFillColor(...C.marigold); pdf.rect(M, 9, 22, 1.4, 'F'); y = 16; }
    set(11, 'bold'); text(s.legalName, M, y);
    set(8, 'normal', C.muted);
    const sa = [...(s.tradeName ? [s.tradeName] : []), ...wrap(s.address, 105), `State: ${stateLine(s.stateCode)}`, s.gstin ? `GSTIN: ${s.gstin}` : 'Not registered under GST', [s.email, s.phone].filter(Boolean).join(' · ')].filter(Boolean);
    sa.forEach((l, i) => { if (l.startsWith('GSTIN')) set(8.5, 'bold', C.ink); else set(8, 'normal', C.muted); text(l, M, y + 4.5 + i * 3.9); });
    y += 6 + sa.length * 3.9;
  }
  set(7, 'bold', C.ledger); text(copy, W - M, tpl === 'letterhead' ? 36 : 10, { align: 'right' });
  // Title
  if (tpl === 'classic') set(20, 'normal', C.ink, 'times'); else set(16, 'bold');
  text(title, M, y + 5);
  set(10, 'bold', tpl === 'modern' ? C.ink : C.ledger); text(doc.title, M, y + 10.5);
  let ty = y + 10.5;
  if (subtitle) { set(7.5, 'normal', C.muted); wrap(subtitle, 100).forEach((l) => { ty += 3.8; text(l, M, ty); }); }
  // Meta (right)
  const meta = [['Invoice no.', invoiceLabel(inv)], ['Date of issue', formatDate(doc.invoiceDate)], ['Due date', formatDate(doc.dueDate)], ['Service period', `${formatDate(doc.servicePeriod.from)} – ${formatDate(doc.servicePeriod.to)}`], ['Place of supply', stateLine(p.stateCode)]];
  if (rcm) meta.push(['Reverse charge', rcm]);
  if (snapshot.agreement?.poNumber) meta.push(['PO / ref.', snapshot.agreement.poNumber]);
  meta.forEach(([k, v], i) => { set(8, 'normal', C.muted); text(k, W - M - 72, y + 1 + i * 4.6); set(8, 'bold'); text(v, W - M, y + 1 + i * 4.6, { align: 'right' }); });
  y = Math.max(ty, y + meta.length * 4.6) + 4;
  hr(y, tpl === 'classic' ? C.ledger : C.rule, tpl === 'classic' ? 0.6 : 0.3); y += 5;
  // Parties
  const colW = CW / 2 - 5;
  const sameAddr = (t.billingAddress || '').trim() === (p.address || '').trim();
  set(6.8, 'bold', C.soft); text('DETAILS OF RECIPIENT (BILL TO)', M, y); text('PROPERTY / SERVICE LOCATION', M + CW / 2 + 5, y);
  const left = [[t.legalName, true], ...wrap(t.billingAddress, colW).map((l) => [l]), [`State: ${stateLine(t.stateCode)}`], [t.gstin ? `GSTIN: ${t.gstin}` : 'Unregistered', !!t.gstin]];
  const right = [[`${p.name}${p.unitLabel ? ' · ' + p.unitLabel : ''}`, true], ...(sameAddr ? [['Same as recipient address']] : wrap(p.address, colW).map((l) => [l])), [`State: ${stateLine(p.stateCode)}`]];
  left.forEach(([l, b], i) => { set(8.3, b ? 'bold' : 'normal', b ? C.ink : C.muted); text(l, M, y + 4.5 + i * 3.9); });
  right.forEach(([l, b], i) => { set(8.3, b ? 'bold' : 'normal', b ? C.ink : C.muted); text(l, M + CW / 2 + 5, y + 4.5 + i * 3.9); });
  y += 7 + Math.max(left.length, right.length) * 3.9;
  // Line items
  const tableHead = () => {
    pdf.setFillColor(...C.head); pdf.rect(M, y - 4, CW, 6.5, 'F');
    set(7.6, 'bold'); text('#', M + 1, y); text('Description of service', M + 8, y); text('SAC', M + 118, y); text('Taxable value (Rs.)', W - M - 1, y, { align: 'right' });
    y += 6;
  };
  tableHead();
  doc.lines.forEach((l, i) => {
    const desc = [...wrap(l.description, 104), `${p.name}${p.unitLabel ? ' · ' + p.unitLabel : ''} · ${formatDate(l.from)} – ${formatDate(l.to)}${l.prorated ? ` (${l.days}/${l.periodDays} days)` : ''}`];
    const h = desc.length * 3.8 + 2.5;
    if (y + h > H - 80) { footer(); pdf.addPage(); watermark(); y = M + 6; tableHead(); }
    set(8.3); text(String(i + 1), M + 1, y);
    desc.forEach((d, j) => { set(j === desc.length - 1 ? 7.2 : 8.3, 'normal', j === desc.length - 1 ? C.soft : C.ink); text(d, M + 8, y + j * 3.8); });
    set(8.3); text(l.tax.sac || '—', M + 118, y); text(money(l.amountPaise), W - M - 1, y, { align: 'right' });
    y += h; hr(y - 2.5);
  });
  // Tax table (Rule 46(k)(l))
  const rows = taxRows(doc);
  if (rows.length) {
    newPageIfNeeded(14 + rows.length * 8);
    y += 3;
    const cols = [['SAC', M + 1, 'left'], ['Taxable value', M + 52, 'right'], ['CGST rate', M + 70, 'right'], ['CGST amt', M + 94, 'right'], [`${rows[0].sgst.name} rate`, M + 114, 'right'], [`${rows[0].sgst.name} amt`, M + 138, 'right'], ['IGST', M + 158, 'right'], ['Total tax', W - M - 1, 'right']];
    pdf.setFillColor(...C.head); pdf.rect(M, y - 4, CW, 6.5, 'F');
    set(7.2, 'bold'); cols.forEach(([k, x, a]) => text(k, x, y, a === 'right' ? { align: 'right' } : undefined));
    y += 5.5;
    for (const r of rows) {
      set(7.8, 'normal');
      const vals = [r.sac, money(r.taxable), r.cgst.bp ? `${r.cgst.bp / 100}%` : '—', r.cgst.bp ? money(r.cgst.amt) : '—', r.sgst.bp ? `${r.sgst.bp / 100}%` : '—', r.sgst.bp ? money(r.sgst.amt) : '—', r.igst.bp ? `${r.igst.bp / 100}% ${money(r.igst.amt)}` : '—', money(r.cgst.amt + r.sgst.amt + r.igst.amt)];
      cols.forEach(([, x, a], i) => text(vals[i], x, y, a === 'right' ? { align: 'right' } : undefined));
      y += 4.6; hr(y - 2.6);
    }
    if (doc.reverseCharge) { pdf.setFillColor(...C.warn); pdf.rect(M, y - 1, CW, 7, 'F'); set(7.8); text('Tax shown above is payable by the recipient under reverse charge and is NOT included in the amount due.', M + 2, y + 3.5); y += 8; }
  }
  // Totals + words + bank + signature kept together
  newPageIfNeeded(70);
  y += 3;
  const tx = M + CW * 0.48;
  set(8.6, 'normal', C.muted); text('Total taxable value', tx, y); set(8.6); text(money(doc.taxablePaise), W - M, y, { align: 'right' });
  if (doc.landlordTaxPaise) { y += 5; set(8.6, 'normal', C.muted); text('Total GST charged', tx, y); set(8.6); text(money(doc.landlordTaxPaise), W - M, y, { align: 'right' }); }
  y += 3.5; pdf.setDrawColor(...C.ink); pdf.setLineWidth(0.6); pdf.line(tx, y, W - M, y); y += 5.5;
  set(11, 'bold'); text('Total invoice value', tx, y); text(`Rs. ${money(doc.totalPaise)}`, W - M, y, { align: 'right' });
  y += 7;
  set(8.2, 'bold'); text('Amount in words:', M, y); set(8.2); wrap(amountInWords(doc.totalPaise), CW - 30).forEach((l, i) => text(l, M + 27, y + i * 3.8));
  y += 4.8;
  if (doc.landlordTaxPaise) { set(8.2, 'bold'); text('Tax in words:', M, y); set(8.2); text(amountInWords(doc.landlordTaxPaise), M + 27, y); y += 4.8; }
  if (doc.notes) { set(8, 'bold'); text('Terms:', M, y); set(8, 'normal', C.muted); const nl = wrap(doc.notes, CW - 30).slice(0, 4); nl.forEach((l, i) => text(l, M + 27, y + i * 3.7)); y += nl.length * 3.7 + 1; }
  y += 3; hr(y); y += 5;
  if (s.bank) {
    set(6.8, 'bold', C.soft); text('BANK DETAILS', M, y);
    set(8.2); text(`${s.bank.holder} · ${s.bank.bankName}`, M, y + 4.5); text(`A/c ${s.bank.account} · IFSC ${s.bank.ifsc}${s.bank.upi ? ` · UPI ${s.bank.upi}` : ''}`, M, y + 8.6);
  }
  if (doc.tds && doc.tds.amountPaise) { set(7.2, 'normal', C.muted); wrap(`Expected TDS (${doc.tds.section}): Rs. ${money(doc.tds.amountPaise)} — deducted by tenant; not a discount.`, CW / 2 + 6).forEach((l, i) => text(l, M, y + 13.5 + i * 3.5)); }
  if (gst) { set(7.4, 'normal', C.muted); text('Certified that the particulars given above are true and correct.', W - M, y, { align: 'right' }); }
  set(8.2, 'normal'); text(`For ${s.legalName}`, W - M, y + 5, { align: 'right' });
  pdf.setDrawColor(...C.soft); pdf.setLineWidth(0.3); pdf.line(W - M - 62, y + 20, W - M, y + 20);
  set(7.8, 'normal', C.muted); text(`Authorised signatory${s.signatoryName ? ' · ' + s.signatoryName : ''}${s.signatoryDesignation ? ', ' + s.signatoryDesignation : ''}`, W - M, y + 24, { align: 'right' });
  footer();
  const pages = pdf.getNumberOfPages();
  if (pages > 1) for (let i = 1; i <= pages; i++) { pdf.setPage(i); set(7, 'normal', C.soft); text(`Page ${i} of ${pages}`, W / 2, H - 8, { align: 'center' }); }
  return pdf;
}

export function invoiceFileName(inv, copy) {
  return `${invoiceLabel(inv).replace(/[^A-Za-z0-9-]+/g, '-')}_${inv.doc.category}_${inv.doc.period}${copy && copy.startsWith('DUPLICATE') ? '_duplicate' : ''}.pdf`;
}
export function pdfBytes(inv, opts) { return new Uint8Array(invoicePDF(inv, opts).output('arraybuffer')); }

export function downloadBlob(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
