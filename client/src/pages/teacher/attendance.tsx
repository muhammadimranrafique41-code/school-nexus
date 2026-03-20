import { useEffect, useMemo, useState } from "react";
import { attendanceSessions, attendanceStatuses } from "@shared/schema";
import { format, parseISO } from "date-fns";
import { Layout } from "@/components/layout";
import {
  useTeacherAttendanceHistory,
  useTeacherAttendanceStudents,
  useTeacherBulkUpsertAttendance,
  useTeacherClasses,
  useTeacherUpdateAttendance,
} from "@/hooks/use-attendance";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, getErrorMessage } from "@/lib/utils";
import {
  CheckCircle2, Loader2, Pencil, Save, Users,
  ClipboardCheck, Clock4, XCircle, AlertCircle,
  CalendarDays, ChevronDown,
} from "lucide-react";

/* ─── types ────────────────────────────────────────────────────────*/
type AttendanceStatus = (typeof attendanceStatuses)[number];
type AttendanceSession = (typeof attendanceSessions)[number];
type DraftMap = Record<number, { status: AttendanceStatus; remarks: string }>;

/* ─── status config ────────────────────────────────────────────────*/
const STATUS_CFG: Record<AttendanceStatus, {
  active: string; inactive: string; dot: string; icon: typeof CheckCircle2;
}> = {
  Present: {
    active: "bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-200",
    inactive: "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100",
    dot: "bg-emerald-400",
    icon: CheckCircle2,
  },
  Absent: {
    active: "bg-red-500 text-white border-red-500 shadow-sm shadow-red-200",
    inactive: "bg-red-50 text-red-600 border-red-200 hover:bg-red-100",
    dot: "bg-red-400",
    icon: XCircle,
  },
  Late: {
    active: "bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-200",
    inactive: "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100",
    dot: "bg-amber-400",
    icon: Clock4,
  },
  Excused: {
    active: "bg-sky-500 text-white border-sky-500 shadow-sm shadow-sky-200",
    inactive: "bg-sky-50 text-sky-600 border-sky-200 hover:bg-sky-100",
    dot: "bg-sky-400",
    icon: AlertCircle,
  },
};

/* ─── helpers ──────────────────────────────────────────────────────*/
function StatusToggle({
  value, onChange,
}: {
  value: AttendanceStatus;
  onChange: (s: AttendanceStatus) => void;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {attendanceStatuses.map(s => {
        const cfg = STATUS_CFG[s];
        const Icon = cfg.icon;
        const isActive = value === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-all ${isActive ? cfg.active : cfg.inactive}`}
          >
            <Icon className="h-3 w-3" />
            {s}
          </button>
        );
      })}
    </div>
  );
}

/* ─── component ─────────────────────────────────────────────────── */
export default function TeacherAttendance() {
  const { toast } = useToast();
  const { data: classes = [], isLoading: classesLoading } = useTeacherClasses();
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedSession, setSelectedSession] = useState<AttendanceSession>("Full Day");
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [expandedStudent, setExpandedStudent] = useState<number | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState<AttendanceStatus>("Present");
  const [editingSession, setEditingSession] = useState<AttendanceSession>("Full Day");
  const [editingRemarks, setEditingRemarks] = useState("");

  const { data: students = [], isLoading: studentsLoading } = useTeacherAttendanceStudents(selectedClass || undefined);
  const { data: history = [], isLoading: historyLoading } = useTeacherAttendanceHistory({ className: selectedClass || undefined });
  const bulkUpsert = useTeacherBulkUpsertAttendance();
  const updateAttendance = useTeacherUpdateAttendance();

  /* auto-select first class */
  useEffect(() => {
    if (!selectedClass && classes[0]?.className) setSelectedClass(classes[0].className);
  }, [classes, selectedClass]);

  /* selected session records */
  const selectedSessionRecords = useMemo(
    () => history.filter(r => r.date === selectedDate && r.session === selectedSession),
    [history, selectedDate, selectedSession],
  );

  /* recent history */
  const recentHistory = useMemo(
    () => [...history].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 15),
    [history],
  );

  /* sync drafts */
  useEffect(() => {
    if (students.length === 0) { setDrafts({}); return; }
    const existing = new Map(selectedSessionRecords.map(r => [r.studentId, r]));
    const next: DraftMap = {};
    students.forEach(s => {
      next[s.id] = {
        status: existing.get(s.id)?.status ?? "Present",
        remarks: existing.get(s.id)?.remarks ?? "",
      };
    });
    setDrafts(next);
  }, [selectedSessionRecords, students]);

  /* summary */
  const summary = useMemo(() => {
    const present = selectedSessionRecords.filter(r => r.status === "Present").length;
    const absent = selectedSessionRecords.filter(r => r.status === "Absent").length;
    const late = selectedSessionRecords.filter(r => r.status === "Late").length;
    const excused = selectedSessionRecords.filter(r => r.status === "Excused").length;
    const marked = selectedSessionRecords.length;
    const rate = students.length > 0 ? Math.round((present / students.length) * 100) : 0;
    return { total: students.length, marked, present, absent, late, excused, rate };
  }, [selectedSessionRecords, students.length]);

  /* draft summary */
  const draftSummary = useMemo(() => {
    const vals = Object.values(drafts);
    return {
      present: vals.filter(d => d.status === "Present").length,
      absent: vals.filter(d => d.status === "Absent").length,
      late: vals.filter(d => d.status === "Late").length,
      excused: vals.filter(d => d.status === "Excused").length,
    };
  }, [drafts]);

  const editingRecord = recentHistory.find(r => r.id === editingRecordId) ?? null;

  /* bulk set */
  const setAllStatuses = (status: AttendanceStatus) => {
    setDrafts(curr => {
      const next = { ...curr };
      students.forEach(s => { next[s.id] = { status, remarks: next[s.id]?.remarks ?? "" }; });
      return next;
    });
  };

  /* save */
  const saveAttendance = async () => {
    if (!selectedClass || students.length === 0) return;
    try {
      await bulkUpsert.mutateAsync({
        className: selectedClass,
        date: selectedDate,
        session: selectedSession,
        records: students.map(s => ({
          studentId: s.id,
          status: drafts[s.id]?.status ?? "Present",
          remarks: drafts[s.id]?.remarks.trim() || undefined,
        })),
      });
      toast({ title: "Attendance saved", description: "All records saved successfully." });
    } catch (err) {
      toast({ title: "Save failed", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  /* open edit */
  const openEditDialog = (id: number) => {
    const r = recentHistory.find(item => item.id === id);
    if (!r) return;
    setEditingRecordId(r.id);
    setEditingStatus(r.status);
    setEditingSession(r.session);
    setEditingRemarks(r.remarks ?? "");
  };

  /* save edit */
  const saveEdit = async () => {
    if (!editingRecord) return;
    try {
      await updateAttendance.mutateAsync({
        id: editingRecord.id,
        status: editingStatus,
        session: editingSession,
        remarks: editingRemarks.trim() || null,
      });
      toast({ title: "Record updated", description: "Attendance record has been updated." });
      setEditingRecordId(null);
    } catch (err) {
      toast({ title: "Update failed", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-5">

          {/* ── Page header ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 shadow-md shadow-amber-200">
                <ClipboardCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">Attendance</h1>
                <p className="text-xs text-slate-500">Mark by class & session · edit history</p>
              </div>
            </div>
            <button
              onClick={saveAttendance}
              disabled={bulkUpsert.isPending || !selectedClass || students.length === 0}
              className="flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-white shadow-sm shadow-amber-200 hover:bg-amber-600 transition-colors disabled:opacity-40 self-start sm:self-auto">
              {bulkUpsert.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              Save Attendance
            </button>
          </div>

          {/* ── Controls bar ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Session Controls</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Class */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Class</label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="h-9 rounded-xl border-slate-200 text-xs bg-slate-50">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map(c => (
                      <SelectItem key={c.className} value={c.className} className="text-xs">{c.className}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Date</label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
                  />
                </div>
              </div>
              {/* Session */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Session</label>
                <Select value={selectedSession} onValueChange={(v: AttendanceSession) => setSelectedSession(v)}>
                  <SelectTrigger className="h-9 rounded-xl border-slate-200 text-xs bg-slate-50">
                    <SelectValue placeholder="Select session" />
                  </SelectTrigger>
                  <SelectContent>
                    {attendanceSessions.map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── Stat strip ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Users, label: "Total Students", value: summary.total, accent: "bg-slate-100 text-slate-600" },
              { icon: CheckCircle2, label: "Present", value: summary.present, accent: "bg-emerald-50 text-emerald-600" },
              { icon: XCircle, label: "Absent", value: summary.absent, accent: "bg-red-50 text-red-600" },
              { icon: Clock4, label: "Late / Excused", value: summary.late + summary.excused, accent: "bg-amber-50 text-amber-600" },
            ].map(s => (
              <div key={s.label}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.accent}`}>
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 truncate">{s.label}</p>
                  <p className="text-lg font-bold text-slate-900 leading-tight">{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Attendance rate bar */}
          {summary.total > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white px-5 py-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-700">Attendance Rate (saved)</p>
                <p className="text-xs font-black text-amber-600">{summary.rate}%</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${summary.rate >= 80 ? "bg-emerald-400" : summary.rate >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${summary.rate}%` }}
                />
              </div>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {[
                  { label: "Present", value: draftSummary.present, dot: "bg-emerald-400" },
                  { label: "Absent", value: draftSummary.absent, dot: "bg-red-400" },
                  { label: "Late", value: draftSummary.late, dot: "bg-amber-400" },
                  { label: "Excused", value: draftSummary.excused, dot: "bg-sky-400" },
                ].map(d => (
                  <div key={d.label} className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${d.dot}`} />
                    <span className="text-[10px] text-slate-500 font-medium">{d.label}: <strong className="text-slate-800">{d.value}</strong></span>
                  </div>
                ))}
                <span className="text-[10px] text-slate-400 ml-auto italic">Draft counts</span>
              </div>
            </div>
          )}

          {/* ── Bulk Marking ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            {/* header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-50">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Bulk Marking</h2>
                <p className="text-xs text-slate-400 mt-0.5">Tap status chips per student · set all in one click</p>
              </div>
              {/* mark-all strip */}
              <div className="flex flex-wrap gap-1.5">
                {attendanceStatuses.map(s => {
                  const cfg = STATUS_CFG[s];
                  const Icon = cfg.icon;
                  return (
                    <button key={s} onClick={() => setAllStatuses(s)}
                      className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${cfg.inactive}`}>
                      <Icon className="h-3 w-3" /> All {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* student list */}
            <div className="p-4 space-y-2.5">
              {classesLoading || studentsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                </div>
              ) : students.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                  <Users className="h-7 w-7 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-500">No students found</p>
                  <p className="text-xs text-slate-400">Select a class to load students.</p>
                </div>
              ) : (
                students.map((student, idx) => {
                  const draft = drafts[student.id];
                  const status = draft?.status ?? "Present";
                  const cfg = STATUS_CFG[status];
                  const StatusIcon = cfg.icon;
                  const isExpanded = expandedStudent === student.id;

                  return (
                    <div key={student.id}
                      className="rounded-2xl border border-slate-100 overflow-hidden">
                      {/* main row */}
                      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/60">
                        {/* index */}
                        <span className="text-[10px] font-black text-slate-300 w-5 shrink-0 text-center">
                          {String(idx + 1).padStart(2, "0")}
                        </span>

                        {/* avatar initial */}
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${cfg.active.split(" ").slice(0, 2).join(" ")}`}>
                          {student.name?.charAt(0).toUpperCase() ?? "S"}
                        </div>

                        {/* name */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate leading-tight">{student.name}</p>
                          <p className="text-[10px] text-slate-500">{student.className || selectedClass}</p>
                        </div>

                        {/* status badge */}
                        <div className="hidden sm:flex">
                          <StatusToggle
                            value={status}
                            onChange={s => setDrafts(c => ({ ...c, [student.id]: { status: s, remarks: c[student.id]?.remarks ?? "" } }))}
                          />
                        </div>

                        {/* mobile: current status pill + expand */}
                        <div className="flex items-center gap-2 sm:hidden">
                          <span className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold ${cfg.active}`}>
                            <StatusIcon className="h-3 w-3" /> {status}
                          </span>
                          <button onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
                            className="rounded-lg border border-slate-200 bg-white p-1.5">
                            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                        </div>
                      </div>

                      {/* mobile expanded: status toggles + remarks */}
                      {isExpanded && (
                        <div className="sm:hidden border-t border-slate-100 bg-white px-4 py-3 space-y-3">
                          <StatusToggle
                            value={status}
                            onChange={s => setDrafts(c => ({ ...c, [student.id]: { status: s, remarks: c[student.id]?.remarks ?? "" } }))}
                          />
                          <input
                            type="text"
                            placeholder="Optional remarks…"
                            value={draft?.remarks ?? ""}
                            onChange={e => setDrafts(c => ({ ...c, [student.id]: { status: c[student.id]?.status ?? "Present", remarks: e.target.value } }))}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
                          />
                        </div>
                      )}

                      {/* desktop remarks inline */}
                      <div className="hidden sm:block border-t border-slate-50 bg-white px-4 py-2">
                        <input
                          type="text"
                          placeholder="Optional remarks for this student…"
                          value={draft?.remarks ?? ""}
                          onChange={e => setDrafts(c => ({ ...c, [student.id]: { status: c[student.id]?.status ?? "Present", remarks: e.target.value } }))}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* sticky save footer */}
            {students.length > 0 && (
              <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 backdrop-blur px-5 py-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  <strong className="text-slate-800">{students.length}</strong> students · <strong className="text-emerald-600">{draftSummary.present}</strong> present
                </p>
                <button
                  onClick={saveAttendance}
                  disabled={bulkUpsert.isPending || !selectedClass}
                  className="flex h-9 items-center gap-2 rounded-xl bg-amber-500 px-5 text-xs font-bold text-white shadow-sm hover:bg-amber-600 transition-colors disabled:opacity-40">
                  {bulkUpsert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Attendance
                </button>
              </div>
            )}
          </div>

          {/* ── Attendance History ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-50">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Attendance History</h2>
                <p className="text-xs text-slate-400 mt-0.5">Recent records · click to edit</p>
              </div>
              {recentHistory.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                  {recentHistory.length} records
                </span>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    {["Date", "Session", "Student", "Status", "Remarks", ""].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {historyLoading ? (
                    <tr><td colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-amber-400" /></td></tr>
                  ) : recentHistory.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-400">No history found for this class yet.</td></tr>
                  ) : (
                    recentHistory.map(record => {
                      const cfg = STATUS_CFG[record.status];
                      return (
                        <tr key={record.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5 text-xs font-semibold text-slate-800">{formatDate(parseISO(record.date), "MMM dd, yyyy")}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{record.session}</td>
                          <td className="px-4 py-2.5 text-xs font-medium text-slate-900">{record.student?.name || `Student ${record.studentId}`}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${cfg.inactive}`}>
                              <span className={`h-1 w-1 rounded-full ${cfg.dot}`} />
                              {record.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-400 italic">{record.remarks || "—"}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => openEditDialog(record.id)}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm ml-auto">
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden p-4 space-y-2">
              {historyLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-amber-400" /></div>
              ) : recentHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No history found yet.</p>
              ) : (
                recentHistory.map(record => {
                  const cfg = STATUS_CFG[record.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={record.id}
                      className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${cfg.inactive}`}>
                        <StatusIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-900 truncate">{record.student?.name || `Student ${record.studentId}`}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.inactive}`}>{record.status}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {formatDate(parseISO(record.date), "MMM dd, yyyy")} · {record.session}
                          {record.remarks && <> · <span className="italic">{record.remarks}</span></>}
                        </p>
                      </div>
                      <button onClick={() => openEditDialog(record.id)}
                        className="shrink-0 flex items-center justify-center h-8 w-8 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 shadow-sm">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editingRecordId} onOpenChange={open => !open && setEditingRecordId(null)}>
        <DialogContent className="max-w-md bg-white border-slate-100 rounded-2xl shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
            <DialogTitle className="text-base font-bold text-slate-900">Edit Attendance Record</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Update status, session, or remarks for this entry.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4">
            {/* student info */}
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 font-black text-sm">
                {editingRecord?.student?.name?.charAt(0).toUpperCase() ?? "S"}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">{editingRecord?.student?.name || `Student ${editingRecord?.studentId ?? ""}`}</p>
                <p className="text-[10px] text-slate-500">{editingRecord?.date ?? "—"}</p>
              </div>
            </div>

            {/* status toggles */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Status</label>
              <StatusToggle value={editingStatus} onChange={setEditingStatus} />
            </div>

            {/* session */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Session</label>
              <Select value={editingSession} onValueChange={(v: AttendanceSession) => setEditingSession(v)}>
                <SelectTrigger className="h-9 rounded-xl border-slate-200 text-xs bg-slate-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {attendanceSessions.map(s => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* remarks */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Remarks</label>
              <Textarea
                value={editingRemarks}
                onChange={e => setEditingRemarks(e.target.value)}
                placeholder="Optional remarks…"
                className="rounded-xl border-slate-200 bg-slate-50 text-xs resize-none h-20 focus:ring-amber-400/40 focus:border-amber-400"
              />
            </div>

            <button
              onClick={saveEdit}
              disabled={updateAttendance.isPending}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 transition-colors disabled:opacity-40 shadow-sm shadow-amber-200">
              {updateAttendance.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
