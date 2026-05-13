import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const data = [
  { month: "Jan", income: 40000, expense: 24000 },
  { month: "Feb", income: 30000, expense: 28000 },
  { month: "Mar", income: 50000, expense: 32000 },
  { month: "Apr", income: 45000, expense: 35000 },
  { month: "May", income: 55000, expense: 38000 },
  { month: "Jun", income: 48000, expense: 42000 },
];

interface Props {
  isLoading: boolean;
}

export function PerformanceChart({ isLoading }: Props) {
  const [mode, setMode] = useState<"income" | "expense">("income");

  if (isLoading) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  return (
    <Card className="border-slate-200/80 bg-white shadow-none">
      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
        <CardTitle className="text-sm font-semibold text-slate-900">
          Campus Performance Over Time
        </CardTitle>
        <div className="flex gap-1">
          <Button
            variant={mode === "income" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("income")}
          >
            Income
          </Button>
          <Button
            variant={mode === "expense" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("expense")}
          >
            Expense
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <Tooltip />
            <Legend />
            {mode === "income" ? (
              <Bar
                dataKey="income"
                fill="#22c55e"
                name="Income"
                radius={[4, 4, 0, 0]}
              />
            ) : (
              <Bar
                dataKey="expense"
                fill="#ef4444"
                name="Expense"
                radius={[4, 4, 0, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
