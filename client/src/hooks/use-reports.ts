import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getResponseErrorMessage } from "@/lib/utils";

const REPORTS_API = {
  definitions: {
    list: "/api/reports/definitions",
    create: "/api/reports/definitions",
    update: (id: number) => `/api/reports/definitions/${id}`,
    delete: (id: number) => `/api/reports/definitions/${id}`,
  },
  history: {
    list: "/api/reports/history",
    byDefinition: (id: number) => `/api/reports/history/definition/${id}`,
    record: "/api/reports/history",
    incrementDownload: (id: number) => `/api/reports/history/${id}/download`,
  },
  cache: {
    clean: "/api/reports/cache/clean",
  },
};

export type ReportCategory = "academic" | "fee" | "finance" | "attendance";

export type ReportDefinition = {
  id: number;
  name: string;
  category: ReportCategory;
  description: string | null;
  parameters: string[] | null;
  queryTemplate: string | null;
  createdAt: string;
};

export type ReportHistory = {
  id: number;
  reportDefinitionId: number | null;
  generatedBy: number | null;
  parametersUsed: Record<string, unknown> | null;
  fileUrl: string | null;
  fileSize: number | null;
  generatedAt: string;
  downloadCount: number;
};

export type ReportCache = {
  id: number;
  reportKey: string;
  generatedAt: string;
  expiresAt: string | null;
};

// ── Definitions ────────────────────────────────────────────────

export function useReportDefinitions() {
  return useQuery<ReportDefinition[]>({
    queryKey: [REPORTS_API.definitions.list],
    queryFn: async () => {
      const res = await fetch(REPORTS_API.definitions.list, {
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to fetch report definitions")
        );
      const json = await res.json();
      return json.data ?? json;
    },
  });
}

export function useCreateReportDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      category: ReportCategory;
      description?: string | null;
      parameters?: string[] | null;
      queryTemplate?: string | null;
    }) => {
      const res = await fetch(REPORTS_API.definitions.create, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to create report definition")
        );
      const json = await res.json();
      return json.data ?? json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REPORTS_API.definitions.list] });
    },
  });
}

export function useUpdateReportDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: number;
      name?: string;
      category?: ReportCategory;
      description?: string | null;
      parameters?: string[] | null;
      queryTemplate?: string | null;
    }) => {
      const res = await fetch(REPORTS_API.definitions.update(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to update report definition")
        );
      const json = await res.json();
      return json.data ?? json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REPORTS_API.definitions.list] });
    },
  });
}

export function useDeleteReportDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(REPORTS_API.definitions.delete(id), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to delete report definition")
        );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REPORTS_API.definitions.list] });
    },
  });
}

// ── History ────────────────────────────────────────────────────

export function useReportHistory() {
  return useQuery<ReportHistory[]>({
    queryKey: [REPORTS_API.history.list],
    queryFn: async () => {
      const res = await fetch(REPORTS_API.history.list, {
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to fetch report history")
        );
      const json = await res.json();
      return json.data ?? json;
    },
  });
}

export function useReportHistoryByDefinition(definitionId: number | null) {
  return useQuery<ReportHistory[]>({
    queryKey: [REPORTS_API.history.byDefinition(definitionId ?? 0)],
    enabled: !!definitionId,
    queryFn: async () => {
      const res = await fetch(
        REPORTS_API.history.byDefinition(definitionId!),
        { credentials: "include" }
      );
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to fetch report history")
        );
      const json = await res.json();
      return json.data ?? json;
    },
  });
}

export function useRecordReportGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      reportDefinitionId: number | null;
      parametersUsed?: Record<string, unknown> | null;
      fileUrl?: string | null;
      fileSize?: number | null;
    }) => {
      const res = await fetch(REPORTS_API.history.record, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to record generation")
        );
      const json = await res.json();
      return json.data ?? json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REPORTS_API.history.list] });
    },
  });
}

export function useIncrementDownloadCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(REPORTS_API.history.incrementDownload(id), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to record download")
        );
      const json = await res.json();
      return json.data ?? json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REPORTS_API.history.list] });
    },
  });
}

// ── Cache ──────────────────────────────────────────────────────

export function useCleanReportCache() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(REPORTS_API.cache.clean, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to clean report cache")
        );
      const json = await res.json();
      return json.data ?? json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REPORTS_API.history.list] });
    },
  });
}

// ── Financial Dashboard Report Types & Hooks ────────────────────────────

export interface MonthlyFeeSummaryRow {
  month: string;
  totalBilled: number;
  totalCollected: number;
  totalOutstanding: number;
}

export interface MonthlyFundSummaryRow {
  month: string;
  fundType: string;
  collected: number;
}

export interface MonthlyPnLRow {
  month: string;
  totalRevenue: number;
  totalExpenditure: number;
  netProfit: number;
}

export interface OverdueFeeEntry {
  studentId: number;
  name: string;
  className: string;
  totalPastDue: number;
}

export interface DailyFeeCollectionRow {
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  studentReference: string;
}

const FINANCIAL_REPORTS_API = {
  monthlyFeeSummary: "/api/reports/financial/monthly-fee-summary",
  monthlyFundsSummary: "/api/reports/financial/monthly-funds-summary",
  monthlyPnL: "/api/reports/financial/monthly-pnl",
  overdueFeesSnapshot: "/api/reports/financial/overdue-fees-snapshot",
  dailyFeeCollection: "/api/reports/financial/daily-fee-collection",
};

function useFinancialReport<T>(key: string, url: string) {
  return useQuery<T[]>({
    queryKey: [key],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to fetch financial report")
        );
      const json = await res.json();
      return json.data ?? json;
    },
  });
}

export function useMonthlyFeeSummary() {
  return useFinancialReport<MonthlyFeeSummaryRow>(
    FINANCIAL_REPORTS_API.monthlyFeeSummary,
    FINANCIAL_REPORTS_API.monthlyFeeSummary,
  );
}

export function useMonthlyFundsSummary() {
  return useFinancialReport<MonthlyFundSummaryRow>(
    FINANCIAL_REPORTS_API.monthlyFundsSummary,
    FINANCIAL_REPORTS_API.monthlyFundsSummary,
  );
}

export function useMonthlyPnL() {
  return useFinancialReport<MonthlyPnLRow>(
    FINANCIAL_REPORTS_API.monthlyPnL,
    FINANCIAL_REPORTS_API.monthlyPnL,
  );
}

export function useOverdueFeesSnapshot() {
  return useFinancialReport<OverdueFeeEntry>(
    FINANCIAL_REPORTS_API.overdueFeesSnapshot,
    FINANCIAL_REPORTS_API.overdueFeesSnapshot,
  );
}

export function useDailyFeeCollection() {
  return useFinancialReport<DailyFeeCollectionRow>(
    FINANCIAL_REPORTS_API.dailyFeeCollection,
    FINANCIAL_REPORTS_API.dailyFeeCollection,
  );
}
