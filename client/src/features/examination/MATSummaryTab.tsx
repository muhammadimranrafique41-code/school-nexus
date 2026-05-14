import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClasses } from "@/hooks/use-classes";
import { useAcademicSessions, useCurrentAcademicSession } from "@/hooks/use-sessions";
import { MATAggregateTable } from "./components/MATAggregateTable";
import { useMATAggregate } from "./hooks/useMATAggregate";

type ClassOption = { id: number; grade: string; section: string };

export function MATSummaryTab() {
  const { data: classData } = useClasses();
  const classes = (classData?.data ?? []) as ClassOption[];

  // Load all academic sessions so the user can pick one
  const { data: allSessions = [] } = useAcademicSessions();
  // Also try to get the current session for auto-selection
  const { data: currentSession } = useCurrentAcademicSession();

  const [classId, setClassId] = useState<number | undefined>();
  const [academicSessionId, setAcademicSessionId] = useState<number | undefined>();

  // Auto-select the current (or most recent) academic session once loaded
  useEffect(() => {
    if (academicSessionId) return; // already set by user or previous effect
    if (currentSession?.id) {
      setAcademicSessionId(currentSession.id);
    } else if (allSessions.length > 0) {
      // Fall back to the first session in the list (most recent, since list is ordered desc)
      setAcademicSessionId(allSessions[0].id);
    }
  }, [currentSession, allSessions, academicSessionId]);

  const { data } = useMATAggregate(classId, academicSessionId, 5, 50);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Academic Session selector */}
        <Select
          value={academicSessionId ? String(academicSessionId) : undefined}
          onValueChange={(value) => setAcademicSessionId(Number(value))}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Academic Year" />
          </SelectTrigger>
          <SelectContent>
            {allSessions.map((session) => (
              <SelectItem key={session.id} value={String(session.id)}>
                {session.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Class selector */}
        <Select
          value={classId ? String(classId) : undefined}
          onValueChange={(value) => setClassId(Number(value))}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select class" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.grade} {item.section}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!classId || !academicSessionId ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-slate-500">
          Select a class and academic year to view the MAT summary.
        </div>
      ) : (
        <MATAggregateTable rows={data?.data ?? []} />
      )}
    </div>
  );
}
