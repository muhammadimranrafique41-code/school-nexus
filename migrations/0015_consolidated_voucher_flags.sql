-- Migration: add consolidated_mode and include_overdue to finance_voucher_operations
ALTER TABLE finance_voucher_operations
  ADD COLUMN IF NOT EXISTS consolidated_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_overdue boolean NOT NULL DEFAULT true;
