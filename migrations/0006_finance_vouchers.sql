CREATE TABLE IF NOT EXISTS finance_voucher_operations (
  id SERIAL PRIMARY KEY,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  billing_months JSONB NOT NULL DEFAULT '[]'::jsonb,
  class_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  student_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  force BOOLEAN NOT NULL DEFAULT FALSE,
  total_invoices INTEGER NOT NULL DEFAULT 0,
  generated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  archive_size_bytes INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_vouchers (
  id SERIAL PRIMARY KEY,
  fee_id INTEGER NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
  operation_id INTEGER REFERENCES finance_voucher_operations(id) ON DELETE SET NULL,
  document_number TEXT NOT NULL,
  file_name TEXT NOT NULL,
  billing_month TEXT NOT NULL,
  generation_version INTEGER NOT NULL DEFAULT 1,
  generated_at TEXT NOT NULL,
  generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_vouchers_fee_idx ON finance_vouchers(fee_id);
CREATE UNIQUE INDEX IF NOT EXISTS finance_vouchers_document_number_idx ON finance_vouchers(document_number);
CREATE INDEX IF NOT EXISTS finance_voucher_operations_created_at_idx ON finance_voucher_operations(created_at);
CREATE INDEX IF NOT EXISTS finance_voucher_operations_status_idx ON finance_voucher_operations(status);