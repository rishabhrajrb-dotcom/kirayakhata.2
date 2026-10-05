// Pure billing computation for one agreement + one service period (calendar month).
// No storage here; billing-service.js handles persistence, idempotency and numbering.
import { periodBounds, maxISO, minISO, daysBetweenInclusive, addDays, clampDay, periodOf, financialYearOf, fyBounds, addMonthsToPeriod } from './dates.js';
import { amountOn, changeDatesWithin } from './escalation.js';
import { mulDiv, sum } from './money.js';
import { classifyRentGst, classifyItemGst, expectedRentTds, validateGSTIN, worstStatus, SUPPORTED, NEEDS_MORE_INFORMATION, NEEDS_SPECIALIST_REVIEW } from './rules.js';
import { RULESET_VERSION, GST_RULES } from './compliance-config.js';

export const CATEGORIES = ['rent', 'maintenance', 'dg', 'combined'];
export const CATEGORY_TITLES = { rent: 'Lease Rent', maintenance: 'Maintenance Charges', dg: 'DG / Generator Charges', combined: 'Rent and Maintenance' };

/** Version in force on a date: latest effectiveFrom <= date. */
export function versionOn(versions, date) {
  return [...versions].filter((v) => v.effectiveFrom <= date).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : (a.createdAt || '') < (b.createdAt || '') ? -1 : 1)).pop() || null;
}

/** Occupied service window within the period, or null. */
export function occupancy(agreement, period) {
  const b = periodBounds(period);
  const from = maxISO(b.start, agreement.startDate);
  const to = agreement.endDate ? minISO(b.end, agreement.endDate) : b.end;
  if (from > to) return null;
  return { from, to, days: daysBetweenInclusive(from, to), periodDays: b.days, full: from === b.start && to === b.end };
}

/**
 * Compute the charge lines for a period.
 * Returns { status: 'READY'|'NEEDS_INPUT'|'NOT_STARTED'|'LEASE_ENDED', needs:[], lines:{rent:[],maintenance:[],dg:[]}, version, notes }
 * inputs: { maintenanceQty, dgQty } for usage-based charges.
 */
export function computePeriodCharges({ agreement, versions, period, inputs = {}, adjustments = [] }) {
  const b = periodBounds(period);
  const out = { status: 'READY', needs: [], lines: { rent: [], maintenance: [], dg: [] }, notes: [], version: null, occupancy: null };
  if (agreement.startDate > b.end) { out.status = 'NOT_STARTED'; return out; }
  const occ = occupancy(agreement, period);
  if (!occ) { out.status = 'LEASE_ENDED'; return out; }
  out.occupancy = occ;
  const startVersion = versionOn(versions, occ.from);
  if (!startVersion) { out.status = 'NEEDS_INPUT'; out.needs.push({ code: 'NO_TERMS' }); return out; }
  out.version = startVersion;

  // Change points inside the occupied window: new versions and escalation dates.
  const points = new Set();
  for (const v of versions) if (v.effectiveFrom > occ.from && v.effectiveFrom <= occ.to) points.add(v.effectiveFrom);
  for (const key of ['rent', 'maintenance', 'dg']) {
    for (const v of [startVersion, ...versions.filter((x) => x.effectiveFrom > occ.from && x.effectiveFrom <= occ.to)]) {
      const c = v.terms[key];
      if (c && c.basis === 'fixed') for (const d of changeDatesWithin(c, occ.from, occ.to)) points.add(d);
      // Rent-free period ending inside the month splits it.
      if (key === 'rent' && c?.freeUntil && c.freeUntil >= occ.from && c.freeUntil < occ.to) points.add(addDays(c.freeUntil, 1));
    }
  }
  const cuts = [...points].sort();
  const segments = [];
  let cursor = occ.from;
  for (const c of cuts) { segments.push({ from: cursor, to: addDays(c, -1) }); cursor = c; }
  segments.push({ from: cursor, to: occ.to });
  for (const s of segments) s.days = daysBetweenInclusive(s.from, s.to);

  const policy = startVersion.terms.prorationPolicy;
  const needsSplit = segments.length > 1 || !occ.full;
  if (needsSplit && !policy) {
    out.status = 'NEEDS_INPUT';
    out.needs.push({ code: 'PRORATION_POLICY', detail: !occ.full ? 'PARTIAL_MONTH' : 'MID_PERIOD_CHANGE' });
    return out;
  }

  const fixedLine = (key, desc) => {
    const effSegments = policy === 'daily' ? segments : [{ from: occ.from, to: occ.to, days: b.days, wholeMonth: true }];
    for (const seg of effSegments) {
      const v = versionOn(versions, seg.from);
      const c = v.terms[key];
      if (!c || c.basis !== 'fixed') continue;
      const { amountPaise: contractMonthly, explanation } = amountOn(c, seg.from);
      const free = key === 'rent' && c.freeUntil && seg.from <= c.freeUntil;
      const monthly = free ? 0 : contractMonthly;
      if (free) explanation.push({ code: 'RENT_FREE', until: c.freeUntil });
      const amt = seg.wholeMonth || seg.days === b.days ? monthly : mulDiv(monthly, seg.days, b.days);
      out.lines[key].push({
        key, description: desc, from: seg.from, to: seg.to, monthlyPaise: monthly, amountPaise: amt,
        prorated: !(seg.wholeMonth || seg.days === b.days), days: seg.days, periodDays: b.days, explanation, versionId: v.id,
      });
    }
  };
  fixedLine('rent', 'Lease rent');

  for (const key of ['maintenance', 'dg']) {
    const c = startVersion.terms[key];
    if (!c || c.basis === 'none') continue;
    if (key === 'maintenance' && c.issuer === 'external') { out.notes.push({ code: 'MAINT_EXTERNAL' }); continue; }
    if (c.basis === 'fixed') fixedLine(key, key === 'maintenance' ? (c.description || 'Maintenance charges') : (c.description || 'DG / generator charges'));
    else if (c.basis === 'usage') {
      const qty = key === 'maintenance' ? inputs.maintenanceQty : inputs.dgQty;
      if (qty === undefined || qty === null || qty === '') { out.status = 'NEEDS_INPUT'; out.needs.push({ code: key === 'maintenance' ? 'MAINT_READING' : 'DG_READING', unit: c.unitLabel }); continue; }
      out.lines[key].push({
        key, description: `${c.description || (key === 'maintenance' ? 'Maintenance' : 'DG usage')} (${qty} ${c.unitLabel || 'units'} @ ${c.ratePaise / 100})`,
        from: occ.from, to: occ.to, quantity: Number(qty), unitLabel: c.unitLabel, ratePaise: c.ratePaise,
        amountPaise: Math.round(Number(qty) * c.ratePaise), prorated: false, explanation: [], versionId: startVersion.id,
      });
    }
  }
  for (const a of adjustments.filter((x) => x.period === period)) {
    const key = a.category || 'rent';
    out.lines[key].push({ key, description: a.reason || 'Adjustment', from: occ.from, to: occ.to, amountPaise: a.amountPaise, adjustment: true, explanation: [{ code: 'ADJUSTMENT', reason: a.reason }] });
  }
  return out;
}

function lineTax(line, ctx) {
  const facts = ctx.taxFacts;
  if (line.key === 'rent') {
    return classifyRentGst({
      serviceDate: line.from, taxablePaise: line.amountPaise,
      supplier: facts.supplier, recipient: facts.recipient, property: facts.property,
      proprietorOwnResidence: facts.proprietorOwnResidence, special: facts.special,
    });
  }
  const terms = ctx.version.terms[line.key];
  return classifyItemGst({ item: line.key === 'dg' ? 'DG charges' : 'Maintenance', taxablePaise: line.amountPaise, supplier: facts.supplier, property: facts.property, itemTax: terms?.itemTax, special: facts.special });
}

function documentTypeFor(category, taxes, supplier) {
  if (category === 'rent' && taxes[0]) return taxes[0].documentType;
  const treatments = new Set(taxes.map((t) => t.treatment));
  if (supplier.gstRegType !== 'regular') return [...treatments].includes('REVERSE_CHARGE') ? 'RENT_BILL_RCM' : 'RENT_BILL';
  if (treatments.has('UNDETERMINED')) return 'UNDETERMINED';
  if (treatments.size === 1 && treatments.has('EXEMPT')) return 'BILL_OF_SUPPLY';
  if (treatments.has('REVERSE_CHARGE') && treatments.size === 1) return 'TAX_INVOICE_RCM';
  return 'TAX_INVOICE';
}

export const DOCUMENT_TITLES = {
  TAX_INVOICE: 'Tax Invoice', TAX_INVOICE_RCM: 'Tax Invoice (tax payable on reverse charge)',
  BILL_OF_SUPPLY: 'Bill of Supply', RENT_BILL: 'Rent Invoice (not a GST tax invoice)',
  RENT_BILL_RCM: 'Rent Invoice (GST payable by recipient under reverse charge)', UNDETERMINED: 'Draft - tax treatment pending',
};

/**
 * Group computed lines into documents per the agreement's document mode and classify tax per line.
 * ctx: { agreement, version, supplier, tenant, property, unit, period, charges }
 */
export function buildDocuments(ctx) {
  const { version, supplier, tenant, property, period, charges, agreement } = ctx;
  const t = version.terms;
  const taxFacts = {
    supplier: { gstRegType: supplier.gstRegType, stateCode: supplier.stateCode },
    recipient: { gstRegType: tenant.gstStatus, stateCode: tenant.stateCode },
    property: { kind: t.property?.kind, use: t.property?.use, stateCode: property.stateCode },
    proprietorOwnResidence: t.proprietorOwnResidence ?? null,
    special: t.special || [],
  };
  const lctx = { ...ctx, taxFacts };
  const mode = t.documentMode || 'separate';
  const groups = [];
  const has = (k) => charges.lines[k].length > 0 && (sum(charges.lines[k].map((l) => l.amountPaise)) !== 0 || charges.lines[k].some((l) => l.adjustment));
  if (mode === 'combined') {
    const lines = [...charges.lines.rent, ...charges.lines.maintenance, ...(t.dgSeparate === false ? charges.lines.dg : [])];
    if (lines.length) groups.push({ category: 'combined', lines });
  } else {
    if (mode !== 'maintenance_only' && has('rent')) groups.push({ category: 'rent', lines: charges.lines.rent });
    if (mode !== 'rent_only' && has('maintenance')) groups.push({ category: 'maintenance', lines: charges.lines.maintenance });
  }
  if ((mode !== 'combined' || t.dgSeparate !== false) && has('dg')) groups.push({ category: 'dg', lines: charges.lines.dg });

  const b = periodBounds(period);
  // Catch-up drafts are dated when prepared (never silently backdated); service period stays.
  // Billing in arrears: the invoice for a month is raised on the billing day of the next month.
  const invoiceDate = ctx.invoiceDateOverride || clampDay(t.billingTiming === 'arrears' ? addMonthsToPeriod(period, 1) : period, t.billingDay || 1);
  const dueDate = addDays(invoiceDate, t.dueDays ?? 7);

  return groups.map((g) => {
    const lines = g.lines.map((l) => ({ ...l, tax: lineTax(l, lctx) }));
    const taxes = lines.map((l) => l.tax);
    const taxablePaise = sum(lines.map((l) => l.amountPaise));
    const collected = sum(taxes.map((x) => x.landlordCollectsPaise));
    const rcm = sum(taxes.map((x) => x.tenantRcmPaise));
    const summary = {};
    for (const l of lines) for (const c of l.tax.components) {
      const k = `${l.tax.sac || '-'}|${c.name}|${c.bp}|${l.tax.treatment}`;
      summary[k] = summary[k] || { sac: l.tax.sac, name: c.name, bp: c.bp, treatment: l.tax.treatment, taxablePaise: 0, amountPaise: 0 };
      summary[k].taxablePaise += l.amountPaise; summary[k].amountPaise += c.amountPaise;
    }
    let tds = null;
    if (g.category === 'rent' || g.category === 'combined') {
      const rentPaise = sum(lines.filter((l) => l.key === 'rent').map((l) => l.amountPaise));
      const isDeductionMonth = period.endsWith('-03') || (agreement.endDate && periodOf(agreement.endDate) === period);
      let fyRentToDatePaise;
      if (isDeductionMonth && ctx.fyRentToDatePaise !== undefined) fyRentToDatePaise = ctx.fyRentToDatePaise + rentPaise;
      tds = expectedRentTds({ period, date: invoiceDate, rentPaise, tenantCategory: t.tenantCategory, assetKind: t.assetKind || 'land_building', landlordResident: supplier.resident !== false, landlordPanAvailable: supplier.panAvailable !== false, lowerCertRateBp: t.lowerCertValidTo && invoiceDate > t.lowerCertValidTo ? null : (t.lowerCertRateBp ?? null), isDeductionMonth, fyRentToDatePaise });
    }
    const taxStatus = worstStatus(...taxes.map((x) => x.status), ...(g.category === 'maintenance' || g.category === 'dg' ? [] : []));
    const documentType = documentTypeFor(g.category, taxes, supplier);
    const ruleStatuses = [...new Set(taxes.flatMap((x) => x.ruleStatuses || []))];
    return {
      category: g.category, title: CATEGORY_TITLES[g.category], documentType, documentTitle: DOCUMENT_TITLES[documentType],
      period, servicePeriod: { from: charges.occupancy.from, to: charges.occupancy.to }, invoiceDate, dueDate,
      lines, taxablePaise, landlordTaxPaise: collected, tenantRcmPaise: rcm, totalPaise: taxablePaise + collected,
      taxSummary: Object.values(summary), taxStatus, tds, ruleStatuses, rulesetVersion: RULESET_VERSION,
      notes: (t.invoiceNotes || '').slice(0, 400),
      reverseCharge: rcm > 0,
    };
  });
}

/** Essential-field and rule blockers for issuing a draft as a final local document. */
export function issuanceBlockers(doc, snapshot) {
  const b = [];
  const s = snapshot.supplier || {};
  const t = snapshot.tenant || {};
  if (!s.legalName) b.push('SUPPLIER_NAME');
  if (!s.address) b.push('SUPPLIER_ADDRESS');
  if (!t.legalName) b.push('TENANT_NAME');
  if (!t.billingAddress) b.push('TENANT_ADDRESS');
  if (doc.taxStatus === NEEDS_MORE_INFORMATION) b.push('TAX_NEEDS_INFORMATION');
  if (doc.taxStatus === NEEDS_SPECIALIST_REVIEW) b.push('TAX_NEEDS_REVIEW');
  if (doc.documentType === 'UNDETERMINED') b.push('DOCUMENT_TYPE_UNDETERMINED');
  if (['TAX_INVOICE', 'TAX_INVOICE_RCM', 'BILL_OF_SUPPLY'].includes(doc.documentType)) {
    if (!validateGSTIN(s.gstin).valid) b.push('SUPPLIER_GSTIN');
    if (['regular', 'composition'].includes(t.gstStatus) && !validateGSTIN(t.gstin).valid) b.push('TENANT_GSTIN');
    for (const l of doc.lines) if (!l.tax.sac) { b.push('SAC_MISSING'); break; }
  }
  if (doc.totalPaise <= 0 && !doc.lines.some((l) => l.adjustment)) b.push('ZERO_VALUE');
  return b;
}

/** Rule 46: up to 16 chars, alphanumeric plus '-' and '/', unique per financial year. */
export function formatInvoiceNumber(prefix, fy, seq) {
  const fyShort = `${fy.slice(2, 4)}${fy.slice(5, 7)}`;
  const n = `${prefix}/${fyShort}/${String(seq).padStart(4, '0')}`;
  if (n.length > 16 || !/^[A-Za-z0-9/-]+$/.test(n)) throw new RangeError(`Invoice number "${n}" breaks the 16-character / allowed-character rule. Shorten the series prefix.`);
  return n;
}

export function idempotencyKey({ ownerId, agreementId, unitId, period, category, supplierId }) {
  return [ownerId || 'local', agreementId, unitId || '-', period, category, supplierId].join('|');
}

export { financialYearOf, fyBounds };
