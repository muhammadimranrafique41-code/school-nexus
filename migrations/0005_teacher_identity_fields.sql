ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "designation" text,
  ADD COLUMN IF NOT EXISTS "department" text,
  ADD COLUMN IF NOT EXISTS "employee_id" text,
  ADD COLUMN IF NOT EXISTS "teacher_photo_url" text;