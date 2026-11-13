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
