import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { FinanceVoucherProgressSnapshot } from "@shared/finance";

export interface VoucherProgressOperation extends FinanceVoucherProgressSnapshot {}

export interface UseVoucherProgressResult {
  operation: VoucherProgressOperation | null;
  isPolling: boolean;
  elapsedSeconds: number;
  progressPercent: number;
  isComplete: boolean;
  isFailed: boolean;
  connectionError: boolean;
  stopPolling: () => void;
}

function isTerminalStatus(status?: string | null) {
  return status === "completed"
    || status === "completed_with_errors"
    || status === "failed"
    || status === "cancelled";
}

function isLikelyNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return error.name === "TypeError"
    || message.includes("failed to fetch")
    || message.includes("network")
    || message.includes("load failed")
    || message.includes("fetch");
}

async function fetchProgress(operationId: number) {
  const response = await fetch(api.fees.vouchers.progress.path.replace(":operationId", String(operationId)));
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<VoucherProgressOperation>;
}

export function useVoucherProgress(operationId: number | null): UseVoucherProgressResult {
  const lastValidOperationRef = useRef<VoucherProgressOperation | null>(null);
  const consecutiveNetworkErrorsRef = useRef(0);
  const [connectionError, setConnectionError] = useState(false);
  const [shouldPoll, setShouldPoll] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setShouldPoll(true);
    setConnectionError(false);
    consecutiveNetworkErrorsRef.current = 0;
    lastValidOperationRef.current = null;
  }, [operationId]);

  const query = useQuery<VoucherProgressOperation>({
    queryKey: ["finance", "vouchers", "live-progress", operationId],
    queryFn: async () => {
      if (operationId === null) throw new Error("Operation id is required");

      try {
        const operation = await fetchProgress(operationId);
        consecutiveNetworkErrorsRef.current = 0;
        setConnectionError(false);
        return operation;
      } catch (error) {
        if (isLikelyNetworkError(error)) {
          consecutiveNetworkErrorsRef.current += 1;
          if (consecutiveNetworkErrorsRef.current >= 3) {
            setConnectionError(true);
          }
        } else {
          consecutiveNetworkErrorsRef.current = 0;
          setConnectionError(false);
        }
        throw error;
      }
    },
    enabled: operationId !== null && shouldPoll,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (queryState) => {
      if (operationId === null || !shouldPoll) return false;
      const current = (queryState.state.data as VoucherProgressOperation | undefined) ?? lastValidOperationRef.current;
      if (current && isTerminalStatus(current.status)) return false;
      return 1500;
    },
  });

  useEffect(() => {
    if (!query.data) return;
    lastValidOperationRef.current = query.data;
    if (isTerminalStatus(query.data.status)) {
      setShouldPoll(false);
    }
  }, [query.data]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const operation = query.data ?? lastValidOperationRef.current;
  const isComplete = operation?.status === "completed" || operation?.status === "completed_with_errors";
  const isFailed = operation?.status === "failed";

  const elapsedSeconds = useMemo(() => {
    if (!operation?.startedAt) return 0;
    const start = new Date(operation.startedAt).getTime();
    if (!Number.isFinite(start)) return 0;
    const end = isTerminalStatus(operation.status)
      ? new Date(operation.completedAt ?? operation.cancelledAt ?? now).getTime()
      : now;
    if (!Number.isFinite(end)) return 0;
    return Math.max(0, Math.floor((end - start) / 1000));
  }, [now, operation]);

  const progressPercent = useMemo(() => {
    if (!operation) return 0;
    const total = Math.max(operation.totalInvoices, 0);
    const accounted = operation.generatedCount + operation.skippedCount + operation.failedCount;
    if (total <= 0) return isTerminalStatus(operation.status) ? 100 : 0;
    return Math.min(100, Math.round((accounted / total) * 100));
  }, [operation]);

  return {
    operation,
    isPolling: shouldPoll && !isTerminalStatus(operation?.status) && operationId !== null,
    elapsedSeconds,
    progressPercent,
    isComplete,
    isFailed,
    connectionError,
    stopPolling: () => setShouldPoll(false),
  };
}
