/**
 * @module use-ledger-ai-insight
 * @description
 * TanStack Query mutation hook that calls the existing `/api/ai/chat` endpoint
 * with a finance-context prompt derived from the current date range and
 * aggregated ledger totals.
 *
 * The insight is NOT auto-fetched on mount — it is triggered explicitly by the
 * user clicking "Generate Insight" in AiInsightPanel to avoid unnecessary API
 * calls on every tab visit.
 */

import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DateRange, PeriodSummary } from "../types";

interface AiInsightResult {
  answer: string;
  sources?: string[];
}

interface UseLedgerAiInsightOptions {
  dateRange: DateRange;
  /** Optional pre-fetched period summary to enrich the prompt context. */
  periodSummary?: PeriodSummary;
}

/**
 * Returns a mutation that, when called, sends a finance-context prompt to the
 * AI assistant and resolves with the assistant's answer string.
 *
 * Usage:
 * ```tsx
 * const insight = useLedgerAiInsight({ dateRange, periodSummary });
 * <button onClick={() => insight.mutate()}>Generate Insight</button>
 * {insight.data?.answer && <p>{insight.data.answer}</p>}
 * ```
 */
export function useLedgerAiInsight({
  dateRange,
  periodSummary,
}: UseLedgerAiInsightOptions) {
  return useMutation<AiInsightResult>({
    mutationFn: async () => {
      // Build a context-rich prompt using available financial data.
      const contextLines: string[] = [
        `Analyse the school's financial position for the period ${dateRange.from} to ${dateRange.to}.`,
      ];

      if (periodSummary) {
        const income = parseFloat(periodSummary.totalIncome).toLocaleString("en-PK", {
          style: "currency",
          currency: "PKR",
          maximumFractionDigits: 0,
        });
        const expense = parseFloat(periodSummary.totalExpense).toLocaleString("en-PK", {
          style: "currency",
          currency: "PKR",
          maximumFractionDigits: 0,
        });
        const net = parseFloat(periodSummary.netCashFlow).toLocaleString("en-PK", {
          style: "currency",
          currency: "PKR",
          maximumFractionDigits: 0,
        });
        contextLines.push(
          `Total income for the period: ${income}.`,
          `Total expenses for the period: ${expense}.`,
          `Net cash flow: ${net}.`
        );
      }

      contextLines.push(
        "Focus on: fee collection rate, overdue invoices, salary expenses, and net cash flow.",
        "Be concise — respond with 3 to 4 bullet points. Use plain text, no markdown headers."
      );

      const response = await apiRequest("POST", "/api/ai/chat", {
        message: contextLines.join(" "),
        history: [],
      });

      return response.json() as Promise<AiInsightResult>;
    },
  });
}
