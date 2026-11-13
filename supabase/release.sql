-- Additive release upgrade. Run once after setup.sql and workouts.sql.
-- No existing race results or community content are deleted.
create index if not exists race_results_user_id_idx on public.race_results(user_id);
alter table public.race_results drop constraint race_results_user_id_fkey;
alter table public.race_results add constraint race_results_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
-- NOT VALID preserves legacy rows while enforcing validation on all new writes.
alter table public.race_results add constraint race_results_valid_input check (
  event is not null and char_length(btrim(event)) between 1 and 80
  and race_date is not null and race_date <= current_date
  and time_seconds is not null and time_seconds > 0 and time_seconds <= 86400
  and meet_name is not null and char_length(btrim(meet_name)) between 1 and 150
  and (notes is null or char_length(notes) <= 2000)
) not valid;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create table private.moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table private.moderators enable row level security;
create policy "No browser access" on private.moderators for all to anon, authenticated using (false) with check (false);
revoke all on private.moderators from public, anon, authenticated;

-- The only privileged lookup: a server-managed list, never user-editable metadata.
create function private.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from private.moderators where user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_moderator() from public, anon;
grant execute on function private.is_moderator() to authenticated;
create function public.is_moderator() returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.is_moderator();
$$;
revoke all on function public.is_moderator() from public, anon;
grant execute on function public.is_moderator() to authenticated;

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('workout', 'comment')),
  target_id uuid not null,
  reason text not null check (reason in ('Spam', 'Unsafe advice', 'Harassment', 'Other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'dismissed', 'removed')),
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
create index content_reports_target_idx on public.content_reports(target_type, target_id);
create index content_reports_status_idx on public.content_reports(status, created_at desc);
alter table public.content_reports enable row level security;
revoke all on public.content_reports from public, anon, authenticated;
grant select on public.content_reports to authenticated;
grant insert (user_id, target_type, target_id, reason, details) on public.content_reports to authenticated;
grant update (status) on public.content_reports to authenticated;
create policy "Reports visible to author and moderators" on public.content_reports for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_moderator()));
create policy "Athletes can report as themselves" on public.content_reports for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Moderators can resolve reports" on public.content_reports for update to authenticated
  using ((select private.is_moderator())) with check ((select private.is_moderator()));
drop policy "Athletes can remove their own workouts" on public.workouts;
create policy "Athletes can remove their own workouts" on public.workouts for delete to authenticated
  using ((select auth.uid()) = user_id or (builtin_key is null and (select private.is_moderator())));
drop policy "Athletes can remove their own comments" on public.workout_comments;
create policy "Athletes can remove their own comments" on public.workout_comments for delete to authenticated
  using ((select auth.uid()) = user_id or (select private.is_moderator()));

create function public.review_reports()
returns table (id uuid, target_type text, target_id uuid, reason text, details text, created_at timestamptz, preview text)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.target_type, r.target_id, r.reason, r.details, r.created_at,
    coalesce(w.title || ': ' || w.description, c.body, 'Content already removed')
  from public.content_reports r
  left join public.workouts w on r.target_type = 'workout' and r.target_id = w.id
  left join public.workout_comments c on r.target_type = 'comment' and r.target_id = c.id
  where r.status = 'open' and (select private.is_moderator())
  order by r.created_at, r.id limit 50;
$$;
create function public.resolve_content_report(report_id uuid, remove_content boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare report public.content_reports;
begin
  if not private.is_moderator() then raise insufficient_privilege; end if;
  select * into strict report from public.content_reports where id = report_id for update;
  if remove_content then
    if report.target_type = 'workout' then
      delete from public.workouts where id = report.target_id and builtin_key is null;
      if exists (select 1 from public.workouts where id = report.target_id) then
        raise exception 'Built-in sessions must be reviewed by the site owner in the SQL editor.';
      end if;
    else
      delete from public.workout_comments where id = report.target_id;
    end if;
  end if;
  update public.content_reports set status = case when remove_content then 'removed' else 'dismissed' end where id = report_id;
end;
$$;
revoke all on function public.review_reports(), public.resolve_content_report(uuid, boolean) from public, anon;
grant execute on function public.review_reports(), public.resolve_content_report(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
