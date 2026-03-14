import { useMemo } from "react";
import { Layout } from "@/components/layout";
import { useStudentTimetable } from "@/hooks/use-timetable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, escapeHtml, openPrintWindow } from "@/lib/utils";
import { BookOpen, Clock3, Download, FileDown, Loader2, MapPin, Users } from "lucide-react";
import { useLiveSettingsFull, computePeriodTimeline } from "@/lib/timetable-settings-bus";

type PeriodRow = {
  key: string;
  periodLabel: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isBreak?: boolean;
};

const ALL_DAYS: Record<number, { label: string; short: string; num: number }> = {
  1: { label: "Monday", short: "Mon", num: 1 },
  2: { label: "Tuesday", short: "Tue", num: 2 },
  3: { label: "Wednesday", short: "Wed", num: 3 },
  4: { label: "Thursday", short: "Thu", num: 4 },
  5: { label: "Friday", short: "Fri", num: 5 },
  6: { label: "Saturday", short: "Sat", num: 6 },
  7: { label: "Sunday", short: "Sun", num: 7 },
};

export default function StudentTimetable() {
  const { data, isLoading } = useStudentTimetable();
  const { settings, isLoading: isSettingsLoading } = useLiveSettingsFull();
  const items = data?.items ?? [];

  const todayNum = new Date().getDay(); // 0=Sun 1=Mon ... 6=Sat
  const todayDayNum = todayNum === 0 ? 7 : todayNum; 

  const days = useMemo(() => {
    // 1. Get days from settings (preferred for consistency)
    const settingsDays = settings?.workingDays?.map(d => ALL_DAYS[d]?.label).filter(Boolean) ?? [];
    
    // 2. Get days from API response (secondary fallback)
    const apiDays = data?.days ?? [];
    
    // 3. Ensure any day with actual data is included
    const dataDays = items.map(item => {
      if (typeof item.dayOfWeek === 'number') return ALL_DAYS[item.dayOfWeek]?.label;
      return item.dayOfWeek;
    }).filter(Boolean);
    
    const daySet = new Set([...settingsDays, ...apiDays, ...dataDays]);
    
    // If we have items but no days in settings/api, make sure we show the work week
    if (daySet.size === 0) {
      return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    }

    // Consistent sorting
    const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const result = order.filter(d => daySet.has(d));
    console.log(`[STUDENT_TT_UI] days=${JSON.stringify(result)}, item_count=${items.length}`);
    return result;
  }, [settings?.workingDays, data?.days, items]);

  const summary = useMemo(() => {
    const subjects = new Set(items.map((item) => item.subject));
    const teachers = new Set(items.map((item) => item.teacherName).filter(Boolean));
    const ordered = [...items].sort((left, right) => left.startTime.localeCompare(right.startTime));
    return {
      totalClasses: items.length,
      subjects: subjects.size,
      teachers: teachers.size,
      firstClass: ordered[0]?.startTime ?? "—",
    };
  }, [items]);

  const periodRows = useMemo<PeriodRow[]>(() => {
    // 1. If we have settings, generate the full timeline (including breaks)
    if (settings && settings.totalPeriods) {
      const timeline = computePeriodTimeline(settings);
      return timeline.map((t: any) => ({
        key: t.isBreak ? `break-${t.startTime}` : `p-${t.periodNumber}`,
        periodLabel: t.isBreak ? "Break" : `Period ${t.periodNumber}`,
        startTime: t.startTime,
        endTime: t.endTime,
        sortOrder: t.periodNumber ?? 99,
        isBreak: t.isBreak
      }));
    }

    // 2. Fallback to existing periods if settings not available
    const unique = new Map<string, PeriodRow>();
    items.forEach((item) => {
      const key = `${item.sortOrder}-${item.periodLabel}-${item.startTime}-${item.endTime}`;
      if (!unique.has(key)) {
        unique.set(key, { key, periodLabel: item.periodLabel, startTime: item.startTime, endTime: item.endTime, sortOrder: item.sortOrder });
      }
    });
    return Array.from(unique.values()).sort((left, right) => left.sortOrder - right.sortOrder || left.startTime.localeCompare(right.startTime));
  }, [settings, items]);

  const itemsByDay = useMemo(() => {
    return days.reduce<Record<string, typeof items>>((accumulator, day) => {
      const targetNum = Object.values(ALL_DAYS).find(d => d.label === day)?.num;
      accumulator[day] = [...items]
        .filter((item) => item.dayOfWeek === day || (targetNum !== undefined && item.dayOfWeek === targetNum))
        .sort((left, right) => left.sortOrder - right.sortOrder || left.startTime.localeCompare(right.startTime));
      return accumulator;
    }, {});
  }, [days, items]);

  const exportTimetable = () => {
    downloadCsv(
      "student-timetable.csv",
      items.map((item) => ({
        Day: item.dayOfWeek,
        Period: item.periodLabel,
        Time: `${item.startTime} - ${item.endTime}`,
        Subject: item.subject,
        Teacher: item.teacherName ?? "",
        Room: item.room ?? "",
        Type: item.classType ?? "",
      })),
    );
  };

  const printTimetable = () => {
    const sections = days
      .map((day) => {
        const rows = (itemsByDay[day] ?? [])
          .map(
            (item) => `<tr><td>${escapeHtml(item.periodLabel)}</td><td>${escapeHtml(`${item.startTime} - ${item.endTime}`)}</td><td>${escapeHtml(item.subject)}</td><td>${escapeHtml(item.teacherName ?? "—")}</td><td>${escapeHtml(item.room ?? "—")}</td></tr>`,
          )
          .join("");
        return `<div class="section"><h2>${escapeHtml(day)}</h2><table><thead><tr><th>Period</th><th>Time</th><th>Subject</th><th>Teacher</th><th>Room</th></tr></thead><tbody>${rows || "<tr><td colspan='5'>No classes scheduled.</td></tr>"}</tbody></table></div>`;
      })
      .join("");

    openPrintWindow(
      "Weekly Timetable",
      `<h1>Weekly Timetable</h1><p>Class: ${escapeHtml(data?.className ?? "Unassigned")}</p>${sections}`,
      { subtitle: data?.className ? `Class: ${data.className}` : "Student timetable" },
    );
  };

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">My Timetable</h1>
            <p className="mt-1 text-muted-foreground">View your weekly class schedule with subject, teacher, room, and time details.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={exportTimetable} disabled={items.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={printTimetable} disabled={isLoading}>
              <FileDown className="mr-2 h-4 w-4" /> Print / Save PDF
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Class", value: data?.className ?? "Unassigned", icon: Users },
            { label: "Weekly classes", value: summary.totalClasses, icon: BookOpen },
            { label: "Subjects", value: summary.subjects, icon: BookOpen },
            { label: "Teachers", value: summary.teachers, icon: Users },
            { label: "First class", value: summary.firstClass, icon: Clock3 },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-display font-bold">{item.value}</p>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary"><item.icon className="h-5 w-5" /></div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Weekly Matrix</CardTitle>
            <CardDescription>Full timetable arranged by period and weekday.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading || isSettingsLoading ? (
              <div className="flex h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : periodRows.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No timetable entries are available for your class yet.</div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="min-w-[130px]">Period</TableHead>
                    {days.map((day) => <TableHead key={day} className="min-w-[170px]">{day}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodRows.map((period) => (
                    <TableRow key={period.key} className={period.isBreak ? "bg-muted/30 h-10 italic" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {period.isBreak && <Clock3 className="h-3 w-3 text-muted-foreground" />}
                          {period.periodLabel}
                        </div>
                        <div className="text-xs text-muted-foreground">{period.startTime} - {period.endTime}</div>
                      </TableCell>
                      {days.map((day) => {
                        const dayName = typeof day === 'string' ? day : ALL_DAYS[day as number]?.label;
                        const dayNum = typeof day === 'number' ? day : Object.values(ALL_DAYS).find(d => d.label === day)?.num;
                        
                        // Don't look for items in break rows
                        if (period.isBreak) {
                           return <TableCell key={`${period.key}-${day}`} className="text-center text-muted-foreground/40">—</TableCell>;
                        }

                        const item = items.find(
                          (entry) => (entry.dayOfWeek === dayName || entry.dayOfWeek === dayNum) && (entry.sortOrder === period.sortOrder || entry.periodLabel === period.periodLabel),
                        );
                        return (
                          <TableCell key={`${period.key}-${day}`}>
                            {item ? (
                              <div className="space-y-2 rounded-xl border bg-muted/20 p-3 shadow-sm transition-all hover:shadow-md">
                                <div className="font-semibold text-primary">{item.subject}</div>
                                <div className="text-xs text-muted-foreground">{item.subjectCode ?? "General"}</div>
                                <div className="flex flex-wrap gap-2 text-xs">
                                  <Badge variant="secondary" className="px-1.5 py-0">{item.teacherName ?? "Teacher TBA"}</Badge>
                                  <Badge variant="outline" className="px-1.5 py-0">{item.classType ?? "Class"}</Badge>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {item.room ?? "Room TBA"}</div>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground/30">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          {days.map((day) => (
            <Card key={day} className="shadow-sm">
              <CardHeader>
                <CardTitle>{day}</CardTitle>
                <CardDescription>{itemsByDay[day]?.length ?? 0} class(es)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(itemsByDay[day] ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No classes scheduled.</div>
                ) : (
                  itemsByDay[day].map((item) => (
                    <div key={item.id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.subject}</p>
                          <p className="text-sm text-muted-foreground">{item.periodLabel} • {item.startTime} - {item.endTime}</p>
                        </div>
                        <Badge variant="outline">{item.classType ?? "Class"}</Badge>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                        <p>Teacher: {item.teacherName ?? "TBA"}</p>
                        <p>Room: {item.room ?? "TBA"}</p>
                        <p>Code: {item.subjectCode ?? "—"}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}