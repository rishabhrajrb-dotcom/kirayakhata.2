// Local development server: static frontend + API handlers. Binds to 127.0.0.1 only.
// Start: npm start   ->   http://localhost:4173
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getStores } from '../lib/stores.js';
import { handleCloseMonth } from '../api/close-month.js';
import { handleCalendar } from '../api/compliance-calendar.js';
import { handleStats } from '../api/stats.js';
import { handleHealth } from '../api/health.js';
import { handleSendInvoices } from '../api/send-invoices.js';
import { handleDraftEmail } from '../api/draft-email.js';
import { handleConfig } from '../api/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');
const DATA = path.join(ROOT, 'work', 'local-data');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const BODY_LIMIT = 8 * 1024;

// Load optional .env (blank values ignored). Secrets are never sent to the browser.
try {
  const env = await fs.readFile(path.join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env: fine */ }

const startedAt = new Date().toISOString();

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2' };

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co https://gmail.googleapis.com",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' mailto:",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

function visitor(req, res) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)kk_vid=([A-Za-z0-9_-]{16,64})/);
  if (m) return m[1];
  const id = crypto.randomBytes(16).toString('base64url');
  res.setHeader('Set-Cookie', `kk_vid=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`);
  return id;
}

function readBody(req, BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, payload, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload));
}

async function serveFile(res, base, rel) {
  const target = path.normalize(path.join(base, rel));
  if (!target.startsWith(base + path.sep) && target !== base) return send(res, 403, { error: 'FORBIDDEN' });
  try {
    let file = target;
    const st = await fs.stat(file);
    if (st.isDirectory()) file = path.join(file, 'index.html');
    const data = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    send(res, 404, '<!doctype html><title>Not found</title><p>Not found. <a href="/">Go home</a></p>', 'text/html; charset=utf-8');
  }
}

const routes = {
  'POST /api/close-month': handleCloseMonth,
  'POST /api/compliance-calendar': handleCalendar,
  'GET /api/stats': handleStats,
  'GET /api/health': handleHealth,
  'POST /api/send-invoices': handleSendInvoices,
  'POST /api/draft-email': handleDraftEmail,
  'GET /api/config': handleConfig,
};
const BODY_LIMITS = { '/api/send-invoices': 4_200_000 };

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const handler = routes[`${req.method} ${url.pathname}`];
      if (!handler) {
        const exists = Object.keys(routes).some((k) => k.endsWith(` ${url.pathname}`));
        return send(res, exists ? 405 : 404, { error: exists ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND' }, undefined, exists ? { Allow: Object.keys(routes).find((k) => k.endsWith(` ${url.pathname}`)).split(' ')[0] } : {});
      }
      let body = null;
      if (req.method === 'POST') {
        if (!String(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'JSON_REQUIRED' });
        const raw = await readBody(req, BODY_LIMITS[url.pathname] || BODY_LIMIT);
        try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'BAD_JSON' }); }
      }
      const { store, limiter, limiterFor, kind } = getStores();
      const out = await handler({ body, query: url.searchParams, headers: req.headers, visitorId: visitor(req, res), store, limiter, limiterFor, storeKind: kind, startedAt });
      if (out.text !== undefined) return send(res, out.status, out.text, out.type, out.filename ? { 'Content-Disposition': `attachment; filename="${out.filename}"` } : {});
      return send(res, out.status, out.json);
    }
    if (url.pathname.startsWith('/shared/')) return serveFile(res, SHARED, decodeURIComponent(url.pathname.slice('/shared/'.length)));
    if (url.pathname === '/app') return serveFile(res, PUBLIC, 'app.html');
    if (url.pathname.startsWith('/docs/')) return serveFile(res, path.join(ROOT, 'docs'), decodeURIComponent(url.pathname.slice('/docs/'.length)));
    return serveFile(res, PUBLIC, decodeURIComponent(url.pathname));
  } catch (e) {
    if (e.status === 413) return send(res, 413, { error: 'BODY_TOO_LARGE', limitBytes: BODY_LIMIT });
    console.error('[server error]', e.message);
    return send(res, 500, { error: 'SERVER_ERROR' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`KirayaKhata local prototype running at http://localhost:${PORT}`);
  console.log(`  Landing page: http://localhost:${PORT}/   Workspace: http://localhost:${PORT}/app`);
  console.log('  Health: /api/health   (no external services required)');
});
