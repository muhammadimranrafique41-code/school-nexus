import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClasses } from "@/hooks/use-classes";
import { useCurrentAcademicSession } from "@/hooks/use-sessions";
import { MATAggregateTable } from "./components/MATAggregateTable";
import { useMATAggregate } from "./hooks/useMATAggregate";

type ClassOption = { id: number; grade: string; section: string; stream?: string | null };

export function MATSummaryTab() {
  const { data: classData } = useClasses();
  const classes = (classData?.data ?? []) as ClassOption[];
  const { data: currentSession } = useCurrentAcademicSession();
  const [classId, setClassId] = useState<number | undefined>();
  const { data } = useMATAggregate(classId, currentSession?.id, 5, 50);
  return (
    <div className="space-y-4">
      <Select value={classId ? String(classId) : undefined} onValueChange={(value) => setClassId(Number(value))}>
        <SelectTrigger className="w-56"><SelectValue placeholder="Select class" /></SelectTrigger>
        <SelectContent>{classes.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.grade} {item.section}</SelectItem>)}</SelectContent>
      </Select>
      <MATAggregateTable rows={data?.data ?? []} />
    </div>
  );
}
