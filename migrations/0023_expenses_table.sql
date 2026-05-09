-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0023: Expenses Table
--
-- Purpose:
--   Introduces the `expenses` table for recording operational school expenses
--   (utilities, maintenance, supplies, salaries, rent, transport, food,
--   IT equipment, marketing, and other categories).
--
--   Each expense row is linked to the `ledger` table via the `source_module`
--   = 'expense' pattern so that cash-flow reports automatically include
--   operational expenditure.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "expenses" (
  "id"           serial          PRIMARY KEY,
  "amount"       numeric(12, 2)  NOT NULL,
  "category"     varchar(50)     NOT NULL,
  "description"  text,
  "expense_date" date            NOT NULL,
  "recorded_by"  integer         REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"   timestamp       NOT NULL DEFAULT now()
);

-- Index for date-range queries (most common filter)
CREATE INDEX IF NOT EXISTS "expenses_expense_date_idx" ON "expenses" ("expense_date" DESC);

-- Index for category-based reporting
CREATE INDEX IF NOT EXISTS "expenses_category_idx" ON "expenses" ("category");
