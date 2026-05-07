import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulkMarksheetButton } from "./components/BulkMarksheetButton";
import { GradeDistributionChart } from "./components/GradeDistributionChart";
import { MarksheetPreviewModal } from "./components/MarksheetPreviewModal";
import { StatisticsPanel } from "./components/StatisticsPanel";
import { SubjectAverageChart } from "./components/SubjectAverageChart";
import { buildSingleMarksheetUrl } from "./hooks/useMarksheetPDF";
import { useExamSessions, useExamStatistics } from "./hooks/useExamSessions";

export function ResultsTab() {
  const { data: sessionsData } = useExamSessions();
  const sessions = sessionsData?.data ?? [];
  const [sessionId, setSessionId] = useState<number | undefined>();
  const { data: statisticsData } = useExamStatistics(sessionId);
  const statistics = statisticsData?.data;
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");

  return (
    <div className="space-y-5">
      <Select value={sessionId ? String(sessionId) : undefined} onValueChange={(value) => setSessionId(Number(value))}>
        <SelectTrigger className="w-80"><SelectValue placeholder="Select exam session" /></SelectTrigger>
        <SelectContent>{sessions.map((session) => <SelectItem key={session.id} value={String(session.id)}>{session.title}</SelectItem>)}</SelectContent>
      </Select>
      {statistics && (
        <>
          <StatisticsPanel statistics={statistics} />
          <div className="grid gap-4 lg:grid-cols-2">
            <GradeDistributionChart distribution={statistics.gradeDistribution} />
            <SubjectAverageChart subjects={statistics.subjectAverages} />
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Top Students & Marksheets</h3>
              {sessionId && <BulkMarksheetButton examSessionId={sessionId} studentIds={selectedStudents} />}
            </div>
            <Table>
              <TableHeader><TableRow><TableHead></TableHead><TableHead>Rank</TableHead><TableHead>Name</TableHead><TableHead>Obtained</TableHead><TableHead>%</TableHead><TableHead>Grade</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {statistics.topThree.map((student) => (
                  <TableRow key={student.studentId}>
                    <TableCell><Checkbox checked={selectedStudents.includes(student.studentId)} onCheckedChange={(checked) => setSelectedStudents((current) => checked ? [...current, student.studentId] : current.filter((id) => id !== student.studentId))} /></TableCell>
                    <TableCell>{student.rank}</TableCell><TableCell>{student.name}</TableCell><TableCell>{student.obtained}</TableCell><TableCell>{student.percentage}</TableCell><TableCell>{student.grade}</TableCell>
                    <TableCell>{sessionId && <Button variant="ghost" size="icon" onClick={() => setPreviewUrl(buildSingleMarksheetUrl(sessionId, student.studentId))}><Eye className="h-4 w-4" /></Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <MarksheetPreviewModal open={Boolean(previewUrl)} onOpenChange={(open) => !open && setPreviewUrl("")} url={previewUrl} />
    </div>
  );
}
