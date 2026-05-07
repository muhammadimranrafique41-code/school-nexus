import { Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ExamSession } from "../types";

type ClassOption = { id: number; grade: string; section: string; stream?: string | null };

export function MarkEntryToolbar({
  classes,
  sessions,
  classId,
  sessionId,
  subjectId,
  onClassChange,
  onSessionChange,
  onSubjectChange,
  onSave,
  onImportClick,
  saving,
}: {
  classes: ClassOption[];
  sessions: ExamSession[];
  classId?: number;
  sessionId?: number;
  subjectId?: number;
  onClassChange: (id: number) => void;
  onSessionChange: (id: number) => void;
  onSubjectChange: (id: number) => void;
  onSave: () => void;
  onImportClick: () => void;
  saving: boolean;
}) {
  const session = sessions.find((item) => item.id === sessionId);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3">
      <Select value={classId ? String(classId) : undefined} onValueChange={(value) => onClassChange(Number(value))}>
        <SelectTrigger className="w-44"><SelectValue placeholder="Class" /></SelectTrigger>
        <SelectContent>{classes.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.grade} {item.section}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={sessionId ? String(sessionId) : undefined} onValueChange={(value) => onSessionChange(Number(value))}>
        <SelectTrigger className="w-64"><SelectValue placeholder="Exam" /></SelectTrigger>
        <SelectContent>{sessions.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.title}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={subjectId ? String(subjectId) : undefined} onValueChange={(value) => onSubjectChange(Number(value))}>
        <SelectTrigger className="w-56"><SelectValue placeholder="Subject" /></SelectTrigger>
        <SelectContent>{session?.subjects.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.subjectName}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="outline" onClick={onImportClick}><Upload className="mr-2 h-4 w-4" />Import CSV</Button>
      <Button onClick={onSave} disabled={!subjectId || saving}><Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save All"}</Button>
    </div>
  );
}
