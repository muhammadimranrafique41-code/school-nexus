import { useMemo } from "react";
import { format } from "date-fns";
import { Layout } from "@/components/layout";
import { useTeacherTimetable } from "@/hooks/use-timetable";
import { useUser } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, CalendarDays, Clock, Loader2, MapPin, School } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = [
  { label: "Monday", short: "Mon", num: 1 },
  { label: "Tuesday", short: "Tue", num: 2 },
  { label: "Wednesday", short: "Wed", num: 3 },
  { label: "Thursday", short: "Thu", num: 4 },
  { label: "Friday", short: "Fri", num: 5 },
  { label: "Saturday", short: "Sat", num: 6 },
];

const PERIOD_TIMES: Record<number, string> = {
  1: "8:00 – 8:45",
  2: "8:45 – 9:30",
  3: "9:30 – 10:15",
  4: "10:30 – 11:15",
  5: "11:15 – 12:00",
  6: "13:00 – 13:45",
  7: "13:45 – 14:30",
  8: "14:30 – 15:15",
};

// Assign a consistent color accent per unique className
const CLASS_COLORS = [
  { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", dot: "bg-violet-400" },
  { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", dot: "bg-sky-400" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-400" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-400" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700", dot: "bg-pink-400" },
  { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700", dot: "bg-teal-400" },
];

function getClassColor(className: string, colorMap: Map<string, number>) {
  if (!colorMap.has(className)) colorMap.set(className, colorMap.size % CLASS_COLORS.length);
  return CLASS_COLORS[colorMap.get(className)!];
}

export default function TeacherTimetable() {
  const { data: user } = useUser();
  const { data: periods, isLoading } = useTeacherTimetable();

  const todayNum = new Date().getDay(); // 0=Sun 1=Mon … 6=Sat
  const todayDayNum = todayNum === 0 ? 7 : todayNum; // map Sun to 7 (unused); Sat=6

  const colorMap = useMemo(() => new Map<string, number>(), [periods]);

  const byDay = useMemo(() => {
    const map: Record<number, any[]> = {};
    DAYS.forEach((d) => (map[d.num] = []));
    for (const p of periods ?? []) {
      if (map[p.dayOfWeek]) map[p.dayOfWeek].push(p);
    }
    for (const d of DAYS) map[d.num].sort((a, b) => a.period - b.period);
    return map;
  }, [periods]);

  const stats = useMemo(() => {
    const all = periods ?? [];
    const classes = new Set(all.map((p: any) => p.className));
    const periodsPerDay = DAYS.map((d) => byDay[d.num]?.length ?? 0);
    const busiestDay = DAYS[periodsPerDay.indexOf(Math.max(...periodsPerDay))]?.label ?? "—";
    return {
      totalPeriods: all.length,
      classes: classes.size,
      busiestDay,
    };
  }, [periods, byDay]);

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6 pb-8">
          <Skeleton className="h-44 rounded-[1.9rem]" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-[1.5rem]" />)}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-[1.5rem]" />)}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 pb-8">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-[1.9rem] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-900 p-8 text-white shadow-[0_28px_80px_-32px_rgba(15,23,42,0.75)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(139,92,246,0.3),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.15),_transparent_26%)]" />
          <div className="relative space-y-3">
            <Badge variant="outline" className="border-white/15 bg-white/10 text-white">
              <CalendarDays className="mr-1.5 h-3 w-3" /> My Weekly Schedule
            </Badge>
            <h1 className="text-4xl font-display font-bold tracking-tight md:text-5xl">
              My Timetable
            </h1>
            <p className="max-w-xl text-slate-300">
              Welcome, {user?.name}. Your teaching schedule across all assigned classes — updated automatically when admin publishes.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Periods / week", value: stats.totalPeriods, icon: BookOpen, accent: "from-violet-500/15 to-fuchsia-500/15", iconClass: "text-violet-600" },
            { label: "Classes taught", value: stats.classes, icon: School, accent: "from-sky-500/15 to-indigo-500/15", iconClass: "text-sky-600" },
            { label: "Busiest day", value: stats.busiestDay, icon: CalendarDays, accent: "from-amber-500/15 to-orange-500/15", iconClass: "text-amber-600" },
          ].map((s) => (
            <Card key={s.label} className="bg-white/80 transition-all duration-300 hover:-translate-y-1">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{s.label}</p>
                  <p className="mt-2 text-3xl font-display font-bold text-slate-900">{s.value}</p>
                </div>
                <div className={`rounded-2xl bg-gradient-to-br ${s.accent} p-3 ${s.iconClass}`}>
                  <s.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty state */}
        {(periods ?? []).length === 0 && (
          <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-12 text-center text-slate-500">
            <CalendarDays className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-medium">No timetable assigned yet.</p>
            <p className="mt-1 text-sm">Ask admin to publish a timetable that includes you.</p>
          </div>
        )}

        {/* Day columns */}
        {(periods ?? []).length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DAYS.map((day) => {
              const dayPeriods = byDay[day.num] ?? [];
              const isToday = day.num === todayDayNum;
              return (
                <Card
                  key={day.num}
                  className={cn(
                    "overflow-hidden transition-all duration-200",
                    isToday ? "ring-2 ring-indigo-400 ring-offset-2 shadow-lg" : "bg-white/80 shadow-sm",
                  )}
                >
                  <CardHeader className={cn("pb-3", isToday && "bg-gradient-to-r from-indigo-50 to-violet-50")}>
                    <div className="flex items-center justify-between">
                      <CardTitle className={cn("text-base font-display", isToday && "text-indigo-700")}>
                        {day.label}
                        {isToday && (
                          <span className="ml-2 text-xs font-normal text-indigo-500">Today</span>
                        )}
                      </CardTitle>
                      <Badge variant={dayPeriods.length > 0 ? "secondary" : "outline"} className="text-xs">
                        {dayPeriods.length} period{dayPeriods.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {dayPeriods.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                        No classes
                      </div>
                    ) : (
                      dayPeriods.map((p: any) => {
                        const color = getClassColor(p.className, colorMap);
                        return (
                          <div
                            key={p.id}
                            className={cn(
                              "rounded-xl border p-3 transition-all duration-150 hover:shadow-sm",
                              color.bg,
                              color.border,
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <div className={cn("h-2 w-2 rounded-full flex-shrink-0", color.dot)} />
                                  <p className={cn("truncate text-sm font-semibold", color.text)}>
                                    {p.subject ?? "—"}
                                  </p>
                                </div>
                                <p className="mt-0.5 text-xs text-slate-500">{p.className}</p>
                              </div>
                              <span className="flex-shrink-0 rounded-md bg-white/60 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                                P{p.period}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {PERIOD_TIMES[p.period] ?? `Period ${p.period}`}
                              </span>
                              {p.room && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" /> {p.room}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
