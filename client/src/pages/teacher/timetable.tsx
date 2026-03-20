import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useTeacherTimetable } from "@/hooks/use-timetable";
import { useUser } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, School } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveSettingsFull, computePeriodTimeline } from "@/lib/timetable-settings-bus";

/* ─── constants ──────────────────────────────────────────────────── */
const ALL_DAYS: Record<number, { label: string; short: string; num: number }> = {
  1: { label: "Monday", short: "Mon", num: 1 },
  2: { label: "Tuesday", short: "Tue", num: 2 },
  3: { label: "Wednesday", short: "Wed", num: 3 },
  4: { label: "Thursday", short: "Thu", num: 4 },
  5: { label: "Friday", short: "Fri", num: 5 },
  6: { label: "Saturday", short: "Sat", num: 6 },
};

const CLASS_COLORS = [
  { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", dot: "bg-violet-400", bar: "bg-violet-400" },
  { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", dot: "bg-sky-400", bar: "bg-sky-400" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-400", bar: "bg-emerald-400" },
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", dot: "bg-rose-400", bar: "bg-rose-400" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", dot: "bg-cyan-400", bar: "bg-cyan-400" },
  { bg: "bg-fuchsia-50", border: "border-fuchsia-200", text: "text-fuchsia-700", dot: "bg-fuchsia-400", bar: "bg-fuchsia-400" },
];

function getClassColor(className: string, colorMap: Map<string, number>) {
  if (!colorMap.has(className)) colorMap.set(className, colorMap.size % CLASS_COLORS.length);
  return CLASS_COLORS[colorMap.get(className)!];
}

/* ─── component ──────────────────────────────────────────────────── */
export default function TeacherTimetable() {
  const { data: user } = useUser();
  const { data: periods, isLoading } = useTeacherTimetable();
  const { settings, isLoading: isSettingsLoading } = useLiveSettingsFull();

  const todayNum = new Date().getDay();
  const todayDayNum = todayNum === 0 ? 7 : todayNum;

  const activeDays = useMemo(
    () => settings ? settings.workingDays.map((d: number) => ALL_DAYS[d]).filter(Boolean) : [],
    [settings],
  );
  const timeline = useMemo(
    () => settings ? computePeriodTimeline(settings) : [],
    [settings],
  );

  const colorMap = useMemo(() => new Map<string, number>(), [periods]);

  /* mobile day tab state — default to today if in working days */
  const [activeDay, setActiveDay] = useState<number>(() => {
    return todayDayNum;
  });
  const activeDayIdx = activeDays.findIndex((d: { num: number }) => d.num === activeDay);
  const safeDayIdx = activeDayIdx >= 0 ? activeDayIdx : 0;

  const byDay = useMemo(() => {
    const map: Record<number, any[]> = {};
    activeDays.forEach((d: { num: number }) => (map[d.num] = []));
    for (const p of periods ?? []) {
      if (map[p.dayOfWeek] !== undefined) map[p.dayOfWeek].push(p);
    }
    for (const d of activeDays) map[d.num]?.sort((a: any, b: any) => a.period - b.period);
    return map;
  }, [periods, activeDays]);

  const stats = useMemo(() => {
    const all = periods ?? [];
    const classes = new Set(all.map((p: any) => p.className));
    const pPerDay = activeDays.map((d: { num: number }) => byDay[d.num]?.length ?? 0);
    const maxPd = Math.max(...pPerDay, 0);
    const busiestDay = activeDays[pPerDay.indexOf(maxPd)]?.label ?? "—";
    const uniqueSubjects = new Set(all.map((p: any) => p.subject));
    return {
      totalPeriods: all.length,
      classes: classes.size,
      subjects: uniqueSubjects.size,
      busiestDay,
    };
  }, [periods, byDay, activeDays]);

  /* ── loading ── */
  if (isLoading || isSettingsLoading || !settings) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 p-4 space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
          <Skeleton className="h-12 rounded-2xl" />
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        </div>
      </Layout>
    );
  }

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
                    <CalendarDays className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-100">
                    Teacher Workspace
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight leading-tight">My Timetable</h1>
                <p className="text-sm text-amber-100 font-medium">
                  {user?.name} · Weekly teaching schedule
                </p>
              </div>
              {/* today indicator */}
              {activeDays.some((d: { num: number }) => d.num === todayDayNum) && (
                <div className="rounded-xl bg-white/15 border border-white/20 px-3.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200">Today</p>
                  <p className="text-base font-black text-white leading-tight">
                    {ALL_DAYS[todayDayNum]?.label ?? "—"}
                  </p>
                </div>
              )}
            </div>

            {/* stat pills */}
            <div className="relative z-10 mt-4 flex flex-wrap gap-2">
              {[
                { icon: BookOpen, label: "Periods/Week", value: stats.totalPeriods },
                { icon: School, label: "Classes", value: stats.classes },
                { icon: CalendarDays, label: "Subjects", value: stats.subjects },
                { icon: Clock, label: "Busiest Day", value: stats.busiestDay },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2 rounded-xl bg-white/15 border border-white/20 px-3 py-2">
                  <s.icon className="h-3.5 w-3.5 text-amber-200 shrink-0" />
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-200">{s.label}</p>
                    <p className="text-sm font-black text-white leading-none mt-0.5">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Empty state ── */}
          {(periods ?? []).length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <CalendarDays className="h-6 w-6 text-slate-300" />
              </div>
              <p className="font-bold text-slate-700">No timetable assigned yet</p>
              <p className="text-xs text-slate-400 max-w-xs">Ask your admin to publish a timetable that includes your account.</p>
            </div>
          )}

          {(periods ?? []).length > 0 && (
            <>
              {/* ── DESKTOP: full matrix grid ─────────────────────── */}
              <div className="hidden lg:block">
                <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100">
                          {/* Period col */}
                          <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 min-w-[110px] border-r border-slate-100">
                            Period
                          </th>
                          {activeDays.map((day: { num: number, label: string, short: string }) => (
                            <th key={day.num}
                              className={cn(
                                "px-3 py-3 text-center text-xs font-bold uppercase tracking-wider min-w-[150px]",
                                day.num === todayDayNum
                                  ? "bg-amber-500 text-white"
                                  : "bg-slate-50 text-slate-500"
                              )}>
                              <div>{day.short}</div>
                              {day.num === todayDayNum && (
                                <div className="text-[10px] font-normal opacity-80 mt-0.5">Today</div>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {timeline.map((slot: any) => {
                          if (slot.isBreak) {
                            return (
                              <tr key={`break-${slot.startTime}`} className="bg-slate-50/60">
                                <td className="sticky left-0 z-10 bg-slate-50/60 border-r border-slate-100 px-4 py-2">
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 italic">
                                    <Clock className="h-3 w-3" />
                                    <span>Break · {slot.startTime}–{slot.endTime}</span>
                                  </div>
                                </td>
                                {activeDays.map((day: { num: number }) => (
                                  <td key={day.num}
                                    className={cn("px-3 py-2", day.num === todayDayNum && "bg-amber-50/30")}>
                                    <div className="h-0.5 w-full rounded bg-slate-100" />
                                  </td>
                                ))}
                              </tr>
                            );
                          }

                          return (
                            <tr key={`p-${slot.periodNumber}`}
                              className="hover:bg-slate-50/50 transition-colors">
                              {/* Period label */}
                              <td className="sticky left-0 z-10 bg-white border-r border-slate-100 px-4 py-2.5">
                                <p className="text-xs font-bold text-slate-700">P{slot.periodNumber}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {slot.startTime}–{slot.endTime}
                                </p>
                              </td>
                              {/* Day cells */}
                              {activeDays.map((day: { num: number }) => {
                                const p = byDay[day.num]?.find((x: any) => x.period === slot.periodNumber);
                                const isToday = day.num === todayDayNum;
                                if (!p) return (
                                  <td key={day.num}
                                    className={cn("px-2 py-2", isToday && "bg-amber-50/30")}>
                                    <div className="flex items-center justify-center">
                                      <span className="text-slate-200 text-xs">—</span>
                                    </div>
                                  </td>
                                );
                                const color = getClassColor(p.className, colorMap);
                                return (
                                  <td key={day.num}
                                    className={cn("px-2 py-2", isToday && "bg-amber-50/20")}>
                                    <div className={cn(
                                      "rounded-xl border px-2.5 py-2 hover:shadow-sm transition-all cursor-default",
                                      color.bg, color.border
                                    )}>
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", color.dot)} />
                                        <p className={cn("text-xs font-bold truncate leading-tight", color.text)}>
                                          {p.subject ?? "—"}
                                        </p>
                                      </div>
                                      <p className="text-[10px] text-slate-500 truncate">{p.className}</p>
                                      {p.room && (
                                        <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                                          <span className="truncate">{p.room}</span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ── MOBILE / TABLET: day-by-day view ──────────────── */}
              <div className="lg:hidden space-y-3">
                {/* Day tab strip */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const prev = activeDays[Math.max(0, safeDayIdx - 1)];
                      if (prev) setActiveDay(prev.num);
                    }}
                    disabled={safeDayIdx === 0}
                    className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-30 shadow-sm">
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div className="flex flex-1 gap-1 overflow-x-auto scrollbar-none rounded-2xl border border-slate-100 bg-white p-1 shadow-sm">
                    {activeDays.map((day: { num: number, short: string, label: string }) => {
                      const dayPeriods = byDay[day.num] ?? [];
                      const isActive = activeDay === day.num;
                      const isToday = day.num === todayDayNum;
                      return (
                        <button
                          key={day.num}
                          onClick={() => setActiveDay(day.num)}
                          className={cn(
                            "flex-1 min-w-[44px] rounded-xl py-1.5 transition-all text-xs font-bold",
                            isActive
                              ? "bg-amber-500 text-white shadow-sm"
                              : isToday
                                ? "text-amber-600 bg-amber-50"
                                : "text-slate-500 hover:bg-slate-50"
                          )}>
                          {day.short}
                          {/* period count dot */}
                          {dayPeriods.length > 0 && !isActive && (
                            <span className={cn(
                              "block w-1 h-1 rounded-full mx-auto mt-0.5",
                              isToday ? "bg-amber-400" : "bg-slate-300"
                            )} />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => {
                      const next = activeDays[Math.min(activeDays.length - 1, safeDayIdx + 1)];
                      if (next) setActiveDay(next.num);
                    }}
                    disabled={safeDayIdx >= activeDays.length - 1}
                    className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-30 shadow-sm">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Day header */}
                <div className="flex items-center gap-2 px-1">
                  <h2 className="font-bold text-slate-800 text-base">
                    {activeDays.find((d: { num: number }) => d.num === activeDay)?.label ?? "—"}
                  </h2>
                  {activeDay === todayDayNum && (
                    <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      Today
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">
                    {byDay[activeDay]?.length ?? 0} period(s)
                  </span>
                </div>

                {/* Period cards */}
                <div className="space-y-2">
                  {timeline.map((slot: any) => {
                    if (slot.isBreak) {
                      return (
                        <div key={`break-${slot.startTime}`}
                          className="flex items-center gap-3 px-2 py-1">
                          <div className="h-px flex-1 bg-slate-100" />
                          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                            Break · {slot.startTime}–{slot.endTime}
                          </span>
                          <div className="h-px flex-1 bg-slate-100" />
                        </div>
                      );
                    }

                    const p = byDay[activeDay]?.find((x: any) => x.period === slot.periodNumber);
                    const color = p ? getClassColor(p.className, colorMap) : null;

                    return (
                      <div key={`p-${slot.periodNumber}`}
                        className="flex gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                        {/* time strip */}
                        <div className="flex flex-col items-center gap-1 pt-0.5 w-12 shrink-0">
                          <p className="text-[10px] font-black text-slate-500">P{slot.periodNumber}</p>
                          <p className="text-[9px] text-slate-400 text-center leading-tight">
                            {slot.startTime}<br />{slot.endTime}
                          </p>
                        </div>

                        {/* colour bar */}
                        <div className={cn(
                          "w-0.5 rounded-full shrink-0",
                          color ? color.bar : "bg-slate-100"
                        )} />

                        {/* content */}
                        {p && color ? (
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className={cn("font-bold text-sm", color.text)}>{p.subject ?? "—"}</p>
                            </div>
                            <p className="text-xs text-slate-600 font-medium">{p.className}</p>
                            {p.room && (
                              <div className="flex items-center gap-1 mt-1.5 text-[10px] text-slate-400">
                                <MapPin className="h-3 w-3" /> {p.room}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center">
                            <span className="text-xs text-slate-300">Free period</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Class colour legend ─────────────────────────── */}
              {colorMap.size > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Classes</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(colorMap.entries()).map(([className, idx]) => {
                      const c = CLASS_COLORS[idx % CLASS_COLORS.length];
                      return (
                        <span key={className}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                            c.bg, c.border, c.text
                          )}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                          {className}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </Layout>
  );
}
