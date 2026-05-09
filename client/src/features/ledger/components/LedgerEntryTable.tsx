/**
 * @component LedgerEntryTable
 * @description
 * Reusable paginated data table for ledger entries.
 * Displays entry-type badge, category, source module, description,
 * polymorphic reference, amount (colour-coded), and operator.
 */

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/finance/StatusBadge";
import type { LedgerEntry, LedgerEntriesPage } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatPkr(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

function capitalise(s: string | null): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ColHead({
  children,
  right,
  hidden,
}: {
  children: React.ReactNode;
  right?: boolean;
  hidden?: boolean;
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 first:pl-4 last:pr-4 ${right ? "text-right" : "text-left"} ${hidden ? "hidden md:table-cell" : ""}`}
    >
      {children}
    </th>
  );
}

function TD({
  children,
  right,
  className = "",
  hidden,
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
  hidden?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2 first:pl-4 last:pr-4 ${right ? "text-right" : ""} ${hidden ? "hidden md:table-cell" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-3 py-2.5 first:pl-4 last:pr-4">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface LedgerEntryTableProps {
  data?: LedgerEntriesPage;
  isLoading?: boolean;
  page: number;
  onPageChange: (page: number) => void;
}

export function LedgerEntryTable({
  data,
  isLoading,
  page,
  onPageChange,
}: LedgerEntryTableProps) {
  const entries = data?.entries ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-3">
      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <ColHead>Date</ColHead>
              <ColHead>Type</ColHead>
              <ColHead>Category</ColHead>
              <ColHead hidden>Module</ColHead>
              <ColHead>Description</ColHead>
              <ColHead hidden>Reference</ColHead>
              <ColHead right>Amount</ColHead>
              <ColHead hidden>Recorded By</ColHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
            ) : entries.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="py-12 text-center text-sm text-slate-400"
                >
                  No ledger entries found for the selected filters.
                </td>
              </tr>
            ) : (
              entries.map((entry) => <LedgerEntryRow key={entry.id} entry={entry} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => onPageChange(Math.max(1, page - 1))}
                className={page <= 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-3 py-1 text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                className={page >= totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row component
// ─────────────────────────────────────────────────────────────────────────────

function LedgerEntryRow({ entry }: { entry: LedgerEntry }) {
  const amount = parseFloat(entry.amount);
  const isIncome = entry.entryType === "income";

  return (
    <tr className="group transition-colors hover:bg-slate-50/60">
      {/* Date */}
      <TD className="font-mono text-slate-500">
        {formatDate(entry.transactionDate)}
      </TD>

      {/* Type badge */}
      <TD>
        <StatusBadge status={entry.entryType} />
      </TD>

      {/* Category */}
      <TD>
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
          {capitalise(entry.category)}
        </span>
      </TD>

      {/* Module (hidden on mobile) */}
      <TD hidden>
        {entry.sourceModule ? (
          <Badge variant="outline" className="text-[10px] font-medium text-slate-500 border-slate-200">
            {capitalise(entry.sourceModule)}
          </Badge>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </TD>

      {/* Description */}
      <TD>
        <span
          className="block max-w-[220px] truncate text-slate-700"
          title={entry.description ?? undefined}
        >
          {entry.description || <span className="text-slate-300 italic">No description</span>}
        </span>
      </TD>

      {/* Reference (hidden on mobile) */}
      <TD hidden>
        {entry.referenceType && entry.referenceId ? (
          <span className="font-mono text-[10px] text-slate-400">
            {entry.referenceType}#{entry.referenceId}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </TD>

      {/* Amount */}
      <TD right>
        <span
          className={`font-semibold tabular-nums ${
            isIncome ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {isIncome ? "+" : "−"} {formatPkr(amount)}
        </span>
      </TD>

      {/* Recorded By (hidden on mobile) */}
      <TD hidden className="text-slate-400">
        {entry.createdBy ? `User #${entry.createdBy}` : "System"}
      </TD>
    </tr>
  );
}
