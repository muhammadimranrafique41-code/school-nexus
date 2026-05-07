import { CalendarDays, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ExamSession } from "../types";

export function ExamSessionCard({ session }: { session: ExamSession }) {
  return (
    <Card className="rounded-lg border-slate-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{session.title}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {session.className} · {session.academicYear}
            </p>
          </div>
          <Badge variant="outline">{session.examType}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date(session.startDate).toLocaleDateString()} - {new Date(session.endDate).toLocaleDateString()}
          </span>
          {session.isResultDeclared && (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Declared
            </span>
          )}
        </div>
        <div className="mt-3 text-xs text-slate-500">
          {session.subjects.length} subjects · {session.totalMarks} marks · pass {session.passingMarks}
        </div>
      </CardContent>
    </Card>
  );
}
