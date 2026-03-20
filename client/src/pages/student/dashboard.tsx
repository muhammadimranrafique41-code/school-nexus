import { useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useStudentStats } from "@/hooks/use-dashboard";
import { useStudentAttendance, useStudentAttendanceSummary } from "@/hooks/use-attendance";
import { useFees } from "@/hooks/use-fees";
import { useStudentResultsOverview } from "@/hooks/use-results";
import { useStudentTimetable } from "@/hooks/use-timetable";
import { useUser } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getFeeStatusClassName } from "@/lib/finance";
import DailyDiaryCard from "@/components/daily-diary-card";
import {
  Award, Banknote, BookOpen, CalendarDays, FileText,
  GraduationCap, Percent, ArrowRight, CheckCircle2, XCircle, TrendingUp,
} from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

export default function StudentDashboard() {
  const { data: user } = useUser();
  const { data: stats, isLoading: statsLoading } = useStudentStats(user?.id || 0);
  const { data: attendance = [], isLoading: attendanceLoading } = useStudentAttendance();
  const { data: attendanceSummary, isLoading: attendanceSummaryLoading } = useStudentAttendanceSummary();
  const { data: resultsOverview, isLoading: resultsLoading } = useStudentResultsOverview();
  const { data: timetable, isLoading: timetableLoading } = useStudentTimetable();
  const { data: fees, isLoading: feesLoading } = useFees();

  const myRecentResults = useMemo(
    () => (resultsOverview?.recentResults ?? []).slice(0, 3),
    [resultsOverview],
  );
  const myRecentAttendance = useMemo(
    () => [...attendance].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 6),
    [attendance],
  );
  const openInvoices = useMemo(
    () => [...(fees ?? [])].filter((i) => i.studentId === user?.id && i.remainingBalance > 0)
      .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)),
    [fees, user?.id],
  );
  const overdueInvoices = useMemo(() => openInvoices.filter((i) => i.status === "Overdue"), [openInvoices]);
  const outstandingBalance = openInvoices.reduce((s, f) => s + f.remainingBalance, 0);
  const nextDueFee = openInvoices[0];
  const timetableItems = timetable?.items ?? [];
  const attendanceRate = attendanceSummary?.attendanceRate ?? stats?.attendanceRate ?? 0;

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (statsLoading || attendanceLoading || attendanceSummaryLoading || resultsLoading || timetableLoading || feesLoading) {
    return (
      <Layout>
        <div className="space-y-4 pb-8">
          <Skeleton className="h-14 rounded-xl" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
          </div>
          <div className="grid gap-4 lg:grid-cols-7">
            <Skeleton className="h-64 rounded-xl lg:col-span-4" />
            <Skeleton className="h-64 rounded-xl lg:col-span-3" />
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 pb-8">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Hello, {user?.name?.split(" ")[0]} 👋
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {(user as any)?.rollNumber && (
                   <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-indigo-700">
                     ROLL: {(user as any).rollNumber}
                   </span>
                )}
                {(user as any)?.className && (
                   <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-slate-600">
                     CLASS: {(user as any).className}
                   </span>
                )}
                {(user as any)?.studentStatus === "active" && (
                   <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 border border-emerald-200">
                     Active
                   </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <Button asChild variant="outline" size="sm">
              <Link href="/student/timetable">Timetable</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/student/results">My Results</Link>
            </Button>
          </div>
        </section>

        {/* ── KPI strip ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "Attendance",
              value: `${attendanceRate}%`,
              hint: `${attendanceSummary?.currentStreak ?? 0} session streak`,
              icon: Percent,
              color: "text-violet-600 bg-violet-50",
              border: "border-violet-100",
            },
            {
              label: "Outstanding",
              value: formatCurrency(outstandingBalance || stats?.unpaidFees || 0),
              hint: nextDueFee ? `Due ${formatDate(nextDueFee.dueDate, "MMM dd")}` : "All clear",
              icon: Banknote,
              color: "text-amber-600 bg-amber-50",
              border: "border-amber-100",
            },
            {
              label: "Open invoices",
              value: stats?.openInvoices ?? openInvoices.length,
              hint: overdueInvoices.length ? `${overdueInvoices.length} overdue` : "None overdue",
              icon: FileText,
              color: overdueInvoices.length > 0 ? "text-rose-600 bg-rose-50" : "text-emerald-600 bg-emerald-50",
              border: overdueInvoices.length > 0 ? "border-rose-100" : "border-emerald-100",
            },
            {
              label: "Latest grade",
              value: myRecentResults[0]?.grade || "—",
              hint: myRecentResults[0]?.subject || "No results yet",
              icon: Award,
              color: "text-emerald-600 bg-emerald-50",
              border: "border-emerald-100",
            },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border bg-white px-3 py-4 text-center shadow-none transition-shadow hover:shadow-sm",
                item.border,
              )}
            >
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", item.color)}>
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none text-slate-900">{item.value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.hint}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Quick access cards ───────────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "My Attendance",
              description: "Filters, trends, and calendar-style record view.",
              value: `${attendanceRate}%`,
              hint: `${attendanceSummary?.currentStreak ?? 0} session streak`,
              href: "/student/attendance",
              icon: CalendarDays,
              accent: "border-violet-100 bg-violet-50",
              iconColor: "text-violet-600",
            },
            {
              title: "My Timetable",
              description: "Weekly periods, teachers, rooms, and timings.",
              value: timetableItems.length,
              hint: timetable?.className ?? user?.className ?? "Unassigned class",
              href: "/student/timetable",
              icon: BookOpen,
              accent: "border-blue-100 bg-blue-50",
              iconColor: "text-blue-600",
            },
            {
              title: "My Results",
              description: "Exam-wise performance, GPA, and printable reports.",
              value: resultsOverview?.overview.currentGpa ?? 0,
              hint: `${resultsOverview?.overview.totalExams ?? 0} published exam(s)`,
              href: "/student/results",
              icon: GraduationCap,
              accent: "border-emerald-100 bg-emerald-50",
              iconColor: "text-emerald-600",
            },
          ].map((item) => (
            <Card key={item.title} className="border-slate-200/80 bg-white shadow-none transition-shadow hover:shadow-sm">
              <CardContent className="p-4">
                {/* Icon + title */}
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", item.accent, item.iconColor)}>
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-slate-900">{item.title}</p>
                    <p className="text-[11px] text-slate-400 leading-tight">{item.description}</p>
                  </div>
                </div>
                {/* Value */}
                <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <p className="text-2xl font-bold text-slate-900 leading-none">{item.value}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{item.hint}</p>
                </div>
                {/* CTA */}
                <Button asChild variant="outline" size="sm" className="w-full justify-between h-8 text-[12px]">
                  <Link href={item.href}>
                    <span>Open</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* Daily diary card */}
          <DailyDiaryCard />
        </section>

        {/* ── Attendance + Fees ────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-7">

          {/* Recent attendance */}
          <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none lg:col-span-4">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50">
                  <CalendarDays className="h-3.5 w-3.5 text-violet-600" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Recent Attendance</CardTitle>
                  <CardDescription className="text-[11px]">Your latest marked sessions.</CardDescription>
                </div>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-indigo-600 hover:bg-indigo-50">
                <Link href="/student/attendance">
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {myRecentAttendance.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] text-slate-400">No attendance records found.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Date</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Day</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRecentAttendance.map((record, idx) => (
                      <tr key={record.id} className={cn(
                        "border-b border-slate-100 last:border-b-0 transition-colors hover:bg-slate-50/60",
                        idx % 2 === 1 && "bg-slate-50/30",
                      )}>
                        <td className="px-4 py-2.5 text-[13px] font-semibold text-slate-900">
                          {formatDate(record.date, "MMM dd, yyyy")}
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-slate-400">
                          {formatDate(record.date, "EEEE")}
                        </td>
                        <td className="px-4 py-2.5">
                          {record.status === "Present" ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                              <CheckCircle2 className="h-2.5 w-2.5" />Present
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                              <XCircle className="h-2.5 w-2.5" />Absent
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Fee invoice summary */}
          <Card className="border-slate-200/80 bg-white shadow-none lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50">
                  <Banknote className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Fee Summary</CardTitle>
                  <CardDescription className="text-[11px]">Open invoices on your account.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">

              {/* Balance tile */}
              <div className={cn(
                "rounded-lg border px-4 py-3",
                outstandingBalance > 0
                  ? "border-amber-100 bg-amber-50/60"
                  : "border-emerald-100 bg-emerald-50/60",
              )}>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Outstanding balance</p>
                <p className={cn("mt-1 text-2xl font-bold leading-none",
                  outstandingBalance > 0 ? "text-amber-800" : "text-emerald-700",
                )}>
                  {formatCurrency(outstandingBalance || stats?.unpaidFees || 0)}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                  {nextDueFee
                    ? <><XCircle className="h-3 w-3 text-rose-400" />Due {formatDate(nextDueFee.dueDate, "MMMM dd, yyyy")}</>
                    : <><CheckCircle2 className="h-3 w-3 text-emerald-500" />No outstanding payments</>}
                </p>
              </div>

              {/* Invoice list */}
              {openInvoices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[12px] text-slate-400">
                  You have no open invoices right now.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {openInvoices.slice(0, 4).map((fee) => (
                    <div key={fee.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-slate-900 font-mono">
                          {fee.invoiceNumber ?? `INV-${fee.id}`}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {fee.billingPeriod} · Due {formatDate(fee.dueDate, "MMM dd")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", getFeeStatusClassName(fee.status))}>
                          {fee.status}
                        </span>
                        <p className="mt-0.5 text-[12px] font-bold text-slate-900">{formatCurrency(fee.remainingBalance)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button asChild size="sm" className="w-full justify-between bg-indigo-600 hover:bg-indigo-700 text-white">
                <Link href="/student/fees">
                  <span>Proceed to payment</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── Recent results ───────────────────────────────────────────── */}
        <Card className="border-slate-200/80 bg-white shadow-none">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">Recent Results</CardTitle>
                <CardDescription className="text-[11px]">Your latest published grades.</CardDescription>
              </div>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-indigo-600 hover:bg-indigo-50">
              <Link href="/student/results">
                Full analysis <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            {myRecentResults.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-[12px] text-slate-400">
                No recent grades available yet.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {myRecentResults.map((result) => (
                  <div key={result.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="text-[13px] font-bold text-slate-900">{result.subject}</p>
                        <p className="text-[11px] text-slate-400">Latest assessment</p>
                      </div>
                      <span className={cn(
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        result.grade === "F"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700",
                      )}>
                        {result.grade}
                      </span>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="text-3xl font-bold text-slate-900 leading-none">{result.marks}</span>
                      <span className="mb-0.5 text-[12px] text-slate-400">/ 100</span>
                    </div>
                    {/* Mini progress bar */}
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={cn("h-full rounded-full", result.marks >= 70 ? "bg-emerald-400" : result.marks >= 50 ? "bg-amber-400" : "bg-rose-400")}
                        style={{ width: `${result.marks}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </Layout>
  );
}
