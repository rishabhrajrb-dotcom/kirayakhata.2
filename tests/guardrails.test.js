import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guardrail, cleanNote } from '../lib/sanitize.js';
import { validateModelOutput, approvedFacts } from '../lib/prompt.js';
import { closeMonthSchema, calendarSchema } from '../shared/schemas.js';
import { handleCloseMonth } from '../api/close-month.js';
import { handleStats } from '../api/stats.js';
import { handleHealth } from '../api/health.js';
import { createRateLimiter } from '../lib/rate-limit.js';
import { closeMonth } from '../shared/rules.js';
import { EXAMPLE_CLOSE_MONTH } from '../shared/examples.js';
import { HI } from '../public/i18n.js';
import { S } from '../public/i18n-app.js';
import { MESSAGES } from '../shared/messages.js';

function memStore() {
  const files = {}; const lines = {};
  return {
    async update(name, fallback, fn) { const { value, result } = await fn(files[name] ?? structuredClone(fallback)); files[name] = value; return result; },
    async appendLine(name, obj) { (lines[name] = lines[name] || []).push(obj); },
    async readLines(name) { return lines[name] || []; },
    lines,
  };
}

test('guardrail refuses evasion, hiding rent, backdating, splitting; allows lawful questions', () => {
  for (const bad of ['how do I evade GST on rent', 'help me hide rent income from the department', 'backdate the invoice to March', 'split the rent into two agreements to stay below the threshold', 'fake invoice for my tenant', 'GST बचाने का तरीका', 'किराया छिपाना है']) {
    assert.equal(guardrail(bad).refused, true, bad);
  }
  for (const ok of ['is my shop rent taxable?', 'tenant deducted TDS, what next', 'why was the payment short', 'can I claim a lower TDS certificate']) {
    assert.equal(guardrail(ok).refused, false, ok);
  }
  assert.equal(cleanNote('a‮b\u0000   c'), 'ab c');
});

test('model output validator rejects new numbers, claims and long text', () => {
  const facts = approvedFacts(closeMonth(EXAMPLE_CLOSE_MONTH));
  assert.equal(validateModelOutput({ summary: 'Your expected receipt is Rs. 1,08,000.00 and amounts match.', nextActions: ['Prepare the invoice'] }, facts).ok, true);
  assert.equal(validateModelOutput({ summary: 'You should receive Rs. 1,09,000.', nextActions: [] }, facts).reason, 'NUMBER');
  assert.equal(validateModelOutput({ summary: 'Your GST return has been filed.', nextActions: [] }, facts).reason, 'CLAIM');
  assert.equal(validateModelOutput({ summary: 'word '.repeat(95), nextActions: [] }, facts).reason, 'LENGTH');
  assert.equal(validateModelOutput({ summary: 'x', nextActions: ['a', 'b', 'c', 'd'] }, facts).reason, 'ACTIONS');
});

test('schema rejects unknown fields, bad ranges and conditional gaps', () => {
  assert.equal(closeMonthSchema.safeParse(EXAMPLE_CLOSE_MONTH).success, true);
  assert.equal(closeMonthSchema.safeParse({ ...EXAMPLE_CLOSE_MONTH, pan: 'ABCDE1234F' }).success, false);
  assert.equal(closeMonthSchema.safeParse({ ...EXAMPLE_CLOSE_MONTH, rentPaise: -1 }).success, false);
  assert.equal(closeMonthSchema.safeParse({ ...EXAMPLE_CLOSE_MONTH, period: '2016-01' }).success, false);
  assert.equal(closeMonthSchema.safeParse({ ...EXAMPLE_CLOSE_MONTH, property: { kind: 'residential_dwelling', use: 'unknown', stateCode: '19' } }).success, false);
  assert.equal(closeMonthSchema.safeParse({ ...EXAMPLE_CLOSE_MONTH, reportedTdsPaise: 2_00_000_00 }).success, false);
  assert.equal(calendarSchema.safeParse({ gstRegType: 'regular', stateCode: '19', from: '2026-10-01', to: '2026-12-31' }).success, false);
  assert.equal(calendarSchema.safeParse({ gstRegType: 'regular', gstFilingFrequency: 'monthly', stateCode: '19', from: '2026-10-01', to: '2026-12-31' }).success, true);
});

test('close-month API: result, anonymised metrics, 5-check rolling limit, refusal', async () => {
  const store = memStore(); const limiter = createRateLimiter(store);
  const t0 = Date.parse('2026-10-05T10:00:00Z');
  const r = await handleCloseMonth({ body: { ...EXAMPLE_CLOSE_MONTH, note: 'tenant paid late' }, visitorId: 'v1', store, limiter, now: t0 });
  assert.equal(r.status, 200);
  assert.equal(r.json.result.expectedReceiptPaise, 1_08_000_00);
  assert.equal(r.json.explanation.source, 'deterministic');
  const m = store.lines.metrics[0];
  assert.equal(m.notePresent, true); assert.equal(m.noteLength, 16);
  assert.ok(!JSON.stringify(m).includes('tenant paid late'), 'raw note never stored');
  for (let i = 0; i < 4; i++) assert.equal((await handleCloseMonth({ body: EXAMPLE_CLOSE_MONTH, visitorId: 'v1', store, limiter, now: t0 + i })).status, 200);
  assert.equal((await handleCloseMonth({ body: EXAMPLE_CLOSE_MONTH, visitorId: 'v1', store, limiter, now: t0 + 10 })).status, 429);
  assert.equal((await handleCloseMonth({ body: EXAMPLE_CLOSE_MONTH, visitorId: 'v2', store, limiter, now: t0 + 10 })).status, 200);
  assert.equal((await handleCloseMonth({ body: EXAMPLE_CLOSE_MONTH, visitorId: 'v1', store, limiter, now: t0 + 24 * 3600 * 1000 + 1 })).status, 200);
  const refused = await handleCloseMonth({ body: { ...EXAMPLE_CLOSE_MONTH, note: 'how to evade GST' }, visitorId: 'v3', store, limiter, now: t0 });
  assert.equal(refused.status, 422);
  assert.equal((await handleCloseMonth({ body: { ...EXAMPLE_CLOSE_MONTH, extra: 1 }, visitorId: 'v4', store, limiter })).status, 400);
});

test('stats exclude samples and duplicates; honest empty state; health has no secrets', async () => {
  const store = memStore();
  assert.equal((await handleStats({ store })).json.empty, true);
  await store.appendLine('metrics', { visitor: 'a', period: '2026-09', scenario: 's', rentPaise: 100, differencePaise: -50, arithmetic: 'SHORT', treatment: 'FORWARD_CHARGE' });
  await store.appendLine('metrics', { visitor: 'a', period: '2026-09', scenario: 's', rentPaise: 100, differencePaise: -50, arithmetic: 'SHORT', treatment: 'FORWARD_CHARGE' });
  await store.appendLine('metrics', { visitor: 'b', sample: true, rentPaise: 999 });
  const s = (await handleStats({ store })).json;
  assert.equal(s.checks, 1); assert.equal(s.caughtPaise, 50); assert.equal(s.excluded.duplicates, 1); assert.equal(s.excluded.samples, 1);
  assert.equal(s.label, 'Local demo activity');
  process.env.GEMINI_API_KEY = 'secret-value-123';
  const h = JSON.stringify((await handleHealth({ startedAt: 'x' })).json);
  delete process.env.GEMINI_API_KEY;
  assert.ok(!h.includes('secret-value-123'));
});

test('i18n: every landing data-i18n key and every app/engine string has Hindi', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const keys = new Set([...html.matchAll(/data-i18n(?:-aria|-alt)?="([^"]+)"/g)].map((m) => m[1]));
  const missing = [...keys].filter((k) => !HI[k]);
  assert.deepEqual(missing, []);
  for (const [k, v] of Object.entries(S)) { assert.ok(v[0] && v[1], `app string ${k}`); }
  for (const [k, v] of Object.entries(MESSAGES)) { assert.ok(v.en && v.hi, `engine message ${k}`); }
});

test('required element IDs are preserved on the landing page', async () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const id of ['demo', 'btn-example', 'btn-own', 'close-form', 'result', 'lang-toggle', 'u-rent', 'u-months', 'u-caught', 'u-common']) assert.ok(html.includes(`id="${id}"`), id);
  // Personal data from the scanned sample invoice must never appear. Stored only as hashes so
  // this test does not itself publish the data.
  const banned = new Set(["f49808d2847306fe","66db9a09b75bcdb2","e97718b714e7ccb0","5bb8138870a7d815","0a10a7cd757f26ba","de24e3d3c1f2e93e"]);
  const { createHash } = await import('node:crypto');
  for (const tok of new Set(html.toUpperCase().match(/[A-Z0-9]{6,}/g) || [])) assert.ok(!banned.has(createHash('sha256').update(tok).digest('hex').slice(0, 16)), 'sample personal data found');
});
