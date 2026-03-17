# Finance System Design

## System Overview
- The finance stack is a server-driven Express app wired into Vercel’s serverless runtime (`server/routes.ts:1570`) with Drizzle + `pg.Pool` for durable PostgreSQL connections (`server/db.ts:1`). Shared type-safe routes in `shared/routes.ts:749` keep clients and server in sync, while `shared/finance.ts:1` centralizes enum definitions (statuses, payment methods, invoice sources) and ledger helpers that power every downstream summary.
- Student records originate in `shared/schema.ts:32` (`users`) plus the `students` view table (`shared/schema.ts:70`), so every invoice captures both student metadata and role enforcement delivered by the route guards in `server/routes.ts:1570`–`1744`.
- The server-side storage layer (`server/storage.ts`) orchestrates every workflow. Manual CRUD, reporting, monthly generation, payments, and vouchers all funnel through this module, which keeps business rules and transactional safety in one place before returning normalized snapshots to React hooks and pages.

## Fee Structure Design
- Students share the `users` row with other roles, but `students`/`teachers` join tables add class and subject context (`shared/schema.ts:32`–`74`). Every fee links back to `users.id` plus optional `student.className` and `student.fatherName` to support ledgers, vouchers, and front-end labels.
- Fees themselves live in `fees` (`shared/schema.ts:225`) with mandatory fields such as `amount`, `dueDate`, `billingMonth`, `description`, `feeType`, `source`, plus optional `generatedMonth` for monthly batches. Line items are stored as JSON (`shared/schema.ts:243`), ensuring complex invoices still reconcile to a single total via `shared/finance.ts:130`.
- Billing profiles (`student_billing_profiles` at `shared/schema.ts:275`) let admins assign a default monthly amount and due day per student. The `api.fees.profiles` routes (`shared/routes.ts:815`/`820`, realized in `server/routes.ts:1688`–`1696`) keep the UI (`client/src/pages/admin/finance.tsx:440`) in sync with these defaults so automated generation only touches students with active profiles.
- `shared/finance.ts:1` enumerates every payment method and status, while `shared/settings.ts:28` exposes currency, locale, prefixes, and a placeholder `lateFeePercentage` that can feed automated penalties.

## Fee Generation Workflow
- Manual invoices come through `POST /api/fees` (`shared/routes.ts:751`, implemented at `server/routes.ts:1626`), where `createFeeRecord` (`server/storage.ts:1517`) validates line items, prevents duplicate monthly invoices via `generatedMonth`, and sets the initial ledger before returning a numbered invoice.
- Recurring billing relies on `POST /api/fees/generate-monthly` (`shared/routes.ts:827`, `server/routes.ts:1703`) plus `generateMonthlyFees` (`server/storage.ts:1771`). It iterates over students with active billing profiles, skips duplicates (`server/storage.ts:1517` / `1776`), reports missing profiles, and builds due dates with `shared/finance.ts:347`.
- The admin UI (`client/src/pages/admin/finance.tsx:317`–`461`) exposes a “Generate monthly fees” dialog that selects the billing month and optional due-day override, displays statistics about duplicates/missing profiles, and pushes the same request shape as `api.fees.generateMonthly.input`.
- Invoice numbering and reminder-friendly data exist everywhere via helpers such as `buildDocumentNumber` (`shared/finance.ts:170`), so every creation path yields consistent identifiers and due-date formatting for printing and reporting.

## Payment Workflow
- Payments are captured through `POST /api/fees/:id/payments` (`shared/routes.ts:785`, `server/routes.ts:1667`). `recordFeePayment` (`server/storage.ts:1682`) runs inside a transaction: it prevents overpayment, inserts `fee_payments`, generates a receipt number with the configured prefix, updates the parent invoice ledger, and returns the refreshed invoice so the client can invalidate caches.
- Status transitions (`Paid`, `Partially Paid`, `Overdue`, `Unpaid`) are computed with `shared/finance.ts:377`’s `getFeeStatus`, which delegates to `calculateRemainingBalance` (`shared/finance.ts:150`) and `isOverdue` (`shared/finance.ts:210`), ensuring both UI badges and reports align.
- Receipts and invoices are printable with shared HTML builders in `client/src/lib/finance.ts:44` and `:133`, so the student or admin can export a styled document showing line items, payments, and remaining balance.
- The payment schema records method, reference, notes, and the administrating user (`shared/schema.ts:252-272`), making the system audit-ready and ready for later reconciliation or refund processing.

## Ledger & Accounting
- Aggregated summaries come from `shared/finance.ts:453`’s `buildFinanceReportSnapshot`, `shared/finance.ts:596`’s `buildFeeBalanceSummary`, and `shared/finance.ts:618`’s `buildStudentBalanceSummary`. These functions bucket invoices/payments by status, month, method, and class, and are invoked by storage routes such as `getFinanceReport` (`server/storage.ts:1844`) and `getFeeBalanceSummary` (`server/storage.ts:1865`).
- Reporting routes are exposed as `GET /api/fees/report` (`shared/routes.ts:848`, `server/routes.ts:1716`), `GET /api/fees/balances/summary` (`shared/routes.ts:798`, `server/routes.ts:1602`), and `GET /api/fees/balances/students/:studentId` (`shared/routes.ts:808`, `server/routes.ts:1614`). Student dashboards pull from `client/src/hooks/use-fees.ts:55`/`128` to show outstanding balances and reminders.
- Admin dashboards incorporate these summaries (`server/storage.ts:2063`) to display totals, pending payments, overdue counts, and recent activity, providing the finance team with both the student ledger and the macro ledger in one place.

## Frontend Flow
- The admin finance page (`client/src/pages/admin/finance.tsx:317`–`461`) layers KPI cards, report header text, a “Generate monthly fees” CTA, invoice filters, recent payments and billing profile panels (`:438`/`:440`), and dialogs for creating/editing invoices (`:449`) or batch generation (`:461`); it mirrors the shared API schemas so the front end validates the exact payloads the server expects.
- Student-facing flows (`client/src/pages/student/fees.tsx:99`–`:374`) expose an “My Invoices” hero, status badges, export/print actions, reminders, and a ledger table with printable receipts via `client/src/lib/finance.ts:44`; both the hero and invoice register pull outstanding balance hints directly from `buildStudentBalanceSummary`.
- React Query hooks (`client/src/hooks/use-fees.ts`) orchestrate query keys, invalidations, and server calls, so recording a payment invalidates invoices, payment lists, balances, profiles, and dashboards in one sweep (`useCreateFee` / `useRecordPayment` / `useGenerateMonthlyFees`).

## Database Schema
- `users` (`shared/schema.ts:32`) keeps every person (admin, teacher, student) with role, class, father name, and photo metadata, while `students`/`teachers` tables add domain-specific constraints.
- `fees` (`shared/schema.ts:225`) stores invoice totals, paid/remaining balances, statuses, descriptions, sources, and normalized line items with unique indexes on `invoiceNumber` and `(studentId, generatedMonth)` to enforce duplicate-free batch generation.
- `fee_payments` (`shared/schema.ts:251`) captures every transaction with method, receipt, reference, notes, and creator, and enforces a unique `receiptNumber` index.
- `student_billing_profiles` (`shared/schema.ts:275`) anchors monthly plans (amount, due day, active flag, notes) to each student for automated generation.
- `finance_voucher_operations`/`finance_vouchers` (`shared/schema.ts:300`/`310`) record batch print jobs, tracking status, invoice counts, archive size, and the latest per-invoice voucher to support reprints and SSE progress.
- The schema is fully covered by Drizzle’s `createInsertSchema` helpers (`shared/schema.ts:660` onwards) and is referenced directly from both routes and storage, ensuring type-safe queries from the top of the stack.

## API Endpoints
- `GET /api/fees` (`shared/routes.ts:751`, `server/routes.ts:1570`): list invoices (admin sees all, students limited to their own).
- `GET /api/fees/:id` (`shared/routes.ts:756`, `server/routes.ts:1729`): invoice detail for dashboards and receipt printing.
- `POST /api/fees` (`shared/routes.ts:761`, `server/routes.ts:1626`): manually create an invoice, run validations, assign invoice number.
- `PUT /api/fees/:id` (`shared/routes.ts:767`, `server/routes.ts:1639`): edit invoice totals/line items while guarding against reducing below paid amount.
- `DELETE /api/fees/:id` (`shared/routes.ts:773`, `server/routes.ts:1660`): admin-only hard delete.
- `GET /api/fees/payments` (`shared/routes.ts:779`, `server/routes.ts:1577`): filterable payment list for reconciliation.
- `POST /api/fees/:id/payments` (`shared/routes.ts:785`, `server/routes.ts:1667`): record a payment, create receipt, update ledger atomically.
- `GET /api/fees/payments/:paymentId/receipt` (`shared/routes.ts:791`, `server/routes.ts:1593`): fetch invoice + payment for printing receipt.
- `GET /api/fees/balances/summary` (`shared/routes.ts:798`, `server/routes.ts:1602`): totals for KPI cards.
- `GET /api/fees/balances/overdue` (`shared/routes.ts:803`, `server/routes.ts:1608`): overdue ledger entries for follow-up.
- `GET /api/fees/balances/students/:studentId` (`shared/routes.ts:808`, `server/routes.ts:1614`): student ledger summary and reminders.
- `GET /api/fees/profiles` & `POST /api/fees/profiles` (`shared/routes.ts:815`/`820`, `server/routes.ts:1688`/`1692`): manage billing profiles used by automation.
- `POST /api/fees/generate-monthly` (`shared/routes.ts:827`, `server/routes.ts:1703`): idempotent batch generation with duplicate reporting.
- `GET /api/fees/report` (`shared/routes.ts:848`, `server/routes.ts:1716`): monthly/class/method breakdowns built with `shared/finance.ts:453`.
- Voucher endpoints (`/api/fees/vouchers/*` at `shared/routes.ts:859`–`898`, `server/routes.ts:1740`–`1842`): preview, start, monitor, and download bulk voucher jobs backed by the SSE-based job service (`server/services/voucherService.ts:26`).

## Business Rules
- Every invoice leverages `summarizeFeeLedger` (`shared/finance.ts:392`) to keep `paidAmount`, `remainingBalance`, and `status` in sync, so dashboard widgets and exports share the same logic.
- Duplicate prevention uses both code (`createFeeRecord` checks for `generatedMonth` at `server/storage.ts:1517`) and database uniqueness (`shared/schema.ts:247`), and the monthly generator tracks skipped/duplicate students (`server/storage.ts:1807`–`1835`).
- Payments cannot exceed `remainingBalance` (`server/storage.ts:1689`), and receipts use `buildDocumentNumber` (`shared/finance.ts:170`) with `financialSettings` prefixes (`shared/settings.ts:28`).
- `generateMonthlyFees` respects the `force` flag and `billingProfiles` active state, skipping students without a valid profile and surfacing the reasons to the caller/UI.
- The ledger report aggregates totals, collection rate, class breakdown, and outstanding/overdue counts so the accounting summary reflects receivables, collections, and delinquent buckets.

## Edge Cases & Validation
- Partial payments update the invoice status with `getFeeStatus` (`shared/finance.ts:377`) and the front end reflects the computation through `getFeeStatusClassName` (`client/src/lib/finance.ts:26`); `recordFeePayment` runs inside a transaction to avoid race conditions (`server/storage.ts:1682`).
- Duplicate generation is prevented by unique indexes (`shared/schema.ts:247`) and the `generateMonthly` flow’s `duplicateStudents` set (`server/storage.ts:1784`), while the UI also reports skipped IDs (`client/src/pages/admin/finance.tsx:461`).
- Refunds or adjustments are not yet modeled, so any “overpayment” path currently rejects at validation; future adjustments should reuse the payment schema and ledger helpers to keep `remainingBalance` consistent.
- Failed webhook calls or voucher jobs do not block the API; the voucher service catches errors, updates the operation row, and publishes SSE updates (`server/services/voucherService.ts:160`–`215`), while the download endpoint reflects archive availability (`server/routes.ts:1842`).
- Concurrent requests that mutate the same invoice lock via single-row transactions in `recordFeePayment` and `createFeeRecord`, so even if two admins try to pay the same invoice, the second will fail when it sees the updated `remainingBalance`.

## Future Enhancements
- Add a `fee_adjustments` table (type: discount, scholarship, fine) with references to `fees.id` and `students.id`, and reuse `lineItems` + `summarizeFeeLedger` so adjustments flow into reports and receipts without duplicating logic.
- Introduce automatic late-fee postings that use `financialSettings.lateFeePercentage` (`shared/settings.ts:28`) plus `isOverdue` (`shared/finance.ts:210`) to create line-item fines and a reminder to students.
- Integrate a payment gateway (Stripe/Paymob/Flutterwave) by storing `transactionId`, `paymentStatus`, and callback metadata in `fee_payments`, and expose a reconciliation view that compares gateway records with on-record receipts.
- Migrate voucher progress/tracking out of in-memory maps (`server/services/voucherService.ts:20`) into a durable queue (e.g., Redis streams or an async worker) so Vercel restarts cannot drop batch jobs.
- Surface downloadable ledger exports (CSV/PDF) built from `buildFinanceReportSnapshot` so finance teams can send monthly reports to auditors or parents.
- Hook `POST /api/fees/generate-monthly` to a scheduled cron (Vercel cron or external scheduler) while ensuring idempotency is preserved through the `generatedMonth` guard.

## Deployment Considerations (Vercel)
- The Express routes run inside Vercel’s serverless functions, so long-lived voucher threads must be managed carefully: the current `voucherService` spins up an asynchronous job, keeps SSE progress in memory, and stores ZIP blobs in an in-memory map (`server/services/voucherService.ts:26`–`:266`). For production, consider replacing the in-process job with a worker that writes progress back to `finance_voucher_operations` so the state survives cold starts, and store ZIPs in object storage rather than in-memory buffers.
- Database connections already rely on `pg.Pool` and Drizzle (`server/db.ts:1`), which reuse sockets across invocations; ensure the pool does not create too many clients by tuning `DATABASE_URL` and any environment-provided pool settings.
- Avoid long-running synchronous loops in Vercel functions—voucher loops already `await new Promise(setImmediate)` every few iterations, but heavy PDF generation should eventually delegate to a background worker if job times approach Vercel’s execution limits.
