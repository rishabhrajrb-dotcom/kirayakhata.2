// Picks the metrics + rate-limit store:
//   - Supabase (durable, shared, race-safe via a Postgres function) when configured  -> production
//   - local JSON files under work/local-data                                         -> local dev
//   - in-memory (lost on cold start) when on Vercel without Supabase                 -> clearly reported by /api/health
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalStore } from './local-store.js';
import { createRateLimiter, DEMO_LIMIT } from './rate-limit.js';
import { supabaseConfig, sb } from './supabase-rest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function memoryStore() {
  const files = {}; const lines = {};
  return {
    kind: 'memory',
    async update(name, fallback, fn) { const { value, result } = await fn(files[name] ?? structuredClone(fallback)); files[name] = value; return result; },
    async appendLine(name, obj) { (lines[name] = lines[name] || []).push(obj); },
    async readLines(name) { return lines[name] || []; },
  };
}

function supabaseStore() {
  return {
    kind: 'supabase',
    async appendLine(name, obj) {
      if (name !== 'metrics') return;
      await sb.insert('demo_metrics', { at: obj.at, visitor: obj.visitor, payload: obj });
    },
    async readLines(name) {
      if (name !== 'metrics') return [];
      const rows = await sb.select('demo_metrics', 'select=payload&order=at.desc&limit=5000');
      return rows.map((r) => r.payload);
    },
  };
}

function supabaseLimiter(limit = DEMO_LIMIT) {
  return {
    async check(key) {
      const r = await sb.rpc('kk_rate_check', { p_key: key, p_limit: limit });
      return { allowed: r.allowed, remaining: r.remaining, resetAt: Date.parse(r.reset_at) };
    },
  };
}

let cached = null;
export function getStores() {
  if (cached) return cached;
  if (supabaseConfig().configured) {
    cached = { store: supabaseStore(), limiter: supabaseLimiter(), limiterFor: (n) => supabaseLimiter(n), kind: 'supabase' };
  } else if (process.env.VERCEL) {
    const store = memoryStore();
    cached = { store, limiter: createRateLimiter(store), limiterFor: (n) => createRateLimiter(store, { limit: n }), kind: 'memory (not durable — configure Supabase)' };
  } else {
    const store = createLocalStore(path.join(ROOT, 'work', 'local-data'));
    cached = { store, limiter: createRateLimiter(store), limiterFor: (n) => createRateLimiter(store, { limit: n }), kind: 'local files' };
  }
  return cached;
}
