/**
 * @component CollectionRateGauge
 * @description
 * Radial bar gauge showing the fee collection rate as a percentage of
 * total billed amount. Colour-coded by threshold (≥90% emerald, 70-89% amber, <70% rose).
 */

import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getGaugeColor(rate: number): string {
  if (rate >= 90) return "hsl(142 71% 45%)"; // emerald
  if (rate >= 70) return "hsl(38 92% 50%)";  // amber
  return "hsl(346 87% 57%)";                  // rose
}

function getRateLabel(rate: number): { text: string; className: string } {
  if (rate >= 90) return { text: "Excellent",       className: "text-emerald-600" };
  if (rate >= 70) return { text: "Moderate",        className: "text-amber-600" };
  return           { text: "Needs Attention",       className: "text-rose-600" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface CollectionRateGaugeProps {
  /** Total amount billed (from useFeeBalanceSummary) */
  totalBilled?: number;
  /** Total income from fees module (from usePeriodSummary) */
  totalCollected?: number;
  isLoading?: boolean;
}

export function CollectionRateGauge({
  totalBilled,
  totalCollected,
  isLoading,
}: CollectionRateGaugeProps) {
  const rate =
    totalBilled && totalBilled > 0 && totalCollected !== undefined
      ? Math.min(Math.round((totalCollected / totalBilled) * 100), 100)
      : 0;

  const color = getGaugeColor(rate);
  const { text: rateLabel, className: rateLabelClass } = getRateLabel(rate);

  const gaugeData = [
    { name: "collected", value: rate,       fill: color },
    { name: "remaining", value: 100 - rate, fill: "#f1f5f9" },
  ];

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">
          Fee Collection Rate
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center pb-4">
        {isLoading ? (
          <Skeleton className="h-40 w-40 rounded-full" />
        ) : (
          <div className="relative">
            <ResponsiveContainer width={160} height={160}>
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={72}
                startAngle={225}
                endAngle={-45}
                data={gaugeData}
                barSize={16}
              >
                <RadialBar
                  dataKey="value"
                  cornerRadius={8}
                  background={false}
                />
              </RadialBarChart>
            </ResponsiveContainer>

            {/* Centre label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums text-slate-800">
                {rate}%
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${rateLabelClass}`}>
                {rateLabel}
              </span>
            </div>
          </div>
        )}

        {/* Sub-labels */}
        {!isLoading && (
          <div className="mt-2 flex w-full justify-between px-2 text-[11px] text-slate-400">
            <span>
              Collected:{" "}
              <span className="font-semibold text-emerald-600">
                PKR {(totalCollected ?? 0).toLocaleString()}
              </span>
            </span>
            <span>
              Billed:{" "}
              <span className="font-semibold text-slate-600">
                PKR {(totalBilled ?? 0).toLocaleString()}
              </span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
