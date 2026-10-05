// Supabase Auth via REST (email one-time code). No SDK, CSP-friendly.
// Only needed for sending email from the server. Property records stay on this device.
const KEY = 'kk:session';
let configPromise = null;

export function getConfig() {
  if (!configPromise) configPromise = fetch('/api/config').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return configPromise;
}

function readSession() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function writeSession(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } }

async function authFetch(path, body) {
  const c = await getConfig();
  if (!c.authEnabled) throw new Error('Sign-in is not set up on this server.');
  const res = await fetch(`${c.supabaseUrl}/auth/v1/${path}`, { method: 'POST', headers: { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || `Sign-in error ${res.status}`);
  return data;
}

/** Step 1: email a 6-digit code (Supabase "Email OTP"). */
export async function requestCode(email) {
  // Works with either email template: a 6-digit code ({{ .Token }}) or a magic link back to /app.
  return authFetch(`otp?redirect_to=${encodeURIComponent(`${location.origin}/app`)}`, { email, create_user: true });
}

/** Picks up a session returned in the URL fragment (magic link / Google login), then clears it. */
export function consumeHashSession() {
  if (!location.hash.includes('access_token=')) return null;
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  history.replaceState(null, '', location.pathname + location.search);
  const token = p.get('access_token');
  if (!token) return null;
  let email = '';
  try { email = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch { /* ignore */ }
  const s = { access_token: token, refresh_token: p.get('refresh_token'), expires_at: Date.now() + Number(p.get('expires_in') || 3600) * 1000, email };
  writeSession(s);
  return s;
}

export function googleLoginUrl() {
  const c = cfgCache || {};
  return `${c.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(`${location.origin}/app`)}`;
}

/** Step 2: verify the code and keep the session on this device. */
export async function verifyCode(email, token) {
  const d = await authFetch('verify', { email, token, type: 'email' });
  const s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, email: d.user?.email || email };
  writeSession(s);
  return s;
}

export async function currentSession() {
  const s = readSession();
  if (!s) return null;
  if (Date.now() < s.expires_at - 60_000) return s;
  try {
    const d = await authFetch('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    const n = { ...s, access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
    writeSession(n); return n;
  } catch { writeSession(null); return null; }
}

export async function signOut() {
  const s = readSession();
  writeSession(null);
  try {
    const c = await getConfig();
    if (s && c.authEnabled) await fetch(`${c.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${s.access_token}` } });
  } catch { /* already signed out locally */ }
}

export async function authHeader() {
  const s = await currentSession();
  return s ? { Authorization: `Bearer ${s.access_token}` } : {};
}

// ---------------- "Send from my Gmail" ----------------
// Google sign-in through Supabase with the gmail.send scope. The short-lived Google token is
// kept on this device only and used by the browser to call the Gmail API directly; KirayaKhata's
// server never sees the email or the Google token. No long-lived Google refresh token is stored.
const GMAIL_KEY = 'kk:gmail';
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
let cfgCache = null;
getConfig().then((c) => { cfgCache = c; });

function decodeJwt(t) {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
}
export function gmailStatus() {
  try {
    const g = JSON.parse(localStorage.getItem(GMAIL_KEY) || 'null');
    if (!g) return { connected: false };
    return { connected: true, email: g.email, valid: Date.now() < g.expires_at - 60_000, token: g.token };
  } catch { return { connected: false }; }
}
export function disconnectGmail() { try { localStorage.removeItem(GMAIL_KEY); } catch { /* ignore */ } }

/**
 * Opens the Google consent popup. MUST be called directly inside a click handler (before any
 * await) so browsers don't block the popup. Resolves with { token, email }.
 */
export function connectGmailPopup() {
  const c = cfgCache;
  if (!c || !c.gmailSendEnabled) return Promise.reject(new Error('Sending from Gmail is not set up on this server yet.'));
  const redirect = `${location.origin}/auth-callback.html`;
  const url = `${c.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}&scopes=${encodeURIComponent(GMAIL_SCOPE)}&prompt=select_account`;
  const w = window.open(url, 'kk-google', 'width=520,height=680');
  if (!w) return Promise.reject(new Error('Please allow pop-ups for this site, then click again.'));
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => { if (w.closed) { cleanup(); reject(new Error('The Google window was closed.')); } }, 700);
    function cleanup() { clearInterval(timer); window.removeEventListener('message', onMsg); }
    function onMsg(ev) {
      if (ev.origin !== location.origin || ev.data?.type !== 'kk-google-auth') return;
      cleanup();
      const p = ev.data.payload || {};
      if (p.error || !p.provider_token) { reject(new Error(p.error || 'Google did not grant permission to send email.')); return; }
      const email = decodeJwt(p.access_token).email || '';
      // Google access tokens last ~1 hour.
      const g = { token: p.provider_token, email, expires_at: Date.now() + 55 * 60 * 1000 };
      try { localStorage.setItem(GMAIL_KEY, JSON.stringify(g)); } catch { /* ignore */ }
      if (p.access_token) writeSession({ access_token: p.access_token, refresh_token: p.refresh_token, expires_at: Date.now() + (p.expires_in || 3600) * 1000, email });
      resolve({ token: g.token, email });
    }
    window.addEventListener('message', onMsg);
  });
}

/** Sends a raw (base64url) MIME message from the connected Gmail account. */
export async function gmailSend(token, raw) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { disconnectGmail(); const e = new Error('Google session expired.'); e.code = 'REAUTH'; throw e; }
  if (res.status === 403) { disconnectGmail(); const e = new Error(data?.error?.message || 'Permission to send was not granted.'); e.code = 'REAUTH'; throw e; }
  if (!res.ok) throw new Error(data?.error?.message || `Gmail error ${res.status}`);
  return data; // { id, threadId }
}
