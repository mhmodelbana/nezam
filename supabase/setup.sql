-- Run this file once in Supabase SQL Editor before tables.sql.
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

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
  on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_vota_admin());

revoke all on public.profiles from anon, public;
grant select on public.profiles to authenticated;
revoke all on function public.is_vota_admin() from public;
grant execute on function public.is_vota_admin() to authenticated;

-- Create the first administrator after creating their Auth user:
-- insert into public.profiles (user_id, role, student_id)
-- values ('AUTH-USER-UUID', 'admin', null);
