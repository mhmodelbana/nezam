-- Create separate tables for Vota Travel data
-- Run this in Supabase SQL Editor after setup.sql

-- Students table
create table if not exists public.students (
  id bigint primary key generated always as identity,
  name text not null,
  phone text not null,
  pickup text not null,
  university text,
  faculty text,
  study_year text,
  emergency_phone text,
  subscription text not null default 'active' check (subscription in ('active', 'pending', 'paused', 'withdrawn', 'inactive', 'expired')),
  term_id bigint,
  notes text,
  archived_at timestamptz,
  must_change_password boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Terms table
create table if not exists public.terms (
  id bigint primary key generated always as identity,
  name text not null,
  academic_year text not null,
  price_cents bigint not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Subscriptions table
create table if not exists public.subscriptions (
  id bigint primary key generated always as identity,
  student_id bigint not null references public.students(id) on delete cascade,
  term_id bigint not null references public.terms(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  price_cents bigint not null,
  payments jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trip schedules table
create table if not exists public.trip_schedules (
  id bigint primary key generated always as identity,
  direction text not null check (direction in ('outbound', 'return')),
  time text not null check (time ~ '^\d{2}:\d{2}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trip requests table
create table if not exists public.trip_requests (
  id bigint primary key generated always as identity,
  student_id bigint not null references public.students(id) on delete cascade,
  student_name text not null,
  trip_type text not null check (trip_type in ('outbound', 'return')),
  trip_date date not null,
  trip_time text not null,
  schedule_id bigint references public.trip_schedules(id) on delete set null,
  destination text not null,
  pickup text,
  notes text default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create indexes for better performance
create index if not exists idx_students_term_id on public.students(term_id);
create index if not exists idx_students_subscription on public.students(subscription);
create index if not exists idx_students_archived on public.students(archived_at);
create index if not exists idx_subscriptions_student_id on public.subscriptions(student_id);
create index if not exists idx_subscriptions_term_id on public.subscriptions(term_id);
create index if not exists idx_trip_requests_student_id on public.trip_requests(student_id);
create index if not exists idx_trip_requests_trip_date on public.trip_requests(trip_date);
create index if not exists idx_trip_requests_status on public.trip_requests(status);
create index if not exists idx_trip_schedules_direction on public.trip_schedules(direction);

-- Enable RLS
alter table public.students enable row level security;
alter table public.terms enable row level security;
alter table public.subscriptions enable row level security;
alter table public.trip_schedules enable row level security;
alter table public.trip_requests enable row level security;

-- Policies for students (admin only)
create policy "students_admin_select" on public.students for select to authenticated using (public.is_vota_admin());
create policy "students_admin_insert" on public.students for insert to authenticated with check (public.is_vota_admin());
create policy "students_admin_update" on public.students for update to authenticated using (public.is_vota_admin());
create policy "students_admin_delete" on public.students for delete to authenticated using (public.is_vota_admin());

-- Policies for terms (admin only)
create policy "terms_admin_select" on public.terms for select to authenticated using (public.is_vota_admin());
create policy "terms_admin_insert" on public.terms for insert to authenticated with check (public.is_vota_admin());
create policy "terms_admin_update" on public.terms for update to authenticated using (public.is_vota_admin());
create policy "terms_admin_delete" on public.terms for delete to authenticated using (public.is_vota_admin());

-- Policies for subscriptions (admin only)
create policy "subscriptions_admin_select" on public.subscriptions for select to authenticated using (public.is_vota_admin());
create policy "subscriptions_admin_insert" on public.subscriptions for insert to authenticated with check (public.is_vota_admin());
create policy "subscriptions_admin_update" on public.subscriptions for update to authenticated using (public.is_vota_admin());
create policy "subscriptions_admin_delete" on public.subscriptions for delete to authenticated using (public.is_vota_admin());

-- Policies for trip schedules (admin only)
create policy "trip_schedules_admin_select" on public.trip_schedules for select to authenticated using (public.is_vota_admin());
create policy "trip_schedules_admin_insert" on public.trip_schedules for insert to authenticated with check (public.is_vota_admin());
create policy "trip_schedules_admin_update" on public.trip_schedules for update to authenticated using (public.is_vota_admin());
create policy "trip_schedules_admin_delete" on public.trip_schedules for delete to authenticated using (public.is_vota_admin());

-- Policies for trip requests (admin can see all, student can see own)
create policy "trip_requests_admin_select" on public.trip_requests for select to authenticated using (public.is_vota_admin());
create policy "trip_requests_student_select_own" on public.trip_requests for select to authenticated using (
  student_id in (select student_id from public.profiles where user_id = auth.uid() and role = 'student')
);
create policy "trip_requests_admin_insert" on public.trip_requests for insert to authenticated with check (public.is_vota_admin());
create policy "trip_requests_admin_update" on public.trip_requests for update to authenticated using (public.is_vota_admin());
create policy "trip_requests_admin_delete" on public.trip_requests for delete to authenticated using (public.is_vota_admin());

-- Grant permissions
revoke all on public.students, public.terms, public.subscriptions, public.trip_schedules, public.trip_requests from anon, public;
grant select, insert, update, delete on public.students, public.terms, public.subscriptions, public.trip_schedules, public.trip_requests to authenticated;

-- Functions for updated_at triggers
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

-- Create triggers for updated_at
drop trigger if exists students_touch_updated_at on public.students;
create trigger students_touch_updated_at before update on public.students for each row execute function public.touch_updated_at();

drop trigger if exists terms_touch_updated_at on public.terms;
create trigger terms_touch_updated_at before update on public.terms for each row execute function public.touch_updated_at();

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at before update on public.subscriptions for each row execute function public.touch_updated_at();

drop trigger if exists trip_schedules_touch_updated_at on public.trip_schedules;
create trigger trip_schedules_touch_updated_at before update on public.trip_schedules for each row execute function public.touch_updated_at();

drop trigger if exists trip_requests_touch_updated_at on public.trip_requests;
create trigger trip_requests_touch_updated_at before update on public.trip_requests for each row execute function public.touch_updated_at();
