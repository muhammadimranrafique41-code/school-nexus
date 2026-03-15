import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, CalendarDays, CheckCircle2, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge } from "@/components/homework/priority-badge";
import { StatusBadge } from "@/components/homework/status-badge";
import { SubjectChip } from "@/components/homework/subject-chip";
import { useStudentTeacherHomework } from "@/hooks/use-homework";

const PAGE_SIZE = 10;

export default function StudentTeacherHomeworkPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useStudentTeacherHomework({ status: "active", page, limit: PAGE_SIZE });

  const homework = data?.data ?? [];
  const meta = data?.meta ?? {};
  const total = typeof meta.total === "number" ? meta.total : homework.length;
  const classLabel = typeof meta.classLabel === "string" ? meta.classLabel : "Your class";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const summary = useMemo(() => ({
    total,
    pending: homework.filter((item) => !item.submittedAt).length,
  }), [homework, total]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-lg shadow-slate-200/70 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 text-white">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Teacher Assignments</p>
                <h1 className="text-2xl font-display font-bold text-slate-900">Homework from teachers</h1>
                <p className="text-sm text-slate-500">{classLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-semibold">
                {summary.total} total
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-semibold text-amber-600">
                {summary.pending} pending
              </Badge>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={`skeleton-${index}`} className="space-y-4 p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-16" />
                </div>
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
              </Card>
            ))}
          </div>
        ) : homework.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center text-slate-500">
            <ClipboardList className="h-10 w-10 text-slate-400" />
            <p className="text-base font-semibold text-slate-700">No homework from teachers yet</p>
            <p className="text-sm text-slate-500">When your teachers assign new work, it will appear here.</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {homework.map((item) => {
              const dueLabel = formatDistanceToNow(new Date(item.dueDate), { addSuffix: true });
              const submitted = Boolean(item.submittedAt);

              return (
                <Card key={item.id} className="flex flex-col gap-4 p-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <SubjectChip subject={item.subject} />
                    <PriorityBadge priority={item.priority} />
                    <StatusBadge status={item.status} />
                    <Badge variant={submitted ? "secondary" : "outline"} className="rounded-full px-3 py-1 text-xs font-semibold">
                      {submitted ? "Submitted" : "Pending"}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
                    {item.description ? (
                      <p className="text-sm text-slate-500">{item.description}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      Due {dueLabel}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      {item.teacherName ? `Teacher: ${item.teacherName}` : "Teacher assigned"}
                    </span>
                    {submitted ? (
                      <span className="inline-flex items-center gap-2 text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        {item.marks !== null && item.marks !== undefined ? `Marks: ${item.marks}` : "Submitted"}
                      </span>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
            Previous
          </Button>
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </p>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
