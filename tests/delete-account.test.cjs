const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

async function fixture(overrides = {}) {
  const source = await fs.readFile('supabase/functions/delete-account/handler.js', 'utf8');
  const { createDeleteAccountHandler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const calls = [];
  const user = { id: 'current-athlete', email: 'athlete@example.invalid' };
  const createClient = (_url, key) => ({ auth: key === 'public' ? {
    getUser: async (token) => { calls.push(['verify', token]); return overrides.identity || { data: { user }, error: null }; },
    signInWithPassword: async (credentials) => { calls.push(['password', credentials]); return overrides.password || { data: { user }, error: null }; },
  } : { admin: {
    signOut: async (token, scope) => { calls.push(['revoke', token, scope]); return { error: overrides.revokeError }; },
    deleteUser: async (id) => { calls.push(['delete', id]); return { error: overrides.deleteError }; },
  } } });
  const handler = createDeleteAccountHandler(createClient, { url: 'https://example.invalid', anonKey: 'public', serviceKey: 'server-only', allowedOrigins: ['https://wiselogg.github.io'] });
  const request = (body = { password: 'test-password', user_id: 'someone-else', email: 'other@example.invalid' }, headers = {}) => new Request('https://example.invalid/delete-account', { method: 'POST', headers: { origin: 'https://wiselogg.github.io', authorization: 'Bearer valid-token', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { handler, request, calls };
}
test('account deletion validates identity and password, revokes all sessions, and ignores body identity', async () => {
  const { handler, request, calls } = await fixture();
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { deleted: true });
  assert.deepEqual(calls, [['verify', 'valid-token'], ['password', { email: 'athlete@example.invalid', password: 'test-password' }], ['revoke', 'valid-token', 'global'], ['delete', 'current-athlete']]);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
test('account deletion rejects missing authentication, untrusted origins, and empty passwords', async () => {
  const { handler, request, calls } = await fixture();
  assert.equal((await handler(request(undefined, { authorization: '' }))).status, 401);
  assert.equal((await handler(request(undefined, { origin: 'https://evil.invalid' }))).status, 403);
  assert.equal((await handler(request({ password: '' }))).status, 400);
  assert.equal((await handler(request({ password: 'x'.repeat(9000) }))).status, 413);
  assert.deepEqual(calls, []);
});
test('account deletion stops on invalid tokens, wrong passwords, mismatched identities, and revocation failure', async () => {
  for (const overrides of [
    { identity: { data: { user: null }, error: {} } },
    { password: { data: {}, error: {} } },
    { password: { data: { user: { id: 'other-athlete' } }, error: null } },
    { revokeError: { message: 'Unavailable' } },
  ]) {
    const { handler, request, calls } = await fixture(overrides);
    assert.notEqual((await handler(request())).status, 200);
    assert.equal(calls.some(([kind]) => kind === 'delete'), false);
  }
});
test('account deletion never reports success when deletion fails', async () => {
  const { handler, request } = await fixture({ deleteError: {} });
  const result = await handler(request());
  assert.equal(result.status, 503);
  assert.equal((await result.json()).deleted, undefined);
});
