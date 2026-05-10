-- ============================================================
-- Migration: 0025_jazzcash_integration
-- Purpose:   JazzCash MCP wallet top-up payment tracking
-- Author:    Lead Developer
-- Date:      2026-05-10
-- ============================================================

-- Payment intents track the full lifecycle of each JazzCash transaction
CREATE TABLE IF NOT EXISTS jazzcash_payment_intents (
  id                    SERIAL PRIMARY KEY,
  family_id             INTEGER NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  pp_TxnRefNo           VARCHAR(50)  NOT NULL UNIQUE,   -- JazzCash transaction reference
  pp_ResponseCode       VARCHAR(10),                    -- '000' = success
  pp_ResponseMessage    VARCHAR(255),
  requested_amount_pkr  NUMERIC(12,2) NOT NULL,          -- Amount parent intended to pay
  applied_amount_pkr    NUMERIC(12,2),                   -- Amount actually credited to wallet
  currency              CHAR(3)      NOT NULL DEFAULT 'PKR',
  status                VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','COMPLETED','FAILED','EXPIRED')),
  initiated_by_user_id  INTEGER REFERENCES users(id),
  raw_callback_payload  JSONB,                           -- Full JazzCash callback for audit
  idempotency_key       VARCHAR(100) UNIQUE,             -- Prevents duplicate processing
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_jcp_family_id   ON jazzcash_payment_intents (family_id);
CREATE INDEX IF NOT EXISTS idx_jcp_txnref      ON jazzcash_payment_intents (pp_TxnRefNo);
CREATE INDEX IF NOT EXISTS idx_jcp_status      ON jazzcash_payment_intents (status);
CREATE INDEX IF NOT EXISTS idx_jcp_created_at  ON jazzcash_payment_intents (created_at DESC);

-- Link JazzCash intents to family transactions (created after successful top-up)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='family_transactions' AND column_name='jazzcash_intent_id'
  ) THEN
    ALTER TABLE family_transactions
      ADD COLUMN IF NOT EXISTS jazzcash_intent_id INTEGER
        REFERENCES jazzcash_payment_intents(id);
  END IF;
END $$;

-- Track JazzCash as a recognised payment method in existing audit entries
COMMENT ON COLUMN family_transactions.method IS
  'Payment method: Cash | Bank Transfer | Cheque | JazzCash | Other';