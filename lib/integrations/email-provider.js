// Email delivery adapter. Production: Resend (https://resend.com) — set RESEND_API_KEY and
// EMAIL_FROM (an address on a domain you verified in Resend). Without them, nothing can be
// sent and the UI falls back to the mail-app draft + PDF download.
// "Accepted" means the provider queued the email; inbox delivery is not confirmed here.
export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail({ to, cc = [], replyTo, subject, text, attachments, idempotencyKey }) {
  if (!emailConfigured()) return { ok: false, reason: 'NOT_CONFIGURED' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      // Provider-side idempotency: a retry with the same key never sends twice.
      'Idempotency-Key': String(idempotencyKey).slice(0, 256),
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to], cc: cc.length ? cc : undefined, reply_to: replyTo || undefined,
      subject, text,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.contentBase64 })),
    }),
  });
  let data = null; try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) return { ok: false, reason: `PROVIDER_${res.status}`, message: data?.message || data?.name || '' };
  return { ok: true, providerId: data?.id || null };
}
