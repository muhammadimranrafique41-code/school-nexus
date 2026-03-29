-- ============================================================================
-- MIGRATION: consolidated_voucher_system
-- Description: Adds consolidated voucher tables and extends existing tables
--              for the multi-month fee voucher feature.
-- Run order:   After all existing migrations.
-- Idempotent:  Yes — all statements use IF NOT EXISTS / IF NOT EXISTS.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: Extend finance_voucher_operations with consolidated mode columns
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE finance_voucher_operations
  ADD COLUMN IF NOT EXISTS consolidated_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_overdue    BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN finance_voucher_operations.consolidated_mode IS
  'When true, each student receives one merged PDF covering all dues';
COMMENT ON COLUMN finance_voucher_operations.include_overdue IS
  'When true, previous unpaid dues are included in the consolidated voucher';

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: Create consolidated_vouchers
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS consolidated_vouchers (
  id                       SERIAL PRIMARY KEY,

  -- Core references
  operation_id             INTEGER
    REFERENCES finance_voucher_operations(id) ON DELETE SET NULL,
  student_id               INTEGER NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  generated_by             INTEGER
    REFERENCES users(id) ON DELETE SET NULL,

  -- Voucher identity
  voucher_document_number  TEXT    NOT NULL,
  filing_month             TEXT    NOT NULL,  -- anchor "YYYY-MM"
  billing_months           JSONB   NOT NULL DEFAULT '[]'::jsonb,

  -- Lifecycle status
  status                   TEXT    NOT NULL DEFAULT 'draft',
    -- 'draft' | 'generated' | 'downloaded' | 'cancelled'

  -- PDF file reference
  pdf_filename             TEXT,

  -- Point-in-time snapshots (frozen at generation)
  previous_dues_snapshot   JSONB   NOT NULL DEFAULT '[]'::jsonb,
  current_fees_snapshot    JSONB   NOT NULL DEFAULT '[]'::jsonb,
  summary_snapshot         JSONB   NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps (text to match existing schema convention)
  generated_at             TEXT    NOT NULL,
  updated_at               TEXT    NOT NULL
);

COMMENT ON TABLE consolidated_vouchers IS
  'One row per student per consolidated voucher batch. Snapshots are frozen '
  'at generation time so reprints always show original amounts.';

COMMENT ON COLUMN consolidated_vouchers.filing_month IS
  'Anchor month YYYY-MM used to split previous dues vs current fees';
COMMENT ON COLUMN consolidated_vouchers.billing_months IS
  'All billing months covered by this voucher as JSON array of YYYY-MM strings';
COMMENT ON COLUMN consolidated_vouchers.previous_dues_snapshot IS
  'JSON snapshot of ConsolidatedFeeRow[] for months before filing_month';
COMMENT ON COLUMN consolidated_vouchers.current_fees_snapshot IS
  'JSON snapshot of ConsolidatedFeeRow[] for the selected billing months';
COMMENT ON COLUMN consolidated_vouchers.summary_snapshot IS
  'JSON snapshot of ConsolidatedSummary computed at generation time';

-- Unique: one document number per voucher
CREATE UNIQUE INDEX IF NOT EXISTS
  consolidated_vouchers_voucher_document_number_idx
  ON consolidated_vouchers(voucher_document_number);

-- Unique: one consolidated voucher per student per filing month per operation
-- Allows regeneration under a new operation_id without conflicts
CREATE UNIQUE INDEX IF NOT EXISTS
  consolidated_vouchers_student_filing_month_op_idx
  ON consolidated_vouchers(student_id, filing_month, operation_id);

-- Supporting indexes
CREATE INDEX IF NOT EXISTS consolidated_vouchers_student_id_idx
  ON consolidated_vouchers(student_id);

CREATE INDEX IF NOT EXISTS consolidated_vouchers_operation_id_idx
  ON consolidated_vouchers(operation_id);

CREATE INDEX IF NOT EXISTS consolidated_vouchers_status_idx
  ON consolidated_vouchers(status);

CREATE INDEX IF NOT EXISTS consolidated_vouchers_filing_month_idx
  ON consolidated_vouchers(filing_month);

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: Create consolidated_voucher_fee_links
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS consolidated_voucher_fee_links (
  id                        SERIAL PRIMARY KEY,
  consolidated_voucher_id   INTEGER NOT NULL
    REFERENCES consolidated_vouchers(id) ON DELETE CASCADE,
  fee_id                    INTEGER NOT NULL
    REFERENCES fees(id) ON DELETE CASCADE,

  -- Which section of the voucher this fee belongs to
  section                   TEXT    NOT NULL,
    -- 'previous_dues' | 'current_fees'

  -- Snapshots of fees row at time of voucher generation
  fee_snapshot_amount       INTEGER NOT NULL,
  fee_snapshot_balance      INTEGER NOT NULL,
  fee_snapshot_status       TEXT    NOT NULL
);

COMMENT ON TABLE consolidated_voucher_fee_links IS
  'Junction table linking consolidated_vouchers to individual fees rows. '
  'Enables reconciliation and prevents the same fee appearing in two batches.';

COMMENT ON COLUMN consolidated_voucher_fee_links.section IS
  'previous_dues = fee.billing_month < filing_month; '
  'current_fees  = fee.billing_month IN selected months';

COMMENT ON COLUMN consolidated_voucher_fee_links.fee_snapshot_amount IS
  'fees.amount at the time of voucher generation (immutable reference)';

COMMENT ON COLUMN consolidated_voucher_fee_links.fee_snapshot_balance IS
  'fees.remaining_balance at generation time';

-- Prevent the same fee appearing twice in the same voucher
CREATE UNIQUE INDEX IF NOT EXISTS
  consolidated_voucher_fee_links_voucher_fee_idx
  ON consolidated_voucher_fee_links(consolidated_voucher_id, fee_id);

CREATE INDEX IF NOT EXISTS
  consolidated_voucher_fee_links_voucher_id_idx
  ON consolidated_voucher_fee_links(consolidated_voucher_id);

CREATE INDEX IF NOT EXISTS
  consolidated_voucher_fee_links_fee_id_idx
  ON consolidated_voucher_fee_links(fee_id);

CREATE INDEX IF NOT EXISTS
  consolidated_voucher_fee_links_section_idx
  ON consolidated_voucher_fee_links(section);

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4: Create consolidated_voucher_audit_log
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS consolidated_voucher_audit_log (
  id                        SERIAL PRIMARY KEY,
  consolidated_voucher_id   INTEGER NOT NULL
    REFERENCES consolidated_vouchers(id) ON DELETE CASCADE,
  student_id                INTEGER NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  -- Action recorded
  action                    TEXT    NOT NULL,
    -- 'generated' | 'regenerated' | 'downloaded' | 'printed'
    -- | 'cancelled' | 'status_changed'

  previous_status           TEXT,
  new_status                TEXT,
  metadata                  JSONB,    -- IP, batch_id, reason, etc.

  performed_by              INTEGER
    REFERENCES users(id) ON DELETE SET NULL,
  created_at                TEXT    NOT NULL
);

COMMENT ON TABLE consolidated_voucher_audit_log IS
  'Immutable append-only audit trail. Never update or delete rows here.';

COMMENT ON COLUMN consolidated_voucher_audit_log.metadata IS
  'Freeform JSON context: { ip, batchId, reason, userAgent, ... }';

CREATE INDEX IF NOT EXISTS cv_audit_log_consolidated_voucher_id_idx
  ON consolidated_voucher_audit_log(consolidated_voucher_id);

CREATE INDEX IF NOT EXISTS cv_audit_log_student_id_idx
  ON consolidated_voucher_audit_log(student_id);

CREATE INDEX IF NOT EXISTS cv_audit_log_action_idx
  ON consolidated_voucher_audit_log(action);

CREATE INDEX IF NOT EXISTS cv_audit_log_created_at_idx
  ON consolidated_voucher_audit_log(created_at);

CREATE INDEX IF NOT EXISTS cv_audit_log_performed_by_idx
  ON consolidated_voucher_audit_log(performed_by);

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 5: Add status check constraints
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE consolidated_vouchers
  ADD CONSTRAINT IF NOT EXISTS
    consolidated_vouchers_status_check
    CHECK (status IN ('draft', 'generated', 'downloaded', 'cancelled'));

ALTER TABLE consolidated_voucher_fee_links
  ADD CONSTRAINT IF NOT EXISTS
    consolidated_voucher_fee_links_section_check
    CHECK (section IN ('previous_dues', 'current_fees'));

ALTER TABLE consolidated_voucher_audit_log
  ADD CONSTRAINT IF NOT EXISTS
    consolidated_voucher_audit_log_action_check
    CHECK (action IN (
      'generated', 'regenerated', 'downloaded',
      'printed', 'cancelled', 'status_changed'
    ));

-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (keep commented — run manually if needed)
-- ────────────────────────────────────────────────────────────────────────────

-- DROP TABLE IF EXISTS consolidated_voucher_audit_log;
-- DROP TABLE IF EXISTS consolidated_voucher_fee_links;
-- DROP TABLE IF EXISTS consolidated_vouchers;
-- ALTER TABLE finance_voucher_operations
--   DROP COLUMN IF EXISTS consolidated_mode,
--   DROP COLUMN IF EXISTS include_overdue;
