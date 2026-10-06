// OPTIONAL Gemini usage (server-side only, GEMINI_API_KEY). Gemini never calculates tax,
// amounts or dates; it only rewords text built from facts the deterministic engine produced.
// Every output is schema-checked and rejected if it adds numbers or makes claims.
// Used by:
//   1. /api/close-month   - rewords the explanation of a rent check (falls back to fixed text)
//   2. /api/draft-email   - drafts a polite email to the tenant for the invoices (no names sent)
import { buildPrompt, validateModelOutput } from './prompt.js';

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Models are tried in order. A name Google no longer serves (404), a busy model (429/500/503)
// or a slow one (timeout) moves on to the next model, so one retired or overloaded model does
// not silently turn the AI feature off. GEMINI_MODEL is tried first, then GEMINI_FALLBACK_MODELS.
const TRANSIENT = new Set([404, 429, 500, 503]);
const BUDGET_MS = 9000;                                  // total time for all attempts (serverless limit)
export function modelChain(env = process.env) {
  const list = [env.GEMINI_MODEL || 'gemini-2.5-flash', ...String(env.GEMINI_FALLBACK_MODELS || 'gemini-flash-lite-latest,gemini-2.5-flash-lite').split(',')];
  return [...new Set(list.map((m) => m.trim()).filter(Boolean))].slice(0, 3);
}

const isTransient = (r) => r.reason === 'TIMEOUT' || (String(r.reason).startsWith('HTTP_') && TRANSIENT.has(Number(r.reason.slice(5))));

export async function geminiJSON(prompt, { maxOutputTokens = 400, timeoutMs = 5000 } = {}) {
  if (!geminiConfigured()) return { ok: false, reason: 'NOT_CONFIGURED' };
  const deadline = Date.now() + BUDGET_MS;
  let last = { ok: false, reason: 'ERROR' };
  for (const model of modelChain()) {
    if (deadline - Date.now() < 1500) break;
    const wait = Math.min(timeoutMs, deadline - Date.now());
    last = await callGemini(model, prompt, { maxOutputTokens, timeoutMs: wait, thinking: true });
    // Some models reject the "no thinking" setting with a 400: retry the same model without it.
    if (!last.ok && last.reason === 'HTTP_400' && deadline - Date.now() > 1500) {
      last = await callGemini(model, prompt, { maxOutputTokens, timeoutMs: Math.min(timeoutMs, deadline - Date.now()), thinking: false });
    }
    if (last.ok || !isTransient(last)) break;
  }
  return last;
}

async function callGemini(model, prompt, { maxOutputTokens, timeoutMs, thinking }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const generationConfig = { responseMimeType: 'application/json', maxOutputTokens, temperature: 0.3 };
    if (thinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // Google's error text holds no user data; keep a short piece so a failure can be diagnosed from the stored row.
      const raw = await res.text().catch(() => '');
      let detail = raw; try { detail = JSON.parse(raw)?.error?.message || raw; } catch { /* keep raw */ }
      return { ok: false, reason: `HTTP_${res.status}`, model, detail: String(detail).replace(/\s+/g, ' ').slice(0, 120) };
    }
    const data = await res.json();
    const cand = data?.candidates?.[0];
    // Join answer parts only; thinking models can put reasoning ("thought") parts first.
    const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    try { return { ok: true, model, json: JSON.parse(text), tokens: data?.usageMetadata || null }; } catch { return { ok: false, model, reason: `PARSE_${cand?.finishReason || 'NO_CANDIDATE'}` }; }
  } catch (e) {
    return { ok: false, model, reason: e.name === 'AbortError' ? 'TIMEOUT' : 'ERROR' };
  } finally { clearTimeout(t); }
}

export async function explainWithGemini(facts, lang) {
  const r = await geminiJSON(buildPrompt(facts, lang), { maxOutputTokens: 300 });
  if (!r.ok) return { used: false, reason: r.detail ? `${r.reason} ${r.model}: ${r.detail}` : r.reason };
  const v = validateModelOutput(r.json, facts);
  if (!v.ok) return { used: false, reason: `REJECTED_${v.reason}` };
  return { used: true, output: { ...r.json, source: 'gemini' }, tokens: r.tokens, model: r.model };
}
