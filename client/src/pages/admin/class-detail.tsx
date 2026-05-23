import { Layout } from "@/components/layout";
import { ClassTeachersTab } from "@/components/ClassTeachersTab";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useClasses } from "@/hooks/use-classes";
import { paginateItems } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useRoute } from "wouter";

export default function AdminClassDetail() {
  const [match, params] = useRoute("/admin/classes/:id");
  const classId = params?.id ? Number.parseInt(params.id, 10) : Number.NaN;

  const { data, isLoading } = useClasses();
  const classes = data?.data ?? [];
  const current = classes.find((item) => item.id === classId);

  if (!match || Number.isNaN(classId)) {
    return (
      <Layout>
        <div className="py-10 text-center text-muted-foreground">Invalid class URL.</div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!current) {
    return (
      <Layout>
        <div className="py-10 text-center text-muted-foreground">Class not found.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold">
                {current.grade} {current.section}
              </h1>
              <p className="mt-1 text-muted-foreground">
                Academic year {current.academicYear}. Capacity {current.currentCount}/{current.capacity}.
              </p>
            </div>
          </div>
          <Badge variant={current.status === "active" ? "outline" : "secondary"}>{current.status}</Badge>
        </div>

        <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold mb-4">Class teachers</h2>
            <ClassTeachersTab classId={classId} />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

