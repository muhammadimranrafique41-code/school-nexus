-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0019: Smart Fee Tracking & Parent Wallet System
--
-- Architecture decisions:
--   1. parentWallets is STUDENT-scoped (one row per student).
--      The legacy families.wallet_balance is preserved for backward-compat.
--   2. wallet_transactions is an append-only audit log.
--   3. Row-level locking (SELECT … FOR UPDATE) is enforced in application code
--      (financeService.ts) to prevent concurrent balance corruption.
--   4. balance CHECK constraint ensures the wallet never goes negative at the
--      DB level as a last-resort guard.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. parent_wallets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parent_wallets (
  id                  SERIAL PRIMARY KEY,
  student_id          INTEGER NOT NULL UNIQUE
                        REFERENCES users(id) ON DELETE CASCADE,
  balance             DECIMAL(12, 2) NOT NULL DEFAULT 0.00
                        CONSTRAINT parent_wallets_balance_non_negative CHECK (balance >= 0),
  pending_deductions  DECIMAL(12, 2) NOT NULL DEFAULT 0.00
                        CONSTRAINT parent_wallets_pending_non_negative CHECK (pending_deductions >= 0),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS parent_wallets_student_id_idx
  ON parent_wallets (student_id);

COMMENT ON TABLE  parent_wallets IS 'Per-student prepaid wallet. One row per student user.';
COMMENT ON COLUMN parent_wallets.balance IS 'Spendable credit in PKR. Never negative.';
COMMENT ON COLUMN parent_wallets.pending_deductions IS 'Amount reserved for in-flight fee applications. Cleared on commit.';

-- ── 2. wallet_transactions ────────────────────────────────────────────────────
-- Immutable append-only audit log. Never UPDATE or DELETE rows here.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id            SERIAL PRIMARY KEY,
  wallet_id     INTEGER NOT NULL
                  REFERENCES parent_wallets(id) ON DELETE CASCADE,
  -- Positive = credit (deposit / refund), Negative = debit (fee_payment)
  amount        DECIMAL(12, 2) NOT NULL,
  type          TEXT NOT NULL
                  CONSTRAINT wallet_transactions_type_check
                  CHECK (type IN ('deposit', 'fee_payment', 'refund', 'adjustment')),
  -- feeId for fee_payment/refund; null for deposit/adjustment
  reference_id  INTEGER,
  description   TEXT,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_id_idx
  ON wallet_transactions (wallet_id);

CREATE INDEX IF NOT EXISTS wallet_transactions_type_idx
  ON wallet_transactions (type);

CREATE INDEX IF NOT EXISTS wallet_transactions_created_at_idx
  ON wallet_transactions (created_at DESC);

COMMENT ON TABLE  wallet_transactions IS 'Immutable audit log for every wallet balance change. Do not UPDATE or DELETE.';
COMMENT ON COLUMN wallet_transactions.amount IS 'Positive = credit, Negative = debit.';
COMMENT ON COLUMN wallet_transactions.type IS 'deposit | fee_payment | refund | adjustment';
COMMENT ON COLUMN wallet_transactions.reference_id IS 'fee.id for fee_payment/refund; fee_payment.id for refund; null otherwise.';

-- ── 3. Seed wallets for existing students (balance = 0) ───────────────────────
-- Creates a zero-balance wallet for every student who does not yet have one.
-- Run once; idempotent due to ON CONFLICT DO NOTHING.
INSERT INTO parent_wallets (student_id, balance, pending_deductions)
SELECT u.id, 0.00, 0.00
FROM   users u
WHERE  u.role = 'student'
ON CONFLICT (student_id) DO NOTHING;

-- ── 4. Optional: seed from legacy families.wallet_balance ─────────────────────
-- Uncomment and adapt if you want to migrate existing family wallet balances
-- to the per-student wallets (distributes equally among family members).
--
-- UPDATE parent_wallets pw
-- SET    balance = sub.per_student_share
-- FROM (
--   SELECT
--     u.id AS student_id,
--     ROUND(f.wallet_balance / NULLIF(COUNT(u2.id) OVER (PARTITION BY f.id), 0), 2) AS per_student_share
--   FROM   users u
--   JOIN   families f ON f.id = u.family_id
--   JOIN   users u2   ON u2.family_id = f.id AND u2.role = 'student'
--   WHERE  u.role = 'student'
--     AND  f.wallet_balance > 0
-- ) sub
-- WHERE pw.student_id = sub.student_id;
