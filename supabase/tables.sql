-- Run this file after setup.sql in the Supabase SQL Editor.

create table if not exists public.students (
  id bigint primary key generated always as identity,
  name text not null,
  phone text not null,
  pickup text not null,
  university text,
  faculty text,
  study_year text,
  emergency_phone text,
  subscription text not null default 'active'
    check (subscription in ('active', 'pending', 'paused', 'withdrawn', 'inactive', 'expired')),
  term_id bigint,
  notes text,
  archived_at timestamptz,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.terms (
  id bigint primary key generated always as identity,
  name text not null,
  academic_year text not null,
  price_cents bigint not null check (price_cents > 0),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date <= end_date)
);

create table if not exists public.subscriptions (
  id bigint primary key generated always as identity,
  student_id bigint not null references public.students(id) on delete cascade,
  term_id bigint not null references public.terms(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  price_cents bigint not null check (price_cents > 0),
  payments jsonb not null default '[]'::jsonb check (jsonb_typeof(payments) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date <= end_date),
  unique (student_id, term_id)
);

create table if not exists public.trip_schedules (
  id bigint primary key generated always as identity,
  direction text not null check (direction in ('outbound', 'return')),
  time text not null check (time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_requests (
  id bigint primary key generated always as identity,
  student_id bigint not null references public.students(id) on delete cascade,
  student_name text not null,
  trip_type text not null check (trip_type in ('outbound', 'return')),
  trip_date date not null,
  trip_time text not null check (trip_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  schedule_id bigint references public.trip_schedules(id) on delete set null,
  destination text not null,
  pickup text,
  notes text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_students_term_id on public.students(term_id);
create index if not exists idx_students_subscription on public.students(subscription);
create index if not exists idx_students_archived on public.students(archived_at);
create index if not exists idx_subscriptions_student_id on public.subscriptions(student_id);
create index if not exists idx_subscriptions_term_id on public.subscriptions(term_id);
create index if not exists idx_trip_requests_student_date
  on public.trip_requests(student_id, trip_date);
create index if not exists idx_trip_requests_status on public.trip_requests(status);
create unique index if not exists idx_trip_schedules_direction_time
  on public.trip_schedules(direction, time);
create unique index if not exists idx_trip_requests_one_active_direction_per_day
  on public.trip_requests(student_id, trip_date, trip_type)
  where status in ('pending', 'approved');

alter table public.students enable row level security;
alter table public.terms enable row level security;
alter table public.subscriptions enable row level security;
alter table public.trip_schedules enable row level security;
alter table public.trip_requests enable row level security;

drop policy if exists "students_admin_select" on public.students;
drop policy if exists "students_admin_insert" on public.students;
drop policy if exists "students_admin_update" on public.students;
drop policy if exists "students_admin_delete" on public.students;
drop policy if exists "students_student_select_own" on public.students;
create policy "students_admin_select" on public.students for select to authenticated
  using (public.is_vota_admin());
create policy "students_student_select_own" on public.students for select to authenticated
  using (id in (select student_id from public.profiles where user_id = auth.uid() and role = 'student'));
create policy "students_admin_insert" on public.students for insert to authenticated
  with check (public.is_vota_admin());
create policy "students_admin_update" on public.students for update to authenticated
  using (public.is_vota_admin()) with check (public.is_vota_admin());
create policy "students_admin_delete" on public.students for delete to authenticated
  using (public.is_vota_admin());

drop policy if exists "terms_admin_select" on public.terms;
drop policy if exists "terms_admin_insert" on public.terms;
drop policy if exists "terms_admin_update" on public.terms;
drop policy if exists "terms_admin_delete" on public.terms;
drop policy if exists "terms_authenticated_select" on public.terms;
create policy "terms_authenticated_select" on public.terms for select to authenticated
  using (true);
create policy "terms_admin_insert" on public.terms for insert to authenticated
  with check (public.is_vota_admin());
create policy "terms_admin_update" on public.terms for update to authenticated
  using (public.is_vota_admin()) with check (public.is_vota_admin());
create policy "terms_admin_delete" on public.terms for delete to authenticated
  using (public.is_vota_admin());

drop policy if exists "subscriptions_admin_select" on public.subscriptions;
drop policy if exists "subscriptions_admin_insert" on public.subscriptions;
drop policy if exists "subscriptions_admin_update" on public.subscriptions;
drop policy if exists "subscriptions_admin_delete" on public.subscriptions;
drop policy if exists "subscriptions_student_select_own" on public.subscriptions;
create policy "subscriptions_admin_select" on public.subscriptions for select to authenticated
  using (public.is_vota_admin());
create policy "subscriptions_student_select_own" on public.subscriptions for select to authenticated
  using (student_id in (select student_id from public.profiles where user_id = auth.uid() and role = 'student'));
create policy "subscriptions_admin_insert" on public.subscriptions for insert to authenticated
  with check (public.is_vota_admin());
create policy "subscriptions_admin_update" on public.subscriptions for update to authenticated
  using (public.is_vota_admin()) with check (public.is_vota_admin());
create policy "subscriptions_admin_delete" on public.subscriptions for delete to authenticated
  using (public.is_vota_admin());

drop policy if exists "trip_schedules_admin_select" on public.trip_schedules;
drop policy if exists "trip_schedules_admin_insert" on public.trip_schedules;
drop policy if exists "trip_schedules_admin_update" on public.trip_schedules;
drop policy if exists "trip_schedules_admin_delete" on public.trip_schedules;
drop policy if exists "trip_schedules_authenticated_select_active" on public.trip_schedules;
create policy "trip_schedules_admin_select" on public.trip_schedules for select to authenticated
  using (public.is_vota_admin());
create policy "trip_schedules_authenticated_select_active" on public.trip_schedules for select to authenticated
  using (active);
create policy "trip_schedules_admin_insert" on public.trip_schedules for insert to authenticated
  with check (public.is_vota_admin());
create policy "trip_schedules_admin_update" on public.trip_schedules for update to authenticated
  using (public.is_vota_admin()) with check (public.is_vota_admin());
create policy "trip_schedules_admin_delete" on public.trip_schedules for delete to authenticated
  using (public.is_vota_admin());

drop policy if exists "trip_requests_admin_select" on public.trip_requests;
drop policy if exists "trip_requests_student_select_own" on public.trip_requests;
drop policy if exists "trip_requests_admin_insert" on public.trip_requests;
drop policy if exists "trip_requests_admin_update" on public.trip_requests;
drop policy if exists "trip_requests_admin_delete" on public.trip_requests;
create policy "trip_requests_admin_select" on public.trip_requests for select to authenticated
  using (public.is_vota_admin());
create policy "trip_requests_student_select_own" on public.trip_requests for select to authenticated
  using (student_id in (select student_id from public.profiles where user_id = auth.uid() and role = 'student'));
create policy "trip_requests_admin_insert" on public.trip_requests for insert to authenticated
  with check (public.is_vota_admin());
create policy "trip_requests_admin_update" on public.trip_requests for update to authenticated
  using (public.is_vota_admin()) with check (public.is_vota_admin());
create policy "trip_requests_admin_delete" on public.trip_requests for delete to authenticated
  using (public.is_vota_admin());

revoke all on public.students, public.terms, public.subscriptions,
  public.trip_schedules, public.trip_requests from anon, public;
grant select, insert, update, delete on public.students, public.terms,
  public.subscriptions, public.trip_schedules, public.trip_requests to authenticated;
grant usage, select on sequence public.students_id_seq, public.terms_id_seq,
  public.subscriptions_id_seq, public.trip_schedules_id_seq, public.trip_requests_id_seq
  to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists students_touch_updated_at on public.students;
create trigger students_touch_updated_at before update on public.students
  for each row execute function public.touch_updated_at();
drop trigger if exists terms_touch_updated_at on public.terms;
create trigger terms_touch_updated_at before update on public.terms
  for each row execute function public.touch_updated_at();
drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at before update on public.subscriptions
  for each row execute function public.touch_updated_at();
drop trigger if exists trip_schedules_touch_updated_at on public.trip_schedules;
create trigger trip_schedules_touch_updated_at before update on public.trip_schedules
  for each row execute function public.touch_updated_at();
drop trigger if exists trip_requests_touch_updated_at on public.trip_requests;
create trigger trip_requests_touch_updated_at before update on public.trip_requests
  for each row execute function public.touch_updated_at();

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
  v_student_id bigint;
  v_student public.students%rowtype;
  v_schedule public.trip_schedules%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_term public.terms%rowtype;
  v_start_date date;
  v_end_date date;
begin
  select student_id into v_student_id
  from public.profiles
  where user_id = auth.uid() and role = 'student';
  if v_student_id is null then
    raise exception 'Student account is not configured.';
  end if;

  select * into v_student from public.students
  where id = v_student_id and archived_at is null;
  if not found then
    raise exception 'Student record is unavailable.';
  end if;

  if p_action = 'cancel' then
    update public.trip_requests
    set status = 'cancelled'
    where id = p_request_id
      and student_id = v_student_id
      and status in ('pending', 'approved');
    if not found then
      raise exception 'Active trip registration was not found.';
    end if;
  elsif p_action = 'book' then
    if p_trip_date is null or p_trip_date <> (now() at time zone 'Africa/Cairo')::date then
      raise exception 'Bookings are available for today only.';
    end if;

    select * into v_schedule from public.trip_schedules
    where id = p_schedule_id and active;
    if not found then
      raise exception 'This trip time is not available.';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(v_student_id::text || ':' || p_trip_date::text || ':' || v_schedule.direction, 0)
    );
    if exists (
      select 1 from public.trip_requests
      where student_id = v_student_id
        and trip_date = p_trip_date
        and trip_type = v_schedule.direction
        and status in ('pending', 'approved')
    ) then
      raise exception 'A registration already exists for this direction today.';
    end if;

    if v_student.subscription <> 'active' or v_student.term_id is null then
      raise exception 'An active subscription is required.';
    end if;

    select * into v_subscription from public.subscriptions
    where student_id = v_student_id and term_id = v_student.term_id
    limit 1;
    select * into v_term from public.terms where id = v_student.term_id;
    v_start_date := coalesce(v_subscription.start_date, v_term.start_date);
    v_end_date := coalesce(v_subscription.end_date, v_term.end_date);
    if v_start_date is null or v_end_date is null then
      raise exception 'Subscription dates are unavailable.';
    end if;

    if p_trip_date < v_start_date or p_trip_date > v_end_date then
      raise exception 'Subscription is not valid for this date.';
    end if;

    insert into public.trip_requests (
      student_id, student_name, trip_type, trip_date, trip_time, schedule_id,
      destination, pickup, notes, status
    ) values (
      v_student_id, v_student.name, v_schedule.direction, p_trip_date, v_schedule.time,
      v_schedule.id, v_student.pickup, v_student.pickup, '', 'approved'
    );
  else
    raise exception 'Unsupported trip action.';
  end if;

  return jsonb_build_object(
    'tripRequests',
    coalesce((
      select jsonb_agg(to_jsonb(request) order by request.created_at desc)
      from public.trip_requests request
      where request.student_id = v_student_id
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
begin
  select student_id into v_student_id
  from public.profiles
  where user_id = auth.uid() and role = 'student';
  if v_student_id is null then
    raise exception 'Student account is not configured.';
  end if;

  update public.students
  set must_change_password = false
  where id = v_student_id and archived_at is null;
  if not found then
    raise exception 'Student record is unavailable.';
  end if;
end;
$$;

revoke all on function public.student_trip_action(text, bigint, date, bigint) from public, anon;
revoke all on function public.student_complete_password_change() from public, anon;
grant execute on function public.student_trip_action(text, bigint, date, bigint) to authenticated;
grant execute on function public.student_complete_password_change() to authenticated;
