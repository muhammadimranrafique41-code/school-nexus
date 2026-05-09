-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0022: Unified Ledger Table + Cash-Flow Summary View
--
-- Purpose:
--   Introduces the `ledger` table as the canonical, append-only accounting
--   register for the Schooliee platform.  Every confirmed financial event
--   (fee receipt, salary disbursement, fund receipt, operational expense)
--   produces exactly one row here, making this table the single source of
--   truth for cash-flow reporting.
--
--   A `cash_flow_summary` view is also created to provide pre-aggregated
--   monthly income / expense / net figures for dashboard consumption.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Ledger table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ledger" (
  -- Surrogate primary key
  "id"               serial          PRIMARY KEY,

  -- Wall-clock timestamp of the financial event.
  -- Callers may supply a back-dated value for corrective entries.
  "transaction_date" timestamp       NOT NULL DEFAULT now(),

  -- Double-entry direction: 'income' | 'expense'
  "entry_type"       varchar(20)     NOT NULL
    CONSTRAINT ledger_entry_type_check
      CHECK ("entry_type" IN ('income', 'expense')),

  -- High-level financial domain: 'fee' | 'salary' | 'fund' | 'expense' | 'other'
  "category"         varchar(50)     NOT NULL
    CONSTRAINT ledger_category_check
      CHECK ("category" IN ('fee', 'salary', 'fund', 'expense', 'other')),

  -- Monetary value in base currency; always positive (direction = entry_type).
  -- NUMERIC(12,2) avoids floating-point rounding errors.
  "amount"           numeric(12, 2)  NOT NULL
    CONSTRAINT ledger_amount_positive CHECK ("amount" > 0),

  -- Human-readable narrative (optional).
  "description"      text,

  -- Polymorphic back-reference discriminator.
  -- e.g. 'fee_payment' => reference_id points to fee_payments.id
  "reference_type"   varchar(50),

  -- PK of the originating record in its domain table (nullable for manual entries).
  "reference_id"     integer,

  -- Sub-system that produced this entry (for per-module drill-down reports).
  "source_module"    varchar(50),

  -- FK to users.id — the operator who triggered the transaction.
  -- SET NULL on user deletion to preserve the financial audit trail.
  "created_by"       integer
    REFERENCES "users" ("id") ON DELETE SET NULL,

  -- Immutable row-creation timestamp.
  "created_at"       timestamp       DEFAULT now(),

  -- Last-modified timestamp (updated by application on corrections).
  "updated_at"       timestamp       DEFAULT now()
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────

-- Date-range queries for monthly / annual cash-flow reports.
CREATE INDEX IF NOT EXISTS "ledger_transaction_date_idx"
  ON "ledger" ("transaction_date");

-- Fast income vs. expense split aggregations.
CREATE INDEX IF NOT EXISTS "ledger_entry_type_idx"
  ON "ledger" ("entry_type");

-- Per-module drill-down without full-table scans.
CREATE INDEX IF NOT EXISTS "ledger_source_module_idx"
  ON "ledger" ("source_module");

-- Reverse-lookup: given a source record, find its ledger row(s).
CREATE INDEX IF NOT EXISTS "ledger_reference_idx"
  ON "ledger" ("reference_type", "reference_id");

-- ── 3. Cash-flow summary view ─────────────────────────────────────────────────
--
-- Provides pre-aggregated monthly totals consumed by the finance dashboard.
-- Columns:
--   year           — calendar year  (e.g. 2025)
--   month          — calendar month (1–12)
--   total_income   — sum of all 'income' entries in that month
--   total_expense  — sum of all 'expense' entries in that month
--   net_cash_flow  — total_income - total_expense (positive = surplus)
--
-- The view is intentionally simple (no MATERIALIZED) so it always reflects
-- the live ledger state.  If query latency becomes a concern, convert to a
-- MATERIALIZED VIEW and schedule a periodic REFRESH.

CREATE OR REPLACE VIEW "cash_flow_summary" AS
SELECT
  EXTRACT(YEAR  FROM "transaction_date")::integer AS "year",
  EXTRACT(MONTH FROM "transaction_date")::integer AS "month",

  COALESCE(
    SUM("amount") FILTER (WHERE "entry_type" = 'income'),
    0
  )::numeric(14, 2)  AS "total_income",

  COALESCE(
    SUM("amount") FILTER (WHERE "entry_type" = 'expense'),
    0
  )::numeric(14, 2)  AS "total_expense",

  (
    COALESCE(SUM("amount") FILTER (WHERE "entry_type" = 'income'),  0) -
    COALESCE(SUM("amount") FILTER (WHERE "entry_type" = 'expense'), 0)
  )::numeric(14, 2)  AS "net_cash_flow"

FROM "ledger"
GROUP BY
  EXTRACT(YEAR  FROM "transaction_date"),
  EXTRACT(MONTH FROM "transaction_date")
ORDER BY
  "year"  DESC,
  "month" DESC;

-- ── 4. Comment annotations ────────────────────────────────────────────────────

COMMENT ON TABLE  "ledger"                       IS 'Canonical append-only accounting register. One row per confirmed financial event.';
COMMENT ON COLUMN "ledger"."entry_type"          IS 'income = money in; expense = money out.';
COMMENT ON COLUMN "ledger"."category"            IS 'High-level financial domain (fee, salary, fund, expense, other).';
COMMENT ON COLUMN "ledger"."amount"              IS 'Positive monetary value in base currency. Direction encoded by entry_type.';
COMMENT ON COLUMN "ledger"."reference_type"      IS 'Discriminator for the polymorphic back-reference (e.g. fee_payment, salary_payment).';
COMMENT ON COLUMN "ledger"."reference_id"        IS 'PK of the originating record in its domain table.';
COMMENT ON COLUMN "ledger"."source_module"       IS 'Sub-system that produced this entry (fees, staff, funds, expenses, wallet, manual).';
COMMENT ON VIEW   "cash_flow_summary"            IS 'Monthly income / expense / net aggregates derived from the ledger table.';
