// POST /api/draft-email - Gemini drafts a short, polite email to the tenant for the attached
// invoices. Privacy: no names, addresses, GSTINs or emails are sent to Gemini; the browser fills
// [TENANT_NAME] / [LANDLORD_NAME] afterwards. Output is rejected if it invents numbers or claims.
// Signed-in users only (protects the Gemini quota), 20 drafts/user/day. Falls back to a template.
import { z } from 'zod';
import { vercelHandler } from '../lib/http.js';
import { verifyUser, supabaseConfig } from '../lib/supabase-rest.js';
import { geminiJSON, geminiConfigured } from '../lib/gemini.js';

export const draftSchema = z.object({
  lang: z.enum(['en', 'hi']).default('en'),
  tone: z.enum(['formal', 'friendly', 'reminder']).default('formal'),
  periodLabel: z.string().max(40),
  documents: z.array(z.object({ title: z.string().max(60), number: z.string().max(40), total: z.string().max(30), dueDate: z.string().max(30) }).strict()).min(1).max(6),
  tdsNote: z.string().max(120).optional(),
}).strict();

const FORBIDDEN = /\b(filed|government|verified|certified|legal action|penalty|court|guarantee)\b|सत्यापित|दाखिल/i;

export function templateDraft(f) {
  const hi = f.lang === 'hi';
  const lines = f.documents.map((d) => `- ${d.title} (${d.number}): ${d.total}, ${hi ? 'देय' : 'due'} ${d.dueDate}`);
  if (hi) return { subject: `${f.periodLabel} के बिल`, body: [`प्रिय [TENANT_NAME],`, '', `${f.periodLabel} के बिल संलग्न हैं:`, ...lines, '', f.tdsNote || '', 'कृपया देय तारीख़ तक भुगतान करें। कोई प्रश्न हो तो इस ईमेल का उत्तर दें।', '', 'सादर,', '[LANDLORD_NAME]'].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n') };
  return { subject: `Invoices for ${f.periodLabel}`, body: [`Dear [TENANT_NAME],`, '', `Please find attached the invoices for ${f.periodLabel}:`, ...lines, '', f.tdsNote || '', f.tone === 'reminder' ? 'This is a gentle reminder in case the payment is still pending.' : 'Kindly arrange payment by the due date. Reply to this email if you have any questions.', '', 'Regards,', '[LANDLORD_NAME]'].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n') };
}

export function validateDraft(out, facts) {
  if (!out || typeof out.subject !== 'string' || typeof out.body !== 'string') return 'SCHEMA';
  if (out.subject.length > 120 || out.body.split(/\s+/).length > 180) return 'LENGTH';
  if (!out.body.includes('[TENANT_NAME]') || !out.body.includes('[LANDLORD_NAME]')) return 'PLACEHOLDERS';
  if (FORBIDDEN.test(out.subject + out.body)) return 'CLAIM';
  const allowed = new Set((JSON.stringify(facts).match(/\d[\d,./-]*/g) || []).flatMap((n) => [n, ...n.split(/[,./-]/)]));
  for (const n of (out.subject + ' ' + out.body).match(/\d[\d,./-]*/g) || []) {
    if (!allowed.has(n) && !n.split(/[,./-]/).every((p) => allowed.has(p) || p === '')) return 'NUMBER';
  }
  return null;
}

export async function handleDraftEmail({ body, headers, limiterFor }, deps = { verifyUser, geminiJSON }) {
  const parsed = draftSchema.safeParse(body);
  if (!parsed.success) return { status: 400, json: { error: 'VALIDATION' } };
  const facts = parsed.data;
  const fallback = { ...templateDraft(facts), source: 'template' };
  if (!geminiConfigured() || !supabaseConfig().configured) return { status: 200, json: { ...fallback, reason: 'NOT_CONFIGURED' } };
  const user = await deps.verifyUser(headers.authorization);
  if (!user) return { status: 401, json: { error: 'SIGN_IN_REQUIRED', ...fallback } };
  const limit = await limiterFor(20).check(`ai:${user.id}`);
  if (!limit.allowed) return { status: 200, json: { ...fallback, reason: 'LIMIT' } };
  const prompt = [
    `Write a short, ${facts.tone} email in ${facts.lang === 'hi' ? 'simple Hindi (Devanagari)' : 'plain English'} from an Indian landlord to a tenant, sending the attached invoices.`,
    'Start with "Dear [TENANT_NAME]," (or "प्रिय [TENANT_NAME],") and end with the sign-off followed by "[LANDLORD_NAME]". Keep those placeholders exactly.',
    'List each document with its number, total and due date exactly as given. Do not add any other numbers, dates, rates or amounts.',
    'Do not mention penalties, legal action, government, filing or verification. Maximum 120 words.',
    'Return JSON: {"subject": string, "body": string}.',
    'FACTS: ' + JSON.stringify(facts),
  ].join('\n');
  const r = await deps.geminiJSON(prompt, { maxOutputTokens: 500 });
  if (!r.ok) return { status: 200, json: { ...fallback, reason: r.reason } };
  const bad = validateDraft(r.json, facts);
  if (bad) return { status: 200, json: { ...fallback, reason: `REJECTED_${bad}` } };
  return { status: 200, json: { subject: r.json.subject, body: r.json.body, source: 'gemini' } };
}

export default vercelHandler(handleDraftEmail, { methods: ['POST'] });
