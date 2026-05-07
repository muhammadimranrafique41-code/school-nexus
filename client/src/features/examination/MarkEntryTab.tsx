import { useEffect, useState } from "react";
import { useClasses } from "@/hooks/use-classes";
import { useToast } from "@/hooks/use-toast";
import { MarkEntryGrid } from "./components/MarkEntryGrid";
import { MarkEntryToolbar } from "./components/MarkEntryToolbar";
import { useExamMarks, useSaveExamMarks } from "./hooks/useExamMarks";
import { useExamSessions } from "./hooks/useExamSessions";
import type { ExamSession, MarkEntryStudent } from "./types";

type ClassOption = { id: number; grade: string; section: string; stream?: string | null };

export function MarkEntryTab() {
  const { data: classData } = useClasses();
  const classes = (classData?.data ?? []) as ClassOption[];
  const [classId, setClassId] = useState<number | undefined>();
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [subjectId, setSubjectId] = useState<number | undefined>();
  const { data: sessionsData } = useExamSessions(classId);
  const sessions = sessionsData?.data ?? [];
  const selectedSession = sessions.find((session) => session.id === sessionId);
  const selectedSubject = selectedSession?.subjects.find((subject) => subject.id === subjectId);
  const { data: marksData } = useExamMarks(subjectId);
  const [rows, setRows] = useState<MarkEntryStudent[]>([]);
  const saveMarks = useSaveExamMarks(subjectId);
  const { toast } = useToast();

  useEffect(() => setRows(marksData?.data ?? []), [marksData]);

  const save = () => {
    saveMarks.mutate(
      rows.map((row) => ({
        studentId: row.studentId,
        theoryMarks: row.theoryMarks ?? undefined,
        practicalMarks: row.practicalMarks ?? undefined,
        isAbsent: row.isAbsent,
        remarks: row.remarks ?? undefined,
      })),
      {
        onSuccess: () => toast({ title: "Marks saved" }),
        onError: (error) => toast({ title: "Could not save marks", description: error.message, variant: "destructive" }),
      }
    );
  };

  const changeSession = (id: number) => {
    setSessionId(id);
    const session = sessions.find((item: ExamSession) => item.id === id);
    setSubjectId(session?.subjects[0]?.id);
  };

  return (
    <div className="space-y-4">
      <MarkEntryToolbar
        classes={classes}
        sessions={sessions}
        classId={classId}
        sessionId={sessionId}
        subjectId={subjectId}
        onClassChange={(id) => {
          setClassId(id);
          setSessionId(undefined);
          setSubjectId(undefined);
        }}
        onSessionChange={changeSession}
        onSubjectChange={setSubjectId}
        onSave={save}
        onImportClick={() => document.querySelector<HTMLButtonElement>("[data-import-csv]")?.click()}
        saving={saveMarks.isPending}
      />
      <MarkEntryGrid rows={rows} subject={selectedSubject} onChange={setRows} />
    </div>
  );
}
