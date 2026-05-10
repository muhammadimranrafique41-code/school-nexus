/**
 * @module payrollReconciliationJob
 * @description
 * Scheduled reconciliation job that ensures parity between the `salary_payments`
 * table and the unified `ledger` table.
 *
 * The job runs on a configurable cron schedule (default: daily at 02:00 server
 * time) and performs the following steps:
 *
 *  1. Query all `salary_payments` rows that have NO corresponding `ledger` entry
 *     (identified via `referenceType = 'salary_payment'` + `referenceId`).
 *  2. For each unreconciled payment, call
 *     `payrollService.postMissingLedgerEntry()` which posts the entry using the
 *     original `paymentDate` as the effective date — preserving the correct
 *     accounting period.
 *  3. Emit structured log lines so the result is visible in application logs and
 *     can be picked up by log-aggregation tools (e.g. Datadog, CloudWatch).
 *  4. Return a summary object that callers (e.g. the manual `/api/payroll/reconcile`
 *     endpoint) can forward to the client.
 *
 * Scheduling
 * ──────────
 * The job is registered via `node-cron` when `startPayrollReconciliationJob()`
 * is called from `server/index.ts` (or `server/app.ts`).  The cron expression
 * is read from the `PAYROLL_RECONCILE_CRON` environment variable so it can be
 * overridden per environment without a code change.
 *
 * Default schedule: `0 2 * * *`  (every day at 02:00 local server time)
 *
 * @example
 * ```ts
 * // In server/index.ts or server/app.ts:
 * import { startPayrollReconciliationJob } from "./services/payrollReconciliationJob.js";
 * startPayrollReconciliationJob();
 * ```
 */

import cron from "node-cron";
import { payrollService } from "./payrollService.js";

// node-cron v4 does not export ScheduledTask as a named type; use ReturnType.
type ScheduledTask = ReturnType<typeof cron.schedule>;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconciliationResult {
  runAt: string;
  durationMs: number;
  unreconciledFound: number;
  reconciledCount: number;
  failedCount: number;
  results: Array<{
    paymentId: number;
    staffId: number;
    paymentMonth: string;
    status: "posted" | "failed";
    error?: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core reconciliation logic (exported so the HTTP endpoint can call it too)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs a full payroll ↔ ledger reconciliation pass.
 *
 * This function is intentionally decoupled from the cron scheduler so it can
 * be invoked directly from:
 *  - The cron job (scheduled execution)
 *  - The `POST /api/payroll/reconcile` HTTP endpoint (manual trigger)
 *  - Integration tests
 *
 * @returns A `ReconciliationResult` summary.
 */
export async function runPayrollReconciliation(): Promise<ReconciliationResult> {
  const runAt = new Date().toISOString();
  const startMs = Date.now();

  console.log(`[PayrollReconciliation] Starting reconciliation run at ${runAt}`);

  // Step 1: Find unreconciled payments
  let unreconciled;
  try {
    unreconciled = await payrollService.findUnreconciledPayments();
  } catch (err) {
    console.error("[PayrollReconciliation] Failed to query unreconciled payments:", err);
    throw err;
  }

  console.log(
    `[PayrollReconciliation] Found ${unreconciled.length} unreconciled salary payment(s).`
  );

  if (unreconciled.length === 0) {
    const durationMs = Date.now() - startMs;
    console.log(
      `[PayrollReconciliation] Nothing to reconcile. Run completed in ${durationMs}ms.`
    );
    return {
      runAt,
      durationMs,
      unreconciledFound: 0,
      reconciledCount: 0,
      failedCount: 0,
      results: [],
    };
  }

  // Step 2: Post missing ledger entries
  const results: ReconciliationResult["results"] = [];

  for (const payment of unreconciled) {
    try {
      await payrollService.postMissingLedgerEntry(payment);

      console.log(
        `[PayrollReconciliation] ✓ Posted ledger entry for salary_payment #${payment.id} ` +
          `(staff #${payment.staffId}, month: ${payment.paymentMonth})`
      );

      results.push({
        paymentId: payment.id,
        staffId: payment.staffId,
        paymentMonth: String(payment.paymentMonth),
        status: "posted",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      console.error(
        `[PayrollReconciliation] ✗ Failed to post ledger entry for salary_payment #${payment.id}: ` +
          errorMessage
      );

      results.push({
        paymentId: payment.id,
        staffId: payment.staffId,
        paymentMonth: String(payment.paymentMonth),
        status: "failed",
        error: errorMessage,
      });
    }
  }

  const reconciledCount = results.filter((r) => r.status === "posted").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const durationMs = Date.now() - startMs;

  console.log(
    `[PayrollReconciliation] Run complete in ${durationMs}ms — ` +
      `${reconciledCount} posted, ${failedCount} failed.`
  );

  return {
    runAt,
    durationMs,
    unreconciledFound: unreconciled.length,
    reconciledCount,
    failedCount,
    results,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron scheduler
// ─────────────────────────────────────────────────────────────────────────────

let scheduledTask: ScheduledTask | null = null;

/**
 * Registers the payroll reconciliation cron job.
 *
 * Safe to call multiple times — subsequent calls are no-ops if the job is
 * already running.
 *
 * @param cronExpression - Optional override for the cron schedule.
 *   Defaults to the `PAYROLL_RECONCILE_CRON` env var, or `"0 2 * * *"`.
 */
export function startPayrollReconciliationJob(cronExpression?: string): void {
  if (scheduledTask) {
    console.log("[PayrollReconciliation] Cron job already registered — skipping.");
    return;
  }

  const expression =
    cronExpression ??
    process.env.PAYROLL_RECONCILE_CRON ??
    "0 2 * * *"; // default: 02:00 daily

  if (!cron.validate(expression)) {
    console.error(
      `[PayrollReconciliation] Invalid cron expression: "${expression}". Job not started.`
    );
    return;
  }

  scheduledTask = cron.schedule(expression, async () => {
    try {
      const result = await runPayrollReconciliation();
      if (result.failedCount > 0) {
        console.warn(
          `[PayrollReconciliation] ${result.failedCount} entries failed to reconcile — ` +
            `check logs for details.`
        );
      }
    } catch (err) {
      console.error("[PayrollReconciliation] Unhandled error during scheduled run:", err);
    }
  });

  console.log(
    `[PayrollReconciliation] Cron job registered with schedule: "${expression}"`
  );
}

/**
 * Stops the scheduled cron job.  Primarily used in tests to clean up.
 */
export function stopPayrollReconciliationJob(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[PayrollReconciliation] Cron job stopped.");
  }
}
