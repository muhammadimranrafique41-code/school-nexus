/**
 * @file StudentHistory.tsx
 * @description Unified Student History panel displaying:
 *   - Fee Ledger (billing period, amount, balance, status)
 *   - Academic Records (session, grade, class)
 *   - Class Transitions (date, from → to)
 *
 * Accessibility:
 *   - Semantic `<table>` elements with `role="table"` and `aria-label`
 *   - All `<th>` elements carry `scope="col"`
 *   - Loading state uses `role="status"` with `aria-live="polite"`
 *   - Error state uses `role="alert"`
 *   - Focus is managed on retry button via `autoFocus`
 */

import { useStudentHistory } from "@/hooks/useStudentHistory";
import { Loader2, AlertCircle, RefreshCw, History, BookOpen, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-PK", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const feeStatusClass: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Unpaid: "bg-rose-50 text-rose-700 border-rose-200",
  "Partially Paid": "bg-amber-50 text-amber-700 border-amber-200",
  Overdue: "bg-red-50 text-red-700 border-red-200",
};

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <span className="ml-auto text-xs text-slate-400 tabular-nums">{count} record{count !== 1 ? "s" : ""}</span>
    </div>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="py-6 text-center text-sm text-slate-400 italic"
      >
        {message}
      </td>
    </tr>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

interface StudentHistoryProps {
  /** The `users.id` of the student whose history to display. */
  studentId: number;
  className?: string;
}

// ── Main component ─────────────────────────────────────────────────────────

/**
 * Renders the complete history for a student in three sections:
 * Fee Ledger, Academic Records, and Class Transitions.
 */
export function StudentHistory({ studentId, className }: StudentHistoryProps) {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useStudentHistory(studentId);

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading student history"
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-16 text-slate-500",
          className
        )}
      >
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" aria-hidden="true" />
        <p className="text-sm">Loading history…</p>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (isError) {
    const message =
      error instanceof Error
        ? error.message
        : "An unexpected error occurred while loading history.";

    return (
      <div
        role="alert"
        aria-live="assertive"
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-xl border border-rose-200 bg-rose-50 py-12 px-6 text-center",
          className
        )}
      >
        <AlertCircle className="h-8 w-8 text-rose-500" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-rose-700">Failed to load history</p>
          <p className="mt-1 text-xs text-rose-600">{message}</p>
        </div>
        <button
          type="button"
          autoFocus
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-xs font-medium text-rose-700 shadow-sm hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 disabled:opacity-50"
          aria-label="Retry loading student history"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden="true" />
          {isFetching ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  const feeHistory = data?.feeHistory ?? [];
  const academicHistory = data?.academicHistory ?? [];
  const transitions = data?.transitions ?? [];

  return (
    <div
      className={cn("space-y-8", className)}
      aria-label="Student history"
    >
      {/* ── Fee Ledger ─────────────────────────────────────────────────── */}
      <section aria-labelledby="fee-ledger-heading">
        <SectionHeading
          icon={History}
          title="Fee Ledger"
          count={feeHistory.length}
        />
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table
            role="table"
            aria-label="Fee ledger history"
            className="w-full text-sm"
          >
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left">Period</th>
                <th scope="col" className="px-4 py-3 text-left">Description</th>
                <th scope="col" className="px-4 py-3 text-right">Amount</th>
                <th scope="col" className="px-4 py-3 text-right">Paid</th>
                <th scope="col" className="px-4 py-3 text-right">Balance</th>
                <th scope="col" className="px-4 py-3 text-left">Due Date</th>
                <th scope="col" className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody
              aria-live="polite"
              className="divide-y divide-slate-100 bg-white"
            >
              {feeHistory.length === 0 ? (
                <EmptyRow colSpan={7} message="No fee records found." />
              ) : (
                feeHistory.map((fee) => (
                  <tr key={fee.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {fee.billingPeriod}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">
                      {fee.description}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">
                      {formatCurrency(fee.amount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                      {formatCurrency(fee.paidAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-700">
                      {formatCurrency(fee.remainingBalance)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(fee.dueDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          feeStatusClass[fee.status] ?? "bg-slate-50 text-slate-600 border-slate-200"
                        )}
                      >
                        {fee.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Academic Records ───────────────────────────────────────────── */}
      <section aria-labelledby="academic-records-heading">
        <SectionHeading
          icon={BookOpen}
          title="Academic Records"
          count={academicHistory.length}
        />
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table
            role="table"
            aria-label="Academic records history"
            className="w-full text-sm"
          >
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left">Academic Year</th>
                <th scope="col" className="px-4 py-3 text-left">Class</th>
                <th scope="col" className="px-4 py-3 text-left">Grade</th>
                <th scope="col" className="px-4 py-3 text-left">Session Start</th>
                <th scope="col" className="px-4 py-3 text-left">Session End</th>
              </tr>
            </thead>
            <tbody
              aria-live="polite"
              className="divide-y divide-slate-100 bg-white"
            >
              {academicHistory.length === 0 ? (
                <EmptyRow colSpan={5} message="No academic records found." />
              ) : (
                academicHistory.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {record.academicYear}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {record.className ?? "—"}
                      {record.classStream && (
                        <span className="ml-1 text-xs text-slate-400">
                          ({record.classStream})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-indigo-700">
                      {record.grade ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(record.sessionStart)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(record.sessionEnd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Class Transitions ──────────────────────────────────────────── */}
      <section aria-labelledby="class-transitions-heading">
        <SectionHeading
          icon={ArrowRightLeft}
          title="Class Transitions"
          count={transitions.length}
        />
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table
            role="table"
            aria-label="Class transition history"
            className="w-full text-sm"
          >
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left">Date</th>
                <th scope="col" className="px-4 py-3 text-left">From</th>
                <th scope="col" className="px-4 py-3 text-left">To</th>
                <th scope="col" className="px-4 py-3 text-left">Reason</th>
                <th scope="col" className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody
              aria-live="polite"
              className="divide-y divide-slate-100 bg-white"
            >
              {transitions.length === 0 ? (
                <EmptyRow colSpan={5} message="No class transitions recorded." />
              ) : (
                transitions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(t.transitionDate)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {t.fromClassName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      <span className="flex items-center gap-1.5">
                        <ArrowRightLeft className="h-3 w-3 text-slate-400" aria-hidden="true" />
                        {t.toClassName ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {t.reason ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">
                      {t.notes ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
