import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, ExternalLink, AlertCircle } from "lucide-react";
import type { BillingRecord } from "@/hooks/my-school/useBilling";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TABS = [
  { label: "All", value: undefined, key: "all" },
  { label: "Paid", value: "PAID", key: "paid" },
  { label: "Unpaid", value: "PENDING", key: "unpaid" },
] as const;

interface Props {
  records: BillingRecord[] | undefined;
  isLoading: boolean;
  selectedTab: string | undefined;
  onTabChange: (tab: string | undefined) => void;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "PAID":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20";
    case "PENDING":
      return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20";
    case "OVERDUE":
      return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20";
    case "CANCELLED":
      return "bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-300/20";
    default:
      return "bg-slate-50 text-slate-700";
  }
}

function formatPaise(paise: number): string {
  return `Rs. ${(paise / 100).toLocaleString()}`;
}

function daysFromNow(dateStr: string): string {
  const now = new Date();
  const due = new Date(dateStr);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`;
  if (diffDays === 0) return "Due today";
  return `${diffDays} day${diffDays === 1 ? "" : "s"} left`;
}

function daysFromNowClass(dateStr: string): string {
  const now = new Date();
  const due = new Date(dateStr);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "text-red-600 font-medium";
  if (diffDays <= 3) return "text-amber-600 font-medium";
  return "text-slate-500";
}

export function InvoiceTable({
  records,
  isLoading,
  selectedTab,
  onTabChange,
}: Props) {
  const [payLoading, setPayLoading] = useState<Record<number, boolean>>({});

  const handlePay = async (record: BillingRecord) => {
    setPayLoading((prev) => ({ ...prev, [record.id]: true }));
    try {
      const res = await apiRequest("POST", `/api/owner/billing/${record.id}/pay`);
      const body = await res.json();
      if (!body.success) throw new Error(body.error?.message ?? "Payment initiation failed");
      const { checkoutUrl, formParams } = body.data;
      const form = document.createElement("form");
      form.method = "POST";
      form.action = checkoutUrl;
      form.style.display = "none";
      for (const [key, value] of Object.entries(formParams)) {
        const input = document.createElement("input");
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error("Pay error", err);
    } finally {
      setPayLoading((prev) => ({ ...prev, [record.id]: false }));
    }
  };

  const filtered =
    selectedTab && records
      ? records.filter(
          (r) => r.status === selectedTab || (selectedTab === "PENDING" && r.status === "OVERDUE")
        )
      : records;

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((tab) => {
          const count =
            tab.value === undefined
              ? records?.length ?? 0
              : records?.filter(
                  (r) =>
                    r.status === tab.value ||
                    (tab.value === "PENDING" && r.status === "OVERDUE")
                ).length ?? 0;

          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                selectedTab === tab.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {tab.label}
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-sm text-slate-400">
          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          <p className="text-lg font-medium">All caught up!</p>
          <p>No invoices to display.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-xs font-semibold uppercase text-slate-500">
                  Month
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">
                  Year
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">
                  Amount
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">
                  Status
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">
                  Due Date
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((record) => (
                <TableRow
                  key={record.id}
                  className={cn(
                    "hover:bg-slate-50 transition-colors",
                    record.status === "OVERDUE" && "bg-red-50/40"
                  )}
                >
                  <TableCell className="text-sm font-medium text-slate-900">
                    {MONTH_NAMES[record.billingMonth - 1] ?? "Unknown"}
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {record.billingYear}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-slate-900">
                    {formatPaise(record.amountPaise)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        statusBadgeClass(record.status)
                      )}
                    >
                      {record.status === "PAID" && <CheckCircle2 className="h-3 w-3" />}
                      {record.status === "OVERDUE" && <AlertCircle className="h-3 w-3" />}
                      {record.status === "PAID" ? "Paid" : record.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    <span className="block">{record.dueDate}</span>
                    {record.status !== "PAID" && record.status !== "CANCELLED" && (
                      <span className={cn("text-xs", daysFromNowClass(record.dueDate))}>
                        {daysFromNow(record.dueDate)}
                      </span>
                    )}
                    {record.paidAt && (
                      <span className="block text-xs text-emerald-600">
                        Paid {new Date(record.paidAt).toLocaleDateString("en-PK")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {(record.status === "PENDING" || record.status === "OVERDUE") && (
                      <Button
                        size="sm"
                        className={cn(
                          "gap-1.5 transition-all",
                          record.status === "OVERDUE"
                            ? "bg-red-600 hover:bg-red-700 text-white"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white"
                        )}
                        disabled={payLoading[record.id]}
                        onClick={() => handlePay(record)}
                      >
                        {payLoading[record.id] ? (
                          "Processing..."
                        ) : (
                          <>
                            Pay {formatPaise(record.amountPaise)}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </>
                        )}
                      </Button>
                    )}
                    {record.status === "PAID" && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Receipt
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
