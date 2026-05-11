/**
 * @tab FeeCollectionTab
 * @description
 * Student fee records with status indicators, row actions, and voucher workflow.
 * Reuses existing fee hooks and finance utilities.
 */

import { useState, useMemo } from "react";
import { Eye, ReceiptText, Printer, FileText } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFees, useFeeBalanceSummary } from "@/hooks/use-fees";
import { useStudents } from "@/hooks/use-users";
import { useClasses } from "@/hooks/use-classes";
import { formatCurrency, openPrintWindow } from "@/lib/utils";
import { buildInvoicePrintHtml, getFeeStatusClassName } from "@/lib/finance";
import type { FeeRecord } from "@/hooks/use-fees";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadgeInline({ status }: { status: FeeRecord["status"] }) {
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold ${getFeeStatusClassName(status)}`}>
      {status}
    </Badge>
  );
}

function ColHead({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`whitespace-nowrap border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 first:pl-4 last:pr-4 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function TD({ children, right, className = "" }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <td className={`px-3 py-2 first:pl-4 last:pr-4 ${right ? "text-right" : ""} ${className}`}>
      {children}
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export function FeeCollectionTab() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: fees = [], isLoading: feesLoading } = useFees();
  const { data: balanceSummary } = useFeeBalanceSummary();
  const { data: classes = [] } = useClasses();

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = fees;
    if (statusFilter) result = result.filter((f) => f.status === statusFilter);
    if (classFilter)  result = result.filter((f) => f.student?.className === classFilter);
    if (monthFilter)  result = result.filter((f) => f.billingMonth === monthFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.student?.name?.toLowerCase().includes(q) ||
          f.invoiceNumber?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [fees, statusFilter, classFilter, monthFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalBilled    = (balanceSummary as any)?.totalBilled    ?? (balanceSummary as any)?.totalAmount    ?? 0;
  const totalCollected = (balanceSummary as any)?.totalCollected ?? (balanceSummary as any)?.totalPaid      ?? 0;
  const totalOutstanding = (balanceSummary as any)?.totalOutstanding ?? (balanceSummary as any)?.totalBalance ?? 0;

  // ── Unique months for filter ───────────────────────────────────────────────
  const months = useMemo(
    () => Array.from(new Set(fees.map((f) => f.billingMonth).filter(Boolean))).sort().reverse(),
    [fees]
  );

  return (
    <div className="space-y-4">
      {/* ── Summary row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Billed",      value: totalBilled,      color: "text-slate-700" },
          { label: "Total Collected",   value: totalCollected,   color: "text-emerald-700" },
          { label: "Total Outstanding", value: totalOutstanding, color: "text-rose-700" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border-slate-100 shadow-sm">
            <CardContent className="p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
              <p className={`mt-0.5 text-lg font-bold tabular-nums ${color}`}>
                {formatCurrency(value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status */}
        <Select value={statusFilter || "__all"} onValueChange={(v) => { setStatusFilter(v === "__all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all" className="text-xs">All Statuses</SelectItem>
            {["Paid", "Partially Paid", "Unpaid", "Overdue"].map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Class */}
        <Select value={classFilter || "__all"} onValueChange={(v) => { setClassFilter(v === "__all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all" className="text-xs">All Classes</SelectItem>
            {(Array.isArray(classes) ? classes : []).map((c: any) => (
              <SelectItem key={c.id} value={c.name || c.grade || String(c.id)} className="text-xs">{c.name ?? `${c.grade ?? ""} ${c.section ?? ""}`.trim()}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Month */}
        <Select value={monthFilter || "__all"} onValueChange={(v) => { setMonthFilter(v === "__all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Months" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all" className="text-xs">All Months</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <Input
          placeholder="Search student / invoice…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="h-8 w-48 text-xs"
        />

        {/* Generate Vouchers */}
        <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5 text-xs" asChild>
          <Link href="/admin/finance/vouchers/generate">
            <FileText className="h-3.5 w-3.5" />
            Generate Vouchers
          </Link>
        </Button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <ColHead>Invoice #</ColHead>
              <ColHead>Student</ColHead>
              <ColHead>Month</ColHead>
              <ColHead>Due Date</ColHead>
              <ColHead>Status</ColHead>
              <ColHead right>Amount</ColHead>
              <ColHead right>Paid</ColHead>
              <ColHead right>Balance</ColHead>
              <ColHead>Actions</ColHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {feesLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-slate-400">
                  No fee records match the selected filters.
                </td>
              </tr>
            ) : (
              paginated.map((fee) => (
                <tr
                  key={fee.id}
                  className={`group transition-colors hover:bg-slate-50/60 ${
                    fee.status === "Overdue" ? "bg-red-50/20" : ""
                  }`}
                >
                  <TD className="font-mono text-slate-500">{fee.invoiceNumber ?? `#${fee.id}`}</TD>
                  <TD className="font-medium text-slate-700">{fee.student?.name ?? "—"}</TD>
                  <TD className="text-slate-500">{fee.billingMonth}</TD>
                  <TD className="text-slate-500">{fee.dueDate}</TD>
                  <TD><StatusBadgeInline status={fee.status} /></TD>
                  <TD right className="tabular-nums text-slate-700">{formatCurrency(fee.amount)}</TD>
                  <TD right className="tabular-nums text-emerald-700">{formatCurrency(fee.paidAmount)}</TD>
                  <TD right className={`tabular-nums font-semibold ${fee.remainingBalance > 0 ? "text-rose-700" : "text-slate-400"}`}>
                    {formatCurrency(fee.remainingBalance)}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" asChild title="View Statement">
                        <Link href={`/admin/finance/statement/${fee.studentId}`}>
                          <Eye className="h-3.5 w-3.5 text-slate-400" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Print Invoice"
                        onClick={() => { const title = "Invoice " + (fee.invoiceNumber ?? ("#" + fee.id)); openPrintWindow(title, buildInvoicePrintHtml(fee as any), { documentType: "invoice" }); }}
                      >
                        <Printer className="h-3.5 w-3.5 text-slate-400" />
                      </Button>
                    </div>
                  </TD>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{filtered.length} records</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
