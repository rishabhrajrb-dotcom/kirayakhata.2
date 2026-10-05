// Invoice rendering: HTML preview + jsPDF output from the SAME document object so they match.
// inv = { doc, snapshot, number, draftNumber, status, demo }
// PDFs use built-in Helvetica/Times and "Rs." (the core fonts have no rupee glyph). English only.
import { formatINR } from '/shared/money.js';
import { amountInWords } from '/shared/words.js';
import { formatDate } from '/shared/dates.js';
import { STATES } from '/shared/compliance-config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (p) => formatINR(p, { symbol: '' });

export function invoiceLabel(inv) {
  return inv.number || inv.draftNumber || 'DRAFT';
}

function isDraft(inv) { return inv.status !== 'issued' || inv.demo; }

function taxColumn(line) {
  const t = line.tax;
  if (t.treatment === 'REVERSE_CHARGE') return 'RCM';
  if (t.treatment === 'EXEMPT') return 'Exempt';
  if (t.treatment === 'NO_GST_UNREGISTERED') return '—';
  if (t.treatment === 'UNDETERMINED') return 'Review';
  return `${t.rateBp / 100}%`;
}

export function renderInvoiceHTML(inv) {
  const { doc, snapshot } = inv;
  const s = snapshot.supplier; const t = snapshot.tenant; const p = snapshot.property;
  const tpl = snapshot.templateId || 'classic';
  const sameAddr = (t.billingAddress || '').trim() === (p.address || '').trim();
  const lines = doc.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}${l.prorated ? `<br><small>${l.days}/${l.periodDays} days</small>` : ''}<br><small>${esc(formatDate(l.from))} – ${esc(formatDate(l.to))}</small></td><td>${esc(l.tax.sac || '')}</td><td class="r">${money(l.amountPaise)}</td><td class="r">${taxColumn(l)}</td></tr>`).join('');
  const taxRows = doc.taxSummary.filter((x) => x.treatment === 'FORWARD_CHARGE').map((x) => `<div><span>${esc(x.name)} @ ${x.bp / 100}% (SAC ${esc(x.sac)})</span><span>${money(x.amountPaise)}</span></div>`).join('');
  const rcm = doc.tenantRcmPaise ? `<div class="rcm-note">Tax payable on reverse charge: <b>Yes</b> — GST of Rs. ${money(doc.tenantRcmPaise)} is payable by the recipient and is not included in the amount due.</div>` : '';
  const head = tpl === 'letterhead'
    ? `<div class="band"><div><div class="org">${esc(s.legalName)}</div><div class="org-sub">${esc(s.address)}</div></div><div style="text-align:right">${s.gstin ? `GSTIN ${esc(s.gstin)}` : 'Not GST-registered'}</div></div>` : '';
  return `<div class="inv tpl-${esc(tpl)}" role="img" aria-label="${esc(doc.title)} preview, total Rs. ${money(doc.totalPaise)}">
    ${isDraft(inv) ? '<div class="watermark" aria-hidden="true">DRAFT</div>' : ''}
    ${head}
    <div class="inv-head">
      <div>
        ${tpl !== 'letterhead' ? `<div style="font-weight:600">${esc(s.legalName)}</div><div class="muted">${esc(s.address)}</div><div>${s.gstin ? `GSTIN ${esc(s.gstin)}` : 'Not GST-registered'} · ${esc(STATES[s.stateCode] || '')} (${esc(s.stateCode)})</div>` : ''}
        <div class="inv-title" style="margin-top:6px">${esc(doc.documentTitle.split(' (')[0])}</div>
        <div class="inv-sub">${esc(doc.title)}</div>
        ${doc.documentTitle.includes('(') ? `<div class="doc-type">${esc(doc.documentTitle.slice(doc.documentTitle.indexOf('(')))}</div>` : ''}
      </div>
      <div class="meta">
        <span>No. <b>${esc(invoiceLabel(inv))}</b></span>
        <span>Date <b>${esc(formatDate(doc.invoiceDate))}</b></span>
        <span>Due <b>${esc(formatDate(doc.dueDate))}</b></span>
        <span>Period <b>${esc(formatDate(doc.servicePeriod.from))} – ${esc(formatDate(doc.servicePeriod.to))}</b></span>
        ${snapshot.agreement?.poNumber ? `<span>PO ${esc(snapshot.agreement.poNumber)}</span>` : ''}
      </div>
    </div>
    <div class="parties">
      <div><div class="lbl">Bill to</div><b>${esc(t.legalName)}</b><div>${esc(t.billingAddress)}</div><div>${t.gstin ? `GSTIN ${esc(t.gstin)}` : 'Unregistered'} · State ${esc(t.stateCode)}</div></div>
      <div><div class="lbl">Property / service location</div><b>${esc(p.name)}${p.unitLabel ? ' · ' + esc(p.unitLabel) : ''}</b><div>${sameAddr ? 'Same as billing address' : esc(p.address)}</div><div>Place of supply: ${esc(STATES[p.stateCode] || '')} (${esc(p.stateCode)})</div></div>
    </div>
    <table><thead><tr><th>#</th><th>Description</th><th>SAC</th><th class="r">Taxable (Rs.)</th><th class="r">Tax</th></tr></thead><tbody>${lines}</tbody></table>
    <div class="totals">
      <div><span>Taxable value</span><span>${money(doc.taxablePaise)}</span></div>
      ${taxRows}
      <div class="grand"><span>Amount due</span><span>Rs. ${money(doc.totalPaise)}</span></div>
    </div>
    ${rcm}
    ${doc.notes ? `<div class="words"><b>Terms:</b> ${esc(doc.notes)}</div>` : ''}
    <div class="words"><b>Amount in words:</b> ${esc(amountInWords(doc.totalPaise))}${doc.landlordTaxPaise ? `<br><b>Tax in words:</b> ${esc(amountInWords(doc.landlordTaxPaise))}` : ''}</div>
    <div class="foot">
      <div>${s.bank ? `<div class="lbl">Payment details</div>${esc(s.bank.holder)} · ${esc(s.bank.bankName)}<br>A/c ${esc(s.bank.account)} · IFSC ${esc(s.bank.ifsc)}${s.bank.upi ? ` · UPI ${esc(s.bank.upi)}` : ''}` : ''}${doc.tds && doc.tds.amountPaise ? `<div style="margin-top:4px">Expected TDS (${esc(doc.tds.section)}): Rs. ${money(doc.tds.amountPaise)} — settlement note, not a discount.</div>` : ''}</div>
      <div class="sign">For ${esc(s.legalName)}<div class="line">Authorised signatory${s.signatoryName ? ` · ${esc(s.signatoryName)}` : ''}</div></div>
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

const C = { ink: [30, 36, 51], muted: [74, 81, 99], soft: [107, 114, 134], ledger: [142, 27, 27], marigold: [224, 161, 0], rule: [228, 231, 238], band: [59, 30, 46], paper2: [244, 239, 230], warn: [255, 243, 214] };

export function invoicePDF(inv) {
  const JsPDF = getJsPDF();
  const pdf = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
  const { doc, snapshot } = inv;
  const s = snapshot.supplier; const t = snapshot.tenant; const p = snapshot.property;
  const tpl = snapshot.templateId || 'classic';
  const W = 210; const M = 16; const CW = W - 2 * M; const H = 297;
  let y = M;
  const set = (size, style = 'normal', color = C.ink, font = 'helvetica') => { pdf.setFont(font, style); pdf.setFontSize(size); pdf.setTextColor(...color); };
  const text = (str, x, yy, opts) => pdf.text(String(str ?? ''), x, yy, opts);
  const wrap = (str, w) => pdf.splitTextToSize(String(str ?? ''), w);
  const hr = (yy, color = C.rule, wdt = 0.3) => { pdf.setDrawColor(...color); pdf.setLineWidth(wdt); pdf.line(M, yy, W - M, yy); };
  const draft = isDraft(inv);

  const watermark = () => {
    if (!draft) return;
    pdf.saveGraphicsState();
    pdf.setGState(new pdf.GState({ opacity: 0.08 }));
    set(70, 'bold', C.ledger);
    text('DRAFT / DEMO', W / 2, H / 2, { align: 'center', angle: 30 });
    pdf.restoreGraphicsState();
  };
  const footer = () => {
    set(7.5, 'normal', C.soft);
    text('Prepared with KirayaKhata — verify before filing.', M, H - 9);
    text(`Rules ${doc.rulesetVersion}${draft ? ' · DRAFT / DEMO' : ''}`, W - M, H - 9, { align: 'right' });
  };

  watermark();
  // Header
  if (tpl === 'letterhead') {
    pdf.setFillColor(...C.band); pdf.rect(0, 0, W, 34, 'F');
    set(15, 'bold', [255, 255, 255]); text(s.legalName, M, 14);
    set(8.5, 'normal', [235, 225, 232]); wrap(s.address, 110).forEach((l, i) => text(l, M, 20 + i * 4));
    text(s.gstin ? `GSTIN ${s.gstin}` : 'Not GST-registered', W - M, 14, { align: 'right' });
    y = 44;
  } else {
    if (tpl === 'modern') { pdf.setFillColor(...C.marigold); pdf.rect(M, 10, 22, 1.6, 'F'); y = 18; }
    set(10, 'bold'); text(s.legalName, M, y);
    set(8.5, 'normal', C.muted); const a = wrap(s.address, 100); a.forEach((l, i) => text(l, M, y + 4.5 + i * 4));
    text(`${s.gstin ? `GSTIN ${s.gstin}` : 'Not GST-registered'} · ${STATES[s.stateCode] || ''} (${s.stateCode})`, M, y + 4.5 + a.length * 4);
    y += 10 + a.length * 4;
  }
  const titleMain = doc.documentTitle.split(' (')[0];
  if (tpl === 'classic') set(22, 'normal', C.ink, 'times'); else set(18, 'bold');
  text(titleMain, M, y + 6);
  set(11, 'bold', tpl === 'modern' ? C.ink : C.ledger); text(doc.title, M, y + 12);
  let yy = y + 12;
  if (doc.documentTitle.includes('(')) { set(8, 'normal', C.muted); wrap(doc.documentTitle.slice(doc.documentTitle.indexOf('(')), 100).forEach((l) => { yy += 4; text(l, M, yy); }); }
  // Meta block (right)
  const meta = [['No.', invoiceLabel(inv)], ['Date', formatDate(doc.invoiceDate)], ['Due', formatDate(doc.dueDate)], ['Period', `${formatDate(doc.servicePeriod.from)} – ${formatDate(doc.servicePeriod.to)}`]];
  if (snapshot.agreement?.poNumber) meta.push(['PO', snapshot.agreement.poNumber]);
  meta.forEach(([k, v], i) => { set(8.5, 'normal', C.muted); text(k, W - M - 62, y + 1 + i * 5); set(8.5, 'bold'); text(v, W - M, y + 1 + i * 5, { align: 'right' }); });
  y = Math.max(yy, y + meta.length * 5) + 5;
  hr(y, tpl === 'classic' ? C.ledger : C.rule, tpl === 'classic' ? 0.7 : 0.3);
  y += 7;
  // Parties
  const colW = CW / 2 - 6;
  const sameAddr = (t.billingAddress || '').trim() === (p.address || '').trim();
  set(7, 'bold', C.soft); text('BILL TO', M, y); text('PROPERTY / SERVICE LOCATION', M + CW / 2 + 6, y);
  set(9.5, 'bold'); const tn = wrap(t.legalName, colW); const pn = wrap(`${p.name}${p.unitLabel ? ' · ' + p.unitLabel : ''}`, colW);
  tn.forEach((l, i) => text(l, M, y + 5 + i * 4.5)); pn.forEach((l, i) => text(l, M + CW / 2 + 6, y + 5 + i * 4.5));
  set(8.5, 'normal', C.muted);
  const tl = [...wrap(t.billingAddress, colW), `${t.gstin ? 'GSTIN ' + t.gstin : 'Unregistered'} · State ${t.stateCode}`];
  const pl = [...(sameAddr ? ['Same as billing address'] : wrap(p.address, colW)), `Place of supply: ${STATES[p.stateCode] || ''} (${p.stateCode})`];
  tl.forEach((l, i) => text(l, M, y + 5 + tn.length * 4.5 + i * 4)); pl.forEach((l, i) => text(l, M + CW / 2 + 6, y + 5 + pn.length * 4.5 + i * 4));
  y += 8 + Math.max(tn.length * 4.5 + tl.length * 4, pn.length * 4.5 + pl.length * 4);
  // Table
  const cols = [{ k: '#', x: M, w: 8 }, { k: 'Description', x: M + 8, w: 86 }, { k: 'SAC', x: M + 96, w: 20 }, { k: 'Taxable (Rs.)', x: M + 118, w: 32, r: true }, { k: 'Tax', x: M + 152, w: CW - 152, r: true }];
  const tableHead = () => {
    if (tpl === 'classic') { hr(y - 4, C.ink, 0.4); hr(y + 2, C.ink, 0.4); } else if (tpl === 'modern') hr(y + 2, C.ink, 0.4);
    else { pdf.setFillColor(243, 236, 239); pdf.rect(M, y - 4.5, CW, 7, 'F'); }
    set(8, 'bold', tpl === 'modern' ? C.soft : C.ink);
    cols.forEach((c) => text(tpl === 'modern' ? c.k.toUpperCase() : c.k, c.r ? c.x + c.w : c.x + 1, y, c.r ? { align: 'right' } : undefined));
    y += 7;
  };
  tableHead();
  doc.lines.forEach((l, i) => {
    const desc = [...wrap(l.description, cols[1].w - 2), `${formatDate(l.from)} – ${formatDate(l.to)}${l.prorated ? ` (${l.days}/${l.periodDays} days)` : ''}`];
    const h = desc.length * 4 + 3;
    if (y + h > H - 70) { footer(); pdf.addPage(); watermark(); y = M + 6; tableHead(); }
    set(8.5, 'normal'); text(String(i + 1), cols[0].x + 1, y);
    desc.forEach((d, j) => { set(j === desc.length - 1 ? 7.5 : 8.5, 'normal', j === desc.length - 1 ? C.soft : C.ink); text(d, cols[1].x + 1, y + j * 4); });
    set(8.5); text(l.tax.sac || '', cols[2].x + 1, y);
    text(money(l.amountPaise), cols[3].x + cols[3].w, y, { align: 'right' });
    text(taxColumn(l), cols[4].x + cols[4].w, y, { align: 'right' });
    y += h; hr(y - 3);
  });
  // Totals + tax summary kept together with words, payment and signature
  const fwd = doc.taxSummary.filter((x) => x.treatment === 'FORWARD_CHARGE');
  const blockH = 18 + fwd.length * 5 + (doc.tenantRcmPaise ? 12 : 0) + 18 + 34;
  if (y + blockH > H - 16) { footer(); pdf.addPage(); watermark(); y = M + 6; }
  y += 3;
  const tx = M + CW * 0.45;
  set(9, 'normal', C.muted); text('Taxable value', tx, y); set(9, 'normal'); text(money(doc.taxablePaise), W - M, y, { align: 'right' });
  fwd.forEach((x) => { y += 5; set(9, 'normal', C.muted); text(`${x.name} @ ${x.bp / 100}% (SAC ${x.sac})`, tx, y); set(9); text(money(x.amountPaise), W - M, y, { align: 'right' }); });
  y += 4; pdf.setDrawColor(...C.ink); pdf.setLineWidth(0.6); pdf.line(tx, y, W - M, y); y += 6;
  set(11.5, 'bold'); text('Amount due', tx, y); text(`Rs. ${money(doc.totalPaise)}`, W - M, y, { align: 'right' });
  y += 8;
  if (doc.tenantRcmPaise) {
    pdf.setFillColor(...C.warn); pdf.rect(M, y - 4, CW, 10, 'F');
    set(8.5, 'normal'); text(`Tax payable on reverse charge: Yes — GST of Rs. ${money(doc.tenantRcmPaise)} is payable by the recipient, not included above.`, M + 2, y + 2);
    y += 12;
  }
  set(8.5, 'bold'); text('Amount in words:', M, y); set(8.5, 'normal'); wrap(amountInWords(doc.totalPaise), CW - 30).forEach((l, i) => text(l, M + 28, y + i * 4));
  y += 5;
  if (doc.landlordTaxPaise) { set(8.5, 'bold'); text('Tax in words:', M, y); set(8.5, 'normal'); text(amountInWords(doc.landlordTaxPaise), M + 28, y); y += 5; }
  if (doc.notes) { set(8, 'bold'); text('Terms:', M, y); set(8, 'normal', C.muted); const nl = wrap(doc.notes, CW - 30).slice(0, 4); nl.forEach((l, i) => text(l, M + 28, y + i * 3.8)); y += nl.length * 3.8 + 1; }
  y += 4; hr(y); y += 6;
  if (s.bank) {
    set(7, 'bold', C.soft); text('PAYMENT DETAILS', M, y);
    set(8.5, 'normal'); text(`${s.bank.holder} · ${s.bank.bankName}`, M, y + 5); text(`A/c ${s.bank.account} · IFSC ${s.bank.ifsc}${s.bank.upi ? ` · UPI ${s.bank.upi}` : ''}`, M, y + 9.5);
  }
  if (doc.tds && doc.tds.amountPaise) { set(7.5, 'normal', C.muted); wrap(`Expected TDS (${doc.tds.section}): Rs. ${money(doc.tds.amountPaise)} — settlement note, not a discount.`, CW / 2 + 10).forEach((l, i) => text(l, M, y + 15 + i * 3.6)); }
  set(8.5, 'normal'); text(`For ${s.legalName}`, W - M, y + 2, { align: 'right' });
  pdf.setDrawColor(...C.soft); pdf.setLineWidth(0.3); pdf.line(W - M - 60, y + 20, W - M, y + 20);
  set(8, 'normal', C.muted); text(`Authorised signatory${s.signatoryName ? ' · ' + s.signatoryName : ''}`, W - M, y + 24, { align: 'right' });
  footer();
  const pages = pdf.getNumberOfPages();
  if (pages > 1) for (let i = 1; i <= pages; i++) { pdf.setPage(i); set(7.5, 'normal', C.soft); text(`Page ${i} of ${pages}`, W / 2, H - 9, { align: 'center' }); }
  return pdf;
}

export function invoiceFileName(inv) {
  return `${invoiceLabel(inv).replace(/[^A-Za-z0-9-]+/g, '-')}_${inv.doc.category}_${inv.doc.period}.pdf`;
}

export function pdfBytes(inv) {
  return new Uint8Array(invoicePDF(inv).output('arraybuffer'));
}

export function downloadBlob(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
