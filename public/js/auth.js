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
  return authFetch('otp', { email, create_user: true });
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
