I am working on the **School Nexus** codebase, a production-ready full-stack TypeScript application (React + Express + PostgreSQL + Drizzle ORM) deployed on Vercel.

We already have a **working Student Fee & Finance System** with:

* invoice-based fee management (`fees`)
* payment tracking (`fee_payments`)
* monthly fee generation
* billing profiles
* reporting and dashboards

The system works correctly in production, so the goal is to **upgrade it incrementally to an enterprise-grade financial system** without breaking existing workflows.

---

# 🎯 OBJECTIVE

Upgrade the current finance system step-by-step into a **scalable, audit-safe, accounting-grade system**, while maintaining backward compatibility.

---

# ⚠️ RULES (IMPORTANT)

* DO NOT rewrite the entire system
* DO NOT break existing APIs or UI flows
* DO NOT change working behavior unless required
* Prefer **additive and backward-compatible changes**
* Each step must be **independently testable and deployable**
* Keep Vercel serverless constraints in mind

---

# 🧩 STEP-BY-STEP UPGRADE PLAN

---

## ✅ STEP 1 — Introduce Fee Adjustments System

### Goal:

Support discounts, fines, scholarships without modifying base invoice logic.

### Tasks:

1. Create new table: `fee_adjustments`

   * id
   * feeId (FK)
   * type: 'discount' | 'fine' | 'scholarship'
   * amount
   * reason
   * createdBy
   * createdAt

2. Update backend:

   * Extend `summarizeFeeLedger` to include adjustments
   * Ensure:
     total = baseAmount + fines - discounts - payments

3. Add API:

   * POST /api/fees/:id/adjustments
   * GET /api/fees/:id/adjustments

4. Ensure:

   * No breaking changes to existing invoice structure
   * Adjustments appear in receipts and reports

---

## ✅ STEP 2 — Add Idempotent Payment Handling

### Goal:

Prevent duplicate payments (critical for real-world usage and future gateways)

### Tasks:

1. Add `idempotencyKey` column to `fee_payments`
2. Enforce uniqueness constraint
3. Update `recordFeePayment`:

   * Reject duplicate requests with same key
4. Update frontend to send unique key per payment attempt

---

## ✅ STEP 3 — Introduce Financial Ledger (Core Upgrade)

### Goal:

Move from derived accounting → source-of-truth accounting

### Tasks:

1. Create `finance_ledger_entries` table:

   * id
   * studentId
   * feeId (nullable)
   * type (invoice/payment/discount/fine/refund)
   * debit
   * credit
   * balanceAfter
   * referenceId
   * createdAt

2. On every:

   * invoice creation
   * payment
   * adjustment

   → insert ledger entry

3. DO NOT remove existing calculations yet

4. Use ledger only for validation and audit initially

---

## ✅ STEP 4 — Refactor Business Logic into Services

### Goal:

Improve maintainability and scalability

### Tasks:

1. Split `server/storage.ts` into:

   * feeService.ts
   * paymentService.ts
   * ledgerService.ts

2. Keep:

   * same function signatures
   * same API behavior

3. Move logic gradually, not all at once

---

## ✅ STEP 5 — Improve Reporting System

### Goal:

Add real financial insights

### Tasks:

1. Add new reports:

   * monthly revenue trend
   * defaulters list
   * class-wise revenue
   * payment method breakdown

2. Use existing helpers:

   * buildFinanceReportSnapshot
   * buildFeeBalanceSummary

3. Optimize queries for performance

---

## ✅ STEP 6 — Add Late Fee Automation

### Goal:

Automatically penalize overdue invoices

### Tasks:

1. Use:

   * financialSettings.lateFeePercentage
   * isOverdue()

2. Add cron-safe function:

   * applyLateFees()

3. Ensure:

   * idempotent execution
   * no duplicate fines

---

## ✅ STEP 7 — Background Job System (Vercel Safe)

### Goal:

Handle heavy operations safely

### Tasks:

1. Move:

   * voucher generation
   * monthly fee generation (optional)

   to background jobs

2. Use:

   * queue system (Redis / Upstash / BullMQ)

3. Persist job status in DB (not memory)

---

## ✅ STEP 8 — Audit Logging System

### Goal:

Track all financial actions

### Tasks:

1. Create:

   * finance_audit_logs

2. Log:

   * invoice creation
   * payment
   * adjustment
   * deletion

---

## ✅ STEP 9 — Soft Delete Instead of Hard Delete

### Goal:

Prevent data loss

### Tasks:

1. Add:

   * deletedAt
   * deletedBy

2. Update queries to ignore deleted records

---

## ✅ STEP 10 — Prepare for Online Payments

### Goal:

Future-ready architecture

### Tasks:

1. Extend `fee_payments`:

   * transactionId
   * gateway
   * status (pending/completed/failed)

2. Add webhook-safe payment flow

---

# 🧪 VALIDATION REQUIREMENTS

After EACH step:

* run type check (`npm run check`)
* run build (`npm run build`)
* test API endpoints manually
* verify no regression in:

  * invoice creation
  * payment recording
  * reporting

---

# 🚀 FINAL GOAL

Transform the current system into:

✔ audit-safe
✔ scalable
✔ production-grade
✔ accounting-ready
✔ payment-gateway ready

---

# 📦 OUTPUT REQUIREMENTS

For each step:

* provide exact schema changes
* provide updated backend code
* provide minimal frontend updates (if required)
* explain why the change is safe
* include migration strategy

---

Focus on **clean, maintainable, production-ready code** and avoid unnecessary complexity.
