-- ============================================================
-- Migration: 20260514_add_session_management
-- Purpose  : Add session management infrastructure for academic
--            year transitions — new tables, student columns,
--            indexes, and partial unique constraints.
-- ============================================================

-- ── 1. Enrich academic_sessions ──────────────────────────────
ALTER TABLE academic_sessions
  ADD COLUMN IF NOT EXISTS is_next BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE academic_sessions
  ADD COLUMN IF NOT EXISTS promotion_executed BOOLEAN NOT NULL DEFAULT false;

-- Migrate legacy text timestamps to proper TIMESTAMP type
ALTER TABLE academic_sessions
  ALTER COLUMN created_at TYPE TIMESTAMP
  USING created_at::TIMESTAMP;

ALTER TABLE academic_sessions
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE academic_sessions
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE academic_sessions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Partial unique index: only one session may be current at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_sessions_current
  ON academic_sessions (is_current)
  WHERE is_current = true;

-- ── 2. Extend students for session awareness ─────────────────
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS academic_session_id INT
    REFERENCES academic_sessions(id) ON DELETE SET NULL;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS previous_session_id INT
    REFERENCES academic_sessions(id) ON DELETE SET NULL;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_students_session_lookup
  ON students (academic_session_id)
  WHERE academic_session_id IS NOT NULL;

-- ── 3. Session promotions (audit trail) ──────────────────────
CREATE TABLE IF NOT EXISTS session_promotions (
  id              SERIAL PRIMARY KEY,
  from_session_id INT NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  to_session_id   INT NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  student_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_class_id   INT REFERENCES classes(id) ON DELETE SET NULL,
  to_class_id     INT REFERENCES classes(id) ON DELETE SET NULL,
  promoted_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  triggered_by    INT REFERENCES users(id) ON DELETE SET NULL,
  remarks         TEXT
);

CREATE INDEX IF NOT EXISTS idx_session_promotions_audit
  ON session_promotions (student_id, to_session_id);

CREATE INDEX IF NOT EXISTS idx_session_promotions_from
  ON session_promotions (from_session_id);

CREATE INDEX IF NOT EXISTS idx_session_promotions_to
  ON session_promotions (to_session_id);

-- ── 4. Class promotion mapping (configuration) ───────────────
CREATE TABLE IF NOT EXISTS class_promotion_mapping (
  id                  SERIAL PRIMARY KEY,
  from_class_id       INT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  to_class_id         INT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  academic_session_id INT REFERENCES academic_sessions(id) ON DELETE CASCADE,
  is_default          BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT uq_class_promotion_mapping UNIQUE (from_class_id, to_class_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_mapping_from
  ON class_promotion_mapping (from_class_id);

CREATE INDEX IF NOT EXISTS idx_promotion_mapping_to
  ON class_promotion_mapping (to_class_id);
