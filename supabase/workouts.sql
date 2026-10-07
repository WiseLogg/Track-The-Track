-- Community workouts. Apply once to the same project as supabase/setup.sql.
-- Authenticated athletes share workouts, likes, and comments; saves are private.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  builtin_key text unique,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 80),
  title text not null check (char_length(btrim(title)) between 3 and 100),
  description text not null check (char_length(btrim(description)) between 10 and 400),
  category text not null check (category in ('Speed', 'Intervals', 'Endurance', 'Hills', 'Recovery', 'Race prep')),
  difficulty text not null check (difficulty in ('Beginner', 'Intermediate', 'Advanced')),
  duration_minutes integer not null check (duration_minutes between 5 and 180),
  steps text not null check (char_length(btrim(steps)) between 20 and 6000),
  created_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('english', title || ' ' || description || ' ' || category || ' ' || author_name || ' ' || steps)
  ) stored,
  constraint workouts_source check ((user_id is null) = (builtin_key is not null))
);
create index workouts_user_id_idx on public.workouts(user_id);
create index workouts_created_at_idx on public.workouts(created_at desc, id);
create index workouts_search_idx on public.workouts using gin(search_vector);

create table public.workout_likes (
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (workout_id, user_id)
);
create index workout_likes_user_id_idx on public.workout_likes(user_id);

create table public.workout_favorites (
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (workout_id, user_id)
);
create index workout_favorites_user_id_idx on public.workout_favorites(user_id);

create table public.workout_comments (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index workout_comments_workout_date_idx on public.workout_comments(workout_id, created_at, id);
create index workout_comments_user_id_idx on public.workout_comments(user_id);

alter table public.workouts enable row level security;
alter table public.workout_likes enable row level security;
alter table public.workout_favorites enable row level security;
alter table public.workout_comments enable row level security;

create policy "Athletes can browse workouts" on public.workouts for select to authenticated using (true);
create policy "Athletes can publish their own workouts" on public.workouts for insert to authenticated
  with check ((select auth.uid()) = user_id and builtin_key is null);
create policy "Athletes can remove their own workouts" on public.workouts for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Athletes can see likes" on public.workout_likes for select to authenticated using (true);
create policy "Athletes can like as themselves" on public.workout_likes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Athletes can remove their own likes" on public.workout_likes for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Favorites are private" on public.workout_favorites for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Athletes can save as themselves" on public.workout_favorites for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Athletes can remove their own saves" on public.workout_favorites for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Athletes can read comments" on public.workout_comments for select to authenticated using (true);
create policy "Athletes can comment as themselves" on public.workout_comments for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Athletes can remove their own comments" on public.workout_comments for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.workouts, public.workout_likes, public.workout_favorites, public.workout_comments from anon, authenticated;
grant select, delete on public.workouts to authenticated;
grant insert (user_id, author_name, title, description, category, difficulty, duration_minutes, steps) on public.workouts to authenticated;
grant select, insert, delete on public.workout_likes, public.workout_favorites to authenticated;
grant select, delete on public.workout_comments to authenticated;
grant insert (workout_id, user_id, author_name, body) on public.workout_comments to authenticated;

-- One paginated request supplies counts and the caller's like/save state.
-- SECURITY INVOKER preserves RLS, including private favorites. No privileged key.
create function public.browse_workouts(
  search_text text default '', category_filter text default '', difficulty_filter text default '',
  collection text default 'all', sort_order text default 'newest', page_offset integer default 0,
  page_size integer default 12
)
returns table (
  id uuid, user_id uuid, author_name text, title text, description text, category text,
  difficulty text, duration_minutes integer, steps text, created_at timestamptz,
  is_builtin boolean, like_count bigint, comment_count bigint, liked boolean, saved boolean, total_count bigint
)
language sql stable security invoker set search_path = ''
as $$
  with filtered as (
    select w.* from public.workouts w
    where (coalesce(btrim(search_text), '') = '' or w.search_vector @@ websearch_to_tsquery('english', left(search_text, 200)))
      and (coalesce(category_filter, '') = '' or w.category = category_filter)
      and (coalesce(difficulty_filter, '') = '' or w.difficulty = difficulty_filter)
      and (collection = 'all'
        or (collection = 'mine' and w.user_id = (select auth.uid()))
        or (collection = 'saved' and exists (
          select 1 from public.workout_favorites f where f.workout_id = w.id and f.user_id = (select auth.uid())
        )))
  ), counted as (
    select w.*, (select count(*) from public.workout_likes l where l.workout_id = w.id) as likes,
      (select count(*) from public.workout_comments c where c.workout_id = w.id) as comments,
      count(*) over () as total
    from filtered w
  )
  select w.id, w.user_id, w.author_name, w.title, w.description, w.category, w.difficulty,
    w.duration_minutes, w.steps, w.created_at, w.builtin_key is not null, w.likes, w.comments,
    exists(select 1 from public.workout_likes l where l.workout_id = w.id and l.user_id = (select auth.uid())),
    exists(select 1 from public.workout_favorites f where f.workout_id = w.id and f.user_id = (select auth.uid())),
    w.total
  from counted w
  order by case when sort_order = 'popular' then w.likes end desc nulls last, w.created_at desc, w.id
  limit greatest(1, least(coalesce(page_size, 12), 48)) offset greatest(0, coalesce(page_offset, 0));
$$;
revoke execute on function public.browse_workouts(text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.browse_workouts(text, text, text, text, text, integer, integer) to authenticated;

-- Seed/update the 50 sessions separately using workout-library.sql.
-- Keeping library content separate allows safe updates without rerunning DDL.
