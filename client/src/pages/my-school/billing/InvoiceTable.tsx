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
          <p className="text-lg font-medium">No invoices found</p>
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
                <TableRow key={record.id} className="hover:bg-slate-50">
                  <TableCell className="text-sm font-medium text-slate-900">
                    {MONTH_NAMES[record.billingMonth - 1] ?? "Unknown"}
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {record.billingYear}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-slate-900">
                    Rs. {(record.amountPaise / 100).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        statusBadgeClass(record.status)
                      )}
                    >
                      {record.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {record.dueDate}
                  </TableCell>
                  <TableCell>
                    {(record.status === "PENDING" || record.status === "OVERDUE") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={payLoading[record.id]}
                        onClick={() => handlePay(record)}
                      >
                        {payLoading[record.id] ? "Processing..." : "Pay now"}
                      </Button>
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
