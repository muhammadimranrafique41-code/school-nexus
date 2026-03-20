import { useMemo, useState } from "react";
import { parseISO } from "date-fns";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, BarChart, Bar,
} from "recharts";
import { Layout } from "@/components/layout";
import { useStudentResultDetail, useStudentResultsOverview } from "@/hooks/use-results";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, escapeHtml, formatDate, openPrintWindow } from "@/lib/utils";
import {
  Award, BarChart3, BookOpen, ChevronDown, Download,
  FileDown, GraduationCap, Loader2, TrendingUp, Star,
  CheckCircle2, XCircle, Medal,
} from "lucide-react";

/* ─── helpers ────────────────────────────────────────────────────── */
function getGradeConfig(grade: string) {
  switch (grade?.toUpperCase()) {
    case "A+": case "A": return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", bar: "bg-emerald-400" };
    case "B+": case "B": return { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", bar: "bg-sky-400" };
    case "C+": case "C": return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", bar: "bg-amber-400" };
    case "D": return { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", bar: "bg-orange-400" };
    case "F": return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", bar: "bg-red-400" };
    default: return { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", bar: "bg-slate-300" };
  }
}

function getPctColor(pct: number) {
  if (pct >= 80) return "bg-emerald-400";
  if (pct >= 60) return "bg-sky-400";
  if (pct >= 45) return "bg-amber-400";
  return "bg-red-400";
}

function ScoreBar({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${getPctColor(pct)}`} style={{ width: `${pct}%` }} />
      </div>
      {label && <span className="text-[10px] font-bold text-slate-400 w-8 text-right">{label}</span>}
    </div>
  );
}

/* Circular GPA ring — pure SVG */
function GpaRing({ gpa, max = 4.0 }: { gpa: number; max?: number }) {
  const r = 36, cx = 44, cy = 44;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, gpa / max);
  const dash = pct * circ;
  return (
    <svg width={88} height={88} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={8} />
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="#6366f1" strokeWidth={8} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={14} fontWeight={700} fill="#1e293b">{gpa}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize={8} fill="#94a3b8">GPA</text>
    </svg>
  );
}

/* ─── component ──────────────────────────────────────────────────── */
export default function StudentGrades() {
  const { data, isLoading } = useStudentResultsOverview();
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const examDetail = useStudentResultDetail(selectedExamId);

  const exams = data?.exams ?? [];
  const recentResults = data?.recentResults ?? [];
  const subjectPerformance = useMemo(() => data?.subjectPerformance ?? [], [data]);
  const gradeDistribution = useMemo(() => data?.gradeDistribution ?? [], [data]);
  const trend = useMemo(() => data?.trend ?? [], [data]);

  /* ── actions ── */
  const exportResults = () =>
    downloadCsv("student-results-summary.csv",
      exams.map(e => ({
        Exam: e.examTitle, Type: e.examType, Term: e.term,
        Date: e.examDate, Percentage: e.percentage, GPA: e.gpa, Status: e.status,
      }))
    );

  const printOverview = () => {
    const rows = exams.map(e =>
      `<tr><td>${escapeHtml(e.examTitle)}</td><td>${escapeHtml(e.term)}</td><td>${escapeHtml(formatDate(e.examDate, "MMM dd, yyyy"))}</td><td>${escapeHtml(e.percentage)}%</td><td>${escapeHtml(e.gpa)}</td><td>${escapeHtml(e.status)}</td></tr>`
    ).join("");
    openPrintWindow("Academic Results Report",
      `<h1>Academic Results Report</h1>
       <div class="grid section">
         <div class="card"><strong>Current GPA</strong><div>${escapeHtml(data?.overview.currentGpa ?? 0)}</div></div>
         <div class="card"><strong>Cumulative GPA</strong><div>${escapeHtml(data?.overview.cumulativeGpa ?? 0)}</div></div>
       </div>
       <div class="section"><table><thead><tr><th>Exam</th><th>Term</th><th>Date</th><th>%</th><th>GPA</th><th>Status</th></tr></thead><tbody>${rows || "<tr><td colspan='6'>No records.</td></tr>"}</tbody></table></div>`,
      { documentType: "reportCard", subtitle: data?.overview.totalExams ? `${data.overview.totalExams} exams` : "Academic overview" }
    );
  };

  const printExamDetail = () => {
    if (!examDetail.data) return;
    const rows = examDetail.data.records.map(r =>
      `<tr><td>${escapeHtml(r.subject)}</td><td>${escapeHtml(r.marks)}</td><td>${escapeHtml(r.totalMarks ?? 100)}</td><td>${escapeHtml(r.grade)}</td><td>${escapeHtml(r.remarks ?? "—")}</td></tr>`
    ).join("");
    openPrintWindow(`${examDetail.data.exam.examTitle} Result`,
      `<h1>${escapeHtml(examDetail.data.exam.examTitle)}</h1>
       <p>${escapeHtml(examDetail.data.exam.term)} • ${escapeHtml(formatDate(examDetail.data.exam.examDate, "MMM dd, yyyy"))}</p>
       <div class="grid section">
         <div class="card"><strong>Percentage</strong><div>${escapeHtml(examDetail.data.exam.percentage)}%</div></div>
         <div class="card"><strong>GPA</strong><div>${escapeHtml(examDetail.data.exam.gpa)}</div></div>
       </div>
       <div class="section"><table><thead><tr><th>Subject</th><th>Marks</th><th>Total</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      { documentType: "reportCard", subtitle: examDetail.data.exam.term }
    );
  };

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-5">

          {/* ── Page header ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 shadow-md shadow-indigo-200">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">My Results</h1>
                <p className="text-xs text-slate-500">Exam performance, GPA & grade analytics</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={exportResults} disabled={exams.length === 0}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-40">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
              <button onClick={printOverview} disabled={isLoading}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700 transition-colors disabled:opacity-40">
                <FileDown className="h-3.5 w-3.5" /> Print PDF
              </button>
            </div>
          </div>

          {/* ── Hero banner ── */}
          <div className="relative overflow-hidden rounded-2xl bg-indigo-600 px-5 py-5 text-white shadow-lg shadow-indigo-100">
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
            <div className="absolute right-10 top-14 h-20 w-20 rounded-full bg-white/5" />
            <div className="relative z-10 flex flex-wrap items-center gap-6">
              {/* GPA Ring */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  {/* white ring bg for contrast */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-16 w-16 rounded-full bg-white/10" />
                  </div>
                  <GpaRing gpa={Number(data?.overview.currentGpa ?? 0)} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200 mb-0.5">Current GPA</p>
                  <p className="text-4xl font-bold leading-none tracking-tight">
                    {data?.overview.currentGpa ?? "—"}
                  </p>
                  <p className="text-xs text-indigo-200 mt-1">Latest published exam</p>
                </div>
              </div>

              {/* divider */}
              <div className="hidden sm:block h-14 w-px bg-white/20" />

              {/* quick stats */}
              <div className="flex flex-wrap gap-4">
                {[
                  { label: "Cumulative GPA", value: data?.overview.cumulativeGpa ?? "—" },
                  { label: "Pass Rate", value: `${data?.overview.passRate ?? 0}%` },
                  { label: "Total Exams", value: data?.overview.totalExams ?? 0 },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-white/10 border border-white/15 px-3.5 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">{s.label}</p>
                    <p className="text-xl font-bold text-white mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Subject insights */}
            <div className="relative z-10 mt-4 flex flex-wrap gap-2">
              {data?.overview.strongestSubject && (
                <div className="flex items-center gap-1.5 rounded-xl bg-emerald-400/20 border border-emerald-300/30 px-3 py-1.5">
                  <Star className="h-3.5 w-3.5 text-emerald-200" />
                  <span className="text-xs font-semibold text-emerald-100">Best: {data.overview.strongestSubject}</span>
                </div>
              )}
              {data?.overview.weakestSubject && (
                <div className="flex items-center gap-1.5 rounded-xl bg-white/10 border border-white/20 px-3 py-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-indigo-200" />
                  <span className="text-xs font-semibold text-indigo-100">Needs work: {data.overview.weakestSubject}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Charts row ── */}
          <div className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">

            {/* Performance Trend */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-slate-50">
                <h2 className="text-sm font-bold text-slate-900">Performance Trend</h2>
                <p className="text-xs text-slate-400 mt-0.5">Exam-wise % and GPA over time</p>
              </div>
              <div className="p-4">
                {isLoading ? (
                  <div className="flex h-52 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                  </div>
                ) : trend.length === 0 ? (
                  <div className="flex h-52 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400">
                    No trend data available yet.
                  </div>
                ) : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                        <Tooltip
                          contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 11, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                          labelStyle={{ fontWeight: 700, color: "#1e293b" }}
                        />
                        <Line type="monotone" dataKey="percentage" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }} name="%" />
                        <Line type="monotone" dataKey="gpa" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} name="GPA" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {/* legend */}
                <div className="flex items-center gap-4 mt-2 px-1">
                  {[{ color: "bg-indigo-500", label: "Percentage" }, { color: "bg-emerald-500", label: "GPA" }].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <span className={`h-2 w-4 rounded-full ${l.color}`} />
                      <span className="text-[10px] font-medium text-slate-500">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Grade Distribution */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-slate-50">
                <h2 className="text-sm font-bold text-slate-900">Grade Distribution</h2>
                <p className="text-xs text-slate-400 mt-0.5">All published results</p>
              </div>
              <div className="p-4">
                {isLoading ? (
                  <div className="flex h-52 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                  </div>
                ) : gradeDistribution.length === 0 ? (
                  <div className="flex h-52 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400">
                    No data yet.
                  </div>
                ) : (
                  <>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={gradeDistribution} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="grade" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                          <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                          <Tooltip contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 11 }} />
                          <Bar dataKey="count" fill="#6366f1" radius={[5, 5, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* grade pills */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {gradeDistribution.map((g: any) => {
                        const gc = getGradeConfig(g.grade);
                        return (
                          <span key={g.grade} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${gc.bg} ${gc.text} ${gc.border}`}>
                            {g.grade} <span className="opacity-60">×{g.count}</span>
                          </span>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Subject Performance ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-slate-50">
              <h2 className="text-sm font-bold text-slate-900">Subject Performance</h2>
              <p className="text-xs text-slate-400 mt-0.5">Average marks with latest grade snapshots</p>
            </div>
            <div className="p-4">
              {isLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                </div>
              ) : subjectPerformance.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                  No subject performance data yet.
                </div>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {subjectPerformance.map((sub: any) => {
                    const gc = getGradeConfig(sub.latestGrade);
                    const pct = Math.min(100, sub.averagePercentage ?? sub.averageMarks ?? 0);
                    return (
                      <div key={sub.subject}
                        className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${gc.border} ${gc.bg}`}>
                          <span className={`text-xs font-black ${gc.text}`}>{sub.latestGrade}</span>
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-800 truncate">{sub.subject}</p>
                            <p className="text-[10px] font-semibold text-slate-500 shrink-0">{sub.averageMarks} avg</p>
                          </div>
                          <ScoreBar value={pct} max={100} label={`${Math.round(pct)}%`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Exam-wise Results — desktop table / mobile accordion ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-50">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Exam Results</h2>
                <p className="text-xs text-slate-400 mt-0.5">Tap any exam to view subject-level breakdown</p>
              </div>
              <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-600">
                {exams.length} exam{exams.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    {["Exam", "Term", "Date", "Percentage", "GPA", "Status", ""].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-400" /></td></tr>
                  ) : exams.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">No published exam summaries yet.</td></tr>
                  ) : (
                    exams.map(exam => {
                      const isPass = exam.status === "Pass";
                      return (
                        <tr key={exam.examId} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-900 text-xs">{exam.examTitle}</p>
                            <p className="text-[10px] text-slate-400">{exam.examType}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{exam.term}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{formatDate(parseISO(exam.examDate), "MMM dd, yyyy")}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">{exam.percentage}%</span>
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                <div className={`h-full rounded-full ${getPctColor(exam.percentage)}`} style={{ width: `${exam.percentage}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-900">{exam.gpa}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold
                              ${isPass ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                              {isPass ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {exam.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => setSelectedExamId(exam.examId)}
                              className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-100 transition-colors ml-auto">
                              <BarChart3 className="h-3 w-3" /> Details
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile accordion */}
            <div className="md:hidden p-4 space-y-2.5">
              {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /></div>
              ) : exams.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No exam summaries yet.</p>
              ) : (
                exams.map(exam => {
                  const isPass = exam.status === "Pass";
                  const isOpenRow = expandedExam === exam.examId;
                  return (
                    <div key={exam.examId} className="rounded-2xl border border-slate-100 overflow-hidden">
                      <button onClick={() => setExpandedExam(isOpenRow ? null : exam.examId)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left bg-slate-50/60">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
                          ${isPass ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                          {isPass
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            : <XCircle className="h-4 w-4 text-red-500" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-slate-900 truncate">{exam.examTitle}</p>
                            <p className="text-sm font-bold text-indigo-600 shrink-0">{exam.percentage}%</p>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className="text-xs text-slate-500">{exam.term} · {formatDate(parseISO(exam.examDate), "MMM yyyy")}</p>
                            <p className="text-xs font-bold text-slate-600 shrink-0">GPA {exam.gpa}</p>
                          </div>
                          <div className="mt-1.5">
                            <ScoreBar value={exam.percentage} max={100} />
                          </div>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${isOpenRow ? "rotate-180" : ""}`} />
                      </button>
                      {isOpenRow && (
                        <div className="border-t border-slate-100 bg-white px-4 py-3 space-y-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: "Exam Type", value: exam.examType },
                              { label: "Date", value: formatDate(parseISO(exam.examDate), "MMM dd, yyyy") },
                              { label: "Percentage", value: `${exam.percentage}%` },
                              { label: "GPA", value: exam.gpa },
                            ].map(row => (
                              <div key={row.label} className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2">
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{row.label}</p>
                                <p className="text-xs font-bold text-slate-800 mt-0.5">{row.value}</p>
                              </div>
                            ))}
                          </div>
                          <button onClick={() => setSelectedExamId(exam.examId)}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors">
                            <BarChart3 className="h-3.5 w-3.5" /> View Subject Breakdown
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Recent Subject Results ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-slate-50">
              <h2 className="text-sm font-bold text-slate-900">Recent Subject Results</h2>
              <p className="text-xs text-slate-400 mt-0.5">Latest subject-level records</p>
            </div>

            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    {["Subject", "Exam", "Marks", "Progress", "Grade"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-400" /></td></tr>
                  ) : recentResults.length === 0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-400">No recent subject results.</td></tr>
                  ) : (
                    recentResults.map((rec: any) => {
                      const gc = getGradeConfig(rec.grade);
                      const total = rec.totalMarks ?? 100;
                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5 text-xs font-bold text-slate-900">{rec.subject}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{rec.examTitle ?? "Assessment"}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">{rec.marks}/{total}</td>
                          <td className="px-4 py-2.5 w-32">
                            <ScoreBar value={rec.marks} max={total} label={`${Math.round((rec.marks / total) * 100)}%`} />
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center justify-center rounded-full border w-8 h-8 text-xs font-black ${gc.bg} ${gc.text} ${gc.border}`}>
                              {rec.grade}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="sm:hidden p-4 space-y-2">
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /></div>
              ) : recentResults.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No recent results.</p>
              ) : (
                recentResults.map((rec: any) => {
                  const gc = getGradeConfig(rec.grade);
                  const total = rec.totalMarks ?? 100;
                  return (
                    <div key={rec.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${gc.border} ${gc.bg}`}>
                        <span className={`text-sm font-black ${gc.text}`}>{rec.grade}</span>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-900 truncate">{rec.subject}</p>
                          <p className="text-xs font-bold text-slate-700 shrink-0">{rec.marks}/{total}</p>
                        </div>
                        <p className="text-[10px] text-slate-500">{rec.examTitle ?? "Assessment"}</p>
                        <ScoreBar value={rec.marks} max={total} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Exam Detail Modal ── */}
      <Dialog open={!!selectedExamId} onOpenChange={open => !open && setSelectedExamId(null)}>
        <DialogContent className="max-w-2xl bg-white border-slate-100 rounded-2xl shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  {examDetail.data?.exam.examTitle ?? "Exam Result"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  {examDetail.data ? `${examDetail.data.exam.term} · ${formatDate(examDetail.data.exam.examDate, "MMM dd, yyyy")}` : "Subject-wise breakdown"}
                </DialogDescription>
              </div>
              {examDetail.data && (
                <button onClick={printExamDetail}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors">
                  <FileDown className="h-3.5 w-3.5" /> Print
                </button>
              )}
            </div>
          </DialogHeader>

          {examDetail.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            </div>
          ) : !examDetail.data ? (
            <div className="p-8 text-center text-sm text-slate-400">Unable to load exam details.</div>
          ) : (
            <div className="overflow-y-auto max-h-[70vh]">
              {/* Stat strip */}
              <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-slate-50">
                {[
                  { label: "Exam Type", value: examDetail.data.exam.examType },
                  { label: "Subjects", value: examDetail.data.exam.subjectsCount },
                  { label: "Percentage", value: `${examDetail.data.exam.percentage}%` },
                  { label: "GPA", value: examDetail.data.exam.gpa },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Subject records */}
              <div className="p-4 space-y-2">
                {examDetail.data.records.map((rec: any) => {
                  const gc = getGradeConfig(rec.grade);
                  const total = rec.totalMarks ?? 100;
                  return (
                    <div key={rec.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${gc.border} ${gc.bg}`}>
                        <span className={`text-sm font-black ${gc.text}`}>{rec.grade}</span>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-900">{rec.subject}</p>
                          <p className="text-xs font-bold text-slate-700">{rec.marks}/{total}</p>
                        </div>
                        <ScoreBar value={rec.marks} max={total} label={`${Math.round((rec.marks / total) * 100)}%`} />
                        {rec.remarks && (
                          <p className="text-[10px] text-slate-500 italic">{rec.remarks}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
