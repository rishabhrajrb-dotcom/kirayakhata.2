// GST document compliance checklist. Every item cites the rule it comes from. Items with
// level 'block' stop a document from being issued; 'warn' items are shown to the owner.
// Sources (REQUIRES_CA_VERIFICATION): CGST Rule 46 (tax invoice), Rule 46A (invoice-cum-bill
// of supply), Rule 47 / s.31(5) (time limits, continuous supply), Rule 48 (copies),
// Rule 49 (bill of supply), Notif. 78/2020-CT (HSN/SAC digits), Notif. 10/2023-CT
// (e-invoicing above Rs 5 crore AATO), s.31(3)(f) (recipient self-invoice under RCM).
import { validateGSTIN } from './rules.js';
import { STATES } from './compliance-config.js';
import { addDays } from './dates.js';

export const UNREG_RECIPIENT_DETAIL_THRESHOLD_PAISE = 50_000_00; // Rule 46(e)
const PIN_RE = /\b\d{6}\b/;

function item(id, rule, ok, level, en, hi) { return { id, rule, ok: !!ok, level: ok ? 'ok' : level, en, hi }; }

/**
 * doc: built document (billing.buildDocuments output) ; snapshot: { supplier, tenant, property, agreement }
 * opts: { number (issued number or null for drafts) }
 */
export function complianceChecklist(doc, snapshot, opts = {}) {
  const s = snapshot.supplier || {}; const t = snapshot.tenant || {}; const p = snapshot.property || {};
  const type = doc.documentType;
  const items = [];
  const isTaxInvoice = type === 'TAX_INVOICE' || type === 'TAX_INVOICE_RCM';
  const isGstDoc = isTaxInvoice || type === 'BILL_OF_SUPPLY';
  const sG = validateGSTIN(s.gstin);
  const tRegistered = ['regular', 'composition'].includes(t.gstStatus);
  const tG = validateGSTIN(t.gstin);

  items.push(item('DOC_TYPE', 'Sec 31 / Rule 46, 49', type !== 'UNDETERMINED', 'block', 'Document type decided from the GST rules (tax invoice, bill of supply or rent bill)', 'GST नियमों से दस्तावेज़ प्रकार तय (टैक्स इनवॉइस, बिल ऑफ़ सप्लाई या किराया बिल)'));
  items.push(item('TAX_RESOLVED', 'Sec 9 / Notif. 12 & 13/2017-CTR', doc.taxStatus === 'SUPPORTED', 'block', 'Tax treatment of every line is settled (no open question or specialist review)', 'हर पंक्ति का कर उपचार तय (कोई खुला प्रश्न या विशेषज्ञ समीक्षा नहीं)'));
  // (a) supplier
  items.push(item('SUP_NAME', 'Rule 46(a)', s.legalName, 'block', 'Supplier (your) legal name', 'आपका (सप्लायर) कानूनी नाम'));
  items.push(item('SUP_ADDRESS', 'Rule 46(a)', s.address && s.address.length >= 10, 'block', 'Supplier address', 'आपका पता'));
  items.push(item('SUP_PIN', 'Rule 46(a) (complete address)', PIN_RE.test(s.address || ''), 'warn', 'PIN code in your address', 'आपके पते में PIN कोड'));
  if (isGstDoc) {
    items.push(item('SUP_GSTIN', 'Rule 46(a) / 49(a)', sG.valid, 'block', 'Your GSTIN (15 characters, valid check digit)', 'आपका GSTIN (15 अक्षर, सही चेक-अंक)'));
    items.push(item('SUP_GSTIN_STATE', 'Sec 22 / 25 (registration per state)', sG.valid && sG.stateCode === s.stateCode, 'block', 'Your GSTIN belongs to the state you bill from', 'आपका GSTIN उसी राज्य का है जहाँ से बिल बनता है'));
    items.push(item('SUP_AATO', 'Notif. 10/2023-CT, 78/2020-CT', s.aato === 'upto5cr' || s.aato === 'above5cr', 'block', 'Your aggregate turnover band for the previous year (decides e-invoicing and SAC digits)', 'पिछले वर्ष का आपका कुल टर्नओवर समूह (ई-इनवॉइस और SAC अंक तय करता है)'));
  }
  // (b) number, (c) date
  items.push(item('NUMBER', 'Rule 46(b)', opts.number ? /^[A-Za-z0-9/-]{1,16}$/.test(opts.number) : true, 'block', opts.number ? 'Consecutive number, up to 16 characters (letters, digits, - and /), unique this financial year' : 'Consecutive number is given when you issue (up to 16 characters, unique this financial year)', opts.number ? 'क्रमिक नंबर, अधिकतम 16 अक्षर, इस वित्तीय वर्ष में अद्वितीय' : 'जारी करते समय क्रमिक नंबर मिलेगा (अधिकतम 16 अक्षर, वर्ष में अद्वितीय)'));
  items.push(item('DATE', 'Rule 46(c)', doc.invoiceDate, 'block', 'Date of issue', 'जारी करने की तारीख़'));
  // (d)/(e) recipient
  items.push(item('REC_NAME', 'Rule 46(d)/(e)', t.legalName, 'block', 'Recipient (tenant) name', 'प्राप्तकर्ता (किरायेदार) का नाम'));
  if (isGstDoc && tRegistered) {
    items.push(item('REC_GSTIN', 'Rule 46(d) / 49(d)', tG.valid, 'block', 'Tenant’s GSTIN (registered tenant)', 'किरायेदार का GSTIN (पंजीकृत किरायेदार)'));
    items.push(item('REC_ADDRESS', 'Rule 46(d)', t.billingAddress && t.billingAddress.length >= 10, 'block', 'Tenant’s address', 'किरायेदार का पता'));
    if (tG.valid && t.stateCode && tG.stateCode !== t.stateCode) items.push(item('REC_GSTIN_STATE', 'Rule 46(d)', false, 'warn', 'Tenant’s GSTIN state code does not match the tenant state entered', 'किरायेदार के GSTIN का राज्य कोड दर्ज राज्य से मेल नहीं खाता'));
  }
  if (isGstDoc && !tRegistered) {
    const needs = doc.taxablePaise >= UNREG_RECIPIENT_DETAIL_THRESHOLD_PAISE;
    items.push(item('REC_UNREG_DETAILS', 'Rule 46(e)', !needs || (t.billingAddress && t.stateCode && STATES[t.stateCode]), 'block', 'Unregistered tenant, value Rs 50,000 or more: name, address and state with code', 'अपंजीकृत किरायेदार, राशि Rs 50,000 या अधिक: नाम, पता और राज्य कोड सहित'));
  }
  // (f) SAC, (g) description
  const minDigits = s.aato === 'above5cr' ? 6 : 4;
  items.push(item('SAC', 'Rule 46(f) / Notif. 78/2020-CT', isGstDoc ? doc.lines.every((l) => /^\d+$/.test(l.tax.sac || '') && (l.tax.sac || '').length >= minDigits) : true, 'block', `SAC on every line (at least ${minDigits} digits)`, `हर पंक्ति पर SAC (कम से कम ${minDigits} अंक)`));
  items.push(item('DESCRIPTION', 'Rule 46(g)', doc.lines.every((l) => (l.description || '').length >= 3), 'block', 'Description of the service on every line', 'हर पंक्ति पर सेवा का विवरण'));
  // (i)(j)(k)(l) values and tax
  items.push(item('VALUES', 'Rule 46(i)(j)', doc.taxablePaise > 0 || doc.lines.some((l) => l.adjustment), 'block', 'Taxable value and total value (after any discount)', 'कर-योग्य मूल्य और कुल मूल्य (छूट के बाद)'));
  if (isTaxInvoice) items.push(item('TAX_HEADS', 'Rule 46(k)(l)', doc.taxSummary.length > 0, 'block', 'Rate and amount of CGST + SGST/UTGST, or IGST, shown separately', 'CGST + SGST/UTGST या IGST की दर और राशि अलग-अलग'));
  // (m) place of supply, (o) reverse charge
  items.push(item('POS', 'Rule 46(m) / IGST Act s.12(3)', p.stateCode && STATES[p.stateCode], 'block', 'Place of supply with state name and code (where the property is)', 'आपूर्ति का स्थान, राज्य नाम और कोड सहित (जहाँ संपत्ति है)'));
  if (isTaxInvoice) items.push(item('RCM_STATEMENT', 'Rule 46(o)', true, 'block', `Statement “Tax payable on reverse charge: ${doc.reverseCharge ? 'Yes' : 'No'}”`, `कथन “रिवर्स चार्ज पर कर देय: ${doc.reverseCharge ? 'हाँ' : 'नहीं'}”`));
  // (p) signature
  items.push(item('SIGNATORY', 'Rule 46(p) / 49', s.signatoryName, 'warn', 'Authorised signatory named (sign the printed copy, or use a digital signature)', 'अधिकृत हस्ताक्षरकर्ता का नाम (छपी प्रति पर हस्ताक्षर करें या डिजिटल हस्ताक्षर)'));
  // (q) e-invoice
  if (isTaxInvoice && tRegistered) {
    const ok = s.aato !== 'above5cr';
    items.push(item('EINVOICE', 'Rule 48(4) / Notif. 10/2023-CT', ok, 'block',
      ok ? 'E-invoice (IRN/QR) not required — turnover up to Rs 5 crore' : 'E-invoicing applies: turnover above Rs 5 crore, so B2B invoices need an IRN and QR code from the Invoice Registration Portal — KirayaKhata cannot generate these',
      ok ? 'ई-इनवॉइस (IRN/QR) ज़रूरी नहीं — टर्नओवर Rs 5 करोड़ तक' : 'ई-इनवॉइस लागू: टर्नओवर Rs 5 करोड़ से अधिक, इसलिए B2B बिल के लिए IRP से IRN और QR कोड चाहिए — KirayaKhata इन्हें नहीं बना सकता'));
  }
  // Rule 47 / s.31(5): time limit
  if (isGstDoc && doc.invoiceDate && doc.servicePeriod?.to) {
    const limit = addDays(doc.servicePeriod.to, 30);
    items.push(item('TIMELY', 'Rule 47 / Sec 31(5)', doc.invoiceDate <= limit && (!doc.dueDate || doc.invoiceDate <= doc.dueDate), 'warn', 'Issued on or before the payment due date, and within 30 days of the service period', 'भुगतान की देय तारीख़ तक, और सेवा अवधि के 30 दिनों के भीतर जारी'));
  }
  if (type === 'RENT_BILL_RCM') items.push(item('SELF_INVOICE', 'Sec 31(3)(f), Rule 46 proviso', true, 'warn', 'Your tenant must raise a self-invoice and pay GST under reverse charge; your bill states this', 'किरायेदार को स्व-बिल बनाकर रिवर्स चार्ज में GST भरना होगा; आपके बिल पर यह लिखा है'));
  return items;
}

export function blockersFrom(items) { return items.filter((i) => i.level === 'block').map((i) => i.id); }
export function complianceSummary(items) {
  return { total: items.length, ok: items.filter((i) => i.ok).length, blocks: items.filter((i) => i.level === 'block').length, warns: items.filter((i) => i.level === 'warn').length };
}
