// Minimal Supabase REST/Auth client using fetch (no SDK). Server-side only for the
// service-role key; the anon key and URL are public by design.
export function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  return {
    url,
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    configured: Boolean(url && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

async function call(path, { method = 'GET', body, headers = {}, key } = {}) {
  const c = supabaseConfig();
  const k = key || c.serviceKey;
  // New-style keys (sb_secret_… / sb_publishable_…) go only in `apikey`; legacy JWT keys also as Bearer.
  const auth = k.startsWith('sb_') ? {} : { Authorization: `Bearer ${k}` };
  const res = await fetch(`${c.url}${path}`, {
    method,
    headers: { apikey: k, ...auth, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) { const e = new Error(`Supabase ${res.status}: ${typeof json === 'object' ? json?.message || json?.msg || '' : json}`.slice(0, 200)); e.status = res.status; throw e; }
  return json;
}

export const sb = {
  rpc: (fn, args) => call(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args }),
  insert: (table, row, { returning = false } = {}) => call(`/rest/v1/${table}`, { method: 'POST', body: row, headers: { Prefer: returning ? 'return=representation' : 'return=minimal' } }),
  select: (table, query) => call(`/rest/v1/${table}?${query}`),
  update: (table, query, patch) => call(`/rest/v1/${table}?${query}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=minimal' } }),
};

/** Verify a user's access token with Supabase Auth. Returns { id, email } or null. */
export async function verifyUser(authHeader) {
  const c = supabaseConfig();
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '');
  if (!c.configured || !token || token.length > 4096) return null;
  try {
    const res = await fetch(`${c.url}/auth/v1/user`, { headers: { apikey: c.anonKey, Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const u = await res.json();
    return u && u.id ? { id: u.id, email: u.email } : null;
  } catch { return null; }
}
