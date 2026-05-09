/**
 * @component CashFlowSummaryCards
 * @description
 * Three KPI cards displaying total income, total expense, and net cash flow
 * for the selected date range. Colour-coded by financial direction.
 */

import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PeriodSummary } from "../types";

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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClass: string;
  iconBg: string;
}

function KpiCard({ label, value, icon, valueClass, iconBg }: KpiCardProps) {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {label}
          </p>
          <p className={`mt-0.5 text-xl font-bold tabular-nums ${valueClass}`}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCardSkeleton() {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-32" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface CashFlowSummaryCardsProps {
  data?: PeriodSummary;
  isLoading?: boolean;
}

export function CashFlowSummaryCards({ data, isLoading }: CashFlowSummaryCardsProps) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
      </div>
    );
  }

  const net = parseFloat(data.netCashFlow);
  const isPositive = net >= 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <KpiCard
        label="Total Income"
        value={formatPkr(data.totalIncome)}
        icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
        valueClass="text-emerald-700"
        iconBg="bg-emerald-50"
      />
      <KpiCard
        label="Total Expense"
        value={formatPkr(data.totalExpense)}
        icon={<TrendingDown className="h-5 w-5 text-rose-600" />}
        valueClass="text-rose-700"
        iconBg="bg-rose-50"
      />
      <KpiCard
        label="Net Cash Flow"
        value={formatPkr(data.netCashFlow)}
        icon={
          <Activity
            className={`h-5 w-5 ${isPositive ? "text-emerald-600" : "text-rose-600"}`}
          />
        }
        valueClass={isPositive ? "text-emerald-700" : "text-rose-700"}
        iconBg={isPositive ? "bg-emerald-50" : "bg-rose-50"}
      />
    </div>
  );
}
