// GET /api/config - PUBLIC client configuration only. The Supabase anon key is designed to
// be public (row-level security protects data); secret keys are never included.
import { vercelHandler } from '../lib/http.js';
import { supabaseConfig } from '../lib/supabase-rest.js';
import { emailConfigured } from '../lib/integrations/email-provider.js';
import { geminiConfigured } from '../lib/gemini.js';

export async function handleConfig() {
  const c = supabaseConfig();
  return {
    status: 200,
    json: {
      supabaseUrl: c.configured ? c.url : null,
      supabaseAnonKey: c.configured ? c.anonKey : null,
      authEnabled: c.configured,
      emailEnabled: c.configured && emailConfigured(),
      aiDraftEnabled: c.configured && geminiConfigured(),
    },
  };
}

export default vercelHandler(handleConfig, { methods: ['GET'] });
