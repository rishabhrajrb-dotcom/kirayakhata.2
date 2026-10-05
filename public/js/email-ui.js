// "Email invoices to tenant" dialog + account (sign-in) panel.
// Real sending happens on the server (/api/send-invoices) via the configured provider.
import { getConfig, currentSession, requestCode, verifyCode, signOut, authHeader } from './auth.js';
import { pdfBytes, invoiceFileName, invoiceLabel } from '../pdf.js';
import { formatINR } from '/shared/money.js';
import { periodLabel, formatDate } from '/shared/dates.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hi = () => document.documentElement.lang === 'hi';
const tx = (en, h) => (hi() ? h : en);

function toBase64(bytes) {
  let s = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}
function hash(str) { let h = 5381; for (const c of str) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h.toString(36); }

export function defaultDraft(group, lang) {
  const p = periodLabel(group[0].period, lang);
  const lines = group.map((i) => `- ${i.doc.title} (${invoiceLabel(i)}): ${formatINR(i.doc.totalPaise)}, ${lang === 'hi' ? 'देय' : 'due'} ${formatDate(i.doc.dueDate, lang)}`);
  return lang === 'hi'
    ? { subject: `${p} के बिल`, body: ['प्रिय [TENANT_NAME],', '', `${p} के बिल संलग्न हैं:`, ...lines, '', 'कृपया देय तारीख़ तक भुगतान करें। कोई प्रश्न हो तो इस ईमेल का उत्तर दें।', '', 'सादर,', '[LANDLORD_NAME]'].join('\n') }
    : { subject: `Invoices for ${p}`, body: ['Dear [TENANT_NAME],', '', `Please find attached the invoices for ${p}:`, ...lines, '', 'Kindly arrange payment by the due date. Reply to this email if you have any questions.', '', 'Regards,', '[LANDLORD_NAME]'].join('\n') };
}

const fill = (text, tenant, landlord) => text.replaceAll('[TENANT_NAME]', tenant || 'Sir/Madam').replaceAll('[LANDLORD_NAME]', landlord || '');

/** Settings panel: sign in with an emailed code. */
export async function accountPanelHtml() {
  const c = await getConfig();
  if (!c.authEnabled) return `<div class="panel"><h2>${tx('Account for sending email', 'ईमेल भेजने के लिए खाता')}</h2><p class="muted">${tx('Not set up on this server. Invoices can still be downloaded and sent from your own mail app.', 'इस सर्वर पर सेट नहीं। बिल डाउनलोड करके अपने मेल ऐप से भेज सकते हैं।')}</p></div>`;
  const s = await currentSession();
  if (s) return `<div class="panel"><h2>${tx('Account for sending email', 'ईमेल भेजने के लिए खाता')}</h2><p>${tx('Signed in as', 'साइन-इन')} <b>${esc(s.email)}</b>. ${tx('Tenants who reply will reach this address.', 'किरायेदार के उत्तर इसी पते पर आएँगे।')}</p><p class="small muted">${tx('Your property records still stay on this device; signing in is only used to send email.', 'आपके संपत्ति रिकॉर्ड इसी डिवाइस पर रहते हैं; साइन-इन केवल ईमेल भेजने के लिए है।')}</p><button class="btn btn-ghost btn-sm" type="button" id="acct-out">${tx('Sign out', 'साइन-आउट')}</button></div>`;
  return `<div class="panel"><h2>${tx('Account for sending email', 'ईमेल भेजने के लिए खाता')}</h2><p class="small muted">${tx('We email you a 6-digit code. No password. Used only to send invoices from this website.', 'हम आपको 6 अंकों का कोड ईमेल करेंगे। पासवर्ड नहीं। केवल इस वेबसाइट से बिल भेजने के लिए।')}</p>
    <div class="grid-2"><div class="field"><label for="acct-email">${tx('Your email', 'आपका ईमेल')}</label><input class="input" id="acct-email" type="email" autocomplete="email"></div>
    <div class="field"><label for="acct-code">${tx('Code from the email', 'ईमेल में आया कोड')}</label><input class="input" id="acct-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></div></div>
    <div class="btn-row"><button class="btn btn-ink btn-sm" type="button" id="acct-send">${tx('Email me a code', 'मुझे कोड भेजें')}</button><button class="btn btn-primary btn-sm" type="button" id="acct-verify">${tx('Verify and sign in', 'सत्यापित करें और साइन-इन')}</button></div>
    <p class="small" id="acct-msg" role="status"></p></div>`;
}

export function bindAccountPanel(root, onChange) {
  const msg = (t, err) => { const m = root.querySelector('#acct-msg'); if (m) { m.textContent = t; m.style.color = err ? 'var(--ledger)' : 'var(--paid)'; } };
  root.querySelector('#acct-out')?.addEventListener('click', async () => { await signOut(); onChange(); });
  root.querySelector('#acct-send')?.addEventListener('click', async () => {
    const email = root.querySelector('#acct-email').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg(tx('Enter a valid email.', 'सही ईमेल लिखें।'), true); return; }
    try { await requestCode(email); msg(tx('Code sent. Check your inbox (and spam).', 'कोड भेजा गया। इनबॉक्स (और स्पैम) देखें।')); } catch (e) { msg(e.message, true); }
  });
  root.querySelector('#acct-verify')?.addEventListener('click', async () => {
    const email = root.querySelector('#acct-email').value.trim(); const code = root.querySelector('#acct-code').value.trim();
    try { await verifyCode(email, code); onChange(); } catch (e) { msg(e.message, true); }
  });
}

/**
 * Opens the send dialog. ctx: { group, tenant, supplier, isSample, onIssue(), onSent(record), toast }
 */
export async function openEmailDialog(ctx) {
  const { group, tenant, supplier } = ctx;
  const d = document.getElementById('dlg');
  const c = await getConfig();
  const s = await currentSession();
  const lang = hi() ? 'hi' : 'en';
  const notIssued = group.filter((i) => i.status !== 'issued');
  let blocker = '';
  if (ctx.isSample) blocker = tx('This is the fictional sample workspace — real emails are disabled here. Switch to "My records".', 'यह काल्पनिक नमूना वर्कस्पेस है — यहाँ असली ईमेल बंद हैं। "मेरे रिकॉर्ड" चुनें।');
  else if (!c.emailEnabled) blocker = tx('Email sending is not set up on this server yet. Use "Download" and your own mail app.', 'इस सर्वर पर ईमेल भेजना अभी सेट नहीं। "डाउनलोड" और अपना मेल ऐप उपयोग करें।');
  else if (!s) blocker = tx('Sign in first (Settings & data → Account for sending email).', 'पहले साइन-इन करें (सेटिंग और डेटा → ईमेल भेजने के लिए खाता)।');
  else if (notIssued.length) blocker = tx(`Issue these first — drafts carry a DRAFT watermark: ${notIssued.map(invoiceLabel).join(', ')}`, `पहले इन्हें जारी करें — ड्राफ़्ट पर DRAFT लिखा होता है: ${notIssued.map(invoiceLabel).join(', ')}`);
  const draft = defaultDraft(group, lang);
  d.innerHTML = `<form method="dialog" id="mail-form" style="min-width:min(520px,80vw)">
    <h2 style="margin-top:0">${tx('Email invoices to tenant', 'किरायेदार को बिल ईमेल करें')}</h2>
    ${blocker ? `<div class="notice warn">${esc(blocker)}</div>` : ''}
    <div class="field"><label for="m-to">${tx('To', 'प्रति')}</label><input class="input" id="m-to" type="email" value="${esc(tenant?.email || '')}" required></div>
    <label class="check"><input type="checkbox" id="m-cc" checked><span>${tx('Send me a copy', 'मुझे एक प्रति भेजें')}${s ? ` (${esc(s.email)})` : ''}</span></label>
    <div class="field"><label for="m-subject">${tx('Subject', 'विषय')}</label><input class="input" id="m-subject" value="${esc(draft.subject)}" maxlength="200"></div>
    <div class="field"><label for="m-body">${tx('Message', 'संदेश')}</label><textarea class="input" id="m-body" rows="9" maxlength="6000">${esc(fill(draft.body, tenant?.contactName || tenant?.legalName, supplier?.legalName))}</textarea></div>
    ${c.aiDraftEnabled && s && !ctx.isSample ? `<div class="btn-row" style="margin-bottom:10px"><select class="select" id="m-tone" style="max-width:180px">${['formal', 'friendly', 'reminder'].map((t) => `<option value="${t}">${t}</option>`).join('')}</select><button class="btn btn-ghost btn-sm" type="button" id="m-ai">${tx('Write with Gemini', 'Gemini से लिखवाएँ')}</button></div><p class="small muted">${tx('Only the period, document numbers, totals and due dates are sent to Gemini — no names, addresses or GSTINs.', 'Gemini को केवल अवधि, दस्तावेज़ नंबर, राशि और देय तारीख़ भेजी जाती है — नाम, पता या GSTIN नहीं।')}</p>` : ''}
    <p class="small"><b>${tx('Attachments', 'संलग्नक')}:</b> ${group.map((i) => esc(invoiceFileName(i))).join(', ')}</p>
    <p class="error" id="m-err" role="alert" hidden></p>
    <div class="btn-row"><button class="btn btn-primary" type="button" id="m-send"${blocker ? ' disabled' : ''}>${tx('Send now', 'अभी भेजें')}</button>${notIssued.length && !ctx.isSample ? `<button class="btn btn-ghost" type="button" id="m-issue">${tx('Go to issue', 'जारी करने जाएँ')}</button>` : ''}<button class="btn btn-ghost" value="cancel">${tx('Close', 'बंद करें')}</button></div>
  </form>`;
  d.showModal();
  const err = (t) => { const e = d.querySelector('#m-err'); e.textContent = t; e.hidden = !t; };
  d.querySelector('#m-issue')?.addEventListener('click', () => { d.close(); ctx.onIssue?.(); });
  d.querySelector('#m-ai')?.addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true; err('');
    try {
      const r = await fetch('/api/draft-email', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ lang, tone: d.querySelector('#m-tone').value, periodLabel: periodLabel(group[0].period, lang), documents: group.map((i) => ({ title: i.doc.title, number: invoiceLabel(i), total: formatINR(i.doc.totalPaise), dueDate: formatDate(i.doc.dueDate, lang) })) }) });
      const j = await r.json();
      if (j.subject) { d.querySelector('#m-subject').value = j.subject; d.querySelector('#m-body').value = fill(j.body, tenant?.contactName || tenant?.legalName, supplier?.legalName); }
      ctx.toast?.(j.source === 'gemini' ? tx('Drafted with Gemini — please read before sending.', 'Gemini ने ड्राफ़्ट किया — भेजने से पहले पढ़ें।') : tx('Gemini unavailable; standard text used.', 'Gemini उपलब्ध नहीं; सामान्य पाठ लिया।'));
    } catch { err(tx('Could not reach the server.', 'सर्वर तक नहीं पहुँच सके।')); } finally { b.disabled = false; }
  });
  d.querySelector('#m-send').addEventListener('click', async (ev) => {
    const b = ev.currentTarget; err('');
    const to = d.querySelector('#m-to').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || to.endsWith('.invalid') || to.endsWith('.example')) { err(tx('Enter the tenant\'s real email address.', 'किरायेदार का सही ईमेल लिखें।')); return; }
    const sess = await currentSession(); if (!sess) { err(tx('Please sign in again.', 'कृपया फिर से साइन-इन करें।')); return; }
    if (!window.confirm(tx(`Send ${group.length} PDF(s) to ${to}?`, `${to} को ${group.length} PDF भेजें?`))) return;
    b.disabled = true; b.textContent = tx('Sending…', 'भेजा जा रहा है…');
    try {
      const base = `inv:${group.map((i) => i.id).sort().join(',')}|to:${hash(to)}`;
      const key = ctx.resendCount ? `${base}:r${ctx.resendCount}` : base;
      const payload = { to, cc: d.querySelector('#m-cc').checked && sess.email !== to ? [sess.email] : [], subject: d.querySelector('#m-subject').value.trim(), text: d.querySelector('#m-body').value.trim(),
        attachments: group.map((i) => ({ filename: invoiceFileName(i), contentBase64: toBase64(pdfBytes(i)) })), idempotencyKey: key.slice(0, 200), invoiceNumbers: group.map(invoiceLabel) };
      const r = await fetch('/api/send-invoices', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${sess.access_token}` }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        await ctx.onSent?.({ to, providerId: j.providerId, duplicate: !!j.duplicate, sentAt: j.sentAt || new Date().toISOString(), subject: payload.subject, key });
        d.close();
        ctx.toast?.(j.duplicate ? tx('Already sent earlier — not sent again.', 'पहले ही भेजा जा चुका — दोबारा नहीं भेजा।') : tx('Accepted by the email service. Delivery to the inbox is not confirmed.', 'ईमेल सेवा ने स्वीकार किया। इनबॉक्स तक पहुँचने की पुष्टि नहीं।'));
        return;
      }
      const reasons = { SIGN_IN_REQUIRED: tx('Session expired — sign in again.', 'सत्र समाप्त — फिर साइन-इन करें।'), LIMIT: tx('Daily email limit reached (30). Try tomorrow.', 'दैनिक ईमेल सीमा (30) पूरी। कल कोशिश करें।'), NOT_CONFIGURED: j.message, IN_PROGRESS: tx('Already sending — wait a moment.', 'भेजा जा रहा है — थोड़ा रुकें।'), VALIDATION: tx('Please check the fields (attachments too large?).', 'फ़ील्ड जाँचें (संलग्नक बहुत बड़े?)।'), SEND_FAILED: `${tx('The email service refused it', 'ईमेल सेवा ने अस्वीकार किया')}: ${j.message || j.reason || ''}` };
      err(reasons[j.error] || tx('Sending failed. Nothing was sent.', 'भेजना विफल। कुछ नहीं भेजा गया।'));
    } catch { err(tx('Could not reach the server. Nothing was sent.', 'सर्वर तक नहीं पहुँच सके। कुछ नहीं भेजा गया।')); }
    b.disabled = false; b.textContent = tx('Send now', 'अभी भेजें');
  });
}
