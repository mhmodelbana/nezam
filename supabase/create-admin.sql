-- Create administrator users
-- Run this in Supabase SQL Editor after setup.sql

-- Insert administrators into profiles table
insert into public.profiles (user_id, role, student_id)
values 
  ('29002506-93e2-4dc3-bf17-1e30cd54a645', 'admin', null),
  ('b281fef5-2814-4c4b-86ed-e7b316e4962c', 'admin', null)
on conflict (user_id) do update set 
  role = 'admin',
  student_id = null;
