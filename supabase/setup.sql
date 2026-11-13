-- Authenticated accounts can access only their own race results.
-- Apply to the existing Track-The-Track Supabase project.
begin;
create table if not exists public.race_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event text,
  race_date date,
  time_seconds numeric,
  meet_name text,
  notes text
);
alter table public.race_results enable row level security;
alter table public.race_results alter column user_id set default auth.uid();
revoke all privileges on table public.race_results from anon;
revoke truncate, references, trigger on table public.race_results from authenticated;
grant select, insert, update, delete on table public.race_results to authenticated;
drop policy if exists "race_results_select_own" on public.race_results;
drop policy if exists "race_results_insert_own" on public.race_results;
drop policy if exists "race_results_update_own" on public.race_results;
drop policy if exists "race_results_delete_own" on public.race_results;
create policy "race_results_select_own" on public.race_results
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "race_results_insert_own" on public.race_results
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "race_results_update_own" on public.race_results
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "race_results_delete_own" on public.race_results
  for delete to authenticated using ((select auth.uid()) = user_id);
commit;
