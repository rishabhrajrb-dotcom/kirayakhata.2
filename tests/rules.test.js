import { checkRegistration } from '../shared/registration.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRentGst, classifyItemGst, expectedRentTds, closeMonth, validateGSTIN, gstinCheckChar, SUPPORTED, NEEDS_MORE_INFORMATION, NEEDS_SPECIALIST_REVIEW } from '../shared/rules.js';
import { EXAMPLE_CLOSE_MONTH, SAMPLE_INVOICE_FIXTURE } from '../shared/examples.js';
import { pctOf, formatINR, rupeesToPaise } from '../shared/money.js';
import { amountInWords } from '../shared/words.js';

const base = (o = {}) => ({
  serviceDate: '2026-09-01', taxablePaise: 1_00_000_00,
  supplier: { gstRegType: 'regular', stateCode: '19' }, recipient: { gstRegType: 'regular', stateCode: '19' },
  property: { kind: 'commercial', use: 'business', stateCode: '19' }, proprietorOwnResidence: null, special: [], ...o,
});

test('GSTIN check digit and validation', () => {
  const g = '19ABCPM1234F1Z' + gstinCheckChar('19ABCPM1234F1Z');
  assert.equal(validateGSTIN(g).valid, true);
  assert.equal(validateGSTIN(g.slice(0, 14) + (g[14] === 'A' ? 'B' : 'A')).reason, 'CHECK_DIGIT');
  assert.equal(validateGSTIN('99ABCPM1234F1Z5').reason, 'STATE_CODE');
  assert.equal(validateGSTIN('19ABCPM1234F1X5').reason, 'FORMAT');
  assert.equal(validateGSTIN('').valid, false);
  // A widely published sample GSTIN with a known-valid checksum.
  assert.equal(gstinCheckChar('27AAPFU0939F1Z'), 'V');
});

test('commercial, registered landlord -> forward charge CGST+SGST 9%+9%', () => {
  const r = classifyRentGst(base());
  assert.equal(r.status, SUPPORTED);
  assert.equal(r.treatment, 'FORWARD_CHARGE');
  assert.equal(r.landlordCollectsPaise, 18_000_00);
  assert.deepEqual(r.components.map((c) => [c.name, c.amountPaise]), [['CGST', 9_000_00], ['SGST', 9_000_00]]);
  assert.equal(r.documentType, 'TAX_INVOICE');
  assert.ok(r.ruleStatuses.includes('REQUIRES_CA_VERIFICATION'));
});

test('UT without legislature uses UTGST', () => {
  const r = classifyRentGst(base({ supplier: { gstRegType: 'regular', stateCode: '04' }, recipient: { gstRegType: 'regular', stateCode: '04' }, property: { kind: 'commercial', use: 'business', stateCode: '04' } }));
  assert.deepEqual(r.components.map((c) => c.name), ['CGST', 'UTGST']);
});

test('property in another state than registration -> specialist review, not a silent 9+9 split', () => {
  const r = classifyRentGst(base({ property: { kind: 'commercial', use: 'business', stateCode: '27' } }));
  assert.equal(r.status, NEEDS_SPECIALIST_REVIEW);
  assert.equal(r.components[0].name, 'IGST');
});

test('tenant state alone does not decide IGST', () => {
  const r = classifyRentGst(base({ recipient: { gstRegType: 'regular', stateCode: '27' } }));
  assert.deepEqual(r.components.map((c) => c.name), ['CGST', 'SGST']);
});

test('commercial RCM: unregistered landlord -> registered tenant only from 10 Oct 2024', () => {
  const after = classifyRentGst(base({ serviceDate: '2024-10-10', supplier: { gstRegType: 'unregistered', stateCode: '19' } }));
  assert.equal(after.treatment, 'REVERSE_CHARGE');
  assert.equal(after.landlordCollectsPaise, 0);
  assert.equal(after.tenantRcmPaise, 18_000_00);
  assert.equal(after.documentType, 'RENT_BILL_RCM');
  const before = classifyRentGst(base({ serviceDate: '2024-10-09', supplier: { gstRegType: 'unregistered', stateCode: '19' } }));
  assert.equal(before.treatment, 'NO_GST_UNREGISTERED');
  assert.equal(before.tenantRcmPaise, 0);
});

test('composition tenant: RCM regularised window then excluded from 16 Jan 2025', () => {
  const s = { gstRegType: 'unregistered', stateCode: '19' };
  const t = { gstRegType: 'composition', stateCode: '19' };
  assert.equal(classifyRentGst(base({ serviceDate: '2024-11-01', supplier: s, recipient: t })).status, NEEDS_SPECIALIST_REVIEW);
  const later = classifyRentGst(base({ serviceDate: '2025-01-16', supplier: s, recipient: t }));
  assert.equal(later.treatment, 'NO_GST_UNREGISTERED');
  assert.equal(later.status, SUPPORTED);
  assert.equal(classifyRentGst(base({ serviceDate: '2024-10-01', supplier: s, recipient: t })).treatment, 'NO_GST_UNREGISTERED');
});

test('residential RCM is NOT excluded for composition recipients', () => {
  const r = classifyRentGst(base({ property: { kind: 'residential_dwelling', use: 'business', stateCode: '19' }, recipient: { gstRegType: 'composition', stateCode: '19' }, supplier: { gstRegType: 'unregistered', stateCode: '19' } }));
  assert.equal(r.treatment, 'REVERSE_CHARGE');
});

test('residential dwelling: residence vs business vs proprietor exemption', () => {
  const resUnreg = classifyRentGst(base({ property: { kind: 'residential_dwelling', use: 'residence', stateCode: '19' }, recipient: { gstRegType: 'unregistered', stateCode: '19' } }));
  assert.equal(resUnreg.treatment, 'EXEMPT');
  assert.equal(resUnreg.documentType, 'BILL_OF_SUPPLY');
  const ask = classifyRentGst(base({ property: { kind: 'residential_dwelling', use: 'residence', stateCode: '19' } }));
  assert.equal(ask.status, NEEDS_MORE_INFORMATION);
  assert.equal(ask.missing[0].field, 'proprietorOwnResidence');
  const prop = classifyRentGst(base({ property: { kind: 'residential_dwelling', use: 'residence', stateCode: '19' }, proprietorOwnResidence: true }));
  assert.equal(prop.treatment, 'EXEMPT');
  const propOld = classifyRentGst(base({ serviceDate: '2022-10-01', property: { kind: 'residential_dwelling', use: 'residence', stateCode: '19' }, proprietorOwnResidence: true }));
  assert.equal(propOld.status, NEEDS_SPECIALIST_REVIEW);
  const company = classifyRentGst(base({ property: { kind: 'residential_dwelling', use: 'residence', stateCode: '19' }, proprietorOwnResidence: false }));
  assert.equal(company.treatment, 'REVERSE_CHARGE');
  assert.equal(company.documentType, 'TAX_INVOICE_RCM');
  const bizUnreg = classifyRentGst(base({ property: { kind: 'residential_dwelling', use: 'business', stateCode: '19' }, recipient: { gstRegType: 'unregistered', stateCode: '19' } }));
  assert.equal(bizUnreg.treatment, 'FORWARD_CHARGE');
});

test('missing facts never fall back to zero GST', () => {
  const r = classifyRentGst(base({ supplier: { gstRegType: 'unknown', stateCode: '19' } }));
  assert.equal(r.status, NEEDS_MORE_INFORMATION);
  assert.equal(r.treatment, 'UNDETERMINED');
});

test('special cases route to specialist review', () => {
  for (const f of ['sez', 'pg_hostel', 'co_owned', 'mixed_use', 'non_resident', 'land']) {
    assert.equal(classifyRentGst(base({ special: [f] })).status, NEEDS_SPECIALIST_REVIEW, f);
  }
  assert.equal(classifyRentGst(base({ supplier: { gstRegType: 'composition', stateCode: '19' } })).status, NEEDS_SPECIALIST_REVIEW);
});

test('maintenance does not inherit rent treatment', () => {
  const un = classifyItemGst({ item: 'Maintenance', taxablePaise: 10_000_00, supplier: { gstRegType: 'regular', stateCode: '19' }, property: { stateCode: '19' }, itemTax: null });
  assert.equal(un.status, NEEDS_SPECIALIST_REVIEW);
  const ok = classifyItemGst({ item: 'Maintenance', taxablePaise: 10_000_00, supplier: { gstRegType: 'regular', stateCode: '19' }, property: { stateCode: '19' }, itemTax: { confirmed: true, sac: '9987', rateBp: 1800, charge: 'forward' } });
  assert.equal(ok.landlordCollectsPaise, 1_800_00);
});

test('scanned-sample arithmetic fixture reproduces exactly', () => {
  for (const k of ['rent', 'maintenance', 'dg']) {
    const f = SAMPLE_INVOICE_FIXTURE[k];
    assert.equal(pctOf(f.base, 900), f.cgst);
    assert.equal(f.base + 2 * pctOf(f.base, 900), f.total);
  }
  assert.equal(SAMPLE_INVOICE_FIXTURE.rent.total + SAMPLE_INVOICE_FIXTURE.maintenance.total, 4_18_900_00);
  assert.equal(SAMPLE_INVOICE_FIXTURE.rent.total + SAMPLE_INVOICE_FIXTURE.maintenance.total + SAMPLE_INVOICE_FIXTURE.dg.total, 4_35_420_00);
  assert.equal(amountInWords(4_07_100_00), 'INR Four Lakh Seven Thousand One Hundred Only');
  assert.equal(amountInWords(11_800_00), 'INR Eleven Thousand Eight Hundred Only');
  assert.equal(amountInWords(62_100_00), 'INR Sixty Two Thousand One Hundred Only');
});

test('amount in words: paise, zero, crore', () => {
  assert.equal(amountInWords(0), 'INR Zero Only');
  assert.equal(amountInWords(1_18_000_50), 'INR One Lakh Eighteen Thousand and Fifty Paise Only');
  assert.equal(amountInWords(12_34_56_789_05), 'INR Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Five Paise Only');
  assert.equal(amountInWords(1), 'INR Zero and One Paise Only');
});

test('Indian number formatting and parsing', () => {
  assert.equal(formatINR(1_08_000_00), 'Rs. 1,08,000.00');
  assert.equal(formatINR(12_34_56_789_00), 'Rs. 12,34,56,789.00');
  assert.equal(formatINR(999_00), 'Rs. 999.00');
  assert.equal(rupeesToPaise('1,00,000.5'), 1_00_000_50);
  assert.throws(() => rupeesToPaise('1.234'));
});

test('TDS: company tenant 10% above Rs 50,000/month; section label follows the 1 April 2026 transition', () => {
  const r = expectedRentTds({ period: '2026-09', rentPaise: 1_00_000_00, tenantCategory: 'company', assetKind: 'land_building', landlordResident: true, landlordPanAvailable: true });
  assert.equal(r.amountPaise, 10_000_00);
  assert.match(r.section, /393/);
  const old = expectedRentTds({ period: '2026-03', rentPaise: 1_00_000_00, tenantCategory: 'company', assetKind: 'land_building' });
  assert.match(old.section, /194-I/);
  const below = expectedRentTds({ period: '2026-09', rentPaise: 50_000_00, tenantCategory: 'company', assetKind: 'land_building' });
  assert.equal(below.amountPaise, 0);
  const machine = expectedRentTds({ period: '2026-09', rentPaise: 1_00_000_00, tenantCategory: 'company', assetKind: 'plant_machinery' });
  assert.equal(machine.amountPaise, 2_000_00);
});

test('TDS before FY 2025-26 needs annual rent (annual threshold era)', () => {
  const r = expectedRentTds({ period: '2025-02', rentPaise: 30_000_00, tenantCategory: 'company', assetKind: 'land_building' });
  assert.equal(r.status, NEEDS_MORE_INFORMATION);
  const r2 = expectedRentTds({ period: '2025-02', rentPaise: 30_000_00, annualRentPaise: 3_60_000_00, tenantCategory: 'company', assetKind: 'land_building' });
  assert.equal(r2.amountPaise, 3_000_00);
});

test('TDS: small individual deducts once (2% from Oct 2024, 5% before)', () => {
  const mid = expectedRentTds({ period: '2026-09', rentPaise: 60_000_00, tenantCategory: 'individual_huf_other' });
  assert.equal(mid.amountPaise, 0);
  assert.equal(mid.timing, 'ONCE_LAST_MONTH');
  const march = expectedRentTds({ period: '2027-03', rentPaise: 60_000_00, tenantCategory: 'individual_huf_other', isDeductionMonth: true, fyRentToDatePaise: 7_20_000_00 });
  assert.equal(march.amountPaise, 14_400_00);
  const old = expectedRentTds({ period: '2024-09', rentPaise: 60_000_00, tenantCategory: 'individual_huf_other', isDeductionMonth: true, fyRentToDatePaise: 60_000_00 });
  assert.equal(old.rateBp, 500);
});

test('TDS unknown category / non-resident / no PAN', () => {
  assert.equal(expectedRentTds({ period: '2026-09', rentPaise: 1, tenantCategory: 'unknown' }).status, NEEDS_MORE_INFORMATION);
  assert.equal(expectedRentTds({ period: '2026-09', rentPaise: 1, tenantCategory: 'company', landlordResident: false }).status, NEEDS_SPECIALIST_REVIEW);
  assert.equal(expectedRentTds({ period: '2026-09', rentPaise: 1, tenantCategory: 'company', landlordPanAvailable: false }).status, NEEDS_SPECIALIST_REVIEW);
});

test('close month: hero example matches Rs 1,08,000', () => {
  const r = closeMonth(EXAMPLE_CLOSE_MONTH);
  assert.equal(r.invoiceValuePaise, 1_18_000_00);
  assert.equal(r.expectedReceiptPaise, 1_08_000_00);
  assert.equal(r.arithmetic, 'MATCH');
  assert.equal(r.gst.treatment, 'FORWARD_CHARGE');
});

test('close month: Rs 1 tolerance, short and excess', () => {
  assert.equal(closeMonth({ ...EXAMPLE_CLOSE_MONTH, receivedPaise: 1_07_999_00 }).arithmetic, 'MATCH');
  const s = closeMonth({ ...EXAMPLE_CLOSE_MONTH, receivedPaise: 1_00_000_00 });
  assert.equal(s.arithmetic, 'SHORT'); assert.equal(s.differencePaise, -8_000_00);
  assert.equal(closeMonth({ ...EXAMPLE_CLOSE_MONTH, receivedPaise: 1_20_000_00 }).arithmetic, 'EXCESS');
});

test('close month: amounts can match while tax still needs review', () => {
  // Tenant category unknown; reported TDS happens to make the arithmetic match.
  const r = closeMonth({ ...EXAMPLE_CLOSE_MONTH, tenant: { ...EXAMPLE_CLOSE_MONTH.tenant, category: 'unknown' } });
  assert.equal(r.arithmetic, 'MATCH');
  assert.notEqual(r.taxReview, SUPPORTED);
  assert.ok(r.flags.some((f) => f.code === 'REC_TDS_UNRESOLVED'));
});

test('close month: reported TDS that fits another rule is flagged, not accepted', () => {
  const r = closeMonth({ ...EXAMPLE_CLOSE_MONTH, reportedTdsPaise: 2_000_00, receivedPaise: 1_16_000_00 });
  assert.equal(r.arithmetic, 'MATCH');
  assert.ok(r.flags.some((f) => f.code === 'REC_TDS_MISMATCH'));
  assert.equal(r.taxReview, NEEDS_SPECIALIST_REVIEW);
});

test('close month: unknown GST cannot compute; RCM excluded from receipt', () => {
  const r = closeMonth({ ...EXAMPLE_CLOSE_MONTH, landlord: { ...EXAMPLE_CLOSE_MONTH.landlord, gstRegType: 'unknown' } });
  assert.equal(r.arithmetic, 'CANNOT_COMPUTE');
  const rcm = closeMonth({ ...EXAMPLE_CLOSE_MONTH, landlord: { ...EXAMPLE_CLOSE_MONTH.landlord, gstRegType: 'unregistered' }, receivedPaise: 90_000_00 });
  assert.equal(rcm.invoiceValuePaise, 1_00_000_00);
  assert.equal(rcm.tenantRcmPaise, 18_000_00);
  assert.equal(rcm.expectedReceiptPaise, 90_000_00);
});

test('GST registration check: threshold, exemptions, special states', () => {
  const L = (o) => ({ kind: 'commercial', use: 'business', tenantRegistered: false, annualPaise: 12_00_000_00, stateCode: '19', ...o });
  const below = checkRegistration({ landlordStateCode: '19', rentals: [L({ annualPaise: 12_00_000_00 })] });
  assert.equal(below.verdict, 'NOT_REQUIRED'); assert.equal(below.headroomPaise, 8_00_000_00); assert.equal(below.usedPct, 60);
  assert.equal(checkRegistration({ landlordStateCode: '19', rentals: [L({ annualPaise: 18_00_000_00 })] }).code, 'REG_BELOW_NEAR');
  const req = checkRegistration({ landlordStateCode: '19', rentals: [L({ annualPaise: 15_00_000_00 }), L({ kind: 'residential_dwelling', use: 'residence', annualPaise: 6_00_000_00 })] });
  assert.equal(req.verdict, 'REQUIRED'); assert.equal(req.aggregatePaise, 21_00_000_00);
  assert.equal(checkRegistration({ landlordStateCode: '19', rentals: [L({ kind: 'residential_dwelling', use: 'residence', annualPaise: 30_00_000_00 })] }).code, 'REG_ONLY_EXEMPT');
  assert.equal(checkRegistration({ landlordStateCode: '19', rentals: [L({ tenantRegistered: true, annualPaise: 30_00_000_00 })] }).code, 'REG_ONLY_RCM');
  assert.equal(checkRegistration({ landlordStateCode: '19', rentals: [L({ tenantRegistered: true, annualPaise: 15_00_000_00 }), L({ kind: 'residential_dwelling', use: 'residence', annualPaise: 10_00_000_00 })] }).verdict, 'REVIEW');
  const tripura = checkRegistration({ landlordStateCode: '16', rentals: [L({ stateCode: '16', annualPaise: 12_00_000_00 })] });
  assert.equal(tripura.thresholdPaise, 10_00_000_00); assert.equal(tripura.verdict, 'REQUIRED');
  assert.equal(checkRegistration({ landlordStateCode: '19', rentals: [L({ tenantRegistered: null })] }).verdict, 'NEEDS_MORE_INFORMATION');
  assert.equal(checkRegistration({ landlordStateCode: '19', rentals: [L({ tenantRegistered: true, tenantComposition: true, annualPaise: 25_00_000_00 })] }).verdict, 'REQUIRED');
});
