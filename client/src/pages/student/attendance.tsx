import { useMemo, useState } from "react";
import { attendanceSessions, attendanceStatuses } from "@shared/schema";
import { Bar, BarChart, CartesianGrid, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { eachDayOfInterval, endOfMonth, format, isAfter, isBefore, parseISO, startOfMonth, subDays } from "date-fns";
import { Layout } from "@/components/layout";
import { useStudentAttendance, useStudentAttendanceSummary } from "@/hooks/use-attendance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, escapeHtml, formatDate, openPrintWindow } from "@/lib/utils";
import { CalendarDays, Download, FileDown, Loader2, TrendingUp } from "lucide-react";

type RangePreset = "7" | "30" | "90" | "custom";
type AttendanceStatus = (typeof attendanceStatuses)[number];
type AttendanceSession = (typeof attendanceSessions)[number];
type HeatmapEntry = { status: AttendanceStatus; sessions: number };

const attendedStatuses = new Set<AttendanceStatus>(["Present", "Late", "Excused"]);

const statusTone: Record<AttendanceStatus, string> = {
  Present: "bg-emerald-500/80 border-emerald-600/40",
  Absent: "bg-red-500/80 border-red-600/40",
  Late: "bg-amber-500/80 border-amber-600/40",
  Excused: "bg-sky-500/80 border-sky-600/40",
};

const statusBadgeVariant: Record<AttendanceStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Present: "secondary",
  Absent: "destructive",
  Late: "outline",
  Excused: "default",
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
      .filter((record) => {
        const recordDate = parseISO(record.date);
        if (Number.isNaN(recordDate.getTime())) return false;
        return (
          !isBefore(recordDate, normalizedRange.start) &&
          !isAfter(recordDate, normalizedRange.end) &&
          (statusFilter === "all" || record.status === statusFilter) &&
          (sessionFilter === "all" || record.session === sessionFilter)
        );
      })
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [attendance, normalizedRange, sessionFilter, statusFilter]);

  const filteredSummary = useMemo(() => {
    const attendedRecords = filteredRecords.filter((record) => attendedStatuses.has(record.status)).length;
    const absentCount = filteredRecords.filter((record) => record.status === "Absent").length;
    const lateCount = filteredRecords.filter((record) => record.status === "Late").length;
    const excusedCount = filteredRecords.filter((record) => record.status === "Excused").length;
    return {
      total: filteredRecords.length,
      attendedRecords,
      absentCount,
      lateCount,
      excusedCount,
      attendanceRate: filteredRecords.length ? Math.round((attendedRecords / filteredRecords.length) * 100) : 0,
    };
  }, [filteredRecords]);

  const trendData = useMemo(() => {
    const monthMap = new Map<string, { label: string; present: number; absent: number; late: number; excused: number }>();
    [...filteredRecords].reverse().forEach((record) => {
      const label = format(parseISO(record.date), "MMM yy");
      const current = monthMap.get(label) ?? { label, present: 0, absent: 0, late: 0, excused: 0 };
      if (record.status === "Present") current.present += 1;
      if (record.status === "Absent") current.absent += 1;
      if (record.status === "Late") current.late += 1;
      if (record.status === "Excused") current.excused += 1;
      monthMap.set(label, current);
    });
    return Array.from(monthMap.values());
  }, [filteredRecords]);

  const heatmap = useMemo(() => {
    const grouped = new Map<string, AttendanceStatus[]>();
    filteredRecords.forEach((record) => {
      grouped.set(record.date, [...(grouped.get(record.date) ?? []), record.status]);
    });
    return new Map<string, HeatmapEntry>(
      Array.from(grouped.entries()).map(([date, statuses]) => [date, { status: collapseStatuses(statuses), sessions: statuses.length }]),
    );
  }, [filteredRecords]);

  const monthSections = useMemo(() => {
    const sections: Array<{ label: string; blanks: number[]; days: Date[] }> = [];
    const cursor = new Date(normalizedRange.start.getFullYear(), normalizedRange.start.getMonth(), 1);
    const finalMonth = new Date(normalizedRange.end.getFullYear(), normalizedRange.end.getMonth(), 1);

    while (cursor <= finalMonth) {
      const monthStart = startOfMonth(cursor);
      const monthEnd = endOfMonth(cursor);
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(
        (day) => !isBefore(day, normalizedRange.start) && !isAfter(day, normalizedRange.end),
      );
      const firstVisibleDay = days[0];
      const blankCount = firstVisibleDay ? (firstVisibleDay.getDay() + 6) % 7 : 0;
      sections.push({
        label: format(cursor, "MMMM yyyy"),
        blanks: Array.from({ length: blankCount }, (_, index) => index),
        days,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return sections;
  }, [normalizedRange]);

  const exportReport = () => {
    downloadCsv(
      "student-attendance-report.csv",
      filteredRecords.map((record) => ({
        Date: record.date,
        Session: record.session,
        Status: record.status,
        Remarks: record.remarks ?? "",
      })),
    );
  };

  const printReport = () => {
    const rows = filteredRecords
      .map(
        (record) => `<tr><td>${escapeHtml(formatDate(record.date, "MMM dd, yyyy"))}</td><td>${escapeHtml(record.session)}</td><td>${escapeHtml(record.status)}</td><td>${escapeHtml(record.remarks ?? "—")}</td></tr>`,
      )
      .join("");

    openPrintWindow(
      "Attendance Report",
      `<h1>Attendance Report</h1>
       <p>Period: ${escapeHtml(formatDate(normalizedRange.start, "MMM dd, yyyy"))} - ${escapeHtml(formatDate(normalizedRange.end, "MMM dd, yyyy"))}</p>
       <div class="grid section">
         <div class="card"><strong>Attendance rate</strong><div>${filteredSummary.attendanceRate}%</div></div>
         <div class="card"><strong>Total sessions</strong><div>${filteredSummary.total}</div></div>
       </div>
       <div class="section"><table><thead><tr><th>Date</th><th>Session</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>No attendance records found.</td></tr>"}</tbody></table></div>`,
      { subtitle: `Period: ${formatDate(normalizedRange.start, "MMM dd, yyyy")} - ${formatDate(normalizedRange.end, "MMM dd, yyyy")}` },
    );
  };

  const isLoading = recordsLoading || summaryLoading;

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">My Attendance</h1>
            <p className="mt-1 text-muted-foreground">Review your attendance heatmap, summary, trends, and printable report.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={exportReport} disabled={filteredRecords.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={printReport} disabled={isLoading}>
              <FileDown className="mr-2 h-4 w-4" /> Print / Save PDF
            </Button>
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Choose a time range, status, and session to explore your records smoothly.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">Date range</p>
              <Select
                value={rangePreset}
                onValueChange={(value: RangePreset) => {
                  setRangePreset(value);
                  if (value !== "custom") {
                    const nextRange = getPresetRange(value);
                    setFromDate(nextRange.from);
                    setToDate(nextRange.to);
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">From</p>
              <Input type="date" value={fromDate} onChange={(event) => { setRangePreset("custom"); setFromDate(event.target.value); }} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">To</p>
              <Input type="date" value={toDate} onChange={(event) => { setRangePreset("custom"); setToDate(event.target.value); }} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Status</p>
              <Select value={statusFilter} onValueChange={(value: AttendanceStatus | "all") => setStatusFilter(value)}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {attendanceStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Session</p>
              <Select value={sessionFilter} onValueChange={(value: AttendanceSession | "all") => setSessionFilter(value)}>
                <SelectTrigger><SelectValue placeholder="All sessions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sessions</SelectItem>
                  {attendanceSessions.map((session) => <SelectItem key={session} value={session}>{session}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Attendance rate", value: `${filteredSummary.attendanceRate}%`, hint: "Based on active filters" },
            { label: "Current streak", value: summary?.currentStreak ?? 0, hint: "Consecutive attended sessions" },
            { label: "Tracked sessions", value: filteredSummary.total, hint: "Within the selected range" },
            { label: "Attention needed", value: filteredSummary.absentCount + filteredSummary.lateCount, hint: "Absent and late sessions" },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-3xl font-display font-bold">{item.value}</p>
                <p className="mt-2 text-xs text-muted-foreground">{item.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-7">
          <Card className="shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle>Attendance Gauge</CardTitle>
              <CardDescription>Personal attendance percentage for the current filtered view.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                <div className="relative h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart data={[{ value: filteredSummary.attendanceRate }]} innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270}>
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                      <RadialBar dataKey="value" cornerRadius={20} fill="#8b5cf6" background />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-display font-bold">{filteredSummary.attendanceRate}%</span>
                    <span className="text-sm text-muted-foreground">Attendance score</span>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">Attended</p>
                  <p className="mt-1 text-2xl font-semibold">{filteredSummary.attendedRecords}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">Excused</p>
                  <p className="mt-1 text-2xl font-semibold">{filteredSummary.excusedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm lg:col-span-5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Monthly Trend</CardTitle>
              <CardDescription>Present, late, excused, and absent records across the selected months.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : trendData.length === 0 ? (
                <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-muted-foreground">No attendance data found in this range.</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="present" fill="#10b981" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="late" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="excused" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="absent" fill="#ef4444" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Attendance Heatmap</CardTitle>
            <CardDescription>Calendar-style view of attendance by day for the selected range.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {attendanceStatuses.map((status) => (
                <div key={status} className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-sm border ${statusTone[status]}`} />
                  <span>{status}</span>
                </div>
              ))}
            </div>
            {monthSections.map((section) => (
              <div key={section.label} className="space-y-3">
                <h3 className="font-semibold">{section.label}</h3>
                <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => <div key={label}>{label}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {section.blanks.map((blank) => <div key={`${section.label}-blank-${blank}`} className="h-12 rounded-md border border-transparent" />)}
                  {section.days.map((day) => {
                    const key = format(day, "yyyy-MM-dd");
                    const entry = heatmap.get(key);
                    return (
                      <div
                        key={key}
                        title={`${key} - ${entry?.status ?? "No record"}${entry ? ` (${entry.sessions} session${entry.sessions > 1 ? "s" : ""})` : ""}`}
                        className={`flex h-12 flex-col justify-between rounded-md border p-2 text-xs ${entry ? statusTone[entry.status] : "bg-muted/30"}`}
                      >
                        <span className="font-medium text-foreground">{format(day, "d")}</span>
                        <span className="truncate text-[10px] text-foreground/80">{entry?.status ?? "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Attendance Records</CardTitle>
            <CardDescription>Detailed session-wise attendance entries for the active filters.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-6">Date</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
                ) : filteredRecords.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No attendance records match the current filters.</TableCell></TableRow>
                ) : (
                  filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="pl-6 font-medium">{formatDate(parseISO(record.date), "MMMM dd, yyyy")}</TableCell>
                      <TableCell>{record.session}</TableCell>
                      <TableCell><Badge variant={statusBadgeVariant[record.status]}>{record.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{record.remarks || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
