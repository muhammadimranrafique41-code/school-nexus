import { CreditCard, Clock } from "lucide-react";
import type { BillingRecord } from "@/hooks/my-school/useBilling";

interface Props {
  records: BillingRecord[] | undefined;
  isLoading: boolean;
}

export function BillingSummaryCards({ records, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-slate-100"
          />
        ))}
      </div>
    );
  }

  const totalPaid =
    records
      ?.filter((r) => r.status === "PAID")
      .reduce((sum, r) => sum + r.amountPaise, 0) ?? 0;

  const totalPending =
    records
      ?.filter((r) => r.status === "PENDING" || r.status === "OVERDUE")
      .reduce((sum, r) => sum + r.amountPaise, 0) ?? 0;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-700">
        <CreditCard className="mb-3 h-7 w-7 opacity-70" />
        <p className="text-sm font-medium opacity-80">Total Paid</p>
        <p className="text-2xl font-bold">
          Rs. {(totalPaid / 100).toLocaleString()}
        </p>
      </div>
      <div className="rounded-2xl bg-amber-50 p-5 text-amber-700">
        <Clock className="mb-3 h-7 w-7 opacity-70" />
        <p className="text-sm font-medium opacity-80">Platform Pending</p>
        <p className="text-2xl font-bold">
          Rs. {(totalPending / 100).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
