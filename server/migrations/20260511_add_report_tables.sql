-- ============================================================
-- Migration: 20260511_add_report_tables
-- Purpose  : Create report_definitions, report_history, and
--            report_cache tables for the Reports Management
--            Module. Enables PDF report generation, audit trail,
--            and optional pre-computed cache.
-- ============================================================

-- ── 1. report_category enum ──────────────────────────────────
DO $$ BEGIN
  CREATE TYPE report_category AS ENUM (
    'academic', 'fee', 'finance', 'attendance'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. report_definitions (templates) ─────────────────────────
CREATE TABLE IF NOT EXISTS report_definitions (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  category       report_category NOT NULL,
  description    TEXT,
  parameters     JSONB,
  query_template TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── 3. report_history (generated report audit trail) ──────────
CREATE TABLE IF NOT EXISTS report_history (
  id                    SERIAL PRIMARY KEY,
  report_definition_id  INTEGER REFERENCES report_definitions(id) ON DELETE SET NULL,
  generated_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  parameters_used       JSONB,
  file_url              VARCHAR(500),
  file_size             INTEGER,
  generated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  download_count        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_report_history_user
  ON report_history(generated_by);

CREATE INDEX IF NOT EXISTS idx_report_history_date
  ON report_history(generated_at);

-- ── 4. report_cache (pre-computed, optional) ──────────────────
CREATE TABLE IF NOT EXISTS report_cache (
  id           SERIAL PRIMARY KEY,
  report_key   VARCHAR(255) NOT NULL UNIQUE,
  data         JSONB NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   TIMESTAMP
);
