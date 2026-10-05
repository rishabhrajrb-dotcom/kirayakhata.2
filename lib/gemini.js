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

// Models are tried in order. A name Google no longer serves (404) or a model that is busy
// (429/500/503) moves on to the next one, so one retired or overloaded model does not
// silently turn the AI feature off. GEMINI_MODEL is tried first, then GEMINI_FALLBACK_MODELS.
const TRANSIENT = new Set([404, 429, 500, 503]);
export function modelChain(env = process.env) {
  const list = [env.GEMINI_MODEL || 'gemini-2.5-flash', ...String(env.GEMINI_FALLBACK_MODELS || 'gemini-flash-lite-latest,gemini-2.5-flash-lite').split(',')];
  return [...new Set(list.map((m) => m.trim()).filter(Boolean))].slice(0, 3);
}

export async function geminiJSON(prompt, { maxOutputTokens = 400, timeoutMs = 6000 } = {}) {
  if (!geminiConfigured()) return { ok: false, reason: 'NOT_CONFIGURED' };
  const started = Date.now();
  let last = { ok: false, reason: 'ERROR' };
  for (const model of modelChain()) {
    if (Date.now() - started > timeoutMs) break;          // stay inside the serverless time limit
    last = await callGemini(model, prompt, { maxOutputTokens, timeoutMs });
    if (last.ok || !String(last.reason).startsWith('HTTP_') || !TRANSIENT.has(Number(last.reason.slice(5)))) break;
  }
  return last;
}

async function callGemini(model, prompt, { maxOutputTokens, timeoutMs }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } } }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, reason: `HTTP_${res.status}` };
    const data = await res.json();
    const cand = data?.candidates?.[0];
    // Join answer parts only; thinking models can put reasoning ("thought") parts first.
    const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    try { return { ok: true, model, json: JSON.parse(text), tokens: data?.usageMetadata || null }; } catch { return { ok: false, reason: `PARSE_${cand?.finishReason || 'NO_CANDIDATE'}` }; }
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'TIMEOUT' : 'ERROR' };
  } finally { clearTimeout(t); }
}

export async function explainWithGemini(facts, lang) {
  const r = await geminiJSON(buildPrompt(facts, lang), { maxOutputTokens: 300 });
  if (!r.ok) return { used: false, reason: r.reason };
  const v = validateModelOutput(r.json, facts);
  if (!v.ok) return { used: false, reason: `REJECTED_${v.reason}` };
  return { used: true, output: { ...r.json, source: 'gemini' }, tokens: r.tokens, model: r.model };
}
