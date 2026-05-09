/**
 * @tab CashFlowTab
 * @description
 * Primary financial overview tab for the Ledger module.
 *
 * Layout (top-to-bottom):
 *  1. DateRangePicker — defaults to current calendar month
 *  2. CashFlowSummaryCards — three KPI cards (income / expense / net)
 *  3. MonthlyRevenueChart — full-width 12-month bar chart
 *  4. Two-column grid: CategoryBreakdownChart (left) + CollectionRateGauge + AiInsightPanel (right)
 */

import { useState } from "react";
import { DateRangePicker, getDefaultDateRange } from "../components/DateRangePicker";
import { CashFlowSummaryCards } from "../components/CashFlowSummaryCards";
import { MonthlyRevenueChart } from "../components/MonthlyRevenueChart";
import { CategoryBreakdownChart } from "../components/CategoryBreakdownChart";
import { CollectionRateGauge } from "../components/CollectionRateGauge";
import { AiInsightPanel } from "../components/AiInsightPanel";
import { useCashFlowSummary, useCategoryBreakdown, usePeriodSummary } from "../hooks/use-ledger";
import { useFeeBalanceSummary } from "@/hooks/use-fees";
import type { DateRange } from "../types";

export function CashFlowTab() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: cashFlowRows, isLoading: cashFlowLoading } = useCashFlowSummary(12);
  const { data: periodSummary, isLoading: periodLoading } = usePeriodSummary(
    dateRange.from,
    dateRange.to
  );
  const { data: categoryRows, isLoading: categoryLoading } = useCategoryBreakdown(
    dateRange.from,
    dateRange.to
  );
  const { data: feeBalanceSummary } = useFeeBalanceSummary();

  // Derive collection rate inputs
  const totalBilled = feeBalanceSummary
    ? (feeBalanceSummary as any).totalBilled ?? (feeBalanceSummary as any).totalAmount ?? 0
    : 0;
  const totalCollected = periodSummary
    ? parseFloat(periodSummary.totalIncome)
    : 0;

  return (
    <div className="space-y-5">
      {/* ── Date range filter ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-400">
          Showing data for{" "}
          <span className="font-medium text-slate-600">
            {dateRange.from} → {dateRange.to}
          </span>
        </p>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <CashFlowSummaryCards
        data={periodSummary}
        isLoading={periodLoading}
      />

      {/* ── Monthly bar chart ─────────────────────────────────────────────── */}
      <MonthlyRevenueChart
        data={cashFlowRows}
        isLoading={cashFlowLoading}
      />

      {/* ── Bottom two-column grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left: category pie */}
        <CategoryBreakdownChart
          data={categoryRows}
          isLoading={categoryLoading}
        />

        {/* Right: gauge + AI panel stacked */}
        <div className="space-y-4">
          <CollectionRateGauge
            totalBilled={totalBilled}
            totalCollected={totalCollected}
            isLoading={periodLoading}
          />
          <AiInsightPanel
            dateRange={dateRange}
            periodSummary={periodSummary}
          />
        </div>
      </div>
    </div>
  );
}
