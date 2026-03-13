import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "@shared/routes";
import type {
  FinanceVoucherOperationRecord,
  FinanceVoucherPreview,
  FinanceVoucherProgressSnapshot,
  FinanceVoucherStartInput,
} from "@shared/finance";

// ─── Query Keys ────────────────────────────────────────────────────────────────

const VOUCHER_KEYS = {
  all: ["finance", "vouchers"] as const,
  operations: (limit?: number) => [...VOUCHER_KEYS.all, "operations", limit] as const,
  operation: (id: number) => [...VOUCHER_KEYS.all, "operation", id] as const,
  progress: (id: number) => [...VOUCHER_KEYS.all, "progress", id] as const,
};

// ─── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Preview ───────────────────────────────────────────────────────────────────

export function useBulkVoucherPreview() {
  const queryClient = useQueryClient();
  return useMutation<FinanceVoucherPreview, Error, FinanceVoucherStartInput>({
    mutationFn: (input) =>
      apiFetch(api.fees.vouchers.preview.path, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VOUCHER_KEYS.all });
    },
  });
}

// ─── Start job ─────────────────────────────────────────────────────────────────

export function useStartBulkJob() {
  const queryClient = useQueryClient();
  return useMutation<FinanceVoucherOperationRecord, Error, FinanceVoucherStartInput>({
    mutationFn: (input) =>
      apiFetch(api.fees.vouchers.start.path, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VOUCHER_KEYS.all });
    },
  });
}

// ─── Recent operations ─────────────────────────────────────────────────────────

export function useRecentVoucherOperations(limit = 10) {
  return useQuery<FinanceVoucherOperationRecord[]>({
    queryKey: VOUCHER_KEYS.operations(limit),
    queryFn: () => apiFetch(`${api.fees.vouchers.recent.path}?limit=${limit}`),
    staleTime: 15_000,
  });
}

// ─── Single operation ──────────────────────────────────────────────────────────

export function useVoucherOperation(operationId: number | null) {
  return useQuery<FinanceVoucherOperationRecord>({
    queryKey: VOUCHER_KEYS.operation(operationId!),
    queryFn: () =>
      apiFetch(api.fees.vouchers.detail.path.replace(":operationId", String(operationId))),
    enabled: operationId !== null,
    staleTime: 5_000,
  });
}

// ─── Progress poll ─────────────────────────────────────────────────────────────

export function useVoucherProgress(operationId: number | null, enabled = true) {
  return useQuery<FinanceVoucherProgressSnapshot>({
    queryKey: VOUCHER_KEYS.progress(operationId!),
    queryFn: () =>
      apiFetch(api.fees.vouchers.progress.path.replace(":operationId", String(operationId))),
    enabled: enabled && operationId !== null,
    refetchInterval: (query) => {
      const phase = (query.state.data as FinanceVoucherProgressSnapshot | undefined)?.phase;
      if (phase === "completed" || phase === "failed" || phase === "cancelled") return false;
      return 1500;
    },
    staleTime: 0,
  });
}

// ─── Cancel job ────────────────────────────────────────────────────────────────

export function useCancelVoucherJob() {
  const queryClient = useQueryClient();
  return useMutation<FinanceVoucherOperationRecord, Error, number>({
    mutationFn: (jobId) =>
      apiFetch(api.fees.vouchers.cancel.path.replace(":operationId", String(jobId)), { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VOUCHER_KEYS.all });
    },
  });
}

// ─── Download helper ───────────────────────────────────────────────────────────

export function downloadVoucherZip(operationId: number) {
  const url = api.fees.vouchers.download.path.replace(":operationId", String(operationId));
  const a = document.createElement("a");
  a.href = url;
  a.download = `vouchers-job-${operationId}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── SSE hook (real-time progress) ────────────────────────────────────────────

export function useVoucherJobSse(
  operationId: number | null,
  onProgress: (snap: FinanceVoucherProgressSnapshot) => void,
) {
  const callbackRef = useRef(onProgress);
  callbackRef.current = onProgress;

  useEffect(() => {
    if (operationId === null) return;

    const url = api.fees.vouchers.events.path.replace(":operationId", String(operationId));
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const snap = JSON.parse(e.data as string) as FinanceVoucherProgressSnapshot;
        callbackRef.current(snap);
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => { es.close(); };

    return () => { es.close(); };
  }, [operationId]);
}
