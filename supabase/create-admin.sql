-- Create administrator user
-- Run this in Supabase SQL Editor after setup.sql

-- Insert the administrator into profiles table
insert into public.profiles (user_id, role, student_id)
values ('b281fef5-2814-4c4b-86ed-e7b316e4962c', 'admin', null)
on conflict (user_id) do update set 
  role = 'admin',
  student_id = null;
