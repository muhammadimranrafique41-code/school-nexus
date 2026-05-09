/**
 * @module use-ledger
 * @description
 * TanStack Query hooks for all Ledger API endpoints.
 *
 * Stale-time strategy:
 *  - Aggregated views (cash-flow-summary, period-summary, breakdowns): 5 min
 *  - Granular entry list: 2 min
 * All hooks explicitly override the global `staleTime: Infinity` default so
 * that financial data reflects recent transactions without a full page reload.
 */

import { useQuery } from "@tanstack/react-query";
import type {
  CashFlowSummaryRow,
  CategoryBreakdownRow,
  LedgerEntriesPage,
  LedgerFilter,
  ModuleBreakdownRow,
  PeriodSummary,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Retry helpers (mirrors the pattern in client/src/hooks/use-fees.ts)
// ─────────────────────────────────────────────────────────────────────────────

function shouldRetry(failureCount: number, error: unknown, maxRetries = 3): boolean {
  if (failureCount >= maxRetries) return false;
  const message = error instanceof Error ? error.message : String(error);
  if (/\b4\d{2}\b/.test(message)) return false; // never retry 4xx
  return true;
}

function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// URL builders
// ─────────────────────────────────────────────────────────────────────────────

function buildLedgerEntriesUrl(filters: LedgerFilter): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.entryType) params.set("entryType", filters.entryType);
  if (filters.sourceModule) params.set("sourceModule", filters.sourceModule);
  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));
  return `/api/ledger/entries?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Monthly cash-flow aggregates from the `cash_flow_summary` view.
 * Used by MonthlyRevenueChart and CashFlowTab.
 */
export function useCashFlowSummary(limit = 12) {
  return useQuery<CashFlowSummaryRow[]>({
    queryKey: ["/api/ledger/cash-flow-summary", limit],
    queryFn: async () => {
      const res = await fetch(`/api/ledger/cash-flow-summary?limit=${limit}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const json = await res.json();
      return json.data ?? json;
    },
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
    retryDelay,
  });
}

/**
 * KPI totals (totalIncome, totalExpense, netCashFlow) for a date range.
 * Used by CashFlowSummaryCards.
 */
export function usePeriodSummary(from: string, to: string) {
  return useQuery<PeriodSummary>({
    queryKey: ["/api/ledger/period-summary", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/ledger/period-summary?from=${from}&to=${to}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const json = await res.json();
      return json.data ?? json;
    },
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(from && to),
    retry: shouldRetry,
    retryDelay,
  });
}

/**
 * Per-category income/expense totals for a date range.
 * Used by CategoryBreakdownChart.
 */
export function useCategoryBreakdown(from: string, to: string) {
  return useQuery<CategoryBreakdownRow[]>({
    queryKey: ["/api/ledger/category-breakdown", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/ledger/category-breakdown?from=${from}&to=${to}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const json = await res.json();
      return json.data ?? json;
    },
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(from && to),
    retry: shouldRetry,
    retryDelay,
  });
}

/**
 * Per-source-module income/expense totals for a date range.
 * Used by ModuleBreakdown widget.
 */
export function useModuleBreakdown(from: string, to: string) {
  return useQuery<ModuleBreakdownRow[]>({
    queryKey: ["/api/ledger/module-breakdown", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/ledger/module-breakdown?from=${from}&to=${to}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const json = await res.json();
      return json.data ?? json;
    },
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(from && to),
    retry: shouldRetry,
    retryDelay,
  });
}

/**
 * Paginated ledger entry list with optional filters.
 * Used by LedgerRegisterTab.
 */
export function useLedgerEntries(filters: LedgerFilter) {
  const url = buildLedgerEntriesUrl(filters);
  return useQuery<LedgerEntriesPage>({
    queryKey: [url],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const json = await res.json();
      return json.data ?? json;
    },
    staleTime: 2 * 60 * 1000,
    retry: shouldRetry,
    retryDelay,
  });
}
