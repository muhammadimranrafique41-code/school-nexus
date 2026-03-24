ALTER TABLE finance_voucher_operations
ADD COLUMN IF NOT EXISTS error_log JSONB NOT NULL DEFAULT '[]'::jsonb;
