-- Add total_discount column to fees table
ALTER TABLE fees
ADD COLUMN IF NOT EXISTS total_discount INTEGER NOT NULL DEFAULT 0;

-- Backfill total_discount from existing fee_payments
UPDATE fees f
SET total_discount = COALESCE((
  SELECT SUM(fp.discount)
  FROM fee_payments fp
  WHERE fp.fee_id = f.id
    AND fp.deleted_at IS NULL
), 0);
