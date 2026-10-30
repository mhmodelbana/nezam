-- Create administrator user
-- Run this in Supabase SQL Editor after setup.sql

-- Insert the administrator into profiles table
insert into public.profiles (user_id, role, student_id)
values ('29002506-93e2-4dc3-bf17-1e30cd54a645', 'admin', null);
