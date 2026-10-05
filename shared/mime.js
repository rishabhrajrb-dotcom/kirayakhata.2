// RFC 2822 / MIME builder for sending invoices from the landlord's own mailbox (Gmail API
// "raw" messages). Pure: works in browsers and Node (uses TextEncoder + btoa).

const clean = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim(); // blocks header injection

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export const utf8Base64 = (s) => bytesToBase64(new TextEncoder().encode(s));
export const base64url = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const wrap76 = (b64) => b64.replace(/.{1,76}/g, (m) => `${m}\r\n`).replace(/\r\n$/, '');

/** Encodes a header value; non-ASCII (e.g. Hindi subjects) uses RFC 2047 UTF-8 base64 words. */
export function encodeHeader(value) {
  const v = clean(value);
  return /^[\x20-\x7E]*$/.test(v) ? v : `=?UTF-8?B?${utf8Base64(v)}?=`;
}

const EMAIL_RE = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]+$/;
export const isEmail = (e) => EMAIL_RE.test(String(e || '').trim());

/**
 * msg: { to, cc:[], subject, text, attachments:[{ filename, base64 }] }
 * Returns the full MIME message as a string (CRLF line endings). "From" is omitted so the
 * mailbox provider fills in the signed-in account's own address.
 */
export function buildMime(msg, boundary = `kk_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`) {
  const to = clean(msg.to);
  if (!isEmail(to)) throw new Error('Invalid recipient');
  const cc = (msg.cc || []).map(clean).filter(isEmail);
  const lines = [
    `To: ${to}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${encodeHeader(msg.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(utf8Base64(String(msg.text || ''))),
  ];
  for (const a of msg.attachments || []) {
    const name = clean(a.filename).replace(/["\\]/g, '_');
    lines.push(`--${boundary}`, `Content-Type: application/pdf; name="${name}"`, `Content-Disposition: attachment; filename="${name}"`, 'Content-Transfer-Encoding: base64', '', wrap76(a.base64));
  }
  lines.push(`--${boundary}--`, '');
  return lines.join('\r\n');
}

/** Gmail API expects the whole message as base64url in { raw }. */
export function gmailRaw(msg, boundary) {
  return base64url(utf8Base64(buildMime(msg, boundary)));
}
