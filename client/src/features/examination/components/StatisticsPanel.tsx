import { Card, CardContent } from "@/components/ui/card";
import type { ExamStatistics } from "../types";

export function StatisticsPanel({ statistics }: { statistics: ExamStatistics }) {
  const metrics = [
    ["Students", statistics.totalStudents],
    ["Appeared", statistics.appeared],
    ["Absent", statistics.absent],
    ["Class Avg", `${statistics.classAverage}%`],
    ["Pass Rate", `${statistics.passRate}%`],
    ["Highest", statistics.highestMarks],
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {metrics.map(([label, value]) => (
        <Card key={label} className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
