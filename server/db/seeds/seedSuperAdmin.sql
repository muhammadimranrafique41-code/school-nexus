-- Super Admin Seed Script (UPSERT)
-- Run this SQL against your database to create or update the default super admin user.
-- Uses ON CONFLICT so the password is always reset to the known value.
-- After running, log in with: superadmin@school.edu / password123

-- IMPORTANT: Change the password in production!

INSERT INTO public.users (name, email, password, role)
VALUES ('Platform Super Admin', 'superadmin@school.edu', 'password123', 'super_admin')
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  name = EXCLUDED.name;
