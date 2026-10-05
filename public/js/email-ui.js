// "Email invoices to tenant": send from the landlord's OWN Gmail (browser → Gmail API), via the
// optional email service (Resend), or share the PDFs through the device share sheet.
import { getConfig, currentSession, requestCode, verifyCode, signOut, authHeader, gmailStatus, connectGmailPopup, disconnectGmail, gmailSend } from './auth.js';
import { pdfBytes, invoiceFileName, invoiceLabel, downloadBlob } from '../pdf.js';
import { gmailRaw, isEmail } from '/shared/mime.js';
import { makeZip } from '/shared/zip.js';
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

// ---------------- Settings panel ----------------
export async function accountPanelHtml() {
  const c = await getConfig();
  const g = gmailStatus();
  const gmailBlock = c.gmailSendEnabled
    ? `<h3 class="h3" style="font-size:1.05rem;margin:4px 0 8px">${tx('Send invoices from my Gmail', 'मेरे Gmail से बिल भेजें')}</h3>
       ${g.connected ? `<p>${tx('Connected as', 'जुड़ा हुआ')} <b>${esc(g.email)}</b>. ${tx('Invoices go from this address and appear in your Gmail “Sent” folder.', 'बिल इसी पते से जाते हैं और आपके Gmail के “Sent” फ़ोल्डर में दिखते हैं।')}</p><button class="btn btn-ghost btn-sm" type="button" id="gmail-off">${tx('Disconnect Gmail', 'Gmail हटाएँ')}</button>`
         : `<p class="small muted">${tx('One-time: choose your Google account and allow “send email on your behalf”. KirayaKhata can only send — it cannot read your inbox.', 'एक बार: अपना Google खाता चुनें और “आपकी ओर से ईमेल भेजने” की अनुमति दें। KirayaKhata केवल भेज सकता है — आपका इनबॉक्स नहीं पढ़ सकता।')}</p><button class="btn btn-primary btn-sm" type="button" id="gmail-on">${tx('Connect Gmail', 'Gmail जोड़ें')}</button>`}
       <p class="small" id="gmail-msg" role="status"></p>`
    : `<p class="muted small">${tx('Sending from your own Gmail is not switched on for this website yet.', 'इस वेबसाइट पर अपने Gmail से भेजना अभी चालू नहीं है।')}</p>`;
  return `<div class="panel"><h2>${tx('Email', 'ईमेल')}</h2>${gmailBlock}</div>`;
}

export function bindAccountPanel(root, onChange) {
  const m = root.querySelector('#gmail-msg');
  root.querySelector('#gmail-off')?.addEventListener('click', () => { disconnectGmail(); onChange(); });
  root.querySelector('#gmail-on')?.addEventListener('click', () => {
    connectGmailPopup().then(() => onChange()).catch((e) => { if (m) { m.textContent = e.message; m.style.color = 'var(--ledger)'; } });
  });
}

// ---------------- Send dialog ----------------
/** ctx: { group, tenant, supplier, isSample, resendCount, onIssue(), onSent(record), toast } */
export async function openEmailDialog(ctx) {
  const { group, tenant, supplier } = ctx;
  const d = document.getElementById('dlg');
  const c = await getConfig();
  const lang = hi() ? 'hi' : 'en';
  const g = gmailStatus();
  const notIssued = group.filter((i) => i.status !== 'issued');
  const methods = [];
  if (c.gmailSendEnabled) methods.push('gmail');
  if (c.emailEnabled) methods.push('service');
  let sendBlocker = '';
  if (ctx.isSample) sendBlocker = tx('Fictional sample workspace — real sending is disabled. Switch to “My records”.', 'काल्पनिक नमूना वर्कस्पेस — असली भेजना बंद है। “मेरे रिकॉर्ड” चुनें।');
  else if (notIssued.length) sendBlocker = tx(`Issue these first (drafts carry a DRAFT watermark): ${notIssued.map(invoiceLabel).join(', ')}`, `पहले इन्हें जारी करें (ड्राफ़्ट पर DRAFT लिखा होता है): ${notIssued.map(invoiceLabel).join(', ')}`);
  else if (!methods.length) sendBlocker = tx('Direct sending is not switched on yet. Use “Share PDFs” or download them.', 'सीधे भेजना अभी चालू नहीं। “PDF शेयर करें” या डाउनलोड करें।');
  const canShare = typeof navigator.canShare === 'function' && (() => { try { return navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' })] }); } catch { return false; } })();
  const draft = defaultDraft(group, lang);
  const sess = await currentSession();
  d.innerHTML = `<form method="dialog" id="mail-form" style="min-width:min(540px,82vw)">
    <h2 style="margin-top:0">${tx('Send invoices to tenant', 'किरायेदार को बिल भेजें')}</h2>
    ${sendBlocker ? `<div class="notice warn">${esc(sendBlocker)}</div>` : ''}
    ${methods.length && !sendBlocker ? `<fieldset><legend>${tx('Send from', 'किससे भेजें')}</legend><div class="choice-group">
      ${methods.includes('gmail') ? `<label class="choice"><input type="radio" name="via" value="gmail" checked><span>${tx('My Gmail', 'मेरा Gmail')}${g.connected ? ` (${esc(g.email)})` : ''}</span></label>` : ''}
      ${methods.includes('service') ? `<label class="choice"><input type="radio" name="via" value="service"${methods[0] === 'service' ? ' checked' : ''}><span>${tx('KirayaKhata email service', 'KirayaKhata ईमेल सेवा')}</span></label>` : ''}
    </div>${methods.includes('gmail') && !g.connected ? `<p class="small muted">${tx('First time: a Google window opens — choose your account and allow sending. After that it is one click.', 'पहली बार: Google विंडो खुलेगी — खाता चुनें और भेजने की अनुमति दें। उसके बाद एक क्लिक।')}</p>` : ''}</fieldset>` : ''}
    <div class="field"><label for="m-to">${tx('To', 'प्रति')}</label><input class="input" id="m-to" type="email" value="${esc(tenant?.email || '')}" required></div>
    <label class="check"><input type="checkbox" id="m-cc"><span>${tx('Send me a copy', 'मुझे एक प्रति भेजें')}</span></label>
    <div class="field"><label for="m-subject">${tx('Subject', 'विषय')}</label><input class="input" id="m-subject" value="${esc(draft.subject)}" maxlength="200"></div>
    <div class="field"><label for="m-body">${tx('Message', 'संदेश')}</label><textarea class="input" id="m-body" rows="8" maxlength="6000">${esc(fill(draft.body, tenant?.contactName || tenant?.legalName, supplier?.legalName))}</textarea></div>
    ${c.aiDraftEnabled && sess && !ctx.isSample ? `<div class="btn-row" style="margin-bottom:10px"><select class="select" id="m-tone" style="max-width:180px">${['formal', 'friendly', 'reminder'].map((t) => `<option value="${t}">${t}</option>`).join('')}</select><button class="btn btn-ghost btn-sm" type="button" id="m-ai">${tx('Write with Gemini', 'Gemini से लिखवाएँ')}</button></div>` : ''}
    <p class="small"><b>${tx('Attachments', 'संलग्नक')}:</b> ${group.map((i) => esc(invoiceFileName(i))).join(', ')}</p>
    <p class="error" id="m-err" role="alert" hidden></p>
    <div class="btn-row">
      ${methods.length && !sendBlocker ? `<button class="btn btn-primary" type="button" id="m-send">${tx('Send now', 'अभी भेजें')}</button>` : ''}
      ${canShare ? `<button class="btn btn-ghost" type="button" id="m-share">${tx('Share PDFs (WhatsApp, Mail…)', 'PDF शेयर करें (WhatsApp, मेल…)')}</button>` : ''}
      <button class="btn btn-ghost" type="button" id="m-dl">${tx('Download PDFs', 'PDF डाउनलोड')}</button>
      ${notIssued.length && !ctx.isSample ? `<button class="btn btn-ghost" type="button" id="m-issue">${tx('Go to issue', 'जारी करने जाएँ')}</button>` : ''}
      <button class="btn btn-ghost" value="cancel">${tx('Close', 'बंद करें')}</button>
    </div>
  </form>`;
  d.showModal();
  const $ = (s) => d.querySelector(s);
  const err = (t) => { const e = $('#m-err'); e.textContent = t || ''; e.hidden = !t; };
  const message = () => ({ to: $('#m-to').value.trim().toLowerCase(), subject: $('#m-subject').value.trim(), text: $('#m-body').value.trim() });
  const files = () => group.map((i) => ({ name: invoiceFileName(i), bytes: pdfBytes(i) }));

  $('#m-issue')?.addEventListener('click', () => { d.close(); ctx.onIssue?.(); });
  $('#m-dl').addEventListener('click', () => {
    const f = files();
    if (f.length === 1) downloadBlob(new Blob([f[0].bytes], { type: 'application/pdf' }), f[0].name);
    else downloadBlob(makeZip(f.map((x) => ({ name: x.name, data: x.bytes }))), `invoices-${group[0].period}.zip`, 'application/zip');
  });
  $('#m-share')?.addEventListener('click', async () => {
    err('');
    const m = message();
    const shareFiles = files().map((x) => new File([x.bytes], x.name, { type: 'application/pdf' }));
    try { await navigator.share({ files: shareFiles, title: m.subject, text: m.text }); } catch (e) { if (e.name !== 'AbortError') err(e.message); }
  });
  $('#m-ai')?.addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true; err('');
    try {
      const r = await fetch('/api/draft-email', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ lang, tone: $('#m-tone').value, periodLabel: periodLabel(group[0].period, lang), documents: group.map((i) => ({ title: i.doc.title, number: invoiceLabel(i), total: formatINR(i.doc.totalPaise), dueDate: formatDate(i.doc.dueDate, lang) })) }) });
      const j = await r.json();
      if (j.subject) { $('#m-subject').value = j.subject; $('#m-body').value = fill(j.body, tenant?.contactName || tenant?.legalName, supplier?.legalName); }
      ctx.toast?.(j.source === 'gemini' ? tx('Drafted with Gemini — please read before sending.', 'Gemini ने ड्राफ़्ट किया — भेजने से पहले पढ़ें।') : tx('Standard text used.', 'सामान्य पाठ लिया।'));
    } catch { err(tx('Could not reach the server.', 'सर्वर तक नहीं पहुँच सके।')); } finally { b.disabled = false; }
  });

  $('#m-send')?.addEventListener('click', (ev) => {
    err('');
    const b = ev.currentTarget;
    const via = d.querySelector('input[name=via]:checked')?.value || methods[0];
    const m = message();
    if (!isEmail(m.to) || /\.(invalid|example)$/.test(m.to)) { err(tx('Enter the tenant’s real email address.', 'किरायेदार का सही ईमेल लिखें।')); return; }
    // The Google popup must open synchronously inside this click, before any await.
    const status = gmailStatus();
    const tokenPromise = via === 'gmail' ? (status.valid ? Promise.resolve({ token: status.token, email: status.email }) : connectGmailPopup()) : Promise.resolve(null);
    const reset = () => { b.disabled = false; b.textContent = tx('Send now', 'अभी भेजें'); };
    b.disabled = true; b.textContent = tx('Sending…', 'भेजा जा रहा है…');
    (async () => {
      try {
        const google = await tokenPromise;
        const fromLabel = via === 'gmail' ? google.email : tx('the KirayaKhata email service', 'KirayaKhata ईमेल सेवा');
        if (!window.confirm(tx(`Send ${group.length} PDF(s) to ${m.to} from ${fromLabel}?`, `${m.to} को ${group.length} PDF ${fromLabel} से भेजें?`))) { reset(); return; }
        const f = files();
        const key = `${`inv:${group.map((i) => i.id).sort().join(',')}|to:${hash(m.to)}`}${ctx.resendCount ? `:r${ctx.resendCount}` : ''}`;
        if (via === 'gmail') {
          const cc = $('#m-cc').checked && google.email && google.email !== m.to ? [google.email] : [];
          const raw = gmailRaw({ to: m.to, cc, subject: m.subject, text: m.text, attachments: f.map((x) => ({ filename: x.name, base64: toBase64(x.bytes) })) });
          const res = await gmailSend(google.token, raw);
          await ctx.onSent?.({ to: m.to, via: 'gmail', from: google.email, providerId: res.id, sentAt: new Date().toISOString(), subject: m.subject, key });
          d.close();
          ctx.toast?.(tx(`Sent from ${google.email}. It is in your Gmail “Sent” folder.`, `${google.email} से भेजा गया। यह आपके Gmail के “Sent” फ़ोल्डर में है।`));
          return;
        }
        const sessNow = await currentSession();
        if (!sessNow) { err(tx('Sign in first (Settings & data).', 'पहले साइन-इन करें (सेटिंग और डेटा)।')); reset(); return; }
        const payload = { to: m.to, cc: $('#m-cc').checked && sessNow.email !== m.to ? [sessNow.email] : [], subject: m.subject, text: m.text, attachments: f.map((x) => ({ filename: x.name, contentBase64: toBase64(x.bytes) })), idempotencyKey: key.slice(0, 200), invoiceNumbers: group.map(invoiceLabel) };
        const r = await fetch('/api/send-invoices', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${sessNow.access_token}` }, body: JSON.stringify(payload) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { err(j.message || j.error || tx('Sending failed. Nothing was sent.', 'भेजना विफल। कुछ नहीं भेजा गया।')); reset(); return; }
        await ctx.onSent?.({ to: m.to, via: 'service', providerId: j.providerId, duplicate: !!j.duplicate, sentAt: j.sentAt || new Date().toISOString(), subject: m.subject, key });
        d.close();
        ctx.toast?.(j.duplicate ? tx('Already sent earlier — not sent again.', 'पहले ही भेजा जा चुका — दोबारा नहीं भेजा।') : tx('Accepted by the email service.', 'ईमेल सेवा ने स्वीकार किया।'));
      } catch (e) {
        err(e.code === 'REAUTH' ? tx('Google needs you to reconnect — click Send again.', 'Google से फिर जुड़ना होगा — फिर से “भेजें” दबाएँ।') : `${e.message} ${tx('Nothing was sent.', 'कुछ नहीं भेजा गया।')}`);
        reset();
      }
    })();
  });
}
