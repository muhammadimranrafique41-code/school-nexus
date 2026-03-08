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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { CheckCircle2, Loader2, Pencil, Save } from "lucide-react";

type AttendanceStatus = (typeof attendanceStatuses)[number];
type AttendanceSession = (typeof attendanceSessions)[number];
type DraftMap = Record<number, { status: AttendanceStatus; remarks: string }>;

const statusVariant: Record<AttendanceStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Present: "secondary",
  Absent: "destructive",
  Late: "outline",
  Excused: "default",
};

export default function TeacherAttendance() {
  const { toast } = useToast();
  const { data: classes = [], isLoading: classesLoading } = useTeacherClasses();
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedSession, setSelectedSession] = useState<AttendanceSession>("Full Day");
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState<AttendanceStatus>("Present");
  const [editingSession, setEditingSession] = useState<AttendanceSession>("Full Day");
  const [editingRemarks, setEditingRemarks] = useState("");

  const { data: students = [], isLoading: studentsLoading } = useTeacherAttendanceStudents(selectedClass || undefined);
  const { data: history = [], isLoading: historyLoading } = useTeacherAttendanceHistory({ className: selectedClass || undefined });
  const bulkUpsert = useTeacherBulkUpsertAttendance();
  const updateAttendance = useTeacherUpdateAttendance();

  useEffect(() => {
    if (!selectedClass && classes[0]?.className) {
      setSelectedClass(classes[0].className);
    }
  }, [classes, selectedClass]);

  const selectedSessionRecords = useMemo(
    () => history.filter((record) => record.date === selectedDate && record.session === selectedSession),
    [history, selectedDate, selectedSession],
  );

  const recentHistory = useMemo(
    () => [...history].sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id).slice(0, 12),
    [history],
  );

  useEffect(() => {
    if (students.length === 0) {
      setDrafts({});
      return;
    }

    const existing = new Map(selectedSessionRecords.map((record) => [record.studentId, record]));
    const next: DraftMap = {};
    students.forEach((student) => {
      next[student.id] = {
        status: existing.get(student.id)?.status ?? "Present",
        remarks: existing.get(student.id)?.remarks ?? "",
      };
    });
    setDrafts(next);
  }, [selectedSessionRecords, students]);

  const summary = useMemo(() => {
    const present = selectedSessionRecords.filter((record) => record.status === "Present").length;
    const absent = selectedSessionRecords.filter((record) => record.status === "Absent").length;
    const late = selectedSessionRecords.filter((record) => record.status === "Late").length;
    return {
      totalStudents: students.length,
      marked: selectedSessionRecords.length,
      present,
      absent,
      late,
    };
  }, [selectedSessionRecords, students.length]);

  const editingRecord = recentHistory.find((record) => record.id === editingRecordId) ?? null;

  const setAllStatuses = (status: AttendanceStatus) => {
    setDrafts((current) => {
      const next = { ...current };
      students.forEach((student) => {
        next[student.id] = { status, remarks: next[student.id]?.remarks ?? "" };
      });
      return next;
    });
  };

  const saveAttendance = async () => {
    if (!selectedClass || students.length === 0) return;
    try {
      await bulkUpsert.mutateAsync({
        className: selectedClass,
        date: selectedDate,
        session: selectedSession,
        records: students.map((student) => ({
          studentId: student.id,
          status: drafts[student.id]?.status ?? "Present",
          remarks: drafts[student.id]?.remarks.trim() || undefined,
        })),
      });
      toast({
        title: "Attendance saved",
        description: "Attendance was saved successfully. Duplicate entries were safely updated by class, date, and session.",
      });
    } catch (error) {
      toast({ title: "Unable to save attendance", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const openEditDialog = (recordId: number) => {
    const record = recentHistory.find((item) => item.id === recordId);
    if (!record) return;
    setEditingRecordId(record.id);
    setEditingStatus(record.status);
    setEditingSession(record.session);
    setEditingRemarks(record.remarks ?? "");
  };

  const saveEdit = async () => {
    if (!editingRecord) return;
    try {
      await updateAttendance.mutateAsync({
        id: editingRecord.id,
        status: editingStatus,
        session: editingSession,
        remarks: editingRemarks.trim() || null,
      });
      toast({ title: "Attendance updated", description: "The historical attendance record has been updated." });
      setEditingRecordId(null);
    } catch (error) {
      toast({ title: "Unable to update attendance", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Attendance</h1>
          <p className="mt-1 text-muted-foreground">Mark attendance by class and session, then review or edit recent history.</p>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Attendance Controls</CardTitle>
            <CardDescription>Select class, date, and session before saving. Re-saving updates the same attendance slot instead of creating duplicates.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Class</p>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((item) => <SelectItem key={item.className} value={item.className}>{item.className}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Date</p>
              <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Session</p>
              <Select value={selectedSession} onValueChange={(value: AttendanceSession) => setSelectedSession(value)}>
                <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
                <SelectContent>
                  {attendanceSessions.map((session) => <SelectItem key={session} value={session}>{session}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={saveAttendance} disabled={bulkUpsert.isPending || !selectedClass || students.length === 0}>
                {bulkUpsert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save attendance
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Students in class", value: summary.totalStudents },
            { label: "Marked for session", value: summary.marked },
            { label: "Present", value: summary.present },
            { label: "Needs attention", value: summary.absent + summary.late },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-3xl font-display font-bold">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Bulk Marking</CardTitle>
              <CardDescription>Update all students in one pass, including remarks for individual students.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {attendanceStatuses.map((status) => (
                <Button key={status} variant="outline" size="sm" onClick={() => setAllStatuses(status)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark all {status}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-6">Student</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classesLoading || studentsLoading ? (
                  <TableRow><TableCell colSpan={3} className="py-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
                ) : students.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No students were found for the selected class.</TableCell></TableRow>
                ) : (
                  students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="pl-6 font-medium">{student.name} <span className="text-muted-foreground">({student.className || selectedClass})</span></TableCell>
                      <TableCell>
                        <Select
                          value={drafts[student.id]?.status ?? "Present"}
                          onValueChange={(value: AttendanceStatus) => setDrafts((current) => ({
                            ...current,
                            [student.id]: { status: value, remarks: current[student.id]?.remarks ?? "" },
                          }))}
                        >
                          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Select status" /></SelectTrigger>
                          <SelectContent>
                            {attendanceStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Optional remarks"
                          value={drafts[student.id]?.remarks ?? ""}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [student.id]: { status: current[student.id]?.status ?? "Present", remarks: event.target.value },
                          }))}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Attendance History</CardTitle>
            <CardDescription>Recent attendance history for the selected class, including edit support.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-6">Date</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
                ) : recentHistory.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No attendance history found for this class yet.</TableCell></TableRow>
                ) : (
                  recentHistory.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="pl-6 font-medium">{formatDate(parseISO(record.date), "MMM dd, yyyy")}</TableCell>
                      <TableCell>{record.session}</TableCell>
                      <TableCell>{record.student?.name || `Student ${record.studentId}`}</TableCell>
                      <TableCell><Badge variant={statusVariant[record.status]}>{record.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{record.remarks || "—"}</TableCell>
                      <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => openEditDialog(record.id)}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</Button></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!editingRecordId} onOpenChange={(open) => !open && setEditingRecordId(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Edit Attendance Record</DialogTitle>
              <DialogDescription>Update the saved status, session, or remarks for this attendance entry.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                <p><span className="font-medium">Student:</span> {editingRecord?.student?.name || `Student ${editingRecord?.studentId ?? ""}`}</p>
                <p><span className="font-medium">Date:</span> {editingRecord?.date ?? "—"}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Status</p>
                  <Select value={editingStatus} onValueChange={(value: AttendanceStatus) => setEditingStatus(value)}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      {attendanceStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Session</p>
                  <Select value={editingSession} onValueChange={(value: AttendanceSession) => setEditingSession(value)}>
                    <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
                    <SelectContent>
                      {attendanceSessions.map((session) => <SelectItem key={session} value={session}>{session}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Remarks</p>
                <Textarea value={editingRemarks} onChange={(event) => setEditingRemarks(event.target.value)} placeholder="Optional remarks for this attendance record" />
              </div>
              <Button className="w-full" onClick={saveEdit} disabled={updateAttendance.isPending}>
                {updateAttendance.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
