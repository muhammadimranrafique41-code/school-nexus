-- ============================================================
-- Migration: 20260510_add_finance_views
-- Purpose  : Create custom_funds table and 5 aggregation views
--            for the Finance Management Module dashboard,
--            professional accounting reports, and print-ready
--            daily fee collection summaries.
-- ============================================================

-- ── 1. custom_funds table ────────────────────────────────────
-- Supports school-defined custom fund collection campaigns such
-- as building fund, library fund, etc.
CREATE TABLE IF NOT EXISTS custom_funds (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  amount      INTEGER NOT NULL,
  student_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);

-- ── 2. Monthly fee collection summary by class ───────────────
-- Dashboard card showing aggregate fee collection performance
-- grouped by month and class.
CREATE OR REPLACE VIEW monthly_fee_summary AS
SELECT
  (f.billing_month || '-01')::date AS month,
  u.class_name AS class_name,
  COUNT(DISTINCT f.student_id) AS total_students,
  SUM(f.amount) AS total_fees_generated,
  SUM(f.paid_amount) AS total_fees_collected,
  SUM(f.amount - f.paid_amount) AS total_fees_pending,
  ROUND(
    SUM(f.paid_amount) / NULLIF(SUM(f.amount), 0) * 100, 2
  ) AS collection_percentage
FROM fees f
JOIN users u ON f.student_id = u.id AND u.role = 'student'
WHERE f.deleted_at IS NULL
GROUP BY month, u.class_name
ORDER BY month DESC;

-- ── 3. Monthly custom funds collection summary ───────────────
-- Dashboard card showing total collected per fund campaign
-- aggregated by month.
CREATE OR REPLACE VIEW monthly_funds_summary AS
SELECT
  DATE_TRUNC('month', cf.created_at::timestamp) AS month,
  cf.name AS fund_name,
  SUM(cf.amount) AS total_collected
FROM custom_funds cf
GROUP BY month, cf.name;

-- ── 4. Monthly P&L (income vs expense) ───────────────────────
-- Professional accounting report from the canonical ledger
-- table showing total income, total expense, and net profit
-- per month.
CREATE OR REPLACE VIEW monthly_pnl AS
SELECT
  DATE_TRUNC('month', transaction_date) AS month,
  SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END) AS total_income,
  SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END) AS total_expense,
  SUM(CASE WHEN entry_type = 'income' THEN amount ELSE -amount END) AS net_profit
FROM ledger
GROUP BY month
ORDER BY month DESC;

-- ── 5. Overdue fees snapshot ─────────────────────────────────
-- Live view of all students with an outstanding balance past
-- their fee due date. Used for reminders and dashboard alerts.
CREATE OR REPLACE VIEW overdue_fees_snapshot AS
SELECT
  u.id AS student_id,
  u.name AS student_name,
  u.class_name AS class_name,
  f.billing_period,
  (f.amount - f.paid_amount) AS overdue_amount,
  f.due_date
FROM fees f
JOIN users u ON f.student_id = u.id AND u.role = 'student'
WHERE (f.amount - f.paid_amount) > 0
  AND f.due_date::date < CURRENT_DATE
  AND f.deleted_at IS NULL;

-- ── 6. Daily fee collection report ───────────────────────────
-- Print-ready daily audit log / receipt summary. Each row is
-- one payment event with its method and receipt number so the
-- frontend can generate receipts without additional joins.
CREATE OR REPLACE VIEW daily_fee_collection_report AS
SELECT
  fp.id AS payment_id,
  fp.payment_date::date AS collection_date,
  u.name AS student_name,
  u.class_name AS class_name,
  f.amount AS total_billed,
  fp.amount AS amount_paid,
  fp.method AS payment_method,
  fp.receipt_number,
  f.status
FROM fee_payments fp
JOIN fees f ON fp.fee_id = f.id
JOIN users u ON fp.student_id = u.id AND u.role = 'student'
WHERE fp.deleted_at IS NULL
ORDER BY collection_date DESC, fp.receipt_number DESC;

-- ── 7. Comments ──────────────────────────────────────────────
COMMENT ON TABLE  custom_funds              IS 'School-defined custom fund collection campaigns (building fund, library fund, etc.)';
COMMENT ON VIEW  monthly_fee_summary         IS 'Monthly fee collection stats aggregated by class for the finance dashboard.';
COMMENT ON VIEW  monthly_funds_summary       IS 'Monthly custom fund collection totals grouped by fund name.';
COMMENT ON VIEW  monthly_pnl                 IS 'Monthly income vs expense breakdown from the canonical ledger table.';
COMMENT ON VIEW  overdue_fees_snapshot        IS 'Live snapshot of students with pending balances past their due date.';
COMMENT ON VIEW  daily_fee_collection_report  IS 'Daily fee collection details for professional accounting, audit logs, and print-ready receipts.';
