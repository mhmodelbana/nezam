-- Run this file once in Supabase SQL Editor on the new project.
-- Never put the service-role key in the browser or in this repository.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'student')),
  student_id bigint unique,
  created_at timestamptz not null default now(),
  constraint profiles_role_student_link check (
    (role = 'admin' and student_id is null) or
    (role = 'student' and student_id is not null and student_id > 0)
  )
);

create table if not exists public.app_state (
  state_key text primary key check (state_key in (
    'vota-travel.students.v1',
    'vota-travel.terms.v1',
    'vota-travel.subscriptions.v1',
    'vota-travel.trip-schedules.v1',
    'vota-travel.trip-requests.v1'
  )),
  payload jsonb not null default '[]'::jsonb check (jsonb_typeof(payload) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create or replace function public.touch_app_state_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_state_touch_updated_at on public.app_state;
create trigger app_state_touch_updated_at
  before update on public.app_state
  for each row execute function public.touch_app_state_updated_at();

create or replace function public.is_vota_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.app_state enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
  on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_vota_admin());

drop policy if exists "app_state_admin_select" on public.app_state;
create policy "app_state_admin_select"
  on public.app_state for select to authenticated
  using (public.is_vota_admin());

drop policy if exists "app_state_admin_insert" on public.app_state;
create policy "app_state_admin_insert"
  on public.app_state for insert to authenticated
  with check (public.is_vota_admin() and updated_by = auth.uid());

drop policy if exists "app_state_admin_update" on public.app_state;
create policy "app_state_admin_update"
  on public.app_state for update to authenticated
  using (public.is_vota_admin())
  with check (public.is_vota_admin() and updated_by = auth.uid());

drop policy if exists "app_state_admin_delete" on public.app_state;
create policy "app_state_admin_delete"
  on public.app_state for delete to authenticated
  using (public.is_vota_admin());

revoke all on public.profiles, public.app_state from anon, public;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.app_state to authenticated;

create or replace function public.admin_save_state_batch(p_state jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item record;
begin
  if not public.is_vota_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if jsonb_typeof(p_state) is distinct from 'object' then
    raise exception 'Application state must be a JSON object.';
  end if;

  for v_item in select key, value from jsonb_each(p_state)
  loop
    if v_item.key not in (
      'vota-travel.students.v1',
      'vota-travel.terms.v1',
      'vota-travel.subscriptions.v1',
      'vota-travel.trip-schedules.v1',
      'vota-travel.trip-requests.v1'
    ) or jsonb_typeof(v_item.value) is distinct from 'array' then
      raise exception 'Application state key or value is invalid.';
    end if;

    insert into public.app_state (state_key, payload, updated_by)
    values (v_item.key, v_item.value, auth.uid())
    on conflict (state_key) do update
      set payload = excluded.payload,
          updated_by = excluded.updated_by;
  end loop;
end;
$$;

create or replace function public.student_portal_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_students jsonb := '[]'::jsonb;
  v_terms jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_schedules jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_student jsonb;
begin
  select * into v_profile
  from public.profiles
  where user_id = auth.uid() and role = 'student';

  if not found then
    raise exception 'Student account is not configured.';
  end if;

  select payload into v_students from public.app_state
  where state_key = 'vota-travel.students.v1';
  select payload into v_terms from public.app_state
  where state_key = 'vota-travel.terms.v1';
  select payload into v_subscriptions from public.app_state
  where state_key = 'vota-travel.subscriptions.v1';
  select payload into v_schedules from public.app_state
  where state_key = 'vota-travel.trip-schedules.v1';
  select payload into v_requests from public.app_state
  where state_key = 'vota-travel.trip-requests.v1';

  v_students := coalesce(v_students, '[]'::jsonb);
  v_terms := coalesce(v_terms, '[]'::jsonb);
  v_subscriptions := coalesce(v_subscriptions, '[]'::jsonb);
  v_schedules := coalesce(v_schedules, '[]'::jsonb);
  v_requests := coalesce(v_requests, '[]'::jsonb);

  select value into v_student
  from jsonb_array_elements(v_students)
  where value->>'id' = v_profile.student_id::text
  limit 1;

  if v_student is null or nullif(v_student->>'archivedAt', '') is not null then
    raise exception 'Student record is unavailable.';
  end if;

  v_student := (v_student - 'portalCredential') ||
    jsonb_build_object(
      'authUserId', v_profile.user_id,
      'mustChangePassword', coalesce((v_student->>'mustChangePassword')::boolean, false)
    );

  return jsonb_build_object(
    'student', v_student,
    'terms', v_terms,
    'subscriptions', coalesce((
      select jsonb_agg(value order by ordinality)
      from jsonb_array_elements(v_subscriptions) with ordinality
      where value->>'studentId' = v_profile.student_id::text
    ), '[]'::jsonb),
    'tripSchedules', v_schedules,
    'tripRequests', coalesce((
      select jsonb_agg(value order by ordinality)
      from jsonb_array_elements(v_requests) with ordinality
      where value->>'studentId' = v_profile.student_id::text
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.student_trip_action(
  p_action text,
  p_schedule_id bigint default null,
  p_trip_date date default null,
  p_request_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_student jsonb;
  v_students jsonb := '[]'::jsonb;
  v_terms jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_schedules jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_schedule jsonb;
  v_term jsonb;
  v_subscription jsonb;
  v_request jsonb;
  v_direction text;
  v_time text;
  v_trip_date date;
  v_start_date date;
  v_end_date date;
  v_new_id bigint;
begin
  select * into v_profile
  from public.profiles
  where user_id = auth.uid() and role = 'student';
  if not found then
    raise exception 'Student account is not configured.';
  end if;

  insert into public.app_state (state_key, payload)
  values ('vota-travel.trip-requests.v1', '[]'::jsonb)
  on conflict (state_key) do nothing;
  select payload into v_requests from public.app_state
  where state_key = 'vota-travel.trip-requests.v1'
  for update;
  select coalesce(payload, '[]'::jsonb) into v_students from public.app_state
  where state_key = 'vota-travel.students.v1';
  select coalesce(payload, '[]'::jsonb) into v_terms from public.app_state
  where state_key = 'vota-travel.terms.v1';
  select coalesce(payload, '[]'::jsonb) into v_subscriptions from public.app_state
  where state_key = 'vota-travel.subscriptions.v1';
  select coalesce(payload, '[]'::jsonb) into v_schedules from public.app_state
  where state_key = 'vota-travel.trip-schedules.v1';
  v_requests := coalesce(v_requests, '[]'::jsonb);
  v_students := coalesce(v_students, '[]'::jsonb);
  v_terms := coalesce(v_terms, '[]'::jsonb);
  v_subscriptions := coalesce(v_subscriptions, '[]'::jsonb);
  v_schedules := coalesce(v_schedules, '[]'::jsonb);

  select value into v_student
  from jsonb_array_elements(v_students)
  where value->>'id' = v_profile.student_id::text
  limit 1;
  if v_student is null or nullif(v_student->>'archivedAt', '') is not null then
    raise exception 'Student record is unavailable.';
  end if;

  if p_action = 'cancel' then
    if p_request_id is null or not exists (
      select 1 from jsonb_array_elements(v_requests) value
      where value->>'id' = p_request_id::text
        and value->>'studentId' = v_profile.student_id::text
        and value->>'status' in ('pending', 'approved')
    ) then
      raise exception 'Active trip registration was not found.';
    end if;

    select coalesce(jsonb_agg(
      case
        when value->>'id' = p_request_id::text
          and value->>'studentId' = v_profile.student_id::text
        then value || jsonb_build_object('status', 'cancelled')
        else value
      end order by ordinality
    ), '[]'::jsonb)
    into v_requests
    from jsonb_array_elements(v_requests) with ordinality;
  elsif p_action = 'book' then
    if p_trip_date is null or p_trip_date <> (now() at time zone 'Africa/Cairo')::date then
      raise exception 'Bookings are available for today only.';
    end if;

    select value into v_schedule
    from jsonb_array_elements(v_schedules)
    where value->>'id' = p_schedule_id::text
      and value->>'active' = 'true'
    limit 1;
    if v_schedule is null then
      raise exception 'This trip time is not available.';
    end if;
    v_direction := v_schedule->>'direction';
    v_time := v_schedule->>'time';
    if v_direction not in ('outbound', 'return') then
      raise exception 'Trip direction is invalid.';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(v_profile.student_id::text || ':' || p_trip_date::text || ':' || v_direction, 0)
    );
    if exists (
      select 1 from jsonb_array_elements(v_requests) value
      where value->>'studentId' = v_profile.student_id::text
        and value->>'tripDate' = p_trip_date::text
        and value->>'tripType' = v_direction
        and value->>'status' in ('pending', 'approved')
    ) then
      raise exception 'A registration already exists for this direction today.';
    end if;

    if v_student->>'subscription' is distinct from 'active' then
      raise exception 'An active subscription is required.';
    end if;
    select value into v_subscription
    from jsonb_array_elements(v_subscriptions)
    where value->>'studentId' = v_profile.student_id::text
      and value->>'termId' = v_student->>'termId'
    limit 1;
    select value into v_term
    from jsonb_array_elements(v_terms)
    where value->>'id' = v_student->>'termId'
    limit 1;
    v_start_date := coalesce(
      nullif(v_subscription->>'startDate', '')::date,
      nullif(v_term->>'startDate', '')::date
    );
    v_end_date := coalesce(
      nullif(v_subscription->>'endDate', '')::date,
      nullif(v_term->>'endDate', '')::date
    );
    if v_start_date is null or v_end_date is null
      or p_trip_date < v_start_date or p_trip_date > v_end_date then
      raise exception 'Subscription is not valid for this date.';
    end if;

    select coalesce(max((value->>'id')::bigint), 0) + 1 into v_new_id
    from jsonb_array_elements(v_requests);
    v_request := jsonb_build_object(
      'id', v_new_id,
      'studentId', v_profile.student_id,
      'studentName', v_student->>'name',
      'tripType', v_direction,
      'tripDate', p_trip_date,
      'tripTime', v_time,
      'scheduleId', p_schedule_id,
      'destination', v_student->>'pickup',
      'pickup', v_student->>'pickup',
      'notes', '',
      'status', 'approved',
      'createdAt', now()
    );
    v_requests := v_requests || jsonb_build_array(v_request);
  else
    raise exception 'Unsupported trip action.';
  end if;

  update public.app_state
  set payload = v_requests, updated_at = now()
  where state_key = 'vota-travel.trip-requests.v1';

  return jsonb_build_object(
    'tripRequests',
    coalesce((
      select jsonb_agg(value order by ordinality)
      from jsonb_array_elements(v_requests) with ordinality
      where value->>'studentId' = v_profile.student_id::text
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.student_complete_password_change()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_id bigint;
  v_students jsonb;
begin
  select student_id into v_student_id
  from public.profiles
  where user_id = auth.uid() and role = 'student';
  if v_student_id is null then
    raise exception 'Student account is not configured.';
  end if;

  select payload into v_students from public.app_state
  where state_key = 'vota-travel.students.v1'
  for update;
  if v_students is null then
    raise exception 'Student data is unavailable.';
  end if;

  select coalesce(jsonb_agg(
    case when value->>'id' = v_student_id::text
      then (value - 'portalCredential') || jsonb_build_object('mustChangePassword', false)
      else value
    end order by ordinality
  ), '[]'::jsonb)
  into v_students
  from jsonb_array_elements(v_students) with ordinality;

  update public.app_state
  set payload = v_students, updated_at = now(), updated_by = auth.uid()
  where state_key = 'vota-travel.students.v1';
end;
$$;

revoke all on function public.is_vota_admin() from public;
revoke all on function public.student_portal_bootstrap() from public;
revoke all on function public.student_trip_action(text, bigint, date, bigint) from public;
revoke all on function public.student_complete_password_change() from public;
revoke all on function public.admin_save_state_batch(jsonb) from public;
grant execute on function public.is_vota_admin() to authenticated;
grant execute on function public.student_portal_bootstrap() to authenticated;
grant execute on function public.student_trip_action(text, bigint, date, bigint) to authenticated;
grant execute on function public.student_complete_password_change() to authenticated;
grant execute on function public.admin_save_state_batch(jsonb) to authenticated;

-- Initial administrator setup:
-- 1. Create an administrator user in Authentication > Users.
-- 2. Run the following statement with that user's Auth UUID:
--    insert into public.profiles (user_id, role, student_id)
--    values ('AUTH-USER-UUID', 'admin', null);
