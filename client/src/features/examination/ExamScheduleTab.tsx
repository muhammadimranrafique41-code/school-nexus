import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClasses } from "@/hooks/use-classes";
import { useAcademicSessions } from "@/hooks/use-sessions";
import { ExamSessionCard } from "./components/ExamSessionCard";
import { ScheduleExamModal } from "./components/ScheduleExamModal";
import { useExamSessions } from "./hooks/useExamSessions";

type ClassOption = { id: number; grade: string; section: string; academicYear?: string };

export function ExamScheduleTab() {
  const { data: classData } = useClasses();
  const classes = (classData?.data ?? []) as ClassOption[];
  const { data: sessionsData = [] } = useAcademicSessions();
  const academicSessions = sessionsData as { id: number; name: string; isCurrent?: boolean }[];
  const [classId, setClassId] = useState<number | undefined>(undefined);
  const { data, isLoading } = useExamSessions(classId);
  const examSessions = data?.data ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Select value={classId ? String(classId) : "all"} onValueChange={(value) => setClassId(value === "all" ? undefined : Number(value))}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Filter by class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.grade} {item.section}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isLoading ? <div className="rounded-lg border bg-white p-6 text-sm text-slate-500">Loading exams...</div> : examSessions.map((session) => <ExamSessionCard key={session.id} session={session} />)}
        {!isLoading && !examSessions.length && <div className="rounded-lg border bg-white p-6 text-sm text-slate-500">No exam sessions found.</div>}
      </div>
      <aside className="rounded-lg border bg-white p-4">
        <ScheduleExamModal classes={classes} academicSessions={academicSessions} />
      </aside>
    </div>
  );
}
