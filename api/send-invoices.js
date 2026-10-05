// POST /api/send-invoices - emails the tenant with the invoice PDFs attached.
// Requires a signed-in KirayaKhata user (Supabase Auth). Protections against misuse:
// verified session, 30 emails/user/day, max 6 PDF attachments (~3.5 MB), PDF signature check,
// idempotency per user + key (a retry or double-click never sends twice), audit log.
import { z } from 'zod';
import { vercelHandler } from '../lib/http.js';
import { verifyUser, supabaseConfig, sb } from '../lib/supabase-rest.js';
import { sendEmail, emailConfigured } from '../lib/integrations/email-provider.js';

const email = z.string().trim().toLowerCase().email().max(254);
export const sendSchema = z.object({
  to: email,
  cc: z.array(email).max(2).default([]),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(6000),
  attachments: z.array(z.object({
    filename: z.string().regex(/^[A-Za-z0-9._-]{1,120}\.pdf$/),
    contentBase64: z.string().regex(/^[A-Za-z0-9+/=]+$/).refine((s) => s.startsWith('JVBER'), 'not a PDF'),
  }).strict()).min(1).max(6),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9|,:._-]{8,200}$/),
  invoiceNumbers: z.array(z.string().max(40)).max(10).default([]),
}).strict().superRefine((v, ctx) => {
  const bytes = v.attachments.reduce((a, x) => a + Math.floor((x.contentBase64.length * 3) / 4), 0);
  if (bytes > 3_500_000) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attachments'], message: 'attachments too large' });
});

export const SEND_LIMIT_PER_DAY = 30;

export async function handleSendInvoices({ body, headers, limiterFor }, deps = { verifyUser, sendEmail, db: sb }) {
  if (!supabaseConfig().configured || !emailConfigured()) return { status: 503, json: { error: 'NOT_CONFIGURED', message: 'Email sending is not set up on this server. Download the PDFs and use your mail app.' } };
  const user = await deps.verifyUser(headers.authorization);
  if (!user) return { status: 401, json: { error: 'SIGN_IN_REQUIRED' } };
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return { status: 400, json: { error: 'VALIDATION', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } };
  const v = parsed.data;
  const limit = await limiterFor(SEND_LIMIT_PER_DAY).check(`email:${user.id}`);
  if (!limit.allowed) return { status: 429, json: { error: 'LIMIT', resetAt: new Date(limit.resetAt).toISOString() } };

  const recipientDomain = v.to.split('@')[1];
  // Claim the idempotency key first (unique constraint makes this race-safe).
  try {
    await deps.db.insert('kk_email_log', { user_id: user.id, idempotency_key: v.idempotencyKey, status: 'pending', recipient_domain: recipientDomain, invoice_numbers: v.invoiceNumbers, attachments: v.attachments.length });
  } catch (e) {
    if (e.status !== 409) throw e;
    const [row] = await deps.db.select('kk_email_log', `user_id=eq.${user.id}&idempotency_key=eq.${encodeURIComponent(v.idempotencyKey)}&select=status,provider_id,created_at`);
    if (row?.status === 'accepted') return { status: 200, json: { duplicate: true, status: 'accepted', providerId: row.provider_id, sentAt: row.created_at } };
    if (row?.status === 'pending') return { status: 409, json: { error: 'IN_PROGRESS' } };
    await deps.db.update('kk_email_log', `user_id=eq.${user.id}&idempotency_key=eq.${encodeURIComponent(v.idempotencyKey)}`, { status: 'pending' });
  }
  const r = await deps.sendEmail({ to: v.to, cc: v.cc, replyTo: user.email, subject: v.subject, text: v.text, attachments: v.attachments, idempotencyKey: `${user.id}:${v.idempotencyKey}` });
  await deps.db.update('kk_email_log', `user_id=eq.${user.id}&idempotency_key=eq.${encodeURIComponent(v.idempotencyKey)}`, r.ok ? { status: 'accepted', provider_id: r.providerId } : { status: 'failed', error: String(r.reason).slice(0, 80) });
  if (!r.ok) return { status: 502, json: { error: 'SEND_FAILED', reason: r.reason, message: r.message } };
  return { status: 200, json: { status: 'accepted', providerId: r.providerId, note: 'Accepted by the email service. Inbox delivery is not confirmed.' } };
}

export default vercelHandler(handleSendInvoices, { methods: ['POST'], bodyLimit: 4_200_000 });
