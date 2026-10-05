// Renders the plain-language GST registration verdict (landing page + workspace).
import { msg } from '/shared/messages.js';
import { formatINR } from '/shared/money.js';
import { SOURCES } from '/shared/compliance-config.js';

const T = {
  en: { req: 'Registration needed', notreq: 'No registration needed', rev: 'Ask a CA before deciding', info: 'A few answers missing', yours: 'Your turnover this year', limit: 'Registration limit', left: 'Room left', over: 'Over the limit by',
    forward: 'You charge GST', rcm: 'Tenant pays GST (reverse charge)', exempt: 'Exempt (homes)', unknown: 'Not clear yet', why: 'Why', counted: 'How we counted', sources: 'Law used', ca: 'Rules marked for CA verification. This is guidance, not a legal opinion.',
    steps: 'What to do', s_req: ['Apply on gst.gov.in → Services → Registration → New Registration.', 'Keep PAN, Aadhaar, address proof of each property and bank details ready.', 'After you get the GSTIN, add it in KirayaKhata settings so invoices become tax invoices.'],
    s_near: ['Re-check when rent increases or you add a property.', 'KirayaKhata re-runs this check from your saved agreements.'], s_not: ['No action needed now.', 'Re-check every year or when your rentals change.'], kind: 'Type', use: 'Used as', tgst: 'Tenant GST-registered?', rent: 'Monthly rent + charges', remove: 'Remove' },
  hi: { req: 'पंजीकरण ज़रूरी', notreq: 'पंजीकरण ज़रूरी नहीं', rev: 'निर्णय से पहले CA से पूछें', info: 'कुछ उत्तर बाकी', yours: 'इस साल आपका टर्नओवर', limit: 'पंजीकरण सीमा', left: 'बची गुंजाइश', over: 'सीमा से अधिक',
    forward: 'GST आप लेते हैं', rcm: 'GST किरायेदार भरता है (रिवर्स चार्ज)', exempt: 'छूट (घर)', unknown: 'अभी स्पष्ट नहीं', why: 'क्यों', counted: 'हमने कैसे गिना', sources: 'लागू कानून', ca: 'नियम CA सत्यापन के लिए चिह्नित। यह मार्गदर्शन है, कानूनी राय नहीं।',
    steps: 'क्या करें', s_req: ['gst.gov.in → Services → Registration → New Registration पर आवेदन करें।', 'PAN, आधार, हर संपत्ति का पता-प्रमाण और बैंक विवरण तैयार रखें।', 'GSTIN मिलने के बाद उसे KirayaKhata सेटिंग में जोड़ें ताकि बिल टैक्स इनवॉइस बनें।'],
    s_near: ['किराया बढ़ने या नई संपत्ति जुड़ने पर फिर जाँचें।', 'KirayaKhata आपके सहेजे अनुबंधों से यह जाँच दोबारा चलाता है।'], s_not: ['अभी कुछ करने की ज़रूरत नहीं।', 'हर साल या किराये बदलने पर फिर जाँचें।'], kind: 'प्रकार', use: 'उपयोग', tgst: 'किरायेदार GST-पंजीकृत?', rent: 'मासिक किराया + शुल्क', remove: 'हटाएँ' },
};
export const regText = (lang, k) => (T[lang] || T.en)[k];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lakh = (p) => formatINR(p, { decimals: false });

export function renderRegistration(r, lang = 'en') {
  const L = T[lang] || T.en;
  const headline = { REQUIRED: ['req', L.req], NOT_REQUIRED: ['ok', L.notreq], REVIEW: ['rev', L.rev], NEEDS_MORE_INFORMATION: ['rev', L.info] }[r.verdict];
  const pct = Math.min(100, (r.aggregatePaise / r.thresholdPaise) * 100);
  const fillCls = r.aggregatePaise > r.thresholdPaise ? 'over' : r.usedPct >= 80 ? 'near' : '';
  const params = { total: lakh(r.aggregatePaise), limit: lakh(r.thresholdPaise), left: lakh(Math.max(0, r.headroomPaise)), over: lakh(Math.max(0, -r.headroomPaise)), forward: lakh(r.buckets.forward) };
  const b = r.buckets; const tot = r.aggregatePaise || 1;
  const seg = (v, c) => (v > 0 ? `<i style="width:${((v / tot) * 100).toFixed(1)}%;background:${c}"></i>` : '');
  const notes = ['REG_HOW_COUNTED', ...(r.specialState ? ['REG_SPECIAL'] : []), ...r.reviewNotes.map((n) => `REG_${n}`), ...(r.verdict === 'NOT_REQUIRED' ? ['REG_VOLUNTARY'] : [])];
  const todo = r.verdict === 'REQUIRED' ? L.s_req : r.code === 'REG_BELOW_NEAR' ? L.s_near : r.verdict === 'NOT_REQUIRED' ? L.s_not : [];
  return `<p class="eyebrow" style="color:var(--ink-muted);margin-bottom:4px">${esc(L.limit)}: ${esc(lakh(r.thresholdPaise))}</p>
    <p class="verdict ${headline[0]}">${esc(headline[1])}</p>
    <p style="margin:0">${esc(msg(r.code, lang, params))}</p>
    <div class="meter" role="img" aria-label="${esc(`${L.yours} ${params.total} / ${L.limit} ${params.limit}`)}"><span class="fill ${fillCls}" style="width:${pct.toFixed(1)}%"></span></div>
    <div class="meter-scale"><span>Rs. 0</span><span>${esc(r.usedPct)}%</span><span>${esc(params.limit)}</span></div>
    <div class="stat-grid"><div class="stat"><span>${esc(L.yours)}</span><b>${esc(params.total)}</b></div><div class="stat"><span>${esc(L.limit)}</span><b>${esc(params.limit)}</b></div><div class="stat"><span>${esc(r.headroomPaise >= 0 ? L.left : L.over)}</span><b>${esc(r.headroomPaise >= 0 ? params.left : params.over)}</b></div></div>
    <div class="bucket-bar" aria-hidden="true">${seg(b.forward, 'var(--ledger)')}${seg(b.rcm, 'var(--violet)')}${seg(b.exempt, 'var(--paid)')}${seg(b.unknown, '#B7BCC9')}</div>
    <div class="legend"><span><i style="background:var(--ledger)"></i>${esc(L.forward)} ${esc(lakh(b.forward))}</span><span><i style="background:var(--violet)"></i>${esc(L.rcm)} ${esc(lakh(b.rcm))}</span><span><i style="background:var(--paid)"></i>${esc(L.exempt)} ${esc(lakh(b.exempt))}</span>${b.unknown ? `<span><i style="background:#B7BCC9"></i>${esc(L.unknown)} ${esc(lakh(b.unknown))}</span>` : ''}</div>
    ${todo.length ? `<h3 class="h3" style="font-size:1.05rem;margin:18px 0 6px">${esc(L.steps)}</h3><ol class="reasons">${todo.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
    <details class="why" style="margin-top:12px"><summary>${esc(L.counted)}</summary><ul class="reasons">${notes.map((n) => `<li>${esc(msg(n, lang))}</li>`).join('')}</ul>
    <p class="small muted">${esc(L.sources)}: ${r.sources.map((k) => SOURCES[k] ? `<a href="${esc(SOURCES[k].url)}" target="_blank" rel="noopener noreferrer">${esc(SOURCES[k].title)}</a>` : '').join(' · ')}</p></details>
    <p class="small muted" style="margin-top:10px">${esc(L.ca)}</p>`;
}
