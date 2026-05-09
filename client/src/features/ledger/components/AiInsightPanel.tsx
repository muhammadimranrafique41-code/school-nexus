/**
 * @component AiInsightPanel
 * @description
 * Inline AI financial insight card for the CashFlowTab.
 * Surfaces a concise 3-4 bullet summary from the AI assistant without
 * requiring navigation to the standalone AI page.
 *
 * Behaviour:
 *  - Not auto-fetched on mount (avoids unnecessary API calls).
 *  - "Generate Insight" button triggers the mutation.
 *  - Collapsed state is persisted in localStorage.
 *  - "Open Full Assistant →" links to /admin/ai-assistant.
 */

import { useState, useEffect } from "react";
import { Sparkles, RefreshCw, X, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLedgerAiInsight } from "../hooks/use-ledger-ai-insight";
import type { DateRange, PeriodSummary } from "../types";

const STORAGE_KEY = "ledger_ai_panel_collapsed";

interface AiInsightPanelProps {
  dateRange: DateRange;
  periodSummary?: PeriodSummary;
}

export function AiInsightPanel({ dateRange, periodSummary }: AiInsightPanelProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const insight = useLedgerAiInsight({ dateRange, periodSummary });

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore storage errors
    }
  }

  // Reset insight when date range changes
  useEffect(() => {
    insight.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.from, dateRange.to]);

  if (collapsed) {
    return (
      <button
        onClick={toggleCollapse}
        className="flex w-full items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" />
        AI Financial Insight
        <span className="ml-auto text-indigo-400">Show</span>
      </button>
    );
  }

  return (
    <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-3 px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold text-slate-700">AI Financial Insight</span>
        </div>
        <button
          onClick={toggleCollapse}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          aria-label="Collapse AI panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Content area */}
        {insight.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
            <Skeleton className="h-3.5 w-4/6" />
          </div>
        ) : insight.isError ? (
          <p className="text-xs text-rose-600">
            Failed to generate insight. Please try again.
          </p>
        ) : insight.data ? (
          <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
            {insight.data.answer}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">
            Click "Generate Insight" to get an AI-powered summary of the selected period's
            financial performance.
          </p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            onClick={() => insight.mutate()}
            disabled={insight.isPending}
          >
            {insight.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {insight.data ? "Refresh" : "Generate Insight"}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-slate-500 hover:text-indigo-600"
            asChild
          >
            <Link href="/admin/ai-assistant">
              <ExternalLink className="h-3 w-3" />
              Full Assistant
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
