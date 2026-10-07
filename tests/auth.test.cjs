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
    const response = await handler(call) || (url.pathname === '/auth/v1/user'
      ? { status: 200, body: user }
      : url.pathname === '/rest/v1/race_results'
        ? { status: 200, body: [{ event: '400m', race_date: '2026-05-22', time_seconds: 56.7, meet_name: 'Spring meet' }] }
        : { status: 200, body: {} });
    await route.fulfill({ status: response.status, contentType: 'application/json', headers: { 'x-supabase-api-version': '2024-01-01', ...response.headers }, body: JSON.stringify(response.body) });
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

function workoutFixture() {
  const workouts = Array.from({ length: 25 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, user_id: i === 0 ? user.id : null,
    author_name: i === 0 ? 'Logan' : 'Track The Track', title: i === 0 ? 'My hill repeats' : `Running session ${i + 1}`,
    description: 'A controlled running session with plenty of easy recovery.',
    category: i % 2 ? 'Speed' : 'Hills', difficulty: i % 3 ? 'Intermediate' : 'Beginner', duration_minutes: 30,
    steps: 'Warm up easily for 10 minutes.\nRun 4 relaxed repetitions with walking recovery.\nCool down easily for 10 minutes.',
    created_at: new Date(Date.UTC(2026, 4, 25 - i)).toISOString(), is_builtin: i !== 0,
  }));
  const likes = new Set(), saves = new Set(), comments = [];
  let fail = '';
  const handler = (call) => {
    const endpoint = call.url.pathname.replace('/rest/v1/', '');
    if (endpoint === fail) return { status: 403, body: { message: 'Permission denied', code: '42501' } };
    if (endpoint === 'rpc/browse_workouts') {
      const b = call.body;
      let found = workouts.filter((w) => (!b.category_filter || w.category === b.category_filter)
        && (!b.difficulty_filter || w.difficulty === b.difficulty_filter)
        && (!b.search_text || `${w.title} ${w.author_name}`.toLowerCase().includes(b.search_text.toLowerCase()))
        && (b.collection !== 'saved' || saves.has(w.id)) && (b.collection !== 'mine' || w.user_id === user.id));
      if (b.sort_order === 'popular') found.sort((a, b) => Number(likes.has(b.id)) - Number(likes.has(a.id)));
      return { status: 200, body: found.slice(b.page_offset, b.page_offset + b.page_size).map((w) => ({ ...w,
        liked: likes.has(w.id), saved: saves.has(w.id), like_count: Number(likes.has(w.id)),
        comment_count: comments.filter((c) => c.workout_id === w.id).length, total_count: found.length,
      })) };
    }
    if (endpoint === 'workout_likes' || endpoint === 'workout_favorites') {
      const values = endpoint === 'workout_likes' ? likes : saves;
      if (call.method === 'POST') values.add(call.body.workout_id);
      if (call.method === 'DELETE') values.delete(call.url.searchParams.get('workout_id').slice(3));
      return { status: 200, body: null };
    }
    if (endpoint === 'workouts' && call.method === 'POST') {
      workouts.unshift({ ...call.body, id: '10000000-0000-4000-8000-000000000001', created_at: new Date().toISOString(), is_builtin: false });
      return { status: 201, body: null };
    }
    if (endpoint === 'workouts' && call.method === 'DELETE') {
      const index = workouts.findIndex((w) => w.id === call.url.searchParams.get('id').slice(3));
      workouts.splice(index, 1);
      return { status: 200, body: null };
    }
    if (endpoint === 'workout_comments') {
      if (call.method === 'POST') {
        comments.unshift({ ...call.body, id: `comment-${comments.length + 1}`, created_at: new Date().toISOString() });
        return { status: 201, body: null };
      }
      if (call.method === 'DELETE') {
        const index = comments.findIndex((c) => c.id === call.url.searchParams.get('id').slice(3));
        comments.splice(index, 1);
        return { status: 200, body: null };
      }
      const found = comments.filter((c) => c.workout_id === call.url.searchParams.get('workout_id').slice(3));
      const start = Number(call.url.searchParams.get('offset') || 0), limit = Number(call.url.searchParams.get('limit') || 20);
      return { status: 200, body: found.slice(start, start + limit), headers: { 'content-range': `${start}-${Math.min(start + limit, found.length) - 1}/${found.length}` } };
    }
    return null;
  };
  return { workouts, likes, saves, comments, handler, fail: (endpoint) => { fail = endpoint; } };
}

async function workoutsSetup(handler, viewport) {
  const result = await setup(handler, viewport);
  await result.context.addInitScript((stored) => localStorage.setItem('track-the-track.auth', JSON.stringify(stored)), {
    ...session, expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  await result.page.goto(`${origin}/workouts.html`);
  await result.page.waitForFunction(() => document.querySelector('#workout-results').getAttribute('aria-busy') === 'false');
  return result;
}

const libraryIdle = (page) => page.waitForFunction(() => document.querySelector('#workout-results').getAttribute('aria-busy') === 'false');

async function starterLibrary() {
  const sql = await fs.readFile(path.join(root, 'supabase/workout-library.sql'), 'utf8');
  // Match the canonical one-row-per-line SQL data, including escaped apostrophes.
  const pattern = /^\('((?:''|[^'])*)', 'Track The Track', '((?:''|[^'])*)', '((?:''|[^'])*)', '((?:''|[^'])*)', '((?:''|[^'])*)', (\d+), E'((?:''|[^'])*)'\),?$/gm;
  return [...sql.matchAll(pattern)].map((row, i) => ({
    id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, user_id: null, is_builtin: true,
    builtin_key: row[1], author_name: 'Track The Track', title: row[2].replaceAll("''", "'"),
    description: row[3].replaceAll("''", "'"), category: row[4], difficulty: row[5],
    duration_minutes: Number(row[6]), steps: row[7].replaceAll('\\n', '\n').replaceAll("''", "'"),
    created_at: '2026-10-07T12:00:00Z',
  }));
}

test('starter library contains 50 unique complete self-paced running workouts', async () => {
  const workouts = await starterLibrary();
  assert.equal(workouts.length, 50);
  assert.equal(new Set(workouts.map((w) => w.builtin_key)).size, 50);
  assert.equal(new Set(workouts.map((w) => w.title)).size, 50);
  assert.deepEqual(new Set(workouts.map((w) => w.category)), new Set(['Speed', 'Intervals', 'Endurance', 'Hills', 'Recovery', 'Race prep']));
  assert.deepEqual(new Set(workouts.map((w) => w.difficulty)), new Set(['Beginner', 'Intermediate', 'Advanced']));
  for (const workout of workouts) {
    assert.ok(workout.title.length >= 3 && workout.title.length <= 100, workout.title);
    assert.ok(workout.description.length >= 10 && workout.description.length <= 400, workout.title);
    assert.ok(workout.duration_minutes >= 5 && workout.duration_minutes <= 180, workout.title);
    assert.ok(workout.steps.length >= 20 && workout.steps.length <= 6000, workout.title);
    assert.ok(workout.steps.split('\n').length >= 4, workout.title);
    assert.match(workout.steps.split('\n').slice(0, 2).join(' '), /warm.?up|begin with|start with|\bwalk(?:ing)?\b|\bjog(?:ging)?\b/i, workout.title);
    // A race-day warm-up leads into the race, not an immediate cool-down.
    if (workout.builtin_key === 'warmup-routine') {
      assert.equal(workout.category, 'Race prep');
      assert.match(workout.steps, /before the start/i);
    } else {
      assert.match(workout.steps, /cool.?down|finish with|to finish|final .*minutes/i, workout.title);
    }
    assert.doesNotMatch(`${workout.description} ${workout.steps}`, /coach/i, workout.title);
  }
});

test('all 50 starter workouts are reachable across five pages and suit solo training', async () => {
  const fixture = workoutFixture();
  fixture.workouts.splice(0, fixture.workouts.length, ...await starterLibrary());
  const { context, page, errors } = await workoutsSetup(fixture.handler);
  try {
    const visited = new Set();
    assert.equal(await page.locator('#workout-count').textContent(), '50 workouts');
    assert.match(await page.locator('.workout-banner').textContent(), /50 starter sessions/);
    assert.match(await page.locator('.training-note').textContent(), /no coach required/i);
    for (let number = 1; number <= 5; number++) {
      assert.equal(await page.locator('#page-label').textContent(), `Page ${number} of 5`);
      assert.equal(await page.locator('.workout-card').count(), number === 5 ? 2 : 12);
      for (const title of await page.locator('.workout-title-button').allTextContents()) visited.add(title);
      if (number < 5) { await page.locator('#next-page').click(); await libraryIdle(page); }
    }
    assert.equal(visited.size, 50);
    assert.equal(await page.locator('#next-page').isDisabled(), true);
    await page.locator('.workout-title-button').last().click();
    assert.equal(await page.locator('#detail-title').textContent(), 'Controlled distance pacing rehearsal');
    assert.match(await page.locator('#detail-steps').textContent(), /controlled effort/);
    assert.equal(await page.locator('#delete-workout').isVisible(), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('Workouts is linked from the dashboard and requires sign-in', async () => {
  const { context, page, errors } = await setup();
  try {
    await page.goto(`${origin}/workouts.html`);
    await page.waitForURL('**/login.html');
    const dashboard = await page.request.get(`${origin}/dashboard.html`);
    assert.match(await dashboard.text(), /href="workouts\.html"/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('workouts search, filters, sorting, collections, and pagination query the server', async () => {
  const fixture = workoutFixture();
  const { context, page, calls, errors } = await workoutsSetup(fixture.handler);
  try {
    assert.equal(await page.locator('.workout-card').count(), 12);
    assert.equal(await page.locator('#workout-count').textContent(), '25 workouts');
    await page.locator('#next-page').click(); await libraryIdle(page);
    assert.equal(await page.locator('#page-label').textContent(), 'Page 2 of 3');
    await page.locator('#next-page').click(); await libraryIdle(page);
    assert.equal(await page.locator('.workout-card').count(), 1);
    assert.equal(await page.locator('#next-page').isDisabled(), true);
    await page.locator('#previous-page').click(); await libraryIdle(page);
    await page.locator('#workout-search').fill('hill');
    await page.locator('#search-form button').click(); await libraryIdle(page);
    assert.equal(await page.locator('.workout-card').count(), 1);
    await page.locator('#category-filter').selectOption('Speed'); await libraryIdle(page);
    assert.match(await page.locator('#library-status').textContent(), /No workouts match/);
    await page.locator('#clear-filters').click(); await libraryIdle(page);
    await page.locator('#difficulty-filter').selectOption('Beginner'); await libraryIdle(page);
    assert.equal(await page.locator('.workout-card').count(), 9);
    await page.locator('#sort-order').selectOption('popular'); await libraryIdle(page);
    const query = calls.filter((c) => c.url.pathname.endsWith('rpc/browse_workouts')).at(-1).body;
    assert.deepEqual(query, { search_text: '', category_filter: '', difficulty_filter: 'Beginner', collection: 'all', sort_order: 'popular', page_offset: 0, page_size: 12 });
    await page.locator('#difficulty-filter').selectOption(''); await libraryIdle(page);
    await page.locator('[data-collection="saved"]').click(); await libraryIdle(page);
    assert.match(await page.locator('#library-status').textContent(), /favorites/);
    await page.locator('[data-collection="mine"]').click(); await libraryIdle(page);
    assert.equal(await page.locator('.workout-card').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('likes and favorites persist across reload and can be removed', async () => {
  const fixture = workoutFixture();
  const { context, page, calls, errors } = await workoutsSetup(fixture.handler);
  try {
    const first = page.locator('.workout-card').first();
    await first.locator('[data-action="like"]').click();
    await page.waitForFunction(() => document.querySelector('[data-action="like"]').getAttribute('aria-pressed') === 'true');
    await first.locator('[data-action="save"]').click();
    await page.waitForFunction(() => document.querySelector('[data-action="save"]').getAttribute('aria-pressed') === 'true');
    await page.reload(); await libraryIdle(page);
    assert.equal(await first.locator('[data-action="like"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await first.locator('[data-action="save"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-collection="saved"]').click(); await libraryIdle(page);
    assert.equal(await page.locator('.workout-card').count(), 1);
    await first.locator('[data-action="save"]').click();
    await page.waitForFunction(() => document.querySelector('#workout-count').textContent === '0 workouts');
    assert.equal(fixture.saves.size, 0);
    await page.locator('[data-collection="all"]').click(); await libraryIdle(page);
    await first.locator('[data-action="like"]').click();
    await page.waitForFunction(() => document.querySelector('[data-action="like"]').getAttribute('aria-pressed') === 'false');
    for (const call of calls.filter((c) => c.method === 'POST' && /workout_(likes|favorites)$/.test(c.url.pathname))) assert.equal(call.body.user_id, user.id);
    assert.equal(fixture.likes.size, 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('workout load and action failures offer retry without showing false success', async () => {
  const fixture = workoutFixture(); fixture.fail('rpc/browse_workouts');
  const { context, page, errors } = await workoutsSetup(fixture.handler);
  try {
    assert.equal(await page.locator('#retry-workouts').isVisible(), true);
    fixture.fail(''); await page.locator('#retry-workouts').click(); await libraryIdle(page);
    fixture.fail('workout_likes');
    const like = page.locator('.workout-card').first().locator('[data-action="like"]');
    await like.click();
    await page.waitForFunction(() => document.querySelector('#workout-feedback').textContent.includes('couldn’t'));
    assert.equal(await like.getAttribute('aria-pressed'), 'false');
    assert.equal(await like.isEnabled(), true);
    fixture.fail(''); await like.click();
    await page.waitForFunction(() => document.querySelector('[data-action="like"]').getAttribute('aria-pressed') === 'true');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('athletes can publish a workout; failed publishing preserves their draft', async () => {
  const fixture = workoutFixture();
  const { context, page, calls, errors } = await workoutsSetup(fixture.handler);
  try {
    await page.locator('#create-workout').click();
    await page.locator('#workout-title').fill('  My easy interval session  ');
    await page.locator('#workout-category').selectOption('Intervals');
    await page.locator('#workout-difficulty').selectOption('Beginner');
    await page.locator('#workout-duration').fill('30');
    await page.locator('#workout-description').fill('Easy intervals with generous walking recovery.');
    await page.locator('#workout-steps').fill('Warm up with easy jogging.\nRun 4 gentle repetitions with full recovery.\nCool down with walking.');
    fixture.fail('workouts'); await page.locator('#publish-workout').click();
    await page.locator('#create-error').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#publish-workout').isEnabled(), true);
    assert.equal(await page.locator('#workout-duration').inputValue(), '30');
    fixture.fail(''); await page.locator('#publish-workout').click();
    await page.locator('#create-dialog').waitFor({ state: 'hidden' }); await libraryIdle(page);
    assert.equal(await page.locator('[data-collection="mine"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#workout-grid').textContent(), /My easy interval session/);
    const payload = calls.filter((c) => c.url.pathname === '/rest/v1/workouts' && c.method === 'POST').at(-1).body;
    assert.equal(payload.user_id, user.id); assert.equal(payload.author_name, 'Logan');
    assert.equal(payload.title, 'My easy interval session'); assert.equal(payload.duration_minutes, 30);
    await page.reload(); await libraryIdle(page);
    assert.match(await page.locator('#workout-grid').textContent(), /My easy interval session/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('comments are paginated, persistent, safe text, and only owners get delete controls', async () => {
  const fixture = workoutFixture();
  fixture.comments.push(...Array.from({ length: 23 }, (_, i) => ({ id: `other-${i}`, workout_id: fixture.workouts[0].id, user_id: 'another-athlete',
    author_name: 'Another athlete', body: `Useful session ${i + 1}`, created_at: '2026-05-01T12:00:00Z' })));
  const { context, page, calls, errors } = await workoutsSetup(fixture.handler);
  try {
    await page.locator('.workout-card').first().locator('[data-action="comments"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.comment').length === 20);
    assert.equal(await page.locator('.comment button').count(), 0);
    await page.locator('#more-comments').click();
    await page.waitForFunction(() => document.querySelectorAll('.comment').length === 23);
    fixture.fail('workout_comments');
    await page.locator('#comment-body').fill('<img src=x onerror="window.hacked=true"> Great workout!');
    await page.locator('#post-comment').click();
    await page.waitForFunction(() => document.querySelector('#detail-feedback').textContent.includes('couldn’t'));
    assert.equal(await page.locator('#post-comment').isEnabled(), true);
    assert.match(await page.locator('#comment-body').inputValue(), /Great workout/);
    fixture.fail(''); await page.locator('#post-comment').click();
    await page.waitForFunction(() => document.querySelector('#detail-feedback').textContent.includes('posted'));
    await page.waitForFunction(() => document.querySelector('.comment').textContent.includes('Great workout'));
    assert.equal(await page.locator('.comment img').count(), 0);
    assert.equal(await page.evaluate(() => window.hacked), undefined);
    const post = calls.filter((c) => c.url.pathname.endsWith('workout_comments') && c.method === 'POST').at(-1);
    assert.equal(post.body.user_id, user.id);
    assert.equal(await page.locator('.comment button').count(), 1);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.comment button').click();
    await page.waitForFunction(() => document.querySelector('#detail-feedback').textContent.includes('deleted'));
    await page.waitForFunction(() => document.querySelector('#comment-count').textContent === '23 total');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('only own workouts can be deleted; starter sessions have no delete control', async () => {
  const fixture = workoutFixture();
  const { context, page, calls, errors } = await workoutsSetup(fixture.handler);
  try {
    await page.locator('.workout-title-button').nth(1).click();
    assert.equal(await page.locator('#delete-workout').isVisible(), false);
    await page.keyboard.press('Escape');
    await page.locator('.workout-title-button').first().click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#delete-workout').click();
    await page.locator('#detail-dialog').waitFor({ state: 'hidden' }); await libraryIdle(page);
    assert.equal(fixture.workouts.length, 24);
    const call = calls.find((c) => c.url.pathname === '/rest/v1/workouts' && c.method === 'DELETE');
    assert.equal(call.url.searchParams.get('user_id'), `eq.${user.id}`);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('workouts and dialogs fit mobile screens and support keyboard dismissal', async () => {
  const fixture = workoutFixture();
  const { context, page, errors } = await workoutsSetup(fixture.handler);
  try {
    if (process.env.TRACK_DASHBOARD_SCREENSHOTS) {
      await fs.mkdir('/tmp/track-workouts-validation', { recursive: true });
      await page.screenshot({ path: '/tmp/track-workouts-validation/desktop.png', fullPage: true });
    }
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
      if (width < 900) await page.waitForFunction(() => {
        const nav = document.querySelector('.dashboard-nav').getBoundingClientRect();
        const active = document.querySelector('.dashboard-nav [aria-current="page"]').getBoundingClientRect();
        return active.left >= nav.left && active.right <= nav.right + 1;
      });
      await page.locator('.workout-title-button').first().click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('.workout-title-button') === document.activeElement);
      assert.equal(await page.locator('.workout-title-button').first().evaluate((button) => button === document.activeElement), true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (process.env.TRACK_DASHBOARD_SCREENSHOTS) await page.screenshot({ path: '/tmp/track-workouts-validation/mobile.png', fullPage: true });
    await page.locator('#create-workout').click(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#create-dialog').isVisible(), false);
    await page.locator('#sign-out').click(); await page.waitForURL('**/login.html');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
