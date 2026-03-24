import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  WifiOff,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadVoucherZip } from "@/hooks/use-bulk-vouchers";
import { useVoucherProgress } from "@/hooks/use-voucher-progress";
import { formatArchiveSize, formatBillingMonth, formatElapsed } from "@/lib/voucher-progress";

interface VoucherGenerationProgressProps {
  operationId: number;
  onComplete?: () => void;
  onRetry?: () => void;
  onViewOperationsLog?: () => void;
  className?: string;
}

function StatusBanner({
  operationId,
  label,
  elapsedSeconds,
  tone,
}: {
  operationId: number;
  label: string;
  elapsedSeconds: number;
  tone: "running" | "done" | "failed";
}) {
  const styles = {
    running: {
      wrap: "border-blue-200/70 bg-blue-50/80 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100",
      stripe: "from-blue-500 via-cyan-400 to-blue-500",
      icon: <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-300" />,
    },
    done: {
      wrap: "border-emerald-200/70 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100",
      stripe: "from-emerald-500 via-lime-400 to-emerald-500",
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />,
    },
    failed: {
      wrap: "border-rose-200/70 bg-rose-50/80 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100",
      stripe: "from-rose-500 via-orange-400 to-rose-500",
      icon: <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-300" />,
    },
  } as const;

  return (
    <div className={cn("overflow-hidden rounded-2xl border", styles[tone].wrap)}>
      <div className={cn("h-1.5 w-full animate-pulse bg-gradient-to-r", styles[tone].stripe)} />
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 shadow-sm ring-1 ring-black/5 dark:bg-slate-900/60 dark:ring-white/10">
            {styles[tone].icon}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">Voucher Operation</p>
            <p className="text-sm font-semibold">#{operationId} - {label}</p>
          </div>
        </div>
        <div className="rounded-xl bg-white/70 px-3 py-2 text-sm shadow-sm ring-1 ring-black/5 dark:bg-slate-900/60 dark:ring-white/10">
          <span className="text-xs uppercase tracking-[0.18em] opacity-60">Elapsed</span>
          <p className="font-semibold tabular-nums">{formatElapsed(elapsedSeconds)}</p>
        </div>
      </div>
    </div>
  );
}

function ProgressMeter({ accounted, total, percent }: { accounted: number; total: number; percent: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">Progress</span>
        <span className="tabular-nums text-slate-500 dark:text-slate-400">{accounted}/{total} ({percent}%)</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500"
          style={{ width: `${percent}%`, transition: "width 0.4s ease-in-out" }}
        />
      </div>
    </div>
  );
}

function CurrentCard({
  isArchiving,
  invoiceNumber,
  studentName,
  message,
}: {
  isArchiving: boolean;
  invoiceNumber?: string | null;
  studentName?: string | null;
  message?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-950/70">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          {isArchiving ? <FileText className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Current</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isArchiving
              ? "Assembling archive..."
              : (invoiceNumber || studentName)
                ? `${invoiceNumber ?? "Pending invoice"} - ${studentName ?? "Preparing student"}`
                : "Preparing voucher batch..."}
          </p>
          {message ? <p className="text-xs text-slate-500 dark:text-slate-400">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}

function StatsRow({
  generatedCount,
  skippedCount,
  failedCount,
  totalInvoices,
}: {
  generatedCount: number;
  skippedCount: number;
  failedCount: number;
  totalInvoices: number;
}) {
  const items = [
    { label: "Generated", value: generatedCount, tone: "text-emerald-600 dark:text-emerald-300" },
    { label: "Skipped", value: skippedCount, tone: "text-amber-600 dark:text-amber-300" },
    { label: "Failed", value: failedCount, tone: failedCount > 0 ? "text-rose-600 dark:text-rose-300" : "text-slate-500 dark:text-slate-400" },
    { label: "Total", value: totalInvoices, tone: "text-slate-900 dark:text-slate-100" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", item.tone)}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function LiveLog({
  entries,
}: {
  entries: Array<{
    at: string;
    invoiceId?: number | null;
    studentName?: string | null;
    billingMonth?: string | null;
    result: "generated" | "skipped" | "failed";
    error?: string | null;
  }>;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-950/70">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Live Log</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Structured invoice events as they arrive.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          {entries.length} entries
        </span>
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            No log entries yet.
          </div>
        ) : entries.map((entry, index) => {
          const key = `${entry.at}-${entry.invoiceId ?? "none"}-${index}`;
          const isExpanded = Boolean(expandedKeys[key]);
          const label = entry.result === "generated"
            ? "OK"
            : entry.result === "skipped"
              ? "SKIP"
              : "FAIL";
          const tones = entry.result === "generated"
            ? "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
            : entry.result === "skipped"
              ? "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
              : "border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100";

          return (
            <div key={key} className={cn("rounded-xl border px-3 py-2", tones)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <span className="mr-2 rounded-md border border-current/20 px-1.5 py-0.5 text-[10px] font-semibold">{label}</span>
                    {entry.studentName ?? "System event"}
                  </p>
                  <p className="mt-0.5 text-xs opacity-80">
                    {formatBillingMonth(entry.billingMonth)}{entry.invoiceId ? ` - Invoice #${entry.invoiceId}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] opacity-70">
                  {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {entry.result === "failed" && entry.error ? (
                <div className="mt-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium opacity-90"
                    onClick={() => setExpandedKeys((current) => ({ ...current, [key]: !isExpanded }))}
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {isExpanded ? "Hide error" : "Show error"}
                  </button>
                  {isExpanded ? (
                    <div className="mt-2 rounded-lg bg-black/5 px-3 py-2 text-xs dark:bg-white/5">
                      {entry.error}
                    </div>
                  ) : null}
                </div>
              ) : entry.error ? (
                <p className="mt-2 text-xs opacity-90">{entry.error}</p>
              ) : null}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function CompletionPanel({
  message,
  archiveSizeBytes,
  elapsedSeconds,
  showWarning,
  operationId,
  onViewOperationsLog,
}: {
  message?: string | null;
  archiveSizeBytes: number;
  elapsedSeconds: number;
  showWarning: boolean;
  operationId: number;
  onViewOperationsLog?: () => void;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-4",
      showWarning
        ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30"
        : "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/30",
    )}>
      <div className="flex items-start gap-3">
        <CheckCircle2 className={cn("mt-0.5 h-5 w-5 shrink-0", showWarning ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300")} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {showWarning ? "Completed with warnings" : "Archive ready"}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{message ?? "Voucher archive assembled successfully."}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
            <span>Archive size: {formatArchiveSize(archiveSizeBytes)}</span>
            <span>Duration: {formatElapsed(elapsedSeconds)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500" onClick={() => downloadVoucherZip(operationId)}>
          <Download className="h-4 w-4" />
          Download ZIP
        </Button>
        <Button variant="outline" className="gap-2" onClick={onViewOperationsLog}>
          <FileText className="h-4 w-4" />
          View Operations Log
        </Button>
      </div>
    </div>
  );
}

function FailedPanel({
  message,
  onRetry,
  onViewOperationsLog,
}: {
  message?: string | null;
  onRetry?: () => void;
  onViewOperationsLog?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 dark:border-rose-900/60 dark:bg-rose-950/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-300" />
        <div>
          <p className="text-sm font-semibold text-rose-900 dark:text-rose-100">Generation failed</p>
          <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">{message ?? "The voucher generation job stopped before completion."}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button className="gap-2 bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
        <Button variant="outline" className="gap-2" onClick={onViewOperationsLog}>
          <FileText className="h-4 w-4" />
          View Operations Log
        </Button>
      </div>
    </div>
  );
}

export function VoucherGenerationProgress({
  operationId,
  onComplete,
  onRetry,
  onViewOperationsLog,
  className,
}: VoucherGenerationProgressProps) {
  const {
    operation,
    isPolling,
    elapsedSeconds,
    progressPercent,
    isComplete,
    isFailed,
    connectionError,
  } = useVoucherProgress(operationId);

  const notifiedRef = useRef(false);

  useEffect(() => {
    notifiedRef.current = false;
  }, [operationId]);

  useEffect(() => {
    if (!isComplete || notifiedRef.current) return;
    notifiedRef.current = true;
    onComplete?.();
  }, [isComplete, onComplete]);

  const accounted = useMemo(
    () => (operation ? operation.generatedCount + operation.skippedCount + operation.failedCount : 0),
    [operation],
  );

  if (!operation) {
    return (
      <div className={cn("rounded-2xl border border-slate-200 bg-white/90 p-6 text-center dark:border-slate-800 dark:bg-slate-950/70", className)}>
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-blue-500" />
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Loading voucher progress...</p>
      </div>
    );
  }

  const bannerTone = isFailed ? "failed" : isComplete ? "done" : "running";
  const bannerLabel = operation.status.replace(/_/g, " ");
  const isArchiving = operation.phase === "archiving";
  const showWarning = operation.status === "completed_with_errors" || operation.failedCount > 0;

  return (
    <div className={cn("space-y-4", className)}>
      <StatusBanner
        operationId={operation.id}
        label={bannerLabel}
        elapsedSeconds={elapsedSeconds}
        tone={bannerTone}
      />

      {connectionError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Connection looks unstable.</p>
            <p className="text-xs opacity-80">Three consecutive polling requests failed. The last valid progress snapshot is still shown.</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
        <ProgressMeter accounted={accounted} total={operation.totalInvoices} percent={progressPercent} />
      </div>

      <CurrentCard
        isArchiving={isArchiving}
        invoiceNumber={operation.currentInvoiceNumber}
        studentName={operation.currentStudentName}
        message={operation.message}
      />

      <StatsRow
        generatedCount={operation.generatedCount}
        skippedCount={operation.skippedCount}
        failedCount={operation.failedCount}
        totalInvoices={operation.totalInvoices}
      />

      <LiveLog entries={operation.errorLog} />

      {isComplete ? (
        <CompletionPanel
          message={operation.errorMessage ?? operation.message}
          archiveSizeBytes={operation.archiveSizeBytes}
          elapsedSeconds={elapsedSeconds}
          showWarning={showWarning}
          operationId={operation.id}
          onViewOperationsLog={onViewOperationsLog}
        />
      ) : null}

      {isFailed ? (
        <FailedPanel
          message={operation.errorMessage ?? operation.message}
          onRetry={onRetry}
          onViewOperationsLog={onViewOperationsLog}
        />
      ) : null}

      {isPolling && !isComplete && !isFailed ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Polling live progress every 1.5 seconds
        </div>
      ) : null}
    </div>
  );
}
