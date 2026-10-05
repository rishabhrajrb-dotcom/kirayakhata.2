// "Do I need to register for GST?" - deterministic, conservative check for rental income.
// Law applied (REQUIRES_CA_VERIFICATION; see compliance-config REGISTRATION):
//  - s.22 CGST Act: liable when aggregate turnover in a financial year EXCEEDS Rs 20 lakh
//    (Rs 10 lakh in Manipur, Mizoram, Nagaland, Tripura) for suppliers of services.
//  - s.2(6): aggregate turnover = all taxable supplies (INCLUDING supplies on which the
//    recipient pays reverse charge) + exempt supplies + exports + inter-State supplies of all
//    persons with the same PAN, all-India, excluding GST. Exempt home rent COUNTS.
//  - s.23(1)(a): not liable if engaged EXCLUSIVELY in exempt / non-taxable supplies.
//  - Notif. 05/2017-CT (s.23(2)): not liable if ONLY engaged in supplies on which the WHOLE tax
//    is paid by the recipient under s.9(3) reverse charge. Strictly conditional.
//  - s.25(1): apply within 30 days of becoming liable.
// Design rule: the costly mistake is NOT registering when required. Any exemption is shown as
// CONDITIONAL with its conditions; unclear facts lean to REVIEW (get a CA's written view).
import { REGISTRATION } from './compliance-config.js';
import { sum } from './money.js';

export const VERDICTS = ['ALREADY_REGISTERED', 'NOT_REQUIRED', 'CONDITIONAL', 'REQUIRED', 'REVIEW', 'NEEDS_MORE_INFORMATION'];

function classifyRental(r, date) {
  const t = r.tenantStatus; // 'regular' | 'composition' | 'unregistered' | 'unknown'
  if (!r.kind || r.kind === 'unknown' || !t || t === 'unknown') return 'unknown';
  if (r.kind === 'residential_dwelling') {
    if (!r.use || r.use === 'unknown') return 'unknown';
    if (t === 'regular' || t === 'composition') return date >= '2022-07-18' ? 'rcm' : 'unknown'; // Sr. 5AA (applies to composition recipients too)
    return r.use === 'residence' ? 'exempt' : 'forward';
  }
  // Commercial (other than residential dwelling)
  if (t === 'regular') return date >= '2024-10-10' ? 'rcm' : 'forward'; // Sr. 5AB
  if (t === 'composition') return date >= '2025-01-16' ? 'forward' : 'rcm';
  return 'forward'; // unregistered tenant: the landlord's own taxable supply
}

/**
 * input: {
 *   landlordStateCode, alreadyRegistered: boolean|null (any GSTIN under the same PAN),
 *   rentals: [{ label, kind:'commercial'|'residential_dwelling', use:'residence'|'business',
 *              tenantStatus:'regular'|'composition'|'unregistered'|'unknown', annualPaise, stateCode,
 *              tenantStateDiffers?: boolean }],
 *   otherTurnoverPaise, otherTurnoverTaxable: boolean|null,
 *   monthsElapsed (0-12 in the FY, for the "when will I cross" projection), date
 * }
 */
export function checkRegistration({ landlordStateCode, alreadyRegistered = null, rentals = [], otherTurnoverPaise = 0, otherTurnoverTaxable = null, date = '2026-10-01', monthsElapsed = null }) {
  const special = (code) => REGISTRATION.SPECIAL_CATEGORY_STATES.has(code);
  const states = new Set([landlordStateCode, ...rentals.map((r) => r.stateCode || landlordStateCode)]);
  const thresholdPaise = [...states].some(special) ? REGISTRATION.SPECIAL_THRESHOLD_PAISE : REGISTRATION.THRESHOLD_PAISE;
  const notes = [];
  if (states.size > 1) notes.push('MULTI_STATE');

  const buckets = { forward: 0, rcm: 0, exempt: 0, unknown: 0 };
  const lines = rentals.map((r) => {
    const bucket = classifyRental(r, date);
    buckets[bucket] += r.annualPaise || 0;
    if (bucket === 'rcm' && r.tenantStateDiffers) notes.push('RCM_TENANT_OTHER_STATE');
    return { ...r, bucket };
  });
  if (otherTurnoverPaise > 0) {
    if (otherTurnoverTaxable === false) buckets.exempt += otherTurnoverPaise;
    else if (otherTurnoverTaxable === true) buckets.forward += otherTurnoverPaise;
    else { buckets.unknown += otherTurnoverPaise; notes.push('OTHER_TURNOVER_UNCLEAR'); }
  }
  const aggregatePaise = sum(Object.values(buckets));
  const headroomPaise = thresholdPaise - aggregatePaise;
  const usedPct = thresholdPaise ? Math.round((aggregatePaise / thresholdPaise) * 1000) / 10 : 0;

  // Projection: if this is a run-rate for the year, when is the limit crossed?
  let crossMonthIndex = null;
  if (aggregatePaise > thresholdPaise) crossMonthIndex = Math.max(1, Math.ceil((thresholdPaise / aggregatePaise) * 12 + 1e-9));

  let verdict; let code; let conditions = [];
  if (alreadyRegistered === true) {
    verdict = 'ALREADY_REGISTERED'; code = 'REG_ALREADY';
  } else if (lines.some((l) => l.bucket === 'unknown') || buckets.unknown > 0 || alreadyRegistered === null) {
    verdict = 'NEEDS_MORE_INFORMATION'; code = 'REG_UNKNOWN';
  } else if (aggregatePaise <= thresholdPaise) {
    verdict = 'NOT_REQUIRED'; code = usedPct >= 80 ? 'REG_BELOW_NEAR' : 'REG_BELOW';
  } else if (buckets.forward > 0) {
    verdict = 'REQUIRED'; code = 'REG_REQUIRED';
  } else if (buckets.rcm > 0 && buckets.exempt === 0) {
    verdict = 'CONDITIONAL'; code = 'REG_ONLY_RCM';
    conditions = ['COND_ALL_TENANTS_REGULAR', 'COND_NO_OTHER_BILLING', 'COND_NO_OTHER_SUPPLIES', 'COND_STAY_UNREGISTERED'];
  } else if (buckets.exempt > 0 && buckets.rcm === 0) {
    verdict = 'CONDITIONAL'; code = 'REG_ONLY_EXEMPT';
    conditions = ['COND_ALL_HOMES_RESIDENCE', 'COND_NO_OTHER_BILLING', 'COND_NO_OTHER_SUPPLIES'];
  } else {
    verdict = 'REVIEW'; code = 'REG_EXEMPT_PLUS_RCM';
  }
  return {
    verdict, code, conditions, thresholdPaise, aggregatePaise, headroomPaise, usedPct, crossMonthIndex,
    buckets, lines, reviewNotes: [...new Set(notes)], specialState: thresholdPaise === REGISTRATION.SPECIAL_THRESHOLD_PAISE,
    ruleStatus: REGISTRATION.status, sources: REGISTRATION.sources,
  };
}

/** Legacy adapter: older callers passed tenantRegistered / tenantComposition booleans. */
export function tenantStatusFrom({ tenantRegistered, tenantComposition }) {
  if (tenantRegistered === null || tenantRegistered === undefined) return 'unknown';
  if (!tenantRegistered) return 'unregistered';
  return tenantComposition ? 'composition' : 'regular';
}
