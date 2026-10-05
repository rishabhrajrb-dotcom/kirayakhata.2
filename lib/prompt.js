// Builds the deterministic explanation and the APPROVED fact sheet an optional model may
// rephrase. The model never sees names, GSTINs, PANs, addresses, bank data or raw notes.
import { msg } from '../shared/messages.js';
import { formatINR } from '../shared/money.js';

export function deterministicExplanation(result, lang = 'en') {
  const parts = [];
  parts.push(...result.gst.reasons.slice(0, 2).map((r) => msg(r.code, lang, r.params)));
  parts.push(...result.tds.reasons.slice(0, 1).map((r) => msg(r.code, lang, r.params)));
  parts.push(msg(result.arithmeticMessage.code, lang, result.arithmeticMessage.params));
  return {
    summary: parts.join(' '),
    nextActions: result.nextActions.map((c) => msg(c, lang)),
    source: 'deterministic',
  };
}

export function approvedFacts(result) {
  const f = (p) => (p === null || p === undefined ? 'unknown' : formatINR(p));
  return {
    gstTreatment: result.gst.treatment,
    gstStatus: result.gst.status,
    tdsStatus: result.tds.status,
    rent: f(result.rentPaise),
    invoiceValue: f(result.invoiceValuePaise),
    tenantReverseChargeGst: f(result.tenantRcmPaise),
    expectedTds: f(result.expectedTdsPaise),
    reportedTds: f(result.reportedTdsPaise),
    expectedReceipt: f(result.expectedReceiptPaise),
    actualReceipt: f(result.actualReceiptPaise),
    arithmetic: result.arithmetic,
    overallTaxReview: result.taxReview,
    nextActions: result.nextActions,
  };
}

export function buildPrompt(facts, lang) {
  return [
    'You explain an already-computed rent check to an older Indian landlord in plain ' + (lang === 'hi' ? 'Hindi' : 'English') + '.',
    'Rules: use ONLY the facts below. Do not change, add or compute any amount, rate or date.',
    'Do not resolve anything marked NEEDS_MORE_INFORMATION or NEEDS_SPECIALIST_REVIEW; say it needs review.',
    'Never claim anything was filed, paid, sent or government verified. Maximum 90 words.',
    'Return JSON: {"summary": string, "nextActions": [up to 3 strings]}.',
    'FACTS: ' + JSON.stringify(facts),
  ].join('\n');
}

const FORBIDDEN_CLAIMS = /\b(filed|has been paid|payment done|sent to|government verified|approved by|certified|guaranteed)\b|दाखिल कर दिया|सत्यापित/i;

/** Validate model output: schema, length, no new numbers, no forbidden claims. */
export function validateModelOutput(out, facts) {
  if (!out || typeof out.summary !== 'string' || !Array.isArray(out.nextActions)) return { ok: false, reason: 'SCHEMA' };
  if (out.nextActions.length > 3 || out.nextActions.some((a) => typeof a !== 'string' || a.length > 160)) return { ok: false, reason: 'ACTIONS' };
  const text = [out.summary, ...out.nextActions].join(' ');
  if (text.split(/\s+/).length > 90 + 30) return { ok: false, reason: 'LENGTH' };
  if (out.summary.split(/\s+/).length > 90) return { ok: false, reason: 'LENGTH' };
  if (FORBIDDEN_CLAIMS.test(text)) return { ok: false, reason: 'CLAIM' };
  const allowed = new Set(JSON.stringify(facts).match(/\d[\d,]*(\.\d+)?/g) || []);
  for (const n of text.match(/\d[\d,]*(\.\d+)?/g) || []) {
    if (!allowed.has(n) && !['1', '2', '3'].includes(n)) return { ok: false, reason: 'NUMBER' };
  }
  return { ok: true };
}
