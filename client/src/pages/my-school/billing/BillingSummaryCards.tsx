import { CreditCard, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BillingRecord } from "@/hooks/my-school/useBilling";

interface Props {
  records: BillingRecord[] | undefined;
  isLoading: boolean;
}

export function BillingSummaryCards({ records, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl bg-slate-100"
          />
        ))}
      </div>
    );
  }

  const paidRecords = records?.filter((r) => r.status === "PAID") ?? [];
  const pendingRecords = records?.filter((r) => r.status === "PENDING") ?? [];
  const overdueRecords = records?.filter((r) => r.status === "OVERDUE") ?? [];

  const totalPaid = paidRecords.reduce((sum, r) => sum + r.amountPaise, 0);
  const totalPending = pendingRecords.reduce((sum, r) => sum + r.amountPaise, 0);
  const totalOverdue = overdueRecords.reduce((sum, r) => sum + r.amountPaise, 0);

  const cards = [
    {
      label: "Total Paid",
      value: `Rs. ${(totalPaid / 100).toLocaleString()}`,
      sub: `${paidRecords.length} invoice${paidRecords.length === 1 ? "" : "s"}`,
      Icon: CheckCircle,
      colorClass: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Pending",
      value: `Rs. ${(totalPending / 100).toLocaleString()}`,
      sub: `${pendingRecords.length} invoice${pendingRecords.length === 1 ? "" : "s"}`,
      Icon: Clock,
      colorClass: "bg-amber-50 text-amber-700",
    },
    {
      label: "Overdue",
      value: `Rs. ${(totalOverdue / 100).toLocaleString()}`,
      sub: `${overdueRecords.length} invoice${overdueRecords.length === 1 ? "" : "s"}`,
      Icon: AlertTriangle,
      colorClass: "bg-red-50 text-red-700",
    },
    {
      label: "Total Billed",
      value: `Rs. ${((totalPaid + totalPending + totalOverdue) / 100).toLocaleString()}`,
      sub: `${records?.length ?? 0} total`,
      Icon: CreditCard,
      colorClass: "bg-slate-50 text-slate-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className={cn("rounded-2xl p-5", card.colorClass)}>
          <card.Icon className="mb-3 h-7 w-7 opacity-70" />
          <p className="text-sm font-medium opacity-80">{card.label}</p>
          <p className="text-2xl font-bold">{card.value}</p>
          <p className="text-xs mt-1 opacity-60">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
