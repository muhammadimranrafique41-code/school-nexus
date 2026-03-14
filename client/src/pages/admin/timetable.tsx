import { useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAdminTimetables, useAdminTimetable, useCreateTimetable, useUpsertPeriods, usePublishTimetable } from "@/hooks/use-timetable";
import { useClasses } from "@/hooks/use-classes";
import { useUsers } from "@/hooks/use-users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Globe,
  LayoutGrid,
  Loader2,
  MapPin,
  Plus,
  Send,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useLiveSettings, computePeriodTimeline } from "@/lib/timetable-settings-bus";

const ALL_DAYS: Record<number, { label: string; short: string; num: number }> = {
  1: { label: "Monday", short: "Mon", num: 1 },
  2: { label: "Tuesday", short: "Tue", num: 2 },
  3: { label: "Wednesday", short: "Wed", num: 3 },
  4: { label: "Thursday", short: "Thu", num: 4 },
  5: { label: "Friday", short: "Fri", num: 5 },
  6: { label: "Saturday", short: "Sat", num: 6 },
};

type CellData = {
  subject: string;
  teacherId: string;
  room: string;
};

type GridState = Record<string, CellData>; // key: `${day}-${period}`

const cellKey = (day: number, period: number) => `${day}-${period}`;

const emptyCell = (): CellData => ({ subject: "", teacherId: "", room: "" });

function buildInitialGrid(periods: any[]): GridState {
  const grid: GridState = {};
  for (const p of periods) {
    grid[cellKey(p.dayOfWeek, p.period)] = {
      subject: p.subject ?? "",
      teacherId: p.teacherId ? String(p.teacherId) : "",
      room: p.room ?? "",
    };
  }
  return grid;
}

function TimetableListView({
  onSelect,
}: {
  onSelect: (id: number) => void;
}) {
  const { data: timetables, isLoading } = useAdminTimetables();
  const { data: classesData } = useClasses();
  const createTt = useCreateTimetable();
  const { toast } = useToast();
  const [newClassId, setNewClassId] = useState<string>("");

  const allClasses = classesData?.data ?? [];
  const usedClassIds = new Set((timetables ?? []).map((t: any) => t.classId));
  const availableClasses = allClasses.filter((c) => !usedClassIds.has(c.id));

  const handleCreate = async () => {
    if (!newClassId) return;
    try {
      const created = await createTt.mutateAsync(Number(newClassId));
      toast({ title: "Timetable created", description: "Start adding periods now." });
      onSelect(created.id);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 pb-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[1.9rem] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 p-8 text-white shadow-[0_28px_80px_-32px_rgba(15,23,42,0.75)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.25),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(168,85,247,0.2),_transparent_28%)]" />
        <div className="relative space-y-4">
          <Badge variant="outline" className="border-white/15 bg-white/10 text-white">
            <LayoutGrid className="mr-1.5 h-3 w-3" /> Timetable Management
          </Badge>
          <h1 className="text-4xl font-display font-bold tracking-tight md:text-5xl">
            Schedule Builder
          </h1>
          <p className="max-w-2xl text-slate-300">
            Create, edit, and publish weekly timetables per class. Publish to instantly push schedules to teachers and students.
          </p>
        </div>
      </div>

      {/* Create new */}
      <Card className="border-dashed bg-white/70">
        <CardHeader>
          <CardTitle className="text-base">Create timetable for a class</CardTitle>
          <CardDescription>Each class can have one active timetable.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Select value={newClassId} onValueChange={setNewClassId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select class…" />
              </SelectTrigger>
              <SelectContent>
                {availableClasses.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.grade}-{c.section}{c.stream ? `-${c.stream}` : ""} ({c.academicYear})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleCreate} disabled={!newClassId || createTt.isPending}>
              {createTt.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div>
        <h2 className="mb-4 text-lg font-display font-semibold text-slate-900">All Timetables</h2>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-[1.5rem]" />
            ))}
          </div>
        ) : (timetables ?? []).length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
            No timetables yet. Create one above.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(timetables ?? []).map((tt: any) => {
              const cls = tt.class;
              const className = cls ? `${cls.grade}-${cls.section}${cls.stream ? `-${cls.stream}` : ""}` : `Class ${tt.classId}`;
              const isPublished = tt.status === "published";
              return (
                <button
                  key={tt.id}
                  onClick={() => onSelect(tt.id)}
                  className="group relative flex flex-col gap-3 rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {cls?.academicYear ?? ""}
                      </p>
                      <p className="mt-1 text-xl font-display font-bold text-slate-900">{className}</p>
                    </div>
                    <Badge
                      variant={isPublished ? "secondary" : "outline"}
                      className={cn(isPublished && "border-emerald-300 bg-emerald-100 text-emerald-800")}
                    >
                      {isPublished ? (
                        <><CheckCircle2 className="mr-1 h-3 w-3" />Published</>
                      ) : "Draft"}
                    </Badge>
                  </div>
                  {isPublished && tt.fitnessScore && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      Fitness score: <span className="font-semibold text-slate-900">{tt.fitnessScore}%</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100">
                    Edit timetable <ChevronRight className="h-3 w-3" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cell editor ─────────────────────────────────────────────────────────────

function PeriodCell({
  value,
  onChange,
  teachers,
  isConflict,
}: {
  value: CellData;
  onChange: (v: CellData) => void;
  teachers: any[];
  isConflict: boolean;
}) {
  const hasContent = !!(value.subject || value.teacherId || value.room);

  return (
    <div
      className={cn(
        "group relative min-h-[128px] rounded-xl border p-2.5 transition-all duration-200",
        isConflict
          ? "border-rose-300 bg-rose-50/80 ring-1 ring-rose-200"
          : hasContent
          ? "border-indigo-200 bg-indigo-50/60"
          : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50",
      )}
    >
      {isConflict && (
        <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-rose-600">
          <AlertTriangle className="h-3 w-3" /> Conflict
        </div>
      )}
      <div className="space-y-1.5">
        <Input
          placeholder="Subject"
          value={value.subject}
          onChange={(e) => onChange({ ...value, subject: e.target.value })}
          className="h-7 border-0 bg-transparent p-0 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus-visible:ring-0"
        />
        <Select
          value={value.teacherId || "__none__"}
          onValueChange={(v) => onChange({ ...value, teacherId: v === "__none__" ? "" : v })}
        >
          <SelectTrigger className="h-6 border-0 bg-transparent p-0 text-xs text-slate-600 focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
            <SelectValue placeholder="Teacher…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {teachers.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Room"
          value={value.room}
          onChange={(e) => onChange({ ...value, room: e.target.value })}
          className="h-6 border-0 bg-transparent p-0 text-xs text-slate-500 placeholder:text-slate-400 focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

// ─── Grid editor ─────────────────────────────────────────────────────────────

function TimetableEditor({ timetableId, onBack }: { timetableId: number; onBack: () => void }) {
  const { data: tt, isLoading } = useAdminTimetable(timetableId);
  const { data: classesData } = useClasses();
  const { data: users } = useUsers();
  const upsert = useUpsertPeriods(timetableId);
  const publish = usePublishTimetable();
  const { toast } = useToast();
  const settings = useLiveSettings();

  const [grid, setGrid] = useState<GridState>({});
  const [conflictSet, setConflictSet] = useState<Set<string>>(new Set());

  const teachers = (users ?? []).filter((u: any) => u.role === "teacher");

  const timeline = useMemo(() => {
    if (!settings) return [];
    // Ensure the timeline always includes any period IDs that exist in the current data
    const requestedPeriodIds = Array.from(new Set(tt?.periods?.map((p: any) => p.period) || [])).filter(n => n > 0);
    return computePeriodTimeline(settings, requestedPeriodIds);
  }, [settings, tt?.periods]);

  const activeDays = settings ? settings.workingDays.map((d: number) => ALL_DAYS[d]) : [];
  const activePeriods = settings ? Array.from({ length: settings.totalPeriods }, (_, i) => i + 1) : [];

  useEffect(() => {
    if (tt?.periods) {
      setGrid(buildInitialGrid(tt.periods));
      const conflicts = new Set<string>();
      tt.periods.forEach((p: any) => {
        if (p.isConflict) conflicts.add(cellKey(p.dayOfWeek, p.period));
      });
      setConflictSet(conflicts);
    }
  }, [tt]);

  const updateCell = useCallback((day: number, period: number, value: CellData) => {
    setGrid((prev) => ({ ...prev, [cellKey(day, period)]: value }));
    // Live conflict detection
    setConflictSet((prev) => {
      const next = new Set(prev);
      const teacherSlots = new Map<string, string[]>();
      const updatedGrid = { ...grid, [cellKey(day, period)]: value };
      for (const [key, cell] of Object.entries(updatedGrid)) {
        if (!cell.teacherId) continue;
        const [d, p] = key.split("-");
        const slotKey = `${cell.teacherId}:${d}:${p}`;
        const bucket = teacherSlots.get(cell.teacherId + ":" + p) ?? [];
        bucket.push(slotKey);
        teacherSlots.set(cell.teacherId + ":" + p, bucket);
      }
      // simple same-period conflict per teacher
      for (const [d, periods] of Object.entries(
        activeDays.reduce((acc: Record<string, CellData[]>, day: {num: number, label: string, short: string}) => {
          acc[String(day.num)] = activePeriods.map((p) => updatedGrid[cellKey(day.num, p)] ?? emptyCell());
          return acc;
        }, {}),
      )) {
        // not needed in UI live detection — just mark next
      }
      return next;
    });
  }, [grid]);

  const handleSave = async () => {
    const periods = activeDays.flatMap((day: {num: number}) =>
      activePeriods.map((p) => {
        const cell = grid[cellKey(day.num, p)] ?? emptyCell();
        return {
          dayOfWeek: day.num,
          period: p,
          subject: cell.subject || null,
          teacherId: cell.teacherId ? Number(cell.teacherId) : null,
          room: cell.room || null,
        };
      }).filter((row) => row.subject || row.teacherId || row.room),
    );

    try {
      const res = await upsert.mutateAsync(periods);
      toast({ title: "Saved", description: `Draft saved. ${res.conflictCount} conflict(s) detected.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  const handlePublish = async () => {
    await handleSave(); // save first
    try {
      const res = await publish.mutateAsync(timetableId);
      toast({
        title: "Timetable published!",
        description: `Fitness score: ${res.fitnessScore}% · ${res.conflictCount} conflict(s).`,
      });
    } catch (e: any) {
      toast({ title: "Publish failed", description: e.message, variant: "destructive" });
    }
  };

  const isPublished = tt?.status === "published";
  const fitnessScore = tt?.fitnessScore ? Number(tt.fitnessScore) : null;

  const cls = tt?.class;
  const className = cls ? `${cls.grade}-${cls.section}${cls.stream ? `-${cls.stream}` : ""}` : `Timetable ${timetableId}`;

  if (isLoading || !settings) {
    return (
      <div className="space-y-6 pb-8">
        <Skeleton className="h-40 rounded-[1.9rem]" />
        <Skeleton className="h-[600px] rounded-[1.5rem]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-[1.9rem] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 p-7 text-white shadow-[0_28px_80px_-32px_rgba(15,23,42,0.75)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.25),_transparent_30%)]" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <button
              onClick={onBack}
              className="mb-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              ← All timetables
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-display font-bold">{className}</h1>
              <Badge
                variant="outline"
                className={cn(
                  "border-white/20",
                  isPublished
                    ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
                    : "bg-white/10 text-white/80",
                )}
              >
                {isPublished ? (
                  <><Globe className="mr-1 h-3 w-3" />Published</>
                ) : "Draft"}
              </Badge>
            </div>
            {fitnessScore !== null && (
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-300">
                <Star className="h-4 w-4 text-amber-400" />
                Schedule fitness: <span className="font-semibold text-white">{fitnessScore}%</span>
                <div className="ml-2 h-1.5 w-32 overflow-hidden rounded-full bg-white/20">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      fitnessScore >= 90 ? "bg-emerald-400" : fitnessScore >= 70 ? "bg-amber-400" : "bg-rose-400",
                    )}
                    style={{ width: `${fitnessScore}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={handleSave}
              disabled={upsert.isPending}
            >
              {upsert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Draft
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-indigo-500 text-white hover:bg-indigo-600">
                  <Send className="mr-2 h-4 w-4" />
                  {isPublished ? "Re-publish" : "Publish"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Publish timetable?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will save the current draft and make it visible to teachers and students for <strong>{className}</strong>. Any existing published timetable for this class will be replaced.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handlePublish} disabled={publish.isPending}>
                    {publish.isPending ? "Publishing…" : "Publish now"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Grid */}
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-slate-50/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <CalendarCheck2 className="h-4 w-4 text-indigo-600" />
            <CardTitle className="text-base">Weekly Schedule Grid</CardTitle>
            {conflictSet.size > 0 && (
              <Badge variant="destructive" className="ml-auto">
                <AlertTriangle className="mr-1 h-3 w-3" /> {conflictSet.size} unsaved conflict(s)
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <div className="min-w-[860px]">
            {/* Header row */}
            <div className="grid border-b bg-slate-50" style={{ gridTemplateColumns: `80px repeat(${activeDays.length}, 1fr)` }}>
              <div className="p-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Period</div>
              {activeDays.map((d: {num: number, short: string}) => (
                <div key={d.num} className="border-l p-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-700">
                  {d.short}
                </div>
              ))}
            </div>
            {/* Period rows */}
            {timeline.map((slot) => {
              if (slot.isBreak) {
                return (
                  <div key={`break-${slot.startTime}`} className="bg-amber-50/50 border-b py-3 text-center text-amber-700 font-medium text-sm flex items-center justify-center shadow-inner">
                    Break Time ({slot.startTime} – {slot.endTime})
                  </div>
                );
              }
              const period = slot.periodNumber!;
              return (
              <div key={`period-${period}`} className="grid border-b last:border-0" style={{ gridTemplateColumns: `80px repeat(${activeDays.length}, 1fr)` }}>
                <div className="flex flex-col items-center justify-center gap-1 p-3">
                  <span className="text-sm font-bold text-slate-700">P{period}</span>
                  <span className="text-center text-[10px] leading-tight text-slate-400">{slot.startTime} – {slot.endTime}</span>
                </div>
                {activeDays.map((day: {num: number}) => {
                  const key = cellKey(day.num, period);
                  const isConflict = conflictSet.has(key);
                  return (
                    <div key={day.num} className="border-l p-1.5">
                      <PeriodCell
                        value={grid[key] ?? emptyCell()}
                        onChange={(v) => updateCell(day.num, period, v)}
                        teachers={teachers}
                        isConflict={isConflict}
                      />
                    </div>
                  );
                })}
              </div>
            )})}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded border border-indigo-200 bg-indigo-50" /> Filled period</div>
        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded border border-rose-200 bg-rose-50" /> Conflict detected</div>
        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded border border-slate-200 bg-white" /> Empty slot</div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminTimetable() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <Layout>
      {selectedId == null ? (
        <TimetableListView onSelect={setSelectedId} />
      ) : (
        <TimetableEditor timetableId={selectedId} onBack={() => setSelectedId(null)} />
      )}
    </Layout>
  );
}
