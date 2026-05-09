/**
 * @component CategoryBreakdownChart
 * @description
 * Pie chart showing income/expense distribution by financial category
 * (fee, salary, fund, expense, other) for the selected date range.
 */

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryBreakdownRow, CategoryPieDatum } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Colour palette
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  fee:     "hsl(142 71% 45%)",  // emerald
  salary:  "hsl(221 83% 53%)",  // blue
  fund:    "hsl(262 83% 58%)",  // violet
  expense: "hsl(346 87% 57%)",  // rose
  other:   "hsl(215 16% 47%)",  // slate
};

function colorFor(category: string): string {
  return CATEGORY_COLORS[category] ?? "hsl(215 16% 47%)";
}

function formatPkr(value: number): string {
  if (value >= 1_000_000) return `PKR ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `PKR ${(value / 1_000).toFixed(0)}K`;
  return `PKR ${value.toFixed(0)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data transformation
// ─────────────────────────────────────────────────────────────────────────────

function toChartData(rows: CategoryBreakdownRow[]): CategoryPieDatum[] {
  // Aggregate by category (sum income + expense for a total-flow view)
  const map = new Map<string, number>();
  for (const row of rows) {
    const prev = map.get(row.category) ?? 0;
    map.set(row.category, prev + parseFloat(row.total));
  }

  const total = Array.from(map.values()).reduce((s, v) => s + v, 0);

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: colorFor(name),
      percentage: total > 0 ? Math.round((value / total) * 100) : 0,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom tooltip
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value, percentage } = payload[0].payload as CategoryPieDatum;
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-2.5 shadow-lg text-xs">
      <p className="font-semibold text-slate-700">{name}</p>
      <p className="text-slate-500">{formatPkr(value)}</p>
      <p className="text-slate-400">{percentage}% of total</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryBreakdownChartProps {
  data?: CategoryBreakdownRow[];
  isLoading?: boolean;
}

export function CategoryBreakdownChart({ data, isLoading }: CategoryBreakdownChartProps) {
  const chartData = useMemo(() => (data ? toChartData(data) : []), [data]);

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">
          Category Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-52 w-full rounded-lg" />
        ) : chartData.length === 0 ? (
          <div className="flex h-52 items-center justify-center text-sm text-slate-400">
            No data for the selected period.
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {/* Pie */}
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={72}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Legend */}
            <ul className="flex-1 space-y-2">
              {chartData.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.name}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums">
                    {item.percentage}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
