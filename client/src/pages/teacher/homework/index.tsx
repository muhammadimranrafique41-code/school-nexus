import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useCancelHomework, useTeacherHomework, useTeacherHomeworkClasses } from "@/hooks/use-homework";
import { HomeworkEmptyState } from "@/components/homework/empty-state";
import { PriorityBadge } from "@/components/homework/priority-badge";
import { SubjectChip } from "@/components/homework/subject-chip";
import { StatusBadge } from "@/components/homework/status-badge";
import {
  BookOpen, CalendarDays, ChevronLeft, ChevronRight,
  Clock, Eye, Pencil, Plus, Star, TrendingUp,
  X, XCircle, ClipboardList, Loader2,
} from "lucide-react";

/* ─── status tab config ──────────────────────────────────────────── */
const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

/* ─── submission progress bar ───────────────────────────────────── */
function SubmissionBar({ submitted, total }: { submitted: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((submitted / total) * 100)) : 0;
  const color = pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-500">{submitted}/{total} submitted</span>
        <span className="text-[10px] font-black text-slate-600">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ─── component ──────────────────────────────────────────────────── */
export default function TeacherHomeworkDashboard() {
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [page, setPage] = useState(1);
  const [dueDateFilter, setDueDateFilter] = useState<Date | undefined>();

  const { data: classPayload } = useTeacherHomeworkClasses();
  const classes = classPayload?.data ?? [];

  const filters = useMemo(() => ({
    classId: selectedClass === "all" ? undefined : Number(selectedClass),
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    limit: 12,
  }), [page, selectedClass, statusFilter]);

  const { data, isLoading } = useTeacherHomework(filters);
  const cancelHomework = useCancelHomework();

  const homework = data?.data ?? [];
  const meta = data?.meta ?? {};
  const total = typeof meta.total === "number" ? meta.total : homework.length;
  const totalPages = Math.max(1, Math.ceil(total / (filters.limit ?? 12)));

  const filteredHomework = useMemo(() => {
    if (!dueDateFilter) return homework;
    const target = format(dueDateFilter, "yyyy-MM-dd");
    return homework.filter(item => format(new Date(item.dueDate), "yyyy-MM-dd") === target);
  }, [dueDateFilter, homework]);

  const stats = useMemo(() => {
    const active = filteredHomework.filter(item => item.status === "active");
    const totalSubs = active.reduce((s, i) => s + i.submissionCount, 0);
    const totalCap = active.reduce((s, i) => s + i.classSize, 0);
    const avgMarksArr = filteredHomework
      .map(i => i.averageMarks)
      .filter((v): v is number => typeof v === "number");
    return {
      activeCount: active.length,
      pendingSubmissions: active.reduce((s, i) => s + Math.max(i.classSize - i.submissionCount, 0), 0),
      submissionRate: totalCap ? Math.round((totalSubs / totalCap) * 100) : 0,
      avgMarks: avgMarksArr.length
        ? Math.round(avgMarksArr.reduce((s, m) => s + m, 0) / avgMarksArr.length)
        : null,
    };
  }, [filteredHomework]);

  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-5">

          {/* ── Hero header ── */}
          <div className="relative overflow-hidden rounded-2xl bg-amber-500 px-5 py-5 text-white shadow-lg shadow-amber-100">
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
            <div className="absolute right-14 top-16 h-20 w-20 rounded-full bg-white/5" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                    <ClipboardList className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-100">
                    Teacher Workspace
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight leading-tight">Homework Diary</h1>
                <p className="text-sm text-amber-100">Manage assignments, track submissions, keep classes aligned.</p>
              </div>
              <Link href="/teacher/homework/new">
                <button className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-amber-600 shadow-sm hover:bg-amber-50 transition-colors">
                  <Plus className="h-4 w-4" /> New Assignment
                </button>
              </Link>
            </div>

            {/* stat pills row */}
            <div className="relative z-10 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { icon: BookOpen, label: "Active", value: stats.activeCount },
                { icon: Clock, label: "Pending Subs", value: stats.pendingSubmissions },
                { icon: TrendingUp, label: "Submit Rate", value: `${stats.submissionRate}%` },
                { icon: Star, label: "Avg Marks", value: stats.avgMarks === null ? "N/A" : `${stats.avgMarks}%` },
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

          {/* ── Filter bar ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Filters</p>

            <div className="flex flex-wrap items-center gap-2">
              {/* Class */}
              <Select value={selectedClass} onValueChange={v => { setSelectedClass(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-auto min-w-[140px] rounded-xl border-slate-200 bg-slate-50 text-xs font-semibold">
                  <SelectValue placeholder="All classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All classes</SelectItem>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={String(c.id)} className="text-xs">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Due date picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={`flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors
                    ${dueDateFilter
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    {dueDateFilter ? format(dueDateFilter, "dd MMM yyyy") : "All dates"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDateFilter}
                    onSelect={d => { setDueDateFilter(d ?? undefined); setPage(1); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {dueDateFilter && (
                <button onClick={() => setDueDateFilter(undefined)}
                  className="flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                  <X className="h-3 w-3" /> Clear
                </button>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Status tabs */}
              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-0.5">
                {STATUS_TABS.map(tab => (
                  <button
                    key={tab.value}
                    onClick={() => { setStatusFilter(tab.value); setPage(1); }}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition-all
                      ${statusFilter === tab.value
                        ? "bg-amber-500 text-white shadow-sm"
                        : "text-slate-500 hover:bg-white hover:text-slate-700"
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Assignment list ── */}
          <div className="space-y-2.5">
            {/* list header */}
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Assignments
              </p>
              {!isLoading && (
                <span className="rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-600">
                  {filteredHomework.length} shown
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-2xl" />
                ))}
              </div>
            ) : filteredHomework.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6">
                <HomeworkEmptyState ctaHref="/teacher/homework/new" />
              </div>
            ) : (
              filteredHomework.map(item => {
                const dueLabel = formatDistanceToNow(new Date(item.dueDate), { addSuffix: true });
                const isOverdue = isPast(new Date(item.dueDate)) && item.status === "active";

                return (
                  <div key={item.id}
                    className="rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md hover:border-amber-200 transition-all overflow-hidden">

                    {/* left accent bar */}
                    <div className="flex">
                      <div className={`w-1 shrink-0 ${item.status === "active" ? isOverdue ? "bg-rose-400" : "bg-amber-400"
                        : item.status === "completed" ? "bg-emerald-400"
                          : "bg-slate-200"
                        }`} />

                      <div className="flex-1 p-4 space-y-3">
                        {/* top row: badges + due */}
                        <div className="flex flex-wrap items-center gap-2 justify-between">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <PriorityBadge priority={item.priority} />
                            <SubjectChip subject={item.subject} />
                            <StatusBadge status={item.status} />
                            {isOverdue && (
                              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                                Overdue
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
                            <CalendarDays className="h-3 w-3" />
                            <span className={isOverdue ? "text-rose-500 font-semibold" : ""}>{dueLabel}</span>
                          </div>
                        </div>

                        {/* title + description */}
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 leading-tight">{item.title}</h3>
                          {item.description && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>
                          )}
                          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{item.classLabel}</p>
                        </div>

                        {/* bottom: progress + actions */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                          {/* submission bar */}
                          <div className="sm:w-48">
                            <SubmissionBar
                              submitted={item.submissionCount}
                              total={item.classSize}
                            />
                          </div>

                          {/* action buttons — always visible */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link href={`/teacher/homework/${item.id}/submissions`}>
                              <button className="flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[10px] font-bold text-sky-600 hover:bg-sky-100 transition-colors">
                                <Eye className="h-3 w-3" /> Submissions
                              </button>
                            </Link>
                            <Link href={`/teacher/homework/${item.id}/edit`}>
                              <button className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                            </Link>
                            {item.status === "active" && (
                              <button
                                onClick={() => cancelHomework.mutate(item.id)}
                                disabled={cancelHomework.isPending}
                                className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-40">
                                {cancelHomework.isPending
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <XCircle className="h-3 w-3" />}
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                Page <strong className="text-slate-800">{page}</strong> of <strong className="text-slate-800">{totalPages}</strong>
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30">
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* page number pills */}
                <div className="hidden sm:flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const p = i + 1;
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-all
                          ${page === p
                            ? "bg-amber-500 text-white shadow-sm shadow-amber-200"
                            : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                          }`}>
                        {p}
                      </button>
                    );
                  })}
                </div>

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
