/**
 * @tab WalletLedgerTab
 * @description
 * Admin view of all parent-wallet transactions across all students.
 * Uses the single efficient endpoint GET /api/ledger/wallet-transactions
 * which JOINs wallet_transactions → parent_wallets → users in one query.
 */

import { useState, useMemo } from "react";
import { ArrowDownCircle, ArrowUpCircle, Wallet, Hash, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WalletTxRow {
  id: number;
  walletId: number;
  amount: string;
  type: string;
  referenceId: number | null;
  description: string | null;
  createdBy: number | null;
  createdAt: string;
  studentId: number;
  studentName: string;
  balanceAfter: string;
}

interface WalletTxResponse {
  transactions: WalletTxRow[];
  total: number;
  summary: {
    totalDeposited: string;
    totalSpent: string;
    netBalance: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

function useWalletTransactions() {
  return useQuery<WalletTxResponse>({
    queryKey: ["/api/ledger/wallet-transactions"],
    queryFn: async () => {
      const res = await fetch("/api/ledger/wallet-transactions?limit=300", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const json = await res.json();
      return json.data ?? json;
    },
    staleTime: 3 * 60 * 1000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  deposit:     "Deposit",
  fee_payment: "Fee Payment",
  refund:      "Refund",
  adjustment:  "Adjustment",
};

const TYPE_COLORS: Record<string, string> = {
  deposit:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  fee_payment: "bg-blue-50 text-blue-700 border-blue-200",
  refund:      "bg-amber-50 text-amber-700 border-amber-200",
  adjustment:  "bg-slate-50 text-slate-600 border-slate-200",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-semibold ${TYPE_COLORS[type] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}
    >
      {TYPE_LABELS[type] ?? type}
    </Badge>
  );
}

function ColHead({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 first:pl-4 last:pr-4 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function TD({
  children,
  right,
  className = "",
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 first:pl-4 last:pr-4 ${right ? "text-right" : ""} ${className}`}>
      {children}
    </td>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export function WalletLedgerTab() {
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useWalletTransactions();
  const transactions = data?.transactions ?? [];
  const summary = data?.summary;

  // ── Client-side filtering ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = transactions;
    if (typeFilter) result = result.filter((tx) => tx.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.studentName?.toLowerCase().includes(q) ||
          tx.description?.toLowerCase().includes(q) ||
          String(tx.id).includes(q)
      );
    }
    return result;
  }, [transactions, typeFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Summary cards data ─────────────────────────────────────────────────────
  const totalDeposited = parseFloat(summary?.totalDeposited ?? "0");
  const totalSpent     = parseFloat(summary?.totalSpent     ?? "0");
  const netBalance     = parseFloat(summary?.netBalance     ?? "0");

  return (
    <div className="space-y-4">
      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Total Deposited",
            value: formatCurrency(totalDeposited),
            icon: ArrowDownCircle,
            color: "text-emerald-700",
            iconColor: "text-emerald-500",
            bg: "bg-emerald-50",
          },
          {
            label: "Total Spent",
            value: formatCurrency(totalSpent),
            icon: ArrowUpCircle,
            color: "text-rose-700",
            iconColor: "text-rose-500",
            bg: "bg-rose-50",
          },
          {
            label: "Net Balance",
            value: formatCurrency(netBalance),
            icon: Wallet,
            color: netBalance >= 0 ? "text-blue-700" : "text-rose-700",
            iconColor: netBalance >= 0 ? "text-blue-500" : "text-rose-500",
            bg: netBalance >= 0 ? "bg-blue-50" : "bg-rose-50",
          },
          {
            label: "Transactions",
            value: String(data?.total ?? 0),
            icon: Hash,
            color: "text-slate-700",
            iconColor: "text-slate-400",
            bg: "bg-slate-50",
          },
        ].map(({ label, value, icon: Icon, color, iconColor, bg }) => (
          <Card key={label} className="border-slate-100 shadow-sm">
            <CardContent className="p-3">
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      {label}
                    </p>
                    <p className={`mt-0.5 text-base font-bold tabular-nums ${color}`}>{value}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={typeFilter || "__all"}
          onValueChange={(v) => {
            setTypeFilter(v === "__all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all" className="text-xs">All Types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search student / description…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-8 w-52 pl-8 text-xs"
          />
        </div>

        <span className="ml-auto text-xs text-slate-400">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {isError && (
        <Card className="border-rose-100 bg-rose-50">
          <CardContent className="p-4 text-sm text-rose-700">
            Failed to load wallet transactions.{" "}
            {error instanceof Error ? error.message : "Please try again."}
          </CardContent>
        </Card>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <ColHead>#</ColHead>
              <ColHead>Date</ColHead>
              <ColHead>Student</ColHead>
              <ColHead>Type</ColHead>
              <ColHead>Description</ColHead>
              <ColHead right>Amount</ColHead>
              <ColHead right>Wallet Balance</ColHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                  {isError
                    ? "Unable to load transactions."
                    : transactions.length === 0
                    ? "No wallet transactions recorded yet."
                    : "No transactions match the selected filters."}
                </td>
              </tr>
            ) : (
              paginated.map((tx) => {
                const amt = parseFloat(tx.amount);
                const isCredit = amt > 0;
                return (
                  <tr key={tx.id} className="group transition-colors hover:bg-slate-50/60">
                    <TD className="font-mono text-slate-400">#{tx.id}</TD>
                    <TD className="text-slate-500">{formatDate(tx.createdAt)}</TD>
                    <TD className="font-medium text-slate-700">{tx.studentName}</TD>
                    <TD><TypeBadge type={tx.type} /></TD>
                    <TD className="max-w-[200px] truncate text-slate-500">
                      {tx.description ?? "—"}
                    </TD>
                    <TD
                      right
                      className={`tabular-nums font-semibold ${
                        isCredit ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {isCredit ? "+" : "−"}
                      {formatCurrency(Math.abs(amt))}
                    </TD>
                    <TD right className="tabular-nums text-slate-600">
                      {formatCurrency(parseFloat(tx.balanceAfter || "0"))}
                    </TD>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
