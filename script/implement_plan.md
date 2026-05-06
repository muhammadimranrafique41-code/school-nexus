# Implementation Plan: Student History Feature (Schooliee)

## 1. Objective
Production‑ready implementation of the **Student History** feature, providing a unified view of:
- Fee ledger (historical balances)
- Academic records (grades, classes, sessions)
- Class transitions (promotions, section changes)

Includes **RBAC**, **rate limiting**, **audit trails**, **client‑side hooks**, **UI components**, and **accessibility** improvements.

## 2. Prerequisites
- Existing codebase: Express + Drizzle ORM (PostgreSQL), React + TanStack Query.
- Migration script already written: `server/migrations/20250601_add_student_history_schema.sql`
- `AcademicRecordService` implemented (direct Drizzle queries, not storage).

## 3. Task Breakdown (Priority Order)

### ✅ 3.1 Execute Database Migration
- **File**: `server/migrations/20250601_add_student_history_schema.sql`
- **Action**: Create a one‑time migration runner (`run‑migration.ts`) that uses `db.execute()` to apply the SQL.
- **Outcome**: Tables `academic_records`, `class_transitions` and column `historical_balance` in `fees` exist. All indexes created.

### ✅ 3.2 Implement History Service
- **File**: `server/services/historyService.ts` (create)
- **Function**: `getStudentHistory(studentId: number)`
- **Logic**:
  - Fetch fees: `db.select().from(fees).where(eq(fees.studentId, studentId)).orderBy(desc(fees.billingPeriod))`
  - Fetch academic records: join `academic_records` with `classes` to get class name/grade.
  - Fetch transitions: `db.select().from(class_transitions).where(eq(class_transitions.studentId, studentId)).orderBy(asc(transition_date))`
- **Return**: `{ feeHistory, academicHistory, transitions }` (empty arrays if none).

### ✅ 3.3 Add API Endpoint
- **File**: `server/routes.ts`
- **Route**: `GET /api/student/history/:studentId`
- **Middleware**: 
  - `authMiddleware`
  - `hasPermission('student:history')` (see 3.4)
  - `financeRateLimiter` (see 3.5)
- **Validation**: `parseInt(studentId)` – 400 if invalid.
- **Response**: 
  - 200 with merged history
  - 403 if missing permission
  - 404 only if student does not exist (not if history is empty)
- **Logging**: Log each access (winston/pino).

### ✅ 3.4 Implement RBAC Middleware (if missing)
- **File**: `server/middleware/rbac.ts`
- **Function**: `hasPermission(permission: string)`
- **Logic**: Check `req.user.permissions` (from JWT). If missing or permission not present → 403 JSON `{ success: false, error: "Forbidden" }`.
- **Required permission**: `student:history`.

### ✅ 3.5 Add Rate Limiting for Financial Endpoints
- **File**: `server/middleware/rateLimiter.ts`
- **Library**: `express-rate-limit` (install if missing)
- **Config**: `windowMs: 60000`, `max: 120` requests per IP.
- **Apply to**: all routes `/api/fees/*`, `/api/vouchers/*`, `/api/student/history`.

### ✅ 3.6 Client‑Side Hook
- **File**: `client/src/hooks/useStudentHistory.ts`
- **Hook**: `useStudentHistory(studentId: number | null)`
- **Query**: `useQuery` from TanStack Query
- **Key**: `['studentHistory', studentId]`
- **Function**: fetch `/api/student/history/${studentId}`. Throw error if not ok.
- **Options**: `enabled: !!studentId`, `staleTime: 5 * 60 * 1000`, `retry: 1`.

### ✅ 3.7 UI Component: Student History
- **File**: `client/src/components/student/StudentHistory.tsx`
- **Props**: `{ studentId: number }`
- **Behaviour**:
  - Calls `useStudentHistory`
  - Loading state (spinner), error state (with retry button), data view.
- **Sections**:
  - **Fee Ledger**: table (Period, Amount, Balance)
  - **Academic Record**: list/table (Session, Grade, Class)
  - **Class Transitions**: list (Date, From → To)
- **Accessibility**: Semantic HTML, `aria-label`, `role="status"`, `role="alert"`.
- **Integration**: Add to `StudentDetailPage` under a “History” tab.

### ✅ 3.8 Audit Trail for Voucher Operations
- **File**: `server/services/auditService.ts` (create)
- **Function**: `logVoucherOperation(operationId, userId, action, details)`
- **Table**: `consolidatedVoucherAuditLog` (assumed schema).
- **Actions**: `'start'`, `'complete'`, `'error'`.
- **Integration**: Call from `voucherService.ts` before generating ZIP, on success, and in catch blocks.

### ✅ 3.9 Error Handling & Retry in `use-fees.ts`
- **File**: `client/src/hooks/use-fees.ts`
- **Improvements**:
  - Wrap all fetch calls in try/catch.
  - Retry transient errors (network, 5xx) with exponential backoff (max 3 retries).
  - Show user‑friendly error messages (no raw JSON).

### ✅ 3.10 Accessibility Polish
- **Files**: `VoucherCopy.tsx`, `BreakdownPanel.tsx`, any fee tables.
- **Changes**:
  - Add `role="table"` and `aria-label`.
  - All `<th>` elements must have `scope="col"`.
  - Use `aria-live="polite"` for dynamic updates.
  - Ensure focus management for modals.

## 4. Quality Requirements

| Area | Requirement |
|------|-------------|
| **TypeScript** | No `any` without justification; use Drizzle types from `shared/schema`. |
| **Error handling** | Never expose stack traces to client; log errors server‑side. |
| **Security** | Every financial/history endpoint must have `authMiddleware` + `hasPermission`. Rate limiting active in production. |
| **Testing (recommended)** | Unit tests for `HistoryService` (mocked DB). Integration test for endpoint using `supertest`. |

## 5. Deliverables
- All code changes applied to appropriate files.
- Existing modules must not break.
- Migration successfully executed (or clear instructions to run it).
- Brief summary of implemented tasks and any assumptions made.

## 6. Execution Mode
A senior developer (or AI assistant) shall execute the tasks **in order**, writing production‑ready code. After each task, confirm completion. If a decision is needed (e.g., migration runner), choose the simplest working solution and document it.

**Start with Task 3.1 (Execute Database Migration).**