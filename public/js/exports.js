// Year-end pack: ledger CSV, invoice/receipt index, GST-by-month, reported TDS, escalation
// history, unresolved items and missing-document checklist, plus actual invoice PDFs in a ZIP.
// Labelled honestly: organised records for review, not an income-tax return.
import { toCSV } from '/shared/csv.js';
import { makeZip } from '/shared/zip.js';
import { formatINR, sum } from '/shared/money.js';
import { fyBounds, financialYearOf, taxYearLabel } from '/shared/dates.js';
import { invoiceBalance } from '/shared/billing-service.js';
import { RULESET_VERSION } from '/shared/compliance-config.js';
import { pdfBytes, invoiceFileName, invoiceLabel } from '../pdf.js';

const r = (p) => (p / 100).toFixed(2);

export function buildYearData({ fy, invoices, receipts, agreements = [], versions = [], tenants = [], properties = [] }) {
  const { start, end, firstPeriod, lastPeriod } = fyBounds(fy);
  const inv = invoices.filter((i) => i.status !== 'superseded' && i.period >= firstPeriod && i.period <= lastPeriod).sort((a, b) => (a.period + a.category < b.period + b.category ? -1 : 1));
  const rec = receipts.filter((x) => x.date >= start && x.date <= end);
  const tenantName = (id) => tenants.find((t) => t.id === id)?.legalName || '';
  const propName = (id) => properties.find((p) => p.id === id)?.name || '';
  const ledger = [];
  for (const i of inv) {
    ledger.push({ date: i.doc.invoiceDate, type: i.kind === 'credit_note' ? 'Credit note' : 'Invoice', number: invoiceLabel(i), status: i.status, period: i.period, property: propName(i.propertyId), tenant: tenantName(i.tenantId), category: i.category, documentType: i.doc.documentType, taxable: r(i.doc.taxablePaise), gstCollected: r(i.doc.landlordTaxPaise), rcmByTenant: r(i.doc.tenantRcmPaise), total: r(i.doc.totalPaise), expectedTds: i.doc.tds?.amountPaise != null ? r(i.doc.tds.amountPaise) : 'not determined', received: '', reportedTds: '', taxStatus: i.doc.taxStatus });
  }
  for (const x of rec) {
    for (const a of x.allocations || []) {
      const i = inv.find((v) => v.id === a.invoiceId);
      ledger.push({ date: x.date, type: 'Receipt', number: x.reference || x.id, status: 'recorded', period: i?.period || '', property: i ? propName(i.propertyId) : '', tenant: i ? tenantName(i.tenantId) : '', category: i?.category || '', documentType: '', taxable: '', gstCollected: '', rcmByTenant: '', total: '', expectedTds: '', received: r(a.amountPaise), reportedTds: r(a.tdsPaise || 0), taxStatus: '' });
    }
    if (x.unappliedPaise > 0) ledger.push({ date: x.date, type: 'Unapplied receipt', number: x.reference || x.id, status: 'unapplied', period: '', property: '', tenant: '', category: '', documentType: '', taxable: '', gstCollected: '', rcmByTenant: '', total: '', expectedTds: '', received: r(x.unappliedPaise), reportedTds: '', taxStatus: '' });
  }
  ledger.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const balances = inv.map((i) => ({ inv: i, bal: invoiceBalance(i, receipts) }));
  const unresolved = [
    ...inv.filter((i) => i.doc.taxStatus !== 'SUPPORTED').map((i) => `${invoiceLabel(i)} (${i.period} ${i.category}): tax treatment needs review`),
    ...balances.filter((b) => b.bal.balancePaise > 100 && b.inv.status === 'issued').map((b) => `${invoiceLabel(b.inv)}: ${formatINR(b.bal.balancePaise)} outstanding`),
    ...inv.filter((i) => i.status === 'draft').map((i) => `${invoiceLabel(i)}: still a draft (not issued)`),
  ];
  const missing = [];
  const tdsInvs = inv.filter((i) => (i.doc.tds?.amountPaise || 0) > 0);
  if (tdsInvs.length) missing.push('TDS certificates from tenants for each quarter / the deduction month (check Form 26AS/AIS)');
  for (const a of agreements) missing.push(`Signed agreement copy: ${propName(a.propertyId)} (${a.reference || a.id})`);
  missing.push('Bank statements for the year (to confirm receipts)');
  missing.push('Municipal tax receipts and home-loan interest certificate, if any (needed for income-tax, not tracked here)');
  const gstByMonth = {};
  for (const i of inv) { const k = i.period; gstByMonth[k] = gstByMonth[k] || { collected: 0, rcm: 0, exempt: 0, review: 0 }; gstByMonth[k].collected += i.doc.landlordTaxPaise; gstByMonth[k].rcm += i.doc.tenantRcmPaise; if (i.doc.lines.some((l) => l.tax.treatment === 'EXEMPT')) gstByMonth[k].exempt += i.doc.taxablePaise; if (i.doc.taxStatus !== 'SUPPORTED') gstByMonth[k].review++; }
  const escalations = versions.filter((v) => v.effectiveFrom <= end).map((v) => `${v.effectiveFrom}: ${v.reason || v.kind} (${propName(agreements.find((a) => a.id === v.agreementId)?.propertyId)})`);
  return { fy, inv, rec, ledger, unresolved, missing, gstByMonth, escalations, totals: { rent: sum(inv.flatMap((i) => i.doc.lines.filter((l) => l.key === 'rent').map((l) => l.amountPaise))), invoiced: sum(inv.map((i) => i.doc.totalPaise)), gst: sum(inv.map((i) => i.doc.landlordTaxPaise)), received: sum(rec.flatMap((x) => (x.allocations || []).map((a) => a.amountPaise))), reportedTds: sum(rec.flatMap((x) => (x.allocations || []).map((a) => a.tdsPaise || 0))) } };
}

const LEDGER_HEADERS = [['Date', 'date'], ['Type', 'type'], ['Number / reference', 'number'], ['Status', 'status'], ['Service period', 'period'], ['Property', 'property'], ['Tenant', 'tenant'], ['Category', 'category'], ['Document type', 'documentType'], ['Taxable (Rs)', 'taxable'], ['GST collected (Rs)', 'gstCollected'], ['GST payable by tenant under RCM (Rs)', 'rcmByTenant'], ['Invoice total (Rs)', 'total'], ['Expected TDS (Rs)', 'expectedTds'], ['Received (Rs)', 'received'], ['TDS reported by tenant - unverified (Rs)', 'reportedTds'], ['Tax status', 'taxStatus']].map(([label, key]) => ({ label, key }));

export function ledgerCSV(data) { return toCSV(data.ledger, LEDGER_HEADERS); }

export function summaryText(data, { sample = false } = {}) {
  const tl = taxYearLabel(data.fy);
  const L = [];
  L.push(`KirayaKhata year-end records - ${tl.label} (${tl.act})${sample ? ' - FICTIONAL SAMPLE DATA' : ''}`);
  L.push(`Generated ${new Date().toISOString().slice(0, 10)} · Ruleset ${RULESET_VERSION}`);
  L.push('THIS IS NOT AN INCOME-TAX RETURN. Organised records for your own review or your CA. Nothing has been filed.');
  L.push('');
  L.push(`Rent invoiced (excl. GST): ${formatINR(data.totals.rent)}`);
  L.push(`All documents total: ${formatINR(data.totals.invoiced)} · GST you collected: ${formatINR(data.totals.gst)}`);
  L.push(`Receipts allocated: ${formatINR(data.totals.received)} · TDS reported by tenants (unverified until in Form 26AS/AIS): ${formatINR(data.totals.reportedTds)}`);
  L.push('');
  L.push('GST treatment by month (collected / reverse charge by tenant / exempt value / documents needing review):');
  for (const [k, v] of Object.entries(data.gstByMonth)) L.push(`  ${k}: ${formatINR(v.collected)} / ${formatINR(v.rcm)} / ${formatINR(v.exempt)} / ${v.review}`);
  L.push('');
  L.push('Agreement and escalation history:'); data.escalations.forEach((e) => L.push(`  - ${e}`));
  L.push('');
  L.push(`Unresolved items (${data.unresolved.length}):`); (data.unresolved.length ? data.unresolved : ['None recorded']).forEach((u) => L.push(`  - ${u}`));
  L.push('');
  L.push('Missing-document checklist (KirayaKhata cannot see these):'); data.missing.forEach((m) => L.push(`  [ ] ${m}`));
  return L.join('\r\n') + '\r\n';
}

export function indexCSV(data, includedFiles) {
  return toCSV(data.inv.map((i) => ({ ...i, file: includedFiles.get(i.id) || 'NOT INCLUDED' })), [
    { label: 'Number', value: (i) => invoiceLabel(i) }, { label: 'Status', key: 'status' }, { label: 'Period', key: 'period' }, { label: 'Category', key: 'category' },
    { label: 'Document type', value: (i) => i.doc.documentType }, { label: 'Total (Rs)', value: (i) => r(i.doc.totalPaise) }, { label: 'Tax status', value: (i) => i.doc.taxStatus }, { label: 'PDF file in this ZIP', key: 'file' },
  ]);
}

export function buildPackZip(data, { sample = false } = {}) {
  const files = []; const included = new Map();
  for (const i of data.inv) {
    try { const name = `invoices/${invoiceFileName(i)}`; files.push({ name, data: pdfBytes(i) }); included.set(i.id, name); } catch { /* listed as NOT INCLUDED */ }
  }
  files.unshift({ name: 'README-summary.txt', data: summaryText(data, { sample }) });
  files.push({ name: 'rent-ledger.csv', data: ledgerCSV(data) });
  files.push({ name: 'document-index.csv', data: indexCSV(data, included) });
  return makeZip(files);
}

export { financialYearOf };
