begin;
insert into auth.users values ('10000000-0000-4000-8000-000000000001', 'a@example.invalid'), ('10000000-0000-4000-8000-000000000002', 'b@example.invalid');
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
insert into public.race_results (id,user_id,event,race_date,time_seconds,meet_name,notes) values
('20000000-0000-4000-8000-000000000001', auth.uid(), '100m', '2025-01-01', 12.34, 'Test meet', 'Private note');
insert into public.workouts (user_id,author_name,title,description,category,difficulty,duration_minutes,steps)
values (auth.uid(), 'Athlete A', 'Owned workout', 'An original test workout', 'Speed', 'Beginner', 30, 'Warm up, run gently, and cool down.');
insert into public.workout_favorites (workout_id,user_id) select id,auth.uid() from public.workouts where title='Owned workout';

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
do $$ begin
  if exists (select 1 from public.race_results) then raise exception 'Private race results leaked'; end if;
  if exists (select 1 from public.workout_favorites) then raise exception 'Private favorites leaked'; end if;
  update public.race_results set time_seconds=1;
  if found then raise exception 'Cross-account update allowed'; end if;
  delete from public.race_results;
  if found then raise exception 'Cross-account delete allowed'; end if;
  delete from public.workouts where title='Owned workout';
  if found then raise exception 'Cross-account workout deletion allowed'; end if;
  begin
    insert into public.race_results (user_id,event,race_date,time_seconds,meet_name) values ('10000000-0000-4000-8000-000000000001', '100m', '2025-01-01', 12,'Test');
    raise exception 'Forged ownership allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.race_results (user_id,event,race_date,time_seconds,meet_name) values (auth.uid(), '100m', '2025-01-01', -1,'Test');
    raise exception 'Invalid race time allowed';
  exception when check_violation then null; end;
  if public.is_moderator() then raise exception 'Moderator role leaked'; end if;
  begin
    insert into private.moderators values (auth.uid());
    raise exception 'Self-promotion allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.resolve_content_report(gen_random_uuid(), true);
    raise exception 'Non-moderator resolution allowed';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.content_reports (user_id,target_type,target_id,reason) select auth.uid(),'workout',id,'Spam' from public.workouts where title='Owned workout';
do $$ begin
  if (select count(*) from public.content_reports) <> 1 then raise exception 'Report insert failed'; end if;
  if exists (select 1 from public.review_reports()) then raise exception 'Non-moderator review allowed'; end if;
  begin
    update public.content_reports set status='removed';
    if found then raise exception 'Non-moderator changed status'; end if;
  exception when insufficient_privilege then null; end;
end $$;

-- Fixed-hour caps remain enforced even after deleting the newly created rows.
do $$ begin
  for n in 1..10 loop
    insert into public.workouts (user_id,author_name,title,description,category,difficulty,duration_minutes,steps)
    values (auth.uid(),'Athlete B','Rate test ' || n,'A valid test description','Speed','Beginner',30,'Warm up, run gently, and cool down.');
    delete from public.workouts where title='Rate test ' || n;
  end loop;
  begin
    insert into public.workouts (user_id,author_name,title,description,category,difficulty,duration_minutes,steps)
    values (auth.uid(),'Athlete B','Rate test exceeded','A valid test description','Speed','Beginner',30,'Warm up, run gently, and cool down.');
    raise exception 'Rate limit was bypassed' using errcode='23514';
  exception when raise_exception then
    if sqlerrm not like 'Hourly posting limit%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$ begin
  if exists (select 1 from public.content_reports) then raise exception 'Other user reports leaked'; end if;
  update public.race_results set time_seconds=11.84 where id='20000000-0000-4000-8000-000000000001';
  if not found then raise exception 'Owner edit failed'; end if;
  begin
    update public.race_results set user_id='10000000-0000-4000-8000-000000000002';
    raise exception 'Ownership reassignment allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into private.moderators values ('10000000-0000-4000-8000-000000000001');
set role authenticated;
do $$ declare report_id uuid; begin
  if not public.is_moderator() then raise exception 'Moderator lookup failed'; end if;
  select id into strict report_id from public.review_reports();
  perform public.resolve_content_report(report_id, true);
  if exists (select 1 from public.workouts where title='Owned workout') then raise exception 'Moderator removal failed'; end if;
  if exists (select 1 from public.review_reports()) then raise exception 'Resolved report still open'; end if;
end $$;
reset role;

-- Deletion cascades private race data as well as community ownership.
delete from auth.users where id='10000000-0000-4000-8000-000000000001';
do $$ begin
  if exists (select 1 from public.race_results) then raise exception 'Account data survived deletion'; end if;
  if exists (select 1 from private.moderators) then raise exception 'Deleted moderator survived'; end if;
end $$;
set role anon;
do $$ begin
  begin
    perform * from public.race_results;
    raise exception 'Anonymous access allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.browse_workouts();
    raise exception 'Anonymous workout browsing allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
