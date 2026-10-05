import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleSendInvoices, sendSchema } from '../api/send-invoices.js';
import { handleDraftEmail, validateDraft, templateDraft } from '../api/draft-email.js';
import { handleConfig } from '../api/config.js';
import { createRateLimiter } from '../lib/rate-limit.js';

const PDF = Buffer.from('%PDF-1.4 test').toString('base64');
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service-secret', RESEND_API_KEY: 're_secret', EMAIL_FROM: 'KK <a@b.in>', GEMINI_API_KEY: 'g-secret' };
let saved;
beforeEach(() => { saved = { ...process.env }; Object.assign(process.env, ENV); });
afterEach(() => { process.env = saved; });

function memStore() { const files = {}; return { async update(n, f, fn) { const { value, result } = await fn(files[n] ?? structuredClone(f)); files[n] = value; return result; } }; }
function fakeDb() {
  const rows = [];
  return {
    rows,
    async insert(_t, row) { if (rows.some((r) => r.user_id === row.user_id && r.idempotency_key === row.idempotency_key)) { const e = new Error('dup'); e.status = 409; throw e; } rows.push({ ...row, created_at: 'now' }); },
    async select(_t, q) { const key = decodeURIComponent(q.match(/idempotency_key=eq\.([^&]+)/)[1]); return rows.filter((r) => r.idempotency_key === key); },
    async update(_t, q, patch) { const key = decodeURIComponent(q.match(/idempotency_key=eq\.([^&]+)/)[1]); rows.filter((r) => r.idempotency_key === key).forEach((r) => Object.assign(r, patch)); },
  };
}
const body = (o = {}) => ({ to: 'tenant@acme.in', subject: 'Invoices', text: 'Hello', attachments: [{ filename: 'SKM-2627-0001_rent_2026-10.pdf', contentBase64: PDF }], idempotencyKey: 'inv:abc|to:xyz', invoiceNumbers: ['SKM/2627/0001'], ...o });

test('send: requires configuration, sign-in and valid PDFs', async () => {
  const store = memStore(); const limiterFor = (n) => createRateLimiter(store, { limit: n });
  delete process.env.RESEND_API_KEY;
  assert.equal((await handleSendInvoices({ body: body(), headers: {}, limiterFor })).status, 503);
  process.env.RESEND_API_KEY = 're_secret';
  const deps = { verifyUser: async () => null, sendEmail: async () => ({ ok: true }), db: fakeDb() };
  assert.equal((await handleSendInvoices({ body: body(), headers: {}, limiterFor }, deps)).status, 401);
  assert.equal(sendSchema.safeParse(body({ attachments: [{ filename: 'x.pdf', contentBase64: Buffer.from('hello').toString('base64') }] })).success, false, 'non-PDF rejected');
  assert.equal(sendSchema.safeParse(body({ attachments: [{ filename: '../evil.exe', contentBase64: PDF }] })).success, false);
  assert.equal(sendSchema.safeParse(body({ cc: ['a@b.in', 'c@d.in', 'e@f.in'] })).success, false);
});

test('send: accepted once; retry with same key is a duplicate; failure can be retried', async () => {
  const store = memStore(); const limiterFor = (n) => createRateLimiter(store, { limit: n });
  const db = fakeDb(); let calls = 0; let fail = false;
  const deps = { verifyUser: async () => ({ id: 'u1', email: 'owner@x.in' }), db, sendEmail: async (m) => { calls++; assert.equal(m.replyTo, 'owner@x.in'); assert.equal(m.attachments.length, 1); return fail ? { ok: false, reason: 'PROVIDER_500' } : { ok: true, providerId: 'em_1' }; } };
  const r1 = await handleSendInvoices({ body: body(), headers: { authorization: 'Bearer t' }, limiterFor }, deps);
  assert.equal(r1.status, 200); assert.equal(r1.json.status, 'accepted');
  const r2 = await handleSendInvoices({ body: body(), headers: { authorization: 'Bearer t' }, limiterFor }, deps);
  assert.equal(r2.json.duplicate, true); assert.equal(calls, 1);
  assert.equal(db.rows[0].recipient_domain, 'acme.in');
  assert.ok(!JSON.stringify(db.rows).includes('tenant@acme.in'), 'full recipient address not logged');
  fail = true;
  const r3 = await handleSendInvoices({ body: body({ idempotencyKey: 'inv:def|to:xyz' }), headers: { authorization: 'Bearer t' }, limiterFor }, deps);
  assert.equal(r3.status, 502);
  fail = false;
  const r4 = await handleSendInvoices({ body: body({ idempotencyKey: 'inv:def|to:xyz' }), headers: { authorization: 'Bearer t' }, limiterFor }, deps);
  assert.equal(r4.status, 200);
});

test('send: 30 per user per day', async () => {
  const store = memStore(); const limiterFor = (n) => createRateLimiter(store, { limit: n });
  const deps = { verifyUser: async () => ({ id: 'u2', email: 'o@x.in' }), db: fakeDb(), sendEmail: async () => ({ ok: true, providerId: 'p' }) };
  for (let i = 0; i < 30; i++) assert.equal((await handleSendInvoices({ body: body({ idempotencyKey: `inv:k${i}|to:z` }), headers: { authorization: 'Bearer t' }, limiterFor }, deps)).status, 200);
  assert.equal((await handleSendInvoices({ body: body({ idempotencyKey: 'inv:k31|to:z' }), headers: { authorization: 'Bearer t' }, limiterFor }, deps)).status, 429);
});

const facts = { lang: 'en', tone: 'formal', periodLabel: 'October 2026', documents: [{ title: 'Lease Rent', number: 'SKM/2627/0001', total: 'Rs. 1,18,000.00', dueDate: '8 Oct 2026' }] };

test('draft: validator rejects invented numbers, missing placeholders, threats', () => {
  const ok = { subject: 'Invoices for October 2026', body: 'Dear [TENANT_NAME],\nPlease find Lease Rent SKM/2627/0001 for Rs. 1,18,000.00 due 8 Oct 2026.\nRegards,\n[LANDLORD_NAME]' };
  assert.equal(validateDraft(ok, facts), null);
  assert.equal(validateDraft({ ...ok, body: ok.body.replace('1,18,000.00', '1,20,000.00') }, facts), 'NUMBER');
  assert.equal(validateDraft({ ...ok, body: 'Dear tenant, pay now. [LANDLORD_NAME]' }, facts), 'PLACEHOLDERS');
  assert.equal(validateDraft({ ...ok, body: ok.body + ' or face legal action' }, facts), 'CLAIM');
  assert.match(templateDraft(facts).body, /\[TENANT_NAME\]/);
  assert.match(templateDraft({ ...facts, lang: 'hi' }).body, /प्रिय/);
});

test('draft: falls back to template without Gemini; uses Gemini when valid; no names sent', async () => {
  const store = memStore(); const limiterFor = (n) => createRateLimiter(store, { limit: n });
  delete process.env.GEMINI_API_KEY;
  assert.equal((await handleDraftEmail({ body: facts, headers: {}, limiterFor })).json.source, 'template');
  process.env.GEMINI_API_KEY = 'g';
  let prompt = '';
  const deps = { verifyUser: async () => ({ id: 'u1' }), geminiJSON: async (p) => { prompt = p; return { ok: true, json: { subject: 'October 2026 invoices', body: 'Dear [TENANT_NAME],\nAttached: SKM/2627/0001, Rs. 1,18,000.00, due 8 Oct 2026.\n[LANDLORD_NAME]' } }; } };
  const r = await handleDraftEmail({ body: facts, headers: { authorization: 'Bearer t' }, limiterFor }, deps);
  assert.equal(r.json.source, 'gemini');
  assert.ok(!/tenant@|GSTIN|Acme/.test(prompt));
  assert.equal((await handleDraftEmail({ body: { ...facts, tenantName: 'Acme' }, headers: {}, limiterFor })).status, 400, 'names are rejected by the schema');
});

test('config exposes only public values', async () => {
  const j = JSON.stringify((await handleConfig()).json);
  assert.ok(j.includes('anon') && j.includes('x.supabase.co'));
  for (const secret of ['service-secret', 're_secret', 'g-secret']) assert.ok(!j.includes(secret), secret);
});

import { buildMime, gmailRaw, encodeHeader } from '../shared/mime.js';
test('MIME for Gmail: attachments, Hindi subject, header-injection safe', () => {
  const m = buildMime({ to: 'tenant@acme.in', cc: ['me@x.in'], subject: 'अक्टूबर के बिल', text: 'नमस्ते', attachments: [{ filename: 'a.pdf', base64: Buffer.from('%PDF-1').toString('base64') }] }, 'B');
  assert.match(m, /^To: tenant@acme.in\r\nCc: me@x.in\r\nSubject: =\?UTF-8\?B\?/);
  assert.match(m, /Content-Disposition: attachment; filename="a.pdf"/);
  assert.ok(m.endsWith('--B--\r\n'));
  assert.throws(() => buildMime({ to: 'x@y.in\r\nBcc: evil@z.in', subject: 's', text: 't' }));
  assert.equal(encodeHeader('Hi\r\nBcc: x'), 'Hi Bcc: x');
  assert.ok(!/[+/=]/.test(gmailRaw({ to: 'a@b.in', subject: 's', text: 't' }, 'B')));
});
