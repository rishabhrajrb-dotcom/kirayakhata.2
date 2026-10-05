import { vercelHandler } from '../lib/http.js';
// GET /api/health - readiness without revealing any secret values.
import { RULESET_VERSION, RULES_REVIEWED_ON } from '../shared/compliance-config.js';
import { geminiConfigured } from '../lib/gemini.js';
import { emailConfigured } from '../lib/integrations/email-provider.js';
import { supabaseConfig } from '../lib/supabase-rest.js';

export async function handleHealth({ startedAt, storeKind }) {
  return {
    status: 200,
    json: {
      ok: true, mode: process.env.VERCEL ? 'vercel' : 'local', startedAt, rulesetVersion: RULESET_VERSION, rulesReviewedOn: RULES_REVIEWED_ON,
      integrations: {
        explanationModel: geminiConfigured() ? 'configured (rewording + email drafts only)' : 'not-configured (deterministic text)',
        email: emailConfigured() && supabaseConfig().configured ? 'Resend configured (signed-in users)' : 'not configured (mail-app draft + practice outbox)',
        storage: 'property records: browser IndexedDB (device only)', serverStore: storeKind || 'local files',
        auth: supabaseConfig().configured ? 'Supabase Auth (email code)' : 'not configured', gstFiling: 'not-integrated', incomeTaxFiling: 'not-integrated',
        scheduler: 'local only while the app is open',
      },
    },
  };
}

export default vercelHandler(handleHealth, { methods: ['GET'] });
