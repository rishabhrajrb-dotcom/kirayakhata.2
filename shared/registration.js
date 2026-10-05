// "Do I need to register for GST?" - deterministic, plain-language check for rental income.
// Law applied (REQUIRES_CA_VERIFICATION; see compliance-config REGISTRATION):
//  - s.22 CGST Act: register when aggregate turnover in a financial year exceeds Rs 20 lakh
//    (Rs 10 lakh in Manipur, Mizoram, Nagaland, Tripura) for suppliers of services.
//  - s.2(6): aggregate turnover = all taxable + exempt supplies + exports + inter-State supplies
//    of all persons with the same PAN, all-India, excluding taxes. Exempt home rent COUNTS.
//  - s.23(1)(a): no registration if you supply ONLY exempt / non-taxable supplies.
//  - Notif. 05/2017-CT: no registration if you supply ONLY services on which the whole tax is
//    paid by the recipient under reverse charge.
//  - Notif. 10/2017-IT: inter-State supply of services does not by itself force registration
//    below the threshold.
//  - s.25(1): apply within 30 days of becoming liable.
import { REGISTRATION } from './compliance-config.js';
import { sum } from './money.js';

/**
 * rentals: [{ label, kind:'commercial'|'residential_dwelling', use:'residence'|'business',
 *             tenantRegistered: boolean|null, tenantComposition?: boolean, annualPaise, stateCode }]
 * input: { landlordStateCode, rentals, otherTurnoverPaise (same PAN, other business/professional
 *          supplies incl. exempt), otherTurnoverTaxable: boolean|null, monthsElapsed? (0-12), date }
 */
export function checkRegistration({ landlordStateCode, rentals = [], otherTurnoverPaise = 0, otherTurnoverTaxable = null, date = '2026-10-01' }) {
  const special = (code) => REGISTRATION.SPECIAL_CATEGORY_STATES.has(code);
  const states = new Set([landlordStateCode, ...rentals.map((r) => r.stateCode || landlordStateCode)]);
  const thresholdPaise = [...states].some(special) ? REGISTRATION.SPECIAL_THRESHOLD_PAISE : REGISTRATION.THRESHOLD_PAISE;
  const reviewNotes = [];
  if ([...states].length > 1) reviewNotes.push('MULTI_STATE');

  const buckets = { forward: 0, rcm: 0, exempt: 0, unknown: 0 };
  const lines = rentals.map((r) => {
    let bucket;
    if (r.kind === 'residential_dwelling' && r.use === 'residence' && r.tenantRegistered === false) bucket = 'exempt';
    else if (r.kind === 'residential_dwelling' && r.tenantRegistered === true) bucket = date >= '2022-07-18' ? 'rcm' : 'unknown';
    else if (r.kind === 'residential_dwelling' && r.use === 'business' && r.tenantRegistered === false) bucket = 'forward';
    else if (r.kind === 'commercial' && r.tenantRegistered === true && !r.tenantComposition && date >= '2024-10-10') bucket = 'rcm';
    else if (r.kind === 'commercial' && (r.tenantRegistered === false || r.tenantComposition)) bucket = 'forward';
    else bucket = 'unknown';
    buckets[bucket] += r.annualPaise || 0;
    return { ...r, bucket };
  });
  if (otherTurnoverPaise > 0) {
    if (otherTurnoverTaxable === false) buckets.exempt += otherTurnoverPaise;
    else if (otherTurnoverTaxable === true) buckets.forward += otherTurnoverPaise;
    else { buckets.unknown += otherTurnoverPaise; reviewNotes.push('OTHER_TURNOVER_UNCLEAR'); }
  }
  const aggregatePaise = sum(Object.values(buckets));
  const headroomPaise = thresholdPaise - aggregatePaise;
  const usedPct = thresholdPaise ? Math.round((aggregatePaise / thresholdPaise) * 1000) / 10 : 0;

  let verdict; let code;
  if (lines.some((l) => l.bucket === 'unknown') || buckets.unknown > 0) {
    verdict = 'NEEDS_MORE_INFORMATION'; code = 'REG_UNKNOWN';
  } else if (aggregatePaise <= thresholdPaise) {
    verdict = 'NOT_REQUIRED'; code = usedPct >= 80 ? 'REG_BELOW_NEAR' : 'REG_BELOW';
  } else if (buckets.forward === 0 && buckets.rcm === 0) {
    verdict = 'NOT_REQUIRED'; code = 'REG_ONLY_EXEMPT';
  } else if (buckets.forward === 0 && buckets.exempt === 0) {
    verdict = 'NOT_REQUIRED'; code = 'REG_ONLY_RCM';
  } else if (buckets.forward === 0) {
    verdict = 'REVIEW'; code = 'REG_EXEMPT_PLUS_RCM';
  } else {
    verdict = 'REQUIRED'; code = 'REG_REQUIRED';
  }
  return {
    verdict, code, thresholdPaise, aggregatePaise, headroomPaise, usedPct,
    buckets, lines, reviewNotes, specialState: thresholdPaise === REGISTRATION.SPECIAL_THRESHOLD_PAISE,
    ruleStatus: REGISTRATION.status, sources: REGISTRATION.sources,
  };
}

/** Annual rent+charges expected in the current financial year for an agreement's terms (simple). */
export function annualiseMonthly(monthlyPaise) {
  return monthlyPaise * 12;
}
