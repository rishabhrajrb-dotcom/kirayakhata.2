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
      supabaseUrl: c.url && c.anonKey ? c.url : null,
      supabaseAnonKey: c.url && c.anonKey ? c.anonKey : null,
      // Turn on after configuring the Google provider (gmail.send scope) in Supabase.
      gmailSendEnabled: Boolean(c.url && c.anonKey && process.env.GMAIL_SEND_ENABLED === '1'),
      // Sign-in only needs the public URL + key (the browser talks to Supabase Auth directly).
      authEnabled: Boolean(c.url && c.anonKey),
      googleLoginEnabled: Boolean(c.url && c.anonKey && process.env.GOOGLE_LOGIN_ENABLED === '1'),
      emailEnabled: c.configured && emailConfigured(),
      aiDraftEnabled: c.configured && geminiConfigured(),
    },
  };
}

export default vercelHandler(handleConfig, { methods: ['GET'] });
