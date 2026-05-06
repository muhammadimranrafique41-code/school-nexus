-- ============================================================
-- Migration: 20250601_add_student_history_schema
-- Purpose  : Add academic_records and class_transitions tables
--            plus historical_balance column on fees for the
--            Student History feature.
-- ============================================================

-- ── 1. academic_records ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_records (
  id            SERIAL PRIMARY KEY,
  student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id      INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  grade         TEXT,
  academic_year TEXT NOT NULL,
  session_start TEXT NOT NULL,
  session_end   TEXT,
  created_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE INDEX IF NOT EXISTS academic_records_student_id_idx
  ON academic_records (student_id);

CREATE INDEX IF NOT EXISTS academic_records_class_id_idx
  ON academic_records (class_id);

CREATE INDEX IF NOT EXISTS academic_records_academic_year_idx
  ON academic_records (academic_year);

-- ── 2. class_transitions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_transitions (
  id              SERIAL PRIMARY KEY,
  student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_class_id   INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  to_class_id     INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  transition_date TEXT NOT NULL,
  reason          TEXT,
  notes           TEXT,
  performed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE INDEX IF NOT EXISTS class_transitions_student_id_idx
  ON class_transitions (student_id);

CREATE INDEX IF NOT EXISTS class_transitions_transition_date_idx
  ON class_transitions (transition_date);

-- ── 3. historical_balance column on fees ─────────────────────
-- Stores the running balance snapshot at the time the fee was
-- created; useful for historical ledger reconstruction.
ALTER TABLE fees
  ADD COLUMN IF NOT EXISTS historical_balance INTEGER NOT NULL DEFAULT 0;
