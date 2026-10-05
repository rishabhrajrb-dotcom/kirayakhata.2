// Single source of truth for statutory rates, thresholds, dates and sources.
// GOVERNANCE: no rule is auto-marked VERIFIED. Status values:
//   SOURCE_CHECKED            - wording confirmed against the cited official document by the build
//                               (still not a professional opinion; CA review recommended)
//   REQUIRES_CA_VERIFICATION  - plausible / secondary-source value; must be reviewed before reliance
//   REVIEW_ONLY               - the engine never calculates this; it only flags for specialist review
// Every consumer (browser preview, API, PDFs, calendar) reads RULESET_VERSION so outputs agree.

export const RULESET_VERSION = '2026.10.05-local-1';
export const RULES_REVIEWED_ON = '2026-10-05';

export const SOURCES = {
  CIRC_245_2025: {
    title: 'CBIC Circular No. 245/02/2025-GST (28 Jan 2025), para 8',
    url: 'https://gstcouncil.gov.in/sites/default/files/2025-01/cir-245022025-cgst.pdf',
  },
  NOTIF_15_2022_CTR: {
    title: 'Notification No. 15/2022-Central Tax (Rate), w.e.f. 01.01.2023',
    url: 'https://cbic-gst.gov.in/pdf/central-tax-rate/15_2022-ctr-eng.pdf',
  },
  CIRC_206_2023: {
    title: 'CBIC Circular No. 206/18/2023-GST (electricity with renting / pure agent)',
    url: 'https://cbic-gst.gov.in/pdf/clarifications-regarding-applicability-GST-certain-services.pdf',
  },
  RULE_46: {
    title: 'CGST Rule 46 - Tax invoice particulars',
    url: 'https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001',
  },
  CBIC_INVOICE_GUIDE: {
    title: 'CBIC - GST invoice rules (supporting reference)',
    url: 'https://cbic-gst.gov.in/gst-invoice-rules.html',
  },
  GST_PORTAL_GSTR1: { title: 'GST Portal user manual - GSTR-1', url: 'https://tutorial.gst.gov.in/userguide/returns/GSTR_1.htm' },
  GST_PORTAL_QRMP: { title: 'GST Portal FAQs - QRMP scheme', url: 'https://tutorial.gst.gov.in/userguide/returns/FAQs_change_profile.htm' },
  GST_PORTAL_IFF: { title: 'GST Portal manual - Invoice Furnishing Facility (IFF)', url: 'https://tutorial.gst.gov.in/userguide/returns/Manual_IFF.htm' },
  GST_PORTAL_3B: { title: 'GST Portal manual - GSTR-3B', url: 'https://tutorial.gst.gov.in/userguide/returns/Manual_GSTR3B.htm' },
  GST_PORTAL_PMT06: { title: 'GST Portal manual - PMT-06 (QRMP monthly payment)', url: 'https://tutorial.gst.gov.in/userguide/returns/FAQs_change_profile.htm' },
  GST_PORTAL_CMP08: { title: 'GST Portal manual - CMP-08', url: 'https://tutorial.gst.gov.in/userguide/returns/Manual_CMP08.htm' },
  ITD_TDS_FAQ: {
    title: 'Income Tax Department - TDS compliance FAQs (1961 to 2025 Act transition)',
    url: 'https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/%20tds%20compliance-faq',
  },
  ITD_194IB: { title: 'Income Tax Department - TDS on rent by certain individuals/HUF (194-IB)', url: 'https://www.incometaxindia.gov.in/w/tds-on-rent-by-certain-individual-or-huf' },
  ITD_393: { title: 'Income Tax Department - Section 393, Income-tax Act 2025', url: 'https://www.incometaxindia.gov.in/w/section-393-5' },
  ITD_TAX_PAYMENT_FAQ: {
    title: 'Income Tax Department - Tax payment FAQs (advance tax)',
    url: 'https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tax-payments-faq?mobile-app=1',
  },
  GST_COUNCIL_56: {
    title: 'PIB - Recommendations of the 56th GST Council (rates w.e.f. 22.09.2025)',
    url: 'https://gstcouncil.gov.in/sites/default/files/2025-09/press_release_press_information_bureau_0.pdf',
  },
};

Object.assign(SOURCES, {
  CGST_S22: { title: 'CGST Act s.22 (threshold) and s.2(6) (aggregate turnover)', url: 'https://taxinformation.cbic.gov.in/content-page/explore-act/1000001/1000001' },
  CGST_S23: { title: 'CGST Act s.23 (persons not liable for registration)', url: 'https://taxinformation.cbic.gov.in/content-page/explore-act/1000001/1000001' },
  NOTIF_05_2017_CT: { title: 'Notification 05/2017-Central Tax (RCM-only suppliers exempt from registration)', url: 'https://cbic-gst.gov.in/central-tax-notifications.html' },
  NOTIF_10_2017_IT: { title: 'Notification 10/2017-Integrated Tax (inter-State services below threshold)', url: 'https://cbic-gst.gov.in/integrated-tax-notifications.html' },
});

export const PORTALS = {
  GST: 'https://www.gst.gov.in/',
  INCOME_TAX: 'https://www.incometax.gov.in/iec/foportal/',
  TRACES: 'https://www.tdscpc.gov.in/',
};

// ---------- GST ----------
export const GST_RULES = {
  RENTING_RATE: {
    id: 'GST_RENT_RATE',
    // 18% on renting of immovable property (SAC 9972 heading). Not changed by the
    // 22.09.2025 rate rationalisation per secondary sources; official notification not
    // re-read in this build -> requires CA verification.
    basisPoints: 1800,
    sacResidential: '997211',
    sacNonResidential: '997212',
    effectiveFrom: '2017-07-01',
    status: 'REQUIRES_CA_VERIFICATION',
    source: 'GST_COUNCIL_56',
  },
  RCM_COMMERCIAL_UNREGISTERED_LANDLORD: {
    id: 'GST_RCM_5AB',
    // Sr. 5AB of Notif. 13/2017-CTR inserted by 09/2024-CTR: renting of property other than
    // residential dwelling by an unregistered person to a registered person -> RCM.
    effectiveFrom: '2024-10-10',
    status: 'SOURCE_CHECKED',
    source: 'CIRC_245_2025',
  },
  RCM_COMMERCIAL_COMPOSITION_EXCLUSION: {
    id: 'GST_RCM_5AB_COMPOSITION',
    // 07/2025-CTR excludes composition-registered recipients from 5AB.
    effectiveFrom: '2025-01-16',
    regularisedFrom: '2024-10-10',
    regularisedTo: '2025-01-15',
    status: 'SOURCE_CHECKED',
    source: 'CIRC_245_2025',
  },
  RCM_RESIDENTIAL_TO_REGISTERED: {
    id: 'GST_RCM_5AA',
    // Renting of residential dwelling to a registered person under RCM (Notif. 05/2022-CTR).
    // Effective date taken from the notification's commencement; underlying notification
    // not re-read in this build.
    effectiveFrom: '2022-07-18',
    status: 'REQUIRES_CA_VERIFICATION',
    source: 'NOTIF_15_2022_CTR',
  },
  PROPRIETOR_OWN_RESIDENCE_EXEMPTION: {
    id: 'GST_EXEMPT_12_EXPLANATION',
    effectiveFrom: '2023-01-01',
    status: 'SOURCE_CHECKED',
    source: 'NOTIF_15_2022_CTR',
  },
};

// UTs without legislature use UTGST instead of SGST.
export const UTGST_STATE_CODES = new Set(['04', '26', '31', '35', '38']);

export const STATES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};

// QRMP GSTR-3B: 22nd for Category-I states/UTs, 24th for the rest (GST portal QRMP FAQ).
export const QRMP_3B_CATEGORY_I = new Set(['22', '23', '24', '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37']);

export const GST_FILING = {
  status: 'REQUIRES_CA_VERIFICATION',
  monthly: { gstr1Day: 11, gstr3bDay: 20 },
  qrmp: { gstr1Day: 13, iffFromDay: 1, iffToDay: 13, pmt06Day: 25, gstr3bDayCatI: 22, gstr3bDayCatII: 24 },
  composition: { cmp08Day: 18, gstr4: { month: 4, day: 30 } },
  annual: { gstr9: { month: 12, day: 31 } },
  // Government extensions are applied here by form + period, e.g.
  // { form: 'GSTR-3B', period: '2026-09', newDue: '2026-10-25', source: 'Notification ...' }
  extensions: [],
};

// ---------- Income-tax TDS on rent ----------
export const TDS_RULES = {
  ACT_TRANSITION_DATE: '2026-04-01', // earlier of credit/payment on/after -> Income-tax Act, 2025
  ACT_TRANSITION_STATUS: 'SOURCE_CHECKED',
  ACT_TRANSITION_SOURCE: 'ITD_TDS_FAQ',
  // Rent paid by persons other than "certain individuals/HUF" (old s.194-I; new s.393(1) table)
  GENERAL: [
    {
      id: 'TDS_RENT_GENERAL_PRE_FY26',
      effectiveFrom: '2017-04-01', effectiveTo: '2025-03-31',
      thresholdBasis: 'ANNUAL', annualThresholdPaise: 240000_00,
      landBuildingBp: 1000, plantMachineryBp: 200,
      status: 'REQUIRES_CA_VERIFICATION', source: 'ITD_194IB',
    },
    {
      id: 'TDS_RENT_GENERAL_FY26',
      effectiveFrom: '2025-04-01', effectiveTo: null,
      thresholdBasis: 'MONTHLY', monthlyThresholdPaise: 50000_00,
      landBuildingBp: 1000, plantMachineryBp: 200,
      status: 'REQUIRES_CA_VERIFICATION', source: 'ITD_393',
    },
  ],
  // Rent paid by individuals/HUF not covered above (old s.194-IB). Deducted once: last month
  // of the year or of the tenancy, whichever is earlier.
  SMALL_INDIVIDUAL: [
    { id: 'TDS_194IB_5PCT', effectiveFrom: '2017-06-01', effectiveTo: '2024-09-30', rateBp: 500, monthlyThresholdPaise: 50000_00, status: 'REQUIRES_CA_VERIFICATION', source: 'ITD_194IB' },
    { id: 'TDS_194IB_2PCT', effectiveFrom: '2024-10-01', effectiveTo: null, rateBp: 200, monthlyThresholdPaise: 50000_00, status: 'REQUIRES_CA_VERIFICATION', source: 'ITD_194IB' },
  ],
  // GST shown separately on the invoice is excluded from the TDS base (CBDT Circular 23/2017).
  GST_EXCLUDED_FROM_BASE: { status: 'REQUIRES_CA_VERIFICATION', note: 'CBDT Circular 23/2017 - not re-read in this build' },
  ADVANCE_TAX: {
    status: 'REQUIRES_CA_VERIFICATION', source: 'ITD_TAX_PAYMENT_FAQ',
    minimumLiabilityPaise: 10000_00,
    instalments: [
      { month: 6, day: 15, cumulativePct: 15 },
      { month: 9, day: 15, cumulativePct: 45 },
      { month: 12, day: 15, cumulativePct: 75 },
      { month: 3, day: 15, cumulativePct: 100 },
    ],
  },
};

// ---------- GST registration ----------
export const REGISTRATION = {
  THRESHOLD_PAISE: 20_00_000_00,          // s.22 CGST Act, suppliers of services
  SPECIAL_THRESHOLD_PAISE: 10_00_000_00,  // Manipur, Mizoram, Nagaland, Tripura
  SPECIAL_CATEGORY_STATES: new Set(['13', '14', '15', '16']),
  APPLY_WITHIN_DAYS: 30,                  // s.25(1)
  status: 'REQUIRES_CA_VERIFICATION',
  sources: ['CGST_S22', 'CGST_S23', 'NOTIF_05_2017_CT', 'NOTIF_10_2017_IT'],
};

export function sourceFor(key) {
  return SOURCES[key] || null;
}
