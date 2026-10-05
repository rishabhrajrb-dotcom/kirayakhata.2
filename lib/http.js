// Turns our framework-free handlers ({ body, query, visitorId, ... } -> { status, json|text })
// into Vercel Node functions (req, res). The local dev server calls the handlers directly.
import crypto from 'node:crypto';
import { getStores } from './stores.js';

export const BODY_LIMIT = 8 * 1024;

function visitor(req, res) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)kk_vid=([A-Za-z0-9_-]{16,64})/);
  if (m) return m[1];
  const id = crypto.randomBytes(16).toString('base64url');
  res.setHeader('Set-Cookie', `kk_vid=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`);
  return id;
}

async function readRaw(req, limit) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return JSON.stringify(req.body);
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Wrap a handler. opts: { methods: ['POST'], bodyLimit } */
export function vercelHandler(handler, { methods = ['GET'], bodyLimit = BODY_LIMIT } = {}) {
  return async function (req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!methods.includes(req.method)) { res.setHeader('Allow', methods.join(', ')); res.statusCode = 405; return res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' })); }
    try {
      let body = null;
      if (req.method === 'POST') {
        if (!String(req.headers['content-type'] || '').includes('application/json')) { res.statusCode = 415; return res.end(JSON.stringify({ error: 'JSON_REQUIRED' })); }
        const raw = await readRaw(req, bodyLimit);
        if (Buffer.byteLength(raw) > bodyLimit) { res.statusCode = 413; return res.end(JSON.stringify({ error: 'BODY_TOO_LARGE', limitBytes: bodyLimit })); }
        try { body = JSON.parse(raw || '{}'); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'BAD_JSON' })); }
      }
      const url = new URL(req.url, 'http://x');
      const { store, limiter, limiterFor, kind } = getStores();
      const out = await handler({ body, query: url.searchParams, headers: req.headers, visitorId: visitor(req, res), store, limiter, limiterFor, storeKind: kind, startedAt: null });
      res.statusCode = out.status;
      if (out.text !== undefined) {
        res.setHeader('Content-Type', out.type || 'text/plain');
        if (out.filename) res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
        return res.end(out.text);
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(out.json));
    } catch (e) {
      res.statusCode = e.status === 413 ? 413 : 500;
      console.error('[api error]', e.message);
      return res.end(JSON.stringify({ error: e.status === 413 ? 'BODY_TOO_LARGE' : 'SERVER_ERROR' }));
    }
  };
}
