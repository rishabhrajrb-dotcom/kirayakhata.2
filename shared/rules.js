// Deterministic GST / TDS rules. Pure functions, no I/O, no AI.
// Outcome status for every scenario:
export const SUPPORTED = 'SUPPORTED';
export const NEEDS_MORE_INFORMATION = 'NEEDS_MORE_INFORMATION';
export const NEEDS_SPECIALIST_REVIEW = 'NEEDS_SPECIALIST_REVIEW';

import { GST_RULES, TDS_RULES, UTGST_STATE_CODES, STATES, RULESET_VERSION } from './compliance-config.js';
import { pctOf, sum, withinTolerance, formatINR } from './money.js';
import { financialYearOf } from './dates.js';

const worst = (a, b) => {
  const rank = { [SUPPORTED]: 0, [NEEDS_MORE_INFORMATION]: 1, [NEEDS_SPECIALIST_REVIEW]: 2 };
  return rank[a] >= rank[b] ? a : b;
};
export const worstStatus = (...s) => s.filter(Boolean).reduce(worst, SUPPORTED);

// ---------------- GSTIN ----------------
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function gstinCheckChar(first14) {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(first14[i]);
    const product = v * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (total % 36)) % 36];
}

export function validateGSTIN(raw) {
  const g = String(raw || '').trim().toUpperCase();
  if (g.length !== 15) return { valid: false, reason: 'LENGTH' };
  if (!GSTIN_RE.test(g)) return { valid: false, reason: 'FORMAT' };
  const state = g.slice(0, 2);
  if (!STATES[state]) return { valid: false, reason: 'STATE_CODE' };
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return { valid: false, reason: 'CHECK_DIGIT' };
  return { valid: true, stateCode: state, pan: g.slice(2, 12) };
}

// ---------------- GST on rent ----------------
const SPECIAL_FLAGS = ['sez', 'government_lessor', 'non_resident', 'co_owned', 'mixed_use', 'pg_hostel', 'short_stay',
  'land', 'sublet', 'related_party', 'overseas_property', 'multiple_gstin'];

function taxComponents(taxablePaise, rateBp, supplierState, placeState) {
  if (supplierState !== placeState) {
    return [{ name: 'IGST', bp: rateBp, amountPaise: pctOf(taxablePaise, rateBp) }];
  }
  const half = rateBp / 2;
  const second = UTGST_STATE_CODES.has(placeState) ? 'UTGST' : 'SGST';
  return [
    { name: 'CGST', bp: half, amountPaise: pctOf(taxablePaise, half) },
    { name: second, bp: half, amountPaise: pctOf(taxablePaise, half) },
  ];
}

/**
 * Classify GST treatment of the RENT line for one service period.
 * facts: { serviceDate, taxablePaise, supplier:{gstRegType,stateCode}, recipient:{gstRegType,stateCode},
 *          property:{kind:'residential_dwelling'|'commercial', use:'residence'|'business', stateCode},
 *          proprietorOwnResidence: boolean|null, special: string[] }
 */
export function classifyRentGst(facts) {
  const r = {
    status: SUPPORTED, treatment: 'UNDETERMINED', documentType: 'UNDETERMINED',
    rateBp: 0, sac: null, components: [], landlordCollectsPaise: 0, tenantRcmPaise: 0,
    reasons: [], missing: [], ruleIds: [], ruleStatuses: [], rulesetVersion: RULESET_VERSION,
  };
  const { serviceDate, taxablePaise = 0 } = facts;
  const s = facts.supplier || {};
  const t = facts.recipient || {};
  const p = facts.property || {};
  const special = (facts.special || []).filter((f) => SPECIAL_FLAGS.includes(f));

  if (special.length) {
    r.status = NEEDS_SPECIALIST_REVIEW;
    r.reasons.push({ code: 'SPECIAL_CASE', params: { flags: special.join(', ') } });
    return r;
  }
  if (!s.gstRegType || s.gstRegType === 'unknown') r.missing.push({ field: 'supplier.gstRegType', code: 'MISSING_SUPPLIER_GST' });
  if (!t.gstRegType || t.gstRegType === 'unknown') r.missing.push({ field: 'recipient.gstRegType', code: 'MISSING_RECIPIENT_GST' });
  if (!p.kind || p.kind === 'unknown') r.missing.push({ field: 'property.kind', code: 'MISSING_PROPERTY_KIND' });
  if (p.kind === 'residential_dwelling' && (!p.use || p.use === 'unknown')) r.missing.push({ field: 'property.use', code: 'MISSING_USE' });
  if (!p.stateCode || !s.stateCode) r.missing.push({ field: 'property.stateCode', code: 'MISSING_STATE' });
  if (r.missing.length) { r.status = NEEDS_MORE_INFORMATION; return r; }

  if (t.gstRegType === 'uin') { r.status = NEEDS_SPECIALIST_REVIEW; r.reasons.push({ code: 'UIN_RECIPIENT' }); return r; }
  if (s.gstRegType === 'composition') { r.status = NEEDS_SPECIALIST_REVIEW; r.reasons.push({ code: 'COMPOSITION_LANDLORD' }); return r; }

  const rate = GST_RULES.RENTING_RATE;
  const recipientRegistered = t.gstRegType === 'regular' || t.gstRegType === 'composition';
  const residential = p.kind === 'residential_dwelling';
  r.sac = residential ? rate.sacResidential : rate.sacNonResidential;

  const applyTax = (treatment) => {
    r.treatment = treatment;
    r.rateBp = rate.basisPoints;
    r.ruleIds.push(rate.id); r.ruleStatuses.push(rate.status);
    // For RCM the "supplier location" is the landlord's location; unregistered landlords are
    // assumed located in the property state only when the user says so (stateCode supplied).
    if (s.stateCode !== p.stateCode) {
      r.status = NEEDS_SPECIALIST_REVIEW;
      r.reasons.push({ code: 'INTERSTATE' });
    }
    r.components = taxComponents(taxablePaise, rate.basisPoints, s.stateCode, p.stateCode);
    const tax = sum(r.components.map((c) => c.amountPaise));
    if (treatment === 'FORWARD_CHARGE') r.landlordCollectsPaise = tax; else r.tenantRcmPaise = tax;
    r.reasons.push({ code: 'RATE_REQUIRES_VERIFICATION' });
  };
  const noTax = (treatment, code, ruleId) => {
    r.treatment = treatment; r.reasons.push({ code });
    if (ruleId) r.ruleIds.push(ruleId);
  };

  if (residential) {
    const rcm = GST_RULES.RCM_RESIDENTIAL_TO_REGISTERED;
    const exempt = GST_RULES.PROPRIETOR_OWN_RESIDENCE_EXEMPTION;
    if (recipientRegistered) {
      if (serviceDate < rcm.effectiveFrom) { r.status = NEEDS_SPECIALIST_REVIEW; r.reasons.push({ code: 'HISTORICAL_RESIDENTIAL' }); return r; }
      if (p.use === 'residence') {
        if (facts.proprietorOwnResidence === null || facts.proprietorOwnResidence === undefined) {
          r.status = NEEDS_MORE_INFORMATION; r.missing.push({ field: 'proprietorOwnResidence', code: 'MISSING_PROPRIETOR' }); return r;
        }
        if (facts.proprietorOwnResidence === true) {
          if (serviceDate < exempt.effectiveFrom) { r.status = NEEDS_SPECIALIST_REVIEW; r.reasons.push({ code: 'HISTORICAL_RESIDENTIAL' }); return r; }
          noTax('EXEMPT', 'EXEMPT_PROPRIETOR', exempt.id); r.ruleStatuses.push(exempt.status);
          r.documentType = s.gstRegType === 'regular' ? 'BILL_OF_SUPPLY' : 'RENT_BILL';
          return r;
        }
      }
      applyTax('REVERSE_CHARGE');
      r.ruleIds.push(rcm.id); r.ruleStatuses.push(rcm.status);
      r.reasons.unshift({ code: 'RCM_RESIDENTIAL' });
      r.documentType = s.gstRegType === 'regular' ? 'TAX_INVOICE_RCM' : 'RENT_BILL_RCM';
      return r;
    }
    // unregistered recipient
    if (p.use === 'residence') {
      noTax('EXEMPT', 'EXEMPT_RESIDENCE', 'GST_EXEMPT_12');
      r.documentType = s.gstRegType === 'regular' ? 'BILL_OF_SUPPLY' : 'RENT_BILL';
      return r;
    }
    if (s.gstRegType === 'regular') {
      applyTax('FORWARD_CHARGE'); r.reasons.unshift({ code: 'FORWARD_CHARGE' }); r.documentType = 'TAX_INVOICE'; return r;
    }
    noTax('NO_GST_UNREGISTERED', 'RESIDENTIAL_BUSINESS_UNREG_LANDLORD'); r.documentType = 'RENT_BILL';
    return r;
  }

  // Commercial / other than residential dwelling
  if (s.gstRegType === 'regular') {
    applyTax('FORWARD_CHARGE'); r.reasons.unshift({ code: 'FORWARD_CHARGE' }); r.documentType = 'TAX_INVOICE';
    return r;
  }
  // Unregistered landlord
  const ab = GST_RULES.RCM_COMMERCIAL_UNREGISTERED_LANDLORD;
  const comp = GST_RULES.RCM_COMMERCIAL_COMPOSITION_EXCLUSION;
  r.documentType = 'RENT_BILL';
  if (!recipientRegistered) { noTax('NO_GST_UNREGISTERED', 'NO_GST_UNREGISTERED'); return r; }
  if (serviceDate < ab.effectiveFrom) {
    noTax('NO_GST_UNREGISTERED', 'PRE_RCM_COMMERCIAL'); r.reasons.push({ code: 'NO_GST_UNREGISTERED' });
    return r;
  }
  if (t.gstRegType === 'composition') {
    if (serviceDate >= comp.effectiveFrom) {
      noTax('NO_GST_UNREGISTERED', 'RCM_COMPOSITION_EXCLUDED', comp.id); r.ruleStatuses.push(comp.status);
      return r;
    }
    applyTax('REVERSE_CHARGE');
    r.ruleIds.push(ab.id, comp.id); r.ruleStatuses.push(ab.status, comp.status);
    r.status = NEEDS_SPECIALIST_REVIEW;
    r.reasons.unshift({ code: 'RCM_COMPOSITION_INTERVENING' });
    r.documentType = 'RENT_BILL_RCM';
    return r;
  }
  applyTax('REVERSE_CHARGE');
  r.ruleIds.push(ab.id); r.ruleStatuses.push(ab.status);
  r.reasons.unshift({ code: 'RCM_COMMERCIAL' });
  r.documentType = 'RENT_BILL_RCM';
  return r;
}

/**
 * Maintenance / DG / other charge lines. Never inherit the rent treatment.
 * itemTax: owner-confirmed classification { confirmed:true, sac, rateBp, charge:'forward'|'exempt'|'rcm' } or null.
 */
export function classifyItemGst({ item, taxablePaise, supplier, property, itemTax, special = [] }) {
  const r = { status: SUPPORTED, treatment: 'UNDETERMINED', sac: null, rateBp: 0, components: [], landlordCollectsPaise: 0, tenantRcmPaise: 0, reasons: [], ruleIds: [], missing: [] };
  if (special.length) { r.status = NEEDS_SPECIALIST_REVIEW; r.reasons.push({ code: 'SPECIAL_CASE', params: { flags: special.join(', ') } }); return r; }
  if (!itemTax || !itemTax.confirmed) {
    r.status = NEEDS_SPECIALIST_REVIEW;
    r.reasons.push({ code: 'ITEM_UNCLASSIFIED', params: { item } });
    return r;
  }
  r.sac = itemTax.sac;
  r.ruleIds.push('OWNER_CONFIRMED_ITEM_CLASSIFICATION');
  if (supplier.gstRegType !== 'regular') {
    // An unregistered/composition issuer cannot charge GST; anything else needs review.
    if (itemTax.charge === 'forward') { r.status = NEEDS_SPECIALIST_REVIEW; r.reasons.push({ code: 'COMPOSITION_LANDLORD' }); return r; }
  }
  if (itemTax.charge === 'exempt') { r.treatment = 'EXEMPT'; r.reasons.push({ code: 'ITEM_USER_CONFIRMED', params: { item, sac: itemTax.sac, rate: 0 } }); return r; }
  r.rateBp = itemTax.rateBp;
  if (supplier.stateCode !== property.stateCode) { r.status = NEEDS_SPECIALIST_REVIEW; r.reasons.push({ code: 'INTERSTATE' }); }
  r.components = taxComponents(taxablePaise, itemTax.rateBp, supplier.stateCode, property.stateCode);
  const tax = sum(r.components.map((c) => c.amountPaise));
  if (itemTax.charge === 'rcm') { r.treatment = 'REVERSE_CHARGE'; r.tenantRcmPaise = tax; } else { r.treatment = 'FORWARD_CHARGE'; r.landlordCollectsPaise = tax; }
  r.reasons.push({ code: 'ITEM_USER_CONFIRMED', params: { item, sac: itemTax.sac, rate: itemTax.rateBp / 100 } });
  return r;
}

// ---------------- Income-tax TDS on rent ----------------
const GENERAL_DEDUCTORS = new Set(['company', 'firm_llp', 'trust_society_aop', 'government', 'individual_huf_audit']);

function ruleFor(list, date) {
  return list.find((x) => date >= x.effectiveFrom && (!x.effectiveTo || date <= x.effectiveTo)) || null;
}

export function tdsSectionLabel(kind, date) {
  const newAct = date >= TDS_RULES.ACT_TRANSITION_DATE;
  if (kind === 'general') return newAct ? 's.393(1) Income-tax Act 2025 (earlier s.194-I)' : 's.194-I Income-tax Act 1961';
  return newAct ? 's.393 Income-tax Act 2025, Form 141 (earlier s.194-IB / 26QC)' : 's.194-IB Income-tax Act 1961, Form 26QC';
}

/**
 * Expected income-tax TDS the tenant should withhold from this period's RENT (excluding GST).
 * facts: { date (earlier of credit/payment, default period start), period, rentPaise, tenantCategory,
 *          assetKind:'land_building'|'plant_machinery', landlordResident, landlordPanAvailable,
 *          lowerCertRateBp, annualRentPaise, isDeductionMonth (194-IB), fyRentToDatePaise }
 */
export function expectedRentTds(facts) {
  const r = { status: SUPPORTED, amountPaise: null, rateBp: null, section: null, kind: null, timing: null, reasons: [], missing: [], ruleIds: [], ruleStatuses: [] };
  const date = facts.date || `${facts.period}-01`;
  if (facts.landlordResident === false) { r.status = NEEDS_SPECIALIST_REVIEW; r.reasons.push({ code: 'TDS_NON_RESIDENT' }); return r; }
  if (facts.landlordPanAvailable === false) { r.status = NEEDS_SPECIALIST_REVIEW; r.reasons.push({ code: 'TDS_NO_PAN' }); return r; }
  const cat = facts.tenantCategory;
  if (!cat || cat === 'unknown') { r.status = NEEDS_MORE_INFORMATION; r.missing.push({ field: 'tenantCategory', code: 'TDS_MISSING_CATEGORY' }); return r; }

  if (GENERAL_DEDUCTORS.has(cat)) {
    r.kind = 'general'; r.section = tdsSectionLabel('general', date); r.timing = 'EACH_CREDIT_OR_PAYMENT';
    if (!facts.assetKind || facts.assetKind === 'unknown') { r.status = NEEDS_MORE_INFORMATION; r.missing.push({ field: 'assetKind', code: 'TDS_MISSING_ASSET' }); return r; }
    const rule = ruleFor(TDS_RULES.GENERAL, date);
    if (!rule) { r.status = NEEDS_SPECIALIST_REVIEW; return r; }
    r.ruleIds.push(rule.id); r.ruleStatuses.push(rule.status);
    const rateBp = facts.lowerCertRateBp ?? (facts.assetKind === 'plant_machinery' ? rule.plantMachineryBp : rule.landBuildingBp);
    r.rateBp = rateBp;
    let above;
    if (rule.thresholdBasis === 'MONTHLY') above = facts.rentPaise > rule.monthlyThresholdPaise;
    else {
      if (facts.annualRentPaise == null) { r.status = NEEDS_MORE_INFORMATION; r.missing.push({ field: 'annualRentPaise', code: 'TDS_ANNUAL_NEEDED' }); return r; }
      above = facts.annualRentPaise > rule.annualThresholdPaise;
    }
    if (!above) { r.amountPaise = 0; r.reasons.push({ code: 'TDS_BELOW_THRESHOLD' }); return r; }
    r.amountPaise = pctOf(facts.rentPaise, rateBp);
    r.reasons.push(facts.lowerCertRateBp != null ? { code: 'TDS_CERT', params: { rate: rateBp / 100 } } : { code: 'TDS_GENERAL', params: { rate: rateBp / 100, section: r.section } });
    return r;
  }
  if (cat === 'individual_huf_other') {
    r.kind = 'small_individual'; r.section = tdsSectionLabel('small_individual', date); r.timing = 'ONCE_LAST_MONTH';
    const rule = ruleFor(TDS_RULES.SMALL_INDIVIDUAL, date);
    if (!rule) { r.status = NEEDS_SPECIALIST_REVIEW; return r; }
    r.ruleIds.push(rule.id); r.ruleStatuses.push(rule.status);
    r.rateBp = facts.lowerCertRateBp ?? rule.rateBp;
    if (!(facts.rentPaise > rule.monthlyThresholdPaise)) { r.amountPaise = 0; r.reasons.push({ code: 'TDS_BELOW_THRESHOLD' }); return r; }
    if (facts.isDeductionMonth) {
      const base = facts.fyRentToDatePaise ?? facts.rentPaise;
      r.amountPaise = pctOf(base, r.rateBp);
      r.reasons.push({ code: 'TDS_IB_NOW', params: { rate: r.rateBp / 100, section: r.section } });
    } else {
      r.amountPaise = 0;
      r.reasons.push({ code: 'TDS_IB_LATER', params: { rate: r.rateBp / 100, section: r.section } });
    }
    return r;
  }
  r.status = NEEDS_SPECIALIST_REVIEW;
  return r;
}

// ---------------- Close-month reconciliation (single tenant, single month) ----------------
/**
 * input: { period, landlord:{gstRegType,stateCode,resident,panAvailable}, tenant:{gstRegType,stateCode,category,proprietorOwnResidence},
 *          property:{kind,use,stateCode}, assetKind, special[], rentPaise, receivedPaise|null, reportedTdsPaise|null,
 *          lowerCertRateBp, isDeductionMonth, fyRentToDatePaise }
 */
export function closeMonth(input) {
  const serviceDate = `${input.period}-01`;
  const gst = classifyRentGst({
    serviceDate, taxablePaise: input.rentPaise,
    supplier: { gstRegType: input.landlord?.gstRegType, stateCode: input.landlord?.stateCode },
    recipient: { gstRegType: input.tenant?.gstRegType, stateCode: input.tenant?.stateCode },
    property: input.property, proprietorOwnResidence: input.tenant?.proprietorOwnResidence ?? null,
    special: input.special,
  });
  const tds = expectedRentTds({
    period: input.period, rentPaise: input.rentPaise, tenantCategory: input.tenant?.category,
    assetKind: input.assetKind, landlordResident: input.landlord?.resident, landlordPanAvailable: input.landlord?.panAvailable,
    lowerCertRateBp: input.lowerCertRateBp ?? null, isDeductionMonth: input.isDeductionMonth, fyRentToDatePaise: input.fyRentToDatePaise,
  });

  const flags = [];
  const nextActions = [];
  const steps = [];
  const gstKnown = gst.status !== NEEDS_MORE_INFORMATION && gst.treatment !== 'UNDETERMINED';
  const invoiceValuePaise = gstKnown ? input.rentPaise + gst.landlordCollectsPaise : null;
  const reported = input.reportedTdsPaise ?? null;
  const tdsKnown = tds.status === SUPPORTED && tds.amountPaise !== null;

  let tdsUsed = null;
  if (reported !== null) {
    tdsUsed = reported;
    if (tdsKnown && !withinTolerance(reported, tds.amountPaise)) {
      flags.push({ code: 'REC_TDS_MISMATCH', params: { reported: formatINR(reported), expected: formatINR(tds.amountPaise) } });
    }
    if (!tdsKnown) flags.push({ code: 'REC_TDS_UNRESOLVED' });
    flags.push({ code: 'TDS_REPORTED_ONLY' });
  } else if (tdsKnown) tdsUsed = tds.amountPaise;

  let expectedReceiptPaise = null;
  let arithmetic = 'CANNOT_COMPUTE';
  let differencePaise = null;
  if (invoiceValuePaise !== null && tdsUsed !== null) {
    expectedReceiptPaise = invoiceValuePaise - tdsUsed;
    if (input.receivedPaise !== null && input.receivedPaise !== undefined) {
      differencePaise = input.receivedPaise - expectedReceiptPaise;
      if (withinTolerance(input.receivedPaise, expectedReceiptPaise)) arithmetic = 'MATCH';
      else arithmetic = differencePaise < 0 ? 'SHORT' : 'EXCESS';
    } else arithmetic = 'AWAITING_RECEIPT';
  }
  if (gst.tenantRcmPaise) flags.push({ code: 'REC_RCM_NOTE', params: { amount: formatINR(gst.tenantRcmPaise) } });

  steps.push({ label: 'RENT', amountPaise: input.rentPaise });
  steps.push({ label: gst.treatment, amountPaise: gstKnown ? gst.landlordCollectsPaise : null, rcmPaise: gst.tenantRcmPaise });
  steps.push({ label: 'INVOICE_VALUE', amountPaise: invoiceValuePaise });
  steps.push({ label: reported !== null ? 'TDS_REPORTED' : 'TDS_EXPECTED', amountPaise: tdsUsed });
  steps.push({ label: 'EXPECTED_RECEIPT', amountPaise: expectedReceiptPaise });
  steps.push({ label: 'ACTUAL_RECEIPT', amountPaise: input.receivedPaise ?? null });
  steps.push({ label: 'DIFFERENCE', amountPaise: differencePaise });

  const taxReview = worstStatus(gst.status, tds.status,
    flags.some((f) => f.code === 'REC_TDS_MISMATCH' || f.code === 'REC_TDS_UNRESOLVED') ? NEEDS_SPECIALIST_REVIEW : SUPPORTED);
  if (gst.missing.length || tds.missing.length) nextActions.push('NEXT_ANSWER');
  if (arithmetic === 'SHORT' || arithmetic === 'AWAITING_RECEIPT') nextActions.push('NEXT_ASK_TENANT');
  if (arithmetic === 'EXCESS') nextActions.push('NEXT_RECORD_EXCESS');
  if (taxReview === NEEDS_SPECIALIST_REVIEW) nextActions.push('NEXT_REVIEW_CA');
  if ((tdsUsed ?? 0) > 0) nextActions.push('NEXT_TRACK_CERT');
  if (!nextActions.length) nextActions.push('NEXT_PREPARE_INVOICE');

  const arithmeticCode = { MATCH: 'REC_MATCH', SHORT: 'REC_SHORT', EXCESS: 'REC_EXCESS', CANNOT_COMPUTE: 'REC_CANNOT', AWAITING_RECEIPT: 'REC_CANNOT' }[arithmetic];
  return {
    rulesetVersion: RULESET_VERSION,
    financialYear: financialYearOf(serviceDate),
    gst, tds,
    rentPaise: input.rentPaise,
    invoiceValuePaise, tenantRcmPaise: gst.tenantRcmPaise,
    expectedTdsPaise: tdsKnown ? tds.amountPaise : null,
    reportedTdsPaise: reported,
    tdsUsedPaise: tdsUsed,
    expectedReceiptPaise, actualReceiptPaise: input.receivedPaise ?? null, differencePaise,
    arithmetic, arithmeticMessage: { code: arithmeticCode, params: { amount: differencePaise !== null ? formatINR(Math.abs(differencePaise)) : '' } },
    taxReview, flags, nextActions: [...new Set(nextActions)].slice(0, 3), steps,
  };
}
