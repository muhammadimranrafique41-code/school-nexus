import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBillingPeriod } from "@shared/finance";
import type {
  FinanceVoucherOperationRecord,
  FinanceVoucherPreview,
  FinanceVoucherProgressSnapshot,
} from "@shared/finance";
import { Layout } from "@/components/layout";
import { VoucherGenerationProgress } from "@/components/finance/VoucherGenerationProgress";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle, Archive, CheckCircle2, Clock, Download, FileText,
  Loader2, Printer, RotateCcw, Search, ShieldOff, X, CalendarDays,
  GraduationCap, Settings2, ChevronRight, Info,
} from "lucide-react";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────
const STORAGE_KEY = "bulk-voucher-preferences-v2";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
type MonthName = (typeof MONTH_NAMES)[number];
interface MonthRow { monthName: MonthName; year: number; checked: boolean; }
const CURRENT_YEAR = new Date().getFullYear();
function buildYearOptions() {
  const years: number[] = [];
  for (let y = CURRENT_YEAR - 3; y <= CURRENT_YEAR + 2; y++) years.push(y);
  return years;
}
const YEAR_OPTIONS = buildYearOptions();
function buildDefaultRows(): MonthRow[] {
  return MONTH_NAMES.map((monthName) => ({ monthName, year: CURRENT_YEAR, checked: false }));
}
function rowToBillingMonth(row: MonthRow): string {
  const m = MONTH_NAMES.indexOf(row.monthName) + 1;
  return `${row.year}-${String(m).padStart(2, "0")}`;
}
function loadPrefs(): { rows?: MonthRow[]; classes?: string[] } {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}
function savePrefs(rows: MonthRow[], classes: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows, classes })); } catch { /* ignore */ }
}

// ── Access Denied ─────────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <Layout>
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="w-full max-w-sm border-rose-100 bg-white shadow-none">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50">
              <ShieldOff className="h-5 w-5 text-rose-500" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Access Restricted</h2>
            <p className="text-[13px] text-slate-400">Bulk voucher printing is exclusively available to system administrators.</p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: FinanceVoucherOperationRecord["status"] }) {
  const styles: Record<string, string> = {
    queued: "border-amber-200 bg-amber-50 text-amber-700",
    running: "border-blue-200 bg-blue-50 text-blue-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    completed_with_errors: "border-amber-200 bg-amber-50 text-amber-700",
    failed: "border-rose-200 bg-rose-50 text-rose-700",
    cancelled: "border-slate-200 bg-slate-50 text-slate-500",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide capitalize",
      styles[status] ?? "border-slate-200 bg-slate-50 text-slate-500",
    )}>
      {status}
    </span>
  );
}

// ── Progress card ─────────────────────────────────────────────────────────
function ProgressCard({ operationId, onComplete, onCancel }: {
  operationId: number;
  onComplete?: () => void;
  onCancel?: () => void;
}) {
  const { data: progress } = useVoucherProgress(operationId, true);
  const cancel = useCancelVoucherJob();
  const isDone = progress ? ["completed", "completed_with_errors", "failed", "cancelled"].includes(progress.phase) : false;
  const isCompletedPhase = progress ? ["completed", "completed_with_errors"].includes(progress.phase) : false;

  useEffect(() => {
    if (progress && isCompletedPhase && onComplete) onComplete(progress);
  }, [progress?.phase]);

  if (!progress) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />Initialising job…
      </div>
    );
  }

  const pct = isDone
    ? 100 : progress.phase === "archiving" ? 92
      : progress.phase === "rendering" ? Math.round(10 + (progress.generatedCount / Math.max(progress.totalInvoices, 1)) * 75)
        : progress.phase === "planning" ? 15 : 5;

  const barColor: Record<string, string> = {
    completed: "bg-emerald-500", completed_with_errors: "bg-amber-500", failed: "bg-rose-500", cancelled: "bg-slate-400",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
          {isDone ? (
            isCompletedPhase ? <CheckCircle2 className={`h-4 w-4 ${progress.phase === "completed_with_errors" ? "text-amber-600" : "text-emerald-600"}`} />
              : progress.phase === "failed" ? <AlertCircle className="h-4 w-4 text-rose-600" />
                : <X className="h-4 w-4 text-slate-400" />
          ) : <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />}
          <span className="capitalize">{progress.phase}</span>
          <span className="text-[11px] font-normal text-slate-400">· {pct}%</span>
        </div>
        {!isDone && (
          <Button size="sm" variant="outline"
            className="h-7 px-2.5 text-[11px] border-rose-200 text-rose-600 hover:bg-rose-50"
            onClick={() => cancel.mutate(operationId, { onSuccess: onCancel })}
            disabled={cancel.isPending}
          >
            {cancel.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancel"}
          </Button>
        )}
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn("h-full rounded-full transition-all duration-700", barColor[progress.phase] ?? "bg-indigo-500")}
          style={{ width: `${pct}%` }}
        />
      </div>

      {progress.message && <p className="text-[11px] text-slate-400">{progress.message}</p>}

      {progress.phase === "rendering" && (
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
          {[{ l: "Generated", v: progress.generatedCount }, { l: "Skipped", v: progress.skippedCount }, { l: "Total", v: progress.totalInvoices }].map((i) => (
            <div key={i.l}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{i.l}</p>
              <p className="mt-0.5 text-xl font-bold text-slate-900">{i.v}</p>
            </div>
          ))}
        </div>
      )}

      {isCompletedPhase && (
        <div className={`space-y-3 rounded-lg p-3 ${progress.phase === "completed_with_errors" ? "border border-amber-200 bg-amber-50/70" : "border border-emerald-200 bg-emerald-50/60"}`}>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { l: "Generated", v: progress.generatedCount, c: progress.phase === "completed_with_errors" ? "text-amber-700" : "text-emerald-700" },
              { l: "Skipped", v: progress.skippedCount, c: "text-slate-600" },
              { l: "Failed", v: progress.failedCount, c: progress.failedCount > 0 ? "text-rose-600" : "text-slate-600" },
            ].map((i) => (
              <div key={i.l}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{i.l}</p>
                <p className={cn("mt-0.5 text-xl font-bold", i.c)}>{i.v}</p>
              </div>
            ))}
          </div>
          {progress.errorMessage && (
            <div className={`rounded-md px-3 py-2 text-[12px] ${progress.phase === "completed_with_errors" ? "border border-amber-200 bg-white text-amber-800" : "border border-slate-200 bg-white text-slate-600"}`}>
              {progress.errorMessage}
            </div>
          )}
          {progress.archiveSizeBytes > 0 && (
            <Button size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
              onClick={() => downloadVoucherZip(operationId)}>
              <Download className="h-3.5 w-3.5" />
              Download ZIP ({(progress.archiveSizeBytes / 1024).toFixed(0)} KB)
            </Button>
          )}
        </div>
      )}

      {progress.phase === "failed" && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {progress.errorMessage ?? "Generation failed. Please try again."}
        </div>
      )}
    </div>
  );
}

// ── Recent operations card ────────────────────────────────────────────────
function RecentOperationsCard({ onResume }: { onResume?: (id: number) => void }) {
  const { data: ops = [], isLoading } = useRecentVoucherOperations(8);

  return (
    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
      <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50">
          <Clock className="h-3.5 w-3.5 text-slate-500" />
        </div>
        <div>
          <CardTitle className="text-sm font-semibold text-slate-900">Recent Bulk Operations</CardTitle>
          <CardDescription className="text-[11px]">History of all bulk voucher print jobs.</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
          </div>
        ) : ops.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
              <Archive className="h-4 w-4 text-slate-300" />
            </div>
            <p className="text-[13px] font-medium text-slate-500">No voucher jobs yet</p>
            <p className="text-[11px] text-slate-400">Start your first bulk print run above.</p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Status", "Months", "Classes / Students", "Vouchers", "Date", ""].map((h, i) => (
                    <th key={i} className={cn(
                      "px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400",
                      i === 0 && "pl-4 text-left", i === 5 && "pr-4 text-right", i > 0 && i < 5 && "text-left",
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ops.map((op, idx) => (
                  <tr key={op.id} className={cn(
                    "group border-b border-slate-100 last:border-b-0 transition-colors hover:bg-indigo-50/30",
                    idx % 2 === 1 && "bg-slate-50/30",
                  )}>
                    <td className="py-2.5 pl-4 pr-3"><StatusBadge status={op.status} /></td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-700 max-w-[160px] truncate">
                      {op.billingMonths.map((m) => formatBillingPeriod(m)).join(", ")}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-500">
                      {op.classNames.length > 0 ? op.classNames.join(", ") : `${op.studentIds.length} students`}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[12px] font-semibold text-slate-800">{op.generatedCount}</span>
                      <span className="text-[11px] text-slate-400">/{op.totalInvoices}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-400">
                      {op.createdAt ? formatDate(op.createdAt, "MMM dd, yyyy") : "—"}
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        {(op.status === "running" || op.status === "queued") ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-indigo-50 hover:text-indigo-600" title="Track job" onClick={() => onResume?.(op.id)}>
                            <Search className="h-3.5 w-3.5" />
                          </Button>
                        ) : (op.status === "completed" || op.status === "completed_with_errors") && op.archiveSizeBytes > 0 ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-emerald-50 hover:text-emerald-600" title="Download ZIP" onClick={() => downloadVoucherZip(op.id)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Month grid row ────────────────────────────────────────────────────────
function MonthGridRow({ row, index, onToggleCheck, onChangeYear, onChangeMonth }: {
  row: MonthRow; index: number;
  onToggleCheck: (i: number) => void;
  onChangeYear: (i: number, y: number) => void;
  onChangeMonth: (i: number, m: MonthName) => void;
}) {
  return (
    <tr className={cn(
      "border-b border-slate-100 last:border-b-0 transition-colors",
      row.checked ? "bg-indigo-50/60" : "hover:bg-slate-50/50",
    )}>
      <td className="py-1.5 pl-4 pr-2 w-[44%]">
        <Select value={row.monthName} onValueChange={(v) => onChangeMonth(index, v as MonthName)}>
          <SelectTrigger className={cn(
            "h-8 text-sm border-slate-200 bg-white",
            row.checked && "border-indigo-200 bg-indigo-50/50 font-medium text-indigo-900",
          )}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((m) => <SelectItem key={m} value={m} className="text-sm">{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="py-1.5 px-2 w-[36%]">
        <Select value={String(row.year)} onValueChange={(v) => onChangeYear(index, Number(v))}>
          <SelectTrigger className={cn(
            "h-8 text-sm border-slate-200 bg-white",
            row.checked && "border-indigo-200 bg-indigo-50/50 font-medium text-indigo-900",
          )}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEAR_OPTIONS.map((y) => <SelectItem key={y} value={String(y)} className="text-sm">{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="py-1.5 pr-4 pl-2 w-[20%] text-center">
        <Checkbox
          checked={row.checked}
          onCheckedChange={() => onToggleCheck(index)}
          className={cn(
            "h-4 w-4 rounded border-2 transition-colors",
            row.checked
              ? "border-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
              : "border-slate-300",
          )}
        />
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function BulkVouchersPage() {
  const { data: user } = useUser();
  const { data: students = [] } = useStudents();
  const { toast } = useToast();

  const savedPrefs = useMemo(() => loadPrefs(), []);

  const [rows, setRows] = useState<MonthRow[]>(() => {
    if (savedPrefs.rows && Array.isArray(savedPrefs.rows) && savedPrefs.rows.length === 12)
      return savedPrefs.rows;
    return buildDefaultRows();
  });

  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(
    () => new Set((savedPrefs.classes as string[] | undefined) ?? []),
  );
  const [forceRegenerate, setForceRegenerate] = useState(false);

  const availableClasses = useMemo(
    () => Array.from(new Set(students.map((s) => s.className ?? "").filter(Boolean))).sort(),
    [students],
  );

  const checkedRows = useMemo(() => rows.filter((r) => r.checked), [rows]);
  const billingMonths = useMemo(() => checkedRows.map(rowToBillingMonth), [checkedRows]);
  const checkedCount = checkedRows.length;

  useEffect(() => { savePrefs(rows, Array.from(selectedClasses)); }, [rows, selectedClasses]);

  const toggleCheck = useCallback((i: number) => setRows((p) => { const n = [...p]; n[i] = { ...n[i], checked: !n[i].checked }; return n; }), []);
  const changeYear = useCallback((i: number, y: number) => setRows((p) => { const n = [...p]; n[i] = { ...n[i], year: y }; return n; }), []);
  const changeMonth = useCallback((i: number, m: MonthName) => setRows((p) => { const n = [...p]; n[i] = { ...n[i], monthName: m }; return n; }), []);
  const selectAll = () => setRows((p) => p.map((r) => ({ ...r, checked: true })));
  const deselectAll = () => setRows((p) => p.map((r) => ({ ...r, checked: false })));
  const setYearAll = (y: number) => setRows((p) => p.map((r) => ({ ...r, year: y })));
  const toggleClass = (cls: string) => setSelectedClasses((p) => { const n = new Set(p); n.has(cls) ? n.delete(cls) : n.add(cls); return n; });

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<FinanceVoucherPreview | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const recentOperationsRef = useRef<HTMLDivElement | null>(null);

  const previewMutation = useBulkVoucherPreview();
  const startMutation = useStartBulkJob();

  if (user && user.role !== "admin") return <AccessDenied />;

  const buildInput = () => ({
    billingMonths,
    classNames: Array.from(selectedClasses),
    studentIds: [],
    force: forceRegenerate,
  });

  const canGenerate = checkedCount > 0 && selectedClasses.size > 0;

  const handlePreview = async () => {
    if (checkedRows.length === 0) { toast({ title: "Select at least one month", variant: "destructive" }); return; }
    if (selectedClasses.size === 0) { toast({ title: "Select at least one class", variant: "destructive" }); return; }
    try {
      const r = await previewMutation.mutateAsync(buildInput());
      setPreviewData(r); setPreviewOpen(true);
    } catch (e) { toast({ title: "Preview failed", description: getErrorMessage(e), variant: "destructive" }); }
  };

  const handleConfirmStart = async () => {
    setPreviewOpen(false);
    try {
      const op = await startMutation.mutateAsync(buildInput());
      setActiveJobId(op.id);
      toast({ title: "Bulk job started", description: `Job #${op.id} is running in the background.` });
    } catch (e) { toast({ title: "Failed to start job", description: getErrorMessage(e), variant: "destructive" }); }
  };

  const handleReset = () => {
    setRows(buildDefaultRows()); setSelectedClasses(new Set());
    setForceRegenerate(false); setActiveJobId(null); setPreviewData(null);
  };

  const handleViewOperationsLog = useCallback(() => {
    recentOperationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <Layout>
      <div className="space-y-4 pb-10">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Bulk Vouchers</h1>
              <p className="text-[12px] text-slate-400">Generate and download bulk payment vouchers as a ZIP archive.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={handleReset}
              disabled={startMutation.isPending || previewMutation.isPending}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reset
            </Button>
            <Button size="sm" onClick={handlePreview}
              disabled={previewMutation.isPending || startMutation.isPending || !canGenerate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
              {previewMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Printer className="h-3.5 w-3.5" />}
              Preview & Generate
              {checkedCount > 0 && (
                <span className="ml-1 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold">
                  {checkedCount}
                </span>
              )}
            </Button>
          </div>
        </section>

        {/* ── Warning banner ───────────────────────────────────────────── */}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="text-[12px] font-medium text-amber-800">
            All vouchers should share the same voucher date and due date.
          </p>
        </div>

        {/* ── Active job progress ──────────────────────────────────────── */}
        {activeJobId && (
          <Card className="border-indigo-200 bg-indigo-50/40 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between border-b border-indigo-100 px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-indigo-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Job #{activeJobId} — In Progress
              </div>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-slate-400 hover:text-slate-600"
                onClick={() => setActiveJobId(null)}>
                Dismiss
              </Button>
            </CardHeader>
            <CardContent className="px-4 py-3">
              <VoucherGenerationProgress
                operationId={activeJobId}
                onComplete={() => undefined}
                onRetry={() => setActiveJobId(null)}
                onViewOperationsLog={handleViewOperationsLog}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Main layout: month grid + sidebar ───────────────────────── */}
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">

          {/* ── Month grid ──────────────────────────────────────────────── */}
          <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
            <CardHeader className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                  <CalendarDays className="h-3.5 w-3.5 text-indigo-600" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Select Months</CardTitle>
                  <CardDescription className="text-[11px]">Check months to include in this batch.</CardDescription>
                </div>
              </div>
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">All year:</span>
                  <Select value={String(CURRENT_YEAR)} onValueChange={(v) => setYearAll(Number(v))}>
                    <SelectTrigger className="h-7 w-[76px] text-xs border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEAR_OPTIONS.map((y) => <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="h-4 w-px bg-slate-200" />
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" onClick={selectAll}>All</Button>
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" onClick={deselectAll}>None</Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="py-2 pl-4 pr-2 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 w-[44%]">Month</th>
                    <th className="py-2 px-2 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 w-[36%]">Year</th>
                    <th className="py-2 pr-4 pl-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 w-[20%]">Print</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <MonthGridRow key={idx} row={row} index={idx}
                      onToggleCheck={toggleCheck} onChangeYear={changeYear} onChangeMonth={changeMonth} />
                  ))}
                </tbody>
              </table>

              {/* Checked summary footer */}
              {checkedCount > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-indigo-100 bg-indigo-50/60 px-4 py-2">
                  <span className="text-[11px] font-semibold text-indigo-700">
                    {checkedCount} month{checkedCount !== 1 ? "s" : ""} selected
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {checkedRows.slice(0, 5).map((r) => (
                      <span key={`${r.monthName}-${r.year}`}
                        className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        {r.monthName.slice(0, 3)} {r.year}
                      </span>
                    ))}
                    {checkedRows.length > 5 && (
                      <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        +{checkedRows.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Right sidebar ────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Class filter */}
            <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
              <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
                    <GraduationCap className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-900">Classes</CardTitle>
                    <CardDescription className="text-[11px]">{selectedClasses.size} selected</CardDescription>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                    onClick={() => setSelectedClasses(new Set(availableClasses))}>All</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                    onClick={() => setSelectedClasses(new Set())}>None</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {availableClasses.length === 0 ? (
                  <p className="px-4 py-4 text-[12px] text-slate-400">No classes found. Add students with class assignments first.</p>
                ) : (
                  <div className="max-h-[240px] overflow-y-auto divide-y divide-slate-100">
                    {availableClasses.map((cls) => {
                      const checked = selectedClasses.has(cls);
                      return (
                        <label key={cls} htmlFor={`cls-${cls}`}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 px-4 py-2 text-[13px] transition-colors",
                            checked ? "bg-indigo-50/60 font-semibold text-indigo-900" : "hover:bg-slate-50 text-slate-700",
                          )}>
                          <Checkbox id={`cls-${cls}`} checked={checked} onCheckedChange={() => toggleClass(cls)}
                            className={cn("h-4 w-4", checked && "border-indigo-500 data-[state=checked]:bg-indigo-600")} />
                          <span className="flex-1">{cls}</span>
                          {checked && <ChevronRight className="h-3 w-3 text-indigo-400" />}
                        </label>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Options + summary */}
            <Card className="border-slate-200/80 bg-white shadow-none">
              <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50">
                  <Settings2 className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <CardTitle className="text-sm font-semibold text-slate-900">Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-4 py-3">
                {/* Force regen toggle */}
                <label htmlFor="force-regen" className="flex cursor-pointer items-start gap-2.5">
                  <Checkbox id="force-regen" checked={forceRegenerate}
                    onCheckedChange={(v) => setForceRegenerate(Boolean(v))}
                    className="mt-0.5 h-4 w-4" />
                  <div>
                    <p className="text-[13px] font-semibold text-slate-900 leading-none">Force Regenerate</p>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      Overwrite existing vouchers. By default, already-generated vouchers are skipped.
                    </p>
                  </div>
                </label>

                <div className="border-t border-slate-100 pt-3 space-y-2">
                  {[
                    { l: "Months selected", v: checkedCount, hi: checkedCount > 0 },
                    { l: "Classes selected", v: selectedClasses.size, hi: selectedClasses.size > 0 },
                  ].map((i) => (
                    <div key={i.l} className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">{i.l}</span>
                      <span className={cn("text-sm font-bold tabular-nums", i.hi ? "text-indigo-700" : "text-slate-300")}>{i.v}</span>
                    </div>
                  ))}
                </div>

                {forceRegenerate && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                    ⚠️ Force regenerate is ON — existing vouchers will be overwritten.
                  </div>
                )}

                {!canGenerate && (
                  <p className="text-[11px] text-slate-400">Select at least one month and one class to enable generation.</p>
                )}

                <Button size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                  disabled={!canGenerate || previewMutation.isPending || startMutation.isPending}
                  onClick={handlePreview}>
                  {previewMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Printer className="h-3.5 w-3.5" />}
                  Preview & Generate
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Recent operations ────────────────────────────────────────── */}
        <div ref={recentOperationsRef}>
          <RecentOperationsCard onResume={(id) => setActiveJobId(id)} />
        </div>
      </div>

      {/* ── Preview confirmation dialog ──────────────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <FileText className="h-4 w-4 text-indigo-600" />Confirm Bulk Generation
            </DialogTitle>
            <DialogDescription className="text-[12px]">Review the summary before generating vouchers.</DialogDescription>
          </DialogHeader>

          {previewData && (
            <div className="space-y-3 py-1">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: "Total Invoices", v: previewData.targetInvoiceCount, c: "text-slate-900" },
                  { l: "Students", v: previewData.targetStudentCount, c: "text-slate-900" },
                  { l: "To Generate", v: previewData.readyToGenerateCount, c: "text-indigo-700" },
                  { l: "Already Exists", v: previewData.existingVoucherCount, c: previewData.existingVoucherCount > 0 ? "text-amber-600" : "text-slate-900" },
                ].map((i) => (
                  <div key={i.l} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{i.l}</p>
                    <p className={cn("mt-1 text-2xl font-bold", i.c)}>{i.v}</p>
                  </div>
                ))}
              </div>

              {/* Months + classes */}
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 space-y-1.5">
                <div className="flex gap-2 text-[12px]">
                  <span className="shrink-0 text-slate-400">Months:</span>
                  <span className="font-medium text-slate-800">{previewData.selection.billingMonths.map((m) => formatBillingPeriod(m)).join(", ")}</span>
                </div>
                <div className="flex gap-2 text-[12px]">
                  <span className="shrink-0 text-slate-400">Classes:</span>
                  <span className="font-medium text-slate-800">
                    {previewData.selection.classNames.length > 0 ? previewData.selection.classNames.join(", ") : "All students"}
                  </span>
                </div>
              </div>

              {previewData.readyToGenerateCount === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  No new vouchers to generate. Enable "Force Regenerate" to overwrite existing ones.
                </div>
              )}

              {/* Sample invoices */}
              {previewData.sampleInvoices.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Sample Invoices</p>
                  {previewData.sampleInvoices.slice(0, 8).map((inv) => (
                    <div key={inv.feeId} className="flex items-center justify-between rounded-md border border-slate-100 bg-white px-3 py-1.5 text-[12px]">
                      <div>
                        <span className="font-semibold text-slate-900">{inv.studentName}</span>
                        <span className="ml-2 text-slate-400">{inv.className}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{formatBillingPeriod(inv.billingMonth)}</span>
                        {inv.hasExistingVoucher && (
                          <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">Exists</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {previewData.sampleInvoices.length > 8 && (
                    <p className="text-center text-[11px] text-slate-400">+{previewData.sampleInvoices.length - 8} more…</p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleConfirmStart}
              disabled={startMutation.isPending || (previewData?.readyToGenerateCount ?? 0) === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
              {startMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Archive className="h-3.5 w-3.5" />}
              Generate {previewData?.readyToGenerateCount ?? 0} Voucher{(previewData?.readyToGenerateCount ?? 0) !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
