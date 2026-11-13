import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createDeleteAccountHandler } from './handler.js';

// JWT verification is performed with Auth.getUser inside the handler, supporting
// both legacy and asymmetric JWTs. The service key exists only in the Edge runtime.
Deno.serve(createDeleteAccountHandler(createClient, {
  url: Deno.env.get('SUPABASE_URL') || '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') || 'https://wiselogg.github.io').split(',').map((origin) => origin.trim()).filter(Boolean),
}));
