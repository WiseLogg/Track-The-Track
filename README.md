# Track The Track

A GitHub Pages website connected to the existing Track-The-Track Supabase project.

## Authentication

- `signup.html`: creates an email/password account and stores the athlete's name as display metadata.
- `login.html`: signs in, requests password reset links, and accepts a new password from a recovery link.
- `dashboard.html`: validates the session with Supabase and shows season totals, event progress charts, all-time personal bests, and a filterable results table. Athletes can log race times in seconds or minutes:seconds; results save to their own account. Includes sign-out and responsive layouts.
- `workouts.html`: signed-in workout library with Explore, Saved, and My workouts collections. Search session names, descriptions, plans, and display names; filter by type and difficulty, sort by newest or most liked, and browse paginated results. Athletes can publish session plans, save private favorites, like/unlike workouts, and post/delete their own comments. Owners can delete their workouts after confirmation.
- `auth.js`: shared client configuration using the public publishable key. Never add secret or service-role keys to this repository.
- `supabase/setup.sql`: ownership policies applied to the existing `race_results` table. RLS, rather than the static page redirect, protects user data. Display metadata is never used for authorization.
- `supabase/workouts.sql`: schema, indexed full-text search, RLS, and narrowly scoped grants, already applied to the connected project as `community_workouts_library`. For a fresh project, run this SQL once after `setup.sql`, then run `workout-library.sql`. Do not rerun the schema on the existing project. Workouts, author display names, likes, and comments are shared with signed-in athletes; favorites are private to their owner. Email addresses and race results are not exposed by this feature. `browse_workouts` uses SECURITY INVOKER, so RLS also applies to searches and counts.
- `supabase/workout-library.sql`: the canonical 50 original starter workouts across Speed, Intervals, Endurance, Hills, Recovery, and Race prep. All use self-paced instructions for solo or group training; no coach is required. These are adaptable session ideas, not personalized training plans. This repeatable SQL updates only built-in library content by stable key, preserving workout IDs, likes, favorites, comments, and creation dates. It never replaces or deletes community workouts. Run it using the Supabase SQL editor after changing the library content; no browser permissions or service keys are added.

The database advisor reports no workout-specific security warnings. Existing project settings still have [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); review that setting before public launch. The existing race-results table also has an [unindexed user foreign key](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). New workout tables have ownership, relationship, and search indexes; unused-index notices are expected until those tables see traffic.

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
npx playwright install chromium
npm test
```

GitHub Pages serves the committed static files directly; no build server or private backend key is needed.
