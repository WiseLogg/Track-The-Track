# Track The Track

A GitHub Pages website connected to the existing Track-The-Track Supabase project.

## Authentication

- `signup.html`: creates an email/password account and stores the athlete's name as display metadata.
- `login.html`: signs in, requests password reset links, and accepts a new password from a recovery link.
- `dashboard.html`: validates the session with Supabase and shows season totals, event progress charts, all-time personal bests, and a filterable results table. Athletes can log race times in seconds or minutes:seconds; results save to their own account. Includes sign-out and responsive layouts.
- `auth.js`: shared client configuration using the public publishable key. Never add secret or service-role keys to this repository.
- `supabase/setup.sql`: ownership policies applied to the existing `race_results` table. RLS, rather than the static page redirect, protects user data. Display metadata is never used for authorization.

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

To run the authentication browser tests (requests are mocked; no real emails are sent):

```sh
npx playwright install chromium
npm test
```

GitHub Pages serves the committed static files directly; no build server or private backend key is needed.
