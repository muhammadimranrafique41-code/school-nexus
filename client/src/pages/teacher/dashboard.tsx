import { useMemo } from "react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/hooks/use-auth";
import { useAcademics } from "@/hooks/use-academics";
import { useAttendance } from "@/hooks/use-attendance";
import { useResults } from "@/hooks/use-results";
import { useUsers } from "@/hooks/use-users";
import { ArrowRight, BookOpenCheck, CalendarDays, ClipboardCheck, GraduationCap, Users } from "lucide-react";

export default function TeacherDashboard() {
  const { data: user } = useUser();
  const { data: academics, isLoading: academicsLoading } = useAcademics();
  const { data: attendance, isLoading: attendanceLoading } = useAttendance();
  const { data: results, isLoading: resultsLoading } = useResults();
  const { data: users, isLoading: usersLoading } = useUsers();

  const subjectName = user?.subject?.trim() || "Not assigned";
  const todayKey = format(new Date(), "yyyy-MM-dd");

  const assignedSubjects = useMemo(
    () => (academics ?? []).filter((item) => item.teacherUserId === user?.id),
    [academics, user?.id],
  );

  const classNames = useMemo(
    () => Array.from(new Set(assignedSubjects.map((item) => item.className).filter(Boolean))),
    [assignedSubjects],
  );

  const monitoredStudents = useMemo(
    () => (users ?? []).filter((item) => item.role === "student" && item.className && classNames.includes(item.className)),
    [classNames, users],
  );

  const subjectResults = useMemo(
    () => (results ?? []).filter((item) => item.subject === user?.subject).sort((a, b) => b.id - a.id),
    [results, user?.subject],
  );

  const markedToday = useMemo(
    () => (attendance ?? []).filter((item) => item.teacherId === user?.id && format(new Date(item.date), "yyyy-MM-dd") === todayKey),
    [attendance, todayKey, user?.id],
  );

  const recentResults = subjectResults.slice(0, 5);
  const isLoading = academicsLoading || attendanceLoading || resultsLoading || usersLoading;

  const statCards = [
    { title: "My subject", value: subjectName, icon: GraduationCap, accent: "from-violet-500/15 to-fuchsia-500/15", iconClass: "text-violet-600" },
    { title: "Assigned classes", value: classNames.length, icon: CalendarDays, accent: "from-sky-500/15 to-indigo-500/15", iconClass: "text-sky-600" },
    { title: "Students monitored", value: monitoredStudents.length, icon: Users, accent: "from-emerald-500/15 to-teal-500/15", iconClass: "text-emerald-600" },
    { title: "Results entered", value: subjectResults.length, icon: BookOpenCheck, accent: "from-amber-500/15 to-orange-500/15", iconClass: "text-amber-600" },
  ];

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6 pb-8">
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
            <Skeleton className="h-56 rounded-[1.9rem]" />
            <Skeleton className="h-56 rounded-[1.9rem]" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36 rounded-[1.75rem]" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-80 rounded-[1.75rem] lg:col-span-2" />
            <Skeleton className="h-80 rounded-[1.75rem]" />
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
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.2),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(217,70,239,0.18),_transparent_26%)]" />
            <div className="relative space-y-5">
              <Badge variant="outline" className="border-white/15 bg-white/10 text-white">Teaching workspace</Badge>
              <div className="space-y-3">
                <h1 className="text-4xl font-display font-bold tracking-tight md:text-5xl">Teacher Dashboard</h1>
                <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                  Welcome back, {user?.name}. Stay on top of attendance, class coverage, and recent results from one premium workspace.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="secondary" className="border-none bg-white text-slate-900 hover:bg-slate-100">
                  <Link href="/teacher/attendance">Open attendance</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15 hover:text-white"
                >
                  <Link href="/teacher/results">Manage results</Link>
                </Button>
              </div>
            </div>
          </div>

          <Card className="bg-white/75">
            <CardHeader>
              <CardTitle>Today&apos;s teaching pulse</CardTitle>
              <CardDescription>Track class activity and keep your daily teaching workflow moving.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Attendance marked", value: markedToday.length },
                { label: "Linked classes", value: classNames.length },
                { label: "Monitored students", value: monitoredStudents.length },
                { label: "Recent results", value: recentResults.length },
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
          {statCards.map((stat) => (
            <Card key={stat.title} className="bg-white/80 transition-all duration-300 hover:-translate-y-1">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{stat.title}</p>
                  <p className="mt-2 text-3xl font-display font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`rounded-2xl bg-gradient-to-br ${stat.accent} p-3 ${stat.iconClass}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="bg-white/80 lg:col-span-2">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Assigned classes</CardTitle>
                <CardDescription>Subjects and classes currently linked to your account.</CardDescription>
              </div>
              <Badge variant="secondary">{markedToday.length} attendance entries today</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {assignedSubjects.length === 0 ? (
                <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/80 p-8 text-sm text-slate-500">
                  No academic assignments are linked to this teacher account yet.
                </div>
              ) : (
                assignedSubjects.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/75 p-4">
                    <div>
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="text-sm text-slate-500">{item.className || "Class not set"}</p>
                    </div>
                    <Badge variant="outline">{item.code}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-white/80">
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>Common teacher workflows.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-between">
                <Link href="/teacher/attendance">
                  <span className="flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4" /> Mark attendance
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href="/teacher/results">
                  <span className="flex items-center gap-2">
                    <BookOpenCheck className="h-4 w-4" /> Manage results
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white/80">
          <CardHeader>
            <CardTitle>Recent result activity</CardTitle>
            <CardDescription>Most recent marks recorded for {user?.subject || "your subject"}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentResults.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/80 p-8 text-sm text-slate-500">
                No results recorded yet.
              </div>
            ) : (
              recentResults.map((result) => (
                <div key={result.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/75 p-4">
                  <div>
                    <p className="font-semibold text-slate-900">{result.student?.name || `Student ${result.studentId}`}</p>
                    <p className="text-sm text-slate-500">{result.student?.className || "Class not set"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-500">{result.marks}/100</span>
                    <Badge variant={result.grade === "F" ? "destructive" : "secondary"}>{result.grade}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
