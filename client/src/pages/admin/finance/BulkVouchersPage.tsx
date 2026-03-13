import { useCallback, useEffect, useMemo, useState } from "react";
import { formatBillingPeriod } from "@shared/finance";
import type {
  FinanceVoucherOperationRecord,
  FinanceVoucherPreview,
  FinanceVoucherProgressSnapshot,
} from "@shared/finance";
import { Layout } from "@/components/layout";
import { useStudents } from "@/hooks/use-users";
import { useUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  downloadVoucherZip,
  useBulkVoucherPreview,
  useCancelVoucherJob,
  useRecentVoucherOperations,
  useStartBulkJob,
  useVoucherProgress,
} from "@/hooks/use-bulk-vouchers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Printer,
  RotateCcw,
  Search,
  ShieldOff,
  X,
  CalendarDays,
  GraduationCap,
  Settings2,
  ChevronRight,
  Info,
} from "lucide-react";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "bulk-voucher-preferences-v2";

const MONTH_NAMES = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
] as const;

type MonthName = (typeof MONTH_NAMES)[number];

/** Per-row state: { monthIndex 0-11, year, checked } */
interface MonthRow {
  monthName: MonthName;
  year: number;
  checked: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

/** Year range shown in each row's dropdown: 3 years back → 2 years ahead */
function buildYearOptions(): number[] {
  const years: number[] = [];
  for (let y = CURRENT_YEAR - 3; y <= CURRENT_YEAR + 2; y++) years.push(y);
  return years;
}

const YEAR_OPTIONS = buildYearOptions();

/** Build the default 12-row grid */
function buildDefaultRows(): MonthRow[] {
  return MONTH_NAMES.map((monthName) => ({
    monthName,
    year: CURRENT_YEAR,
    checked: false,
  }));
}

/** Convert a MonthRow to a billing-month string "YYYY-MM" */
function rowToBillingMonth(row: MonthRow): string {
  const monthIndex = MONTH_NAMES.indexOf(row.monthName) + 1;
  return `${row.year}-${String(monthIndex).padStart(2, "0")}`;
}

// ─── Persist helpers ──────────────────────────────────────────────────────────

function loadPrefs(): { rows?: MonthRow[]; classes?: string[] } {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function savePrefs(rows: MonthRow[], classes: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows, classes }));
  } catch { /* ignore */ }
}

// ─── Access Denied ────────────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <Layout>
      <div className="flex h-[60vh] items-center justify-center">
        <Card className="max-w-md text-center shadow-lg">
          <CardContent className="p-10 space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
              <ShieldOff className="h-8 w-8 text-rose-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
            <p className="text-sm text-slate-500">
              Bulk voucher printing is exclusively available to system administrators.
              Please contact your administrator for access.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({
  status,
}: {
  status: FinanceVoucherOperationRecord["status"];
}) {
  const styles: Record<string, string> = {
    queued: "border-amber-300/60 bg-amber-50 text-amber-700",
    running: "border-blue-300/60 bg-blue-50 text-blue-700",
    completed: "border-emerald-300/60 bg-emerald-50 text-emerald-700",
    failed: "border-rose-300/60 bg-rose-50 text-rose-700",
    cancelled: "border-slate-300/60 bg-slate-50 text-slate-500",
  };
  return (
    <Badge
      variant="outline"
      className={cn("capitalize text-[11px] font-semibold px-2.5", styles[status] ?? "")}
    >
      {status}
    </Badge>
  );
}

// ─── Progress Card ────────────────────────────────────────────────────────────

function ProgressCard({
  operationId,
  onComplete,
  onCancel,
}: {
  operationId: number;
  onComplete?: (op: FinanceVoucherProgressSnapshot) => void;
  onCancel?: () => void;
}) {
  const { data: progress } = useVoucherProgress(operationId, true);
  const cancel = useCancelVoucherJob();

  const isDone = progress
    ? ["completed", "failed", "cancelled"].includes(progress.phase)
    : false;

  useEffect(() => {
    if (progress?.phase === "completed" && onComplete) onComplete(progress);
  }, [progress?.phase]);

  if (!progress) {
    return (
      <div className="flex items-center gap-3 py-6 text-sm text-slate-500 justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
        <span>Initialising job…</span>
      </div>
    );
  }

  const pct =
    progress.phase === "completed" || progress.phase === "failed" || progress.phase === "cancelled"
      ? 100
      : progress.phase === "archiving"
        ? 92
        : progress.phase === "rendering"
          ? Math.round(10 + (progress.generatedCount / Math.max(progress.totalInvoices, 1)) * 75)
          : progress.phase === "planning"
            ? 15
            : 5;

  const barColor: Record<string, string> = {
    completed: "bg-emerald-500",
    failed: "bg-rose-500",
    cancelled: "bg-slate-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {isDone ? (
            progress.phase === "completed" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : progress.phase === "failed" ? (
              <AlertCircle className="h-4 w-4 text-rose-600" />
            ) : (
              <X className="h-4 w-4 text-slate-400" />
            )
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          )}
          <span className="capitalize">{progress.phase}</span>
          <span className="text-xs font-normal text-slate-400">· {pct}%</span>
        </div>
        {!isDone && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
            onClick={() => cancel.mutate(operationId, { onSuccess: onCancel })}
            disabled={cancel.isPending}
          >
            {cancel.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancel"}
          </Button>
        )}
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            barColor[progress.phase] ?? "bg-indigo-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {progress.message && (
        <p className="text-xs text-slate-500">{progress.message}</p>
      )}

      {progress.phase === "rendering" && (
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200/70 bg-slate-50 p-3 text-center">
          {[
            { label: "Generated", value: progress.generatedCount },
            { label: "Skipped", value: progress.skippedCount },
            { label: "Total", value: progress.totalInvoices },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">{item.label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {progress.phase === "completed" && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Generated", value: progress.generatedCount, color: "text-emerald-700" },
              { label: "Skipped", value: progress.skippedCount, color: "text-slate-600" },
              {
                label: "Failed",
                value: progress.failedCount,
                color: progress.failedCount > 0 ? "text-rose-600" : "text-slate-600",
              },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">{item.label}</p>
                <p className={cn("mt-1 text-2xl font-bold", item.color)}>{item.value}</p>
              </div>
            ))}
          </div>
          {progress.archiveSizeBytes > 0 && (
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              onClick={() => downloadVoucherZip(operationId)}
            >
              <Download className="mr-2 h-4 w-4" />
              Download ZIP ({(progress.archiveSizeBytes / 1024).toFixed(0)} KB)
            </Button>
          )}
        </div>
      )}

      {progress.phase === "failed" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {progress.errorMessage ?? "Generation failed. Please try again."}
        </div>
      )}
    </div>
  );
}

// ─── Recent Operations ────────────────────────────────────────────────────────

function RecentOperationsCard({ onResume }: { onResume?: (id: number) => void }) {
  const { data: ops = [], isLoading } = useRecentVoucherOperations(8);

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" />
          <div>
            <CardTitle className="text-base">Recent Bulk Operations</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              History of all bulk voucher print jobs.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
          </div>
        ) : ops.length === 0 ? (
          <div className="p-8 text-center">
            <Archive className="mx-auto h-8 w-8 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">No voucher jobs yet.</p>
            <p className="text-xs text-slate-400 mt-1">Start your first bulk print run above.</p>
          </div>
        ) : (
          <div className="divide-y">
            {ops.map((op) => (
              <div
                key={op.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50/60 transition-colors"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={op.status} />
                    <span className="text-xs text-slate-600 font-medium">
                      {op.billingMonths.map((m) => formatBillingPeriod(m)).join(", ")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {op.classNames.length > 0
                      ? op.classNames.join(", ")
                      : `${op.studentIds.length} students`}
                    {" · "}
                    {op.generatedCount}/{op.totalInvoices} vouchers
                    {op.createdAt ? ` · ${formatDate(op.createdAt, "MMM dd, yyyy")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {op.status === "running" || op.status === "queued" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onResume?.(op.id)}
                    >
                      <Search className="mr-1 h-3 w-3" />
                      Track
                    </Button>
                  ) : op.status === "completed" && op.archiveSizeBytes > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                      onClick={() => downloadVoucherZip(op.id)}
                    >
                      <Download className="mr-1 h-3 w-3" />
                      Download
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Month Grid Row ───────────────────────────────────────────────────────────

interface MonthRowProps {
  row: MonthRow;
  index: number;
  onToggleCheck: (index: number) => void;
  onChangeYear: (index: number, year: number) => void;
  onChangeMonth: (index: number, monthName: MonthName) => void;
}

function MonthGridRow({
  row,
  index,
  onToggleCheck,
  onChangeYear,
  onChangeMonth,
}: MonthRowProps) {
  return (
    <tr
      className={cn(
        "transition-colors border-b border-slate-100 last:border-0",
        row.checked
          ? "bg-indigo-50/70"
          : "hover:bg-slate-50/60"
      )}
    >
      {/* Month dropdown */}
      <td className="py-2 pl-4 pr-2 w-[46%]">
        <Select
          value={row.monthName}
          onValueChange={(v) => onChangeMonth(index, v as MonthName)}
        >
          <SelectTrigger
            className={cn(
              "h-8 text-sm border-slate-200 bg-white focus:ring-1 focus:ring-indigo-400",
              row.checked && "border-indigo-200 bg-indigo-50/50 font-medium text-indigo-900"
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((m) => (
              <SelectItem key={m} value={m} className="text-sm">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Year dropdown */}
      <td className="py-2 px-2 w-[38%]">
        <Select
          value={String(row.year)}
          onValueChange={(v) => onChangeYear(index, Number(v))}
        >
          <SelectTrigger
            className={cn(
              "h-8 text-sm border-slate-200 bg-white focus:ring-1 focus:ring-indigo-400",
              row.checked && "border-indigo-200 bg-indigo-50/50 font-medium text-indigo-900"
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)} className="text-sm">
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Check to Print */}
      <td className="py-2 pr-4 pl-2 w-[16%] text-center">
        <Checkbox
          checked={row.checked}
          onCheckedChange={() => onToggleCheck(index)}
          className={cn(
            "h-4 w-4 rounded border-2 transition-colors",
            row.checked
              ? "border-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
              : "border-slate-300"
          )}
        />
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BulkVouchersPage() {
  const { data: user } = useUser();
  const { data: students = [] } = useStudents();
  const { toast } = useToast();

  // ── Load persisted prefs ────────────────────────────────────────────────────
  const savedPrefs = useMemo(() => loadPrefs(), []);

  // ── 12-row month grid state ─────────────────────────────────────────────────
  const [rows, setRows] = useState<MonthRow[]>(() => {
    if (
      savedPrefs.rows &&
      Array.isArray(savedPrefs.rows) &&
      savedPrefs.rows.length === 12
    ) {
      return savedPrefs.rows;
    }
    return buildDefaultRows();
  });

  // ── Class filter state ──────────────────────────────────────────────────────
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(
    () => new Set((savedPrefs.classes as string[] | undefined) ?? [])
  );

  // ── Force regenerate ────────────────────────────────────────────────────────
  const [forceRegenerate, setForceRegenerate] = useState(false);

  // ── Derived: unique classes from students ───────────────────────────────────
  const availableClasses = useMemo(
    () =>
      Array.from(new Set(students.map((s) => s.className ?? "").filter(Boolean))).sort(),
    [students]
  );

  // ── Derived: checked rows → billing months ──────────────────────────────────
  const checkedRows = useMemo(() => rows.filter((r) => r.checked), [rows]);
  const billingMonths = useMemo(
    () => checkedRows.map(rowToBillingMonth),
    [checkedRows]
  );

  // ── Persist on change ───────────────────────────────────────────────────────
  useEffect(() => {
    savePrefs(rows, Array.from(selectedClasses));
  }, [rows, selectedClasses]);

  // ── Row mutators ─────────────────────────────────────────────────────────────
  const toggleCheck = useCallback((index: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], checked: !next[index].checked };
      return next;
    });
  }, []);

  const changeYear = useCallback((index: number, year: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], year };
      return next;
    });
  }, []);

  const changeMonth = useCallback((index: number, monthName: MonthName) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], monthName };
      return next;
    });
  }, []);

  const selectAllRows = () =>
    setRows((prev) => prev.map((r) => ({ ...r, checked: true })));

  const deselectAllRows = () =>
    setRows((prev) => prev.map((r) => ({ ...r, checked: false })));

  const setYearForAll = (year: number) =>
    setRows((prev) => prev.map((r) => ({ ...r, year })));

  // ── Class toggles ────────────────────────────────────────────────────────────
  const toggleClass = (cls: string) => {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  };

  // ── Preview + job ────────────────────────────────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<FinanceVoucherPreview | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);

  const previewMutation = useBulkVoucherPreview();
  const startMutation = useStartBulkJob();

  // ── Guard ────────────────────────────────────────────────────────────────────
  if (user && user.role !== "admin") return <AccessDenied />;

  function buildInput() {
    return {
      billingMonths,
      classNames: Array.from(selectedClasses),
      studentIds: [],
      force: forceRegenerate,
    };
  }

  const handlePreview = async () => {
    if (checkedRows.length === 0) {
      toast({ title: "Select at least one month", variant: "destructive" });
      return;
    }
    if (selectedClasses.size === 0) {
      toast({ title: "Select at least one class", variant: "destructive" });
      return;
    }
    try {
      const result = await previewMutation.mutateAsync(buildInput());
      setPreviewData(result);
      setPreviewOpen(true);
    } catch (err) {
      toast({ title: "Preview failed", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const handleConfirmStart = async () => {
    setPreviewOpen(false);
    try {
      const operation = await startMutation.mutateAsync(buildInput());
      setActiveJobId(operation.id);
      toast({
        title: "Bulk job started",
        description: `Job #${operation.id} is running in the background.`,
      });
    } catch (err) {
      toast({ title: "Failed to start job", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const handleReset = () => {
    setRows(buildDefaultRows());
    setSelectedClasses(new Set());
    setForceRegenerate(false);
    setActiveJobId(null);
    setPreviewData(null);
  };

  const checkedCount = checkedRows.length;
  const canGenerate = checkedCount > 0 && selectedClasses.size > 0;

  return (
    <Layout>
      <div className="space-y-6 pb-10">

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <Printer className="h-6 w-6 text-indigo-600" />
              Multiple Vouchers
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Generate and download bulk payment vouchers as a ZIP archive for
              selected months and classes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={startMutation.isPending || previewMutation.isPending}
              className="gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handlePreview}
              disabled={
                previewMutation.isPending ||
                startMutation.isPending ||
                !canGenerate
              }
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}
              Preview & Generate
              {checkedCount > 0 && (
                <span className="ml-1 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold">
                  {checkedCount}
                </span>
              )}
            </Button>
          </div>
        </section>

        {/* ── Warning Banner ───────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800 font-medium">
            Note: All Vouchers should be of Same Date of Voucher and Due Date
          </p>
        </div>

        {/* ── Active Job Progress ──────────────────────────────────────────── */}
        {activeJobId && (
          <Card className="border-indigo-200/70 bg-indigo-50/40">
            <CardHeader className="pb-3 border-b border-indigo-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-indigo-800 font-semibold flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Job #{activeJobId} — In Progress
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-slate-500 hover:text-slate-700"
                  onClick={() => setActiveJobId(null)}
                >
                  Dismiss
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <ProgressCard
                operationId={activeJobId}
                onComplete={() => { }}
                onCancel={() => setActiveJobId(null)}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Main Two-Column Layout ───────────────────────────────────────── */}
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">

          {/* ── LEFT: Month Grid ──────────────────────────────────────────── */}
          <Card>
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <div>
                    <CardTitle className="text-base">Select Months to Print</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Check the months you want to include in this voucher batch.
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Bulk year setter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 whitespace-nowrap">Set all year:</span>
                    <Select
                      value={String(CURRENT_YEAR)}
                      onValueChange={(v) => setYearForAll(Number(v))}
                    >
                      <SelectTrigger className="h-7 w-[80px] text-xs border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((y) => (
                          <SelectItem key={y} value={String(y)} className="text-xs">
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="h-4 w-px bg-slate-200" />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2.5"
                    onClick={selectAllRows}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2.5"
                    onClick={deselectAllRows}
                  >
                    None
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="py-2.5 pl-4 pr-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-[46%]">
                      Month
                    </th>
                    <th className="py-2.5 px-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-[38%]">
                      Year
                    </th>
                    <th className="py-2.5 pr-4 pl-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-[16%]">
                      Check to Print
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <MonthGridRow
                      key={index}
                      row={row}
                      index={index}
                      onToggleCheck={toggleCheck}
                      onChangeYear={changeYear}
                      onChangeMonth={changeMonth}
                    />
                  ))}
                </tbody>
              </table>

              {/* Footer summary */}
              {checkedCount > 0 && (
                <div className="border-t border-slate-100 bg-indigo-50/60 px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-indigo-700 font-medium">
                    {checkedCount} month{checkedCount !== 1 ? "s" : ""} selected
                  </span>
                  <div className="flex flex-wrap gap-1 max-w-[60%] justify-end">
                    {checkedRows.slice(0, 4).map((r) => (
                      <span
                        key={`${r.monthName}-${r.year}`}
                        className="rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                      >
                        {r.monthName.slice(0, 3)} {r.year}
                      </span>
                    ))}
                    {checkedRows.length > 4 && (
                      <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                        +{checkedRows.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── RIGHT: Filters & Options ──────────────────────────────────── */}
          <div className="space-y-4">

            {/* Class Filter */}
            <Card>
              <CardHeader className="border-b pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-slate-400" />
                    <div>
                      <CardTitle className="text-sm">Filter by Class</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Select classes to include.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] px-2"
                      onClick={() => setSelectedClasses(new Set(availableClasses))}
                    >
                      All
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] px-2"
                      onClick={() => setSelectedClasses(new Set())}
                    >
                      None
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {availableClasses.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">
                    No classes found. Add students with class assignments first.
                  </p>
                ) : (
                  <div className="max-h-[260px] overflow-y-auto divide-y">
                    {availableClasses.map((cls) => {
                      const checked = selectedClasses.has(cls);
                      return (
                        <label
                          key={cls}
                          htmlFor={`cls-${cls}`}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                            checked
                              ? "bg-indigo-50/70 text-indigo-900 font-medium"
                              : "hover:bg-slate-50 text-slate-700"
                          )}
                        >
                          <Checkbox
                            id={`cls-${cls}`}
                            checked={checked}
                            onCheckedChange={() => toggleClass(cls)}
                            className={cn(
                              "h-4 w-4",
                              checked &&
                              "border-indigo-500 data-[state=checked]:bg-indigo-600"
                            )}
                          />
                          <span className="flex-1">{cls}</span>
                          {checked && (
                            <ChevronRight className="h-3 w-3 text-indigo-400" />
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Generation Options */}
            <Card>
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-slate-400" />
                  <CardTitle className="text-sm">Generation Options</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <label
                  htmlFor="force-regen"
                  className="flex cursor-pointer items-start gap-3"
                >
                  <Checkbox
                    id="force-regen"
                    checked={forceRegenerate}
                    onCheckedChange={(v) => setForceRegenerate(Boolean(v))}
                    className="mt-0.5 h-4 w-4"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900 leading-none">
                      Force Regenerate
                    </p>
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                      Overwrite existing vouchers for selected months. By default,
                      previously generated vouchers are skipped.
                    </p>
                  </div>
                </label>
              </CardContent>
            </Card>

            {/* Selection Summary */}
            <Card className="border-slate-200/80">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Current Selection
                </p>
                <div className="space-y-2">
                  {[
                    { label: "Months selected", value: checkedCount, highlight: checkedCount > 0 },
                    { label: "Classes selected", value: selectedClasses.size, highlight: selectedClasses.size > 0 },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between"
                    >
                      <span className="text-xs text-slate-500">{item.label}</span>
                      <span
                        className={cn(
                          "text-sm font-bold tabular-nums",
                          item.highlight ? "text-indigo-700" : "text-slate-400"
                        )}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>

                {forceRegenerate && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 leading-relaxed">
                    ⚠️ Force regenerate is ON — existing vouchers will be overwritten.
                  </div>
                )}

                {!canGenerate && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 leading-relaxed">
                    Select at least one month and one class to enable generation.
                  </div>
                )}

                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2 mt-1"
                  size="sm"
                  disabled={
                    !canGenerate ||
                    previewMutation.isPending ||
                    startMutation.isPending
                  }
                  onClick={handlePreview}
                >
                  {previewMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Printer className="h-3.5 w-3.5" />
                  )}
                  Preview & Generate
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Recent Operations ────────────────────────────────────────────── */}
        <RecentOperationsCard onResume={(id) => setActiveJobId(id)} />
      </div>

      {/* ── Preview Confirmation Dialog ───────────────────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-indigo-600" />
              Confirm Bulk Generation
            </DialogTitle>
            <DialogDescription className="text-sm">
              Review the summary below before generating vouchers.
            </DialogDescription>
          </DialogHeader>

          {previewData && (
            <div className="space-y-4 py-2">
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Total Invoices", value: previewData.targetInvoiceCount, color: "text-slate-900" },
                  { label: "Students", value: previewData.targetStudentCount, color: "text-slate-900" },
                  {
                    label: "To Generate",
                    value: previewData.readyToGenerateCount,
                    color: "text-indigo-700",
                  },
                  {
                    label: "Already Exists",
                    value: previewData.existingVoucherCount,
                    color:
                      previewData.existingVoucherCount > 0
                        ? "text-amber-600"
                        : "text-slate-900",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-slate-200/70 bg-slate-50 p-4"
                  >
                    <p className="text-[10px] uppercase tracking-widest text-slate-500">
                      {item.label}
                    </p>
                    <p className={cn("mt-2 text-2xl font-bold", item.color)}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Months + Classes summary */}
              <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-slate-500 shrink-0 text-xs">Months:</span>
                  <span className="text-slate-800 font-medium text-xs leading-relaxed">
                    {previewData.selection.billingMonths
                      .map((m) => formatBillingPeriod(m))
                      .join(", ")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500 shrink-0 text-xs">Classes:</span>
                  <span className="text-slate-800 font-medium text-xs">
                    {previewData.selection.classNames.length > 0
                      ? previewData.selection.classNames.join(", ")
                      : "All students"}
                  </span>
                </div>
              </div>

              {previewData.readyToGenerateCount === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  No new vouchers to generate. Enable "Force Regenerate" to
                  overwrite existing ones.
                </div>
              )}

              {/* Sample invoices */}
              {previewData.sampleInvoices.length > 0 && (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Sample Invoices
                  </p>
                  {previewData.sampleInvoices.slice(0, 8).map((inv) => (
                    <div
                      key={inv.feeId}
                      className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-medium text-slate-900">
                          {inv.studentName}
                        </span>
                        <span className="ml-2 text-slate-400">{inv.className}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">
                          {formatBillingPeriod(inv.billingMonth)}
                        </span>
                        {inv.hasExistingVoucher && (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-amber-600 text-[10px] px-1.5"
                          >
                            Exists
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {previewData.sampleInvoices.length > 8 && (
                    <p className="text-center text-[11px] text-slate-400">
                      +{previewData.sampleInvoices.length - 8} more…
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmStart}
              disabled={
                startMutation.isPending ||
                (previewData?.readyToGenerateCount ?? 0) === 0
              }
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
            >
              {startMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              Generate {previewData?.readyToGenerateCount ?? 0} Voucher
              {(previewData?.readyToGenerateCount ?? 0) !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}