/**
 * @component StatusBadge
 * @description
 * Unified status badge for fee invoice states and ledger entry types.
 * Extend the CONFIG map to add new statuses without changing the component API.
 */

import { Badge } from "@/components/ui/badge";

// ─────────────────────────────────────────────────────────────────────────────
// Status registry
// ─────────────────────────────────────────────────────────────────────────────

type Status =
  // Wallet / fee statuses (original)
  | "overdue"
  | "current"
  | "advance"
  | "paid"
  // Fee invoice statuses (unified)
  | "unpaid"
  | "partially_paid"
  // Ledger entry-type statuses
  | "income"
  | "expense";

const CONFIG: Record<Status, { label: string; className: string }> = {
  // ── Wallet statuses ──────────────────────────────────────────────────────
  overdue:        { label: "OVERDUE",         className: "bg-red-100 text-red-700 border-red-200" },
  current:        { label: "CURRENT",         className: "bg-blue-100 text-blue-700 border-blue-200" },
  advance:        { label: "ADVANCE",         className: "bg-green-100 text-green-700 border-green-200" },
  paid:           { label: "PAID",            className: "bg-slate-100 text-slate-500 border-slate-200" },

  // ── Fee invoice statuses ─────────────────────────────────────────────────
  unpaid:         { label: "UNPAID",          className: "bg-amber-100 text-amber-700 border-amber-200" },
  partially_paid: { label: "PARTIALLY PAID",  className: "bg-blue-100 text-blue-700 border-blue-200" },

  // ── Ledger entry-type badges ─────────────────────────────────────────────
  income:         { label: "INCOME",          className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  expense:        { label: "EXPENSE",         className: "bg-rose-100 text-rose-700 border-rose-200" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const { label, className: baseClass } = CONFIG[status] ?? CONFIG.current;
  return (
    <Badge
      variant="outline"
      className={`text-xs font-semibold ${baseClass} ${className}`}
    >
      {label}
    </Badge>
  );
}

// Re-export the Status type for consumers
export type { Status as BadgeStatus };
