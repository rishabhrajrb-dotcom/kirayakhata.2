// FICTIONAL demonstration data only. No names, GSTINs, bank details, addresses or signatures
// from any real invoice are used. GSTINs are synthetic strings with a valid check digit so the
// validator can be exercised; they are not registered numbers.
import { gstinCheckChar } from './rules.js';

const g = (first14) => first14 + gstinCheckChar(first14);

// Hero / "Try a ready example" close-month input (supported forward-charge case).
export const EXAMPLE_CLOSE_MONTH = {
  period: '2026-09',
  landlord: { gstRegType: 'regular', stateCode: '19', resident: true, panAvailable: true },
  tenant: { gstRegType: 'regular', stateCode: '19', category: 'company', proprietorOwnResidence: null },
  property: { kind: 'commercial', use: 'business', stateCode: '19' },
  assetKind: 'land_building',
  special: [],
  rentPaise: 1_00_000_00,
  receivedPaise: 1_08_000_00,
  reportedTdsPaise: 10_000_00,
};

export const SAMPLE_INVOICE_FIXTURE = {
  // Arithmetic of the supplied scanned sample, used only to test totals and words.
  rent: { base: 3_45_000_00, cgst: 31_050_00, sgst: 31_050_00, total: 4_07_100_00 },
  maintenance: { base: 10_000_00, cgst: 900_00, sgst: 900_00, total: 11_800_00 },
  dg: { base: 14_000_00, cgst: 1_260_00, sgst: 1_260_00, total: 16_520_00 },
};

const baseTerms = (o) => ({
  billingDay: 1, dueDays: 7, property: { kind: 'commercial', use: 'business' }, proprietorOwnResidence: null,
  tenantCategory: 'company', assetKind: 'land_building', lowerCertRateBp: null, special: [],
  rent: { basis: 'fixed', amountPaise: 0, escalation: { type: 'none' } },
  maintenance: { basis: 'none' }, dg: { basis: 'none' },
  documentMode: 'separate', dgSeparate: true, templateId: 'classic', prorationPolicy: 'daily', taxInclusive: false,
  deposit: { amountPaise: 0, treatment: 'refundable' },
  schedule: { mode: 'manual', approval: 'review', paused: false, endPeriod: null },
  ...o,
});

export function sampleWorkspace(now = '2026-10-05T00:00:00.000Z') {
  const supplier = {
    id: 'sup_demo', legalName: 'Suresh K. Mehta (demo)', tradeName: '', address: '12 Example Lane, Ballygunge, Kolkata 700019',
    stateCode: '19', gstRegType: 'regular', gstin: g('19ABCPM1234F1Z'), email: 'owner@example.invalid', phone: '',
    signatoryName: 'Suresh K. Mehta', signatoryDesignation: 'Proprietor', resident: true, panAvailable: true,
    bank: { holder: 'Suresh K. Mehta', bankName: 'Example Bank (demo)', account: '000011112222', ifsc: 'EXMP0001234', branch: 'Ballygunge', upi: '' },
    series: { prefix: 'SKM', counters: {} }, createdAt: now,
  };
  const properties = [
    { id: 'prop_lake', name: 'Lake View Office', address: '3rd floor, 40 Example Road, Kolkata 700029', stateCode: '19', units: [{ id: 'u_2b', label: 'Unit 2B' }], createdAt: now },
    { id: 'prop_ganga', name: 'Ganga Apartments', address: '7 Sample Street, Salt Lake, Kolkata 700091', stateCode: '19', units: [{ id: 'u_4a', label: 'Flat 4A' }], createdAt: now },
    { id: 'prop_market', name: 'Market Road Shops', address: '22 Market Road, Howrah 711101', stateCode: '19', units: [{ id: 'u_s7', label: 'Shop 7' }, { id: 'u_s8', label: 'Shop 8' }], createdAt: now },
  ];
  const tenants = [
    { id: 'ten_north', legalName: 'Northwind Logistics Pvt Ltd (demo)', billingAddress: '3rd floor, 40 Example Road, Kolkata 700029', stateCode: '19', gstStatus: 'regular', gstin: g('19AAACN1234K1Z'), contactName: 'Accounts team', email: 'accounts@northwind.example', createdAt: now },
    { id: 'ten_anita', legalName: 'Anita Rao (demo)', billingAddress: 'Flat 4A, 7 Sample Street, Salt Lake, Kolkata 700091', stateCode: '19', gstStatus: 'unregistered', gstin: '', contactName: 'Anita Rao', email: 'anita@example.invalid', createdAt: now },
    { id: 'ten_sharma', legalName: 'Sharma Medicals (demo)', billingAddress: 'Shop 7, 22 Market Road, Howrah 711101', stateCode: '19', gstStatus: 'regular', gstin: g('19AAFFS5678M1Z'), contactName: 'R. Sharma', email: 'sharma@example.invalid', createdAt: now },
  ];
  const agreements = [
    { id: 'agr_lake', propertyId: 'prop_lake', unitId: 'u_2b', tenantId: 'ten_north', supplierId: 'sup_demo', status: 'active', startDate: '2026-04-01', endDate: '2029-03-31', reference: 'LV-2B/2026', createdAt: now },
    { id: 'agr_ganga', propertyId: 'prop_ganga', unitId: 'u_4a', tenantId: 'ten_anita', supplierId: 'sup_demo', status: 'active', startDate: '2026-01-15', endDate: '2026-12-14', reference: 'GA-4A/2026', createdAt: now },
    { id: 'agr_market', propertyId: 'prop_market', unitId: 'u_s7', tenantId: 'ten_sharma', supplierId: 'sup_demo', status: 'active', startDate: '2026-04-01', endDate: '2031-03-31', reference: 'MR-S7/2026', createdAt: now },
  ];
  const versions = [
    {
      id: 'ver_lake_1', agreementId: 'agr_lake', effectiveFrom: '2026-04-01', kind: 'initial', reason: 'Signed agreement', createdAt: now,
      terms: baseTerms({
        templateId: 'modern',
        rent: { basis: 'fixed', amountPaise: 1_00_000_00, baseDate: '2026-04-01', escalation: { type: 'percent', bp: 500, everyMonths: 12, firstDate: '2027-04-01', compounding: true } },
        maintenance: { basis: 'fixed', amountPaise: 10_000_00, issuer: 'landlord', description: 'Common-area maintenance', escalation: { type: 'none' }, itemTax: { confirmed: true, sac: '9987', rateBp: 1800, charge: 'forward', note: 'Demo: classification entered by owner after CA advice' } },
      }),
    },
    {
      id: 'ver_ganga_1', agreementId: 'agr_ganga', effectiveFrom: '2026-01-15', kind: 'initial', reason: 'Signed agreement', createdAt: now,
      terms: baseTerms({
        billingDay: 5, dueDays: 5, property: { kind: 'residential_dwelling', use: 'residence' }, tenantCategory: 'individual_huf_other',
        documentMode: 'rent_only', templateId: 'classic',
        rent: { basis: 'fixed', amountPaise: 45_000_00, baseDate: '2026-01-15', escalation: { type: 'fixed', incrementPaise: 2_500_00, everyMonths: 12, firstDate: '2027-01-15' } },
        maintenance: { basis: 'fixed', amountPaise: 3_000_00, issuer: 'external', description: 'Society maintenance (billed by the society)' },
        deposit: { amountPaise: 90_000_00, treatment: 'refundable' },
      }),
    },
    {
      id: 'ver_market_1', agreementId: 'agr_market', effectiveFrom: '2026-04-01', kind: 'initial', reason: 'Signed agreement', createdAt: now,
      terms: baseTerms({
        billingDay: 31, dueDays: 10, tenantCategory: 'firm_llp', templateId: 'letterhead',
        rent: { basis: 'fixed', amountPaise: 60_000_00, baseDate: '2026-04-01', escalation: { type: 'steps', steps: [{ from: '2027-04-01', amountPaise: 66_000_00 }, { from: '2028-04-01', amountPaise: 72_000_00 }] } },
        maintenance: { basis: 'fixed', amountPaise: 5_000_00, issuer: 'landlord', description: 'Maintenance and security', escalation: { type: 'fixed', incrementPaise: 500_00, everyMonths: 12, firstDate: '2027-04-01' }, itemTax: { confirmed: true, sac: '9987', rateBp: 1800, charge: 'forward', note: 'Demo' } },
        dg: { basis: 'usage', nature: 'backup_power', ratePaise: 18_00, unitLabel: 'kWh', description: 'DG backup power', itemTax: null },
      }),
    },
  ];
  return { workspace: [{ id: 'ws', label: 'Sample workspace (fictional)', sample: true, schemaVersion: 1, createdAt: now }], suppliers: [supplier], properties, tenants, agreements, versions };
}
