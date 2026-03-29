-- CONSOLIDATED VOUCHER SYSTEM

-- STEP 1: Extend finance_voucher_operations
ALTER TABLE finance_voucher_operations
  ADD COLUMN IF NOT EXISTS consolidated_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_overdue BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN finance_voucher_operations.consolidated_mode IS '
  When true, each student receives one merged PDF covering all dues';

COMMENT ON COLUMN finance_voucher_operations.include_overdue IS '
  When true, previous unpaid dues are included in the consolidated voucher';

-- STEP 2: Create consolidated_vouchers
CREATE TABLE IF NOT EXISTS consolidated_vouchers (
  id SERIAL PRIMARY KEY,
  operation_id INTEGER REFERENCES finance_voucher_operations(id) ON DELETE SET NULL,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  voucher_document_number TEXT NOT NULL,
  filing_month TEXT NOT NULL,
  billing_months JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  pdf_filename TEXT,
  previous_dues_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_fees_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

COMMENT ON TABLE consolidated_vouchers IS
  'One row per student per consolidated voucher batch. Snapshots are frozen '
  'at generation time so reprints always show original amounts.';

-- STEP 3: Create consolidated_voucher_fee_links
CREATE TABLE IF NOT EXISTS consolidated_voucher_fee_links (
  id SERIAL PRIMARY KEY,
  consolidated_voucher_id INTEGER NOT NULL REFERENCES consolidated_vouchers(id) ON DELETE CASCADE,
  fee_id INTEGER NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('previous_dues', 'current_fees')),
  fee_snapshot_amount INTEGER NOT NULL,
  fee_snapshot_balance INTEGER NOT NULL,
  fee_snapshot_status TEXT NOT NULL
);

COMMENT ON TABLE consolidated_voucher_fee_links IS
  'Junction table linking consolidated_vouchers to individual fees rows. '
  'Enables reconciliation and prevents the same fee appearing in two batches.';

-- STEP 4: Create consolidated_voucher_audit_log
CREATE TABLE IF NOT EXISTS consolidated_voucher_audit_log (
  id SERIAL PRIMARY KEY,
  consolidated_voucher_id INTEGER NOT NULL REFERENCES consolidated_vouchers(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'generated', 'regenerated', 'downloaded',
    'printed', 'cancelled', 'status_changed'
  )),
  previous_status TEXT,
  new_status TEXT,
  metadata JSONB,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

COMMENT ON TABLE consolidated_voucher_audit_log IS
  'Immutable append-only audit trail. Never update or delete rows here.';

-- STEP 5: Add status check constraints
ALTER TABLE consolidated_vouchers
  ADD CONSTRAINT consolidated_vouchers_status_check
    CHECK (status IN ('draft', 'generated', 'downloaded', 'cancelled'));

ALTER TABLE consolidated_voucher_fee_links
  ADD CONSTRAINT consolidated_voucher_fee_links_section_check
    CHECK (section IN ('previous_dues', 'current_fees'));

ALTER TABLE consolidated_voucher_audit_log
  ADD CONSTRAINT consolidated_voucher_audit_log_action_check
    CHECK (action IN (
      'generated', 'regenerated', 'downloaded',
      'printed', 'cancelled', 'status_changed'
    ));

-- ROLLBACK COMMANDS (keep commented)
-- DROP TABLE IF EXISTS consolidated_voucher_audit_log;
-- DROP TABLE IF EXISTS consolidated_voucher_fee_links;
-- DROP TABLE IF EXISTS consolidated_vouchers;
-- ALTER TABLE finance_voucher_operations
--   DROP COLUMN IF EXISTS consolidated_mode,
--   DROP COLUMN IF EXISTS