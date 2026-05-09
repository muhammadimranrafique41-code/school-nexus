/**
 * @component MonthlyRevenueChart
 * @description
 * Grouped bar chart showing income vs expense per calendar month.
 * Uses the existing ChartContainer / ChartTooltip wrappers from
 * client/src/components/ui/chart.tsx (Recharts-based).
 */

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CashFlowSummaryRow, MonthlyBarDatum } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function toBarData(rows: CashFlowSummaryRow[]): MonthlyBarDatum[] {
  // API returns newest-first; reverse for chronological display
  return [...rows].reverse().map((r) => ({
    label: `${MONTH_ABBR[r.month - 1]} ${String(r.year).slice(2)}`,
    income:  parseFloat(r.totalIncome),
    expense: parseFloat(r.totalExpense),
    net:     parseFloat(r.netCashFlow),
  }));
}

function formatPkr(value: number): string {
  if (value >= 1_000_000) return `PKR ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `PKR ${(value / 1_000).toFixed(0)}K`;
  return `PKR ${value.toFixed(0)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom tooltip
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const income  = payload.find((p: any) => p.dataKey === "income")?.value ?? 0;
  const expense = payload.find((p: any) => p.dataKey === "expense")?.value ?? 0;
  const net     = income - expense;

  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-lg text-xs">
      <p className="mb-2 font-semibold text-slate-700">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Income
          </span>
          <span className="font-semibold text-emerald-700">{formatPkr(income)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
            Expense
          </span>
          <span className="font-semibold text-rose-700">{formatPkr(expense)}</span>
        </div>
        <div className="mt-1.5 border-t border-slate-100 pt-1.5 flex items-center justify-between gap-6">
          <span className="text-slate-500">Net</span>
          <span className={`font-bold ${net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {formatPkr(net)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface MonthlyRevenueChartProps {
  data?: CashFlowSummaryRow[];
  isLoading?: boolean;
}

export function MonthlyRevenueChart({ data, isLoading }: MonthlyRevenueChartProps) {
  const chartData = useMemo(() => (data ? toBarData(data) : []), [data]);

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">
          Monthly Revenue vs Expenses
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">
            No data for the selected period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="28%"
              barGap={3}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatPkr}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: "#64748b", paddingTop: 8 }}
              />
              <Bar
                dataKey="income"
                name="Income"
                fill="hsl(142 71% 45%)"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="expense"
                name="Expense"
                fill="hsl(346 87% 57%)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
