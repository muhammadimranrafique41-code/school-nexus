import { useLocation, useSearch } from "wouter";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, ChevronDown, ChevronRight, Download, Loader2, Printer, Search } from "lucide-react";
import {
  useStudentPreview,
  useGenerateBatch,
  useConsolidatedVoucher,
  type StudentPreviewItem,
} from "@/hooks/use-consolidated-vouchers";
import { useVoucherProgress, downloadVoucherZip } from "@/hooks/use-bulk-vouchers";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { StatusBadge } from "@/components/finance/StatusBadge";
import { BreakdownPanel } from "@/components/finance/BreakdownPanel";
import { ConsolidatedVoucher } from "@/components/finance/ConsolidatedVoucher";
import { formatCurrency } from "@shared/finance";
import { useToast } from "@/hooks/use-toast";

// ─── Print helper ─────────────────────────────────────────────────────────────

function printElement(el: HTMLElement | null) {
  if (!el) return;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Consolidated Fee Voucher</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: monospace; font-size: 10px; background: white; }
    @page { size: A4; margin: 10mm; }
    .voucher-print-root { max-width: 100%; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #cbd5e1; padding: 2px 4px; font-size: 9px; }
    .bg-\\[\\#1e1b4b\\] { background-color: #1e1b4b !important; color: white !important; }
    .bg-rose-700 { background-color: #be123c !important; color: white !important; }
    .bg-red-50 { background-color: #fef2f2 !important; }
    .bg-blue-50 { background-color: #eff6ff !important; }
    .bg-slate-100 { background-color: #f1f5f9 !important; }
    .bg-slate-50\\/60 { background-color: #f8fafc !important; }
    .text-red-700 { color: #b91c1c !important; }
    .text-blue-700 { color: #1d4ed8 !important; }
    .text-emerald-700 { color: #047857 !important; }
    .text-rose-600 { color: #e11d48 !important; }
    .text-rose-700 { color: #be123c !important; }
    .text-\\[\\#1e1b4b\\] { color: #1e1b4b !important; }
    .text-slate-500 { color: #64748b !important; }
    .text-slate-600 { color: #475569 !important; }
    .text-slate-800 { color: #1e293b !important; }
    .text-slate-400 { color: #94a3b8 !important; }
    .font-bold { font-weight: 700 !important; }
    .font-semibold { font-weight: 600 !important; }
    .font-medium { font-weight: 500 !important; }
    .italic { font-style: italic !important; }
    .text-center { text-align: center !important; }
    .text-right { text-align: right !important; }
    .text-left { text-align: left !important; }
    .border { border: 1px solid #cbd5e1 !important; }
    .border-t-0 { border-top: none !important; }
    .border-slate-300 { border-color: #cbd5e1 !important; }
    .border-slate-200 { border-color: #e2e8f0 !important; }
    .border-slate-100 { border-color: #f1f5f9 !important; }
    .rounded { border-radius: 4px !important; }
    .rounded-t { border-radius: 4px 4px 0 0 !important; }
    .grid { display: grid !important; }
    .grid-cols-2 { grid-template-columns: 1fr 1fr !important; }
    .gap-x-4 { column-gap: 16px !important; }
    .px-2\\.5 { padding-left: 10px !important; padding-right: 10px !important; }
    .px-2 { padding-left: 8px !important; padding-right: 8px !important; }
    .px-1 { padding-left: 4px !important; padding-right: 4px !important; }
    .py-2\\.5 { padding-top: 10px !important; padding-bottom: 10px !important; }
    .py-2 { padding-top: 8px !important; padding-bottom: 8px !important; }
    .py-1 { padding-top: 4px !important; padding-bottom: 4px !important; }
    .py-0\\.5 { padding-top: 2px !important; padding-bottom: 2px !important; }
    .mt-0\\.5 { margin-top: 2px !important; }
    .mt-1 { margin-top: 4px !important; }
    .space-y-0\\.5 > * + * { margin-top: 2px !important; }
    .leading-4 { line-height: 16px !important; }
    .tracking-wide { letter-spacing: 0.025em !important; }
    .tracking-widest { letter-spacing: 0.1em !important; }
    .uppercase { text-transform: uppercase !important; }
    .relative { position: relative !important; }
    .absolute { position: absolute !important; }
    .top-2 { top: 8px !important; }
    .right-3 { right: 12px !important; }
    .w-full { width: 100% !important; }
    .w-6 { width: 24px !important; }
    .w-16 { width: 64px !important; }
    .w-20 { width: 80px !important; }
    .space-y-2 > * + * { margin-top: 8px !important; }
    .select-none { user-select: none !important; }
  </style>
</head>
<body>${el.innerHTML}</body>
</html>`;
  const win = window.open("", "_blank", "width=800,height=1000");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
    win.close();
  };
}

// ─── VoucherPrintDialog ───────────────────────────────────────────────────────

function VoucherPrintDialog({
  student,
  billingMonths,
  schoolName,
  schoolAddress,
  onClose,
}: {
  student: StudentPreviewItem;
  billingMonths: string[];
  schoolName: string;
  schoolAddress?: string;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const query = useConsolidatedVoucher(student.studentId, billingMonths);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Consolidated Voucher — {student.name}
          </DialogTitle>
        </DialogHeader>

        {query.isLoading && (
          <div className="flex items-center justify-center py-12 gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading voucher data…</span>
          </div>
        )}

        {query.isError && (
          <div className="flex items-center gap-2 text-red-600 p-4 border border-red-200 rounded-lg bg-red-50">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm">{(query.error as Error).message}</span>
          </div>
        )}

        {query.data && (
          <>
            {/* Action bar */}
            <div className="flex justify-end gap-2 pb-2 border-b">
              <Button
                size="sm"
                variant="outline"
                onClick={() => printElement(printRef.current)}
                className="gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                Print / Save PDF
              </Button>
            </div>

            {/* Voucher preview */}
            <div ref={printRef}>
              <ConsolidatedVoucher
                data={query.data}
                schoolName={schoolName}
                schoolAddress={schoolAddress}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── StudentPreviewPage ───────────────────────────────────────────────────────

export default function StudentPreviewPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const billingMonths = (params.get("months") ?? "").split(",").filter(Boolean);
  const { toast } = useToast();

  const [operationId, setOperationId] = useState<number | null>(null);
  const [printStudent, setPrintStudent] = useState<StudentPreviewItem | null>(null);

  const { query, filters, setFilters, filteredStudents, expandedRows, toggleExpand } =
    useStudentPreview(billingMonths, billingMonths.length > 0);

  const generateBatch = useGenerateBatch();
  const progress = useVoucherProgress(operationId, operationId !== null);
  const settingsQuery = usePublicSchoolSettings();

  const schoolName =
    settingsQuery.data?.schoolInformation?.schoolName ?? "School Management System";
  const schoolAddress =
    settingsQuery.data?.schoolInformation?.schoolAddress || undefined;

  if (billingMonths.length === 0) {
    navigate("/admin/finance/vouchers/generate");
    return null;
  }

  const summary = query.data?.summary;
  const allClasses = Array.from(
    new Set((query.data?.students ?? []).map((s) => s.className).filter(Boolean)),
  ) as string[];

  async function handleGenerate() {
    try {
      const result = await generateBatch.mutateAsync({ billingMonths, includeOverdue: true });
      setOperationId(result.operationId);
      toast({ title: "Batch started", description: `Operation #${result.operationId} is running.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed", description: (err as Error).message });
    }
  }

  const isRunning =
    progress.data?.phase === "rendering" || progress.data?.phase === "planning";
  const isDone =
    progress.data?.phase === "completed" || progress.data?.phase === "completed_with_errors";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Student Preview
            {summary && (
              <span className="text-slate-500 font-normal text-lg ml-2">
                — {summary.total} student{summary.total !== 1 ? "s" : ""} found
              </span>
            )}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Students with fees due in selected months or with outstanding previous balance.
            Click a row to expand, or{" "}
            <span className="text-violet-600 font-medium">🖨 Print</span> to preview the
            consolidated voucher.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/finance/vouchers/generate")}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {isDone && operationId ? (
            <Button size="sm" className="gap-1" onClick={() => downloadVoucherZip(operationId)}>
              <Download className="h-4 w-4" /> Download ZIP
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={
                generateBatch.isPending ||
                isRunning ||
                (query.data?.students.length ?? 0) === 0
              }
              className="gap-1"
            >
              {isRunning
                ? `Generating… ${progress.data?.generatedCount ?? 0}/${progress.data?.totalInvoices ?? "?"}`
                : "Generate Vouchers →"}
            </Button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Students", value: summary.total, color: "text-slate-900" },
            { label: "Overdue", value: summary.overdue, color: "text-red-600" },
            { label: "Current Only", value: summary.currentOnly, color: "text-blue-600" },
            { label: "Already Paid (Excluded)", value: summary.alreadyPaid, color: "text-slate-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="border border-slate-200 rounded-lg p-3 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Select
          value={filters.className || "all"}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, className: v === "all" ? "" : v }))
          }
        >
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="Class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {allClasses.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
        >
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {["all", "overdue", "current", "advance"].map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name…"
            className="pl-8 h-8 text-sm"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
      </div>

      {/* Table */}
      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="flex items-center gap-2 text-red-600 p-4 border border-red-200 rounded-lg bg-red-50">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{(query.error as Error).message}</span>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg font-medium">No outstanding dues found</p>
          <p className="text-sm mt-1">All students are paid up for the selected months.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600 w-8" />
                <th className="text-left px-3 py-2 font-medium text-slate-600">ID</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Student Name</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Class</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Prev Due</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Current</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Total</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Status</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Voucher</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => {
                const isExpanded = expandedRows.has(student.studentId);
                return (
                  <>
                    <tr
                      key={student.studentId}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => toggleExpand(student.studentId)}
                    >
                      <td className="px-3 py-2 text-slate-400">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-xs">{student.studentId}</td>
                      <td className="px-3 py-2 font-medium">{student.name}</td>
                      <td className="px-3 py-2 text-slate-500">{student.className ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {student.previousDuesTotal > 0 ? (
                          <span className="text-red-600 font-medium flex items-center justify-end gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {formatCurrency(student.previousDuesTotal)}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(student.selectedMonthsTotal)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatCurrency(student.grandTotal)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={student.status} />
                      </td>
                      {/* Print button — stops row expand propagation */}
                      <td
                        className="px-3 py-2 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 gap-1 text-xs"
                          onClick={() => setPrintStudent(student)}
                        >
                          <Printer className="h-3 w-3" />
                          Print
                        </Button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${student.studentId}-detail`} className="bg-slate-50">
                        <td colSpan={9} className="px-4 py-3">
                          <BreakdownPanel student={student} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-student print dialog */}
      {printStudent && (
        <VoucherPrintDialog
          student={printStudent}
          billingMonths={billingMonths}
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          onClose={() => setPrintStudent(null)}
        />
      )}
    </div>
  );
}
