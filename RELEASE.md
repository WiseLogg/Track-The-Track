# Releasing Track The Track

Finish email delivery and create your moderator account before opening community registration. The demo can be used for your school presentation without either step. No paid upgrade is required for the implemented features.

## Email delivery

Supabase’s default sender is for testing and only delivers to authorized project-team addresses. General signup and password resets need [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

1. Choose an email provider supporting SMTP. Supabase’s guide lists compatible providers. Verify your sender address or domain as required by the provider.
2. In Supabase, open **Authentication → Emails → SMTP Settings**. Enter the host, port, username, password, sender address, and sender name from your provider. Enter secrets there, never in HTML, GitHub issues, or chat.
3. Keep email confirmation enabled. In **Authentication → URL Configuration**, use:
   - Site URL: `https://wiselogg.github.io/Track-The-Track/`
   - Redirect URL: `https://wiselogg.github.io/Track-The-Track/login.html`
   - For local testing, add the exact local URL, such as `http://localhost:8000/login.html`.
4. Review the confirmation and recovery templates without removing their confirmation links.
5. Use a real address outside the Supabase team to test signup, confirmation resend, login, and password reset. Check spam folders and the provider’s delivery logs.

The resend button has a one-minute cooldown; Supabase’s server-side email limits still apply. Browser tests verify requests and callbacks, not actual email delivery. No provider account was created or SMTP credentials entered during this task.

## Moderator access

Sign up on the website and confirm your email. In the Supabase SQL editor, replace the example email and run:

```sql
insert into private.moderators (user_id)
select id from auth.users
where lower(email) = lower('your-confirmed-email@example.com')
  and email_confirmed_at is not null
on conflict do nothing;
```

Confirm the editor reports one inserted row, or check the table if the account was already added. Sign in and open **Account settings**: the Community reports panel should appear. Ordinary accounts must not see it. No moderator was assigned automatically.

Moderators can dismiss reports or remove community workouts/comments. Removing a workout also removes its comments, likes, and saves. Built-in sessions must be changed through `supabase/workout-library.sql`; the moderation endpoint prevents deleting them.

## Database setup and deployment

For a fresh Supabase project, run these SQL files once, in order:

1. `supabase/setup.sql`
2. `supabase/workouts.sql`
3. `supabase/workout-library.sql`
4. `supabase/release.sql`

The connected project already has these changes. Do not rerun the schema upgrades there. The library SQL can be rerun to update built-in content without replacing community workouts or changing session IDs.

Run the checks, review the changes, then commit and push the frontend. Confirm GitHub Pages publishes the intended branch and folder.

```sh
npm ci --ignore-scripts
npm run build
npx playwright install --with-deps chromium
npm test
npm run test:database
```

Database tests need Docker. GitHub Actions runs both groups and checks the vendored SDK. Open `dashboard.html?demo=1` on the deployed website before your presentation. Demo changes are fictional, temporary, and never sent to the database.

## Account deletion

The connected project has the deployed `delete-account` Edge Function. Source is under `supabase/functions/delete-account/`. It validates the bearer token with `Auth.getUser`, checks the caller’s current password, revokes refresh sessions, and deletes only the validated user ID. Database cascades remove owned content, private records, and private counters. Already-issued access tokens may remain cryptographically valid until expiry, as with other Supabase sign-outs; the deleted user’s database rows are removed.

The function uses `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` supplied inside the Edge runtime. No privileged key belongs in frontend code. `verify_jwt = false` in `supabase/config.toml` means authentication is performed inside the handler, supporting asymmetric as well as legacy tokens; anonymous deletion is still rejected.

The default allowed browser origin is `https://wiselogg.github.io`. For local tests or another host, set `ALLOWED_ORIGINS` in the function’s Supabase secrets settings to exact origins separated by commas, for example `https://wiselogg.github.io,http://localhost:8000`. Do not include a path or trailing slash.

For a different project, update the public configuration in `auth.js`, apply the fresh schema, and deploy the function source with the Supabase CLI. Start with `supabase --help` and `supabase functions deploy --help` for your installed version. Preserve the handler’s authentication and configuration when redeploying.

## Backups and recovery

Personal JSON/CSV downloads are useful copies, but cannot recreate login accounts or replace a complete database backup. They do not include authentication records or passwords.

For Free projects, Supabase recommends regular CLI exports stored off-site. Follow its current [backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for application schemas, provider-managed Auth data, and database roles. Start with `supabase --help` and `supabase db dump --help` for your installed version. Keep schema, roles, and data together; a data-only file cannot rebuild a fresh project.

Store backups encrypted in a private location outside this repository. Backups can contain private results and authentication data. `backups/`, `.env` files, and `.dump` files are ignored by Git. Record each backup’s date, project, schema/code revision, and restore result. Keep SMTP settings and Edge Function secrets separately in your provider or password manager.

Test restores in a disposable database or separate project. Do not restore onto a live project just to test. After recovery, verify login, private result access with two accounts, workout search, favorites, and reports. Redeploy the Edge Function and check SMTP/redirect settings: a database backup does not recreate every external setting.

`npm run test:database` performs a real PostgreSQL dump/restore and repeats ownership and moderation checks on the restored database. This verifies application-schema restore behavior in isolation. It does not mean a production backup was taken or hosted Supabase Auth recovery was tested.

## Final real-user checks

- Register two accounts and confirm both by email. Log, edit, reload, and delete a result; check charts and bests after each change.
- Confirm the second account cannot access the first account’s race results, notes, or saved favorites. Disposable database tests already verify the policies; also check the deployed app.
- Publish, like/save, comment on, and report a workout. Review the report with your moderator account.
- Inspect CSV/JSON downloads. Use a dedicated test account to verify permanent deletion after you no longer need its data.
- Try a real phone and another browser. Navigate with the keyboard, including Escape and focus returning after dialogs. Automated Chromium checks cover widths from 320px to 1440px; real Safari/Firefox testing remains useful.
- Check Supabase logs, Auth delivery logs, advisors, and usage before your presentation. Free projects may pause after low activity; open the app in advance and restore the project in Supabase if necessary. See the [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

Leaked-password protection remains an advisor warning because it requires [Pro or above](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The project remains on Free; no purchase or upgrade was made. Consider signup CAPTCHA if public traffic or spam warrants it; enabling a server requirement also needs the corresponding frontend flow.
