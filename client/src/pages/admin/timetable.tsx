import { useState, useCallback, useEffect, useMemo } from "react";
import { Layout } from "@/components/layout";
import {
  useAdminTimetables, useAdminTimetable, useCreateTimetable,
  useUpsertPeriods, usePublishTimetable,
} from "@/hooks/use-timetable";
import { useClasses } from "@/hooks/use-classes";
import { useUsers } from "@/hooks/use-users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, BookOpen, CalendarCheck2, CheckCircle2, ChevronRight,
  Clock, Globe, LayoutGrid, Loader2, Plus, Send, Star, ArrowLeft,
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

type CellData = { subject: string; teacherId: string; room: string };
type GridState = Record<string, CellData>;

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

// ── Status badge ──────────────────────────────────────────────────────────
function StatusBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />Published
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
      Draft
    </span>
  );
}

// ── Timetable list ────────────────────────────────────────────────────────
function TimetableListView({ onSelect }: { onSelect: (id: number) => void }) {
  const { data: timetables, isLoading } = useAdminTimetables();
  const { data: classesData } = useClasses();
  const createTt = useCreateTimetable();
  const { toast } = useToast();
  const [newClassId, setNewClassId] = useState("");

  const allClasses = classesData?.data ?? [];
  const usedClassIds = new Set((timetables ?? []).map((t: any) => t.classId));
  const availClasses = allClasses.filter((c) => !usedClassIds.has(c.id));

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
    <div className="space-y-5 pb-8">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Schedule Builder</h1>
            <p className="text-[12px] text-slate-400">Create, edit, and publish weekly timetables per class.</p>
          </div>
        </div>
      </div>

      {/* ── Create new ──────────────────────────────────────────────── */}
      <Card className="border-slate-200/80 bg-white shadow-none">
        <CardHeader className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
              <Plus className="h-3.5 w-3.5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900">Create timetable</CardTitle>
              <CardDescription className="text-[11px]">Each class can have one active timetable.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <Select value={newClassId} onValueChange={setNewClassId}>
              <SelectTrigger className="h-8 w-56 text-sm">
                <SelectValue placeholder="Select class…" />
              </SelectTrigger>
              <SelectContent>
                {availClasses.length === 0 ? (
                  <SelectItem value="__none__" disabled>All classes have timetables</SelectItem>
                ) : availClasses.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.grade}-{c.section}{c.stream ? `-${c.stream}` : ""} ({c.academicYear})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleCreate} disabled={!newClassId || createTt.isPending}>
              {createTt.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── List ────────────────────────────────────────────────────── */}
      <div>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
          All Timetables ({(timetables ?? []).length})
        </p>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (timetables ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-10 text-center text-[13px] text-slate-400">
            No timetables yet — create one above.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(timetables ?? []).map((tt: any) => {
              const cls = tt.class;
              const name = cls
                ? `${cls.grade}-${cls.section}${cls.stream ? `-${cls.stream}` : ""}`
                : `Class ${tt.classId}`;
              const isPublished = tt.status === "published";

              return (
                <button
                  key={tt.id}
                  onClick={() => onSelect(tt.id)}
                  className="group relative flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-sm"
                >
                  {/* top accent bar */}
                  <div className={cn(
                    "absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-gradient-to-r transition-opacity",
                    isPublished ? "from-emerald-400 to-teal-400 opacity-100" : "from-indigo-400 to-blue-400 opacity-0 group-hover:opacity-100",
                  )} />

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        {cls?.academicYear ?? ""}
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-slate-900">{name}</p>
                    </div>
                    <StatusBadge published={isPublished} />
                  </div>

                  {isPublished && tt.fitnessScore && (
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                      <Star className="h-3 w-3 text-amber-500" />
                      Fitness <span className="font-bold text-slate-900">{tt.fitnessScore}%</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 text-[11px] font-semibold text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">
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

// ── Period cell ───────────────────────────────────────────────────────────
function PeriodCell({
  value, onChange, teachers, isConflict,
}: {
  value: CellData; onChange: (v: CellData) => void;
  teachers: any[]; isConflict: boolean;
}) {
  const hasContent = !!(value.subject || value.teacherId || value.room);

  return (
    <div className={cn(
      "group relative min-h-[112px] rounded-lg border p-2 transition-all duration-150",
      isConflict
        ? "border-rose-300 bg-rose-50/80 ring-1 ring-rose-200"
        : hasContent
          ? "border-indigo-200 bg-indigo-50/50"
          : "border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50/60",
    )}>
      {isConflict && (
        <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-rose-600">
          <AlertTriangle className="h-2.5 w-2.5" /> Conflict
        </div>
      )}
      <div className="space-y-1">
        <Input
          placeholder="Subject"
          value={value.subject}
          onChange={(e) => onChange({ ...value, subject: e.target.value })}
          className="h-6 border-0 bg-transparent p-0 text-[12px] font-semibold text-slate-800 placeholder:text-slate-300 focus-visible:ring-0"
        />
        <Select
          value={value.teacherId || "__none__"}
          onValueChange={(v) => onChange({ ...value, teacherId: v === "__none__" ? "" : v })}
        >
          <SelectTrigger className="h-5 border-0 bg-transparent p-0 text-[11px] text-slate-500 focus:ring-0 [&>svg]:h-2.5 [&>svg]:w-2.5">
            <SelectValue placeholder="Teacher…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {teachers.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Room"
          value={value.room}
          onChange={(e) => onChange({ ...value, room: e.target.value })}
          className="h-5 border-0 bg-transparent p-0 text-[11px] text-slate-400 placeholder:text-slate-300 focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

// ── Grid editor ───────────────────────────────────────────────────────────
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
    const ids = Array.from(new Set(tt?.periods?.map((p: any) => p.period) || [])).filter((n) => n > 0);
    return computePeriodTimeline(settings, ids);
  }, [settings, tt?.periods]);

  const activeDays = settings ? settings.workingDays.map((d: number) => ALL_DAYS[d]) : [];
  const activePeriods = settings ? Array.from({ length: settings.totalPeriods }, (_, i) => i + 1) : [];

  useEffect(() => {
    if (tt?.periods) {
      setGrid(buildInitialGrid(tt.periods));
      const conflicts = new Set<string>();
      tt.periods.forEach((p: any) => { if (p.isConflict) conflicts.add(cellKey(p.dayOfWeek, p.period)); });
      setConflictSet(conflicts);
    }
  }, [tt]);

  const updateCell = useCallback((day: number, period: number, value: CellData) => {
    setGrid((prev) => ({ ...prev, [cellKey(day, period)]: value }));
  }, []);

  const handleSave = async () => {
    const periods = activeDays.flatMap((day: { num: number }) =>
      activePeriods
        .map((p) => {
          const cell = grid[cellKey(day.num, p)] ?? emptyCell();
          return { dayOfWeek: day.num, period: p, subject: cell.subject || null, teacherId: cell.teacherId ? Number(cell.teacherId) : null, room: cell.room || null };
        })
        .filter((row) => row.subject || row.teacherId || row.room),
    );
    try {
      const res = await upsert.mutateAsync(periods);
      toast({ title: "Saved", description: `Draft saved. ${res.conflictCount} conflict(s) detected.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  const handlePublish = async () => {
    await handleSave();
    try {
      const res = await publish.mutateAsync(timetableId);
      toast({ title: "Timetable published!", description: `Fitness score: ${res.fitnessScore}% · ${res.conflictCount} conflict(s).` });
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
      <div className="space-y-4 pb-8">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-[500px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">

      {/* ── Editor header ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: back + title */}
        <div>
          <button
            onClick={onBack}
            className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-400 transition-colors hover:text-indigo-600"
          >
            <ArrowLeft className="h-3 w-3" /> All timetables
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">{className}</h1>
                <StatusBadge published={isPublished} />
              </div>
              {fitnessScore !== null && (
                <div className="mt-0.5 flex items-center gap-2">
                  <Star className="h-3 w-3 text-amber-500" />
                  <span className="text-[11px] text-slate-500">
                    Fitness <span className="font-bold text-slate-900">{fitnessScore}%</span>
                  </span>
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500",
                        fitnessScore >= 90 ? "bg-emerald-400" : fitnessScore >= 70 ? "bg-amber-400" : "bg-rose-400",
                      )}
                      style={{ width: `${fitnessScore}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {conflictSet.size > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600">
              <AlertTriangle className="h-3 w-3" />{conflictSet.size} conflict{conflictSet.size !== 1 ? "s" : ""}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save draft
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700">
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {isPublished ? "Re-publish" : "Publish"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Publish timetable?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will save the current draft and make it visible to teachers and students for <strong>{className}</strong>. Any existing published timetable will be replaced.
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

      {/* ── Grid ────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
        <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
            <CalendarCheck2 className="h-3.5 w-3.5 text-indigo-600" />
          </div>
          <CardTitle className="text-sm font-semibold text-slate-900">Weekly Schedule Grid</CardTitle>
        </CardHeader>

        <CardContent className="overflow-x-auto p-0">
          <div className="min-w-[760px]">

            {/* Day header row */}
            <div
              className="grid border-b border-slate-100 bg-slate-50"
              style={{ gridTemplateColumns: `72px repeat(${activeDays.length}, 1fr)` }}
            >
              <div className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Period
              </div>
              {activeDays.map((d: { num: number; short: string; label: string }) => (
                <div key={d.num} className="border-l border-slate-100 px-3 py-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700">{d.short}</p>
                  <p className="text-[10px] text-slate-400">{d.label}</p>
                </div>
              ))}
            </div>

            {/* Period rows */}
            {timeline.map((slot) => {
              if (slot.isBreak) {
                return (
                  <div
                    key={`break-${slot.startTime}`}
                    className="flex items-center justify-center gap-2 border-b border-dashed border-amber-200 bg-amber-50/60 py-2 text-[11px] font-semibold text-amber-700"
                  >
                    <Clock className="h-3 w-3" />
                    Break · {slot.startTime} – {slot.endTime}
                  </div>
                );
              }

              const period = slot.periodNumber!;
              return (
                <div
                  key={`period-${period}`}
                  className="grid border-b border-slate-100 last:border-b-0"
                  style={{ gridTemplateColumns: `72px repeat(${activeDays.length}, 1fr)` }}
                >
                  {/* Period label */}
                  <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-3">
                    <span className="text-sm font-bold text-slate-800">P{period}</span>
                    <span className="text-center text-[9px] leading-tight text-slate-400">
                      {slot.startTime}<br />{slot.endTime}
                    </span>
                  </div>

                  {/* Cells */}
                  {activeDays.map((day: { num: number }) => {
                    const key = cellKey(day.num, period);
                    return (
                      <div key={day.num} className="border-l border-slate-100 p-1.5">
                        <PeriodCell
                          value={grid[key] ?? emptyCell()}
                          onChange={(v) => updateCell(day.num, period, v)}
                          teachers={teachers}
                          isConflict={conflictSet.has(key)}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Legend ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded border border-indigo-200 bg-indigo-50/80" />
          Filled period
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded border border-rose-200 bg-rose-50/80" />
          Conflict
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded border border-slate-200 bg-white" />
          Empty slot
        </span>
      </div>
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────
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
