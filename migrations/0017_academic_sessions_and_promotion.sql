-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0017: Academic Sessions & Student Promotion History
--
-- Adds:
--   1. academic_sessions  – named school years with start/end dates and a
--                           single "current" flag.
--   2. promotion_history  – immutable audit trail of every student promotion
--                           (or demotion / lateral transfer) between classes.
--
-- The existing `classes` table already stores `academic_year` as a text field.
-- This migration does NOT alter that column so that existing data is preserved.
-- The new `academic_sessions` table is the authoritative source for session
-- metadata; the text `academic_year` on `classes` acts as a human-readable
-- denormalised key that can be matched to `academic_sessions.name`.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Academic sessions --------------------------------------------------------
CREATE TABLE IF NOT EXISTS "academic_sessions" (
  "id"         SERIAL PRIMARY KEY,
  "name"       TEXT NOT NULL,          -- e.g. "2024-2025"
  "start_date" DATE NOT NULL,
  "end_date"   DATE NOT NULL,
  "is_current" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT "academic_sessions_name_unique" UNIQUE ("name"),
  CONSTRAINT "academic_sessions_dates_check" CHECK ("end_date" > "start_date")
);

-- Partial unique index: at most one session may be marked current at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "academic_sessions_single_current_idx"
  ON "academic_sessions" ("is_current")
  WHERE "is_current" = true;

-- 2. Promotion history --------------------------------------------------------
CREATE TABLE IF NOT EXISTS "promotion_history" (
  "id"                   SERIAL PRIMARY KEY,
  "student_id"           INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "from_class_id"        INTEGER REFERENCES "classes"("id") ON DELETE SET NULL,
  "to_class_id"          INTEGER NOT NULL REFERENCES "classes"("id") ON DELETE RESTRICT,
  "academic_session_id"  INTEGER REFERENCES "academic_sessions"("id") ON DELETE SET NULL,
  "promoted_by"          INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "notes"                TEXT,
  "promotion_date"       DATE NOT NULL DEFAULT CURRENT_DATE,
  "created_at"           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE INDEX IF NOT EXISTS "promotion_history_student_idx"
  ON "promotion_history" ("student_id");

CREATE INDEX IF NOT EXISTS "promotion_history_session_idx"
  ON "promotion_history" ("academic_session_id");

CREATE INDEX IF NOT EXISTS "promotion_history_to_class_idx"
  ON "promotion_history" ("to_class_id");
