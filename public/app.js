// Landing page controller. All numbers come from the shared deterministic engine.
import { initLang, t, lang } from './i18n.js';
import { initReveals, heroSequence, initParallax, initRoutine, initFeatureRows, initFAQ, revealRows } from './motion.js';
import { closeMonth, SUPPORTED } from '/shared/rules.js';
import { msg } from '/shared/messages.js';
import { formatINR, rupeesToPaise } from '/shared/money.js';
import { EXAMPLE_CLOSE_MONTH, sampleWorkspace } from '/shared/examples.js';
import { STATES, RULESET_VERSION, SOURCES } from '/shared/compliance-config.js';
import { computePeriodCharges, buildDocuments } from '/shared/billing.js';
import { nextChangeAfter, amountOn } from '/shared/escalation.js';
import { buildTasks, toICS, GUIDES } from '/shared/calendar.js';
import { createMemoryRepo } from '/shared/memory-repo.js';
import { generateBillingForPeriod } from '/shared/billing-service.js';
import { periodLabel, formatDate, todayIST, addMonthsToPeriod, periodBounds, periodOf } from '/shared/dates.js';
import { makeZip } from '/shared/zip.js';
import { renderInvoiceHTML, pdfBytes, invoiceFileName, downloadBlob } from './pdf.js';
import { buildYearData, ledgerCSV, buildPackZip } from './js/exports.js';
import { checkRegistration } from '/shared/registration.js';
import { renderRegistration, regText } from './js/registration-ui.js';
import { financialYearOf } from '/shared/dates.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const INR = (p) => (p === null || p === undefined ? '—' : formatINR(p));
const TODAY = todayIST();
const PERIOD_NOW = periodOf(TODAY);

export function toast(text, kind = '') {
  const reg = $('#toasts'); if (!reg) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(text)}</span><button type="button" aria-label="Close">×</button>`;
  el.querySelector('button').onclick = () => el.remove();
  reg.appendChild(el); setTimeout(() => el.remove(), 6500);
}

// ---------------- Sample workspace (fictional) ----------------
const WS = sampleWorkspace();
const byId = (list, id) => list.find((x) => x.id === id);
function sampleDocs(agreementId, period, inputs = {}) {
  const ag = byId(WS.agreements, agreementId);
  const versions = WS.versions.filter((v) => v.agreementId === agreementId);
  const charges = computePeriodCharges({ agreement: ag, versions, period, inputs });
  if (charges.status !== 'READY') return { charges, docs: [] };
  const version = versions[versions.length - 1];
  const docs = buildDocuments({ agreement: ag, version, supplier: WS.suppliers[0], tenant: byId(WS.tenants, ag.tenantId), property: byId(WS.properties, ag.propertyId), period, charges });
  return { charges, docs, ag, version };
}
const snapshotFor = (ag, templateId) => {
  const p = byId(WS.properties, ag.propertyId);
  return { supplier: WS.suppliers[0], tenant: byId(WS.tenants, ag.tenantId), property: { ...p, unitLabel: p.units.find((u) => u.id === ag.unitId)?.label }, agreement: { reference: ag.reference }, templateId };
};

// ---------------- Panes & feature previews ----------------
function statusChip(status) {
  if (status === SUPPORTED) return `<span class="chip chip-ok">${esc(t('supported'))}</span>`;
  if (status === 'NEEDS_MORE_INFORMATION') return `<span class="chip chip-warn">${esc(t('needsInfo'))}</span>`;
  return `<span class="chip chip-review">${esc(t('needsReview'))}</span>`;
}

function renderPanes() {
  const L = lang();
  const lake = byId(WS.agreements, 'agr_lake');
  const v = WS.versions.find((x) => x.agreementId === 'agr_lake');
  const nxt = nextChangeAfter(v.terms.rent, TODAY);
  const set = (k, html) => $$(`[data-render="${k}"]`).forEach((el) => { el.innerHTML = html; });
  set('pane-agreement', `<table class="mini-table"><tbody>
    <tr><th>${L === 'hi' ? 'संपत्ति' : 'Property'}</th><td class="r">Lake View Office · Unit 2B</td></tr>
    <tr><th>${L === 'hi' ? 'किरायेदार' : 'Tenant'}</th><td class="r">Northwind Logistics (demo)</td></tr>
    <tr><th>${t('rent')}</th><td class="r">${INR(amountOn(v.terms.rent, TODAY).amountPaise)}</td></tr>
    <tr><th>${L === 'hi' ? 'मेंटेनेंस' : 'Maintenance'}</th><td class="r">${INR(v.terms.maintenance.amountPaise)}</td></tr>
    <tr><th>${t('escal')}</th><td class="r">${nxt ? `${esc(formatDate(nxt.date, L))} → ${INR(nxt.amountPaise)}` : '—'}</td></tr>
    <tr><th>${t('nextBill')}</th><td class="r">${esc(formatDate(`${addMonthsToPeriod(PERIOD_NOW, 1)}-01`, L))}</td></tr>
    <tr><th>${L === 'hi' ? 'लीज़' : 'Lease'}</th><td class="r">${esc(formatDate(lake.startDate, L))} – ${esc(formatDate(lake.endDate, L))}</td></tr></tbody></table>`);
  const { docs } = sampleDocs('agr_lake', PERIOD_NOW);
  set('pane-invoices', `<table class="mini-table"><thead><tr><th>${L === 'hi' ? 'दस्तावेज़' : 'Document'}</th><th class="r">${L === 'hi' ? 'कर' : 'Tax'}</th><th class="r">${L === 'hi' ? 'कुल' : 'Total'}</th></tr></thead><tbody>${docs.map((d) => `<tr><td>${esc(d.title)}<br><small class="muted">${esc(d.documentTitle)}</small></td><td class="r">${INR(d.landlordTaxPaise)}</td><td class="r">${INR(d.totalPaise)}</td></tr>`).join('')}</tbody></table><p class="small muted" style="margin:10px 0 0">${L === 'hi' ? 'दो अलग नंबर, दो अलग PDF।' : 'Two numbers, two PDFs, one billing group.'}</p>`);
  set('pane-share', `<div class="notice info" style="font-size:.92rem"><b>${L === 'hi' ? 'विषय' : 'Subject'}:</b> ${esc(t('mailSubject', { period: periodLabel(PERIOD_NOW, L) }))}<br>${docs.map((d) => `${esc(d.title)} — ${INR(d.totalPaise)}`).join('<br>')}</div><p class="small muted" style="margin:10px 0 0">${esc(t('copyOk'))}</p>`);
  const cm = closeMonth(EXAMPLE_CLOSE_MONTH);
  set('pane-match', reconTable(cm, false) + `<div class="result-status">${cm.arithmetic === 'MATCH' ? `<span class="chip chip-ok">${esc(t('amountsMatch'))}</span>` : ''}${statusChip(cm.taxReview)}</div>`);
  const tasks = buildTasks({ gstRegType: 'regular', gstFilingFrequency: 'monthly', stateCode: '19', agreements: [{ id: 'agr_lake', label: 'Unit 2B', dueDay: 7, startDate: lake.startDate, endDate: lake.endDate, tenantTdsKind: 'general' }] }, { from: TODAY, to: periodBounds(addMonthsToPeriod(PERIOD_NOW, 2)).end }, { today: TODAY }).slice(0, 4);
  const taskRows = `<table class="mini-table"><tbody>${tasks.map((x) => `<tr><td>${esc(x.title)}<br><small class="muted">${esc(x.periodLabel)} · ${x.responsibility === 'landlord' ? esc(t('landlord')) : esc(t('tenant'))}</small></td><td class="r">${esc(formatDate(x.dueDate, L))}</td></tr>`).join('')}</tbody></table>`;
  set('pane-next', taskRows);
  const yearItems = [t('rent') + ' ledger (CSV)', L === 'hi' ? 'बिल और रसीद सूची' : 'Invoice & receipt index', L === 'hi' ? 'महीनेवार GST' : 'GST treatment by month', L === 'hi' ? 'बताया गया TDS (असत्यापित)' : 'Reported TDS (unverified)', L === 'hi' ? 'गायब दस्तावेज़ों की सूची' : 'Missing-document checklist'];
  set('pane-year', `<ul class="reasons">${yearItems.map((i) => `<li>${esc(i)}</li>`).join('')}</ul><p class="small muted">${L === 'hi' ? 'यह आयकर रिटर्न नहीं है।' : 'Not an income-tax return.'}</p>`);
  // Feature previews
  const rentDoc = docs.find((d) => d.category === 'rent');
  const featInv = rentDoc ? `<div style="max-width:420px;margin:auto">${renderInvoiceHTML({ doc: rentDoc, snapshot: snapshotFor(lake, 'modern'), draftNumber: 'DRAFT-DEMO-R', demo: true })}</div>` : '';
  set('feat-0', featInv);
  const sched = WS.agreements.map((a) => {
    const vv = WS.versions.find((x) => x.agreementId === a.id);
    const n = nextChangeAfter(vv.terms.rent, TODAY);
    const usage = vv.terms.dg?.basis === 'usage';
    return `<tr><td>${esc(byId(WS.properties, a.propertyId).name)}<br><small class="muted">${L === 'hi' ? 'बिल दिन' : 'Bill day'} ${vv.terms.billingDay} · ${esc(vv.terms.rent.escalation.type)}</small></td><td class="r">${INR(amountOn(vv.terms.rent, TODAY).amountPaise)}<br><small class="muted">${n ? `${esc(formatDate(n.date, L))} → ${INR(n.amountPaise)}` : ''}</small></td><td class="r">${usage ? `<span class="chip chip-warn">${L === 'hi' ? 'रीडिंग चाहिए' : 'Needs reading'}</span>` : `<span class="chip chip-ok">${L === 'hi' ? 'तैयार' : 'Ready'}</span>`}</td></tr>`;
  }).join('');
  set('feat-1', `<table class="mini-table"><tbody>${sched}</tbody></table><p class="foot">${L === 'hi' ? 'एक क्लिक में सभी तैयार संपत्तियों के ड्राफ़्ट; एक महीने के लिए कभी दो बार नहीं।' : 'One click drafts every ready property; never twice for the same month.'}</p>`);
  set('feat-2', reconTable(cm, false) + `<p class="foot">${esc(msg('TDS_REPORTED_ONLY', L))}</p>`);
  set('feat-3', taskRows + `<p class="foot">${L === 'hi' ? 'आज की तारीख़ से गणना; नियम CA सत्यापन के लिए चिह्नित।' : 'Computed from today; rules marked for CA verification.'}</p>`);
  set('feat-4', `<ul class="reasons">${yearItems.map((i) => `<li>${esc(i)}</li>`).join('')}</ul><p class="foot">${L === 'hi' ? 'नीचे नमूना पैक डाउनलोड करें।' : 'Download the sample pack below.'}</p>`);
  $$('.inline-preview').forEach((el) => { el.innerHTML = `<div class="preview-panel">${$(`[data-render="feat-${el.dataset.inline}"]`).innerHTML}</div>`; });
}

function reconTable(r, animate) {
  const row = (op, label, val, cls = '') => `<tr class="${animate ? 'reveal-row ' : ''}${cls}"><td class="op">${op}</td><td>${esc(label)}</td><td class="r">${val}</td></tr>`;
  let gstLabel = t('gstCollected'); let gstVal = INR(r.gst.landlordCollectsPaise);
  if (r.gst.treatment === 'REVERSE_CHARGE') { gstLabel = t('gstRcm'); gstVal = `(${INR(r.gst.tenantRcmPaise)})`; }
  if (r.gst.treatment === 'EXEMPT') gstVal = t('exempt');
  if (r.gst.treatment === 'NO_GST_UNREGISTERED') gstVal = t('noGst');
  if (r.gst.treatment === 'UNDETERMINED') gstVal = '?';
  return `<table class="recon"><tbody>
    ${row('', t('rent'), INR(r.rentPaise))}
    ${row('+', gstLabel, gstVal)}
    ${row('=', t('invoiceValue'), INR(r.invoiceValuePaise), 'total')}
    ${row('−', r.reportedTdsPaise !== null ? t('tdsReported') : t('tdsExpected'), INR(r.tdsUsedPaise))}
    ${row('=', t('expected'), INR(r.expectedReceiptPaise), 'total')}
    ${row('', t('actual'), INR(r.actualReceiptPaise))}
    ${row('±', t('difference'), r.differencePaise === null ? '—' : (r.differencePaise > 0 ? '+' : '') + formatINR(r.differencePaise), 'diff')}
  </tbody></table>`;
}

// ---------------- Demo (#demo) ----------------
const form = () => $('#close-form');
let stepIdx = 0;
let lastInput = null;

function fillStates(sel, value = '19') {
  sel.innerHTML = Object.entries(STATES).filter(([c]) => c !== '97').map(([c, n]) => `<option value="${c}"${c === value ? ' selected' : ''}>${esc(n)}</option>`).join('');
}

function showStep(i) {
  stepIdx = i;
  $$('.form-step', form()).forEach((s) => { s.hidden = Number(s.dataset.fstep) !== i; });
  $$('.steps-nav li', form()).forEach((li, j) => { li.classList.toggle('on', j === i); li.classList.toggle('done', j < i); });
  $('[data-back]', form()).hidden = i === 0;
  $('[data-next]', form()).hidden = i === 2;
  $('[data-submit]', form()).hidden = i !== 2;
  $('#form-error').hidden = true;
  updateConditional();
}

function updateConditional() {
  const f = form(); const kind = f.kind.value; const tg = f.tgst.value; const use = f.use.value;
  $('[data-show-if="kind=residential_dwelling"]', f).hidden = kind !== 'residential_dwelling';
  $('[data-show-if="proprietor"]', f).hidden = !(kind === 'residential_dwelling' && use === 'residence' && (tg === 'regular' || tg === 'composition'));
}

function openForm({ example = false } = {}) {
  $('#demo-start').hidden = true;
  const f = form(); f.hidden = false; f.reset();
  fillStates(f.state);
  f.period.value = example ? EXAMPLE_CLOSE_MONTH.period : addMonthsToPeriod(PERIOD_NOW, -1);
  if (example) {
    f.lgst.value = 'regular'; f.kind.value = 'commercial'; f.tgst.value = 'regular'; f.cat.value = 'company';
    f.rent.value = '1,00,000'; f.recv.value = '1,08,000'; f.tds.value = '10,000';
  }
  showStep(example ? 2 : 0);
  if (!example) f.querySelector('input,select').focus();
}

function readForm() {
  const f = form(); const errs = [];
  const need = (name, ok) => { if (!ok) errs.push(name); };
  need('lgst', f.lgst.value); need('kind', f.kind.value); need('tgst', f.tgst.value); need('cat', f.cat.value);
  if (f.kind.value === 'residential_dwelling') need('use', f.use.value);
  let rent; let recv = null; let tds = null;
  try { rent = rupeesToPaise(f.rent.value); if (!(rent > 0)) throw 0; } catch { errs.push('rent'); }
  try { if (f.recv.value.trim()) recv = rupeesToPaise(f.recv.value); } catch { errs.push('recv'); }
  try { if (f.tds.value.trim()) tds = rupeesToPaise(f.tds.value); } catch { errs.push('tds'); }
  if (!/^\d{4}-\d{2}$/.test(f.period.value)) errs.push('period');
  const prop = $('[data-show-if="proprietor"]', f).hidden ? null : f.prop.value === 'yes' ? true : f.prop.value === 'no' ? false : null;
  return {
    errs,
    input: {
      period: f.period.value,
      landlord: { gstRegType: f.lgst.value || 'unknown', stateCode: f.state.value, resident: true, panAvailable: true },
      tenant: { gstRegType: f.tgst.value || 'unknown', stateCode: f.state.value, category: f.cat.value || 'unknown', proprietorOwnResidence: prop },
      property: { kind: f.kind.value || 'unknown', use: f.kind.value === 'commercial' ? 'business' : (f.use.value || 'unknown'), stateCode: f.state.value },
      assetKind: 'land_building', special: [], rentPaise: rent, receivedPaise: recv, reportedTdsPaise: tds,
      note: f.note.value.trim() || undefined,
    },
  };
}

function stepFields(i) { return [['lgst', 'state'], ['kind', 'use', 'tgst', 'prop', 'cat'], ['period', 'rent', 'recv', 'tds']][i]; }

function validateStep(i) {
  const { errs } = readForm();
  const mine = errs.filter((e) => stepFields(i).includes(e));
  const err = $('#form-error');
  if (mine.length) { err.textContent = t('validation', { fields: mine.map((m) => fieldLabel(m)).join(', ') }); err.hidden = false; return false; }
  err.hidden = true; return true;
}
function fieldLabel(name) {
  const map = { lgst: 'q.gst', state: 'q.state', kind: 'q.kind', use: 'q.use', tgst: 'q.tgst', cat: 'q.cat', rent: 'q.rent', recv: 'q.recv', tds: 'q.tds', period: 'q.period' };
  const el = document.querySelector(`[data-i18n="${map[name]}"]`);
  return el ? el.textContent.replace(/\?$/, '') : name;
}

async function runCheck(input, { sample = false } = {}) {
  lastInput = { input, sample };
  const res = $('#result');
  const local = closeMonth({ ...input, note: undefined });
  renderResult(local, null, 'provisional');
  res.setAttribute('aria-busy', 'true');
  try {
    const r = await fetch('/api/close-month', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, sample, lang: lang() }) });
    const body = await r.json();
    if (r.status === 200) renderResult(body.result, body.explanation, 'server', body.remaining);
    else if (r.status === 429) renderResult(local, null, 'limit', 0, body.resetAt);
    else if (r.status === 422) res.innerHTML = `<div class="notice review"><b>${esc(t('refused'))}</b><br>${esc(body.message)}</div>`;
    else if (r.status === 400) res.innerHTML = `<div class="notice review">${esc(t('validation', { fields: (body.issues || []).map((i) => i.path).join(', ') }))}</div>`;
    else renderResult(local, null, 'offline');
  } catch { renderResult(local, null, 'offline'); }
  res.removeAttribute('aria-busy');
  loadStats();
}

function renderResult(r, explanation, mode, remaining, resetAt) {
  const L = lang(); const res = $('#result');
  const arith = { MATCH: ['chip-ok', t('amountsMatch')], SHORT: ['chip-review', t('short')], EXCESS: ['chip-warn', t('excess')], CANNOT_COMPUTE: ['chip-neutral', t('cannot')], AWAITING_RECEIPT: ['chip-neutral', t('awaiting')] }[r.arithmetic];
  const modeNote = { provisional: t('provisional'), server: t('serverWins'), offline: t('offline'), limit: t('limit', { time: resetAt ? new Date(resetAt).toLocaleTimeString() : '' }) }[mode];
  const missing = [...r.gst.missing, ...r.tds.missing];
  const reasons = [...r.gst.reasons, ...r.tds.reasons, ...r.flags].map((x) => `<li>${esc(msg(x.code, L, x.params))}</li>`).join('');
  const nexts = (explanation?.nextActions || r.nextActions.map((c) => msg(c, L))).map((a) => `<li>${esc(a)}</li>`).join('');
  res.innerHTML = `
    <p class="provisional">${esc(modeNote)}${remaining !== undefined && mode === 'server' ? ' · ' + esc(t('remaining', { n: remaining })) : ''}</p>
    <div class="result-status"><span class="chip ${arith[0]}">${esc(arith[1])}</span>${statusChip(r.taxReview)}<span class="chip chip-neutral">${esc(periodLabel(r.financialYear ? lastInput.input.period : PERIOD_NOW, L))}</span></div>
    ${r.arithmetic === 'SHORT' || r.arithmetic === 'EXCESS' ? `<p><b>${esc(msg(r.arithmeticMessage.code, L, r.arithmeticMessage.params))}</b></p>` : ''}
    ${reconTable(r, true)}
    ${missing.length ? `<div class="notice warn"><b>${esc(t('openQuestions'))}</b><ul class="reasons">${missing.map((m) => `<li>${esc(msg(m.code, L))}</li>`).join('')}</ul></div>` : ''}
    <details class="why" open><summary>${esc(t('why'))}</summary><ul class="reasons">${reasons}</ul>${explanation?.source === 'gemini' ? `<p class="small muted">${esc(explanation.summary)}</p>` : ''}<p class="small muted">Ruleset ${esc(r.rulesetVersion)} · ${esc(t('ruleCA'))}</p></details>
    <h3 class="h3" style="font-size:1.1rem;margin:16px 0 6px">${esc(t('next'))}</h3><ol class="reasons">${nexts}</ol>`;
  if (mode !== 'provisional') revealRows(res); else res.querySelectorAll('.reveal-row').forEach((x) => x.classList.add('shown'));
  if (mode === 'server' || mode === 'offline') res.focus({ preventScroll: true });
}

function initDemo() {
  const f = form();
  $('#btn-example').addEventListener('click', () => { openForm({ example: true }); runCheck(EXAMPLE_CLOSE_MONTH, { sample: true }); });
  $('#btn-own').addEventListener('click', () => openForm());
  $$('[data-load-example]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); closeMenu(); $('#demo').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); history.replaceState(null, '', '#demo'); $('#btn-example').click(); }));
  $$('[data-open-own]').forEach((b) => b.addEventListener('click', () => { closeMenu(); $('#demo').scrollIntoView({ behavior: 'smooth' }); openForm(); }));
  $('[data-next]', f).addEventListener('click', () => { if (validateStep(stepIdx)) showStep(stepIdx + 1); });
  $('[data-back]', f).addEventListener('click', () => showStep(Math.max(0, stepIdx - 1)));
  const placeholder = $('#result-placeholder');
  $('[data-reset]', f).addEventListener('click', () => { f.hidden = true; $('#demo-start').hidden = false; $('#result').replaceChildren(placeholder); lastInput = null; });
  f.addEventListener('change', updateConditional);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const { errs, input } = readForm();
    if (errs.length) { const err = $('#form-error'); err.textContent = t('validation', { fields: errs.map(fieldLabel).join(', ') }); err.hidden = false; return; }
    runCheck(input);
  });
  document.addEventListener('kk:lang', () => { if (lastInput && $('#result .recon')) renderResult(closeMonth({ ...lastInput.input, note: undefined }), null, 'server'); });
}

async function loadStats() {
  try {
    const r = await fetch('/api/stats'); if (!r.ok) return;
    const s = await r.json();
    $('#usage-empty').hidden = !s.empty;
    $$('[data-usage]').forEach((e) => { e.hidden = s.empty; });
    if (!s.empty) {
      $('#u-rent').textContent = formatINR(s.rentCheckedPaise, { decimals: false });
      $('#u-months').textContent = String(s.monthsClosed);
      $('#u-caught').textContent = formatINR(s.caughtPaise, { decimals: false });
      $('#u-caught').title = s.definitions.caught;
      $('#u-common').textContent = (s.mostCommonTreatment || '—').replace(/_/g, ' ').toLowerCase();
    }
  } catch { /* server offline: keep honest empty state */ }
}

// ---------------- Invoice studio ----------------
let studioDocs = [];
function studioState() {
  const f = $('#studio-form'); const err = $('#st-error');
  let rent; let maint; let dg;
  try { rent = rupeesToPaise(f.rent.value || '0'); maint = rupeesToPaise(f.maint.value || '0'); dg = rupeesToPaise(f.dgamt.value || '0'); err.hidden = true; } catch { err.textContent = t('badAmount'); err.hidden = false; return null; }
  const period = /^\d{4}-\d{2}$/.test(f.period.value) ? f.period.value : '2026-10';
  const base = WS.versions.find((v) => v.agreementId === 'agr_lake');
  const terms = { ...base.terms, documentMode: f.mode.value, templateId: f.tpl.value,
    rent: { basis: 'fixed', amountPaise: rent, escalation: { type: 'none' } },
    maintenance: { ...base.terms.maintenance, amountPaise: maint, escalation: { type: 'none' } },
    dg: f.dg.checked ? { basis: 'fixed', amountPaise: dg, description: 'DG / generator charges', itemTax: null, escalation: { type: 'none' } } : { basis: 'none' } };
  const ag = { ...byId(WS.agreements, 'agr_lake'), startDate: '2017-07-01', endDate: null };
  const version = { ...base, effectiveFrom: '2017-07-01', terms };
  const supplier = { ...WS.suppliers[0], gstRegType: f.gst.value, gstin: f.gst.value === 'regular' ? WS.suppliers[0].gstin : '' };
  const charges = computePeriodCharges({ agreement: ag, versions: [version], period });
  const docs = charges.status === 'READY' ? buildDocuments({ agreement: ag, version, supplier, tenant: byId(WS.tenants, ag.tenantId), property: byId(WS.properties, ag.propertyId), period, charges }) : [];
  const snap = { ...snapshotFor(ag, f.tpl.value), supplier };
  return docs.map((doc) => ({ doc, snapshot: snap, draftNumber: `DRAFT-DEMO-${doc.category.slice(0, 1).toUpperCase()}${period.replace('-', '')}`, demo: true, status: 'draft' }));
}

function renderStudio() {
  const s = studioState(); if (!s) return;
  studioDocs = s;
  const wrap = $('#studio-previews');
  if (!s.length) { wrap.innerHTML = `<div class="notice">${esc(t('noDoc'))}</div>`; return; }
  wrap.innerHTML = s.map((inv) => `<div class="preview-wrap"><div class="cap"><span><b>${esc(inv.doc.title)}</b> · ${INR(inv.doc.totalPaise)}</span>${inv.doc.taxStatus === SUPPORTED ? `<span class="chip chip-ok">${esc(t('readyDoc'))}</span>` : `<span class="chip chip-review">${esc(t('reviewDoc'))}</span>`}</div><div class="sheet-stack in">${renderInvoiceHTML(inv)}</div></div>`).join('');
  $('[data-dl="rent"]').disabled = !s.some((i) => i.doc.category === 'rent' || i.doc.category === 'combined');
  $('[data-dl="maintenance"]').disabled = !s.some((i) => i.doc.category === 'maintenance');
}

function initStudio() {
  const f = $('#studio-form');
  f.addEventListener('input', renderStudio);
  f.addEventListener('change', () => { $('#st-dg-wrap').hidden = !f.dg.checked; renderStudio(); });
  $$('[data-dl]').forEach((b) => b.addEventListener('click', () => {
    try {
      const k = b.dataset.dl;
      if (k === 'zip') {
        const files = studioDocs.map((inv) => ({ name: invoiceFileName(inv), data: pdfBytes(inv) }));
        downloadBlob(makeZip(files), `KirayaKhata-demo-invoices-${studioDocs[0]?.doc.period}.zip`, 'application/zip');
        toast(t('zipNote'));
        return;
      }
      const inv = studioDocs.find((i) => i.doc.category === k || (k === 'rent' && i.doc.category === 'combined'));
      if (!inv) return;
      downloadBlob(new Blob([pdfBytes(inv)], { type: 'application/pdf' }), invoiceFileName(inv));
      toast(t('downloaded', { name: invoiceFileName(inv) }));
    } catch (e) { toast(e.message, 'error'); }
  }));
  $('[data-mail]').addEventListener('click', () => {
    const p = studioDocs[0]?.doc.period || PERIOD_NOW;
    const subject = t('mailSubject', { period: periodLabel(p, 'en') });
    const body = ['Dear Sir/Madam,', '', `Please find attached the invoices for ${periodLabel(p, 'en')}:`, ...studioDocs.map((i) => `- ${i.doc.title}: ${i.draftNumber}, period ${i.doc.servicePeriod.from} to ${i.doc.servicePeriod.to}, amount due ${formatINR(i.doc.totalPaise)}`), '', '[Attach the downloaded PDF files before sending]', '', 'Regards'].join('\n');
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    toast(t('copyOk'));
  });
  renderStudio();
}

// ---------------- Calendar ----------------
let calMonth = PERIOD_NOW;
const DONE_KEY = 'kk:landing-cal-done';
const readDone = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch { return {}; } };
const writeDone = (d) => { try { localStorage.setItem(DONE_KEY, JSON.stringify(d)); } catch { toast('Browser storage is blocked — "done" marks will not be remembered.', 'error'); } };

function calProfile() {
  const lake = byId(WS.agreements, 'agr_lake');
  return { gstRegType: $('#c-gst').value, gstFilingFrequency: $('#c-freq').value, stateCode: $('#c-state').value, agreements: [{ id: 'demo', label: 'Unit 2B (sample)', dueDay: 7, startDate: lake.startDate, endDate: lake.endDate, tenantTdsKind: 'general' }] };
}

function renderCalendar() {
  const L = lang();
  $('#c-freq').closest('.field').hidden = $('#c-gst').value !== 'regular';
  const b = periodBounds(calMonth);
  const tasks = buildTasks(calProfile(), { from: b.start, to: periodBounds(addMonthsToPeriod(calMonth, 1)).end }, { today: TODAY, completions: readDone() });
  $('#cal-month-label').textContent = periodLabel(calMonth, L);
  const first = new Date(Date.UTC(b.year, b.month - 1, 1)).getUTCDay();
  const offset = (first + 6) % 7;
  const days = L === 'hi' ? ['सो', 'मं', 'बु', 'गु', 'शु', 'श', 'र'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  let cells = ''; let d = 1;
  for (let w = 0; w < 6 && d <= b.days; w++) {
    cells += '<tr>';
    for (let i = 0; i < 7; i++) {
      if ((w === 0 && i < offset) || d > b.days) { cells += '<td></td>'; continue; }
      const iso = `${calMonth}-${String(d).padStart(2, '0')}`;
      const due = tasks.filter((x) => x.dueDate === iso);
      const label = due.length ? `${formatDate(iso, L)}: ${due.map((x) => x.title).join('; ')}` : formatDate(iso, L);
      cells += `<td><span class="d${due.length ? ' has' : ''}${due.some((x) => x.responsibility === 'landlord') ? ' landlord' : ''}${iso === TODAY ? ' today' : ''}" aria-label="${esc(label)}">${d}${due.length ? `<span class="dots" aria-hidden="true">${due.slice(0, 3).map(() => '<i></i>').join('')}</span>` : ''}</span></td>`;
      d++;
    }
    cells += '</tr>';
  }
  $('#cal-month').innerHTML = `<table class="month"><caption class="sr-only">${esc(periodLabel(calMonth, L))}</caption><thead><tr>${days.map((x) => `<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table>`;
  const list = tasks.filter((x) => x.dueDate >= b.start).slice(0, 8);
  $('#cal-tasks').innerHTML = list.length ? list.map((x) => taskCard(x, L)).join('') : `<li class="task">${esc(t('noTasks'))}</li>`;
  $$('#cal-tasks [data-done]').forEach((btn) => btn.addEventListener('click', () => {
    const done = readDone(); const k = btn.dataset.done;
    if (done[k]) delete done[k]; else done[k] = { markedAt: new Date().toISOString(), ackRef: ($(`[data-ack="${CSS.escape(k)}"]`)?.value || '').slice(0, 40) };
    writeDone(done); renderCalendar();
  }));
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) $$('#cal-tasks .task').forEach((el, i) => el.animate?.([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: i * 70, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
}

export function taskCard(x, L) {
  const g = GUIDES[x.guide];
  const steps = g ? (g[L] || g.en) : [];
  const status = x.status === 'marked_done' ? `<span class="chip chip-ok">${esc(t('taskDone'))}</span>` : x.status === 'overdue' ? `<span class="chip chip-review">${esc(t('overdue'))}</span>` : `<span class="chip chip-neutral">${esc(t('upcoming'))}</span>`;
  const portalName = x.portal?.includes('gst.gov') ? 'GST' : x.portal?.includes('incometax') ? (L === 'hi' ? 'आयकर' : 'income-tax') : '';
  return `<li class="task ${x.status}">
    <div class="top"><h4>${esc(x.title)}</h4>${status}</div>
    <p class="meta">${esc(t('due'))}: <b>${esc(formatDate(x.dueDate, L))}</b> · ${esc(t('period'))}: ${esc(x.periodLabel)} · ${esc(t('who'))}: ${x.responsibility === 'landlord' ? esc(t('landlord')) : esc(t('tenant'))}${x.optional ? ` · ${esc(t('optional'))}` : ''}${x.extended ? ' · extended' : ''}</p>
    ${steps.length ? `<details><summary>${esc(t('whatToDo'))}</summary><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
    <div class="actions">
      ${x.portal ? `<a class="btn btn-ink btn-sm" href="${esc(x.portal)}" target="_blank" rel="noopener noreferrer">${esc(t('openPortal', { portal: portalName }))} <span aria-hidden="true">↗</span></a>` : ''}
      ${x.status !== 'marked_done' && x.responsibility === 'landlord' ? `<label class="sr-only" for="ack-${esc(x.key)}">${esc(t('ackRef'))}</label><input class="input" style="max-width:220px;min-height:48px" id="ack-${esc(x.key)}" data-ack="${esc(x.key)}" placeholder="${esc(t('ackRef'))}" maxlength="40">` : ''}
      <button class="btn btn-ghost btn-sm" type="button" data-done="${esc(x.key)}">${x.status === 'marked_done' ? esc(t('undo')) : esc(t('markDone'))}</button>
    </div>
    <p class="src">${x.reviewFlag ? esc(t('ruleCA')) + ' · ' : ''}${x.sourceInfo ? `${esc(t('source'))}: <a href="${esc(x.sourceInfo.url)}" target="_blank" rel="noopener noreferrer">${esc(x.sourceInfo.title)}</a>` : esc(x.applicability)}</p>
  </li>`;
}

function initCalendar() {
  fillStates($('#c-state'));
  ['#c-gst', '#c-freq', '#c-state'].forEach((s) => $(s).addEventListener('change', renderCalendar));
  $('#cal-prev').addEventListener('click', () => { calMonth = addMonthsToPeriod(calMonth, -1); renderCalendar(); });
  $('#cal-next').addEventListener('click', () => { calMonth = addMonthsToPeriod(calMonth, 1); renderCalendar(); });
  $('#cal-ics').addEventListener('click', () => {
    const tasks = buildTasks(calProfile(), { from: TODAY, to: periodBounds(addMonthsToPeriod(PERIOD_NOW, 12)).end }, { today: TODAY });
    downloadBlob(toICS(tasks, { stamp: new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z' }), 'kirayakhata-deadlines.ics', 'text/calendar');
    toast(t('downloaded', { name: 'kirayakhata-deadlines.ics' }));
  });
  renderCalendar();
}

// ---------------- Year-end sample ----------------
async function sampleYear() {
  const repo = createMemoryRepo(WS);
  const last = PERIOD_NOW > '2027-03' ? '2027-03' : PERIOD_NOW;
  for (let p = '2026-04'; p <= last; p = addMonthsToPeriod(p, 1)) await generateBillingForPeriod(repo, { period: p, mode: 'bulk', inputs: { agr_market: { dgQty: 100 } } });
  const invoices = await repo.list('invoices');
  return buildYearData({ fy: '2026-27', invoices, receipts: [], agreements: WS.agreements, versions: WS.versions, tenants: WS.tenants, properties: WS.properties });
}
function initYearEnd() {
  $('#ye-csv').addEventListener('click', async () => { const d = await sampleYear(); downloadBlob(ledgerCSV(d), 'KirayaKhata-SAMPLE-ledger-2026-27.csv', 'text/csv'); toast(t('downloaded', { name: 'ledger CSV' })); });
  $('#ye-zip').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { const d = await sampleYear(); downloadBlob(buildPackZip(d, { sample: true }), 'KirayaKhata-SAMPLE-year-end-2026-27.zip', 'application/zip'); toast(t('downloaded', { name: 'year-end ZIP' })); } catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; }
  });
}

// ---------------- GST registration checker ----------------
let regRows = [
  { kind: 'commercial', use: 'business', tg: 'no', rent: '1,10,000' },
  { kind: 'residential_dwelling', use: 'residence', tg: 'no', rent: '45,000' },
];
function regRowHtml(r, i) {
  const L = lang();
  const o = (v, label, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
  return `<div class="reg-row" data-row="${i}">
    <div class="field"><label for="rk-${i}">${esc(regText(L, 'kind'))}</label><select class="select" id="rk-${i}" data-k="kind">${o('commercial', L === 'hi' ? 'दुकान / ऑफ़िस' : 'Shop / office', r.kind)}${o('residential_dwelling', L === 'hi' ? 'घर' : 'Home', r.kind)}</select></div>
    <div class="field"><label for="ru-${i}">${esc(regText(L, 'use'))}</label><select class="select" id="ru-${i}" data-k="use"${r.kind === 'commercial' ? ' disabled' : ''}>${o('residence', L === 'hi' ? 'रहने के लिए' : 'Lives there', r.use)}${o('business', L === 'hi' ? 'कारोबार' : 'Business', r.use)}</select></div>
    <div class="field"><label for="rt-${i}">${esc(regText(L, 'tgst'))}</label><select class="select" id="rt-${i}" data-k="tg">${o('no', L === 'hi' ? 'नहीं' : 'No', r.tg)}${o('yes', L === 'hi' ? 'हाँ' : 'Yes', r.tg)}${o('comp', L === 'hi' ? 'कंपोज़िशन' : 'Composition', r.tg)}${o('unsure', L === 'hi' ? 'पक्का नहीं' : 'Not sure', r.tg)}</select></div>
    <div class="field"><label for="rr-${i}">${esc(regText(L, 'rent'))}</label><div class="prefix-input"><span>Rs.</span><input class="input" id="rr-${i}" data-k="rent" inputmode="decimal" value="${esc(r.rent)}"></div></div>
    <button class="remove" type="button" data-remove="${i}" aria-label="${esc(regText(L, 'remove'))}"${regRows.length === 1 ? ' disabled' : ''}>×</button>
  </div>`;
}
function renderRegRows() { $('#reg-rows').innerHTML = regRows.map(regRowHtml).join(''); }
function renderReg() {
  const state = $('#reg-state').value;
  let bad = false;
  const rentals = regRows.map((r) => {
    let m = 0; try { m = rupeesToPaise(r.rent || '0'); } catch { bad = true; }
    return { kind: r.kind, use: r.kind === 'commercial' ? 'business' : r.use, tenantRegistered: r.tg === 'unsure' ? null : r.tg !== 'no', tenantComposition: r.tg === 'comp', annualPaise: m * 12, stateCode: state };
  });
  let other = 0; try { other = rupeesToPaise($('#reg-other').value || '0'); } catch { bad = true; }
  const ot = $('#reg-other-tax').value;
  if (bad) { $('#reg-result').innerHTML = `<p class="error">${esc(t('badAmount'))}</p>`; return; }
  const r = checkRegistration({ landlordStateCode: state, rentals, otherTurnoverPaise: other, otherTurnoverTaxable: ot === '' ? (other ? null : null) : ot === 'yes', date: TODAY });
  $('#reg-result').innerHTML = renderRegistration(r, lang());
}
function initRegistration() {
  fillStates($('#reg-state'));
  $('#reg-fy').value = `FY ${financialYearOf(TODAY)}`;
  renderRegRows(); renderReg();
  const form = $('#reg-form');
  form.addEventListener('input', (e) => { const row = e.target.closest('[data-row]'); if (row && e.target.dataset.k) regRows[Number(row.dataset.row)][e.target.dataset.k] = e.target.value; renderReg(); });
  form.addEventListener('change', (e) => { const row = e.target.closest('[data-row]'); if (row && e.target.dataset.k) { regRows[Number(row.dataset.row)][e.target.dataset.k] = e.target.value; if (e.target.dataset.k === 'kind') renderRegRows(); } renderReg(); });
  form.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm && regRows.length > 1) { regRows.splice(Number(rm.dataset.remove), 1); renderRegRows(); renderReg(); }
  });
  $('#reg-add').addEventListener('click', () => { regRows.push({ kind: 'commercial', use: 'business', tg: 'no', rent: '' }); renderRegRows(); $(`#rr-${regRows.length - 1}`).focus(); renderReg(); });
  document.addEventListener('kk:lang', () => { renderRegRows(); renderReg(); });
}

// ---------------- Nav ----------------
function closeMenu() { const b = $('.menu-btn'); if (b) { b.setAttribute('aria-expanded', 'false'); $('#nav-links').classList.remove('open'); } }
function initNav() {
  const btn = $('.menu-btn'); const links = $('#nav-links');
  btn.addEventListener('click', () => { const open = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', String(open)); links.classList.toggle('open', open); if (open) links.querySelector('a').focus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && links.classList.contains('open')) { closeMenu(); btn.focus(); } });
  links.querySelectorAll('a:not([data-load-example])').forEach((a) => a.addEventListener('click', closeMenu));
}

function syncHeroCard() {
  const r = closeMonth(EXAMPLE_CLOSE_MONTH);
  const vals = [r.rentPaise, r.gst.landlordCollectsPaise, r.tdsUsedPaise, r.expectedReceiptPaise];
  $$('#hero-card .eq-row strong').forEach((el, i) => { el.textContent = formatINR(vals[i], { decimals: false }); });
}

// ---------------- Boot ----------------
initLang();
initNav();
$('#ruleset').textContent = RULESET_VERSION;
syncHeroCard();
renderPanes();
initRoutine();
initFeatureRows();
initDemo();
initStudio();
initCalendar();
initYearEnd();
initRegistration();
initFAQ();
initReveals();
heroSequence();
initParallax();
loadStats();
document.addEventListener('kk:lang', () => { renderPanes(); renderStudio(); renderCalendar(); });
if (location.hash === '#demo') setTimeout(() => $('#btn-example').click(), 300);
void SOURCES;
