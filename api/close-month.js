import { vercelHandler } from '../lib/http.js';
// POST /api/close-month - authoritative deterministic check for the public demo.
import { closeMonthSchema, zodErrors } from '../shared/schemas.js';
import { closeMonth } from '../shared/rules.js';
import { RULESET_VERSION } from '../shared/compliance-config.js';
import { cleanNote, guardrail } from '../lib/sanitize.js';
import { deterministicExplanation, approvedFacts } from '../lib/prompt.js';
import { explainWithGemini } from '../lib/gemini.js';

export async function handleCloseMonth({ body, visitorId, store, limiter, now = Date.now() }) {
  const parsed = closeMonthSchema.safeParse(body);
  if (!parsed.success) return { status: 400, json: { error: 'VALIDATION', issues: zodErrors(parsed.error) } };
  const input = parsed.data;
  const lang = input.lang || 'en';

  const note = cleanNote(input.note || '');
  const guard = guardrail(note);
  if (guard.refused) {
    await store.appendLine('metrics', { at: new Date(now).toISOString(), visitor: visitorId, refused: true, notePresent: true, noteLength: note.length, rulesetVersion: RULESET_VERSION });
    return { status: 422, json: { error: 'REFUSED', message: lang === 'hi' ? 'हम कर से बचने, किराया छिपाने या पिछली तारीख़ डालने में मदद नहीं कर सकते। सामान्य, कानूनी सवाल पूछ सकते हैं।' : 'We can\'t help with avoiding tax, hiding rent or backdating documents. Ordinary lawful questions are welcome.' } };
  }

  const limit = await limiter.check(visitorId, now);
  if (!limit.allowed) {
    return { status: 429, json: { error: 'LIMIT', remaining: 0, resetAt: new Date(limit.resetAt).toISOString() } };
  }

  const t0 = Date.now();
  const result = closeMonth(input);
  let explanation = deterministicExplanation(result, lang);
  let model = { used: false, reason: 'NOT_CONFIGURED' };
  model = await explainWithGemini(approvedFacts(result), lang);
  // Gemini only rewords the summary. Next steps always come from the engine's own plain-language list.
  if (model.used) explanation = { ...model.output, nextActions: explanation.nextActions, deterministic: explanation.summary };

  // Anonymised metrics only: no names, GSTIN/PAN, emails, addresses, bank data or raw notes.
  await store.appendLine('metrics', {
    at: new Date(now).toISOString(), visitor: visitorId, sample: Boolean(input.sample), period: input.period,
    scenario: `${input.property.kind}|${input.landlord.gstRegType}|${input.tenant.gstRegType}|${input.tenant.category}`,
    treatment: result.gst.treatment, gstStatus: result.gst.status, tdsStatus: result.tds.status, arithmetic: result.arithmetic,
    rentPaise: input.rentPaise, differencePaise: result.differencePaise, ms: Date.now() - t0, rulesetVersion: RULESET_VERSION,
    notePresent: Boolean(note), noteLength: note.length, modelUsed: model.used, modelFallback: model.used ? null : model.reason,
    modelName: model.model || null,
    modelTokens: model.tokens ? { in: model.tokens.promptTokenCount, out: model.tokens.candidatesTokenCount } : null,
  });
  return { status: 200, json: { result, explanation, remaining: limit.remaining, label: 'Local prototype check', rulesetVersion: RULESET_VERSION } };
}

export default vercelHandler(handleCloseMonth, { methods: ['POST'] });
