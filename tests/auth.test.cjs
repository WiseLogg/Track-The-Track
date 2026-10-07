const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
let server, browser, origin;
const root = path.resolve(__dirname, '..');
const user = {
  id: 'f18672a1-8b4a-4f00-973d-85b7920ae7e7', aud: 'authenticated', role: 'authenticated',
  email: 'athlete@example.invalid', email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: 'Logan' },
};
const jwtPart = (data) => Buffer.from(JSON.stringify(data)).toString('base64url');
const token = `${jwtPart({ alg: 'HS256', typ: 'JWT' })}.${jwtPart({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const session = { access_token: token, refresh_token: 'test-refresh-token', expires_in: 3600, token_type: 'bearer', user };

before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
      const body = await fs.readFile(file);
      const ext = path.extname(file);
      res.setHeader('Content-Type', ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'text/plain');
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const options = { headless: true };
  if (process.env.TRACK_TEST_CHROMIUM) {
    options.executablePath = process.env.TRACK_TEST_CHROMIUM;
    options.args = ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--in-process-gpu', '--use-gl=angle', '--use-angle=swiftshader'];
  }
  browser = await chromium.launch(options);
});
after(async () => {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
});

async function setup(handler = () => null, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const errors = [], calls = [];
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('https://virlqetwxpgkienkpjdr.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const call = { url, method: request.method(), body: request.postDataJSON() };
    calls.push(call);
    const response = handler(call) || (url.pathname === '/auth/v1/user'
      ? { status: 200, body: user }
      : url.pathname === '/rest/v1/race_results'
        ? { status: 200, body: [{ event: '400m', race_date: '2026-05-22', time_seconds: 56.7, meet_name: 'Spring meet' }] }
        : { status: 200, body: {} });
    await route.fulfill({ status: response.status, contentType: 'application/json', headers: { 'x-supabase-api-version': '2024-01-01' }, body: JSON.stringify(response.body) });
  });
  return { context, page, errors, calls };
}

async function fillLogin(page) {
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill('test-password-123');
}

test('invalid credentials show an error and keep the form usable', async () => {
  const { context, page, errors, calls } = await setup((call) => call.url.pathname === '/auth/v1/token'
    ? { status: 400, body: { code: 'invalid_credentials', msg: 'Invalid login credentials' } } : null);
  try {
    await page.goto(`${origin}/login.html`);
    await fillLogin(page);
    await page.locator('#login-submit').click();
    await page.locator('#login-notice').waitFor({ state: 'visible' });
    assert.match(await page.locator('#login-notice').textContent(), /incorrect/);
    assert.equal(await page.locator('#login-submit').isEnabled(), true);
    assert.equal(page.url(), `${origin}/login.html`);
    assert.equal(calls.filter((c) => c.url.pathname === '/auth/v1/token').length, 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('signed-out visitors are redirected from the dashboard', async () => {
  const { context, page, errors } = await setup();
  try {
    await page.goto(`${origin}/dashboard.html`);
    await page.waitForURL('**/login.html');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('signup validates confirmation and requests email verification', async () => {
  const { context, page, errors, calls } = await setup((call) => call.url.pathname === '/auth/v1/signup'
    ? { status: 200, body: { ...user, identities: [] } } : null);
  try {
    await page.goto(`${origin}/signup.html`);
    await page.locator('#name').fill('Logan');
    await page.locator('#email').fill(user.email);
    await page.locator('#password').fill('test-password-123');
    await page.locator('#confirm-password').fill('different-password');
    await page.locator('#signup-submit').click();
    assert.match(await page.locator('#confirm-password-error').textContent(), /don’t match/);
    assert.equal(calls.length, 0);
    await page.locator('#confirm-password').fill('test-password-123');
    await page.locator('#signup-submit').click();
    await page.waitForFunction(() => document.querySelector('#signup-notice').textContent.includes('confirmation link'));
    const signup = calls.find((c) => c.url.pathname === '/auth/v1/signup');
    assert.equal(signup.body.data.display_name, 'Logan');
    assert.equal(signup.url.searchParams.get('redirect_to'), `${origin}/login.html`);
    assert.equal(await page.locator('#password').inputValue(), '');
    assert.equal(page.url(), `${origin}/signup.html`);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('login persists a session, displays scoped results, and signs out', async () => {
  const { context, page, errors, calls } = await setup((call) => call.url.pathname === '/auth/v1/token'
    ? { status: 200, body: session } : null);
  try {
    await page.goto(`${origin}/login.html`);
    await fillLogin(page);
    await page.locator('#login-submit').click();
    await page.waitForURL('**/dashboard.html');
    await page.locator('#results-wrap').waitFor({ state: 'visible' });
    assert.match(await page.locator('#welcome').textContent(), /Logan/);
    assert.match(await page.locator('#race-results').textContent(), /56.7s/);
    const query = calls.find((c) => c.url.pathname === '/rest/v1/race_results');
    assert.equal(query.url.searchParams.get('user_id'), `eq.${user.id}`);
    await page.reload();
    await page.locator('#account-content').waitFor({ state: 'visible' });
    await page.goto(`${origin}/index.html`);
    await page.locator('.site-nav a[href="dashboard.html"]').first().waitFor();
    await page.goto(`${origin}/dashboard.html`);
    await page.locator('#sign-out').click();
    await page.waitForURL('**/login.html');
    const saved = await page.evaluate(() => localStorage.getItem('track-the-track.auth'));
    assert.equal(saved, null);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('password reset requests the login-page callback', async () => {
  const { context, page, errors, calls } = await setup();
  try {
    await page.goto(`${origin}/login.html`);
    await page.locator('#forgot-password').click();
    await page.locator('#email').fill(user.email);
    await page.locator('#login-submit').click();
    await page.waitForFunction(() => document.querySelector('#login-notice').textContent.includes('reset link is on its way'));
    const reset = calls.find((c) => c.url.pathname === '/auth/v1/recover');
    assert.equal(reset.body.email, user.email);
    assert.equal(reset.url.searchParams.get('redirect_to'), `${origin}/login.html`);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('recovery callback accepts a new password and requires a fresh login', async () => {
  const { context, page, errors, calls } = await setup();
  try {
    const hash = new URLSearchParams({ access_token: token, refresh_token: session.refresh_token, expires_in: '3600', token_type: 'bearer', type: 'recovery' });
    await page.goto(`${origin}/login.html#${hash}`);
    await page.locator('#confirm-password-field').waitFor({ state: 'visible' });
    await page.locator('#password').fill('updated-test-password-123');
    await page.locator('#confirm-password').fill('updated-test-password-123');
    await page.locator('#login-submit').click();
    await page.waitForFunction(() => document.querySelector('#login-notice').textContent.includes('password has been updated'));
    const update = calls.find((c) => c.url.pathname === '/auth/v1/user' && c.method === 'PUT');
    assert.equal(update.body.password, 'updated-test-password-123');
    assert.equal(await page.locator('#email-field').isVisible(), true);
    assert.equal(await page.locator('#confirm-password-field').isVisible(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('track-the-track.auth')), null);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('mobile account pages fit the viewport and missing SDK fails clearly', async () => {
  const { context, page, errors } = await setup(undefined, { width: 390, height: 844 });
  try {
    for (const file of ['login.html', 'signup.html']) {
      await page.goto(`${origin}/${file}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await context.route('**/vendor/supabase.js', (route) => route.abort());
    await page.goto(`${origin}/login.html`);
    await page.locator('#login-notice').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#login-submit').isDisabled(), true);
    assert.match(await page.locator('#login-notice').textContent(), /couldn't load/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

async function dashboardSetup(handler, viewport) {
  const result = await setup(handler, viewport);
  await result.context.addInitScript((stored) => {
    localStorage.setItem('track-the-track.auth', JSON.stringify(stored));
  }, { ...session, expires_at: Math.floor(Date.now() / 1000) + 3600 });
  await result.page.goto(`${origin}/dashboard.html`);
  await result.page.waitForFunction(() => document.querySelector('#season-summary').getAttribute('aria-busy') === 'false');
  return result;
}

const seasonResults = [
  { event: '100m', race_date: '2025-05-01', time_seconds: 12.5, meet_name: 'Last season' },
  { event: '100m', race_date: '2026-03-01', time_seconds: 12.2, meet_name: 'Season opener' },
  { event: '200m', race_date: '2026-03-01', time_seconds: 24.8, meet_name: 'Season opener' },
  { event: '100m', race_date: '2026-03-20', time_seconds: 12, meet_name: 'City Invitational' },
  { event: '100m', race_date: '2026-04-10', time_seconds: 12.15, meet_name: 'League meet' },
  { event: '200m', race_date: '2026-04-10', time_seconds: 24.4, meet_name: 'League meet' },
  { event: '800m', race_date: '2026-04-10', time_seconds: 125.12, meet_name: 'League meet' },
  { event: '100m', race_date: '2026-05-01', time_seconds: 11.84, meet_name: 'Championships' },
];

test('dashboard calculates season stats, personal records, and filtered charts', async () => {
  const { context, page, errors } = await dashboardSetup((call) => call.url.pathname === '/rest/v1/race_results'
    ? { status: 200, body: seasonResults } : null);
  try {
    assert.equal(await page.locator('#season-filter').inputValue(), '2026');
    for (const [selector, value] of Object.entries({ '#stat-meets': '4', '#stat-results': '7', '#stat-prs': '4', '#stat-events': '3' })) {
      assert.equal(await page.locator(selector).textContent(), value);
    }
    assert.equal(await page.locator('#race-results .pr-tag').count(), 4);
    assert.match(await page.locator('#personal-bests').textContent(), /11.84s/);
    assert.match(await page.locator('#personal-bests').textContent(), /2:05.12/);
    await page.locator('#chart-event').selectOption('200m');
    assert.equal(await page.locator('#chart-best').textContent(), '24.4s');
    assert.equal(await page.locator('#performance-chart circle').count(), 2);
    assert.match(await page.locator('#chart-improvement').textContent(), /1.6%/);
    await page.locator('#results-event').selectOption('800m');
    assert.equal(await page.locator('#race-results tr').count(), 1);
    assert.match(await page.locator('#race-results').textContent(), /2:05.12/);
    await page.locator('#season-filter').selectOption('2025');
    assert.equal(await page.locator('#stat-results').textContent(), '1');
    assert.equal(await page.locator('#stat-prs').textContent(), '0');
    assert.equal(await page.locator('#chart-best').textContent(), '12.5s');
    await page.locator('#season-filter').selectOption('all');
    assert.equal(await page.locator('#race-results tr').count(), 8);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.TRACK_DASHBOARD_SCREENSHOTS) {
      await fs.mkdir('/tmp/track-dashboard-validation', { recursive: true });
      await page.locator('#season-filter').selectOption('2026');
      await page.screenshot({ path: '/tmp/track-dashboard-validation/desktop.png', fullPage: true });
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('dashboard validates times, saves to the current account, and survives reload', async () => {
  const saved = [];
  const { context, page, errors, calls } = await dashboardSetup((call) => {
    if (call.url.pathname !== '/rest/v1/race_results') return null;
    if (call.method === 'POST') {
      saved.push(call.body);
      return { status: 201, body: call.body };
    }
    return { status: 200, body: saved };
  });
  try {
    assert.equal(await page.locator('#stat-results').textContent(), '0');
    assert.match(await page.locator('#results-status').textContent(), /first race/);
    await page.locator('#log-result').click();
    await page.locator('#result-event').selectOption('1600m');
    await page.locator('#result-date').fill('2026-05-15');
    await page.locator('#result-meet').fill('  District Meet  ');
    await page.locator('#result-time').fill('5:75');
    await page.locator('#save-result').click();
    assert.equal(await page.locator('#result-time').evaluate((input) => input.validity.valid), false);
    assert.equal(calls.filter((call) => call.method === 'POST').length, 0);
    await page.locator('#result-time').fill('5:12.34');
    await page.locator('#save-result').click();
    await page.locator('#result-dialog').waitFor({ state: 'hidden' });
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0], { user_id: user.id, event: '1600m', race_date: '2026-05-15', time_seconds: 312.34, meet_name: 'District Meet' });
    assert.equal(await page.locator('#stat-results').textContent(), '1');
    assert.equal(await page.locator('#chart-best').textContent(), '5:12.34');
    assert.equal(await page.locator('#chart-event').inputValue(), '1600m');
    await page.reload();
    await page.locator('#results-wrap').waitFor({ state: 'visible' });
    assert.match(await page.locator('#race-results').textContent(), /District Meet/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('result errors preserve form input and allow a successful retry', async () => {
  let fail = true;
  const { context, page, errors, calls } = await dashboardSetup((call) => {
    if (call.url.pathname !== '/rest/v1/race_results') return null;
    if (call.method === 'POST') return fail
      ? { status: 403, body: { message: 'Permission denied', code: '42501' } }
      : { status: 201, body: call.body };
    return { status: 200, body: [] };
  });
  try {
    await page.locator('#log-result').click();
    await page.locator('#result-date').fill('2026-05-15');
    await page.locator('#result-meet').fill('City Invitational');
    await page.locator('#result-time').fill('11.84');
    await page.locator('#save-result').click();
    await page.locator('#save-error').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result-time').inputValue(), '11.84');
    assert.equal(await page.locator('#save-result').isEnabled(), true);
    assert.equal(await page.locator('#stat-results').textContent(), '0');
    fail = false;
    await page.locator('#save-result').click();
    await page.locator('#result-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#stat-results').textContent(), '1');
    assert.equal(calls.filter((call) => call.method === 'POST').length, 2);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('dashboard handles load errors, mobile layout, and keyboard dialog dismissal', async () => {
  let fail = true;
  const { context, page, errors } = await dashboardSetup((call) => call.url.pathname === '/rest/v1/race_results'
    ? fail ? { status: 403, body: { message: 'Permission denied', code: '42501' } } : { status: 200, body: seasonResults }
    : null, { width: 390, height: 844 });
  try {
    assert.equal(await page.locator('#retry-results').isVisible(), true);
    assert.equal(await page.locator('#log-result').isDisabled(), true);
    fail = false;
    await page.locator('#retry-results').click();
    await page.locator('#results-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#retry-results').isVisible(), false);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (process.env.TRACK_DASHBOARD_SCREENSHOTS) await page.screenshot({ path: '/tmp/track-dashboard-validation/mobile.png', fullPage: true });
    await page.locator('#log-result').click();
    assert.equal(await page.locator('#result-dialog').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#result-dialog').isVisible(), false);
    assert.equal(await page.locator('#log-result').evaluate((button) => button === document.activeElement), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
