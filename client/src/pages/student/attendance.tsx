import { useMemo, useState } from "react";
import { attendanceSessions, attendanceStatuses } from "@shared/schema";
import {
  Bar, BarChart, CartesianGrid, PolarAngleAxis, RadialBar,
  RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  eachDayOfInterval, endOfMonth, format, isAfter, isBefore,
  parseISO, startOfMonth, subDays,
} from "date-fns";
import { Layout } from "@/components/layout";
import { useStudentAttendance, useStudentAttendanceSummary } from "@/hooks/use-attendance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCsv, escapeHtml, formatDate, openPrintWindow } from "@/lib/utils";
import {
  CalendarDays, CheckCircle2, Download, FileDown,
  Loader2, TrendingUp, XCircle, Clock, BookCheck, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RangePreset = "7" | "30" | "90" | "custom";
type AttendanceStatus = (typeof attendanceStatuses)[number];
type AttendanceSession = (typeof attendanceSessions)[number];
type HeatmapEntry = { status: AttendanceStatus; sessions: number };

const attendedStatuses = new Set<AttendanceStatus>(["Present", "Late", "Excused"]);

const statusStyles: Record<AttendanceStatus, { tile: string; badge: string; dot: string }> = {
  Present: {
    tile: "bg-emerald-100 border-emerald-300 text-emerald-900",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  Absent: {
    tile: "bg-rose-100 border-rose-300 text-rose-900",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
  Late: {
    tile: "bg-amber-100 border-amber-300 text-amber-900",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  Excused: {
    tile: "bg-sky-100 border-sky-300 text-sky-900",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
};

function getPresetRange(value: RangePreset) {
  const today = new Date();
  if (value === "7") return { from: format(subDays(today, 6), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  if (value === "30") return { from: format(subDays(today, 29), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  return { from: format(subDays(today, 89), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
}

function parseDateValue(value: string) {
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function collapseStatuses(statuses: AttendanceStatus[]) {
  if (statuses.includes("Absent")) return "Absent";
  if (statuses.includes("Late")) return "Late";
  if (statuses.includes("Excused")) return "Excused";
  return "Present";
}

// ── Status badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: AttendanceStatus }) {
  const s = statusStyles[status];
  const Icon =
    status === "Present" ? CheckCircle2 :
      status === "Absent" ? XCircle :
        status === "Late" ? Clock :
          BookCheck;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", s.badge)}>
      <Icon className="h-2.5 w-2.5" />{status}
    </span>
  );
}

export default function StudentAttendance() {
  const initialRange = getPresetRange("30");
  const { data: attendance = [], isLoading: recordsLoading } = useStudentAttendance();
  const { data: summary, isLoading: summaryLoading } = useStudentAttendanceSummary();

  const [rangePreset, setRangePreset] = useState<RangePreset>("30");
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [sessionFilter, setSessionFilter] = useState<AttendanceSession | "all">("all");

  const normalizedRange = useMemo(() => {
    const start = parseDateValue(fromDate);
    const end = parseDateValue(toDate);
    return isAfter(start, end) ? { start: end, end: start } : { start, end };
  }, [fromDate, toDate]);

  const filteredRecords = useMemo(() => {
    return [...attendance]
      .filter((r) => {
        const d = parseISO(r.date);
        if (Number.isNaN(d.getTime())) return false;
        return (
          !isBefore(d, normalizedRange.start) &&
          !isAfter(d, normalizedRange.end) &&
          (statusFilter === "all" || r.status === statusFilter) &&
          (sessionFilter === "all" || r.session === sessionFilter)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, normalizedRange, sessionFilter, statusFilter]);

  const filteredSummary = useMemo(() => {
    const attended = filteredRecords.filter((r) => attendedStatuses.has(r.status)).length;
    const absent = filteredRecords.filter((r) => r.status === "Absent").length;
    const late = filteredRecords.filter((r) => r.status === "Late").length;
    const excused = filteredRecords.filter((r) => r.status === "Excused").length;
    const rate = filteredRecords.length ? Math.round((attended / filteredRecords.length) * 100) : 0;
    return { total: filteredRecords.length, attended, absent, late, excused, rate };
  }, [filteredRecords]);

  const trendData = useMemo(() => {
    const map = new Map<string, { label: string; present: number; absent: number; late: number; excused: number }>();
    [...filteredRecords].reverse().forEach((r) => {
      const label = format(parseISO(r.date), "MMM yy");
      const cur = map.get(label) ?? { label, present: 0, absent: 0, late: 0, excused: 0 };
      if (r.status === "Present") cur.present++;
      if (r.status === "Absent") cur.absent++;
      if (r.status === "Late") cur.late++;
      if (r.status === "Excused") cur.excused++;
      map.set(label, cur);
    });
    return Array.from(map.values());
  }, [filteredRecords]);

  const heatmap = useMemo(() => {
    const grouped = new Map<string, AttendanceStatus[]>();
    filteredRecords.forEach((r) => {
      grouped.set(r.date, [...(grouped.get(r.date) ?? []), r.status]);
    });
    return new Map<string, HeatmapEntry>(
      Array.from(grouped.entries()).map(([date, statuses]) => [
        date, { status: collapseStatuses(statuses), sessions: statuses.length },
      ]),
    );
  }, [filteredRecords]);

  const monthSections = useMemo(() => {
    const sections: Array<{ label: string; blanks: number[]; days: Date[] }> = [];
    const cursor = new Date(normalizedRange.start.getFullYear(), normalizedRange.start.getMonth(), 1);
    const finalMonth = new Date(normalizedRange.end.getFullYear(), normalizedRange.end.getMonth(), 1);
    while (cursor <= finalMonth) {
      const days = eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) })
        .filter((d) => !isBefore(d, normalizedRange.start) && !isAfter(d, normalizedRange.end));
      const blanks = Array.from({ length: days[0] ? (days[0].getDay() + 6) % 7 : 0 }, (_, i) => i);
      sections.push({ label: format(cursor, "MMMM yyyy"), blanks, days });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return sections;
  }, [normalizedRange]);

  const exportReport = () => {
    downloadCsv("student-attendance-report.csv", filteredRecords.map((r) => ({
      Date: r.date, Session: r.session, Status: r.status, Remarks: r.remarks ?? "",
    })));
  };

  const printReport = () => {
    const rows = filteredRecords.map((r) =>
      `<tr><td>${escapeHtml(formatDate(r.date, "MMM dd, yyyy"))}</td><td>${escapeHtml(r.session)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.remarks ?? "—")}</td></tr>`
    ).join("");
    openPrintWindow(
      "Attendance Report",
      `<h1>Attendance Report</h1>
       <p>Period: ${escapeHtml(formatDate(normalizedRange.start, "MMM dd, yyyy"))} – ${escapeHtml(formatDate(normalizedRange.end, "MMM dd, yyyy"))}</p>
       <div class="grid section">
         <div class="card"><strong>Attendance rate</strong><div>${filteredSummary.rate}%</div></div>
         <div class="card"><strong>Total sessions</strong><div>${filteredSummary.total}</div></div>
       </div>
       <div class="section"><table><thead><tr><th>Date</th><th>Session</th><th>Status</th><th>Remarks</th></tr></thead>
       <tbody>${rows || "<tr><td colspan='4'>No records found.</td></tr>"}</tbody></table></div>`,
      { subtitle: `${formatDate(normalizedRange.start, "MMM dd, yyyy")} – ${formatDate(normalizedRange.end, "MMM dd, yyyy")}` },
    );
  };

  const isLoading = recordsLoading || summaryLoading;

  return (
    <Layout>
      <div className="space-y-4 pb-8">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">My Attendance</h1>
              <p className="text-[12px] text-slate-400">Heatmap, trends, records, and printable report.</p>
            </div>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={exportReport} disabled={filteredRecords.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" />Export CSV
            </Button>
            <Button size="sm" onClick={printReport} disabled={isLoading}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" />Print / PDF
            </Button>
          </div>
        </section>

        {/* ── KPI strip ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Attendance rate", value: `${filteredSummary.rate}%`, hint: "Based on filters", color: "text-indigo-600 bg-indigo-50", border: "border-indigo-100" },
            { label: "Current streak", value: summary?.currentStreak ?? 0, hint: "Consecutive sessions", color: "text-emerald-600 bg-emerald-50", border: "border-emerald-100" },
            { label: "Total sessions", value: filteredSummary.total, hint: "In selected range", color: "text-blue-600 bg-blue-50", border: "border-blue-100" },
            { label: "Absent / Late", value: `${filteredSummary.absent} / ${filteredSummary.late}`, hint: "Needs attention", color: filteredSummary.absent > 0 ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-100", border: filteredSummary.absent > 0 ? "border-rose-100" : "border-slate-200" },
          ].map((item) => (
            <div key={item.label} className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border bg-white px-3 py-4 text-center shadow-none",
              item.border,
            )}>
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", item.color)}>
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none text-slate-900">{item.value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.hint}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Filters ─────────────────────────────────────────────────── */}
        <Card className="border-slate-200/80 bg-white shadow-none">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50">
              <Filter className="h-3.5 w-3.5 text-indigo-500" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Filters</span>
          </div>
          <CardContent className="p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {/* Range preset */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Range</p>
                <Select value={rangePreset} onValueChange={(v: RangePreset) => {
                  setRangePreset(v);
                  if (v !== "custom") { const r = getPresetRange(v); setFromDate(r.from); setToDate(r.to); }
                }}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select range" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* From */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">From</p>
                <Input type="date" className="h-8 text-sm" value={fromDate}
                  onChange={(e) => { setRangePreset("custom"); setFromDate(e.target.value); }} />
              </div>
              {/* To */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">To</p>
                <Input type="date" className="h-8 text-sm" value={toDate}
                  onChange={(e) => { setRangePreset("custom"); setToDate(e.target.value); }} />
              </div>
              {/* Status */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Status</p>
                <Select value={statusFilter} onValueChange={(v: AttendanceStatus | "all") => setStatusFilter(v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {attendanceStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* Session */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Session</p>
                <Select value={sessionFilter} onValueChange={(v: AttendanceSession | "all") => setSessionFilter(v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All sessions" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sessions</SelectItem>
                    {attendanceSessions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Gauge + Trend ────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-7">

          {/* Gauge */}
          <Card className="border-slate-200/80 bg-white shadow-none lg:col-span-2">
            <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">Attendance Score</CardTitle>
                <CardDescription className="text-[11px]">Filtered view percentage.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {isLoading ? (
                <div className="flex h-44 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                </div>
              ) : (
                <div className="relative h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart
                      data={[{ value: filteredSummary.rate }]}
                      innerRadius="70%" outerRadius="100%"
                      startAngle={90} endAngle={-270}
                    >
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                      <RadialBar
                        dataKey="value" cornerRadius={16}
                        fill={filteredSummary.rate >= 75 ? "#10b981" : filteredSummary.rate >= 50 ? "#f59e0b" : "#ef4444"}
                        background={{ fill: "#f1f5f9" }}
                      />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-slate-900">{filteredSummary.rate}%</span>
                    <span className="text-[11px] text-slate-400">Attendance</span>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: "Attended", v: filteredSummary.attended, c: "text-emerald-700" },
                  { l: "Excused", v: filteredSummary.excused, c: "text-sky-700" },
                  { l: "Late", v: filteredSummary.late, c: "text-amber-700" },
                  { l: "Absent", v: filteredSummary.absent, c: "text-rose-700" },
                ].map((i) => (
                  <div key={i.l} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{i.l}</p>
                    <p className={cn("text-lg font-bold leading-tight", i.c)}>{i.v}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Monthly trend chart */}
          <Card className="border-slate-200/80 bg-white shadow-none lg:col-span-5">
            <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">Monthly Trend</CardTitle>
                <CardDescription className="text-[11px]">Present, late, excused, and absent across months.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-4 pt-3">
              {isLoading ? (
                <div className="flex h-52 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                </div>
              ) : trendData.length === 0 ? (
                <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[13px] text-slate-400">
                  No attendance data in this range.
                </div>
              ) : (
                <>
                  {/* Legend */}
                  <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    {[
                      { l: "Present", c: "#10b981" }, { l: "Late", c: "#f59e0b" },
                      { l: "Excused", c: "#0ea5e9" }, { l: "Absent", c: "#ef4444" },
                    ].map((i) => (
                      <div key={i.l} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.c }} />
                        {i.l}
                      </div>
                    ))}
                  </div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                        <Bar dataKey="present" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={18} />
                        <Bar dataKey="late" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={18} />
                        <Bar dataKey="excused" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={18} />
                        <Bar dataKey="absent" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Attendance heatmap ───────────────────────────────────────── */}
        <Card className="border-slate-200/80 bg-white shadow-none">
          <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50">
              <CalendarDays className="h-3.5 w-3.5 text-violet-600" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900">Attendance Heatmap</CardTitle>
              <CardDescription className="text-[11px]">Calendar-style view of daily attendance.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-5">
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              {attendanceStatuses.map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={cn("h-3 w-3 rounded-sm border", statusStyles[s].tile)} />
                  {s}
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border border-slate-200 bg-slate-100" />
                No record
              </div>
            </div>

            {monthSections.map((section) => (
              <div key={section.label} className="space-y-2">
                <p className="text-[12px] font-bold text-slate-700">{section.label}</p>
                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                    <div key={i} className="text-center">{d}</div>
                  ))}
                </div>
                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                  {section.blanks.map((b) => (
                    <div key={`blank-${b}`} className="aspect-square rounded-md" />
                  ))}
                  {section.days.map((day) => {
                    const key = format(day, "yyyy-MM-dd");
                    const entry = heatmap.get(key);
                    return (
                      <div
                        key={key}
                        title={`${key} · ${entry?.status ?? "No record"}${entry ? ` (${entry.sessions} session${entry.sessions > 1 ? "s" : ""})` : ""}`}
                        className={cn(
                          "flex aspect-square flex-col items-center justify-center rounded-md border text-[11px] font-semibold transition-transform hover:scale-105",
                          entry ? statusStyles[entry.status].tile : "border-slate-100 bg-slate-50/60 text-slate-400",
                        )}
                      >
                        <span>{format(day, "d")}</span>
                        {entry && (
                          <span className="text-[8px] font-bold uppercase leading-none opacity-70">
                            {entry.status === "Present" ? "P" : entry.status === "Absent" ? "A" : entry.status === "Late" ? "L" : "E"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Records table ────────────────────────────────────────────── */}
        <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
          <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50">
              <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900">Attendance Records</CardTitle>
              <CardDescription className="text-[11px]">
                {filteredRecords.length} session{filteredRecords.length !== 1 ? "s" : ""} matching active filters.
              </CardDescription>
            </div>
          </CardHeader>
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Date", "Day", "Session", "Status", "Remarks"].map((h, i) => (
                    <th key={i} className={cn(
                      "px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400",
                      i === 0 && "pl-4 text-left", i > 0 && "text-left",
                    )}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-14 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-500" />
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-14 text-center text-[13px] text-slate-400">
                      No attendance records match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record, idx) => (
                    <tr key={record.id} className={cn(
                      "border-b border-slate-100 last:border-b-0 transition-colors hover:bg-slate-50/60",
                      idx % 2 === 1 && "bg-slate-50/30",
                    )}>
                      <td className="py-2.5 pl-4 pr-3 text-[13px] font-semibold text-slate-900">
                        {formatDate(parseISO(record.date), "MMM dd, yyyy")}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-slate-400">
                        {format(parseISO(record.date), "EEE")}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-slate-600">{record.session}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={record.status} />
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-slate-400">
                        {record.remarks || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
    </Layout>
  );
}
