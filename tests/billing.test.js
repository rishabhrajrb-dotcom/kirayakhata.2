import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountOn, nextChangeAfter } from '../shared/escalation.js';
import { computePeriodCharges, buildDocuments, formatInvoiceNumber, issuanceBlockers } from '../shared/billing.js';
import { generateBillingForPeriod, retryFailed, issueInvoice, applyChange, recalculateDraft, catchUpPeriods, recordReceipt, invoiceBalance, suggestAllocations, queueEmail, simulateDelivery, previewAgreementPeriod, createCreditNoteDraft } from '../shared/billing-service.js';
import { createMemoryRepo } from '../shared/memory-repo.js';
import { sampleWorkspace } from '../shared/examples.js';
import { clampDay, addMonths } from '../shared/dates.js';

const rent = (esc, amountPaise = 1_00_000_00) => ({ basis: 'fixed', amountPaise, escalation: esc });

test('brief fixture: 5% compounding on 1 April 2027', () => {
  const c = rent({ type: 'percent', bp: 500, everyMonths: 12, firstDate: '2027-04-01', compounding: true });
  assert.equal(amountOn(c, '2027-03-01').amountPaise, 1_00_000_00);
  assert.equal(amountOn(c, '2027-04-01').amountPaise, 1_05_000_00);
  assert.equal(amountOn(c, '2028-04-01').amountPaise, 1_10_250_00);
  // Deterministic: computing again gives the same answer (no cached current rent).
  assert.equal(amountOn(c, '2028-04-01').amountPaise, 1_10_250_00);
  const simple = rent({ type: 'percent', bp: 500, everyMonths: 12, firstDate: '2027-04-01', compounding: false });
  assert.equal(amountOn(simple, '2028-04-01').amountPaise, 1_10_000_00);
});

test('fixed and step-up escalation; next change notice', () => {
  const f = rent({ type: 'fixed', incrementPaise: 2_500_00, everyMonths: 12, firstDate: '2027-01-15' }, 45_000_00);
  assert.equal(amountOn(f, '2027-01-14').amountPaise, 45_000_00);
  assert.equal(amountOn(f, '2028-01-15').amountPaise, 50_000_00);
  const s = rent({ type: 'steps', steps: [{ from: '2027-04-01', amountPaise: 66_000_00 }, { from: '2028-04-01', amountPaise: 72_000_00 }] }, 60_000_00);
  assert.equal(amountOn(s, '2027-03-31').amountPaise, 60_000_00);
  assert.equal(amountOn(s, '2028-05-01').amountPaise, 72_000_00);
  assert.deepEqual(nextChangeAfter(s, '2026-10-01'), { date: '2027-04-01', amountPaise: 66_000_00 });
});

test('leap year and end-of-month clamping', () => {
  assert.equal(clampDay('2027-02', 31), '2027-02-28');
  assert.equal(clampDay('2028-02', 31), '2028-02-29');
  assert.equal(addMonths('2028-02-29', 12), '2029-02-28');
  const c = rent({ type: 'fixed', incrementPaise: 100_00, everyMonths: 12, firstDate: '2028-02-29' }, 1_000_00);
  assert.equal(amountOn(c, '2028-02-28').amountPaise, 1_000_00);
  assert.equal(amountOn(c, '2028-02-29').amountPaise, 1_100_00); // first increase on firstDate
  assert.equal(amountOn(c, '2029-02-28').amountPaise, 1_200_00); // clamped anniversary in a non-leap year
  assert.equal(amountOn(c, '2032-02-29').amountPaise, 1_500_00);
});

const ws = () => sampleWorkspace();
const version = (id) => ws().versions.find((v) => v.agreementId === id);

test('mid-period escalation with daily proration splits the month; missing policy asks once', () => {
  const ag = { id: 'a', startDate: '2026-04-01', endDate: null };
  const v = { id: 'v', agreementId: 'a', effectiveFrom: '2026-04-01', terms: { ...version('agr_lake').terms, rent: rent({ type: 'percent', bp: 1000, everyMonths: 12, firstDate: '2027-04-16', compounding: true }), maintenance: { basis: 'none' }, prorationPolicy: 'daily' } };
  const c = computePeriodCharges({ agreement: ag, versions: [v], period: '2027-04' });
  assert.equal(c.lines.rent.length, 2);
  assert.equal(c.lines.rent[0].amountPaise, 50_000_00); // 15/30 of 1,00,000
  assert.equal(c.lines.rent[1].amountPaise, 55_000_00); // 15/30 of 1,10,000
  const noPolicy = computePeriodCharges({ agreement: ag, versions: [{ ...v, terms: { ...v.terms, prorationPolicy: null } }], period: '2027-04' });
  assert.equal(noPolicy.status, 'NEEDS_INPUT');
  assert.equal(noPolicy.needs[0].code, 'PRORATION_POLICY');
});

test('first partial month, February in a leap year, lease end', () => {
  const ag = { id: 'a', startDate: '2028-02-15', endDate: '2028-05-10' };
  const v = { id: 'v', agreementId: 'a', effectiveFrom: '2028-02-15', terms: { ...version('agr_lake').terms, rent: rent({ type: 'none' }, 29_000_00), maintenance: { basis: 'none' } } };
  const feb = computePeriodCharges({ agreement: ag, versions: [v], period: '2028-02' });
  assert.equal(feb.lines.rent[0].amountPaise, 15_000_00); // 15 of 29 days
  const may = computePeriodCharges({ agreement: ag, versions: [v], period: '2028-05' });
  assert.equal(may.lines.rent[0].amountPaise, Math.round(29_000_00 * 10 / 31));
  assert.equal(computePeriodCharges({ agreement: ag, versions: [v], period: '2028-06' }).status, 'LEASE_ENDED');
  assert.equal(computePeriodCharges({ agreement: ag, versions: [v], period: '2028-01' }).status, 'NOT_STARTED');
});

test('future-effective version applies only from its date; history keeps old amount', () => {
  const ag = { id: 'a', startDate: '2026-04-01', endDate: null };
  const v1 = { id: 'v1', agreementId: 'a', effectiveFrom: '2026-04-01', terms: { ...version('agr_lake').terms, maintenance: { basis: 'none' }, rent: rent({ type: 'none' }) } };
  const v2 = { id: 'v2', agreementId: 'a', effectiveFrom: '2026-12-01', terms: { ...v1.terms, rent: rent({ type: 'none' }, 1_20_000_00) } };
  assert.equal(computePeriodCharges({ agreement: ag, versions: [v1, v2], period: '2026-11' }).lines.rent[0].amountPaise, 1_00_000_00);
  assert.equal(computePeriodCharges({ agreement: ag, versions: [v1, v2], period: '2026-12' }).lines.rent[0].amountPaise, 1_20_000_00);
});

test('rent escalation does not move maintenance; separate documents and no zero invoice', () => {
  const w = ws();
  const ag = w.agreements[0]; const v = w.versions[0];
  const charges = computePeriodCharges({ agreement: ag, versions: [v], period: '2027-04' });
  const docs = buildDocuments({ agreement: ag, version: v, supplier: w.suppliers[0], tenant: w.tenants[0], property: w.properties[0], period: '2027-04', charges });
  assert.deepEqual(docs.map((d) => d.category), ['rent', 'maintenance']);
  assert.equal(docs[0].taxablePaise, 1_05_000_00);
  assert.equal(docs[1].taxablePaise, 10_000_00);
  assert.equal(docs[0].totalPaise, 1_23_900_00);
  assert.equal(docs[0].tds.amountPaise, 10_500_00);
  assert.equal(docs[1].tds, null); // maintenance TDS never assumed
});

test('invoice number format respects 16 characters', () => {
  assert.equal(formatInvoiceNumber('SKM', '2026-27', 1), 'SKM/2627/0001');
  assert.throws(() => formatInvoiceNumber('VERYLONGPREFIX', '2026-27', 1));
});

async function seeded() { return createMemoryRepo(ws()); }

test('generate twice (manual, bulk, scheduler) never duplicates', async () => {
  const repo = await seeded();
  const r1 = await generateBillingForPeriod(repo, { period: '2026-10', agreementIds: ['agr_lake'], mode: 'manual' });
  assert.equal(r1.results[0].state, 'CREATED');
  assert.equal(r1.results[0].invoiceIds.length, 2);
  const r2 = await generateBillingForPeriod(repo, { period: '2026-10', mode: 'bulk' });
  const lake = r2.results.find((x) => x.agreementId === 'agr_lake');
  assert.equal(lake.state, 'ALREADY_GENERATED');
  const r3 = await generateBillingForPeriod(repo, { period: '2026-10', mode: 'scheduler' });
  const invs = (await repo.list('invoices')).filter((i) => i.agreementId === 'agr_lake' && i.period === '2026-10');
  assert.equal(invs.length, 2);
  // Concurrent duplicate calls are serialised.
  await Promise.all([generateBillingForPeriod(repo, { period: '2026-11' }), generateBillingForPeriod(repo, { period: '2026-11' })]);
  assert.equal((await repo.list('invoices')).filter((i) => i.period === '2026-11' && i.agreementId === 'agr_lake').length, 2);
  assert.ok(r3.counts.already >= 1);
});

test('bulk run skips with reasons: usage reading needed, external maintenance, paused, ended', async () => {
  const repo = await seeded();
  const run = await generateBillingForPeriod(repo, { period: '2026-10', mode: 'bulk' });
  const by = Object.fromEntries(run.results.map((r) => [r.agreementId, r]));
  assert.equal(by.agr_market.state, 'NEEDS_INPUT');
  assert.equal(by.agr_market.needs[0].code, 'DG_READING');
  assert.equal(by.agr_ganga.state, 'CREATED');
  const ganga = (await repo.list('invoices')).filter((i) => i.agreementId === 'agr_ganga');
  assert.deepEqual(ganga.map((i) => i.category), ['rent']); // society maintenance billed externally
  // Fixed-charge agreement needed no monthly amount input. Usage agreement with reading -> created.
  const withReading = await generateBillingForPeriod(repo, { period: '2026-10', agreementIds: ['agr_market'], inputs: { agr_market: { dgQty: 120 } } });
  assert.equal(withReading.results[0].state, 'CREATED');
  const docs = (await repo.list('invoices')).filter((i) => i.agreementId === 'agr_market').map((i) => i.category).sort();
  assert.deepEqual(docs, ['dg', 'maintenance', 'rent']);
  const dg = (await repo.list('invoices')).find((i) => i.agreementId === 'agr_market' && i.category === 'dg');
  assert.equal(dg.doc.taxablePaise, 2_160_00);
  assert.equal(dg.needsReview, true); // DG classification not confirmed
  // Billing day 31 in October; due 10 days later.
  assert.equal(dg.doc.invoiceDate, '2026-10-31');
  // Pause / end
  const ag = await repo.get('agreements', 'agr_ganga');
  await repo.put('agreements', { ...ag, status: 'paused' });
  assert.equal((await previewAgreementPeriod(repo, 'agr_ganga', '2026-11')).state, 'PAUSED');
  await repo.put('agreements', { ...ag, status: 'ended' });
  assert.equal((await previewAgreementPeriod(repo, 'agr_ganga', '2027-01')).state, 'LEASE_ENDED');
});

test('one failing agreement does not block others; retry only the failure', async () => {
  const repo = await seeded();
  let fail = true;
  const run = await generateBillingForPeriod(repo, { period: '2026-10', mode: 'bulk' }, { failHook: (id) => { if (id === 'agr_lake' && fail) throw new Error('disk full (simulated)'); } });
  assert.equal(run.counts.failed, 1);
  assert.equal(run.results.find((r) => r.agreementId === 'agr_ganga').state, 'CREATED');
  fail = false;
  const before = (await repo.list('invoices')).length;
  const retry = await retryFailed(repo, run.id);
  assert.deepEqual(retry.results.map((r) => r.agreementId), ['agr_lake']);
  assert.equal((await repo.list('invoices')).length, before + 2);
});

test('issue: numbering is sequential and unique; issued is immutable; drafts flagged on change', async () => {
  const repo = await seeded();
  await generateBillingForPeriod(repo, { period: '2026-10', agreementIds: ['agr_lake'] });
  const [rentInv, maintInv] = (await repo.list('invoices')).sort((a, b) => (a.category < b.category ? 1 : -1));
  await assert.rejects(issueInvoice(repo, rentInv.id), /CA verification/);
  const a = await issueInvoice(repo, rentInv.id, { reviewedRuleStatuses: true });
  const b = await issueInvoice(repo, maintInv.id, { reviewedRuleStatuses: true });
  assert.equal(a.number, 'SKM/2627/0001');
  assert.equal(b.number, 'SKM/2627/0002');
  await assert.rejects(issueInvoice(repo, rentInv.id, { reviewedRuleStatuses: true }), /Only drafts/);
  // Change rent from November: issued October unchanged; November draft becomes stale.
  await generateBillingForPeriod(repo, { period: '2026-11', agreementIds: ['agr_lake'] });
  const v = (await repo.list('versions')).find((x) => x.agreementId === 'agr_lake');
  const res = await applyChange(repo, { agreementId: 'agr_lake', scope: 'from_date', effectiveFrom: '2026-11-01', reason: 'Revised rent', terms: { ...v.terms, rent: { ...v.terms.rent, amountPaise: 1_10_000_00, escalation: { type: 'none' } } } });
  assert.equal(res.affectedDrafts.length, 2);
  assert.equal((await repo.get('invoices', a.id)).doc.taxablePaise, 1_00_000_00);
  const nov = (await repo.list('invoices')).find((i) => i.period === '2026-11' && i.category === 'rent' && i.activeKey);
  assert.equal(nov.stale, true);
  await assert.rejects(issueInvoice(repo, nov.id, { reviewedRuleStatuses: true }), /Recalculate/);
  await recalculateDraft(repo, nov.id);
  const fresh = (await repo.list('invoices')).find((i) => i.period === '2026-11' && i.category === 'rent' && i.activeKey);
  assert.equal(fresh.doc.taxablePaise, 1_10_000_00);
  assert.equal((await repo.list('invoices')).filter((i) => i.status === 'superseded').length, 2);
  const cn = await createCreditNoteDraft(repo, a.id, { reason: 'Billing error' });
  assert.equal(cn.doc.totalPaise, -a.doc.totalPaise);
  assert.equal((await repo.get('invoices', a.id)).status, 'issued');
});

test('tenant replacement keeps the old tenancy history', async () => {
  const repo = await seeded();
  await generateBillingForPeriod(repo, { period: '2026-10', agreementIds: ['agr_ganga'] });
  const old = await repo.get('agreements', 'agr_ganga');
  await repo.put('agreements', { ...old, status: 'ended', endDate: '2026-10-31' });
  await repo.put('tenants', { id: 'ten_new', legalName: 'New Tenant', billingAddress: 'Flat 4A', stateCode: '19', gstStatus: 'unregistered' });
  await repo.put('agreements', { ...old, id: 'agr_ganga2', tenantId: 'ten_new', startDate: '2026-11-01', endDate: null, status: 'active' });
  const v = (await repo.list('versions')).find((x) => x.agreementId === 'agr_ganga');
  await repo.put('versions', { ...v, id: 'ver_g2', agreementId: 'agr_ganga2', effectiveFrom: '2026-11-01' });
  const run = await generateBillingForPeriod(repo, { period: '2026-11' });
  assert.equal(run.results.find((r) => r.agreementId === 'agr_ganga').state, 'LEASE_ENDED');
  assert.equal(run.results.find((r) => r.agreementId === 'agr_ganga2').state, 'CREATED');
  assert.equal((await repo.list('invoices')).filter((i) => i.tenantId === 'ten_anita').length, 1);
});

test('catch-up preview lists missed periods without creating anything', async () => {
  const repo = await seeded();
  await generateBillingForPeriod(repo, { period: '2026-07', agreementIds: ['agr_lake'] });
  const missed = await catchUpPeriods(repo, 'agr_lake', '2026-10');
  assert.deepEqual(missed, ['2026-08', '2026-09', '2026-10']);
  assert.equal((await repo.list('invoices')).filter((i) => i.agreementId === 'agr_lake').length, 2);
});

test('receipts: combined payment across rent+maintenance, TDS not double counted, duplicate blocked', async () => {
  const repo = await seeded();
  await generateBillingForPeriod(repo, { period: '2026-10', agreementIds: ['agr_lake'] });
  const invs = await repo.list('invoices');
  const rentInv = invs.find((i) => i.category === 'rent');
  const maint = invs.find((i) => i.category === 'maintenance');
  // Expected: rent 1,18,000 - TDS 10,000 = 1,08,000 ; maintenance 11,800 (no TDS assumed)
  const open = invs.map((i) => ({ ...i, balance: invoiceBalance(i, []), expectedTdsPaise: i.doc.tds?.amountPaise || 0, expectedReceiptPaise: i.doc.totalPaise - (i.doc.tds?.amountPaise || 0) }));
  const sug = suggestAllocations({ amountPaise: 1_19_800_00 }, open);
  assert.equal(sug.length, 2);
  const rec = await recordReceipt(repo, { date: '2026-10-08', amountPaise: 1_19_800_00, reference: 'UTR123', allocations: sug });
  const all = await repo.list('receipts');
  assert.equal(invoiceBalance(rentInv, all).balancePaise, 0);
  assert.equal(invoiceBalance(rentInv, all).reportedTdsPaise, 10_000_00);
  assert.equal(invoiceBalance(maint, all).balancePaise, 0);
  assert.equal(rec.unappliedPaise, 0);
  await assert.rejects(recordReceipt(repo, { date: '2026-10-08', amountPaise: 1_19_800_00, reference: 'UTR123', allocations: [] }), /already recorded/);
  // Partial payment leaves a balance; excess kept unapplied.
  const p = await recordReceipt(repo, { date: '2026-11-08', amountPaise: 5_000_00, reference: 'X', allocations: [] });
  assert.equal(p.unappliedPaise, 5_000_00);
  await assert.rejects(recordReceipt(repo, { date: '2026-11-09', amountPaise: 100, allocations: [{ invoiceId: rentInv.id, amountPaise: 200 }] }), /more than/);
});

test('mock outbox: simulated delivery, failure, retry and no duplicate send', async () => {
  const repo = await seeded();
  const q = await queueEmail(repo, { invoiceIds: ['b', 'a'], to: 'T@x.in', subject: 's', body: 'b' });
  const failed = await simulateDelivery(repo, q.id, { fail: true });
  assert.equal(failed.status, 'simulated_failed');
  const again = await queueEmail(repo, { invoiceIds: ['a', 'b'], to: 't@x.in', subject: 's', body: 'b' });
  assert.equal(again.id, q.id);
  const ok = await simulateDelivery(repo, q.id);
  assert.equal(ok.status, 'simulated_sent');
  const dupe = await simulateDelivery(repo, q.id);
  assert.equal(dupe.duplicate, true);
  assert.equal(dupe.attempts.length, 2);
  assert.equal((await queueEmail(repo, { invoiceIds: ['a', 'b'], to: 't@x.in' })).duplicate, true);
});

test('issuance blocked for unregistered issuer tax invoice / missing fields', () => {
  const doc = { taxStatus: 'SUPPORTED', documentType: 'TAX_INVOICE', lines: [{ description: 'Rent', tax: { sac: '997212' } }], taxablePaise: 100, totalPaise: 100, taxSummary: [{}], invoiceDate: '2026-10-01', servicePeriod: { to: '2026-10-31' } };
  assert.ok(issuanceBlockers(doc, { supplier: { legalName: 'x', address: 'y', gstin: 'bad' }, tenant: { legalName: 'z', billingAddress: 'w' }, property: { stateCode: '19' } }).includes('SUP_GSTIN'));
  assert.ok(issuanceBlockers({ ...doc, taxStatus: 'NEEDS_SPECIALIST_REVIEW' }, { supplier: {}, tenant: {}, property: {} }).includes('TAX_RESOLVED'));
});

test('rent-free period, billing in arrears and invoice notes', () => {
  const w = ws(); const ag = w.agreements[0]; const v0 = w.versions[0];
  const v = { ...v0, terms: { ...v0.terms, maintenance: { basis: 'none' }, billingTiming: 'arrears', invoiceNotes: 'Interest at 1.5% p.m. on late payment.', rent: { ...v0.terms.rent, freeUntil: '2026-10-15' } } };
  const oct = computePeriodCharges({ agreement: ag, versions: [v], period: '2026-10' });
  assert.equal(oct.lines.rent.length, 2);
  assert.equal(oct.lines.rent[0].amountPaise, 0);
  assert.equal(oct.lines.rent[1].amountPaise, Math.round(1_00_000_00 * 16 / 31));
  const docs = buildDocuments({ agreement: ag, version: v, supplier: w.suppliers[0], tenant: w.tenants[0], property: w.properties[0], period: '2026-10', charges: oct });
  assert.equal(docs[0].invoiceDate, '2026-11-01');
  assert.match(docs[0].notes, /Interest/);
  const sep = computePeriodCharges({ agreement: ag, versions: [v], period: '2026-09' });
  assert.equal(sep.lines.rent[0].amountPaise, 0);
  assert.equal(buildDocuments({ agreement: ag, version: v, supplier: w.suppliers[0], tenant: w.tenants[0], property: w.properties[0], period: '2026-09', charges: sep }).length, 0, 'fully rent-free month creates no zero invoice');
});

import { complianceChecklist, blockersFrom } from '../shared/invoice-rules.js';
test('Rule 46 checklist: sample tax invoice passes; key failures block', () => {
  const w = ws(); const ag = w.agreements[0]; const v = w.versions[0];
  const ch = computePeriodCharges({ agreement: ag, versions: [v], period: '2026-10' });
  const [rent] = buildDocuments({ agreement: ag, version: v, supplier: w.suppliers[0], tenant: w.tenants[0], property: w.properties[0], period: '2026-10', charges: ch });
  const snap = { supplier: w.suppliers[0], tenant: w.tenants[0], property: w.properties[0] };
  assert.deepEqual(blockersFrom(complianceChecklist(rent, snap)), [], 'sample rent invoice is fully compliant');
  const ids = (s) => blockersFrom(complianceChecklist(rent, s));
  assert.ok(ids({ ...snap, supplier: { ...snap.supplier, aato: 'above5cr' } }).includes('EINVOICE'), 'e-invoicing above Rs 5 crore');
  assert.ok(ids({ ...snap, supplier: { ...snap.supplier, aato: null } }).includes('SUP_AATO'));
  assert.ok(ids({ ...snap, supplier: { ...snap.supplier, stateCode: '27' } }).includes('SUP_GSTIN_STATE'));
  assert.ok(ids({ ...snap, tenant: { ...snap.tenant, gstin: '' } }).includes('REC_GSTIN'));
  assert.ok(ids({ ...snap, tenant: { ...snap.tenant, gstStatus: 'unregistered', billingAddress: '' } }).includes('REC_UNREG_DETAILS'), 'Rule 46(e) >= Rs 50,000');
  const small = { ...rent, taxablePaise: 40_000_00 };
  assert.ok(!blockersFrom(complianceChecklist(small, { ...snap, tenant: { ...snap.tenant, gstStatus: 'unregistered', billingAddress: '' } })).includes('REC_UNREG_DETAILS'));
  const rcmItem = complianceChecklist({ ...rent, reverseCharge: true, documentType: 'TAX_INVOICE_RCM' }, snap).find((i) => i.id === 'RCM_STATEMENT');
  assert.match(rcmItem.en, /Yes/);
  assert.ok(blockersFrom(complianceChecklist({ ...rent, lines: rent.lines.map((l) => ({ ...l, tax: { ...l.tax, sac: '99' } })) }, snap)).includes('SAC'));
});
