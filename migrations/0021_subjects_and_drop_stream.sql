-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0021: Add subjects table and remove stream column from classes
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the subjects table
CREATE TABLE IF NOT EXISTS "subjects" (
  "id"          serial PRIMARY KEY,
  "name"        text NOT NULL,
  "code"        text,
  "description" text,
  "created_at"  timestamp NOT NULL DEFAULT now()
);

-- 2. Unique indexes on subjects
CREATE UNIQUE INDEX IF NOT EXISTS "subjects_name_idx"
  ON "subjects" ("name");

CREATE UNIQUE INDEX IF NOT EXISTS "subjects_code_idx"
  ON "subjects" ("code")
  WHERE "code" IS NOT NULL;

-- 3. Drop the old stream-based unique index on classes
DROP INDEX IF EXISTS "classes_grade_section_stream_year_idx";

-- 4. Drop the stream column from classes
ALTER TABLE "classes" DROP COLUMN IF EXISTS "stream";

-- 5. Rebuild the unique index without stream
CREATE UNIQUE INDEX IF NOT EXISTS "classes_grade_section_year_idx"
  ON "classes" ("grade", "section", "academic_year");
