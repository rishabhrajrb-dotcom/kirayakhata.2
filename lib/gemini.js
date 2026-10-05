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

export async function geminiJSON(prompt, { maxOutputTokens = 400, timeoutMs = 8000 } = {}) {
  if (!geminiConfigured()) return { ok: false, reason: 'NOT_CONFIGURED' };
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens, temperature: 0.3 } }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, reason: `HTTP_${res.status}` };
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    try { return { ok: true, json: JSON.parse(text), tokens: data?.usageMetadata || null }; } catch { return { ok: false, reason: 'PARSE' }; }
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'TIMEOUT' : 'ERROR' };
  } finally { clearTimeout(t); }
}

export async function explainWithGemini(facts, lang) {
  const r = await geminiJSON(buildPrompt(facts, lang), { maxOutputTokens: 300 });
  if (!r.ok) return { used: false, reason: r.reason };
  const v = validateModelOutput(r.json, facts);
  if (!v.ok) return { used: false, reason: `REJECTED_${v.reason}` };
  return { used: true, output: { ...r.json, source: 'gemini' }, tokens: r.tokens };
}
