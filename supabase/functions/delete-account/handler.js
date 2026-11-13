// Dependency injection keeps the security boundary testable without real accounts.
export function createDeleteAccountHandler(createClient, config) {
  return async (request) => {
    const origin = request.headers.get('origin');
    const allowed = config.allowedOrigins.includes(origin);
    const headers = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowed) return reply(403, { error: 'Origin not allowed.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
    if (!config.url || !config.anonKey || !config.serviceKey) return reply(503, { error: 'Account deletion is temporarily unavailable.' });
    const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') || '')?.[1];
    if (!token) return reply(401, { error: 'Sign in first.' });
    if (!request.headers.get('content-type')?.includes('application/json')) return reply(415, { error: 'Use JSON.' });
    try {
      const text = await request.text();
      if (text.length > 8192) return reply(413, { error: 'Request too large.' });
      let body;
      try { body = JSON.parse(text); } catch { return reply(400, { error: 'Invalid JSON.' }); }
      if (typeof body?.password !== 'string' || !body.password || body.password.length > 4096) return reply(400, { error: 'Enter your current password.' });
      const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
      const client = createClient(config.url, config.anonKey, options);
      const { data: identity, error: identityError } = await client.auth.getUser(token);
      if (identityError || !identity.user?.email) return reply(401, { error: 'Sign in again.' });
      // The target comes only from the validated token. Never accept a user ID or email from the body.
      const { data: verified, error: passwordError } = await client.auth.signInWithPassword({ email: identity.user.email, password: body.password });
      if (passwordError || verified.user?.id !== identity.user.id) return reply(401, { error: 'Your password is incorrect.' });
      const admin = createClient(config.url, config.serviceKey, options);
      const { error: revokeError } = await admin.auth.admin.signOut(token, 'global');
      if (revokeError) return reply(503, { error: 'Could not revoke sessions. Please try again.' });
      const { error: deleteError } = await admin.auth.admin.deleteUser(identity.user.id);
      if (deleteError) return reply(503, { error: 'Could not delete your account. Please try again.' });
      return reply(200, { deleted: true });
    } catch {
      // Do not log credentials, tokens, request bodies, or provider error payloads.
      return reply(503, { error: 'Account deletion is temporarily unavailable.' });
    }
  };
}
