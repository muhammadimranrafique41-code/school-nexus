import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useResults, useCreateResult, useDeleteResult, useUpdateResult } from "@/hooks/use-results";
import { useUsers } from "@/hooks/use-users";
import { useUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Award, ChevronLeft, ChevronRight, Download,
  Loader2, Pencil, Plus, Search, Trash2,
  TrendingUp, BookOpen, Star, AlertCircle,
} from "lucide-react";
import { calculateGrade, downloadCsv, getErrorMessage, paginateItems } from "@/lib/utils";

/* ─── types ──────────────────────────────────────────────────────── */
type ListedResult = {
  id: number;
  studentId: number;
  subject: string;
  marks: number;
  grade: string;
  student?: { name: string; className?: string | null };
};

const resultSchema = z.object({
  studentId: z.coerce.number().min(1, "Student is required"),
  marks: z.coerce.number().min(0).max(100, "Marks must be between 0 and 100"),
});

const PAGE_SIZE = 8;

/* ─── grade colour helper ────────────────────────────────────────── */
function gradeConfig(grade: string) {
  const map: Record<string, { bg: string; text: string; border: string; bar: string }> = {
    "A+": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", bar: "bg-emerald-400" },
    "A": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", bar: "bg-emerald-400" },
    "B+": { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", bar: "bg-sky-400" },
    "B": { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", bar: "bg-sky-400" },
    "C+": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", bar: "bg-amber-400" },
    "C": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", bar: "bg-amber-400" },
    "D": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", bar: "bg-orange-400" },
    "F": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", bar: "bg-red-400" },
  };
  return map[grade] ?? { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", bar: "bg-slate-300" };
}

function ScoreBar({ marks }: { marks: number }) {
  const pct = Math.min(100, marks);
  const color = pct >= 80 ? "bg-emerald-400" : pct >= 60 ? "bg-sky-400" : pct >= 45 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ─── component ──────────────────────────────────────────────────── */
export default function TeacherResults() {
  const { data: currentUser } = useUser();
  const { data: results, isLoading } = useResults();
  const { data: users } = useUsers();
  const createResult = useCreateResult();
  const updateResult = useUpdateResult();
  const deleteResult = useDeleteResult();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingResult, setEditingResult] = useState<ListedResult | null>(null);
  const [resultToDelete, setResultToDelete] = useState<ListedResult | null>(null);

  const form = useForm<z.infer<typeof resultSchema>>({
    resolver: zodResolver(resultSchema),
    defaultValues: { studentId: 0, marks: 0 },
  });

  const students = useMemo(() => (users ?? []).filter(u => u.role === "student"), [users]);
  const subjectName = currentUser?.subject?.trim() || "";
  const mutationPending = createResult.isPending || updateResult.isPending;

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  const myResults = useMemo(() => {
    const base = subjectName ? (results ?? []).filter(r => r.subject === subjectName) : [];
    const query = searchTerm.trim().toLowerCase();
    return [...base].sort((a, b) => b.id - a.id).filter(r => {
      const s = `${r.student?.name ?? ""} ${r.student?.className ?? ""} ${r.grade} ${r.marks}`.toLowerCase();
      return s.includes(query);
    });
  }, [results, searchTerm, subjectName]);

  const paginated = paginateItems(myResults, currentPage, PAGE_SIZE);

  const summary = useMemo(() => {
    const total = myResults.length;
    const average = total ? Math.round(myResults.reduce((s, r) => s + r.marks, 0) / total) : 0;
    const passRate = total ? Math.round((myResults.filter(r => r.grade !== "F").length / total) * 100) : 0;
    const highest = total ? Math.max(...myResults.map(r => r.marks)) : 0;
    return { total, average, passRate, highest };
  }, [myResults]);

  /* ── helpers ── */
  const resetForm = () => form.reset({ studentId: 0, marks: 0 });

  const openCreateDialog = () => { setEditingResult(null); resetForm(); setIsOpen(true); };

  const openEditDialog = (result: ListedResult) => {
    setEditingResult(result);
    form.reset({ studentId: result.studentId, marks: result.marks });
    setIsOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof resultSchema>) => {
    if (!subjectName) {
      toast({ title: "Subject missing", description: "Assign a subject to this teacher account first.", variant: "destructive" });
      return;
    }
    const payload = { studentId: values.studentId, marks: values.marks, subject: subjectName, grade: calculateGrade(values.marks) };
    try {
      if (editingResult) await updateResult.mutateAsync({ id: editingResult.id, ...payload });
      else await createResult.mutateAsync(payload);
      toast({ title: editingResult ? "Result updated" : "Result added", description: `Saved ${payload.subject} marks.` });
      setIsOpen(false); setEditingResult(null); resetForm();
    } catch (error) {
      toast({ title: "Unable to save result", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!resultToDelete) return;
    try {
      await deleteResult.mutateAsync(resultToDelete.id);
      toast({ title: "Result deleted", description: `Removed entry for ${resultToDelete.student?.name || `student ${resultToDelete.studentId}`}.` });
      setResultToDelete(null);
    } catch (error) {
      toast({ title: "Unable to delete result", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const exportResults = () =>
    downloadCsv(
      `${(subjectName || "subject").toLowerCase().replaceAll(" ", "-")}-results.csv`,
      myResults.map(r => ({ Student: r.student?.name ?? `ID: ${r.studentId}`, Class: r.student?.className ?? "", Subject: r.subject, Marks: r.marks, Grade: r.grade })),
    );

  /* live marks preview for the form */
  const watchedMarks = form.watch("marks");
  const previewGrade = watchedMarks >= 0 && watchedMarks <= 100 ? calculateGrade(watchedMarks) : null;

  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-5">

          {/* ── Hero ── */}
          <div className="relative overflow-hidden rounded-2xl bg-amber-500 px-5 py-5 text-white shadow-lg shadow-amber-100">
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
            <div className="absolute right-14 top-16 h-20 w-20 rounded-full bg-white/5" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                    <Award className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-100">Teacher Workspace</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight leading-tight">Results</h1>
                <p className="text-sm text-amber-100 font-medium">
                  {subjectName ? `Managing marks for ${subjectName}` : "Manage grades for your assigned subject"}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={exportResults} disabled={myResults.length === 0}
                  className="flex items-center gap-1.5 rounded-xl bg-white/15 border border-white/25 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20 transition-colors disabled:opacity-40">
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
                <button onClick={openCreateDialog} disabled={!subjectName}
                  data-testid="teacher-results-add-button"
                  className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-amber-700 shadow-sm hover:bg-amber-50 transition-colors disabled:opacity-40">
                  <Plus className="h-3.5 w-3.5" /> Add Result
                </button>
              </div>
            </div>

            {/* stat pills */}
            <div className="relative z-10 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { icon: BookOpen, label: "Entries", value: summary.total },
                { icon: TrendingUp, label: "Average", value: `${summary.average}%` },
                { icon: Award, label: "Pass Rate", value: `${summary.passRate}%` },
                { icon: Star, label: "Highest", value: `${summary.highest}%` },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2.5 rounded-xl bg-white/15 border border-white/20 px-3 py-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/20">
                    <s.icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-200 truncate">{s.label}</p>
                    <p className="text-sm font-black text-white leading-tight">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* no subject warning */}
          {!subjectName && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 font-semibold">
                No subject is assigned to this teacher account yet. Ask your admin to assign a subject before managing results.
              </p>
            </div>
          )}

          {/* ── Results table / cards ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            {/* toolbar */}
            <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-4 border-b border-slate-50">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  data-testid="teacher-results-search-input"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search student, class, grade…"
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
                />
              </div>
              {myResults.length > 0 && (
                <span className="rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-600">
                  {myResults.length} result{myResults.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    {["#", "Student", "Class", "Marks", "Progress", "Grade", "Actions"].map(h => (
                      <th key={h} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-left ${h === "Actions" ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-amber-400" /></td></tr>
                  ) : myResults.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">No results recorded for this subject yet.</td></tr>
                  ) : (
                    paginated.pageItems.map((record, idx) => {
                      const gc = gradeConfig(record.grade);
                      return (
                        <tr key={record.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5 text-[10px] font-black text-slate-300">
                            {String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, "0")}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-bold text-slate-900">
                            {record.student?.name || `ID: ${record.studentId}`}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">
                            {record.student?.className || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-bold text-slate-800">
                            {record.marks}<span className="text-slate-400 font-normal">/100</span>
                          </td>
                          <td className="px-4 py-2.5 w-32">
                            <ScoreBar marks={record.marks} />
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center justify-center rounded-full border w-8 h-8 text-xs font-black ${gc.bg} ${gc.text} ${gc.border}`}>
                              {record.grade}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={() => openEditDialog(record)}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                              <button onClick={() => setResultToDelete(record)}
                                className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600 hover:bg-red-100 transition-colors">
                                <Trash2 className="h-3 w-3" /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden p-4 space-y-2.5">
              {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-amber-400" /></div>
              ) : myResults.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">No results yet.</p>
              ) : (
                paginated.pageItems.map((record) => {
                  const gc = gradeConfig(record.grade);
                  return (
                    <div key={record.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${gc.border} ${gc.bg}`}>
                            <span className={`text-sm font-black ${gc.text}`}>{record.grade}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                              {record.student?.name || `ID: ${record.studentId}`}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{record.student?.className || "—"}</p>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-slate-900 shrink-0">
                          {record.marks}<span className="text-xs text-slate-400 font-normal">/100</span>
                        </p>
                      </div>
                      <ScoreBar marks={record.marks} />
                      <div className="flex items-center justify-end gap-1.5 pt-0.5">
                        <button onClick={() => openEditDialog(record)}
                          className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        <button onClick={() => setResultToDelete(record)}
                          className="flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-bold text-red-600 hover:bg-red-100">
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination */}
            {myResults.length > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-slate-50 px-5 py-3">
                <p className="text-xs text-slate-500">
                  Showing <strong className="text-slate-700">{(paginated.currentPage - 1) * PAGE_SIZE + 1}</strong>–
                  <strong className="text-slate-700">{Math.min(paginated.currentPage * PAGE_SIZE, myResults.length)}</strong> of{" "}
                  <strong className="text-slate-700">{myResults.length}</strong>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="hidden sm:flex gap-1">
                    {Array.from({ length: Math.min(paginated.totalPages, 5) }, (_, i) => {
                      const p = i + 1;
                      return (
                        <button key={p} onClick={() => setCurrentPage(p)}
                          className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-all
                            ${currentPage === p
                              ? "bg-amber-500 text-white shadow-sm shadow-amber-200"
                              : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                            }`}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                  <span className="sm:hidden text-xs font-medium text-slate-500">
                    {currentPage}/{paginated.totalPages}
                  </span>
                  <button
                    disabled={currentPage >= paginated.totalPages}
                    onClick={() => setCurrentPage(p => Math.min(paginated.totalPages, p + 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={isOpen} onOpenChange={open => { setIsOpen(open); if (!open) { setEditingResult(null); resetForm(); } }}>
        <DialogContent className="max-w-sm bg-white border-slate-100 rounded-2xl shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
                <Award className="h-4 w-4 text-amber-600" />
              </div>
              <DialogTitle className="text-base font-bold text-slate-900">
                {editingResult ? "Edit Result" : "Add Result"}
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="px-6 py-5">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Subject (read-only) */}
                <div className="flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-2.5">
                  <BookOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 font-semibold">
                    Subject: <span className="font-black">{subjectName || "Not assigned"}</span>
                  </p>
                </div>

                {/* Student */}
                <FormField control={form.control} name="studentId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-700">Student</FormLabel>
                    <Select value={String(field.value ?? 0)} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-slate-50 text-xs">
                          <SelectValue placeholder="Select student" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {students.map(s => (
                          <SelectItem key={s.id} value={String(s.id)} className="text-xs">
                            {s.name}{s.className ? ` (${s.className})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />

                {/* Marks + live grade preview */}
                <FormField control={form.control} name="marks" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-700">Marks (0–100)</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <input
                          type="number" min="0" max="100"
                          {...field}
                          className="flex-1 h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
                        />
                      </FormControl>
                      {previewGrade && (() => {
                        const gc = gradeConfig(previewGrade);
                        return (
                          <span className={`flex h-9 w-12 items-center justify-center rounded-xl border text-sm font-black ${gc.bg} ${gc.text} ${gc.border}`}>
                            {previewGrade}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Grade is auto-calculated from the shared grading scale.</p>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />

                {/* Score bar preview */}
                {watchedMarks >= 0 && watchedMarks <= 100 && (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <p className="text-[10px] text-slate-400">Score preview</p>
                      <p className="text-[10px] font-bold text-slate-600">{watchedMarks}%</p>
                    </div>
                    <ScoreBar marks={watchedMarks} />
                  </div>
                )}

                <button type="submit"
                  disabled={mutationPending || !subjectName}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white shadow-sm shadow-amber-200 hover:bg-amber-600 transition-colors disabled:opacity-40">
                  {mutationPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Award className="h-4 w-4" />}
                  {editingResult ? "Save Changes" : "Save Result"}
                </button>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!resultToDelete} onOpenChange={open => !open && setResultToDelete(null)}>
        <AlertDialogContent className="max-w-sm bg-white border-slate-100 rounded-2xl shadow-2xl">
          <AlertDialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 border border-red-200 mb-1">
              <Trash2 className="h-5 w-5 text-red-500" />
            </div>
            <AlertDialogTitle className="text-base font-bold text-slate-900">Delete result?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              This permanently removes the mark for{" "}
              <strong className="text-slate-700">{resultToDelete?.student?.name || `student ${resultToDelete?.studentId}`}</strong>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              className="flex-1 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 h-9">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="flex-1 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 h-9 shadow-sm shadow-red-200">
              {deleteResult.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : "Delete Result"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
