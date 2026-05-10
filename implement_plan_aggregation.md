# Implementation Plan — Database Aggregation Layer (Finance Module)

## Objective

Create 5 PostgreSQL views and a supporting `custom_funds` table to power the financial dashboard, professional accounting reports, and print-ready receipt summaries. Integrate with Drizzle ORM via `pgView` for full type safety.

## Schema Adaptations (from original SQL)

The original SQL template assumed columns that do not exist in `shared/schema.ts`. The following adaptations were applied:

| Issue | Original | Actual Schema | Resolution |
|---|---|---|---|
| No `students` table join | `students` | `users` with `role = 'student'` | Use `users` + filter |
| No `class_id` on `users` | `JOIN classes c ON u.class_id = c.id` | `users.class_name` is free text | Use `u.class_name` directly; no `classes` join |
| `fees` has no `payment_method` or `receipt_number` | `f.payment_method`, `f.receipt_number` | These live on `fee_payments` | Use `fee_payments` as base table for `daily_fee_collection_report` |
| `fees.billing_period` is human-readable text | `DATE_TRUNC('month', f.billing_period)` | `billing_period` = `"March 2026"`, `billing_month` = `"2026-03"` | Construct date from `billing_month` |
| Fee status values use PascalCase | `status = 'pending'` | Values: `"Paid"`, `"Partially Paid"`, `"Unpaid"`, `"Overdue"` | Use balance-based condition `(amount - paid_amount) > 0` |
| `custom_funds` table missing | Referenced in view | No table exists | Create `custom_funds` table in migration |

## Files Changed

| File | Action |
|---|---|
| `server/migrations/20260510_add_finance_views.sql` | **CREATE** — migration with `custom_funds` table + 5 views |
| `shared/schema.ts` | **MODIFY** — add `pgView` import, `customFunds` table, 5 view exports, row types |

## Views Created

### 1. `monthly_fee_summary`
- **Source**: `fees` × `users` (role=student)
- **Purpose**: Dashboard — aggregated fee stats by month + class
- **Columns**: month, class_name, total_students, total_fees_generated, total_fees_collected, total_fees_pending, collection_percentage

### 2. `monthly_funds_summary`
- **Source**: `custom_funds`
- **Purpose**: Dashboard — custom fund campaign totals by month
- **Columns**: month, fund_name, total_collected

### 3. `monthly_pnl`
- **Source**: `ledger`
- **Purpose**: Professional P&L — income vs expense breakdown
- **Columns**: month, total_income, total_expense, net_profit

### 4. `overdue_fees_snapshot`
- **Source**: `fees` × `users` (role=student)
- **Purpose**: Alert/dashboard — current students with overdue balances
- **Columns**: student_id, student_name, class_name, billing_period, overdue_amount, due_date

### 5. `daily_fee_collection_report`
- **Source**: `fee_payments` × `fees` × `users` (role=student)
- **Purpose**: Print-ready daily audit log / receipt summary
- **Columns**: payment_id, collection_date, student_name, class_name, total_billed, amount_paid, payment_method, receipt_number, status

## Drizzle Integration

Each view is exported via `pgView("name", { columns }).existing()` in `shared/schema.ts`. This provides full TypeScript type inference for Drizzle ORM queries without Drizzle managing the view lifecycle.

## Migration Strategy

- Place migration in `server/migrations/` using timestamp-based naming (`20260510_add_finance_views.sql`)
- Use `CREATE TABLE IF NOT EXISTS` and `CREATE OR REPLACE VIEW` patterns for idempotency
- Existing `custom_funds` table does not exist — it is created in this migration
- Views can be applied independently at any point (no data migration needed)
