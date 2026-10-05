// KirayaKhata local workspace: properties, agreements, monthly billing, invoices, payments,
// calendar, practice outbox, year-end and data controls. Device-only storage (IndexedDB).
import { tr, getLang, setLang } from '../i18n-app.js';
import { createIdbRepo, deleteDatabase } from './store-idb.js';
import { sampleWorkspace } from '/shared/examples.js';
import { generateBillingForPeriod, previewAgreementPeriod, retryFailed, catchUpPeriods, issueInvoice, applyChange, recalculateDraft, createCreditNoteDraft, invoiceBalance, recordReceipt, suggestAllocations, queueEmail, simulateDelivery, makeId } from '/shared/billing-service.js';
import { computePeriodCharges, versionOn, issuanceBlockers } from '/shared/billing.js';
import { amountOn, nextChangeAfter } from '/shared/escalation.js';
import { validateGSTIN } from '/shared/rules.js';
import { msg } from '/shared/messages.js';
import { buildTasks, toICS, GUIDES } from '/shared/calendar.js';
import { parseBankCSV } from '/shared/csv.js';
import { makeZip } from '/shared/zip.js';
import { formatINR, rupeesToPaise, sum } from '/shared/money.js';
import { STATES } from '/shared/compliance-config.js';
import { todayIST, periodOf, periodLabel, formatDate, addMonthsToPeriod, addDays, periodBounds, financialYearOf, daysBetweenInclusive } from '/shared/dates.js';
import { renderInvoiceHTML, pdfBytes, invoiceFileName, invoiceLabel, downloadBlob } from '../pdf.js';
import { buildYearData, ledgerCSV, summaryText, buildPackZip } from './exports.js';
import { checkRegistration } from '/shared/registration.js';
import { openEmailDialog, accountPanelHtml, bindAccountPanel } from './email-ui.js';
import { createCloudRepo } from './store-cloud.js';
import { getConfig, currentSession, requestCode, verifyCode, signOut, consumeHashSession, googleLoginUrl } from './auth.js';
import { complianceChecklist } from '/shared/invoice-rules.js';
import { renderRegistration } from './registration-ui.js';
import { fyBounds, periodsBetween } from '/shared/dates.js';

/** Registration check from saved agreements: current-FY rent + fixed charges per agreement. */
function registrationFromWorkspace(d, overrides = {}) {
  const fy = financialYearOf(TODAY());
  const { firstPeriod, lastPeriod } = fyBounds(fy);
  const sup = { ...(d.suppliers[0] || {}), ...overrides };
  const rentals = [];
  for (const ag of d.agreements.filter((a) => ['active', 'paused', 'ended'].includes(a.status))) {
    const vs = versionsOf(d, ag.id); if (!vs.length) continue;
    let annual = 0;
    for (const p of periodsBetween(firstPeriod, lastPeriod)) {
      const ch = computePeriodCharges({ agreement: ag, versions: vs, period: p, adjustments: d.adjustments.filter((x) => x.agreementId === ag.id) });
      if (ch.status === 'READY' || ch.status === 'NEEDS_INPUT') annual += sum([...ch.lines.rent, ...ch.lines.maintenance, ...ch.lines.dg].map((l) => l.amountPaise));
    }
    const v = versionOn(vs, TODAY()) || vs[vs.length - 1]; const t = tenantOf(d, ag);
    const prop = d.properties.find((x) => x.id === ag.propertyId);
    rentals.push({ label: agLabel(d, ag), kind: v.terms.property?.kind, use: v.terms.property?.use, tenantStatus: t?.gstStatus || 'unknown', annualPaise: annual, stateCode: prop?.stateCode || sup.stateCode });
  }
  const s = d.workspace.settings || {};
  const already = sup.gstRegType === 'regular' || sup.gstRegType === 'composition' ? true : sup.gstRegType === 'unregistered' ? false : null;
  return checkRegistration({ landlordStateCode: sup.stateCode || '19', alreadyRegistered: already, rentals, otherTurnoverPaise: s.otherTurnoverPaise || 0, otherTurnoverTaxable: s.otherTurnoverTaxable ?? null, date: TODAY() });
}
function registrationPanel(d, overrides) {
  const r = registrationFromWorkspace(d, overrides);
  const sup = { ...(d.suppliers[0] || {}), ...overrides };
  const mismatch = sup.gstRegType === 'regular' && r.verdict === 'NOT_REQUIRED' ? (L() === 'hi' ? 'आप पंजीकृत हैं, जबकि सीमा के हिसाब से ज़रूरी नहीं — यह स्वैच्छिक पंजीकरण है, रिटर्न भरते रहें।' : 'You are registered although the limit does not require it — that is voluntary registration; keep filing returns.')
    : sup.gstRegType !== 'regular' && r.verdict === 'REQUIRED' ? (L() === 'hi' ? 'आपकी सेटिंग "पंजीकृत नहीं" है, पर आपको पंजीकरण चाहिए।' : 'Your settings say "not registered", but you need to register.') : '';
  return `<div class="panel"><h2>${L() === 'hi' ? 'क्या मुझे GST पंजीकरण चाहिए?' : 'Do I need GST registration?'}</h2><p class="small muted">${L() === 'hi' ? 'इस वित्तीय वर्ष के आपके सहेजे अनुबंधों से गणना।' : 'Calculated from your saved agreements for this financial year.'} (${r.lines.length})</p>${mismatch ? `<div class="notice warn">${esc(mismatch)}</div>` : ''}${renderRegistration(r, L())}</div>`;
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const INR = (p) => (p === null || p === undefined ? '—' : formatINR(p));
const L = () => getLang();
const TODAY = () => todayIST();
const DBS = { sample: 'kirayakhata-sample', owner: 'kirayakhata-owner' };

const state = { ws: 'sample', repo: null, period: periodOf(todayIST()), lastRunId: null, failNext: false, inputs: {}, wizard: null, schedTimer: null };

// ---------------- helpers ----------------
function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(text)}</span><button type="button" aria-label="Close">×</button>`;
  el.querySelector('button').onclick = () => el.remove();
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 7000);
}
function confirmDlg(text, { danger = false, requireText = null } = {}) {
  return new Promise((resolve) => {
    const d = $('#dlg');
    d.innerHTML = `<form method="dialog"><p style="margin-top:0">${esc(text)}</p>${requireText ? `<div class="field"><input class="input" id="dlg-text" autocomplete="off" aria-label="${esc(requireText)}"></div>` : ''}<div class="btn-row"><button class="btn ${danger ? 'btn-danger' : 'btn-ink'}" value="ok">${esc(tr('save') === 'Save' ? 'OK' : 'ठीक है')}</button><button class="btn btn-ghost" value="cancel">${esc(tr('cancel'))}</button></div></form>`;
    d.onclose = () => resolve(d.returnValue === 'ok' && (!requireText || $('#dlg-text')?.value === requireText));
    d.showModal();
    (requireText ? $('#dlg-text') : d.querySelector('button')).focus();
  });
}
const paise = (v, { allowNegative = false } = {}) => {
  const s = String(v ?? '').trim(); if (!s) return null;
  const p = rupeesToPaise(s); if (!allowNegative && p < 0) throw new RangeError('negative'); return p;
};
const chip = (cls, text) => `<span class="chip ${cls}">${esc(text)}</span>`;
const stateChip = (st) => chip({ READY: 'chip-ok', CREATED: 'chip-ok', ALREADY_GENERATED: 'chip-neutral', NEEDS_INPUT: 'chip-warn', PAUSED: 'chip-neutral', FAILED: 'chip-review', LEASE_ENDED: 'chip-neutral', VACANT: 'chip-neutral', NOT_STARTED: 'chip-neutral', ARCHIVED: 'chip-neutral', NOTHING_TO_BILL: 'chip-neutral' }[st] || 'chip-neutral', tr(`st_${st}`));
const taxChip = (status) => (status === 'SUPPORTED' ? chip('chip-ok', tr('ok')) : chip(status === 'NEEDS_MORE_INFORMATION' ? 'chip-warn' : 'chip-review', tr('review')));
const stateOptions = (v) => Object.entries(STATES).map(([c, n]) => `<option value="${c}"${c === v ? ' selected' : ''}>${esc(n)} (${c})</option>`).join('');
const opt = (value, label, cur) => `<option value="${esc(value)}"${String(value) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;

async function loadAll() {
  const r = state.repo;
  const [suppliers, properties, tenants, agreements, versions, invoices, receipts, outbox, runs, completions, adjustments, workspace] = await Promise.all(['suppliers', 'properties', 'tenants', 'agreements', 'versions', 'invoices', 'receipts', 'outbox', 'runs', 'completions', 'adjustments', 'workspace'].map((s) => r.list(s)));
  return { suppliers, properties, tenants, agreements, versions, invoices, receipts, outbox, runs, completions, adjustments, workspace: workspace[0] || { id: 'ws', settings: {} } };
}
const agLabel = (d, ag) => { const p = d.properties.find((x) => x.id === ag.propertyId); const u = p?.units?.find((x) => x.id === ag.unitId); return `${p?.name || '?'}${u ? ' · ' + u.label : ''}`; };
const tenantOf = (d, ag) => d.tenants.find((x) => x.id === ag.tenantId);
const versionsOf = (d, agId) => d.versions.filter((v) => v.agreementId === agId);

// ---------------- boot ----------------
async function openWorkspace(ws) {
  if (state.repo) state.repo.close();
  state.ws = ws;
  try { localStorage.setItem('kk:ws', ws); } catch { /* ignore */ }
  try {
    if (ws === 'owner' && state.cfg?.authEnabled) {
      state.repo = await createCloudRepo({ supabaseUrl: state.cfg.supabaseUrl, anonKey: state.cfg.supabaseAnonKey, getToken: async () => (await currentSession())?.access_token });
    } else state.repo = await createIdbRepo(DBS[ws]);
  } catch (e) {
    if (e.code === 'SIGNED_OUT') { renderLogin(); return false; }
    $('#view').innerHTML = `<div class="panel"><h1>${esc(tr('appTitle'))}</h1><div class="notice review">${esc(e.message)} — this browser is blocking local storage (private window or blocked site data). The workspace cannot save anything here.</div></div>`;
    return false;
  }
  if (ws === 'sample' && !(await state.repo.list('agreements')).length) await seedSample();
  return true;
}
async function seedSample() {
  const s = sampleWorkspace(new Date().toISOString());
  await state.repo.tx([], async (r) => { for (const [store, rows] of Object.entries(s)) for (const row of rows) await r.put(store, row); });
}

function renderChrome() {
  document.documentElement.lang = L();
  $('#lang-btn').textContent = tr('langBtn');
  $('#ws-label').textContent = tr('wsSwitch');
  $('#ws-select').innerHTML = opt('owner', state.cfg?.authEnabled ? (L() === 'hi' ? 'मेरा खाता' : 'My account') : tr('wsOwner'), state.ws) + opt('sample', tr('wsSample'), state.ws);
  const route = currentRoute().name;
  const items = [['billing', 'nav_billing'], ['properties', 'nav_properties'], ['invoices', 'nav_invoices'], ['payments', 'nav_payments'], ['calendar', 'nav_calendar'], ['outbox', 'nav_outbox'], ['yearend', 'nav_yearend'], ['settings', 'nav_settings']];
  const acct = state.session ? `<hr><span class="small muted" style="padding:4px 14px;word-break:break-all">${esc(state.session.email || '')}</span><a href="#" data-signout>${L() === 'hi' ? 'साइन-आउट' : 'Sign out'}</a>` : '';
  $('#side-nav').innerHTML = items.map(([k, label]) => `<a href="#/${k}"${route === k || (k === 'properties' && ['property', 'add', 'change'].includes(route)) || (k === 'invoices' && route === 'invoice') ? ' aria-current="page"' : ''}>${esc(tr(label))}</a>`).join('') + `<hr><a href="/">${esc(tr('nav_home'))}</a>` + acct;
  $('[data-signout]')?.addEventListener('click', async (e) => { e.preventDefault(); await signOut(); location.href = '/app'; });
}

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '') || 'billing';
  const [name, id] = h.split('/');
  return { name, id };
}

async function render() {
  renderChrome();
  const { name, id } = currentRoute();
  const view = $('#view');
  const d = await loadAll();
  const cloud = state.repo?.kind === 'cloud';
  const banner = state.ws === 'sample' ? `<div class="banner">${esc(tr('sampleBanner'))} <button class="btn btn-ink btn-sm" type="button" data-go-owner>${esc(cloud || state.cfg?.authEnabled ? (L() === 'hi' ? 'मेरा खाता' : 'My account') : tr('wsOwner'))}</button></div>`
    : cloud ? `<div class="banner info">${L() === 'hi' ? `साइन-इन: <b>${esc(state.session?.email || '')}</b> · आपके रिकॉर्ड आपके खाते में सुरक्षित हैं और केवल आप देख सकते हैं।` : `Signed in as <b>${esc(state.session?.email || '')}</b> · your records are saved to your account and visible only to you.`}</div>`
    : `<div class="banner info">${esc(tr('storageNote'))}</div>`;
  // First run for a new owner: profile first, then the first property.
  if (state.ws === 'owner' && !d.suppliers.length && !['welcome', 'settings'].includes(name)) { location.replace('#/welcome'); return; }
  const views = { welcome: viewWelcome, billing: viewBilling, properties: viewProperties, property: viewProperty, add: viewWizard, change: viewChange, invoices: viewInvoices, invoice: viewInvoice, payments: viewPayments, calendar: viewCalendar, outbox: viewOutbox, yearend: viewYearEnd, settings: viewSettings };
  try {
    view.innerHTML = banner + await (views[name] || viewBilling)(d, id);
    bindCommon(view);
    await (BINDERS[name] || BINDERS.billing)?.(view, d, id);
  } catch (e) {
    console.error(e);
    view.innerHTML = banner + `<div class="notice review">${esc(tr('error', { msg: e.message }))}</div>`;
  }
}
function bindCommon(view) {
  $$('[data-go-owner]', view).forEach((b) => b.addEventListener('click', async () => { try { localStorage.setItem('kk:ws', 'owner'); } catch { /* ignore */ } location.href = '/app#/properties'; }));
}
const BINDERS = {};

// ---------------- Monthly billing ----------------
async function viewBilling(d) {
  const period = state.period;
  const active = d.agreements.filter((a) => a.status !== 'archived');
  const rows = [];
  for (const ag of active) {
    const pv = await previewAgreementPeriod(state.repo, ag.id, period, state.inputs);
    rows.push({ ag, pv });
  }
  const sup = d.suppliers[0];
  const lastRun = [...d.runs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const catchups = [];
  for (const ag of active.filter((a) => a.status === 'active')) {
    const miss = (await catchUpPeriods(state.repo, ag.id, periodOf(TODAY()))).filter((p) => p < periodOf(TODAY()));
    for (const p of miss) catchups.push({ ag, p });
  }
  const autoAgs = active.filter((a) => versionOn(versionsOf(d, a.id), TODAY())?.terms?.schedule?.mode === 'auto_draft');
  const rowHtml = rows.map(({ ag, pv }) => {
    const t = tenantOf(d, ag);
    const docs = pv.docs || [];
    const rent = sum(docs.flatMap((x) => x.lines.filter((l) => l.key === 'rent').map((l) => l.amountPaise)));
    const maint = sum(docs.flatMap((x) => x.lines.filter((l) => l.key === 'maintenance').map((l) => l.amountPaise)));
    const treatments = [...new Set(docs.flatMap((x) => x.lines.map((l) => l.tax.treatment)))].map((tt) => tr(`treatment_${tt}`)).join(', ');
    const tds = docs.find((x) => x.tds)?.tds;
    const notes = [];
    for (const x of docs) for (const l of x.lines) { if (l.prorated) notes.push(`${tr(x.category)}: ${tr('prorated')} ${l.days}/${l.periodDays}`); if ((l.explanation || []).some((e) => e.date && e.date.startsWith(period))) notes.push(`${tr(x.category)}: ${tr('step')} → ${INR(l.monthlyPaise)}`); }
    const vNow = versionOn(versionsOf(d, ag.id), `${period}-01`);
    const nxt = vNow ? nextChangeAfter(vNow.terms.rent, `${period}-01`) : null;
    const noticeDays = d.workspace.settings?.noticeDays ?? 45;
    if (nxt && daysBetweenInclusive(`${period}-01`, nxt.date) <= noticeDays + 31) notes.push(tr('increasesSoon', { date: formatDate(nxt.date, L()), amount: INR(nxt.amountPaise) }));
    const needs = (pv.needs || []).map((n) => {
      if (n.code === 'DG_READING' || n.code === 'MAINT_READING') return `<label class="small">${esc(tr(`need_${n.code}`, { unit: n.unit || '' }))}<br><input class="input inline-input" inputmode="decimal" data-reading="${ag.id}" data-kind="${n.code === 'DG_READING' ? 'dgQty' : 'maintenanceQty'}" value="${esc(state.inputs[ag.id]?.[n.code === 'DG_READING' ? 'dgQty' : 'maintenanceQty'] ?? '')}"></label>`;
      if (n.code === 'PRORATION_POLICY') return `<div class="small">${esc(tr('need_PRORATION_POLICY'))}<br><select class="select inline-input" data-proration="${ag.id}">${opt('daily', tr('daily'))}${opt('full_month', tr('fullMonth'))}</select> <button class="btn btn-ghost btn-sm" type="button" data-save-proration="${ag.id}">${esc(tr('saveDecision'))}</button></div>`;
      return `<div class="small">${esc(tr(`need_${n.code}`, { fields: (n.detail || []).join(', ') }))}</div>`;
    }).join('');
    const canGen = pv.state === 'READY';
    return `<tr>
      <td><a href="#/property/${ag.id}"><b>${esc(agLabel(d, ag))}</b></a><br><small>${esc(t?.legalName || '')}</small></td>
      <td class="r">${docs.length ? `${INR(rent)}${maint ? `<br><small>+ ${esc(tr('maintenance'))} ${INR(maint)}</small>` : ''}` : '—'}</td>
      <td>${esc(treatments || '—')}${docs.some((x) => x.taxStatus !== 'SUPPORTED') ? '<br>' + chip('chip-review', tr('review')) : ''}</td>
      <td class="r">${tds && tds.amountPaise != null ? INR(tds.amountPaise) : '—'}</td>
      <td class="r">${docs.length ? INR(sum(docs.map((x) => x.totalPaise))) : '—'}<br><small>${docs.map((x) => esc(tr(x.category))).join(' + ')}</small></td>
      <td>${stateChip(pv.state)}${notes.length ? `<br><small>${notes.map(esc).join('<br>')}</small>` : ''}${needs ? `<div style="margin-top:6px">${needs}</div>` : ''}</td>
      <td>${canGen ? `<button class="btn btn-ink btn-sm" type="button" data-gen="${ag.id}">${esc(tr('generateOne'))}</button>` : pv.state === 'ALREADY_GENERATED' ? `<a class="btn btn-ghost btn-sm" href="#/invoices">${esc(tr('view'))}</a>` : ''}</td>
    </tr>`;
  }).join('');
  const runHtml = lastRun ? `<div class="panel"><h2>${esc(tr('runReport'))} · ${esc(periodLabel(lastRun.period, L()))} · ${esc(lastRun.mode)}</h2>
      <p>${esc(tr('genDone', { c: lastRun.counts.created, a: lastRun.counts.already, s: lastRun.counts.skipped + lastRun.counts.needsInput, f: lastRun.counts.failed }))}</p>
      <ul class="reasons">${lastRun.results.map((r) => { const ag = d.agreements.find((a) => a.id === r.agreementId); return `<li>${esc(ag ? agLabel(d, ag) : r.agreementId)}: ${stateChip(r.state)}${r.error ? ` <small>${esc(r.error)}</small>` : ''}</li>`; }).join('')}</ul>
      ${lastRun.counts.failed ? `<button class="btn btn-ink btn-sm" type="button" data-retry="${lastRun.id}">${esc(tr('retryFailed'))}</button>` : ''}</div>` : '';
  return `<h1>${esc(tr('nav_billing'))}</h1>
  <div class="panel tint"><div class="toolbar">
    <div class="field"><label for="b-period">${esc(tr('period'))}</label><input class="input" type="month" id="b-period" value="${period}"></div>
    <button class="btn btn-primary" type="button" id="gen-all"${!sup ? ' disabled' : ''}>${esc(tr('generateAll'))}</button>
  </div>
  ${!sup ? `<div class="notice warn">${esc(tr('needSupplier'))} <a href="#/settings">${esc(tr('nav_settings'))}</a></div>` : ''}
  <div class="table-wrap"><table class="data"><thead><tr><th>${esc(tr('colProperty'))}</th><th class="r">${esc(tr('colAmounts'))}</th><th>${esc(tr('colGst'))}</th><th class="r">${esc(tr('colTds'))}</th><th class="r">${esc(tr('colTotal'))}</th><th>${esc(tr('colState'))}</th><th>${esc(tr('colAction'))}</th></tr></thead><tbody>${rowHtml || `<tr><td colspan="7" class="empty">${esc(tr('noProps'))} <a href="#/add">${esc(tr('addProperty'))}</a></td></tr>`}</tbody></table></div></div>
  ${runHtml}
  ${catchups.length ? `<details class="panel"${catchups.length <= 6 ? ' open' : ''}><summary><b>${esc(tr('catchUp'))} (${catchups.length})</b></summary><p class="sub">${esc(tr('catchUpText'))}</p>${catchups.map((c, i) => `<label class="check"><input type="checkbox" data-catch="${i}" data-ag="${c.ag.id}" data-p="${c.p}"><span>${esc(agLabel(d, c.ag))} — ${esc(periodLabel(c.p, L()))}</span></label>`).join('')}<button class="btn btn-ink btn-sm" type="button" id="catch-go">${esc(tr('prepareSelected'))}</button></details>` : ''}
  <div class="panel"><h2>${esc(tr('autoTitle'))}</h2><p>${esc(tr('autoText'))}</p>
    <p class="small muted">${autoAgs.length ? autoAgs.map((a) => esc(agLabel(d, a))).join(', ') : esc(tr('schedNone'))}</p>
    <p class="small muted">${esc(tr('lastRun'))}: ${esc(d.workspace.lastSchedulerRun ? new Date(d.workspace.lastSchedulerRun).toLocaleString() : tr('never'))}</p>
    <button class="btn btn-ghost btn-sm" type="button" id="run-sched">${esc(tr('runScheduler'))}</button>
    <details class="why" style="margin-top:12px"><summary>${esc(tr('testTools'))}</summary><label class="check"><input type="checkbox" id="fail-next"${state.failNext ? ' checked' : ''}><span>${esc(tr('simulateFail'))}</span></label></details>
    <p class="small muted">${esc(tr('planned'))}</p></div>`;
}
BINDERS.billing = (view, d) => {
  $('#b-period', view).addEventListener('change', (e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { state.period = e.target.value; render(); } });
  $$('[data-reading]', view).forEach((inp) => inp.addEventListener('change', () => {
    const v = inp.value.trim();
    state.inputs[inp.dataset.reading] = { ...(state.inputs[inp.dataset.reading] || {}), [inp.dataset.kind]: v === '' ? undefined : Number(v) };
    if (v !== '' && !(Number(v) >= 0)) { toast(tr('badAmount'), 'error'); return; }
    render();
  }));
  $$('[data-save-proration]', view).forEach((b) => b.addEventListener('click', async () => {
    const agId = b.dataset.saveProration; const choice = $(`[data-proration="${agId}"]`, view).value;
    const v = versionOn(versionsOf(d, agId), `${state.period}-01`) || versionsOf(d, agId)[0];
    await state.repo.tx([], async (r) => {
      await r.put('versions', { ...v, terms: { ...v.terms, prorationPolicy: choice } });
      await r.put('audit', { id: makeId('aud'), at: new Date().toISOString(), entity: 'version', entityId: v.id, action: 'proration_decision', detail: { choice }, actor: 'local-owner' });
    });
    toast(tr('saved')); render();
  }));
  const gen = async (ids, mode) => {
    const fail = state.failNext; state.failNext = false;
    const run = await generateBillingForPeriod(state.repo, { period: state.period, agreementIds: ids, mode, inputs: state.inputs }, { failHook: fail ? (id) => { if (id === (ids?.[0] || d.agreements[0]?.id)) throw new Error('Simulated failure (testing tool)'); } : null });
    toast(tr('genDone', { c: run.counts.created, a: run.counts.already, s: run.counts.skipped + run.counts.needsInput, f: run.counts.failed }));
    render();
  };
  $('#gen-all', view)?.addEventListener('click', () => gen(null, 'bulk'));
  $$('[data-gen]', view).forEach((b) => b.addEventListener('click', () => gen([b.dataset.gen], 'manual')));
  $$('[data-retry]', view).forEach((b) => b.addEventListener('click', async () => { const run = await retryFailed(state.repo, b.dataset.retry, { inputs: state.inputs }); toast(tr('genDone', { c: run.counts?.created || 0, a: run.counts?.already || 0, s: (run.counts?.skipped || 0) + (run.counts?.needsInput || 0), f: run.counts?.failed || 0 })); render(); }));
  $('#fail-next', view)?.addEventListener('change', (e) => { state.failNext = e.target.checked; });
  $('#run-sched', view).addEventListener('click', async () => { await runScheduler(true); render(); });
  $('#catch-go', view)?.addEventListener('click', async () => {
    const picks = $$('[data-catch]:checked', view);
    for (const p of picks) await generateBillingForPeriod(state.repo, { period: p.dataset.p, agreementIds: [p.dataset.ag], mode: 'catch-up', inputs: { [p.dataset.ag]: { ...(state.inputs[p.dataset.ag] || {}), invoiceDate: TODAY() } } });
    toast(tr('genDone', { c: picks.length, a: 0, s: 0, f: 0 })); render();
  });
};

/** Local scheduler: only while the page is open; same service, same idempotency. */
async function runScheduler(manual = false) {
  if (!state.repo) return;
  const d = await loadAll();
  const today = TODAY(); const period = periodOf(today);
  const due = d.agreements.filter((a) => {
    if (a.status !== 'active') return false;
    const v = versionOn(versionsOf(d, a.id), today);
    if (!v || v.terms.schedule?.mode !== 'auto_draft' || v.terms.schedule?.paused) return false;
    return Number(today.slice(8)) >= Math.min(v.terms.billingDay || 1, periodBounds(period).days);
  }).map((a) => a.id);
  if (due.length) await generateBillingForPeriod(state.repo, { period, agreementIds: due, mode: 'scheduler', inputs: state.inputs });
  await state.repo.put('workspace', { ...d.workspace, lastSchedulerRun: new Date().toISOString() });
  if (manual) toast(due.length ? tr('genDone', { c: due.length, a: 0, s: 0, f: 0 }) : tr('schedNone'));
}

// ---------------- Properties ----------------
async function viewProperties(d) {
  const cards = [];
  for (const ag of d.agreements.filter((a) => a.status !== 'archived')) {
    const t = tenantOf(d, ag);
    const vs = versionsOf(d, ag.id);
    const v = versionOn(vs, TODAY()) || vs[0];
    const pv = await previewAgreementPeriod(state.repo, ag.id, periodOf(TODAY()), state.inputs);
    const nxt = v ? nextChangeAfter(v.terms.rent, TODAY()) : null;
    const statusLabel = ag.status === 'draft' ? chip('chip-warn', tr('incomplete')) : ag.status === 'paused' ? chip('chip-neutral', tr('paused')) : ag.status === 'ended' ? chip('chip-neutral', tr('ended')) : chip('chip-ok', tr('active'));
    const billDay = v?.terms.billingDay || 1;
    const nextBill = Number(TODAY().slice(8)) <= billDay ? `${periodOf(TODAY())}-${String(Math.min(billDay, periodBounds(periodOf(TODAY())).days)).padStart(2, '0')}` : `${addMonthsToPeriod(periodOf(TODAY()), 1)}-${String(Math.min(billDay, periodBounds(addMonthsToPeriod(periodOf(TODAY()), 1)).days)).padStart(2, '0')}`;
    cards.push(`<article class="cardx"><div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><h3>${esc(agLabel(d, ag))}</h3>${statusLabel}</div>
      <dl><dt>${esc(tr('colTenant'))}</dt><dd>${esc(t?.legalName || '—')}</dd>
      <dt>${esc(tr('rentNow'))}</dt><dd>${v ? INR(amountOn(v.terms.rent, TODAY()).amountPaise) : '—'}</dd>
      <dt>${esc(tr('maintNow'))}</dt><dd>${v?.terms.maintenance?.basis === 'fixed' ? INR(amountOn(v.terms.maintenance, TODAY()).amountPaise) + (v.terms.maintenance.issuer === 'external' ? ' (ext.)' : '') : v?.terms.maintenance?.basis === 'usage' ? 'usage' : '—'}</dd>
      <dt>${esc(tr('nextBilling'))}</dt><dd>${ag.status === 'active' ? esc(formatDate(nextBill, L())) : '—'}</dd>
      <dt>${esc(tr('upcomingEsc'))}</dt><dd>${nxt ? `${esc(formatDate(nxt.date, L()))} → ${INR(nxt.amountPaise)}` : '—'}</dd>
      <dt>${esc(tr('thisMonth'))}</dt><dd>${stateChip(pv.state)}</dd></dl>
      ${ag.status === 'draft' ? `<div class="notice warn small">${esc(tr('blocksBilling', { fields: (ag.incomplete || []).join(', ') }))}</div>` : ''}
      <div class="actions"><a class="btn btn-ink btn-sm" href="#/property/${ag.id}">${esc(tr('view'))}</a>${ag.status === 'draft' ? `<a class="btn btn-ghost btn-sm" href="#/add/${ag.id}">${esc(tr('editTerms'))}</a>` : `<a class="btn btn-ghost btn-sm" href="#/change/${ag.id}">${esc(tr('editTerms'))}</a>`}
      ${ag.status === 'active' ? `<button class="btn btn-ghost btn-sm" type="button" data-status="${ag.id}" data-to="paused">${esc(tr('pause'))}</button>` : ag.status === 'paused' ? `<button class="btn btn-ghost btn-sm" type="button" data-status="${ag.id}" data-to="active">${esc(tr('resume'))}</button>` : ''}
      ${pv.state === 'READY' ? `<button class="btn btn-ghost btn-sm" type="button" data-gen-card="${ag.id}">${esc(tr('generateOne'))}</button>` : ''}</div></article>`);
  }
  return `<div style="display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap"><div><h1>${esc(tr('nav_properties'))}</h1></div><a class="btn btn-primary" href="#/add">${esc(tr('addProperty'))}</a></div>
  <div style="margin-top:18px">${cards.length ? `<div class="cards">${cards.join('')}</div>` : `<div class="panel empty">${esc(tr('noProps'))}</div>`}</div>
  ${d.agreements.some((a) => a.status === 'archived') ? `<details class="panel"><summary>${esc(tr('archived'))} (${d.agreements.filter((a) => a.status === 'archived').length})</summary><ul>${d.agreements.filter((a) => a.status === 'archived').map((a) => `<li><a href="#/property/${a.id}">${esc(agLabel(d, a))} — ${esc(tenantOf(d, a)?.legalName || '')}</a></li>`).join('')}</ul></details>` : ''}`;
}
BINDERS.properties = (view) => {
  $$('[data-status]', view).forEach((b) => b.addEventListener('click', () => setStatus(b.dataset.status, b.dataset.to)));
  $$('[data-gen-card]', view).forEach((b) => b.addEventListener('click', async () => { const run = await generateBillingForPeriod(state.repo, { period: periodOf(TODAY()), agreementIds: [b.dataset.genCard], mode: 'manual', inputs: state.inputs }); toast(tr('genDone', { c: run.counts.created, a: run.counts.already, s: run.counts.skipped + run.counts.needsInput, f: run.counts.failed })); render(); }));
};
async function setStatus(agId, to, extra = {}) {
  await state.repo.tx([], async (r) => {
    const ag = await r.get('agreements', agId);
    await r.put('agreements', { ...ag, status: to, ...extra });
    await r.put('audit', { id: makeId('aud'), at: new Date().toISOString(), entity: 'agreement', entityId: agId, action: `status_${to}`, detail: extra, actor: 'local-owner' });
  });
  toast(tr('saved')); render();
}

// ---------------- Property workspace ----------------
async function viewProperty(d, agId) {
  const ag = d.agreements.find((a) => a.id === agId);
  if (!ag) return `<div class="notice review">Not found.</div>`;
  const t = tenantOf(d, ag); const vs = versionsOf(d, agId).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const v = versionOn(vs, TODAY()) || vs[0];
  const invs = d.invoices.filter((i) => i.agreementId === agId).sort((a, b) => (a.period < b.period ? 1 : -1));
  const future = vs.filter((x) => x.effectiveFrom > TODAY());
  const esc1 = v ? nextChangeAfter(v.terms.rent, TODAY()) : null;
  const siblings = d.agreements.filter((a) => a.propertyId === ag.propertyId && a.id !== ag.id);
  const terms = v?.terms;
  return `<p><a href="#/properties">← ${esc(tr('nav_properties'))}</a></p><h1>${esc(agLabel(d, ag))}</h1><p class="sub">${esc(t?.legalName || '')} · ${esc(formatDate(ag.startDate, L()))} – ${ag.endDate ? esc(formatDate(ag.endDate, L())) : '…'} · ${esc(tr(ag.status === 'draft' ? 'incomplete' : ag.status))}</p>
  <div class="btn-row" style="margin-bottom:18px">
    ${ag.status !== 'archived' ? `<a class="btn btn-ink btn-sm" href="#/change/${ag.id}">${esc(tr('editTerms'))}</a>` : ''}
    ${ag.status === 'active' ? `<button class="btn btn-ghost btn-sm" type="button" data-status="${ag.id}" data-to="paused">${esc(tr('pause'))}</button>` : ag.status === 'paused' ? `<button class="btn btn-ghost btn-sm" type="button" data-status="${ag.id}" data-to="active">${esc(tr('resume'))}</button>` : ''}
    ${['active', 'paused'].includes(ag.status) ? `<button class="btn btn-ghost btn-sm" type="button" id="end-ten">${esc(tr('endTenancy'))}</button>` : ''}
    <a class="btn btn-ghost btn-sm" href="#/add/new-tenant-${ag.id}">${esc(tr('newTenant'))}</a>
    ${ag.status !== 'archived' ? `<button class="btn btn-danger btn-sm" type="button" id="archive">${esc(tr('archive'))}</button>` : ''}
  </div>
  <div class="panel"><h2>${esc(tr('currentTerms'))}</h2>${terms ? `<dl class="kv">
    <dt>${esc(tr('monthlyRent'))}</dt><dd>${INR(amountOn(terms.rent, TODAY()).amountPaise)} <small>(${esc(terms.rent.escalation?.type || 'none')})</small></dd>
    <dt>${esc(tr('maintBasis'))}</dt><dd>${terms.maintenance?.basis === 'fixed' ? INR(amountOn(terms.maintenance, TODAY()).amountPaise) : esc(terms.maintenance?.basis || 'none')}${terms.maintenance?.issuer === 'external' ? ` · ${esc(tr('issuerExternal'))}` : ''}${terms.maintenance?.basis !== 'none' && terms.maintenance?.issuer !== 'external' ? ` · ${terms.maintenance?.itemTax?.confirmed ? `SAC ${esc(terms.maintenance.itemTax.sac)} ${terms.maintenance.itemTax.rateBp / 100}%` : chip('chip-review', tr('review'))}` : ''}</dd>
    <dt>${esc(tr('dgBasis'))}</dt><dd>${esc(terms.dg?.basis || 'none')}${terms.dg?.basis === 'usage' ? ` · ${INR(terms.dg.ratePaise)}/${esc(terms.dg.unitLabel)}` : ''}</dd>
    <dt>${esc(tr('propKind'))}</dt><dd>${esc(tr(`k_${terms.property?.kind}`))} · ${esc(tr(`u_${terms.property?.use}`))}</dd>
    <dt>${esc(tr('tenantCat'))}</dt><dd>${esc(tr(`c_${terms.tenantCategory}`))}</dd>
    <dt>${esc(tr('billingDay'))}</dt><dd>${terms.billingDay} · ${esc(tr('dueDays'))}: ${terms.dueDays}</dd>
    <dt>${esc(tr('docMode'))}</dt><dd>${esc(tr(`m_${terms.documentMode}`))} · ${esc(tr(`t_${terms.templateId}`))}</dd>
    <dt>${esc(tr('deposit'))}</dt><dd>${INR(terms.deposit?.amountPaise || 0)}</dd>
    <dt>${esc(tr('scheduleMode'))}</dt><dd>${esc(terms.schedule?.mode === 'auto_draft' ? tr('schedAuto') : tr('schedManual'))}</dd></dl>` : '—'}</div>
  <div class="panel"><h2>${esc(tr('upcoming'))}</h2><ul class="reasons">${esc1 ? `<li>${esc(tr('increasesSoon', { date: formatDate(esc1.date, L()), amount: INR(esc1.amountPaise) }))}</li>` : ''}${future.map((f) => `<li>${esc(formatDate(f.effectiveFrom, L()))}: ${esc(f.reason || f.kind)}</li>`).join('') || (esc1 ? '' : '<li>—</li>')}</ul></div>
  <div class="panel"><h2>${esc(tr('history'))}</h2><div class="table-wrap"><table class="data"><thead><tr><th>${esc(tr('effective'))}</th><th>${esc(tr('reason'))}</th><th class="r">${esc(tr('monthlyRent'))}</th></tr></thead><tbody>${vs.map((x) => `<tr><td>${esc(formatDate(x.effectiveFrom, L()))}</td><td>${esc(x.reason || x.kind)}</td><td class="r">${INR(x.terms.rent?.amountPaise)}</td></tr>`).join('')}${d.adjustments.filter((a) => a.agreementId === agId).map((a) => `<tr><td>${esc(periodLabel(a.period, L()))}</td><td>${esc(a.reason)} (${esc(tr(a.category))})</td><td class="r">${INR(a.amountPaise)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="panel"><h2>${esc(tr('invoices'))}</h2>${invoiceTable(d, invs)}</div>
  ${siblings.length ? `<div class="panel"><h2>${esc(tr('history'))} — ${esc(tr('colTenant'))}</h2><ul>${siblings.map((s) => `<li><a href="#/property/${s.id}">${esc(tenantOf(d, s)?.legalName || '')} (${esc(formatDate(s.startDate, L()))} – ${s.endDate ? esc(formatDate(s.endDate, L())) : '…'})</a></li>`).join('')}</ul></div>` : ''}`;
}
BINDERS.property = (view, d, agId) => {
  $$('[data-status]', view).forEach((b) => b.addEventListener('click', () => setStatus(b.dataset.status, b.dataset.to)));
  $('#archive', view)?.addEventListener('click', async () => { if (await confirmDlg(tr('confirmArchive'), { danger: true })) setStatus(agId, 'archived'); });
  $('#end-ten', view)?.addEventListener('click', async () => {
    const d2 = $('#dlg');
    d2.innerHTML = `<form method="dialog"><div class="field"><label for="end-date">${esc(tr('endDateQ'))}</label><input class="input" type="date" id="end-date" value="${TODAY()}" required></div><div class="btn-row"><button class="btn btn-ink" value="ok">${esc(tr('endTenancy'))}</button><button class="btn btn-ghost" value="cancel">${esc(tr('cancel'))}</button></div></form>`;
    d2.onclose = async () => {
      if (d2.returnValue !== 'ok') return;
      const date = $('#end-date').value; if (!date) return;
      await setStatus(agId, 'ended', { endDate: date });
    };
    d2.showModal();
  });
};

function invoiceTable(d, invs, receipts = d.receipts) {
  if (!invs.length) return `<p class="muted">—</p>`;
  return `<div class="table-wrap"><table class="data"><thead><tr><th>${esc(tr('invNumber'))}</th><th>${esc(tr('colProperty'))}</th><th>${esc(tr('category'))}</th><th>${esc(tr('period'))}</th><th class="r">${esc(tr('total'))}</th><th>${esc(tr('taxStatus'))}</th><th>${esc(tr('status'))}</th><th class="r">${esc(tr('balance'))}</th></tr></thead><tbody>${invs.map((i) => {
    const ag = d.agreements.find((a) => a.id === i.agreementId);
    const bal = invoiceBalance(i, receipts);
    return `<tr><td><a href="#/invoice/${i.id}"><b>${esc(invoiceLabel(i))}</b></a></td><td>${esc(ag ? agLabel(d, ag) : '')}</td><td>${esc(i.kind === 'credit_note' ? 'Credit note' : tr(i.category))}</td><td>${esc(periodLabel(i.period, L()))}</td><td class="r">${INR(i.doc.totalPaise)}</td><td>${taxChip(i.doc.taxStatus)}</td><td>${chip(i.status === 'issued' ? 'chip-ok' : i.status === 'superseded' ? 'chip-neutral' : 'chip-draft', tr(`s_${i.status}`))}${i.stale ? '<br>' + chip('chip-warn', tr('stale')) : ''}</td><td class="r">${i.status === 'superseded' ? '—' : INR(bal.balancePaise)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

// ---------------- Add property wizard ----------------
const SPECIALS = ['co_owned', 'sez', 'mixed_use', 'pg_hostel', 'non_resident', 'sublet', 'land', 'government_lessor'];
function blankWizard() {
  return { step: 0, propertyMode: 'new', propertyId: '', s: { legalName: '', address: '', stateCode: '19', gstRegType: 'unregistered', gstin: '', filing: 'monthly', holder: '', bankName: '', account: '', ifsc: '', prefix: 'KK' }, p: { name: '', address: '', stateCode: '19', unit: '' }, t: { legalName: '', billingAddress: '', same: true, stateCode: '19', gstStatus: 'unregistered', gstin: '', email: '', contactName: '', phone: '' },
    x: { freeUntil: '', maintEscType: 'none', maintEscPct: '5', maintEscAmt: '', maintEscFirst: '', billingTiming: 'advance', noticeMonths: '', lockInUntil: '', invoiceNotes: '', lowerCert: '', lowerCertTo: '', inclusive: false },
    a: { startDate: TODAY(), endDate: '', reference: '', tenantCategory: '', kind: 'commercial', use: 'business', proprietor: '', rent: '', escType: 'none', escPct: '5', escAmt: '', escFirst: '', escEvery: '12', compounding: true, steps: '', maintBasis: 'none', maintAmt: '', maintRate: '', maintUnit: '', maintIssuer: 'landlord', maintTax: false, maintSac: '', maintRate2: '18', maintCharge: 'forward', dgBasis: 'none', dgAmt: '', dgRate: '', dgUnit: 'kWh', dgNature: 'backup_power', dgTax: false, dgSac: '', dgRate2: '18', dgCharge: 'forward', deposit: '', special: [], billingDay: '1', dueDays: '7', documentMode: 'separate', templateId: 'classic', proration: 'daily', schedule: 'manual', po: '' } };
}
function wizardFromExisting(d, agId) {
  const ag = d.agreements.find((a) => a.id === agId); if (!ag) return blankWizard();
  const v = versionsOf(d, agId)[0]; const t = tenantOf(d, ag); const p = d.properties.find((x) => x.id === ag.propertyId);
  const w = blankWizard(); w.editId = agId; w.propertyMode = 'existing'; w.propertyId = ag.propertyId; w.unitId = ag.unitId;
  w.p = { name: p.name, address: p.address, stateCode: p.stateCode, unit: p.units?.find((u) => u.id === ag.unitId)?.label || '' };
  w.t = { ...w.t, ...t, same: t.billingAddress === p.address };
  if (v) { Object.assign(w.a, termsToForm(v.terms), { startDate: ag.startDate, endDate: ag.endDate || '', reference: ag.reference || '' }); Object.assign(w.x, extrasToForm(v.terms)); }
  return w;
}
function extrasToForm(T) {
  const me = T.maintenance?.escalation || { type: 'none' };
  return { freeUntil: T.rent?.freeUntil || '', maintEscType: me.type || 'none', maintEscPct: me.bp ? String(me.bp / 100) : '5', maintEscAmt: me.incrementPaise ? formatINR(me.incrementPaise, { symbol: '' }) : '', maintEscFirst: me.firstDate || '', billingTiming: T.billingTiming || 'advance', noticeMonths: T.noticeMonths ? String(T.noticeMonths) : '', lockInUntil: T.lockInUntil || '', invoiceNotes: T.invoiceNotes || '', lowerCert: T.lowerCertRateBp != null ? String(T.lowerCertRateBp / 100) : '', lowerCertTo: T.lowerCertValidTo || '', inclusive: false };
}
/** Apply the extra inputs onto computed terms. */
function applyExtras(terms, x, errors) {
  if (x.freeUntil) terms.rent.freeUntil = x.freeUntil;
  if (terms.maintenance.basis === 'fixed') {
    if (x.maintEscType === 'percent') { const bp = Math.round(Number(x.maintEscPct) * 100); if (!(bp > 0) || !x.maintEscFirst) errors.push('Maintenance increase'); terms.maintenance.escalation = { type: 'percent', bp, everyMonths: 12, firstDate: x.maintEscFirst, compounding: true }; }
    if (x.maintEscType === 'fixed') { let inc = 0; try { inc = paise(x.maintEscAmt) || 0; } catch { errors.push('Maintenance increase'); } if (!inc || !x.maintEscFirst) errors.push('Maintenance increase'); terms.maintenance.escalation = { type: 'fixed', incrementPaise: inc, everyMonths: 12, firstDate: x.maintEscFirst }; }
  }
  terms.billingTiming = x.billingTiming === 'arrears' ? 'arrears' : 'advance';
  terms.noticeMonths = Number(x.noticeMonths) || null;
  terms.lockInUntil = x.lockInUntil || null;
  terms.invoiceNotes = String(x.invoiceNotes || '').slice(0, 400);
  if (x.lowerCert !== '' && x.lowerCert != null) { const bp = Math.round(Number(x.lowerCert) * 100); if (!(bp >= 0 && bp <= 2000)) errors.push('Lower TDS rate'); terms.lowerCertRateBp = bp; terms.lowerCertValidTo = x.lowerCertTo || null; }
  return terms;
}
function termsToForm(T) {
  const r = (p) => (p == null ? '' : formatINR(p, { symbol: '' }));
  const e = T.rent.escalation || { type: 'none' };
  return { tenantCategory: T.tenantCategory || '', kind: T.property?.kind || 'commercial', use: T.property?.use || 'business', proprietor: T.proprietorOwnResidence == null ? '' : T.proprietorOwnResidence ? 'yes' : 'no', rent: r(T.rent.amountPaise),
    escType: e.type, escPct: e.bp ? String(e.bp / 100) : '5', escAmt: r(e.incrementPaise), escFirst: e.firstDate || '', escEvery: String(e.everyMonths || 12), compounding: e.compounding !== false, steps: (e.steps || []).map((s) => `${s.from}, ${s.amountPaise / 100}`).join('\n'),
    maintBasis: T.maintenance?.basis || 'none', maintAmt: r(T.maintenance?.amountPaise), maintRate: r(T.maintenance?.ratePaise), maintUnit: T.maintenance?.unitLabel || '', maintIssuer: T.maintenance?.issuer || 'landlord', maintTax: !!T.maintenance?.itemTax?.confirmed, maintSac: T.maintenance?.itemTax?.sac || '', maintRate2: String((T.maintenance?.itemTax?.rateBp ?? 1800) / 100), maintCharge: T.maintenance?.itemTax?.charge || 'forward',
    dgBasis: T.dg?.basis || 'none', dgAmt: r(T.dg?.amountPaise), dgRate: r(T.dg?.ratePaise), dgUnit: T.dg?.unitLabel || 'kWh', dgNature: T.dg?.nature || 'backup_power', dgTax: !!T.dg?.itemTax?.confirmed, dgSac: T.dg?.itemTax?.sac || '', dgRate2: String((T.dg?.itemTax?.rateBp ?? 1800) / 100), dgCharge: T.dg?.itemTax?.charge || 'forward',
    deposit: r(T.deposit?.amountPaise), special: T.special || [], billingDay: String(T.billingDay || 1), dueDays: String(T.dueDays ?? 7), documentMode: T.documentMode || 'separate', templateId: T.templateId || 'classic', proration: T.prorationPolicy || '', schedule: T.schedule?.mode || 'manual', po: T.poNumber || '' };
}
/** Convert the agreement form to terms; returns { terms, missing, errors }. */
function formToTerms(a) {
  const missing = []; const errors = [];
  const p = (v, label) => { try { return paise(v); } catch { errors.push(label); return null; } };
  const rent = p(a.rent, tr('monthlyRent')); if (!rent) missing.push(tr('monthlyRent'));
  if (!a.tenantCategory) missing.push(tr('tenantCat'));
  let escalation = { type: 'none' };
  if (a.escType === 'percent') { const bp = Math.round(Number(a.escPct) * 100); if (!(bp > 0 && bp <= 10000) || !a.escFirst) missing.push(tr('escType')); escalation = { type: 'percent', bp, everyMonths: Number(a.escEvery) || 12, firstDate: a.escFirst, compounding: !!a.compounding }; }
  if (a.escType === 'fixed') { const inc = p(a.escAmt, tr('escAmt')); if (!inc || !a.escFirst) missing.push(tr('escType')); escalation = { type: 'fixed', incrementPaise: inc || 0, everyMonths: Number(a.escEvery) || 12, firstDate: a.escFirst }; }
  if (a.escType === 'steps') {
    const steps = a.steps.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => { const [d, amt] = l.split(','); try { return { from: d.trim(), amountPaise: rupeesToPaise(amt.trim()) }; } catch { return null; } });
    if (!steps.length || steps.some((s) => !s || !/^\d{4}-\d{2}-\d{2}$/.test(s.from))) errors.push(tr('steps'));
    escalation = { type: 'steps', steps: steps.filter(Boolean) };
  }
  const itemTax = (on, sac, rate, charge) => (on ? { confirmed: true, sac: String(sac || '').trim(), rateBp: Math.round(Number(rate) * 100) || 0, charge } : null);
  const maintenance = a.maintBasis === 'none' ? { basis: 'none' } : { basis: a.maintBasis, amountPaise: p(a.maintAmt, tr('maintBasis')) || 0, ratePaise: p(a.maintRate, tr('ratePerUnit')) || 0, unitLabel: a.maintUnit, issuer: a.maintIssuer, description: 'Maintenance charges', escalation: { type: 'none' }, itemTax: itemTax(a.maintTax, a.maintSac, a.maintRate2, a.maintCharge) };
  const dg = a.dgBasis === 'none' ? { basis: 'none' } : { basis: a.dgBasis, nature: a.dgNature, amountPaise: p(a.dgAmt, tr('dgBasis')) || 0, ratePaise: p(a.dgRate, tr('ratePerUnit')) || 0, unitLabel: a.dgUnit, description: 'DG / generator charges', escalation: { type: 'none' }, itemTax: itemTax(a.dgTax, a.dgSac, a.dgRate2, a.dgCharge) };
  if (a.kind === 'residential_dwelling' && !a.use) missing.push(tr('use'));
  const bd = Number(a.billingDay); if (!(bd >= 1 && bd <= 31)) errors.push(tr('billingDay'));
  return {
    missing, errors,
    terms: { billingDay: bd || 1, dueDays: Math.max(0, Number(a.dueDays) || 0), property: { kind: a.kind, use: a.kind === 'commercial' ? 'business' : a.use }, proprietorOwnResidence: a.proprietor === '' ? null : a.proprietor === 'yes', tenantCategory: a.tenantCategory || 'unknown', assetKind: 'land_building', lowerCertRateBp: null, special: a.special || [],
      rent: { basis: 'fixed', amountPaise: rent || 0, baseDate: a.startDate, escalation }, maintenance, dg, documentMode: a.documentMode, dgSeparate: true, templateId: a.templateId, prorationPolicy: a.proration || null, taxInclusive: false,
      deposit: { amountPaise: p(a.deposit, tr('deposit')) || 0, treatment: 'refundable' }, schedule: { mode: a.schedule, approval: 'review', paused: false, endPeriod: null }, poNumber: a.po || '' },
  };
}

function landlordStep(w, d, f, sel) {
  const sup = d.suppliers[0];
  if (sup) {
    const g = sup.gstin ? validateGSTIN(sup.gstin) : null;
    return `<div class="subtle"><dl class="kv"><dt>${esc(tr('legalName'))}</dt><dd>${esc(sup.legalName)}</dd><dt>${esc(tr('gstReg'))}</dt><dd>${esc(tr(sup.gstRegType || 'unknown'))}</dd><dt>${esc(tr('gstin'))}</dt><dd>${esc(sup.gstin || '—')} ${g ? (g.valid ? chip('chip-ok', L() === 'hi' ? 'प्रारूप सही' : 'Format valid') : chip('chip-review', tr('badGstin', { reason: g.reason }))) : ''}</dd><dt>${esc(tr('bankTitle'))}</dt><dd>${esc(sup.bank?.bankName || '—')} ${esc(sup.bank?.account ? '••' + String(sup.bank.account).slice(-4) : '')}</dd></dl>
      <p class="small" style="margin-bottom:0"><a href="#/settings">${L() === 'hi' ? 'सेटिंग में बदलें' : 'Change in Settings'}</a></p></div>${registrationPanel(d)}`;
  }
  const s = w.s; const g = s.gstin ? validateGSTIN(s.gstin) : null;
  const money = (name, label, value) => `<div class="field"><label for="w-${name}">${esc(label)}</label><div class="prefix-input"><span>Rs.</span><input class="input" id="w-${name}" name="${name}" inputmode="decimal" value="${esc(value)}"></div></div>`;
  void money;
  return `<p class="sub">${L() === 'hi' ? 'यह एक बार पूछा जाता है और हर बिल पर छपता है।' : 'Asked once; printed on every invoice.'}</p>
    ${f('s.legalName', tr('legalName'), s.legalName, 'text', 'required')}${f('s.address', tr('address'), s.address)}
    <div class="grid-3"><div class="field"><label for="w-s.stateCode">${esc(tr('state'))}</label><select class="select" id="w-s.stateCode" name="s.stateCode">${stateOptions(s.stateCode)}</select></div>
    ${sel('s.gstRegType', tr('gstReg'), ['unregistered', 'regular', 'composition', 'unknown'].map((v) => [v, tr(v)]), s.gstRegType)}
    ${s.gstRegType === 'regular' ? sel('s.filing', tr('filing'), [['monthly', tr('monthly')], ['qrmp', tr('qrmp')]], s.filing) : ''}</div>
    ${['regular', 'composition'].includes(s.gstRegType) ? `${f('s.gstin', tr('gstin'), s.gstin, 'text', 'maxlength="15" autocapitalize="characters"')}${g && !g.valid ? `<p class="error">${esc(tr('badGstin', { reason: g.reason }))}</p>` : g && g.valid && g.stateCode !== s.stateCode ? `<p class="notice warn small">${L() === 'hi' ? 'GSTIN का राज्य कोड चुने गए राज्य से अलग है।' : 'The GSTIN state code differs from the state selected.'}</p>` : g && g.valid ? `<p class="small" style="color:var(--paid)">✓ ${L() === 'hi' ? 'प्रारूप और चेक-अंक सही' : 'Format and check digit valid'}</p>` : ''}` : ''}
    <div class="grid-2">${f('s.holder', tr('holder'), s.holder)}${f('s.bankName', tr('bankName'), s.bankName)}${f('s.account', tr('account'), s.account, 'text', 'inputmode="numeric" autocomplete="off"')}${f('s.ifsc', tr('ifsc'), s.ifsc, 'text', 'maxlength="11"')}</div>
    ${f('s.prefix', tr('series'), s.prefix, 'text', 'maxlength="6"')}
    ${registrationPanel(d, { stateCode: s.stateCode, gstRegType: s.gstRegType })}`;
}

function wizardStep(w, d) {
  const a = w.a; const step = w.step;
  const f = (name, label, value, type = 'text', extra = '') => `<div class="field"><label for="w-${name}">${esc(label)}</label><input class="input" id="w-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
  const money = (name, label, value) => `<div class="field"><label for="w-${name}">${esc(label)}</label><div class="prefix-input"><span>Rs.</span><input class="input" id="w-${name}" name="${name}" inputmode="decimal" value="${esc(value)}"></div></div>`;
  const sel = (name, label, options, value) => `<div class="field"><label for="w-${name}">${esc(label)}</label><select class="select" id="w-${name}" name="${name}">${options.map(([v, l]) => opt(v, l, value)).join('')}</select></div>`;
  if (step === 0) return landlordStep(w, d, f, sel);
  if (step === 1) {
    const props = d.properties;
    return `${props.length ? sel('propertyMode', tr('colProperty'), [['new', tr('newProp')], ['existing', tr('existingProp')]], w.propertyMode) : ''}
      ${w.propertyMode === 'existing' && props.length ? sel('propertyId', tr('existingProp'), props.map((p) => [p.id, p.name]), w.propertyId || props[0].id) : `${f('p.name', tr('propName'), w.p.name, 'text', 'required')}${f('p.address', tr('address'), w.p.address, 'text', 'required')}<div class="field"><label for="w-p.stateCode">${esc(tr('state'))}</label><select class="select" id="w-p.stateCode" name="p.stateCode">${stateOptions(w.p.stateCode)}</select></div>`}
      ${f('p.unit', tr('unit'), w.p.unit)}`;
  }
  if (step === 2) {
    const g = w.t.gstin ? validateGSTIN(w.t.gstin) : null;
    return `${f('t.legalName', tr('tenantName'), w.t.legalName, 'text', 'required')}
      <label class="check"><input type="checkbox" name="t.same"${w.t.same ? ' checked' : ''}><span>${esc(tr('sameAsProperty'))}</span></label>
      ${w.t.same ? '' : f('t.billingAddress', tr('billingAddress'), w.t.billingAddress)}
      <div class="grid-2"><div class="field"><label for="w-t.stateCode">${esc(tr('state'))}</label><select class="select" id="w-t.stateCode" name="t.stateCode">${stateOptions(w.t.stateCode)}</select></div>
      ${sel('t.gstStatus', tr('tenantGst'), [['unregistered', tr('unregistered')], ['regular', tr('regular')], ['composition', tr('composition')], ['unknown', tr('unknown')]], w.t.gstStatus)}</div>
      ${['regular', 'composition'].includes(w.t.gstStatus) ? `${f('t.gstin', tr('gstin'), w.t.gstin, 'text', 'autocapitalize="characters" maxlength="15"')}${g && !g.valid ? `<p class="error">${esc(tr('badGstin', { reason: g.reason }))}</p>` : ''}` : ''}
      ${sel('a.tenantCategory', tr('tenantCat'), [['', '—'], ...['company', 'firm_llp', 'trust_society_aop', 'government', 'individual_huf_audit', 'individual_huf_other', 'unknown'].map((c) => [c, tr(`c_${c}`)])], a.tenantCategory)}
      ${g && g.valid && g.stateCode !== w.t.stateCode ? `<p class="notice warn small">${L() === 'hi' ? `GSTIN राज्य कोड ${g.stateCode} है, पर चुना गया राज्य ${w.t.stateCode} है। जाँचें।` : `This GSTIN belongs to state ${g.stateCode}, but the tenant state selected is ${w.t.stateCode}. Please check.`}</p>` : ''}
      ${g && g.valid ? `<p class="small" style="color:var(--paid)">✓ ${L() === 'hi' ? 'GSTIN प्रारूप और चेक-अंक सही (पोर्टल पर सत्यापन नहीं)' : 'GSTIN format and check digit are valid (not verified on the GST portal)'}</p>` : ''}
      <div class="grid-3">${f('t.contactName', tr('contact'), w.t.contactName)}${f('t.email', tr('email'), w.t.email, 'email')}${f('t.phone', tr('phone'), w.t.phone || '', 'tel')}</div>`;
  }
  if (step === 3) {
    return `<div class="grid-2">${f('a.startDate', tr('startDate'), a.startDate, 'date', 'required')}${f('a.endDate', tr('endDate'), a.endDate, 'date')}</div>
      ${f('a.reference', tr('reference'), a.reference)}
      <div class="grid-2">${sel('a.kind', tr('propKind'), [['commercial', tr('k_commercial')], ['residential_dwelling', tr('k_residential_dwelling')]], a.kind)}
      ${a.kind === 'residential_dwelling' ? sel('a.use', tr('use'), [['residence', tr('u_residence')], ['business', tr('u_business')]], a.use === 'business' || a.use === 'residence' ? a.use : 'residence') : ''}</div>
      ${a.kind === 'residential_dwelling' && ['regular', 'composition'].includes(w.t.gstStatus) ? `<label class="check"><input type="checkbox" name="a.proprietor"${a.proprietor === 'yes' ? ' checked' : ''}><span>${esc(tr('proprietor'))}</span></label>` : ''}
      ${money('a.rent', tr('monthlyRent'), a.rent)}
      <label class="check"><input type="checkbox" name="x.inclusive"${w.x.inclusive ? ' checked' : ''}><span>${L() === 'hi' ? 'अनुबंध की राशि में GST पहले से शामिल है' : 'The amount in my agreement already includes GST'}</span></label>
      ${w.x.inclusive ? (() => { let base = ''; try { const pp = paise(a.rent); if (pp) base = formatINR(Math.round(pp * 100 / 118), { symbol: '' }); } catch { /* ignore */ } return `<div class="notice info small">${L() === 'hi' ? `18% GST मानकर, GST के बिना राशि लगभग Rs. ${base || '—'} होगी। KirayaKhata किराया GST के बिना रखता है — ऊपर वह राशि लिखें। दर की पुष्टि CA से करें।` : `If 18% GST applies, the amount without GST is about Rs. ${base || '—'}. KirayaKhata stores rent without GST — enter that figure above. Confirm the rate with your CA.`}</div>`; })() : ''}
      ${f('x.freeUntil', L() === 'hi' ? 'किराया-मुक्त अवधि इस तारीख़ तक (वैकल्पिक)' : 'Rent-free until (optional)', w.x.freeUntil, 'date')}
      <div class="subtle">${sel('a.escType', tr('escType'), [['none', tr('escNone')], ['percent', tr('escPercent')], ['fixed', tr('escFixed')], ['steps', tr('escSteps')]], a.escType)}
        ${a.escType === 'percent' ? `<div class="grid-3">${f('a.escPct', tr('escPct'), a.escPct, 'text', 'inputmode="decimal"')}${f('a.escFirst', tr('escFirst'), a.escFirst, 'date')}${f('a.escEvery', tr('escEvery'), a.escEvery, 'number', 'min="1" max="120"')}</div><label class="check"><input type="checkbox" name="a.compounding"${a.compounding ? ' checked' : ''}><span>${esc(tr('compounding'))}</span></label>` : ''}
        ${a.escType === 'fixed' ? `<div class="grid-3">${money('a.escAmt', tr('escAmt'), a.escAmt)}${f('a.escFirst', tr('escFirst'), a.escFirst, 'date')}${f('a.escEvery', tr('escEvery'), a.escEvery, 'number', 'min="1" max="120"')}</div>` : ''}
        ${a.escType === 'steps' ? `<div class="field"><label for="w-a.steps">${esc(tr('steps'))}</label><textarea class="input" id="w-a.steps" name="a.steps" rows="3">${esc(a.steps)}</textarea></div>` : ''}</div>
      <div class="subtle">${sel('a.maintBasis', tr('maintBasis'), [['none', tr('basisNone')], ['fixed', tr('basisFixed')], ['usage', tr('basisUsage')]], a.maintBasis)}
        ${a.maintBasis !== 'none' ? `${sel('a.maintIssuer', tr('maintIssuer'), [['landlord', tr('issuerLandlord')], ['external', tr('issuerExternal')]], a.maintIssuer)}
        ${a.maintBasis === 'fixed' ? money('a.maintAmt', tr('amount'), a.maintAmt) : `<div class="grid-2">${money('a.maintRate', tr('ratePerUnit'), a.maintRate)}${f('a.maintUnit', tr('unitLabel'), a.maintUnit)}</div>`}
        ${a.maintIssuer === 'landlord' ? `<label class="check"><input type="checkbox" name="a.maintTax"${a.maintTax ? ' checked' : ''}><span>${esc(tr('itemTaxConfirm'))}</span></label>${a.maintTax ? `<div class="grid-3">${f('a.maintSac', tr('sac'), a.maintSac)}${f('a.maintRate2', tr('gstRate'), a.maintRate2, 'text', 'inputmode="decimal"')}${sel('a.maintCharge', tr('chargeType'), [['forward', tr('forward')], ['exempt', tr('exemptOpt')], ['rcm', tr('rcmOpt')]], a.maintCharge)}</div>` : `<p class="small muted">${esc(msg('ITEM_UNCLASSIFIED', L(), { item: tr('maintenance') }))}</p>`}` : ''}` : ''}</div>
      <div class="subtle">${sel('a.dgBasis', tr('dgBasis'), [['none', tr('basisNone')], ['fixed', tr('basisFixed')], ['usage', tr('basisUsage')]], a.dgBasis)}
        ${a.dgBasis !== 'none' ? `${sel('a.dgNature', tr('dgNature'), [['backup_power', tr('dgBackup')], ['equipment_hire', tr('dgHire')], ['fuel_recovery', tr('dgFuel')], ['fixed_fee', tr('dgFee')], ['other', tr('other')]], a.dgNature)}
        ${a.dgBasis === 'fixed' ? money('a.dgAmt', tr('amount'), a.dgAmt) : `<div class="grid-2">${money('a.dgRate', tr('ratePerUnit'), a.dgRate)}${f('a.dgUnit', tr('unitLabel'), a.dgUnit)}</div>`}
        <label class="check"><input type="checkbox" name="a.dgTax"${a.dgTax ? ' checked' : ''}><span>${esc(tr('itemTaxConfirm'))}</span></label>${a.dgTax ? `<div class="grid-3">${f('a.dgSac', tr('sac'), a.dgSac)}${f('a.dgRate2', tr('gstRate'), a.dgRate2, 'text', 'inputmode="decimal"')}${sel('a.dgCharge', tr('chargeType'), [['forward', tr('forward')], ['exempt', tr('exemptOpt')], ['rcm', tr('rcmOpt')]], a.dgCharge)}</div>` : ''}` : ''}</div>
      ${a.maintBasis === 'fixed' && a.maintIssuer === 'landlord' ? `<div class="subtle">${sel('x.maintEscType', L() === 'hi' ? 'मेंटेनेंस बढ़ोतरी (किराये से अलग)' : 'Maintenance increase (separate from rent)', [['none', tr('escNone')], ['percent', tr('escPercent')], ['fixed', tr('escFixed')]], w.x.maintEscType)}
        ${w.x.maintEscType === 'percent' ? `<div class="grid-2">${f('x.maintEscPct', tr('escPct'), w.x.maintEscPct, 'text', 'inputmode="decimal"')}${f('x.maintEscFirst', tr('escFirst'), w.x.maintEscFirst, 'date')}</div>` : ''}
        ${w.x.maintEscType === 'fixed' ? `<div class="grid-2">${money('x.maintEscAmt', tr('escAmt'), w.x.maintEscAmt)}${f('x.maintEscFirst', tr('escFirst'), w.x.maintEscFirst, 'date')}</div>` : ''}</div>` : ''}
      ${money('a.deposit', tr('deposit'), a.deposit)}
      <fieldset><legend>${esc(tr('special'))}</legend>${SPECIALS.map((s) => `<label class="check"><input type="checkbox" name="special" value="${s}"${a.special.includes(s) ? ' checked' : ''}><span>${esc(tr(`sp_${s}`))}</span></label>`).join('')}</fieldset>`;
  }
  return `<div class="grid-2">${f('a.billingDay', tr('billingDay'), a.billingDay, 'number', 'min="1" max="31"')}${f('a.dueDays', tr('dueDays'), a.dueDays, 'number', 'min="0" max="90"')}</div>
    ${sel('a.documentMode', tr('docMode'), ['separate', 'rent_only', 'maintenance_only', 'combined'].map((m) => [m, tr(`m_${m}`)]), a.documentMode)}
    ${sel('a.templateId', tr('template'), ['classic', 'modern', 'letterhead'].map((m) => [m, tr(`t_${m}`)]), a.templateId)}
    ${sel('a.proration', tr('proration'), [['daily', tr('daily')], ['full_month', tr('fullMonth')], ['', tr('askMe')]], a.proration)}
    ${sel('a.schedule', tr('scheduleMode'), [['manual', tr('schedManual')], ['auto_draft', tr('schedAuto')]], a.schedule)}
    ${sel('x.billingTiming', L() === 'hi' ? 'बिल कब बनता है' : 'When is each month billed?', [['advance', L() === 'hi' ? 'महीने की शुरुआत में (अग्रिम)' : 'At the start of the month (in advance)'], ['arrears', L() === 'hi' ? 'महीना ख़त्म होने के बाद (बकाया)' : 'After the month ends (in arrears)']], w.x.billingTiming)}
    ${f('a.po', tr('poNumber'), a.po)}
    <div class="grid-2">${f('x.noticeMonths', L() === 'hi' ? 'नोटिस अवधि (महीने)' : 'Notice period (months)', w.x.noticeMonths, 'number', 'min="0" max="24"')}${f('x.lockInUntil', L() === 'hi' ? 'लॉक-इन इस तारीख़ तक' : 'Lock-in until', w.x.lockInUntil, 'date')}</div>
    <div class="field"><label for="w-x.invoiceNotes">${L() === 'hi' ? 'बिल पर छपने वाली शर्तें (जैसे विलंब शुल्क)' : 'Terms printed on invoices (e.g. late-payment interest)'}</label><textarea class="input" id="w-x.invoiceNotes" name="x.invoiceNotes" rows="2" maxlength="400">${esc(w.x.invoiceNotes)}</textarea></div>
    <div class="subtle"><p class="small" style="margin-top:0">${L() === 'hi' ? 'अगर किरायेदार के पास आपका कम/शून्य TDS प्रमाणपत्र है' : 'If you hold a lower / nil TDS deduction certificate for this tenant'}</p><div class="grid-2">${f('x.lowerCert', L() === 'hi' ? 'प्रमाणपत्र की दर %' : 'Certificate rate %', w.x.lowerCert, 'text', 'inputmode="decimal"')}${f('x.lowerCertTo', L() === 'hi' ? 'मान्य इस तारीख़ तक' : 'Valid until', w.x.lowerCertTo, 'date')}</div></div>`;
}

async function viewWizard(d, id) {
  if (!state.wizard || state.wizard.forId !== (id || 'new')) {
    if (id && id.startsWith('new-tenant-')) {
      const from = d.agreements.find((a) => a.id === id.slice('new-tenant-'.length));
      const w = from ? wizardFromExisting(d, from.id) : blankWizard();
      delete w.editId; w.replaces = from?.id; w.t = blankWizard().t; w.a.startDate = TODAY(); w.step = 2;
      state.wizard = w;
    } else state.wizard = id ? wizardFromExisting(d, id) : blankWizard();
    state.wizard.forId = id || 'new';
  }
  const w = state.wizard;
  const steps = [L() === 'hi' ? 'आप (मकान-मालिक)' : 'You (landlord)', tr('wiz1'), tr('wiz2'), tr('wiz3'), tr('wiz4')];
  return `<p><a href="#/properties">← ${esc(tr('nav_properties'))}</a></p><h1>${esc(tr('wizTitle'))}</h1>
    <form class="panel" id="wiz" novalidate><ol class="wiz-steps">${steps.map((s, i) => `<li class="${i === w.step ? 'on' : i < w.step ? 'done' : ''}">${i + 1}. ${esc(s)}</li>`).join('')}</ol>
    ${wizardStep(w, d)}
    <p class="error" id="wiz-err" role="alert" hidden></p>
    <div class="btn-row">${w.step > 0 ? `<button class="btn btn-ghost btn-sm" type="button" data-wstep="-1">${esc(tr('back'))}</button>` : ''}${w.step < 4 ? `<button class="btn btn-ink btn-sm" type="button" data-wstep="1">${esc(tr('next'))}</button>` : ''}
      <button class="btn btn-ghost btn-sm" type="button" data-wsave="draft">${esc(tr('saveDraft'))}</button>${w.step === 4 ? `<button class="btn btn-primary btn-sm" type="button" data-wsave="active">${esc(tr('saveActivate'))}</button>` : ''}</div></form>`;
}
function readWizard(form) {
  const w = state.wizard;
  const fd = new FormData(form);
  for (const [k, v] of fd.entries()) {
    if (k === 'special') continue;
    if (k === 'propertyMode') w.propertyMode = v; else if (k === 'propertyId') w.propertyId = v;
    else { const [g, key] = k.split('.'); if (w[g] && key) w[g][key] = v; }
  }
  for (const cb of $$('input[type=checkbox]', form)) {
    if (cb.name === 'special') continue;
    const [g, key] = cb.name.split('.');
    if (g === 'a' && key === 'proprietor') w.a.proprietor = cb.checked ? 'yes' : 'no';
    else if (w[g]) w[g][key] = cb.checked;
  }
  if ($$('input[name=special]', form).length) w.a.special = $$('input[name=special]:checked', form).map((c) => c.value);
  if (w.t.gstin) w.t.gstin = w.t.gstin.toUpperCase().trim();
}
BINDERS.add = (view, d) => {
  const form = $('#wiz', view);
  form.addEventListener('change', (e) => { if (e.target.matches('select, input[type=checkbox], input[name$="gstin"], input[name="a.rent"], input[type=date]')) { const id = e.target.id; readWizard(form); render().then(() => document.getElementById(id)?.focus()); } });
  $$('[data-wstep]', view).forEach((b) => b.addEventListener('click', () => { readWizard(form); state.wizard.step = Math.max(0, Math.min(4, state.wizard.step + Number(b.dataset.wstep))); render(); }));
  $$('[data-wsave]', view).forEach((b) => b.addEventListener('click', async () => { readWizard(form); await saveWizard(d, b.dataset.wsave); }));
};
async function saveWizard(d, mode) {
  const w = state.wizard; const err = $('#wiz-err');
  const { terms, missing, errors } = formToTerms(w.a);
  applyExtras(terms, w.x, errors);
  if (!d.suppliers.length) {
    if (!w.s.legalName) missing.unshift(L() === 'hi' ? 'आपका नाम' : 'Your name');
    if (w.s.gstRegType === 'regular' && !validateGSTIN(w.s.gstin).valid) missing.unshift(L() === 'hi' ? 'आपका GSTIN' : 'Your GSTIN');
  }
  if (w.propertyMode !== 'existing' && !w.p.name) missing.unshift(tr('propName'));
  if (w.propertyMode !== 'existing' && !w.p.address) missing.unshift(tr('address'));
  if (!w.t.legalName) missing.push(tr('tenantName'));
  if (['regular', 'composition'].includes(w.t.gstStatus) && !validateGSTIN(w.t.gstin).valid) missing.push(tr('gstin'));
  if (!w.a.startDate) missing.push(tr('startDate'));
  if (w.a.endDate && w.a.endDate < w.a.startDate) errors.push(tr('endDate'));
  if (errors.length) { err.textContent = `${tr('badAmount')}: ${errors.join(', ')}`; err.hidden = false; return; }
  if (mode === 'active' && missing.length) { err.textContent = tr('blocksBilling', { fields: missing.join(', ') }); err.hidden = false; return; }
  const now = new Date().toISOString();
  let supplier = d.suppliers[0];
  await state.repo.tx([], async (r) => {
    if (!supplier && w.s.legalName) {
      supplier = { id: makeId('sup'), legalName: w.s.legalName, address: w.s.address, stateCode: w.s.stateCode, gstRegType: w.s.gstRegType, gstin: w.s.gstRegType === 'unregistered' ? '' : String(w.s.gstin || '').toUpperCase(), filing: w.s.filing, resident: true, panAvailable: true,
        bank: { holder: w.s.holder, bankName: w.s.bankName, account: w.s.account, ifsc: String(w.s.ifsc || '').toUpperCase(), branch: '', upi: '' }, series: { prefix: (String(w.s.prefix || 'KK').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)) || 'KK', counters: {} }, createdAt: now };
      await r.put('suppliers', supplier);
    }
    let property;
    if (w.propertyMode === 'existing' && w.propertyId) property = await r.get('properties', w.propertyId);
    else property = { id: makeId('prop'), name: w.p.name || 'Untitled property', address: w.p.address, stateCode: w.p.stateCode, units: [], createdAt: now };
    let unitId = w.unitId;
    const label = (w.p.unit || '').trim();
    if (label && !property.units.find((u) => u.label === label)) { unitId = makeId('unit'); property.units = [...property.units, { id: unitId, label }]; }
    else if (label) unitId = property.units.find((u) => u.label === label).id;
    if (w.propertyMode !== 'existing' || label) await r.put('properties', property);
    const existing = w.editId ? await r.get('agreements', w.editId) : null;
    const tenant = { id: existing?.tenantId || makeId('ten'), legalName: w.t.legalName, billingAddress: w.t.same ? property.address : w.t.billingAddress, stateCode: w.t.stateCode, gstStatus: w.t.gstStatus, gstin: ['regular', 'composition'].includes(w.t.gstStatus) ? w.t.gstin : '', email: w.t.email, contactName: w.t.contactName, phone: w.t.phone || '', createdAt: existing ? undefined : now };
    await r.put('tenants', tenant);
    const ag = { ...(existing || {}), id: existing?.id || makeId('agr'), propertyId: property.id, unitId: unitId || null, tenantId: tenant.id, supplierId: supplier?.id || null, status: mode === 'active' && !missing.length && supplier ? 'active' : 'draft', incomplete: missing, startDate: w.a.startDate, endDate: w.a.endDate || null, reference: w.a.reference, createdAt: existing?.createdAt || now };
    await r.put('agreements', ag);
    const oldVersions = (await r.list('versions')).filter((v) => v.agreementId === ag.id);
    if (existing && ag.status !== 'draft' && existing.status !== 'draft') { /* edits to active agreements go through "What changed?" */ }
    else { for (const v of oldVersions) await r.delete('versions', v.id); await r.put('versions', { id: makeId('ver'), agreementId: ag.id, effectiveFrom: w.a.startDate, kind: 'initial', reason: 'Signed agreement', terms, createdAt: now }); }
    if (w.replaces) {
      const old = await r.get('agreements', w.replaces);
      if (old && !['ended', 'archived'].includes(old.status)) await r.put('agreements', { ...old, status: 'ended', endDate: old.endDate && old.endDate < w.a.startDate ? old.endDate : addDays(w.a.startDate, -1) });
    }
    await r.put('audit', { id: makeId('aud'), at: now, entity: 'agreement', entityId: ag.id, action: existing ? 'setup_updated' : 'created', detail: { status: ag.status, missing }, actor: 'local-owner' });
  });
  state.wizard = null; toast(tr('saved')); location.hash = '#/properties';
}

// ---------------- What changed? ----------------
async function viewChange(d, agId) {
  const ag = d.agreements.find((a) => a.id === agId);
  if (!ag) return '<div class="notice review">Not found.</div>';
  const vs = versionsOf(d, agId);
  const cur = versionOn(vs, TODAY()) || vs[vs.length - 1];
  if (!state.change || state.change.agId !== agId) state.change = { agId, scope: 'from_date', effectiveFrom: `${addMonthsToPeriod(periodOf(TODAY()), 1)}-01`, reason: '', form: termsToForm(cur.terms), x: extrasToForm(cur.terms), adj: { amount: '', category: 'rent' }, endDate: ag.endDate || '', tenant: { ...tenantOf(d, ag) } };
  const c = state.change;
  const w = { step: 3, a: { ...c.form, startDate: ag.startDate }, t: c.tenant, p: {}, x: c.x };
  let preview = '';
  try {
    const periods = [0, 1, 2].map((i) => addMonthsToPeriod(periodOf(c.effectiveFrom), i));
    const beforeV = vs;
    let afterV = vs; let adjs = d.adjustments.filter((a) => a.agreementId === agId);
    if (c.scope === 'once') { const amt = paise(c.adj.amount, { allowNegative: true }); if (amt) adjs = [...adjs, { agreementId: agId, period: periodOf(c.effectiveFrom), category: c.adj.category, amountPaise: amt, reason: c.reason }]; }
    else { const { terms } = formToTerms({ ...c.form, startDate: ag.startDate }); applyExtras(terms, c.x, []); afterV = [...vs, { id: 'preview', agreementId: agId, effectiveFrom: c.effectiveFrom, terms, createdAt: 'z' }]; }
    const agAfter = { ...ag, endDate: c.endDate || ag.endDate };
    const tot = (vers, agx, ad, p) => { const ch = computePeriodCharges({ agreement: agx, versions: vers, period: p, adjustments: ad }); if (ch.status !== 'READY') return tr(`st_${ch.status === 'NEEDS_INPUT' ? 'NEEDS_INPUT' : ch.status}`); return INR(sum([...ch.lines.rent, ...ch.lines.maintenance, ...ch.lines.dg].map((l) => l.amountPaise))); };
    preview = `<table class="data"><thead><tr><th>${esc(tr('period'))}</th><th class="r">${esc(tr('before'))}</th><th class="r">${esc(tr('after'))}</th></tr></thead><tbody>${periods.map((p) => `<tr><td>${esc(periodLabel(p, L()))}</td><td class="r">${tot(beforeV, ag, d.adjustments.filter((a) => a.agreementId === agId), p)}</td><td class="r">${tot(afterV, agAfter, adjs, p)}</td></tr>`).join('')}</tbody></table><p class="small muted">Before GST. Rent + fixed maintenance/DG for each month.</p>`;
  } catch (e) { preview = `<p class="error">${esc(e.message)}</p>`; }
  return `<p><a href="#/property/${agId}">← ${esc(agLabel(d, ag))}</a></p><h1>${esc(tr('changeTitle'))}</h1>
  <form class="panel" id="chg" novalidate>
    <div class="grid-2"><div class="field"><label for="c-scope">${esc(tr('scope'))}</label><select class="select" id="c-scope" name="scope">${opt('from_date', tr('scopeFrom'), c.scope)}${opt('once', tr('scopeOnce'), c.scope)}${opt('new_agreement', tr('scopeNew'), c.scope)}</select></div>
    <div class="field"><label for="c-eff">${esc(tr('effDate'))}</label><input class="input" type="date" id="c-eff" name="effectiveFrom" value="${esc(c.effectiveFrom)}" required></div></div>
    <div class="field"><label for="c-reason">${esc(tr('reason'))}</label><input class="input" id="c-reason" name="reason" value="${esc(c.reason)}" maxlength="140"></div>
    ${c.scope === 'once' ? `<div class="grid-2"><div class="field"><label for="c-adj">${esc(tr('adjAmount'))}</label><div class="prefix-input"><span>Rs.</span><input class="input" id="c-adj" name="adjAmount" value="${esc(c.adj.amount)}"></div></div><div class="field"><label for="c-adjcat">${esc(tr('adjCategory'))}</label><select class="select" id="c-adjcat" name="adjCategory">${opt('rent', tr('rent'), c.adj.category)}${opt('maintenance', tr('maintenance'), c.adj.category)}</select></div></div>`
    : `<div class="field"><label for="c-end">${esc(tr('endDate'))}</label><input class="input" type="date" id="c-end" name="endDate" value="${esc(c.endDate)}"></div>${wizardStep(w, d).replace(/name="a\./g, 'name="f.')}<h2 style="margin-top:18px">${esc(tr('wiz4'))}</h2>${wizardStep({ ...w, step: 4 }, d).replace(/name="a\./g, 'name="f.')}
      <div class="subtle"><h2>${esc(tr('tenantGstChange'))}</h2><div class="grid-2"><div class="field"><label for="c-tg">${esc(tr('tenantGst'))}</label><select class="select" id="c-tg" name="tg">${['unregistered', 'regular', 'composition', 'unknown'].map((s) => opt(s, tr(s), c.tenant.gstStatus)).join('')}</select></div><div class="field"><label for="c-tgst">${esc(tr('gstin'))}</label><input class="input" id="c-tgst" name="tgstin" value="${esc(c.tenant.gstin || '')}" maxlength="15"></div></div></div>`}
    <h2 style="margin-top:12px">${esc(tr('previewChange'))}</h2>${preview}
    <p class="error" id="chg-err" role="alert" hidden></p>
    <div class="btn-row"><button class="btn btn-primary" type="button" id="chg-save">${esc(tr('saveChange'))}</button><a class="btn btn-ghost" href="#/property/${agId}">${esc(tr('cancel'))}</a></div>
  </form>`;
}
function readChange(form) {
  const c = state.change; const fd = new FormData(form);
  c.scope = fd.get('scope') || c.scope; c.effectiveFrom = fd.get('effectiveFrom') || c.effectiveFrom; c.reason = fd.get('reason') || '';
  if (fd.has('adjAmount')) { c.adj.amount = fd.get('adjAmount'); c.adj.category = fd.get('adjCategory'); }
  if (fd.has('endDate')) c.endDate = fd.get('endDate');
  if (fd.has('tg')) { c.tenant.gstStatus = fd.get('tg'); c.tenant.gstin = String(fd.get('tgstin') || '').toUpperCase().trim(); }
  for (const [k, v] of fd.entries()) { if (k.startsWith('f.')) c.form[k.slice(2)] = v; if (k.startsWith('x.')) c.x[k.slice(2)] = v; }
  for (const cb of $$('input[type=checkbox][name^="x."]', form)) c.x[cb.name.slice(2)] = cb.checked;
  for (const cb of $$('input[type=checkbox]', form)) { if (cb.name.startsWith('f.')) { const key = cb.name.slice(2); c.form[key] = key === 'proprietor' ? (cb.checked ? 'yes' : 'no') : cb.checked; } }
  if ($$('input[name=special]', form).length) c.form.special = $$('input[name=special]:checked', form).map((x) => x.value);
}
BINDERS.change = (view, d, agId) => {
  const form = $('#chg', view);
  form.addEventListener('change', () => { readChange(form); render(); });
  $('#chg-save', view).addEventListener('click', async () => {
    readChange(form);
    const c = state.change; const err = $('#chg-err');
    if (!c.effectiveFrom) { err.textContent = tr('effDate'); err.hidden = false; return; }
    try {
      let res;
      if (c.scope === 'once') {
        const amt = paise(c.adj.amount, { allowNegative: true });
        if (!amt) { err.textContent = tr('adjAmount'); err.hidden = false; return; }
        res = await applyChange(state.repo, { agreementId: agId, scope: 'once', effectiveFrom: c.effectiveFrom, reason: c.reason || 'One-month adjustment', oneOff: { category: c.adj.category, amountPaise: amt } });
      } else {
        const { terms, missing, errors } = formToTerms({ ...c.form, startDate: d.agreements.find((a) => a.id === agId).startDate });
        applyExtras(terms, c.x, errors);
        if (errors.length || missing.length) { err.textContent = tr('blocksBilling', { fields: [...errors, ...missing].join(', ') }); err.hidden = false; return; }
        if (['regular', 'composition'].includes(c.tenant.gstStatus) && !validateGSTIN(c.tenant.gstin).valid) { err.textContent = tr('badGstin', { reason: validateGSTIN(c.tenant.gstin).reason }); err.hidden = false; return; }
        res = await applyChange(state.repo, { agreementId: agId, scope: c.scope, effectiveFrom: c.effectiveFrom, reason: c.reason || (c.scope === 'new_agreement' ? 'Renewal' : 'Change'), terms });
        await state.repo.tx([], async (r) => {
          const ag = await r.get('agreements', agId);
          if ((c.endDate || null) !== (ag.endDate || null)) await r.put('agreements', { ...ag, endDate: c.endDate || null });
          const t = await r.get('tenants', ag.tenantId);
          if (t.gstStatus !== c.tenant.gstStatus || (t.gstin || '') !== (c.tenant.gstin || '')) await r.put('tenants', { ...t, gstStatus: c.tenant.gstStatus, gstin: c.tenant.gstin });
        });
      }
      state.change = null;
      toast(tr('draftsFlagged', { n: res.affectedDrafts.length }));
      location.hash = `#/property/${agId}`;
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  });
};

function checklistHtml(inv) {
  const items = complianceChecklist(inv.doc, inv.snapshot, { number: inv.number });
  const blocks = items.filter((i) => i.level === 'block').length;
  const hi = L() === 'hi';
  return `<div class="checklist" style="box-shadow:none;margin:10px 0"><h3><span>${hi ? 'GST बिल जाँच-सूची' : 'GST invoice checklist'}</span>${blocks ? `<span class="chip chip-review">${blocks} ${hi ? 'बाकी' : 'to fix'}</span>` : `<span class="chip chip-ok">${hi ? 'अनुपालक' : 'Compliant'}</span>`}</h3>
    <ul>${items.map((i) => `<li class="${i.level}"><span class="mark" aria-hidden="true">${i.ok ? '✓' : i.level === 'block' ? '!' : '•'}</span><span>${esc(hi ? i.hi : i.en)}</span><span class="rule">${esc(i.rule)}</span></li>`).join('')}</ul>
    ${blocks ? `<p class="small muted">${hi ? 'अपना विवरण “सेटिंग” में और किरायेदार/संपत्ति का विवरण अनुबंध में ठीक करें, फिर नीचे का बटन दबाएँ।' : 'Fix your details in Settings and the tenant/property details in the agreement, then press the button below.'}</p>${inv.status === 'draft' ? `<button class="btn btn-ink btn-sm" type="button" id="recalc2">${hi ? 'मेरे नए विवरण से यह ड्राफ़्ट ताज़ा करें' : 'Refresh this draft with my latest details'}</button>` : ''}` : ''}</div>`;
}

// ---------------- Invoices ----------------
async function viewInvoices(d) {
  const f = state.invFilter || { status: 'active' };
  let invs = [...d.invoices].sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : a.category < b.category ? -1 : 1));
  if (f.status === 'active') invs = invs.filter((i) => i.status !== 'superseded');
  return `<h1>${esc(tr('nav_invoices'))}</h1><div class="toolbar"><div class="field"><label for="inv-f">${esc(tr('status'))}</label><select class="select" id="inv-f">${opt('active', `${tr('s_draft')} + ${tr('s_issued')}`, f.status)}${opt('all', 'All / सभी', f.status)}</select></div></div><div class="panel">${invoiceTable(d, invs)}</div>`;
}
BINDERS.invoices = (view) => { $('#inv-f', view).addEventListener('change', (e) => { state.invFilter = { status: e.target.value }; render(); }); };

function mailtoFor(d, invs) {
  const t = d.tenants.find((x) => x.id === invs[0].tenantId);
  const p = invs[0].period;
  const subject = `Invoices for ${periodLabel(p, 'en')} — ${invs.map(invoiceLabel).join(', ')}`;
  const body = ['Dear Sir/Madam,', '', `Please find attached the invoices for ${periodLabel(p, 'en')}:`, ...invs.map((i) => `- ${i.doc.title}: ${invoiceLabel(i)}, service period ${i.doc.servicePeriod.from} to ${i.doc.servicePeriod.to}, amount due ${formatINR(i.doc.totalPaise)}`), '', '[Attach the downloaded PDF files before sending]', '', 'Regards', d.suppliers[0]?.legalName || ''].join('\n');
  return { to: t?.email || '', subject, body, href: `mailto:${encodeURIComponent(t?.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}

async function viewInvoice(d, id) {
  const inv = d.invoices.find((i) => i.id === id);
  if (!inv) return '<div class="notice review">Not found.</div>';
  const group = d.invoices.filter((i) => i.groupId === inv.groupId && i.status !== 'superseded');
  const blockers = inv.status === 'draft' ? issuanceBlockers(inv.doc, inv.snapshot) : [];
  const needsRuleConfirm = inv.status === 'draft' && inv.doc.ruleStatuses.includes('REQUIRES_CA_VERIFICATION');
  const bal = invoiceBalance(inv, d.receipts);
  const reasons = inv.doc.lines.flatMap((l) => l.tax.reasons.map((r) => msg(r.code, L(), r.params)));
  const tdsReasons = (inv.doc.tds?.reasons || []).map((r) => msg(r.code, L(), r.params));
  return `<p><a href="#/invoices">← ${esc(tr('nav_invoices'))}</a></p><h1>${esc(inv.doc.title)} · <span class="accent">${esc(invoiceLabel(inv))}</span></h1>
  <p class="sub">${esc(periodLabel(inv.period, L()))} · ${chip(inv.status === 'issued' ? 'chip-ok' : 'chip-draft', tr(`s_${inv.status}`))} ${taxChip(inv.doc.taxStatus)} ${inv.stale ? chip('chip-warn', tr('stale')) : ''}</p>
  <div class="doc-view"><div class="sheet-stack in">${renderInvoiceHTML(inv)}</div>
  <div>
    <div class="panel"><div class="btn-row" style="flex-direction:column;align-items:stretch">
      <button class="btn btn-primary" type="button" id="email-tenant">${L() === 'hi' ? 'किरायेदार को ईमेल करें (PDF सहित)' : 'Email to tenant (PDFs attached)'}</button>
      <button class="btn btn-ink" type="button" id="dl-pdf">${esc(tr('downloadPdf'))}</button>
      ${group.length > 1 ? `<button class="btn btn-ghost" type="button" id="dl-group">${esc(tr('downloadGroup'))}</button>` : ''}
      <a class="btn btn-ghost" id="mail" href="${esc(mailtoFor(d, group).href)}">${esc(tr('emailDraft'))}</a>
      <button class="btn btn-ghost" type="button" id="outbox-add">${esc(tr('addOutbox'))}</button>
      <p class="small muted">${esc(tr('attachNote'))}</p>
    </div></div>
    ${inv.status === 'draft' ? `<div class="panel"><h2>${esc(tr('issue'))}</h2>
      ${inv.stale ? `<div class="notice warn">${esc(inv.staleReason || tr('stale'))}</div><button class="btn btn-ink btn-sm" type="button" id="recalc">${esc(tr('recalc'))}</button>` : ''}
      ${checklistHtml(inv)}
      ${!blockers.length && !inv.stale ? `${needsRuleConfirm ? `<label class="check"><input type="checkbox" id="rules-ok"><span>${esc(tr('confirmRules'))}</span></label>` : ''}<button class="btn btn-primary btn-sm" type="button" id="issue">${esc(tr('issue'))}</button><p class="small muted">${esc(tr('issuedNote'))}</p>` : ''}</div>` : ''}
    ${inv.status === 'issued' && inv.kind !== 'credit_note' ? `<div class="panel"><p class="small muted">${esc(tr('issuedNote'))}</p><button class="btn btn-ghost btn-sm" type="button" id="cn">${esc(tr('creditNote'))}</button></div>` : ''}
    <div class="panel"><h2>${esc(tr('balance'))}</h2><dl class="kv"><dt>${esc(tr('total'))}</dt><dd>${INR(bal.payablePaise)}</dd><dt>${esc(tr('applyAmt'))}</dt><dd>${INR(bal.allocatedPaise)}</dd><dt>${esc(tr('tdsPart'))}</dt><dd>${INR(bal.reportedTdsPaise)}</dd><dt>${esc(tr('balance'))}</dt><dd><b>${INR(bal.balancePaise)}</b></dd></dl></div>
    <div class="panel"><h2>Why?</h2><ul class="reasons">${[...reasons, ...tdsReasons].map((r) => `<li>${esc(r)}</li>`).join('')}</ul><p class="small muted">Ruleset ${esc(inv.doc.rulesetVersion)}</p></div>
  </div></div>`;
}
BINDERS.invoice = (view, d, id) => {
  const inv = d.invoices.find((i) => i.id === id); if (!inv) return;
  const group = d.invoices.filter((i) => i.groupId === inv.groupId && i.status !== 'superseded');
  $('#email-tenant', view).addEventListener('click', async () => {
    const prior = d.outbox.filter((o) => o.real && o.status === 'accepted' && [...o.invoiceIds].sort().join(',') === group.map((i) => i.id).sort().join(','));
    if (prior.length && !window.confirm(L() === 'hi' ? `ये बिल ${new Date(prior[0].createdAt).toLocaleString()} को पहले ही भेजे जा चुके हैं। फिर से भेजें?` : `These invoices were already emailed on ${new Date(prior[0].createdAt).toLocaleString()}. Send again?`)) return;
    await openEmailDialog({
      group, tenant: d.tenants.find((t) => t.id === inv.tenantId), supplier: d.suppliers[0], isSample: state.ws === 'sample', resendCount: prior.length, toast,
      onIssue: () => document.getElementById('issue')?.scrollIntoView({ block: 'center' }),
      onSent: async (r) => {
        if (r.duplicate && d.outbox.some((o) => o.idempotencyKey === `real:${r.key}`)) return;
        await state.repo.put('outbox', { id: makeId('out'), idempotencyKey: `real:${r.key}`, real: true, invoiceIds: group.map((i) => i.id), to: r.to, subject: r.subject, status: 'accepted', providerId: r.providerId, attempts: [{ at: r.sentAt, result: 'accepted' }], createdAt: r.sentAt });
        render();
      },
    });
  });
  $('#dl-pdf', view).addEventListener('click', () => { try { downloadBlob(new Blob([pdfBytes(inv)], { type: 'application/pdf' }), invoiceFileName(inv)); } catch (e) { toast(e.message, 'error'); } });
  $('#dl-group', view)?.addEventListener('click', () => downloadBlob(makeZip(group.map((i) => ({ name: invoiceFileName(i), data: pdfBytes(i) }))), `invoices-${inv.period}.zip`, 'application/zip'));
  $('#outbox-add', view).addEventListener('click', async () => { const m = mailtoFor(d, group); const rec = await queueEmail(state.repo, { invoiceIds: group.map((i) => i.id), to: m.to || '(no email saved)', subject: m.subject, body: m.body }); toast(rec.duplicate ? tr('dupOutbox') : tr('saved')); location.hash = '#/outbox'; });
  $('#recalc', view)?.addEventListener('click', async () => { await recalculateDraft(state.repo, id); toast(tr('saved')); location.hash = '#/invoices'; });
  $('#recalc2', view)?.addEventListener('click', async () => { await recalculateDraft(state.repo, id); toast(tr('saved')); location.hash = '#/invoices'; });
  $('#issue', view)?.addEventListener('click', async () => {
    try { const out = await issueInvoice(state.repo, id, { reviewedRuleStatuses: $('#rules-ok', view)?.checked || false }); toast(`${tr('s_issued')}: ${out.number}`); render(); } catch (e) { toast(e.blockers ? (L() === 'hi' ? 'जाँच-सूची के लाल बिंदु ठीक करें।' : 'Fix the red items in the checklist first.') : e.message, 'error'); }
  });
  $('#cn', view)?.addEventListener('click', async () => { const cn = await createCreditNoteDraft(state.repo, id, { reason: 'Correction' }); location.hash = `#/invoice/${cn.id}`; });
};

// ---------------- Payments ----------------
function openInvoicesFor(d, tenantId) {
  return d.invoices.filter((i) => i.status !== 'superseded' && i.kind !== 'credit_note' && (!tenantId || i.tenantId === tenantId)).map((i) => ({ ...i, balance: invoiceBalance(i, d.receipts), expectedTdsPaise: i.doc.tds?.amountPaise || 0, expectedReceiptPaise: i.doc.totalPaise - (i.doc.tds?.amountPaise || 0) })).filter((i) => i.balance.balancePaise > 0);
}
async function viewPayments(d) {
  const p = state.pay || (state.pay = { tenantId: d.tenants[0]?.id || '', date: TODAY(), amount: '', ref: '', type: 'rent', suggestions: null, csv: null });
  const open = openInvoicesFor(d, p.tenantId);
  const sugg = p.suggestions;
  return `<h1>${esc(tr('nav_payments'))}</h1>
  <form class="panel" id="pay" novalidate><h2>${esc(tr('recordReceipt'))}</h2>
    <div class="grid-2"><div class="field"><label for="p-ten">${esc(tr('colTenant'))}</label><select class="select" id="p-ten" name="tenantId">${d.tenants.map((t) => opt(t.id, t.legalName, p.tenantId)).join('')}</select></div>
    <div class="field"><label for="p-type">${esc(tr('receiptType'))}</label><select class="select" id="p-type" name="type">${opt('rent', tr('rt_rent'), p.type)}${opt('deposit', tr('rt_deposit'), p.type)}${opt('advance', tr('rt_advance'), p.type)}</select></div></div>
    <div class="grid-3"><div class="field"><label for="p-date">${esc(tr('date'))}</label><input class="input" type="date" id="p-date" name="date" value="${esc(p.date)}"></div>
    <div class="field"><label for="p-amt">${esc(tr('amount'))}</label><div class="prefix-input"><span>Rs.</span><input class="input" id="p-amt" name="amount" inputmode="decimal" value="${esc(p.amount)}"></div></div>
    <div class="field"><label for="p-ref">${esc(tr('refNo'))}</label><input class="input" id="p-ref" name="ref" value="${esc(p.ref)}" maxlength="64"></div></div>
    ${p.type === 'rent' ? `<button class="btn btn-ink btn-sm" type="button" id="p-suggest">${esc(tr('suggest'))}</button>` : `<p class="small muted">${esc(tr('depositKept'))}</p><button class="btn btn-primary btn-sm" type="button" id="p-save-dep">${esc(tr('confirmReceipt'))}</button>`}
    ${sugg ? `<div style="margin-top:14px"><p class="small muted">${esc(tr('suggestionsNote'))}</p><div class="table-wrap"><table class="data"><thead><tr><th>${esc(tr('invNumber'))}</th><th class="r">${esc(tr('expectedRcpt'))}</th><th class="r">${esc(tr('balance'))}</th><th>${esc(tr('applyAmt'))}</th><th>${esc(tr('tdsPart'))}</th></tr></thead><tbody>${open.map((i) => { const s = sugg.find((x) => x.invoiceId === i.id); return `<tr><td>${esc(invoiceLabel(i))}<br><small>${esc(tr(i.category))} · ${esc(periodLabel(i.period, L()))}</small></td><td class="r">${INR(i.expectedReceiptPaise)}</td><td class="r">${INR(i.balance.balancePaise)}</td><td><input class="input inline-input" data-alloc="${i.id}" inputmode="decimal" value="${s ? esc(formatINR(s.amountPaise, { symbol: '' })) : ''}" aria-label="${esc(tr('applyAmt'))} ${esc(invoiceLabel(i))}"></td><td><input class="input inline-input" data-tds="${i.id}" inputmode="decimal" value="${s && s.tdsPaise ? esc(formatINR(s.tdsPaise, { symbol: '' })) : ''}" aria-label="${esc(tr('tdsPart'))} ${esc(invoiceLabel(i))}"></td></tr>`; }).join('') || `<tr><td colspan="5">${esc(tr('nothingOpen'))}</td></tr>`}</tbody></table></div>
    <p class="error" id="p-err" role="alert" hidden></p><button class="btn btn-primary btn-sm" type="button" id="p-save">${esc(tr('confirmReceipt'))}</button></div>` : ''}
  </form>
  <div class="panel"><h2>${esc(tr('csvImport'))}</h2><p class="small muted">${esc(tr('csvNote'))}</p><input type="file" accept=".csv,text/csv" id="csv-file" class="input">
    ${p.csv ? `<p>${esc(tr('csvRows', { n: p.csv.rows.length, e: p.csv.errors.length }))}</p><div class="table-wrap"><table class="data"><tbody>${p.csv.rows.map((r, i) => `<tr><td>${esc(formatDate(r.date, L()))}</td><td class="r">${INR(r.amountPaise)}</td><td>${esc(r.reference)}<br><small>${esc(r.narration)}</small></td><td><button class="btn btn-ghost btn-sm" type="button" data-use-row="${i}">${esc(tr('useRow'))}</button></td></tr>`).join('')}</tbody></table></div>` : ''}</div>
  <div class="panel"><h2>${esc(tr('openInvoices'))}</h2>${invoiceTable(d, d.invoices.filter((i) => i.status !== 'superseded' && invoiceBalance(i, d.receipts).balancePaise > 0))}</div>
  <div class="panel"><h2>${esc(tr('receipts'))}</h2><div class="table-wrap"><table class="data"><thead><tr><th>${esc(tr('date'))}</th><th>${esc(tr('colTenant'))}</th><th>${esc(tr('receiptType'))}</th><th class="r">${esc(tr('amount'))}</th><th class="r">${esc(tr('unapplied'))}</th><th>${esc(tr('refNo'))}</th></tr></thead><tbody>${[...d.receipts].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => `<tr><td>${esc(formatDate(r.date, L()))}</td><td>${esc(d.tenants.find((t) => t.id === r.tenantId)?.legalName || '')}</td><td>${esc(tr(`rt_${r.type || 'rent'}`))}</td><td class="r">${INR(r.amountPaise)}</td><td class="r">${INR(r.unappliedPaise)}</td><td>${esc(r.reference || '')}</td></tr>`).join('') || '<tr><td colspan="6">—</td></tr>'}</tbody></table></div></div>`;
}
BINDERS.payments = (view, d) => {
  const form = $('#pay', view);
  const read = () => { const fd = new FormData(form); Object.assign(state.pay, { tenantId: fd.get('tenantId'), type: fd.get('type'), date: fd.get('date'), amount: fd.get('amount'), ref: fd.get('ref') }); };
  form.addEventListener('change', (e) => { if (e.target.matches('#p-ten, #p-type')) { read(); state.pay.suggestions = null; render(); } });
  $('#p-suggest', view)?.addEventListener('click', () => {
    read();
    let amt; try { amt = paise(state.pay.amount); } catch { amt = null; }
    if (!amt) { toast(tr('badAmount'), 'error'); return; }
    state.pay.suggestions = suggestAllocations({ amountPaise: amt }, openInvoicesFor(d, state.pay.tenantId));
    render();
  });
  const save = async (allocations) => {
    read();
    const amt = paise(state.pay.amount);
    try {
      await recordReceipt(state.repo, { tenantId: state.pay.tenantId, type: state.pay.type, date: state.pay.date, amountPaise: amt, reference: state.pay.ref.trim(), allocations, source: state.pay.fromCsv ? 'csv' : 'manual' });
      state.pay = null; toast(tr('saved')); render();
    } catch (e) { toast(e.code === 'DUPLICATE_RECEIPT' ? tr('dupReceipt') : e.message, 'error'); }
  };
  $('#p-save-dep', view)?.addEventListener('click', () => { try { if (!paise(state.pay.amount ?? $('#p-amt', view).value) && !paise($('#p-amt', view).value)) throw 0; save([]); } catch { toast(tr('badAmount'), 'error'); } });
  $('#p-save', view)?.addEventListener('click', () => {
    try {
      const allocs = $$('[data-alloc]', view).map((inp) => ({ invoiceId: inp.dataset.alloc, amountPaise: paise(inp.value) || 0, tdsPaise: paise($(`[data-tds="${inp.dataset.alloc}"]`, view).value) || 0 })).filter((a) => a.amountPaise || a.tdsPaise);
      save(allocs);
    } catch { const e = $('#p-err', view); e.textContent = tr('badAmount'); e.hidden = false; }
  });
  $('#csv-file', view).addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 2_000_000) { toast('File too large (max 2 MB)', 'error'); return; }
    state.pay.csv = parseBankCSV(await file.text());
    if (state.pay.csv.errors.some((x) => x.message === 'MISSING_COLUMNS' || x.message === 'NO_ROWS')) toast('CSV needs Date and Amount/Credit columns.', 'error');
    render();
  });
  $$('[data-use-row]', view).forEach((b) => b.addEventListener('click', () => {
    const r = state.pay.csv.rows[Number(b.dataset.useRow)];
    Object.assign(state.pay, { date: r.date, amount: formatINR(r.amountPaise, { symbol: '' }), ref: r.reference, fromCsv: true });
    state.pay.suggestions = suggestAllocations({ amountPaise: r.amountPaise }, openInvoicesFor(d, state.pay.tenantId));
    render();
  }));
};

// ---------------- Calendar ----------------
function profileFrom(d) {
  const s = d.suppliers[0] || {};
  return {
    gstRegType: s.gstRegType === 'unknown' ? 'unregistered' : (s.gstRegType || 'unregistered'), gstFilingFrequency: s.filing || 'monthly', stateCode: s.stateCode || '19',
    agreements: d.agreements.filter((a) => ['active', 'paused'].includes(a.status)).map((a) => { const v = versionOn(versionsOf(d, a.id), TODAY()) || versionsOf(d, a.id)[0]; const cat = v?.terms.tenantCategory; return { id: a.id, label: agLabel(d, a), dueDay: Math.min(31, (v?.terms.billingDay || 1) + (v?.terms.dueDays ?? 7)), startDate: a.startDate, endDate: a.endDate, tenantTdsKind: cat === 'individual_huf_other' ? 'small_individual' : cat && cat !== 'unknown' ? 'general' : null, noticeMonths: v?.terms.noticeMonths || null }; }),
    advanceTax: d.workspace.settings?.advanceTaxPaise != null ? { estimatedTaxPaise: d.workspace.settings.advanceTaxPaise, seniorNoBusiness: !!d.workspace.settings.seniorNoBusiness } : undefined,
  };
}
async function viewCalendar(d) {
  const completions = Object.fromEntries(d.completions.map((c) => [c.id, c]));
  const tasks = buildTasks(profileFrom(d), { from: addDays(TODAY(), -30), to: addDays(TODAY(), 120) }, { today: TODAY(), completions });
  return `<h1>${esc(tr('nav_calendar'))}</h1><p class="sub">${esc(tr('calProfile'))}</p><div class="btn-row" style="margin-bottom:16px"><button class="btn btn-ink btn-sm" type="button" id="ics">${esc(tr('dlIcs'))}</button></div>
    <ul class="tasks">${tasks.map((x) => taskHtml(x)).join('') || '<li class="task">—</li>'}</ul>`;
}
function taskHtml(x) {
  const g = GUIDES[x.guide]; const steps = g ? (g[L()] || g.en) : [];
  return `<li class="task ${x.status}"><div class="top"><h4>${esc(x.title)}</h4>${x.status === 'marked_done' ? chip('chip-ok', L() === 'hi' ? 'आपने पूरा चिह्नित किया' : 'Marked as done by you') : x.status === 'overdue' ? chip('chip-review', L() === 'hi' ? 'तारीख़ निकल गई' : 'Overdue') : chip('chip-neutral', formatDate(x.dueDate, L()))}</div>
    <p class="meta">${esc(formatDate(x.dueDate, L()))} · ${esc(x.periodLabel)} · ${esc(x.responsibility)}${x.optional ? ' · optional' : ''}${x.completion?.ackRef ? ` · Ack ${esc(x.completion.ackRef)}` : ''}</p>
    ${steps.length ? `<details><summary>${L() === 'hi' ? 'वहाँ क्या करना है' : 'What to do there'}</summary><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
    <div class="actions">${x.portal ? `<a class="btn btn-ink btn-sm" href="${esc(x.portal)}" target="_blank" rel="noopener noreferrer">Portal ↗</a>` : ''}<button class="btn btn-ghost btn-sm" type="button" data-done="${esc(x.key)}">${x.status === 'marked_done' ? (L() === 'hi' ? 'वापस लें' : 'Undo') : (L() === 'hi' ? 'मैंने पोर्टल पर यह कर लिया' : 'I did this on the portal')}</button></div>
    <p class="src">${x.reviewFlag ? (L() === 'hi' ? 'नियम CA सत्यापन के लिए चिह्नित · ' : 'Rule marked for CA verification · ') : ''}${x.sourceInfo ? `<a href="${esc(x.sourceInfo.url)}" target="_blank" rel="noopener noreferrer">${esc(x.sourceInfo.title)}</a>` : esc(x.applicability)}</p></li>`;
}
BINDERS.calendar = (view, d) => {
  $('#ics', view).addEventListener('click', () => downloadBlob(toICS(buildTasks(profileFrom(d), { from: TODAY(), to: addDays(TODAY(), 365) }, { today: TODAY() }), { stamp: new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z' }), 'kirayakhata-deadlines.ics', 'text/calendar'));
  $$('[data-done]', view).forEach((b) => b.addEventListener('click', async () => {
    const key = b.dataset.done; const existing = d.completions.find((c) => c.id === key);
    if (existing) await state.repo.delete('completions', key);
    else {
      const ack = window.prompt(L() === 'hi' ? 'पावती नंबर (वैकल्पिक)' : 'Acknowledgement number (optional)') || '';
      await state.repo.put('completions', { id: key, markedAt: new Date().toISOString(), ackRef: ack.slice(0, 40), note: 'User-reported; not government verification' });
    }
    render();
  }));
};

// ---------------- Outbox ----------------
async function viewOutbox(d) {
  return `<h1>${esc(tr('nav_outbox'))}</h1><div class="notice warn" style="margin-bottom:16px">${esc(tr('outboxNote'))} ${L() === 'hi' ? 'असली भेजे गए ईमेल "ईमेल सेवा ने स्वीकार किया" के रूप में दिखते हैं।' : 'Real emails sent from an invoice appear here as Accepted by email service.'}</div>
  <div class="panel"><div class="table-wrap"><table class="data"><thead><tr><th>${esc(tr('date'))}</th><th>${esc(tr('to'))}</th><th>${esc(tr('invoices'))}</th><th>${esc(tr('status'))}</th><th></th></tr></thead><tbody>${[...d.outbox].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((o) => `<tr><td>${esc(new Date(o.createdAt).toLocaleString())}</td><td>${esc(o.to)}</td><td>${o.invoiceIds.map((id) => esc(invoiceLabel(d.invoices.find((i) => i.id === id) || { draftNumber: id }))).join('<br>')}<br><small>${esc(o.subject)}</small></td><td>${o.real ? chip('chip-ok', L() === 'hi' ? 'ईमेल सेवा ने स्वीकार किया' : 'Accepted by email service') : chip(o.status === 'simulated_sent' ? 'chip-ok' : o.status === 'simulated_failed' ? 'chip-review' : 'chip-neutral', tr(`o_${o.status}`))}<br><small>${o.attempts.length} attempt(s)</small></td><td>${!o.real && o.status !== 'simulated_sent' ? `<button class="btn btn-ink btn-sm" type="button" data-sim="${o.id}">${esc(o.status === 'simulated_failed' ? tr('retry') : tr('simSend'))}</button> <button class="btn btn-ghost btn-sm" type="button" data-simfail="${o.id}">${esc(tr('simFail'))}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">—</td></tr>'}</tbody></table></div></div>`;
}
BINDERS.outbox = (view) => {
  $$('[data-sim]', view).forEach((b) => b.addEventListener('click', async () => { await simulateDelivery(state.repo, b.dataset.sim); render(); }));
  $$('[data-simfail]', view).forEach((b) => b.addEventListener('click', async () => { await simulateDelivery(state.repo, b.dataset.simfail, { fail: true }); render(); }));
};

// ---------------- Year-end ----------------
async function viewYearEnd(d) {
  const fy = state.fy || financialYearOf(TODAY());
  const data = buildYearData({ fy, invoices: d.invoices, receipts: d.receipts, agreements: d.agreements, versions: d.versions, tenants: d.tenants, properties: d.properties });
  const fys = [...new Set([financialYearOf(TODAY()), financialYearOf(addDays(TODAY(), -365)), ...d.invoices.map((i) => financialYearOf(`${i.period}-01`))])].sort().reverse();
  return `<h1>${esc(tr('nav_yearend'))}</h1><p class="sub">${esc(tr('notReturn'))}</p>
  <div class="toolbar"><div class="field"><label for="fy">${esc(tr('fy'))}</label><select class="select" id="fy">${fys.map((f) => opt(f, f, fy)).join('')}</select></div>
  <button class="btn btn-ink" type="button" id="ye-csv">${esc(tr('dlLedger'))}</button><button class="btn btn-ghost" type="button" id="ye-txt">${esc(tr('dlSummary'))}</button><button class="btn btn-ghost" type="button" id="ye-zip">${esc(tr('dlPack'))}</button></div>
  <div class="panel"><h2>${esc(tr('totals'))}</h2><dl class="kv"><dt>${esc(tr('rent'))}</dt><dd>${INR(data.totals.rent)}</dd><dt>${esc(tr('total'))}</dt><dd>${INR(data.totals.invoiced)}</dd><dt>GST</dt><dd>${INR(data.totals.gst)}</dd><dt>${esc(tr('receipts'))}</dt><dd>${INR(data.totals.received)}</dd><dt>${esc(tr('tdsPart'))}</dt><dd>${INR(data.totals.reportedTds)}</dd></dl></div>
  <div class="panel"><h2>${esc(tr('unresolved'))} (${data.unresolved.length})</h2><ul class="reasons">${data.unresolved.slice(0, 30).map((u) => `<li>${esc(u)}</li>`).join('') || '<li>—</li>'}</ul></div>
  <div class="panel"><h2>${esc(tr('missingDocs'))}</h2><ul class="reasons">${data.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
}
BINDERS.yearend = (view, d) => {
  const data = () => buildYearData({ fy: state.fy || financialYearOf(TODAY()), invoices: d.invoices, receipts: d.receipts, agreements: d.agreements, versions: d.versions, tenants: d.tenants, properties: d.properties });
  $('#fy', view).addEventListener('change', (e) => { state.fy = e.target.value; render(); });
  $('#ye-csv', view).addEventListener('click', () => downloadBlob(ledgerCSV(data()), `KirayaKhata-ledger-${state.fy || financialYearOf(TODAY())}${state.ws === 'sample' ? '-SAMPLE' : ''}.csv`, 'text/csv'));
  $('#ye-txt', view).addEventListener('click', () => downloadBlob(summaryText(data(), { sample: state.ws === 'sample' }), `KirayaKhata-summary-${state.fy || financialYearOf(TODAY())}.txt`, 'text/plain'));
  $('#ye-zip', view).addEventListener('click', () => downloadBlob(buildPackZip(data(), { sample: state.ws === 'sample' }), `KirayaKhata-year-end-${state.fy || financialYearOf(TODAY())}${state.ws === 'sample' ? '-SAMPLE' : ''}.zip`, 'application/zip'));
};

// ---------------- Settings & data ----------------
async function viewSettings(d) {
  const s = d.suppliers[0] || { gstRegType: 'unregistered', stateCode: '19', bank: {}, series: { prefix: 'KK', counters: {} }, resident: true, panAvailable: true };
  const g = s.gstin ? validateGSTIN(s.gstin) : null;
  const f = (name, label, value, type = 'text', extra = '') => `<div class="field"><label for="s-${name}">${esc(label)}</label><input class="input" id="s-${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" ${extra}></div>`;
  const ws = d.workspace.settings || {};
  const account = await accountPanelHtml();
  return `<h1>${esc(tr('nav_settings'))}</h1>
  ${account}
  ${registrationPanel(d)}
  ${supplierFormHtml(d)}
  ${dataPanelHtml()}`;
}
function supplierFormHtml(d, { welcome = false } = {}) {
  const s = d.suppliers[0] || { gstRegType: 'unregistered', stateCode: '19', bank: {}, series: { prefix: 'KK', counters: {} }, resident: true, panAvailable: true };
  const g = s.gstin ? validateGSTIN(s.gstin) : null;
  const f = (name, label, value, type = 'text', extra = '') => `<div class="field"><label for="s-${name}">${esc(label)}</label><input class="input" id="s-${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" ${extra}></div>`;
  const ws = d.workspace.settings || {};
  const hi = L() === 'hi';
  return `<form class="panel" id="sup" novalidate><h2>${esc(tr('supplierTitle'))}</h2>
    <p class="small muted">${hi ? 'यह हर बिल पर छपता है। GST बिल के लिए नाम, पूरा पता (PIN सहित), राज्य और GSTIN अनिवार्य हैं (CGST नियम 46)।' : 'Printed on every invoice. For a GST tax invoice your legal name, full address with PIN, state and GSTIN are mandatory (CGST Rule 46).'}</p>
    <div class="grid-2">${f('legalName', tr('legalName'), s.legalName, 'text', 'required autocomplete="name"')}${f('tradeName', hi ? 'व्यापार नाम (वैकल्पिक)' : 'Trade name (optional)', s.tradeName)}</div>
    ${f('address', hi ? 'पूरा पता, PIN सहित' : 'Full address with PIN', s.address, 'text', 'required autocomplete="street-address"')}
    <div class="grid-3"><div class="field"><label for="s-stateCode">${esc(tr('state'))}</label><select class="select" id="s-stateCode" name="stateCode">${stateOptions(s.stateCode)}</select></div>
    <div class="field"><label for="s-gst">${esc(tr('gstReg'))}</label><select class="select" id="s-gst" name="gstRegType">${['regular', 'composition', 'unregistered', 'unknown'].map((v) => opt(v, tr(v), s.gstRegType)).join('')}</select></div>
    <div class="field"><label for="s-filing">${esc(tr('filing'))}</label><select class="select" id="s-filing" name="filing">${opt('monthly', tr('monthly'), s.filing)}${opt('qrmp', tr('qrmp'), s.filing)}</select></div></div>
    <div class="field"><label for="s-aato">${hi ? 'पिछले वित्तीय वर्ष में आपके PAN पर कुल टर्नओवर' : 'Aggregate turnover under your PAN in the previous financial year'}</label><select class="select" id="s-aato" name="aato">${opt('', hi ? 'चुनें…' : 'Choose…', s.aato || '')}${opt('upto5cr', hi ? 'Rs 5 करोड़ तक' : 'Up to Rs 5 crore', s.aato || '')}${opt('above5cr', hi ? 'Rs 5 करोड़ से अधिक (ई-इनवॉइस लागू)' : 'Above Rs 5 crore (e-invoicing applies)', s.aato || '')}</select><span class="hint">${hi ? 'ई-इनवॉइस और SAC अंकों की ज़रूरत तय करता है।' : 'Decides whether e-invoicing applies and how many SAC digits are needed.'}</span></div>
    ${f('gstin', tr('gstin'), s.gstin, 'text', 'maxlength="15" autocapitalize="characters"')}${g && !g.valid ? `<p class="error">${esc(tr('badGstin', { reason: g.reason }))}</p>` : ''}
    <div class="grid-3">${f('email', tr('email'), s.email, 'email')}${f('phone', tr('phone'), s.phone)}${f('prefix', tr('series'), s.series?.prefix || 'KK', 'text', 'maxlength="6" pattern="[A-Za-z0-9]{1,6}"')}</div>
    <div class="grid-2">${f('signatoryName', tr('signatory'), s.signatoryName)}${f('signatoryDesignation', tr('designation'), s.signatoryDesignation)}</div>
    <h2 style="margin-top:12px">${esc(tr('bankTitle'))}</h2>
    <div class="grid-3">${f('holder', tr('holder'), s.bank?.holder)}${f('bankName', tr('bankName'), s.bank?.bankName)}${f('account', tr('account'), s.bank?.account, 'text', 'inputmode="numeric" autocomplete="off"')}${f('ifsc', tr('ifsc'), s.bank?.ifsc, 'text', 'maxlength="11" autocapitalize="characters"')}${f('branch', tr('branch'), s.bank?.branch)}${f('upi', tr('upi'), s.bank?.upi)}</div>
    <label class="check"><input type="checkbox" name="resident"${s.resident !== false ? ' checked' : ''}><span>${esc(tr('resident'))}</span></label>
    <label class="check"><input type="checkbox" name="panAvailable"${s.panAvailable !== false ? ' checked' : ''}><span>${esc(tr('panOk'))}</span></label>
    <h2 style="margin-top:12px">${esc(tr('autoTitle'))}</h2>
    <div class="grid-2">${f('noticeDays', tr('noticeDays'), ws.noticeDays ?? 45, 'number', 'min="0" max="365"')}<div class="field"><label for="s-adv">${esc(tr('advTax'))}</label><div class="prefix-input"><span>Rs.</span><input class="input" id="s-adv" name="advTax" inputmode="decimal" value="${ws.advanceTaxPaise != null ? esc(formatINR(ws.advanceTaxPaise, { symbol: '' })) : ''}"></div></div></div>
    <div class="grid-2"><div class="field"><label for="s-other">${L() === 'hi' ? 'साल की अन्य कारोबारी आय (उसी PAN पर) — पंजीकरण जाँच हेतु' : 'Other business income in the year (same PAN) — for the registration check'}</label><div class="prefix-input"><span>Rs.</span><input class="input" id="s-other" name="otherTurnover" inputmode="decimal" value="${ws.otherTurnoverPaise ? esc(formatINR(ws.otherTurnoverPaise, { symbol: '' })) : ''}"></div></div><div class="field"><label for="s-othertax">${L() === 'hi' ? 'क्या यह GST में कर-योग्य है?' : 'Is it taxable under GST?'}</label><select class="select" id="s-othertax" name="otherTax">${opt('', tr('unknown'), ws.otherTurnoverTaxable == null ? '' : 'x')}${opt('yes', L() === 'hi' ? 'हाँ' : 'Yes', ws.otherTurnoverTaxable === true ? 'yes' : '')}${opt('no', L() === 'hi' ? 'नहीं / छूट' : 'No / exempt', ws.otherTurnoverTaxable === false ? 'no' : '')}</select></div></div>
    <label class="check"><input type="checkbox" name="senior"${ws.seniorNoBusiness ? ' checked' : ''}><span>${esc(tr('senior'))}</span></label>
    <p class="error" id="s-err" role="alert" hidden></p>
    <button class="btn btn-primary" type="button" id="sup-save">${welcome ? (hi ? 'सहेजें और आगे: पहली संपत्ति जोड़ें' : 'Save and continue: add your first property') : esc(tr('save'))}</button>
  </form>`;
}
function dataPanelHtml() {
  return `<div class="panel"><h2>${esc(tr('dataTitle'))}</h2><p>${esc(tr('storageNote'))}</p>
    <div class="btn-row"><button class="btn btn-ink btn-sm" type="button" id="exp">${esc(tr('exportJson'))}</button><label class="btn btn-ghost btn-sm" for="imp">${esc(tr('importJson'))}</label><input type="file" id="imp" accept="application/json,.json" class="sr-only">
    ${state.ws === 'sample' ? `<button class="btn btn-ghost btn-sm" type="button" id="reset-sample">${esc(tr('resetSample'))}</button>` : ''}<button class="btn btn-danger btn-sm" type="button" id="del">${esc(tr('deleteWs'))}</button></div>
    <p class="small muted" style="margin-top:12px">${state.repo?.kind === 'cloud' ? (L() === 'hi' ? 'आपके रिकॉर्ड आपके खाते में सहेजे हैं; किसी भी डिवाइस पर साइन-इन करके देखें।' : 'Your records are saved to your account — sign in on any device to see them.') : esc(tr('planned'))}</p></div>`;
}
BINDERS.settings = (view, d) => {
  bindAccountPanel(view, () => render());
  bindSupplierForm(view, d, () => render());
  bindDataPanel(view, d);
};
function bindSupplierForm(view, d, onSaved) {
  $('#sup-save', view).addEventListener('click', async () => {
    const fd = new FormData($('#sup', view)); const err = $('#s-err', view);
    const gst = fd.get('gstRegType'); const gstin = String(fd.get('gstin') || '').toUpperCase().trim();
    const prefix = String(fd.get('prefix') || 'KK').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'KK';
    if (gst === 'regular' && gstin && !validateGSTIN(gstin).valid) { err.textContent = tr('badGstin', { reason: validateGSTIN(gstin).reason }); err.hidden = false; return; }
    if (gstin && validateGSTIN(gstin).valid && validateGSTIN(gstin).stateCode !== fd.get('stateCode')) { err.textContent = `${tr('badGstin', { reason: 'STATE' })}`; err.hidden = false; return; }
    let adv = null; let other = 0; try { adv = paise(fd.get('advTax')); other = paise(fd.get('otherTurnover')) || 0; } catch { err.textContent = tr('badAmount'); err.hidden = false; return; }
    const old = d.suppliers[0];
    if (!String(fd.get('legalName') || '').trim() || String(fd.get('address') || '').trim().length < 10) { err.textContent = L() === 'hi' ? 'नाम और पूरा पता ज़रूरी है।' : 'Your legal name and full address are required.'; err.hidden = false; return; }
    if (gst === 'regular' && !validateGSTIN(gstin).valid) { err.textContent = L() === 'hi' ? 'पंजीकृत हैं तो सही GSTIN लिखें।' : 'You chose “registered” — enter your valid GSTIN.'; err.hidden = false; return; }
    const sup = { ...(old || {}), id: old?.id || makeId('sup'), legalName: String(fd.get('legalName')).trim(), tradeName: String(fd.get('tradeName') || '').trim(), aato: fd.get('aato') || null, address: String(fd.get('address')).trim(), stateCode: fd.get('stateCode'), gstRegType: gst, filing: fd.get('filing'), gstin: gst === 'unregistered' ? '' : gstin, email: fd.get('email'), phone: fd.get('phone'), signatoryName: fd.get('signatoryName'), signatoryDesignation: fd.get('signatoryDesignation'),
      bank: { holder: fd.get('holder'), bankName: fd.get('bankName'), account: fd.get('account'), ifsc: String(fd.get('ifsc') || '').toUpperCase(), branch: fd.get('branch'), upi: fd.get('upi') }, series: { prefix, counters: old?.series?.counters || {} }, resident: fd.get('resident') === 'on', panAvailable: fd.get('panAvailable') === 'on' };
    await state.repo.tx([], async (r) => {
      await r.put('suppliers', sup);
      // Agreements created before the supplier existed get linked now.
      for (const a of (await r.list('agreements')).filter((x) => !x.supplierId)) await r.put('agreements', { ...a, supplierId: sup.id });
      const w = (await r.get('workspace', 'ws')) || { id: 'ws', schemaVersion: 1 };
      await r.put('workspace', { ...w, settings: { ...(w.settings || {}), noticeDays: Number(fd.get('noticeDays')) || 0, advanceTaxPaise: adv, seniorNoBusiness: fd.get('senior') === 'on', otherTurnoverPaise: other, otherTurnoverTaxable: fd.get('otherTax') === '' ? null : fd.get('otherTax') === 'yes' } });
      await r.put('audit', { id: makeId('aud'), at: new Date().toISOString(), entity: 'supplier', entityId: sup.id, action: 'updated', detail: null, actor: 'local-owner' });
    });
    toast(tr('saved')); onSaved();
  });
}
function bindDataPanel(view) {
  $('#exp', view).addEventListener('click', async () => downloadBlob(JSON.stringify(await state.repo.exportAll(), null, 2), `kirayakhata-${state.ws}-backup-${TODAY()}.json`, 'application/json'));
  $('#imp', view).addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (json.format !== 'kirayakhata-export') throw new Error('This is not a KirayaKhata export file.');
      const counts = Object.entries(json.data || {}).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.length}`).join(', ');
      if (await confirmDlg(tr('importConfirm', { counts }), { danger: true })) { await state.repo.importAll(json); toast(tr('imported')); render(); }
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#reset-sample', view)?.addEventListener('click', async () => { state.repo.close(); await deleteDatabase(DBS.sample); state.repo = null; await openWorkspace('sample'); toast(tr('saved')); render(); });
  $('#del', view).addEventListener('click', async () => {
    const wsName = state.ws === 'sample' ? tr('wsSample') : tr('wsOwner');
    if (!(await confirmDlg(tr('deleteConfirm', { ws: wsName }), { danger: true, requireText: 'DELETE' }))) return;
    if (state.repo.kind === 'cloud') { await state.repo.deleteEverything(); toast(tr('deleted')); render(); return; }
    state.repo.close(); await deleteDatabase(DBS[state.ws]); state.repo = null;
    toast(tr('deleted')); await openWorkspace(state.ws); render();
  });
}

// ---------------- Welcome (first run) ----------------
async function localOwnerHasData() {
  try { const r = await createIdbRepo(DBS.owner); const n = (await r.list('agreements')).length + (await r.list('suppliers')).length; const dump = n ? await r.exportAll() : null; r.close(); return dump; } catch { return null; }
}
async function viewWelcome(d) {
  const hi = L() === 'hi';
  const local = state.repo?.kind === 'cloud' ? await localOwnerHasData() : null;
  state.localDump = local;
  return `<h1>${hi ? 'स्वागत है! आइए आपका खाता सेट करें' : 'Welcome! Let’s set up your account'}</h1>
  <ol class="wiz-steps"><li class="on">1. ${hi ? 'आपका विवरण' : 'Your details'}</li><li>2. ${hi ? 'पहली संपत्ति जोड़ें' : 'Add your first property'}</li><li>3. ${hi ? 'इस महीने के बिल' : 'This month’s invoices'}</li></ol>
  ${local ? `<div class="banner info">${hi ? 'इस डिवाइस पर पहले से रिकॉर्ड हैं।' : 'This device already has records from before you signed in.'} <button class="btn btn-ink btn-sm" type="button" id="import-local">${hi ? 'इन्हें मेरे खाते में लाएँ' : 'Bring them into my account'}</button></div>` : ''}
  ${supplierFormHtml(d, { welcome: true })}`;
}
BINDERS.welcome = (view, d) => {
  bindSupplierForm(view, d, () => { location.hash = '#/add'; });
  $('#import-local', view)?.addEventListener('click', async () => {
    if (!state.localDump) return;
    const n = await state.repo.importAll(state.localDump);
    toast(L() === 'hi' ? `${n} रिकॉर्ड आपके खाते में आए।` : `${n} records moved into your account.`);
    location.hash = '#/properties';
  });
};

// ---------------- Login ----------------
function renderLogin(message) {
  const hi = L() === 'hi';
  $('#side-nav').innerHTML = `<a href="/">${esc(tr('nav_home'))}</a>`;
  $('#view').innerHTML = `<div class="panel" style="max-width:560px;margin:0 auto">
    <h1>${hi ? 'साइन-इन करें' : 'Sign in to KirayaKhata'}</h1>
    <p class="sub">${hi ? 'हर मकान-मालिक का अपना निजी खाता। आपकी संपत्तियाँ, किरायेदार और बिल केवल आपको दिखते हैं।' : 'Every landlord gets a private account. Your properties, tenants and invoices are visible only to you.'}</p>
    ${message ? `<div class="notice warn">${esc(message)}</div>` : ''}
    ${state.cfg?.googleLoginEnabled ? `<a class="btn btn-ink" style="width:100%" href="${esc(googleLoginUrl())}">${hi ? 'Google से जारी रखें' : 'Continue with Google'}</a><p class="small muted" style="text-align:center">${hi ? 'या ईमेल से' : 'or with email'}</p>` : ''}
    <div class="field"><label for="li-email">${hi ? 'आपका ईमेल' : 'Your email'}</label><input class="input" id="li-email" type="email" autocomplete="email" inputmode="email"></div>
    <button class="btn btn-primary" type="button" id="li-send" style="width:100%">${hi ? 'मुझे साइन-इन कोड / लिंक भेजें' : 'Email me a sign-in code'}</button>
    <div id="li-code-wrap" hidden style="margin-top:16px">
      <div class="field"><label for="li-code">${hi ? 'ईमेल में आया कोड' : 'Code from the email'}</label><input class="input" id="li-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"><span class="hint">${hi ? 'ईमेल में लिंक है तो उसे इसी ब्राउज़र में खोलें — आप अपने-आप साइन-इन हो जाएँगे।' : 'If the email has a link instead, open it in this browser — you’ll be signed in automatically.'}</span></div>
      <button class="btn btn-ink" type="button" id="li-verify" style="width:100%">${hi ? 'सत्यापित करें' : 'Verify and continue'}</button>
    </div>
    <p class="small" id="li-msg" role="status"></p>
    <hr style="border:0;border-top:1px solid var(--rule);margin:18px 0">
    <button class="link-btn" type="button" id="li-sample">${hi ? 'बिना साइन-इन के काल्पनिक नमूना देखें' : 'Look around the fictional sample first (no sign-in)'}</button>
  </div>`;
  const msg = (t, bad) => { const m = $('#li-msg'); m.textContent = t; m.style.color = bad ? 'var(--ledger)' : 'var(--paid)'; };
  $('#li-send').addEventListener('click', async () => {
    const email = $('#li-email').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg(hi ? 'सही ईमेल लिखें।' : 'Enter a valid email address.', true); return; }
    try { await requestCode(email); $('#li-code-wrap').hidden = false; msg(hi ? 'ईमेल भेजा गया। इनबॉक्स (और स्पैम) देखें।' : 'Sent. Check your inbox (and spam).'); $('#li-code').focus(); } catch (e) { msg(e.message, true); }
  });
  $('#li-verify').addEventListener('click', async () => {
    try { await verifyCode($('#li-email').value.trim(), $('#li-code').value.trim()); location.href = '/app'; } catch (e) { msg(e.message, true); }
  });
  $('#li-sample').addEventListener('click', async () => { try { localStorage.setItem('kk:ws', 'sample'); } catch { /* ignore */ } location.href = '/app'; });
}

// ---------------- start ----------------
async function start() {
  state.cfg = await getConfig();
  consumeHashSession();
  state.session = state.cfg.authEnabled ? await currentSession() : null;
  let ws = state.cfg.authEnabled ? 'owner' : 'sample';
  try { ws = localStorage.getItem('kk:ws') || ws; } catch { /* ignore */ }
  if (ws !== 'sample') ws = 'owner';
  $('#lang-btn').addEventListener('click', () => { setLang(L() === 'en' ? 'hi' : 'en'); if (!state.repo) renderLogin(); else render(); });
  if (ws === 'owner' && state.cfg.authEnabled && !state.session) { renderLogin(); bindWsSelect(); return; }
  if (!(await openWorkspace(ws))) return;
  bindWsSelect();
  window.addEventListener('hashchange', () => { render(); $('#view').focus({ preventScroll: true }); window.scrollTo(0, 0); });
  await render();
  await runScheduler(false);
  state.schedTimer = setInterval(() => runScheduler(false).catch(() => {}), 30 * 60 * 1000);
}
function bindWsSelect() {
  renderChromeSelect();
  $('#ws-select').addEventListener('change', async (e) => {
    state.wizard = null; state.change = null; state.pay = null; state.inputs = {};
    try { localStorage.setItem('kk:ws', e.target.value); } catch { /* ignore */ }
    if (e.target.value === 'owner' && state.cfg.authEnabled && !(await currentSession())) { location.href = '/app'; return; }
    if (await openWorkspace(e.target.value)) render();
  });
}
function renderChromeSelect() {
  $('#ws-select').innerHTML = opt('owner', state.cfg?.authEnabled ? (L() === 'hi' ? 'मेरा खाता' : 'My account') : tr('wsOwner'), state.ws) + opt('sample', tr('wsSample'), state.ws);
}
start();
