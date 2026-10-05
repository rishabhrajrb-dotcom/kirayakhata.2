// Compliance calendar. Pure. Dates are IST civil dates. Every task carries its period,
// responsibility, applicability reason, source, rule status and portal guidance.
import { GST_FILING, QRMP_3B_CATEGORY_I, TDS_RULES, PORTALS, SOURCES, RULESET_VERSION } from './compliance-config.js';
import { addMonthsToPeriod, clampDay, periodBounds, addDays, addMonths, periodOf, periodsBetween, financialYearOf, periodLabel } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');
const quarterEnd = (period) => { const m = Number(period.slice(5)); return [3, 6, 9, 12].includes(m); };
const quarterLabel = (period) => {
  const m = Number(period.slice(5)); const y = Number(period.slice(0, 4));
  const q = m <= 3 ? 'Jan–Mar' : m <= 6 ? 'Apr–Jun' : m <= 9 ? 'Jul–Sep' : 'Oct–Dec';
  return `${q} ${y}`;
};

export const GUIDES = {
  'GSTR-1': {
    en: ['Log in at gst.gov.in and open Services → Returns → Returns Dashboard.', 'Choose the financial year and the return period, then GSTR-1.', 'Enter your outward invoices (B2B rent invoices with the tenant\'s GSTIN) or upload them; check the summary.', 'File with DSC or EVC (OTP). Filing GSTR-1 reports supplies — it does not pay tax.'],
    hi: ['gst.gov.in पर लॉग-इन करें और Services → Returns → Returns Dashboard खोलें।', 'वित्तीय वर्ष और अवधि चुनें, फिर GSTR-1।', 'अपने बाहरी बिल (किरायेदार के GSTIN वाले B2B किराया बिल) दर्ज या अपलोड करें; सारांश जाँचें।', 'DSC या EVC (OTP) से फ़ाइल करें। GSTR-1 केवल आपूर्ति की जानकारी है — इससे कर जमा नहीं होता।'],
    source: 'GST_PORTAL_GSTR1',
  },
  IFF: {
    en: ['Optional for QRMP filers in the first two months of a quarter.', 'Returns Dashboard → choose the month → Invoice Furnishing Facility.', 'Add B2B invoices you want your tenant to see early, then file with DSC/EVC.'],
    hi: ['QRMP करदाताओं के लिए तिमाही के पहले दो महीनों में वैकल्पिक।', 'Returns Dashboard → महीना चुनें → Invoice Furnishing Facility।', 'जो B2B बिल किरायेदार को जल्दी दिखाने हैं उन्हें जोड़ें, फिर DSC/EVC से फ़ाइल करें।'],
    source: 'GST_PORTAL_IFF',
  },
  'PMT-06': {
    en: ['QRMP filers pay tax for the first two months of a quarter using challan PMT-06.', 'Services → Payments → Create Challan; choose the fixed-sum or self-assessment method.', 'Pay by net banking/UPI/NEFT and keep the CPIN/CIN.'],
    hi: ['QRMP करदाता तिमाही के पहले दो महीनों का कर PMT-06 चालान से भरते हैं।', 'Services → Payments → Create Challan; निश्चित-राशि या स्व-मूल्यांकन तरीका चुनें।', 'नेट बैंकिंग/UPI/NEFT से भुगतान करें और CPIN/CIN रखें।'],
    source: 'GST_PORTAL_PMT06',
  },
  'GSTR-3B': {
    en: ['Returns Dashboard → choose the period → GSTR-3B.', 'Report outward taxable supplies (all your supplies, not just one property), reverse-charge inward supplies if any, and eligible ITC.', 'Offset liability using cash/credit ledger; pay any balance; file with DSC/EVC.'],
    hi: ['Returns Dashboard → अवधि चुनें → GSTR-3B।', 'सभी कर-योग्य बाहरी आपूर्तियाँ (केवल एक संपत्ति नहीं), रिवर्स चार्ज वाली आवक आपूर्ति, और पात्र ITC दर्ज करें।', 'कैश/क्रेडिट लेजर से देनदारी चुकाएँ; शेष जमा करें; DSC/EVC से फ़ाइल करें।'],
    source: 'GST_PORTAL_3B',
  },
  'CMP-08': {
    en: ['Composition taxpayers file CMP-08 quarterly to pay tax.', 'Returns Dashboard → choose the quarter → CMP-08 → fill and pay.'],
    hi: ['कंपोज़िशन करदाता हर तिमाही CMP-08 से कर भरते हैं।', 'Returns Dashboard → तिमाही चुनें → CMP-08 → भरें और जमा करें।'],
    source: 'GST_PORTAL_CMP08',
  },
  RENT_DUE: {
    en: ['Check the bank for this tenant\'s payment.', 'Record it in KirayaKhata and match it against the invoice and reported TDS.'],
    hi: ['इस किरायेदार का भुगतान बैंक में देखें।', 'इसे KirayaKhata में दर्ज करें और बिल व बताए गए TDS से मिलान करें।'],
  },
  TDS_CERT: {
    en: ['Ask the tenant for the TDS certificate for this period.', 'Check that the amount appears in your Form 26AS / AIS on the income-tax portal before relying on it.'],
    hi: ['इस अवधि का TDS प्रमाणपत्र किरायेदार से माँगें।', 'भरोसा करने से पहले आयकर पोर्टल पर अपने फ़ॉर्म 26AS / AIS में राशि जाँचें।'],
    source: 'ITD_TDS_FAQ',
  },
  ADVANCE_TAX: {
    en: ['Estimate your total income tax for the year (all income, not just rent).', 'Pay the cumulative instalment through e-Pay Tax on the income-tax portal (minor head 100).'],
    hi: ['वर्ष के कुल आयकर का अनुमान लगाएँ (केवल किराया नहीं, सारी आय)।', 'आयकर पोर्टल के e-Pay Tax से संचयी किस्त जमा करें (minor head 100)।'],
    source: 'ITD_TAX_PAYMENT_FAQ',
  },
  LEASE_EXPIRY: {
    en: ['Decide on renewal, revised rent or vacating.', 'Record the decision in KirayaKhata as a renewal or lease end so billing stays correct.'],
    hi: ['नवीनीकरण, नया किराया या खाली करने पर निर्णय लें।', 'बिलिंग सही रहे इसके लिए निर्णय को KirayaKhata में नवीनीकरण या समाप्ति के रूप में दर्ज करें।'],
  },
};

function applyExtension(form, period, due) {
  const ext = GST_FILING.extensions.find((e) => e.form === form && e.period === period);
  return ext ? { due: ext.newDue, extended: true, extensionSource: ext.source } : { due, extended: false };
}

function task(base) {
  return { status: 'upcoming', reviewFlag: base.ruleStatus === 'REQUIRES_CA_VERIFICATION', rulesetVersion: RULESET_VERSION, ...base };
}

/**
 * profile: { gstRegType:'regular'|'composition'|'unregistered', gstFilingFrequency:'monthly'|'qrmp', stateCode,
 *            agreements:[{id,label,dueDay,endDate,tenantTdsKind:'general'|'small_individual'|null, startDate}],
 *            advanceTax:{ estimatedTaxPaise, seniorNoBusiness } }
 * range: { from:'YYYY-MM-DD', to:'YYYY-MM-DD' }
 */
export function buildTasks(profile, range, { today, completions = {} } = {}) {
  const tasks = [];
  const fromP = periodOf(range.from);
  const toP = periodOf(range.to);
  // Return periods ending up to two months before the window can still fall due inside it.
  const periods = periodsBetween(addMonthsToPeriod(fromP, -3), toP);
  const gst = profile.gstRegType;

  if (gst === 'regular') {
    const qrmp = profile.gstFilingFrequency === 'qrmp';
    for (const p of periods) {
      const next = addMonthsToPeriod(p, 1);
      const pl = periodLabel(p);
      if (!qrmp) {
        const g1 = applyExtension('GSTR-1', p, clampDay(next, GST_FILING.monthly.gstr1Day));
        tasks.push(task({ key: `GSTR-1|${p}`, form: 'GSTR-1', title: 'File GSTR-1 (sales details)', period: p, periodLabel: pl, dueDate: g1.due, extended: g1.extended, responsibility: 'landlord', applicability: 'GST-registered, monthly filer', source: 'GST_PORTAL_GSTR1', portal: PORTALS.GST, ruleStatus: GST_FILING.status }));
        const g3 = applyExtension('GSTR-3B', p, clampDay(next, GST_FILING.monthly.gstr3bDay));
        tasks.push(task({ key: `GSTR-3B|${p}`, form: 'GSTR-3B', title: 'File GSTR-3B and pay GST', period: p, periodLabel: pl, dueDate: g3.due, extended: g3.extended, responsibility: 'landlord', applicability: 'GST-registered, monthly filer', source: 'GST_PORTAL_3B', portal: PORTALS.GST, ruleStatus: GST_FILING.status }));
      } else if (quarterEnd(p)) {
        const ql = quarterLabel(p);
        const g1 = applyExtension('GSTR-1', p, clampDay(next, GST_FILING.qrmp.gstr1Day));
        tasks.push(task({ key: `GSTR-1|${p}`, form: 'GSTR-1', title: 'File quarterly GSTR-1', period: p, periodLabel: ql, dueDate: g1.due, extended: g1.extended, responsibility: 'landlord', applicability: 'GST-registered, QRMP', source: 'GST_PORTAL_QRMP', portal: PORTALS.GST, ruleStatus: GST_FILING.status }));
        const day = QRMP_3B_CATEGORY_I.has(profile.stateCode) ? GST_FILING.qrmp.gstr3bDayCatI : GST_FILING.qrmp.gstr3bDayCatII;
        const g3 = applyExtension('GSTR-3B', p, clampDay(next, day));
        tasks.push(task({ key: `GSTR-3B|${p}`, form: 'GSTR-3B', title: 'File quarterly GSTR-3B and pay GST', period: p, periodLabel: ql, dueDate: g3.due, extended: g3.extended, responsibility: 'landlord', applicability: `QRMP, state category ${day === 22 ? 'I (22nd)' : 'II (24th)'}`, source: 'GST_PORTAL_QRMP', portal: PORTALS.GST, ruleStatus: GST_FILING.status }));
      } else {
        tasks.push(task({ key: `IFF|${p}`, form: 'IFF', title: 'Optional: upload B2B invoices (IFF)', period: p, periodLabel: pl, dueDate: clampDay(next, GST_FILING.qrmp.iffToDay), optional: true, responsibility: 'landlord', applicability: 'QRMP, first two months of the quarter — optional', source: 'GST_PORTAL_IFF', portal: PORTALS.GST, ruleStatus: GST_FILING.status }));
        tasks.push(task({ key: `PMT-06|${p}`, form: 'PMT-06', title: 'Pay GST for the month (PMT-06)', period: p, periodLabel: pl, dueDate: clampDay(next, GST_FILING.qrmp.pmt06Day), responsibility: 'landlord', applicability: 'QRMP, when tax is payable for the month', source: 'GST_PORTAL_PMT06', portal: PORTALS.GST, ruleStatus: GST_FILING.status }));
      }
    }
  } else if (gst === 'composition') {
    for (const p of periods) if (quarterEnd(p)) {
      tasks.push(task({ key: `CMP-08|${p}`, form: 'CMP-08', title: 'Pay composition tax (CMP-08)', period: p, periodLabel: quarterLabel(p), dueDate: clampDay(addMonthsToPeriod(p, 1), GST_FILING.composition.cmp08Day), responsibility: 'landlord', applicability: 'Composition scheme', source: 'GST_PORTAL_CMP08', portal: PORTALS.GST, ruleStatus: GST_FILING.status }));
    }
  }
  // Unregistered landlord: no GSTR-1/3B duties, even if a tenant pays reverse charge.

  for (const ag of profile.agreements || []) {
    for (const p of periods) {
      const b = periodBounds(p);
      if (ag.startDate && b.end < ag.startDate) continue;
      if (ag.endDate && b.start > ag.endDate) continue;
      tasks.push(task({ key: `RENT|${ag.id}|${p}`, form: 'Rent', title: `Rent due — ${ag.label}`, period: p, periodLabel: periodLabel(p), dueDate: clampDay(p, ag.dueDay || 7), responsibility: 'tenant', applicability: 'From your agreement', portal: null, guide: 'RENT_DUE', ruleStatus: 'AGREEMENT' }));
      if (ag.tenantTdsKind === 'general' && quarterEnd(p)) {
        // Certificate follow-up a little after quarterly statement timelines. Product reminder,
        // not a statutory deadline claim.
        const follow = clampDay(addMonthsToPeriod(p, 2), 15);
        tasks.push(task({ key: `TDSCERT|${ag.id}|${p}`, form: 'TDS certificate', title: `Ask ${ag.label} for the quarterly TDS certificate`, period: p, periodLabel: quarterLabel(p), dueDate: follow, responsibility: 'tenant', applicability: 'Tenant deducts TDS every month', source: 'ITD_TDS_FAQ', portal: PORTALS.INCOME_TAX, guide: 'TDS_CERT', ruleStatus: 'REMINDER' }));
      }
      if (ag.tenantTdsKind === 'small_individual' && (p.endsWith('-03') || (ag.endDate && periodOf(ag.endDate) === p))) {
        tasks.push(task({ key: `TDSCERT|${ag.id}|${p}`, form: 'TDS certificate', title: `Ask ${ag.label} for the yearly TDS certificate`, period: p, periodLabel: periodLabel(p), dueDate: clampDay(addMonthsToPeriod(p, 2), 15), responsibility: 'tenant', applicability: 'Tenant deducts once a year / at tenancy end', source: 'ITD_194IB', portal: PORTALS.INCOME_TAX, guide: 'TDS_CERT', ruleStatus: 'REMINDER' }));
      }
    }
    if (ag.endDate) {
      // With a notice period, remind a week before the last day to give notice; else 60 days ahead.
      const remind = ag.noticeMonths ? addDays(addMonths(ag.endDate, -ag.noticeMonths), -7) : addDays(ag.endDate, -60);
      tasks.push(task({ key: `LEASE|${ag.id}`, form: 'Agreement', title: `Agreement ends ${ag.endDate} — ${ag.label}`, period: periodOf(ag.endDate), periodLabel: periodLabel(periodOf(ag.endDate)), dueDate: remind, responsibility: 'landlord', applicability: ag.noticeMonths ? `Notice period ${ag.noticeMonths} month(s): decide before notice is due` : 'Reminder 60 days before the end date', portal: null, guide: 'LEASE_EXPIRY', ruleStatus: 'AGREEMENT' }));
    }
  }

  const at = profile.advanceTax;
  if (at && at.estimatedTaxPaise != null) {
    const applies = at.estimatedTaxPaise >= TDS_RULES.ADVANCE_TAX.minimumLiabilityPaise && !at.seniorNoBusiness;
    if (applies) {
      for (const y of new Set(periods.map((p) => Number(financialYearOf(`${p}-01`).slice(0, 4))))) {
        for (const inst of TDS_RULES.ADVANCE_TAX.instalments) {
          const yr = inst.month >= 4 ? y : y + 1;
          const due = `${yr}-${pad(inst.month)}-${pad(inst.day)}`;
          tasks.push(task({ key: `ADV|${due}`, form: 'Advance tax', title: `Advance tax: ${inst.cumulativePct}% of the year's estimate`, period: periodOf(due), periodLabel: `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`, dueDate: due, responsibility: 'landlord', applicability: 'You estimated tax of Rs. 10,000 or more after TDS', source: 'ITD_TAX_PAYMENT_FAQ', portal: PORTALS.INCOME_TAX, guide: 'ADVANCE_TAX', ruleStatus: TDS_RULES.ADVANCE_TAX.status }));
        }
      }
    }
  }

  const t = today || range.from;
  return tasks
    .filter((x) => x.dueDate >= range.from && x.dueDate <= range.to)
    .map((x) => {
      const done = completions[x.key];
      return { ...x, guide: x.guide || x.form, sourceInfo: x.source ? SOURCES[x.source] : null, status: done ? 'marked_done' : x.dueDate < t ? 'overdue' : 'upcoming', completion: done || null };
    })
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.key < b.key ? -1 : 1));
}

// ---------------- RFC 5545 ----------------
function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function fold(line) {
  // Fold at 75 octets (UTF-8 aware), continuation lines start with a space.
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = []; let cur = ''; let curBytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (curBytes + b > limit) { out.push(cur); cur = ''; curBytes = 0; }
    cur += ch; curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function toICS(tasks, { calName = 'KirayaKhata deadlines', stamp = '20260101T000000Z' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KirayaKhata//Local prototype//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(calName)}`, 'X-WR-TIMEZONE:Asia/Kolkata'];
  for (const t of tasks) {
    const d = t.dueDate.replace(/-/g, '');
    const next = addDays(t.dueDate, 1).replace(/-/g, '');
    const uid = `${t.key.replace(/[^A-Za-z0-9-]/g, '-')}@kirayakhata.local`;
    const desc = [`Period: ${t.periodLabel}`, `Responsibility: ${t.responsibility}`, `Why: ${t.applicability}`, t.portal ? `Portal: ${t.portal}` : '', t.sourceInfo ? `Source: ${t.sourceInfo.url}` : '', 'Snapshot from KirayaKhata — check the portal for official extensions.'].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${icsEscape(t.title)}`, `DESCRIPTION:${icsEscape(desc)}`, 'TRANSP:TRANSPARENT');
    if (t.portal) lines.push(`URL:${t.portal}`);
    for (const trig of ['-P5D', '-P1D']) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(t.title)}`, `TRIGGER:${trig}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
