import { lazy, Suspense } from "react";
import { GraduationCap } from "lucide-react";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ExamScheduleTab = lazy(() => import("./ExamScheduleTab").then((module) => ({ default: module.ExamScheduleTab })));
const MarkEntryTab = lazy(() => import("./MarkEntryTab").then((module) => ({ default: module.MarkEntryTab })));
const ResultsTab = lazy(() => import("./ResultsTab").then((module) => ({ default: module.ResultsTab })));
const MATSummaryTab = lazy(() => import("./MATSummaryTab").then((module) => ({ default: module.MATSummaryTab })));

function PageSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export default function ExaminationPage() {
  return (
    <Layout>
      <div className="space-y-5 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white"><GraduationCap className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Examination</h1>
            <p className="text-sm text-slate-500">Schedule exams, enter marks, and publish marksheets.</p>
          </div>
        </div>
        <Tabs defaultValue="schedule" className="space-y-4">
          <TabsList>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="marks">Mark Entry</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="mat">MAT Summary</TabsTrigger>
          </TabsList>
          <Suspense fallback={<PageSkeleton />}>
            <TabsContent value="schedule"><ExamScheduleTab /></TabsContent>
            <TabsContent value="marks"><MarkEntryTab /></TabsContent>
            <TabsContent value="results"><ResultsTab /></TabsContent>
            <TabsContent value="mat"><MATSummaryTab /></TabsContent>
          </Suspense>
        </Tabs>
      </div>
    </Layout>
  );
}
