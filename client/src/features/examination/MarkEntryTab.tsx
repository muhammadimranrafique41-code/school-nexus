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
  
  // Fetch all exam sessions (not filtered by class)
  const { data: allSessionsData } = useExamSessions();
  const allSessions = allSessionsData?.data ?? [];
  
  // Also fetch sessions for selected class (for filtering if needed)
  const { data: classSessionsData } = useExamSessions(classId);
  const classSessions = classSessionsData?.data ?? [];
  
  // Use all sessions if no class is selected, otherwise use filtered sessions
  const sessions = classId ? classSessions : allSessions;
  
  const selectedSession = sessions.find((session) => session.id === sessionId);
  const selectedSubject = selectedSession?.subjects.find((subject) => subject.id === subjectId);
  const { data: marksData, isLoading, error } = useExamMarks(subjectId);
  const [rows, setRows] = useState<MarkEntryStudent[]>([]);
  const saveMarks = useSaveExamMarks(subjectId);
  const { toast } = useToast();

  useEffect(() => {
    if (marksData?.data) {
      setRows(marksData.data);
    } else if (!isLoading && subjectId) {
      setRows([]);
    }
  }, [marksData, isLoading, subjectId]);

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
    const session = allSessions.find((item: ExamSession) => item.id === id);
    
    // Auto-populate class based on selected exam session
    if (session) {
      setClassId(session.classId);
      setSubjectId(session.subjects[0]?.id);
    }
  };
  
  const changeClass = (id: number) => {
    setClassId(id);
    // Clear session and subject when class changes
    setSessionId(undefined);
    setSubjectId(undefined);
  };

  return (
    <div className="space-y-4">
      <MarkEntryToolbar
        classes={classes}
        sessions={sessions}
        classId={classId}
        sessionId={sessionId}
        subjectId={subjectId}
        selectedSession={selectedSession}
        onClassChange={changeClass}
        onSessionChange={changeSession}
        onSubjectChange={setSubjectId}
        onSave={save}
        onImportClick={() => document.querySelector<HTMLButtonElement>("[data-import-csv]")?.click()}
        saving={saveMarks.isPending}
      />
      <MarkEntryGrid 
        rows={rows} 
        subject={selectedSubject} 
        onChange={setRows} 
        isLoading={isLoading}
        error={error?.message}
      />
    </div>
  );
}
