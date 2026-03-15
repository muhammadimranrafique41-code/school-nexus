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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getFeeStatusClassName } from "@/lib/finance";
import DailyDiaryCard from "@/components/daily-diary-card";
import { Award, Banknote, BookOpen, CalendarDays, FileText, GraduationCap, Percent, XCircle, ArrowRight } from "lucide-react";
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
    () => [...attendance].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5),
    [attendance],
  );
  const openInvoices = useMemo(
    () => [...(fees ?? [])].filter((item) => item.studentId === user?.id && item.remainingBalance > 0).sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)),
    [fees, user?.id],
  );

  const overdueInvoices = useMemo(
    () => openInvoices.filter((item) => item.status === "Overdue"),
    [openInvoices],
  );

  const outstandingBalance = openInvoices.reduce((sum, fee) => sum + fee.remainingBalance, 0);
  const nextDueFee = openInvoices[0];
  const timetableItems = timetable?.items ?? [];
  const quickAccessCards = [
    {
      title: "My Attendance",
      description: "Open filters, attendance trends, and your calendar-style record view.",
      value: `${attendanceSummary?.attendanceRate ?? stats?.attendanceRate ?? 0}%`,
      hint: `${attendanceSummary?.currentStreak ?? 0} session streak`,
      href: "/student/attendance",
      cta: "Open attendance",
      icon: CalendarDays,
    },
    {
      title: "My Timetable",
      description: "Review your weekly periods, teachers, rooms, and class times.",
      value: timetableItems.length,
      hint: `${timetable?.className ?? user?.className ?? "Unassigned class"}`,
      href: "/student/timetable",
      cta: "Open timetable",
      icon: BookOpen,
    },
    {
      title: "My Results",
      description: "See exam-wise performance, GPA insights, charts, and printable reports.",
      value: resultsOverview?.overview.currentGpa ?? 0,
      hint: `${resultsOverview?.overview.totalExams ?? 0} published exam(s)`,
      href: "/student/results",
      cta: "Open results",
      icon: GraduationCap,
    },
  ] as const;

  if (statsLoading || attendanceLoading || attendanceSummaryLoading || resultsLoading || timetableLoading || feesLoading) {
    return (
      <Layout>
        <div className="space-y-6 pb-8">
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
            <Skeleton className="h-60 rounded-[1.9rem]" />
            <Skeleton className="h-60 rounded-[1.9rem]" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36 rounded-[1.75rem]" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-64 rounded-[1.75rem]" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-7">
            <Skeleton className="h-[28rem] rounded-[1.75rem] lg:col-span-4" />
            <Skeleton className="h-[28rem] rounded-[1.75rem] lg:col-span-3" />
          </div>
          <Skeleton className="h-72 rounded-[1.75rem]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 pb-8">
        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="relative overflow-hidden rounded-[1.9rem] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-8 text-white shadow-[0_28px_80px_-32px_rgba(15,23,42,0.75)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(129,140,248,0.22),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(236,72,153,0.18),_transparent_26%)]" />
            <div className="relative space-y-5">
              <Badge variant="outline" className="border-white/15 bg-white/10 text-white">Student workspace</Badge>
              <div className="space-y-3">
                <h1 className="text-4xl font-display font-bold tracking-tight md:text-5xl">Student Dashboard</h1>
                <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                  Hello, {user?.name}. Your attendance, timetable, results, and fee progress now live together in one streamlined dashboard.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="secondary" className="border-none bg-white text-slate-900 hover:bg-slate-100">
                  <Link href="/student/results">View results</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15 hover:text-white"
                >
                  <Link href="/student/timetable">Open timetable</Link>
                </Button>
              </div>
            </div>
          </div>

          <Card className="bg-white/75">
            <CardHeader>
              <CardTitle>Academic pulse</CardTitle>
              <CardDescription>Quick insight into your attendance, invoices, and recent academic performance.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Attendance streak", value: attendanceSummary?.currentStreak ?? 0 },
                { label: "Upcoming classes", value: timetableItems.length },
                { label: "Published exams", value: resultsOverview?.overview.totalExams ?? 0 },
                { label: "Open invoices", value: stats?.openInvoices ?? openInvoices.length },
              ].map((item) => (
                <div key={item.label} className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-3 text-3xl font-display font-bold text-slate-900">{item.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Attendance rate", value: `${attendanceSummary?.attendanceRate ?? stats?.attendanceRate ?? 0}%`, icon: Percent, hint: "Current term average", accent: "from-violet-500/15 to-fuchsia-500/15", iconClass: "text-violet-600" },
            { label: "Outstanding balance", value: formatCurrency(outstandingBalance || stats?.unpaidFees || 0), icon: Banknote, hint: nextDueFee ? `Next due ${formatDate(nextDueFee.dueDate, "MMM dd")}` : "No open invoices", accent: "from-amber-500/15 to-orange-500/15", iconClass: "text-amber-600" },
            { label: "Open invoices", value: stats?.openInvoices ?? openInvoices.length, icon: FileText, hint: openInvoices.length ? `${stats?.overdueInvoices ?? overdueInvoices.length} overdue invoice(s)` : "All invoices cleared", accent: "from-rose-500/15 to-pink-500/15", iconClass: "text-rose-600" },
            { label: "Latest grade", value: myRecentResults[0]?.grade || "N/A", icon: Award, hint: myRecentResults[0]?.subject || "No recent results", accent: "from-emerald-500/15 to-teal-500/15", iconClass: "text-emerald-600" },
          ].map((item) => (
            <Card key={item.label} className="bg-white/80 transition-all duration-300 hover:-translate-y-1">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-3xl font-display font-bold text-slate-900">{item.value}</p>
                  <p className="mt-2 text-xs font-medium text-slate-500">{item.hint}</p>
                </div>
                <div className={`rounded-2xl bg-gradient-to-br ${item.accent} p-3 ${item.iconClass}`}>
                  <item.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight">Academic Quick Access</h2>
            <p className="text-sm text-slate-500">Your new attendance, timetable, and results pages are available directly from the dashboard and sidebar.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-4">
            {quickAccessCards.map((item) => (
              <Card key={item.title} className="bg-white/80 transition-all duration-300 hover:-translate-y-1">
                <CardHeader className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-2xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 p-3 text-violet-600">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <Badge variant="secondary">Available now</Badge>
                  </div>
                  <div>
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription className="mt-1">{item.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-3xl font-display font-bold">{item.value}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{item.hint}</p>
                  </div>
                  <Button asChild variant="outline" className="w-full justify-between">
                    <Link href={item.href}>
                      <span>{item.cta}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
            <DailyDiaryCard />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-7">
          <Card className="bg-white/80 lg:col-span-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-violet-600" /> Recent Attendance
              </CardTitle>
              <CardDescription>Your latest marked attendance sessions.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="pl-6">Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRecentAttendance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="py-10 text-center text-slate-500">No attendance records found.</TableCell>
                    </TableRow>
                  ) : (
                    myRecentAttendance.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="pl-6 font-medium">{formatDate(record.date, "MMMM dd, yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant={record.status === "Present" ? "secondary" : "destructive"}>{record.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div className="border-t border-slate-200/70 p-4">
                <Button asChild variant="ghost" className="w-full">
                  <Link href="/student/attendance">View full attendance report</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-amber-600" /> Fee Invoice Summary
              </CardTitle>
              <CardDescription>Real open invoices linked to your account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-500">Outstanding balance</span>
                  <Badge variant="secondary">Current term</Badge>
                </div>
                <div className="mt-3 text-4xl font-display font-bold text-slate-900">{formatCurrency(outstandingBalance || stats?.unpaidFees || 0)}</div>
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                  <XCircle className="h-3 w-3" />
                  {nextDueFee ? `Next payment due ${formatDate(nextDueFee.dueDate, "MMMM dd, yyyy")}` : "No outstanding payments"}
                </p>
              </div>

              <div className="space-y-3">
                {openInvoices.length === 0 ? (
                  <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">
                    You have no open invoices right now.
                  </div>
                ) : (
                  openInvoices.slice(0, 4).map((fee) => (
                    <div key={fee.id} className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/75 p-4">
                      <div>
                        <p className="font-semibold text-slate-900">{fee.invoiceNumber ?? `INV-${fee.id}`}</p>
                        <p className="text-sm text-slate-500">{fee.billingPeriod} • Due {formatDate(fee.dueDate, "MMM dd, yyyy")}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={cn("mb-2 border", getFeeStatusClassName(fee.status))}>{fee.status}</Badge>
                        <p className="font-semibold text-slate-900">{formatCurrency(fee.remainingBalance)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Button asChild className="w-full justify-between">
                <Link href="/student/fees">
                  <span>Proceed to payment</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white/80">
          <CardHeader>
            <CardTitle>Recent Results</CardTitle>
            <CardDescription>Your latest published grades with a direct path to the full results experience.</CardDescription>
          </CardHeader>
          <CardContent>
            {myRecentResults.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/80 p-10 text-center text-slate-500">No recent grades available yet.</div>
            ) : (
              <div className="grid gap-6 md:grid-cols-3">
                {myRecentResults.map((result) => (
                  <Card key={result.id} className="border-slate-200/70 bg-slate-50/75 shadow-none">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{result.subject}</p>
                          <p className="text-sm text-slate-500">Latest assessment</p>
                        </div>
                        <Badge variant={result.grade === "F" ? "destructive" : "secondary"}>{result.grade}</Badge>
                      </div>
                      <div className="mt-4 flex items-end gap-2">
                        <span className="text-4xl font-display font-bold text-slate-900">{result.marks}</span>
                        <span className="pb-1 text-sm text-slate-500">/ 100</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
          <div className="border-t border-slate-200/70 p-4">
            <Button asChild variant="ghost" className="w-full">
              <Link href="/student/results">View full results analysis</Link>
            </Button>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
