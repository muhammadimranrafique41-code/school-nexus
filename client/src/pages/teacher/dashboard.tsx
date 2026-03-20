import { useMemo } from "react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/hooks/use-auth";
import { useAcademics } from "@/hooks/use-academics";
import { useAttendance } from "@/hooks/use-attendance";
import { useResults } from "@/hooks/use-results";
import { useUsers } from "@/hooks/use-users";
import { useTeacherPulseMarkComplete, useTeacherPulseSocket, useTeacherPulseToday } from "@/hooks/use-teacher-pulse";
import {
  ArrowRight, BookOpenCheck, CalendarDays, CheckCircle2,
  ClipboardCheck, GraduationCap, Loader2, MapPin,
  Users, XCircle, Clock4, Zap, ChevronRight,
  LayoutDashboard,
} from "lucide-react";

/* ─── helpers ────────────────────────────────────────────────────── */
function getPeriodConfig(status: string) {
  switch (status) {
    case "completed": return {
      pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-400",
      bar: "bg-emerald-400",
      icon: CheckCircle2,
      iconCls: "text-emerald-500",
    };
    case "missed": return {
      pill: "bg-red-50 text-red-700 border-red-200",
      dot: "bg-red-400",
      bar: "bg-red-400",
      icon: XCircle,
      iconCls: "text-red-500",
    };
    default: return {
      pill: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-400",
      bar: "bg-amber-400",
      icon: Clock4,
      iconCls: "text-amber-500",
    };
  }
}

/* Pulse ring — pure SVG */
function PulseRing({ completed, total }: { completed: number; total: number }) {
  const r = 32;
  const cx = 40;
  const cy = 40;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, completed / total) : 0;
  const dash = pct * circ;
  return (
    <svg width={80} height={80} className="shrink-0 -rotate-90">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fef3c7" strokeWidth={7} />
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="#f59e0b" strokeWidth={7} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
    </svg>
  );
}

/* Grade badge */
function GradeBadge({ grade }: { grade: string }) {
  const map: Record<string, string> = {
    "A+": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "A": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "B+": "bg-sky-50 text-sky-700 border-sky-200",
    "B": "bg-sky-50 text-sky-700 border-sky-200",
    "C+": "bg-amber-50 text-amber-700 border-amber-200",
    "C": "bg-amber-50 text-amber-700 border-amber-200",
    "D": "bg-orange-50 text-orange-700 border-orange-200",
    "F": "bg-red-50 text-red-700 border-red-200",
  };
  const cls = map[grade] ?? "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border text-xs font-black ${cls}`}>
      {grade}
    </span>
  );
}

/* ─── component ──────────────────────────────────────────────────── */
export default function TeacherDashboard() {
  const { data: user } = useUser();
  const { data: academics, isLoading: academicsLoading } = useAcademics();
  const { data: attendance, isLoading: attendanceLoading } = useAttendance();
  const { data: results, isLoading: resultsLoading } = useResults();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: pulse, isLoading: pulseLoading } = useTeacherPulseToday();
  const markComplete = useTeacherPulseMarkComplete();
  useTeacherPulseSocket();

  const subjectName = user?.subject?.trim() || "Not assigned";
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  /* derived */
  const assignedSubjects = useMemo(
    () => (academics ?? []).filter(i => i.teacherUserId === user?.id),
    [academics, user?.id],
  );
  const classNames = useMemo(
    () => Array.from(new Set(assignedSubjects.map(i => i.className).filter(Boolean))),
    [assignedSubjects],
  );
  const monitoredStudents = useMemo(
    () => (users ?? []).filter(i => i.role === "student" && i.className && classNames.includes(i.className)),
    [classNames, users],
  );
  const subjectResults = useMemo(
    () => (results ?? []).filter(i => i.subject === user?.subject).sort((a, b) => b.id - a.id),
    [results, user?.subject],
  );
  const markedToday = useMemo(
    () => (attendance ?? []).filter(i => i.teacherId === user?.id && format(new Date(i.date), "yyyy-MM-dd") === todayKey),
    [attendance, todayKey, user?.id],
  );

  const recentResults = subjectResults.slice(0, 5);
  const isLoading = academicsLoading || attendanceLoading || resultsLoading || usersLoading;

  const pulseCompleted = pulse?.stats.completed ?? 0;
  const pulseTotal = pulse?.stats.total ?? 0;
  const pulsePct = pulseTotal > 0 ? Math.round((pulseCompleted / pulseTotal) * 100) : 0;

  /* ── loading skeleton ── */
  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 p-4 space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      </Layout>
    );
  }

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-5">

          {/* ── Hero header ── */}
          <div className="relative overflow-hidden rounded-2xl bg-amber-500 px-5 py-5 text-white shadow-lg shadow-amber-100">
            {/* decorative rings */}
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
            <div className="absolute right-14 top-16 h-20 w-20 rounded-full bg-white/5" />

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              {/* left: greeting */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                    <LayoutDashboard className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-100">
                    Teaching Workspace
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight leading-tight">
                  {greeting}, {user?.name?.split(" ")[0] ?? "Teacher"} 👋
                </h1>
                <p className="text-sm text-amber-100 font-medium">
                  {subjectName} &nbsp;·&nbsp; {format(new Date(), "EEEE, MMMM d")}
                </p>
              </div>

              {/* right: CTA buttons */}
              <div className="flex flex-wrap gap-2">
                <Link href="/teacher/attendance">
                  <button className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold text-amber-700 shadow-sm hover:bg-amber-50 transition-colors">
                    <ClipboardCheck className="h-3.5 w-3.5" /> Attendance
                  </button>
                </Link>
                <Link href="/teacher/results">
                  <button className="flex items-center gap-1.5 rounded-xl bg-white/15 border border-white/25 px-4 py-2 text-xs font-bold text-white hover:bg-white/20 transition-colors">
                    <BookOpenCheck className="h-3.5 w-3.5" /> Results
                  </button>
                </Link>
              </div>
            </div>

            {/* inline stats bar */}
            <div className="relative z-10 mt-4 flex flex-wrap gap-3">
              {[
                { label: "Classes", value: classNames.length },
                { label: "Students", value: monitoredStudents.length },
                { label: "Results", value: subjectResults.length },
                { label: "Attendance today", value: markedToday.length },
              ].map(s => (
                <div key={s.label} className="rounded-xl bg-white/15 border border-white/20 px-3 py-1.5">
                  <p className="text-[10px] font-semibold text-amber-100 uppercase tracking-wider">{s.label}</p>
                  <p className="text-base font-bold text-white leading-tight">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Stat strip ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: GraduationCap, label: "My Subject", value: subjectName, accent: "bg-amber-50 text-amber-600" },
              { icon: CalendarDays, label: "Classes", value: classNames.length, accent: "bg-sky-50 text-sky-600" },
              { icon: Users, label: "Students", value: monitoredStudents.length, accent: "bg-violet-50 text-violet-600" },
              { icon: BookOpenCheck, label: "Results", value: subjectResults.length, accent: "bg-emerald-50 text-emerald-600" },
            ].map(s => (
              <div key={s.label}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.accent}`}>
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 truncate">{s.label}</p>
                  <p className="text-base font-bold text-slate-900 leading-tight truncate">{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Teaching Pulse ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            {/* pulse header */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-5 pb-4 border-b border-slate-50">
              <div className="flex items-center gap-4">
                {/* ring */}
                <div className="relative flex items-center justify-center">
                  <PulseRing completed={pulseCompleted} total={pulseTotal} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-base font-black text-amber-600 leading-none">{pulsePct}%</p>
                    <p className="text-[8px] font-semibold text-slate-400 mt-0.5">done</p>
                  </div>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Today's Teaching Pulse</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Track and complete your periods</p>
                </div>
              </div>

              {/* mini counters */}
              <div className="flex gap-2 flex-wrap">
                {[
                  { label: "Total", value: pulse?.stats.total ?? 0, cls: "bg-slate-50 text-slate-600 border-slate-200" },
                  { label: "Done", value: pulse?.stats.completed ?? 0, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                  { label: "Pending", value: pulse?.stats.pending ?? 0, cls: "bg-amber-50 text-amber-700 border-amber-200" },
                  { label: "Missed", value: pulse?.stats.missed ?? 0, cls: "bg-red-50 text-red-700 border-red-200" },
                ].map(c => (
                  <div key={c.label} className={`rounded-xl border px-3 py-1.5 text-center ${c.cls}`}>
                    <p className="text-[9px] font-bold uppercase tracking-wider opacity-70">{c.label}</p>
                    <p className="text-lg font-black leading-tight">{c.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* period list */}
            <div className="p-4 space-y-2.5">
              {pulseLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
                </div>
              ) : (pulse?.periods.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                  <Zap className="h-7 w-7 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-500">No periods scheduled today</p>
                  <p className="text-xs text-slate-400">Your teaching pulse will appear here once generated.</p>
                </div>
              ) : (
                (pulse?.periods ?? []).map(period => {
                  const cfg = getPeriodConfig(period.status);
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={period.id}
                      className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">

                      {/* status icon */}
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border
                        ${period.status === "completed" ? "bg-emerald-50 border-emerald-200"
                          : period.status === "missed" ? "bg-red-50 border-red-200"
                            : "bg-amber-50 border-amber-200"}`}>
                        <StatusIcon className={`h-4 w-4 ${cfg.iconCls}`} />
                      </div>

                      {/* info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-slate-900">{period.subject}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.pill}`}>
                            {period.status === "scheduled" ? "Pending" : period.status.charAt(0).toUpperCase() + period.status.slice(1)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock4 className="h-3 w-3" />
                            P{period.period} · {period.startTime} – {period.endTime}
                          </span>
                          {period.room && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {period.room}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* action */}
                      {period.status === "scheduled" && (
                        <button
                          disabled={markComplete.isPending}
                          onClick={() => markComplete.mutate({ id: period.id, note: undefined })}
                          className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-amber-200 hover:bg-amber-600 transition-colors disabled:opacity-50">
                          {markComplete.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <CheckCircle2 className="h-3.5 w-3.5" />
                          }
                          Complete
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Middle row: Assigned classes + Quick actions ── */}
          <div className="grid gap-5 lg:grid-cols-3">

            {/* Assigned classes */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden lg:col-span-2">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-50">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Assigned Classes</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Subjects linked to your account</p>
                </div>
                <span className="rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-600">
                  {markedToday.length} marked today
                </span>
              </div>
              <div className="p-4 space-y-2.5">
                {assignedSubjects.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                    <CalendarDays className="h-7 w-7 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-500">No classes assigned yet</p>
                    <p className="text-xs text-slate-400">Academic assignments will appear here.</p>
                  </div>
                ) : (
                  assignedSubjects.map(item => (
                    <div key={item.id}
                      className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                      {/* colour dot */}
                      <div className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-500">{item.className || "Class not set"}</p>
                      </div>
                      <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 font-mono">
                        {item.code}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-slate-50">
                <h2 className="text-sm font-bold text-slate-900">Quick Actions</h2>
                <p className="text-xs text-slate-400 mt-0.5">Common workflows</p>
              </div>
              <div className="p-4 space-y-2.5">
                {[
                  {
                    href: "/teacher/attendance",
                    icon: ClipboardCheck,
                    label: "Mark Attendance",
                    sub: "Record today's register",
                    accent: "bg-amber-50 text-amber-600",
                    border: "border-amber-100",
                  },
                  {
                    href: "/teacher/results",
                    icon: BookOpenCheck,
                    label: "Manage Results",
                    sub: "Enter & review marks",
                    accent: "bg-sky-50 text-sky-600",
                    border: "border-sky-100",
                  },
                ].map(action => (
                  <Link key={action.href} href={action.href}>
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3.5 hover:bg-slate-100/60 transition-colors cursor-pointer group">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${action.accent} ${action.border}`}>
                        <action.icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900">{action.label}</p>
                        <p className="text-[10px] text-slate-500">{action.sub}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </div>
                  </Link>
                ))}

                {/* class summary pills */}
                {classNames.length > 0 && (
                  <div className="pt-1 space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                      Your classes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {classNames.map(cls => (
                        <span key={cls}
                          className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                          {cls}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Recent Results ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-50">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Recent Result Activity</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Latest marks for {user?.subject || "your subject"}
                </p>
              </div>
              {subjectResults.length > 5 && (
                <Link href="/teacher/results">
                  <button className="flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors">
                    View all <ArrowRight className="h-3 w-3" />
                  </button>
                </Link>
              )}
            </div>
            <div className="p-4 space-y-2.5">
              {recentResults.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                  <BookOpenCheck className="h-7 w-7 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-500">No results recorded yet</p>
                  <p className="text-xs text-slate-400">Marks will appear here once entered.</p>
                </div>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {recentResults.map(result => (
                    <div key={result.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 space-y-2">
                      {/* top */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                            {result.student?.name || `Student ${result.studentId}`}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                            {result.student?.className || "Class N/A"}
                          </p>
                        </div>
                        <GradeBadge grade={result.grade} />
                      </div>

                      {/* score bar */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] text-slate-400">Marks</p>
                          <p className="text-[10px] font-bold text-slate-700">{result.marks}/100</p>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full transition-all
                              ${result.marks >= 80 ? "bg-emerald-400"
                                : result.marks >= 60 ? "bg-sky-400"
                                  : result.marks >= 45 ? "bg-amber-400"
                                    : "bg-red-400"}`}
                            style={{ width: `${result.marks}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
}
