import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useStudentTimetable } from "@/hooks/use-timetable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, escapeHtml, openPrintWindow } from "@/lib/utils";
import {
  BookOpen, Clock3, Download, FileDown, Loader2,
  MapPin, Users, GraduationCap, CalendarDays, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useLiveSettingsFull, computePeriodTimeline } from "@/lib/timetable-settings-bus";

/* ─── types ─────────────────────────────────────────────────────── */
type PeriodRow = {
  key: string;
  periodLabel: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isBreak?: boolean;
};

/* ─── constants ──────────────────────────────────────────────────── */
const ALL_DAYS: Record<number, { label: string; short: string; num: number }> = {
  1: { label: "Monday", short: "Mon", num: 1 },
  2: { label: "Tuesday", short: "Tue", num: 2 },
  3: { label: "Wednesday", short: "Wed", num: 3 },
  4: { label: "Thursday", short: "Thu", num: 4 },
  5: { label: "Friday", short: "Fri", num: 5 },
  6: { label: "Saturday", short: "Sat", num: 6 },
};

/* Vibrant subject palette — cycles through subjects automatically */
const SUBJECT_PALETTE = [
  { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", dot: "bg-violet-400" },
  { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", dot: "bg-sky-400" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-400" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-400" },
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", dot: "bg-rose-400" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", dot: "bg-cyan-400" },
  { bg: "bg-fuchsia-50", border: "border-fuchsia-200", text: "text-fuchsia-700", dot: "bg-fuchsia-400" },
  { bg: "bg-lime-50", border: "border-lime-200", text: "text-lime-700", dot: "bg-lime-400" },
];

/* ─── component ──────────────────────────────────────────────────── */
export default function StudentTimetable() {
  const { data, isLoading } = useStudentTimetable();
  const { settings, isLoading: isSettingsLoading } = useLiveSettingsFull();
  const items = data?.items ?? [];

  const todayNum = new Date().getDay();
  const todayDayNum = todayNum === 0 ? 7 : todayNum;

  /* ── days ── */
  const days = useMemo(() => {
    const settingsDays = settings?.workingDays
      ?.map((d: number) => ALL_DAYS[d as keyof typeof ALL_DAYS]?.label)
      .filter(Boolean) ?? [];
    const apiDays = data?.days ?? [];
    const dataDays = items.map(i =>
      typeof i.dayOfWeek === "number" ? ALL_DAYS[i.dayOfWeek]?.label : i.dayOfWeek
    ).filter(Boolean);

    const daySet = new Set([...settingsDays, ...apiDays, ...dataDays]);
    if (daySet.size === 0)
      return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return order.filter(d => daySet.has(d));
  }, [settings?.workingDays, data?.days, items]);

  /* ── mobile tab state ── */
  const [activeDay, setActiveDay] = useState<string>(() => {
    const todayLabel = ALL_DAYS[todayDayNum]?.label;
    return days.includes(todayLabel ?? "") ? (todayLabel ?? days[0] ?? "") : (days[0] ?? "");
  });
  const activeDayIdx = days.indexOf(activeDay);

  /* ── subject → colour map ── */
  const subjectColorMap = useMemo(() => {
    const subjects = Array.from(new Set(items.map(i => i.subject)));
    return Object.fromEntries(
      subjects.map((s, idx) => [s, SUBJECT_PALETTE[idx % SUBJECT_PALETTE.length]])
    );
  }, [items]);

  /* ── summary ── */
  const summary = useMemo(() => {
    const subjects = new Set(items.map(i => i.subject));
    const teachers = new Set(items.map(i => i.teacherName).filter(Boolean));
    const ordered = [...items].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return {
      totalClasses: items.length,
      subjects: subjects.size,
      teachers: teachers.size,
      firstClass: ordered[0]?.startTime ?? "—",
    };
  }, [items]);

  /* ── period rows ── */
  const periodRows = useMemo<PeriodRow[]>(() => {
    const rowsMap = new Map<string, PeriodRow>();
    if (settings) {
      const requestedPeriodIds = Array.from(new Set(items.map(i => Number(i.sortOrder || 0)))).filter(n => n > 0);
      const timeline = computePeriodTimeline(settings, requestedPeriodIds);
      timeline.forEach((t: any) => {
        const key = t.isBreak ? `break-${t.startTime}-${t.endTime}` : `p-${t.periodNumber}`;
        rowsMap.set(key, {
          key,
          periodLabel: t.isBreak ? "Break" : `Period ${t.periodNumber}`,
          startTime: t.startTime,
          endTime: t.endTime,
          sortOrder: t.periodNumber ?? 99,
          isBreak: t.isBreak,
        });
      });
    }
    items.forEach(item => {
      const matches = Array.from(rowsMap.values()).some(r =>
        !r.isBreak && (Number(r.sortOrder) === Number(item.sortOrder) ||
          String(r.periodLabel) === String(item.periodLabel))
      );
      if (!matches) {
        const key = `extra-${item.sortOrder}-${item.periodLabel}-${item.startTime}`;
        if (!rowsMap.has(key))
          rowsMap.set(key, {
            key,
            periodLabel: item.periodLabel,
            startTime: item.startTime,
            endTime: item.endTime,
            sortOrder: item.sortOrder,
          });
      }
    });
    return Array.from(rowsMap.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime)
    );
  }, [settings, items]);

  /* ── items by day ── */
  const itemsByDay = useMemo(() =>
    days.reduce<Record<string, typeof items>>((acc, day) => {
      const targetNum = Object.values(ALL_DAYS).find(d => d.label === day)?.num;
      acc[day] = [...items]
        .filter(i => i.dayOfWeek === day || (targetNum !== undefined && i.dayOfWeek === targetNum))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime));
      return acc;
    }, {})
    , [days, items]);

  /* ── helpers ── */
  const isToday = (day: string) => {
    const num = Object.values(ALL_DAYS).find(d => d.label === day)?.num;
    return num === todayDayNum;
  };

  const getCellItem = (day: string, period: PeriodRow) => {
    const dayNum = Object.values(ALL_DAYS).find(d => d.label === day)?.num;
    return items.find(e =>
      (String(e.dayOfWeek) === day || Number(e.dayOfWeek) === dayNum) &&
      (Number(e.sortOrder) === Number(period.sortOrder) ||
        String(e.periodLabel) === String(period.periodLabel))
    );
  };

  /* ── export / print ── */
  const exportTimetable = () =>
    downloadCsv("student-timetable.csv",
      items.map(i => ({
        Day: i.dayOfWeek, Period: i.periodLabel,
        Time: `${i.startTime} - ${i.endTime}`,
        Subject: i.subject, Teacher: i.teacherName ?? "",
        Room: i.room ?? "", Type: i.classType ?? "",
      }))
    );

  const printTimetable = () => {
    const sections = days.map(day => {
      const dayNum = Object.values(ALL_DAYS).find(d => d.label === day)?.num;
      const rows = periodRows.map(p => {
        if (p.isBreak)
          return `<tr style="background:#f8fafc;font-style:italic"><td colspan="2">${escapeHtml(p.startTime)} – ${escapeHtml(p.endTime)}</td><td colspan="3">Break</td></tr>`;
        const item = items.find(e =>
          (String(e.dayOfWeek) === day || Number(e.dayOfWeek) === dayNum) &&
          (Number(e.sortOrder) === Number(p.sortOrder) || String(e.periodLabel) === String(p.periodLabel))
        );
        return `<tr>
          <td>${escapeHtml(p.periodLabel)}</td>
          <td>${escapeHtml(`${p.startTime} – ${p.endTime}`)}</td>
          <td>${escapeHtml(item?.subject || "—")}</td>
          <td>${escapeHtml(item?.teacherName || "—")}</td>
          <td>${escapeHtml(item?.room || "—")}</td>
        </tr>`;
      }).join("");
      return `<div class="section">
        <h2 style="margin-top:20px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">${escapeHtml(day)}</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <thead><tr style="background:#f1f5f9">
            <th style="border:1px solid #e2e8f0;padding:8px;text-align:left">Period</th>
            <th style="border:1px solid #e2e8f0;padding:8px;text-align:left">Time</th>
            <th style="border:1px solid #e2e8f0;padding:8px;text-align:left">Subject</th>
            <th style="border:1px solid #e2e8f0;padding:8px;text-align:left">Teacher</th>
            <th style="border:1px solid #e2e8f0;padding:8px;text-align:left">Room</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join("");
    openPrintWindow("Weekly Timetable",
      `<h1>Weekly Timetable</h1><p>Class: ${escapeHtml(data?.className ?? "Unassigned")}</p>${sections}`,
      { subtitle: data?.className ? `Class: ${data.className}` : "Student timetable" }
    );
  };

  /* ── loading ── */
  const busy = isLoading || isSettingsLoading;

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <Layout>
      {/* ── Page wrapper ── */}
      <div className="min-h-screen bg-slate-50 font-sans">
        <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-6">

          {/* ── Header ── */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 shadow-md shadow-indigo-200">
                <CalendarDays className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                  My Timetable
                </h1>
                <p className="text-sm text-slate-500">
                  {data?.className ? (
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="h-3.5 w-3.5" />
                      Class: <strong className="text-slate-700">{data.className}</strong>
                    </span>
                  ) : "Weekly class schedule"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm" variant="outline"
                className="h-9 gap-1.5 border-slate-200 bg-white text-slate-700 text-xs shadow-sm hover:bg-slate-50"
                onClick={exportTimetable} disabled={items.length === 0}
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
              <Button
                size="sm"
                className="h-9 gap-1.5 bg-indigo-600 text-white text-xs shadow-sm shadow-indigo-200 hover:bg-indigo-700"
                onClick={printTimetable} disabled={busy}
              >
                <FileDown className="h-3.5 w-3.5" /> Print / PDF
              </Button>
            </div>
          </div>

          {/* ── Stat strip ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: BookOpen, label: "Weekly Classes", value: summary.totalClasses, accent: "text-indigo-600 bg-indigo-50" },
              { icon: BookOpen, label: "Subjects", value: summary.subjects, accent: "text-emerald-600 bg-emerald-50" },
              { icon: Users, label: "Teachers", value: summary.teachers, accent: "text-sky-600 bg-sky-50" },
              { icon: Clock3, label: "First Class", value: summary.firstClass, accent: "text-amber-600 bg-amber-50" },
            ].map(stat => (
              <div key={stat.label}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${stat.accent}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{stat.label}</p>
                  <p className="text-lg font-bold text-slate-900 leading-tight">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── DESKTOP MATRIX ─────────────────────────────────── */}
          <div className="hidden lg:block">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              {/* Sticky header row */}
              <div className="overflow-x-auto">
                {busy ? (
                  <div className="flex h-56 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                  </div>
                ) : periodRows.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-400">
                    No timetable entries available yet.
                  </div>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {/* Period col */}
                        <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-[120px] border-r border-slate-100">
                          Period
                        </th>
                        {days.map(day => (
                          <th key={day}
                            className={`px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider min-w-[160px]
                              ${isToday(day)
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-50 text-slate-500"
                              }`}
                          >
                            <div>{day.slice(0, 3)}</div>
                            {isToday(day) && (
                              <div className="mt-0.5 text-[10px] font-normal opacity-80 tracking-normal">Today</div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {periodRows.map(period => (
                        <tr key={period.key}
                          className={period.isBreak ? "bg-slate-50/70" : "hover:bg-slate-50/50 transition-colors"}>
                          {/* Period label */}
                          <td className={`sticky left-0 z-10 border-r border-slate-100 px-4 py-2
                            ${period.isBreak ? "bg-slate-50/70" : "bg-white"}`}>
                            {period.isBreak ? (
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 italic">
                                <Clock3 className="h-3 w-3" />
                                <span>Break</span>
                              </div>
                            ) : (
                              <>
                                <p className="font-semibold text-slate-700 text-xs">{period.periodLabel}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {period.startTime} – {period.endTime}
                                </p>
                              </>
                            )}
                          </td>

                          {/* Day cells */}
                          {days.map(day => {
                            if (period.isBreak)
                              return (
                                <td key={`${period.key}-${day}`}
                                  className={`px-3 py-2 text-center ${isToday(day) ? "bg-indigo-50/40" : ""}`}>
                                  <div className="h-0.5 w-full rounded bg-slate-100" />
                                </td>
                              );

                            const item = getCellItem(day, period);
                            const colors = item ? subjectColorMap[item.subject] : null;
                            return (
                              <td key={`${period.key}-${day}`}
                                className={`px-2 py-2 ${isToday(day) ? "bg-indigo-50/30" : ""}`}>
                                {item && colors ? (
                                  <div className={`rounded-xl border ${colors.border} ${colors.bg} px-2.5 py-2 group cursor-default transition-all hover:shadow-sm`}>
                                    <div className={`flex items-center gap-1.5 mb-1`}>
                                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${colors.dot}`} />
                                      <p className={`font-semibold text-xs leading-tight ${colors.text} truncate`}>
                                        {item.subject}
                                      </p>
                                    </div>
                                    <p className="text-[10px] text-slate-500 truncate leading-tight">
                                      {item.teacherName ?? "Teacher TBA"}
                                    </p>
                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                                      <MapPin className="h-2.5 w-2.5 shrink-0" />
                                      <span className="truncate">{item.room ?? "—"}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-full flex items-center justify-center">
                                    <span className="text-slate-200 text-xs">—</span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* ── MOBILE / TABLET DAY VIEW ────────────────────────── */}
          <div className="lg:hidden space-y-3">
            {/* Day tab strip */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveDay(days[Math.max(0, activeDayIdx - 1)] ?? activeDay)}
                disabled={activeDayIdx === 0}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-30 shadow-sm"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex flex-1 gap-1 overflow-x-auto scrollbar-none rounded-xl border border-slate-100 bg-white p-1 shadow-sm">
                {days.map(day => (
                  <button
                    key={day}
                    onClick={() => setActiveDay(day)}
                    className={`flex-1 min-w-[44px] rounded-lg py-1.5 text-xs font-semibold transition-all
                      ${activeDay === day
                        ? "bg-indigo-600 text-white shadow-sm"
                        : isToday(day)
                          ? "text-indigo-600 bg-indigo-50"
                          : "text-slate-500 hover:bg-slate-50"
                      }`}
                  >
                    {day.slice(0, 3)}
                    {isToday(day) && activeDay !== day && (
                      <span className="block w-1 h-1 rounded-full bg-indigo-400 mx-auto mt-0.5" />
                    )}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setActiveDay(days[Math.min(days.length - 1, activeDayIdx + 1)] ?? activeDay)}
                disabled={activeDayIdx === days.length - 1}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-30 shadow-sm"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Day header pill */}
            <div className={`flex items-center gap-2 px-1`}>
              <h2 className="font-bold text-slate-800 text-base">{activeDay}</h2>
              {isToday(activeDay) && (
                <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                  Today
                </span>
              )}
              <span className="ml-auto text-xs text-slate-400">
                {itemsByDay[activeDay]?.length ?? 0} class(es)
              </span>
            </div>

            {/* Period cards for active day */}
            {busy ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
              </div>
            ) : periodRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                No timetable entries yet.
              </div>
            ) : (
              <div className="space-y-2">
                {periodRows.map(period => {
                  if (period.isBreak)
                    return (
                      <div key={period.key} className="flex items-center gap-3 px-2 py-1">
                        <div className="h-px flex-1 bg-slate-100" />
                        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                          Break · {period.startTime} – {period.endTime}
                        </span>
                        <div className="h-px flex-1 bg-slate-100" />
                      </div>
                    );

                  const item = getCellItem(activeDay, period);
                  const colors = item ? subjectColorMap[item.subject] : null;

                  return (
                    <div key={period.key}
                      className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                      {/* time strip */}
                      <div className="flex flex-col items-center gap-1 pt-0.5 w-12 shrink-0">
                        <p className="text-[10px] font-bold text-slate-500">{period.periodLabel.replace("Period ", "P")}</p>
                        <p className="text-[9px] text-slate-400 text-center leading-tight">
                          {period.startTime}<br />{period.endTime}
                        </p>
                      </div>
                      {/* divider */}
                      <div className={`w-0.5 rounded-full shrink-0 ${item && colors ? colors.dot : "bg-slate-100"}`} />
                      {/* content */}
                      {item && colors ? (
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className={`font-bold text-sm ${colors.text}`}>{item.subject}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text} border ${colors.border}`}>
                              {item.classType ?? "Class"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium">{item.teacherName ?? "Teacher TBA"}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />{item.room ?? "Room TBA"}
                            </span>
                            {item.subjectCode && (
                              <span className="font-mono bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                                {item.subjectCode}
                              </span>
                            )}
                          </div>
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
            )}
          </div>

          {/* ── Subject legend ─────────────────────────────────── */}
          {!busy && Object.keys(subjectColorMap).length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Subjects</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(subjectColorMap).map(([subject, colors]) => (
                  <span key={subject}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium
                      ${colors.bg} ${colors.border} ${colors.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                    {subject}
                  </span>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
