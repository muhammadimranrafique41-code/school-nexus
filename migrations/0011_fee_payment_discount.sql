-- Add discount and discountReason columns to fee_payments table
ALTER TABLE fee_payments
ADD COLUMN IF NOT EXISTS discount INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_reason TEXT;

-- Create index for tracking discounts
CREATE INDEX IF NOT EXISTS fee_payments_discount_idx ON fee_payments(discount) WHERE discount > 0;
