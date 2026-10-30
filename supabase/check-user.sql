-- Check if user exists in auth.users
select id, email, email_confirmed_at, created_at 
from auth.users 
where id = '331845bd-28a1-4d15-a229-314032e740b5';
