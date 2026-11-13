# Track The Track

A static running-season tracker built with HTML, CSS, and JavaScript, connected to Supabase and served through GitHub Pages.

See [RELEASE.md](RELEASE.md) for email-provider setup, moderator access, deployment, backups, and final real-user checks. The connected project already has the release database upgrade and account-deletion Edge Function. SMTP and a moderator account still need owner setup. Frontend changes must be committed and published before they appear on the live website.

## Authentication

- `signup.html`: creates an email/password account and stores the athlete's name as display metadata.
- `login.html`: signs in, requests password reset links, and accepts a new password from a recovery link.
- `dashboard.html`: validates the session with Supabase and shows season totals, event charts, all-time bests, and a filterable table. Athletes can log, edit, delete, and export private race results and notes. Changes recalculate charts and bests. The first release supports timed running events, hurdles, and relays.
- `dashboard.html?demo=1`: a fictional athlete’s season without registration. Try filters, charts, logging, editing, deletion, and CSV export. Changes stay in memory until reload; no Supabase client is created and no real session is changed.
- `settings.html`: update your display name, request a password reset, download your account data, or permanently delete your account after entering your password and typing DELETE. Assigned moderators also get a private report queue.
- `privacy.html`: explains private/shared data, browser storage, deletion, demo behavior, and community guidelines.
- `workouts.html`: signed-in workout library with Explore, Saved, and My workouts collections. Search session names, descriptions, plans, and display names; filter by type and difficulty, sort by newest or most liked, and browse paginated results. Athletes can publish session plans, save private favorites, like/unlike workouts, and post/delete their own comments. Owners can delete their workouts after confirmation.
- `auth.js`: shared client configuration using the public publishable key. Never add secret or service-role keys to this repository.
- `supabase/setup.sql`: creates the race-results table on a fresh project and sets ownership policies. RLS, rather than the static page redirect, protects user data. Display metadata is never used for authorization.
- `supabase/workouts.sql`: schema, indexed full-text search, RLS, and narrowly scoped grants, already applied to the connected project as `community_workouts_library`. For a fresh project, run this SQL once after `setup.sql`, then run `workout-library.sql`. Do not rerun the schema on the existing project. Workouts, author display names, likes, and comments are shared with signed-in athletes; favorites are private to their owner. Email addresses and race results are not exposed by this feature. `browse_workouts` uses SECURITY INVOKER, so RLS also applies to searches and counts.
- `supabase/workout-library.sql`: the canonical 50 original starter workouts across Speed, Intervals, Endurance, Hills, Recovery, and Race prep. All use self-paced instructions for solo or group training; no coach is required. These are adaptable session ideas, not personalized training plans. This repeatable SQL updates only built-in library content by stable key, preserving workout IDs, likes, favorites, comments, and creation dates. It never replaces or deletes community workouts. Run it using the Supabase SQL editor after changing the library content; no browser permissions or service keys are added.

- `supabase/release.sql`: adds race validation/indexing, account-deletion cascades, reporting/moderation, and database posting limits. For a fresh project run it once after setup, workouts, and the library. This upgrade is already applied to the connected project; do not rerun it there. Limits are 10 workouts, 60 comments, and 20 reports per account per clock hour, including requests outside the UI. Moderators are assigned in a private table, never through editable metadata.
- `supabase/functions/delete-account/`: verifies the caller’s token and current password, revokes refresh sessions, and deletes only the verified account. Privileged credentials exist only in the Supabase Edge runtime. Never add service-role keys, SMTP passwords, database credentials, or real user exports to this repository.

The missing race-results ownership index has been added. [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains disabled because it requires Pro or above; the project remains on Free. Unused-index notices are expected before regular traffic.

## Supabase URL configuration

In Authentication → URL Configuration, use:

- Site URL: `https://wiselogg.github.io/Track-The-Track/`
- Redirect URL: `https://wiselogg.github.io/Track-The-Track/login.html`

Email/password authentication is enabled, with email confirmation required. Confirmation and recovery emails need these URLs configured. If using Supabase's default email sender, delivery is restricted to authorized project members; configure custom SMTP before allowing general public registration.

## Development

Serve this folder over HTTP (for example, `python -m http.server 8000`). Local signup/recovery testing also requires the exact local login URL in Supabase's redirect allow list.

The committed browser SDK is built from the exact dependency version in `package.json` and `package-lock.json`. To rebuild it:

```sh
npm ci --ignore-scripts
npm run build
```

To run authentication, dashboard, and workout browser tests (requests are mocked; no real emails are sent):

```sh
npx playwright install --with-deps chromium
npm test
```

GitHub Pages serves the committed static files directly; no build server or private backend key is needed.

With Docker running, test actual PostgreSQL ownership, validation, moderation, posting limits, deletion, and dump/restore behavior:

```sh
npm run test:database
```

This creates a disposable PostgreSQL 17 container with no network or published ports. It builds the schema from scratch, verifies two-account isolation, restores a dump into another disposable database, and repeats the permission checks. It never connects to production. GitHub Actions runs browser/function tests and database tests for pushes and pull requests. Browser screenshots can be enabled with `TRACK_DASHBOARD_SCREENSHOTS=1`.
