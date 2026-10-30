-- Create administrator user
-- Run this in Supabase SQL Editor after setup.sql

-- Insert the administrator into profiles table
insert into public.profiles (user_id, role, student_id)
values ('331845bd-28a1-4d15-a229-314032e740b5', 'admin', null)
on conflict (user_id) do update set 
  role = 'admin',
  student_id = null;
