import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useCancelHomework, useTeacherHomework, useTeacherHomeworkClasses } from "@/hooks/use-homework";
import { HomeworkStatCard } from "@/components/homework/stat-card";
import { PriorityBadge } from "@/components/homework/priority-badge";
import { SubjectChip } from "@/components/homework/subject-chip";
import { StatusBadge } from "@/components/homework/status-badge";
import { HomeworkEmptyState } from "@/components/homework/empty-state";
import { BookOpen, CalendarDays, Clock, TrendingUp, Star, Eye, Pencil, XCircle, Plus, X } from "lucide-react";

const statusTabs = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export default function TeacherHomeworkDashboard() {
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [page, setPage] = useState(1);
  const [dueDateFilter, setDueDateFilter] = useState<Date | undefined>();

  const { data: classPayload } = useTeacherHomeworkClasses();
  const classes = classPayload?.data ?? [];

  const filters = useMemo(() => ({
    classId: selectedClass === "all" ? undefined : Number(selectedClass),
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    limit: 12,
  }), [page, selectedClass, statusFilter]);

  const { data, isLoading } = useTeacherHomework(filters);
  const cancelHomework = useCancelHomework();

  const homework = data?.data ?? [];
  const meta = data?.meta ?? {};
  const total = typeof meta.total === "number" ? meta.total : homework.length;
  const totalPages = Math.max(1, Math.ceil(total / (filters.limit ?? 12)));

  const filteredHomework = useMemo(() => {
    if (!dueDateFilter) return homework;
    const target = format(dueDateFilter, "yyyy-MM-dd");
    return homework.filter((item) => format(new Date(item.dueDate), "yyyy-MM-dd") === target);
  }, [dueDateFilter, homework]);

  const stats = useMemo(() => {
    const active = filteredHomework.filter((item) => item.status === "active");
    const totalSubmissions = active.reduce((sum, item) => sum + item.submissionCount, 0);
    const totalCapacity = active.reduce((sum, item) => sum + item.classSize, 0);
    const averageMarks = filteredHomework
      .map((item) => item.averageMarks)
      .filter((value): value is number => typeof value === "number");

    return {
      activeCount: active.length,
      pendingSubmissions: active.reduce((sum, item) => sum + Math.max(item.classSize - item.submissionCount, 0), 0),
      submissionRate: totalCapacity ? Math.round((totalSubmissions / totalCapacity) * 100) : 0,
      classAverageMarks: averageMarks.length ? Math.round(averageMarks.reduce((sum, mark) => sum + mark, 0) / averageMarks.length) : null,
    };
  }, [filteredHomework]);

  return (
    <Layout>
      <div className="space-y-8">
        <div className="rounded-[2.5rem] border border-white/60 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-8 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-500">Teacher-only workspace</p>
              <h1 className="mt-3 text-3xl font-display font-bold text-slate-900">Homework Diary</h1>
              <p className="mt-2 text-sm text-slate-500">Organize assignments, track submissions, and keep every class aligned.</p>
            </div>
            <Button asChild className="h-11 rounded-full px-6">
              <Link href="/teacher/homework/new">
                <Plus className="mr-2 h-4 w-4" /> New Assignment
              </Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <HomeworkStatCard
              title="Active assignments"
              value={stats.activeCount}
              icon={BookOpen}
              gradient="from-blue-500 to-indigo-500"
              iconClass=""
            />
            <HomeworkStatCard
              title="Pending submissions"
              value={stats.pendingSubmissions}
              icon={Clock}
              gradient="from-violet-500 to-purple-500"
              iconClass=""
            />
            <HomeworkStatCard
              title="Submission rate"
              value={`${stats.submissionRate}%`}
              icon={TrendingUp}
              gradient="from-emerald-500 to-green-500"
              iconClass=""
            />
            <HomeworkStatCard
              title="Class average marks"
              value={stats.classAverageMarks === null ? "N/A" : `${stats.classAverageMarks}%`}
              icon={Star}
              gradient="from-amber-500 to-orange-500"
              iconClass=""
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Assignments</h2>
            <p className="text-sm text-slate-500">Filter homework by class, status, and due date.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedClass} onValueChange={(value) => { setSelectedClass(value); setPage(1); }}>
              <SelectTrigger className="w-[220px] bg-white/80">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 bg-white/80">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  {dueDateFilter ? format(dueDateFilter, "dd-MMM-yyyy") : "All dates"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={dueDateFilter}
                  onSelect={(date) => { setDueDateFilter(date ?? undefined); setPage(1); }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {dueDateFilter ? (
              <Button variant="ghost" className="gap-2 text-slate-500" onClick={() => setDueDateFilter(undefined)}>
                <X className="h-4 w-4" /> Clear date
              </Button>
            ) : null}
            <Tabs value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
              <TabsList className="bg-white/80">
                {statusTabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="capitalize">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>

        <Card className="border-white/60 bg-white/80">
          <div className="space-y-4 p-4 md:p-6">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-28 w-full rounded-2xl" />
                ))}
              </div>
            ) : filteredHomework.length === 0 ? (
              <HomeworkEmptyState ctaHref="/teacher/homework/new" />
            ) : (
              filteredHomework.map((item) => {
                const progressValue = item.classSize ? Math.round((item.submissionCount / item.classSize) * 100) : 0;
                const dueLabel = formatDistanceToNow(new Date(item.dueDate), { addSuffix: true });
                return (
                  <div key={item.id} className="group rounded-2xl border border-slate-200/70 bg-white/70 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <PriorityBadge priority={item.priority} />
                          <SubjectChip subject={item.subject} />
                          <StatusBadge status={item.status} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.description || "No instructions provided yet."}</p>
                        </div>
                        <p className="text-sm text-slate-500">
                          {item.classLabel} - Due {dueLabel}
                        </p>
                      </div>

                      <div className="flex flex-col gap-4 lg:w-[280px]">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                            <span>{item.submissionCount} submitted</span>
                            <span>{item.classSize} total</span>
                          </div>
                          <Progress value={progressValue} className="h-2" />
                        </div>

                        <div className="flex items-center gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          <Button asChild variant="outline" size="sm" className="flex-1">
                            <Link href={`/teacher/homework/${item.id}/submissions`}>
                              <Eye className="mr-2 h-4 w-4" /> Submissions
                            </Link>
                          </Button>
                          <Button asChild variant="outline" size="sm" className="flex-1">
                            <Link href={`/teacher/homework/${item.id}/edit`}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-rose-600 hover:text-rose-700"
                            onClick={() => cancelHomework.mutate(item.id)}
                            disabled={cancelHomework.isPending}
                            aria-label="Cancel assignment"
                          >
                            <XCircle className="mr-2 h-4 w-4" /> Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((prev) => Math.max(prev - 1, 1))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
