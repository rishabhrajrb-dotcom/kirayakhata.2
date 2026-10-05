// Billing service shared by manual one-click, bulk and scheduler paths.
// Storage is injected (repo) so the same code runs on IndexedDB (browser), an in-memory
// store (tests) and, later, a server database.
//
// Repo contract (all async):
//   get(store, id) -> obj|undefined        put(store, obj)      delete(store, id)
//   list(store) -> obj[]                   findOne(store, field, value) -> obj|undefined
//   tx(storeNames[], async (r) => ...)     atomic + serialised; r has the same API
import { computePeriodCharges, buildDocuments, issuanceBlockers, formatInvoiceNumber, idempotencyKey, versionOn } from './billing.js';
import { financialYearOf, periodOf, fyBounds, addMonthsToPeriod, periodsBetween } from './dates.js';
import { sum } from './money.js';

export const STORES = ['workspace', 'suppliers', 'properties', 'tenants', 'agreements', 'versions', 'adjustments',
  'invoices', 'groups', 'receipts', 'outbox', 'runs', 'completions', 'audit', 'drafts'];

let counter = 0;
export function makeId(prefix, now = Date.now()) {
  counter = (counter + 1) % 1e6;
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${now.toString(36)}${counter.toString(36)}${rand}`;
}

async function audit(r, entity, entityId, action, detail, now) {
  await r.put('audit', { id: makeId('aud'), at: now, entity, entityId, action, detail: detail || null, actor: 'local-owner' });
}

/** Readiness of one agreement for one period, without writing anything. */
export async function previewAgreementPeriod(repo, agreementId, period, inputs = {}) {
  const ag = await repo.get('agreements', agreementId);
  if (!ag) return { agreementId, state: 'FAILED', reason: 'NOT_FOUND' };
  const base = { agreementId, propertyId: ag.propertyId, tenantId: ag.tenantId, unitId: ag.unitId };
  if (ag.status === 'archived') return { ...base, state: 'ARCHIVED' };
  if (ag.status === 'draft') return { ...base, state: 'NEEDS_INPUT', needs: [{ code: 'INCOMPLETE_SETUP', detail: ag.incomplete || [] }] };
  const allVersions = (await repo.list('versions')).filter((v) => v.agreementId === agreementId);
  const charges = computePeriodCharges({
    agreement: ag, versions: allVersions, period, inputs: inputs[agreementId] || {},
    adjustments: (await repo.list('adjustments')).filter((a) => a.agreementId === agreementId),
  });
  if (charges.status === 'NOT_STARTED') return { ...base, state: 'NOT_STARTED' };
  if (charges.status === 'LEASE_ENDED') return { ...base, state: 'LEASE_ENDED' };
  const version = versionOn(allVersions, charges.occupancy?.from || `${period}-01`);
  if (version?.terms?.schedule?.paused || ag.status === 'paused') return { ...base, state: 'PAUSED', charges };
  if (charges.status === 'NEEDS_INPUT') return { ...base, state: 'NEEDS_INPUT', needs: charges.needs, charges };
  const [supplier, tenant, property] = await Promise.all([repo.get('suppliers', ag.supplierId), repo.get('tenants', ag.tenantId), repo.get('properties', ag.propertyId)]);
  if (!supplier || !tenant || !property) return { ...base, state: 'NEEDS_INPUT', needs: [{ code: 'MISSING_PARTY' }] };
  const fyRentToDatePaise = await fyRentBefore(repo, agreementId, period);
  const docs = buildDocuments({ agreement: ag, version, supplier, tenant, property, period, charges, fyRentToDatePaise, invoiceDateOverride: (inputs[agreementId] || {}).invoiceDate });
  const existing = (await repo.list('invoices')).filter((i) => i.agreementId === agreementId && i.period === period && i.activeKey);
  const existingCats = new Set(existing.map((i) => i.category));
  const missing = docs.filter((d) => !existingCats.has(d.category));
  const state = docs.length === 0 ? 'NOTHING_TO_BILL' : missing.length === 0 ? 'ALREADY_GENERATED' : 'READY';
  return { ...base, state, docs, existing, charges, version, supplier, tenant, property, notes: charges.notes, reviewNeeded: docs.some((d) => d.taxStatus !== 'SUPPORTED') };
}

async function fyRentBefore(repo, agreementId, period) {
  const fy = financialYearOf(`${period}-01`);
  const { firstPeriod } = fyBounds(fy);
  const inv = (await repo.list('invoices')).filter((i) => i.agreementId === agreementId && i.activeKey && i.period >= firstPeriod && i.period < period && (i.category === 'rent' || i.category === 'combined'));
  return sum(inv.map((i) => sum(i.doc.lines.filter((l) => l.key === 'rent').map((l) => l.amountPaise))));
}

function snapshotParties({ supplier, tenant, property, agreement, version }) {
  const unit = (property.units || []).find((u) => u.id === agreement.unitId);
  return {
    supplier: { id: supplier.id, legalName: supplier.legalName, tradeName: supplier.tradeName, address: supplier.address, stateCode: supplier.stateCode, gstRegType: supplier.gstRegType, gstin: supplier.gstin, email: supplier.email, phone: supplier.phone, signatoryName: supplier.signatoryName, signatoryDesignation: supplier.signatoryDesignation, bank: supplier.bank ? { ...supplier.bank } : null },
    tenant: { id: tenant.id, legalName: tenant.legalName, billingAddress: tenant.billingAddress, stateCode: tenant.stateCode, gstStatus: tenant.gstStatus, gstin: tenant.gstin, contactName: tenant.contactName, email: tenant.email },
    property: { id: property.id, name: property.name, address: property.address, stateCode: property.stateCode, unitLabel: unit?.label || '' },
    agreement: { id: agreement.id, reference: agreement.reference || '', versionId: version.id, poNumber: version.terms.poNumber || '' },
    templateId: version.terms.templateId || 'classic',
  };
}

/**
 * The ONE generation function. mode: 'manual' | 'bulk' | 'scheduler' | 'retry' | 'recalc'.
 * Never creates a second active document for the same idempotency key.
 */
export async function generateBillingForPeriod(repo, { period, agreementIds, mode = 'manual', inputs = {}, ownerId = 'local', retryOf = null }, { now = new Date().toISOString(), failHook = null } = {}) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new RangeError('period must be YYYY-MM');
  const ids = agreementIds && agreementIds.length ? agreementIds : (await repo.list('agreements')).filter((a) => a.status !== 'archived').map((a) => a.id);
  const run = { id: makeId('run'), period, mode, createdAt: now, retryOf, results: [], counts: { ready: 0, created: 0, already: 0, skipped: 0, failed: 0, needsInput: 0 } };
  for (const agreementId of ids) {
    try {
      if (failHook) failHook(agreementId);
      const result = await repo.tx(['agreements', 'versions', 'adjustments', 'suppliers', 'tenants', 'properties', 'invoices', 'groups', 'audit'], async (r) => {
        const pv = await previewAgreementPeriod(r, agreementId, period, inputs);
        if (pv.state !== 'READY' && pv.state !== 'ALREADY_GENERATED') return { agreementId, state: pv.state, needs: pv.needs || null, invoiceIds: [] };
        const parties = snapshotParties({ supplier: pv.supplier, tenant: pv.tenant, property: pv.property, agreement: await r.get('agreements', agreementId), version: pv.version });
        const existingIds = pv.existing.map((i) => i.id);
        let group = pv.existing[0] ? await r.get('groups', pv.existing[0].groupId) : null;
        const created = [];
        for (const doc of pv.docs) {
          const key = idempotencyKey({ ownerId, agreementId, unitId: pv.unitId, period, category: doc.category, supplierId: pv.supplier.id });
          const dupe = await r.findOne('invoices', 'activeKey', key);
          if (dupe) continue; // already generated: return the existing document, never a duplicate
          if (!group) {
            group = { id: makeId('grp'), agreementId, period, propertyId: pv.propertyId, tenantId: pv.tenantId, createdAt: now, runId: run.id };
            await r.put('groups', group);
          }
          const inv = {
            id: makeId('inv'), groupId: group.id, agreementId, propertyId: pv.propertyId, tenantId: pv.tenantId, supplierId: pv.supplier.id,
            period, category: doc.category, activeKey: key, idempotencyKey: key, status: 'draft',
            draftNumber: `DRAFT-${period.replace('-', '')}-${doc.category.slice(0, 1).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            number: null, doc, snapshot: parties, createdAt: now, runId: run.id, stale: false, needsReview: doc.taxStatus !== 'SUPPORTED',
          };
          await r.put('invoices', inv);
          await audit(r, 'invoice', inv.id, 'draft_created', { period, category: doc.category, mode }, now);
          created.push(inv.id);
        }
        return { agreementId, state: created.length ? 'CREATED' : 'ALREADY_GENERATED', invoiceIds: created.length ? created : existingIds, existingIds };
      });
      run.results.push(result);
    } catch (err) {
      run.results.push({ agreementId, state: 'FAILED', error: String(err && err.message ? err.message : err), invoiceIds: [] });
    }
  }
  for (const res of run.results) {
    if (res.state === 'CREATED') { run.counts.created++; run.counts.ready++; }
    else if (res.state === 'ALREADY_GENERATED') run.counts.already++;
    else if (res.state === 'FAILED') run.counts.failed++;
    else if (res.state === 'NEEDS_INPUT') run.counts.needsInput++;
    else run.counts.skipped++;
  }
  await repo.put('runs', run);
  return run;
}

/** Retry only the agreements that FAILED in an earlier run. */
export async function retryFailed(repo, runId, opts = {}, deps = {}) {
  const prev = await repo.get('runs', runId);
  if (!prev) throw new Error('Run not found');
  const failed = prev.results.filter((r) => r.state === 'FAILED').map((r) => r.agreementId);
  if (!failed.length) return { ...prev, note: 'NOTHING_TO_RETRY' };
  return generateBillingForPeriod(repo, { period: prev.period, agreementIds: failed, mode: 'retry', retryOf: runId, ...opts }, deps);
}

/** Periods that have not been prepared since the last generated period (catch-up preview). */
export async function catchUpPeriods(repo, agreementId, currentPeriod) {
  const ag = await repo.get('agreements', agreementId);
  if (!ag) return [];
  const startP = periodOf(ag.startDate);
  const invs = (await repo.list('invoices')).filter((i) => i.agreementId === agreementId && i.activeKey);
  const done = new Set(invs.map((i) => i.period));
  const endP = ag.endDate && periodOf(ag.endDate) < currentPeriod ? periodOf(ag.endDate) : currentPeriod;
  const last = invs.map((i) => i.period).sort().pop();
  const from = last ? addMonthsToPeriod(last, 1) : startP;
  if (from > endP) return [];
  return periodsBetween(from, endP).filter((p) => !done.has(p));
}

/** Issue a draft: allocate the next number atomically and freeze the snapshot. */
export async function issueInvoice(repo, invoiceId, { reviewedRuleStatuses = false, now = new Date().toISOString() } = {}) {
  return repo.tx(['invoices', 'suppliers', 'audit'], async (r) => {
    const inv = await r.get('invoices', invoiceId);
    if (!inv) throw new Error('Invoice not found');
    if (inv.status !== 'draft') throw new Error(`Only drafts can be issued (this is ${inv.status}).`);
    if (inv.stale) throw new Error('Agreement terms changed after this draft. Recalculate it first.');
    const blockers = issuanceBlockers(inv.doc, inv.snapshot);
    if (blockers.length) { const e = new Error('Cannot issue yet'); e.blockers = blockers; throw e; }
    if (inv.doc.ruleStatuses.includes('REQUIRES_CA_VERIFICATION') && !reviewedRuleStatuses) {
      const e = new Error('Confirm you have reviewed rules marked for CA verification.'); e.blockers = ['CONFIRM_RULE_REVIEW']; throw e;
    }
    const supplier = await r.get('suppliers', inv.supplierId);
    const fy = financialYearOf(inv.doc.invoiceDate);
    const series = supplier.series || { prefix: 'KK', counters: {} };
    const nextSeq = (series.counters[fy] || 0) + 1;
    const number = formatInvoiceNumber(series.prefix, fy, nextSeq);
    const clash = await r.findOne('invoices', 'numberKey', `${supplier.id}|${fy}|${number}`);
    if (clash) throw new Error(`Invoice number ${number} already exists - series counter needs review.`);
    supplier.series = { ...series, counters: { ...series.counters, [fy]: nextSeq } };
    await r.put('suppliers', supplier);
    const issued = { ...inv, status: 'issued', number, numberKey: `${supplier.id}|${fy}|${number}`, issuedAt: now, frozen: true };
    await r.put('invoices', issued);
    await audit(r, 'invoice', inv.id, 'issued', { number }, now);
    return issued;
  });
}

/** Record a new effective-dated version (or a one-off adjustment) and flag affected drafts. */
export async function applyChange(repo, { agreementId, scope, effectiveFrom, reason, terms, oneOff }, { now = new Date().toISOString() } = {}) {
  if (!effectiveFrom) throw new Error('An effective date is required.');
  return repo.tx(['versions', 'adjustments', 'invoices', 'agreements', 'audit'], async (r) => {
    const ag = await r.get('agreements', agreementId);
    if (!ag) throw new Error('Agreement not found');
    let record;
    if (scope === 'once') {
      record = { id: makeId('adj'), agreementId, period: periodOf(effectiveFrom), category: oneOff.category, amountPaise: oneOff.amountPaise, reason, createdAt: now };
      await r.put('adjustments', record);
    } else {
      record = { id: makeId('ver'), agreementId, effectiveFrom, reason, kind: scope === 'new_agreement' ? 'renewal' : 'change', terms, createdAt: now };
      await r.put('versions', record);
    }
    const affected = (await r.list('invoices')).filter((i) => i.agreementId === agreementId && i.status === 'draft' && i.activeKey && i.period >= periodOf(effectiveFrom));
    for (const inv of affected) await r.put('invoices', { ...inv, stale: true, staleReason: reason || 'Agreement changed' });
    await audit(r, scope === 'once' ? 'adjustment' : 'version', record.id, 'created', { agreementId, effectiveFrom, reason, affectedDrafts: affected.map((i) => i.id) }, now);
    return { record, affectedDrafts: affected.map((i) => i.id) };
  });
}

/** Supersede a stale draft and regenerate its period with current terms. */
export async function recalculateDraft(repo, invoiceId, deps = {}) {
  const inv = await repo.get('invoices', invoiceId);
  if (!inv || inv.status !== 'draft') throw new Error('Only drafts can be recalculated.');
  const siblings = (await repo.list('invoices')).filter((i) => i.agreementId === inv.agreementId && i.period === inv.period && i.status === 'draft' && i.activeKey);
  await repo.tx(['invoices', 'audit'], async (r) => {
    for (const s of siblings) {
      const { activeKey, ...rest } = s;
      await r.put('invoices', { ...rest, status: 'superseded', supersededAt: deps.now || new Date().toISOString() });
      await audit(r, 'invoice', s.id, 'superseded', { reason: s.staleReason || 'recalculated' }, deps.now || new Date().toISOString());
    }
  });
  return generateBillingForPeriod(repo, { period: inv.period, agreementIds: [inv.agreementId], mode: 'recalc' }, deps);
}

/** Credit-note draft for an issued document (always needs review; does not rewrite history). */
export async function createCreditNoteDraft(repo, invoiceId, { reason, now = new Date().toISOString() } = {}) {
  return repo.tx(['invoices', 'audit'], async (r) => {
    const inv = await r.get('invoices', invoiceId);
    if (!inv || inv.status !== 'issued') throw new Error('Credit notes apply to issued documents only.');
    const cn = {
      id: makeId('inv'), groupId: inv.groupId, agreementId: inv.agreementId, propertyId: inv.propertyId, tenantId: inv.tenantId, supplierId: inv.supplierId,
      period: inv.period, category: inv.category, kind: 'credit_note', refersTo: inv.id, refersToNumber: inv.number, status: 'draft',
      draftNumber: `DRAFT-CN-${inv.number}`, number: null, needsReview: true, reason,
      doc: { ...inv.doc, documentType: 'CREDIT_NOTE', documentTitle: 'Credit Note (draft - review required)', taxStatus: 'NEEDS_SPECIALIST_REVIEW', lines: inv.doc.lines.map((l) => ({ ...l, amountPaise: -l.amountPaise })), taxablePaise: -inv.doc.taxablePaise, landlordTaxPaise: -inv.doc.landlordTaxPaise, totalPaise: -inv.doc.totalPaise },
      snapshot: inv.snapshot, createdAt: now,
    };
    await r.put('invoices', cn);
    await audit(r, 'invoice', cn.id, 'credit_note_draft', { refersTo: inv.number, reason }, now);
    return cn;
  });
}

// ---------------- Receipts & balances ----------------
export function invoiceBalance(inv, receipts) {
  const payable = inv.status === 'superseded' ? 0 : inv.doc.totalPaise;
  let allocated = 0; let tds = 0;
  for (const rc of receipts) for (const a of rc.allocations || []) if (a.invoiceId === inv.id) { allocated += a.amountPaise; tds += a.tdsPaise || 0; }
  return { payablePaise: payable, allocatedPaise: allocated, reportedTdsPaise: tds, balancePaise: payable - allocated - tds };
}

export async function recordReceipt(repo, receipt, { now = new Date().toISOString() } = {}) {
  const allocs = receipt.allocations || [];
  const allocated = sum(allocs.map((a) => a.amountPaise));
  if (allocated > receipt.amountPaise) throw new Error('Allocated more than the amount received.');
  const rec = { id: receipt.id || makeId('rcp'), ...receipt, allocations: allocs, unappliedPaise: receipt.amountPaise - allocated, createdAt: now };
  // Prevent double-counting: the same bank reference + date + amount cannot be recorded twice.
  if (rec.reference) {
    const dupe = (await repo.list('receipts')).find((x) => x.id !== rec.id && x.reference === rec.reference && x.date === rec.date && x.amountPaise === rec.amountPaise);
    if (dupe) { const e = new Error('This bank receipt is already recorded.'); e.code = 'DUPLICATE_RECEIPT'; throw e; }
  }
  await repo.tx(['receipts', 'audit'], async (r) => { await r.put('receipts', rec); await audit(r, 'receipt', rec.id, 'recorded', { amountPaise: rec.amountPaise, allocations: allocs.length }, now); });
  return rec;
}

/** Suggest invoice allocations for a receipt (suggestions only; the owner confirms). */
export function suggestAllocations(receipt, openInvoices) {
  const target = receipt.amountPaise;
  const bal = openInvoices.filter((i) => i.balance.balancePaise > 0);
  const exact = bal.find((i) => Math.abs(i.expectedReceiptPaise - target) <= 100 || Math.abs(i.balance.balancePaise - target) <= 100);
  if (exact) return [{ invoiceId: exact.id, amountPaise: Math.min(target, exact.balance.balancePaise), tdsPaise: Math.max(0, exact.balance.balancePaise - target) <= (exact.expectedTdsPaise || 0) + 100 ? Math.max(0, exact.balance.balancePaise - target) : 0, confidence: 'exact' }];
  // Group match: a combined payment for invoices in the same billing group.
  const byGroup = {};
  for (const i of bal) (byGroup[i.groupId] = byGroup[i.groupId] || []).push(i);
  for (const g of Object.values(byGroup)) {
    const expected = sum(g.map((i) => i.expectedReceiptPaise));
    if (Math.abs(expected - target) <= 100) {
      return g.map((i) => ({ invoiceId: i.id, amountPaise: i.expectedReceiptPaise, tdsPaise: i.balance.balancePaise - i.expectedReceiptPaise, confidence: 'group' }));
    }
  }
  // Oldest-first partial allocation.
  let left = target; const out = [];
  for (const i of [...bal].sort((a, b) => (a.period < b.period ? -1 : 1))) {
    if (left <= 0) break;
    const amt = Math.min(left, i.balance.balancePaise);
    out.push({ invoiceId: i.id, amountPaise: amt, tdsPaise: 0, confidence: 'partial' }); left -= amt;
  }
  return out;
}

// ---------------- Mock outbox (simulated delivery only) ----------------
export async function queueEmail(repo, { invoiceIds, to, subject, body }, { now = new Date().toISOString() } = {}) {
  const key = `${[...invoiceIds].sort().join(',')}|${String(to).toLowerCase()}`;
  return repo.tx(['outbox', 'audit'], async (r) => {
    const existing = await r.findOne('outbox', 'idempotencyKey', key);
    if (existing && existing.status !== 'simulated_failed') return { ...existing, duplicate: true };
    if (existing) return existing; // failed: caller retries the same record
    const rec = { id: makeId('out'), idempotencyKey: key, invoiceIds, to, subject, body, status: 'queued', attempts: [], createdAt: now };
    await r.put('outbox', rec);
    await audit(r, 'outbox', rec.id, 'queued', { invoiceIds }, now);
    return rec;
  });
}

export async function simulateDelivery(repo, outboxId, { fail = false, now = new Date().toISOString() } = {}) {
  return repo.tx(['outbox', 'audit'], async (r) => {
    const rec = await r.get('outbox', outboxId);
    if (!rec) throw new Error('Not found');
    if (rec.status === 'simulated_sent') return { ...rec, duplicate: true }; // never "send" twice
    const status = fail ? 'simulated_failed' : 'simulated_sent';
    const next = { ...rec, status, attempts: [...rec.attempts, { at: now, result: status }] };
    await r.put('outbox', next);
    await audit(r, 'outbox', rec.id, status, null, now);
    return next;
  });
}
