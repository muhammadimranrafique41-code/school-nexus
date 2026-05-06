/**
 * promotions.tsx
 *
 * Admin page for Student Promotions.
 * Features:
 *  - Single student promotion (select student → select target class)
 *  - Bulk class promotion (source class → target class)
 *  - Promotion history viewer (by class)
 */

import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useClasses } from "@/hooks/use-classes";
import {
  useAcademicSessions,
  usePromoteStudent,
  useBulkPromote,
  useClassPromotionHistory,
  type AcademicSession,
  type PromotionHistoryItem,
  type BulkPromoteResult,
} from "@/hooks/use-sessions";
import { useStudents } from "@/hooks/use-users";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  History,
  Loader2,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────────────────────────────────────────

type ClassItem = {
  id: number;
  grade: string;
  section: string;
  stream?: string | null;
  academicYear: string;
  capacity: number;
  currentCount: number;
  status: string;
};

function classLabel(cls: ClassItem) {
  const base = `${cls.grade} ${cls.section}`;
  return cls.stream ? `${base} - ${cls.stream}` : base;
}

function classLabelWithYear(cls: ClassItem) {
  return `${classLabel(cls)} (${cls.academicYear})`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-PK", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────

const singlePromoteSchema = z.object({
  studentId: z.coerce.number().int().positive("Select a student"),
  toClassId: z.coerce.number().int().positive("Select a target class"),
  academicSessionId: z.coerce.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
  promotionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
});

const bulkPromoteSchema = z.object({
  fromClassId: z.coerce.number().int().positive("Select a source class"),
  toClassId: z.coerce.number().int().positive("Select a target class"),
  academicSessionId: z.coerce.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});

type SinglePromoteValues = z.infer<typeof singlePromoteSchema>;
type BulkPromoteValues = z.infer<typeof bulkPromoteSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Promotion history table
// ─────────────────────────────────────────────────────────────────────────────

function PromotionHistoryTable({
  items,
  isLoading,
  emptyMessage,
}: {
  items: PromotionHistoryItem[] | undefined;
  isLoading: boolean;
  emptyMessage?: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <History className="h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-500">{emptyMessage ?? "No promotion history found."}</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            {["Student", "From Class", "To Class", "Session", "Date", "By"].map((h) => (
              <th
                key={h}
                className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={item.id}
              className={cn(
                "border-b border-slate-50 transition-colors hover:bg-slate-50/60",
                idx % 2 === 0 ? "bg-white" : "bg-slate-50/30",
              )}
            >
              <td className="px-3 py-2.5 font-medium text-slate-800">
                {item.student?.name ?? `#${item.studentId}`}
              </td>
              <td className="px-3 py-2.5 text-slate-600">
                {item.fromClass
                  ? `${item.fromClass.grade} ${item.fromClass.section}${item.fromClass.stream ? ` - ${item.fromClass.stream}` : ""}`
                  : <span className="italic text-slate-400">—</span>}
              </td>
              <td className="px-3 py-2.5 text-slate-700">
                {item.toClass
                  ? `${item.toClass.grade} ${item.toClass.section}${item.toClass.stream ? ` - ${item.toClass.stream}` : ""}`
                  : `#${item.toClassId}`}
              </td>
              <td className="px-3 py-2.5 text-slate-600">
                {item.session?.name ?? <span className="italic text-slate-400">—</span>}
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{formatDate(item.promotionDate)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500">
                {item.promotedByUser?.name ?? <span className="italic">System</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk result summary dialog
// ─────────────────────────────────────────────────────────────────────────────

function BulkResultDialog({
  result,
  onClose,
}: {
  result: BulkPromoteResult | null;
  onClose: () => void;
}) {
  if (!result) return null;

  return (
    <Dialog open={!!result} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Promotion Complete</DialogTitle>
          <DialogDescription>
            {result.promotedCount} student{result.promotedCount !== 1 ? "s" : ""} promoted
            {result.skippedCount > 0 && `, ${result.skippedCount} skipped`}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700">
                {result.promotedCount} Promoted
              </span>
            </div>
            {result.skippedCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-700">
                  {result.skippedCount} Skipped
                </span>
              </div>
            )}
          </div>

          {result.skipped.length > 0 && (
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                Skipped Students
              </p>
              <ul className="space-y-1">
                {result.skipped.map((s) => (
                  <li key={s.studentId} className="flex items-start gap-2 text-xs text-amber-800">
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span>
                      <span className="font-medium">{s.name}</span> — {s.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single student promotion form
// ─────────────────────────────────────────────────────────────────────────────

function SinglePromoteForm({
  classes,
  sessions,
}: {
  classes: ClassItem[];
  sessions: AcademicSession[];
}) {
  const { toast } = useToast();
  const promoteMutation = usePromoteStudent();
  const { data: studentsData } = useStudents();
  const students = studentsData ?? [];

  const form = useForm<SinglePromoteValues>({
    resolver: zodResolver(singlePromoteSchema),
    defaultValues: {
      studentId: 0,
      toClassId: 0,
      notes: "",
      promotionDate: "",
    },
  });

  const onSubmit = async (values: SinglePromoteValues) => {
    try {
      const payload = {
        studentId: values.studentId,
        toClassId: values.toClassId,
        ...(values.academicSessionId ? { academicSessionId: values.academicSessionId } : {}),
        ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
        ...(values.promotionDate ? { promotionDate: values.promotionDate } : {}),
      };
      await promoteMutation.mutateAsync(payload);
      const student = students.find((s) => s.id === values.studentId);
      const cls = classes.find((c) => c.id === values.toClassId);
      toast({
        title: "Student promoted",
        description: `${student?.name ?? "Student"} has been moved to ${cls ? classLabel(cls) : "the new class"}.`,
      });
      form.reset();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Promotion failed",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Student selector */}
        <FormField
          control={form.control}
          name="studentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Student</FormLabel>
              <Select
                value={field.value ? String(field.value) : ""}
                onValueChange={(v) => field.onChange(Number(v))}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a student…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-60">
                  {students
                    .filter((s) => s.role === "student")
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                        {s.className ? (
                          <span className="ml-1.5 text-xs text-slate-400">({s.className})</span>
                        ) : null}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Target class */}
        <FormField
          control={form.control}
          name="toClassId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Promote To</FormLabel>
              <Select
                value={field.value ? String(field.value) : ""}
                onValueChange={(v) => field.onChange(Number(v))}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target class…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-60">
                  {classes
                    .filter((c) => c.status === "active")
                    .sort((a, b) => classLabel(a).localeCompare(classLabel(b)))
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {classLabelWithYear(c)}
                        <span className="ml-1.5 text-xs text-slate-400">
                          ({c.currentCount}/{c.capacity})
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          {/* Academic session (optional) */}
          <FormField
            control={form.control}
            name="academicSessionId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Session <span className="font-normal text-slate-400">(optional)</span>
                </FormLabel>
                <Select
                  value={field.value ? String(field.value) : ""}
                  onValueChange={(v) => field.onChange(v ? Number(v) : undefined)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Auto-detect" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                        {s.isCurrent && (
                          <span className="ml-1.5 text-xs text-emerald-600">(current)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Promotion date (optional) */}
          <FormField
            control={form.control}
            name="promotionDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Date <span className="font-normal text-slate-400">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Notes <span className="font-normal text-slate-400">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="e.g. Passed with distinction" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={promoteMutation.isPending} className="gap-2">
          {promoteMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          Promote Student
        </Button>
      </form>
    </Form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk promotion form
// ─────────────────────────────────────────────────────────────────────────────

function BulkPromoteForm({
  classes,
  sessions,
  onResult,
}: {
  classes: ClassItem[];
  sessions: AcademicSession[];
  onResult: (result: BulkPromoteResult) => void;
}) {
  const { toast } = useToast();
  const bulkMutation = useBulkPromote();

  const form = useForm<BulkPromoteValues>({
    resolver: zodResolver(bulkPromoteSchema),
    defaultValues: { fromClassId: 0, toClassId: 0, notes: "" },
  });

  const fromClassId = form.watch("fromClassId");
  const toClassId = form.watch("toClassId");

  const fromClass = classes.find((c) => c.id === fromClassId);
  const toClass = classes.find((c) => c.id === toClassId);

  const activeClasses = classes.filter((c) => c.status === "active");

  const onSubmit = async (values: BulkPromoteValues) => {
    try {
      const payload = {
        fromClassId: values.fromClassId,
        toClassId: values.toClassId,
        ...(values.academicSessionId ? { academicSessionId: values.academicSessionId } : {}),
        ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
      };
      const result = await bulkMutation.mutateAsync(payload);
      onResult(result);
      form.reset();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Bulk promotion failed",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Preview banner */}
        {fromClass && toClass && (
          <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-sm">
            <span className="font-semibold text-indigo-800">{classLabel(fromClass)}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-indigo-400" />
            <span className="font-semibold text-indigo-800">{classLabel(toClass)}</span>
            <span className="ml-auto text-xs text-indigo-500">
              {fromClass.currentCount} student{fromClass.currentCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* Source class */}
          <FormField
            control={form.control}
            name="fromClassId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>From Class</FormLabel>
                <Select
                  value={field.value ? String(field.value) : ""}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Source class…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-60">
                    {activeClasses
                      .sort((a, b) => classLabel(a).localeCompare(classLabel(b)))
                      .map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {classLabelWithYear(c)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Target class */}
          <FormField
            control={form.control}
            name="toClassId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>To Class</FormLabel>
                <Select
                  value={field.value ? String(field.value) : ""}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Target class…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-60">
                    {activeClasses
                      .filter((c) => c.id !== fromClassId)
                      .sort((a, b) => classLabel(a).localeCompare(classLabel(b)))
                      .map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {classLabelWithYear(c)}
                          <span className="ml-1.5 text-xs text-slate-400">
                            ({c.currentCount}/{c.capacity})
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Session */}
        <FormField
          control={form.control}
          name="academicSessionId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Academic Session <span className="font-normal text-slate-400">(optional)</span>
              </FormLabel>
              <Select
                value={field.value ? String(field.value) : ""}
                onValueChange={(v) => field.onChange(v ? Number(v) : undefined)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Auto-detect current session" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                      {s.isCurrent && (
                        <span className="ml-1.5 text-xs text-emerald-600">(current)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Notes <span className="font-normal text-slate-400">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="e.g. End of year promotion" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={bulkMutation.isPending || !fromClassId || !toClassId}
          className="gap-2"
        >
          {bulkMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Users className="h-4 w-4" />
          )}
          Bulk Promote Class
        </Button>
      </form>
    </Form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// History tab
// ─────────────────────────────────────────────────────────────────────────────

function HistoryTab({ classes }: { classes: ClassItem[] }) {
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const { data: history, isLoading } = useClassPromotionHistory(selectedClassId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select
          value={selectedClassId ? String(selectedClassId) : ""}
          onValueChange={(v) => setSelectedClassId(v ? Number(v) : null)}
        >
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Select a class to view history…" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {classes
              .sort((a, b) => classLabel(a).localeCompare(classLabel(b)))
              .map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {classLabelWithYear(c)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {selectedClassId && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-slate-500"
            onClick={() => setSelectedClassId(null)}
          >
            Clear
          </Button>
        )}
      </div>

      <PromotionHistoryTable
        items={history}
        isLoading={isLoading && !!selectedClassId}
        emptyMessage={
          selectedClassId
            ? "No promotion history for this class."
            : "Select a class above to view its promotion history."
        }
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPromotions() {
  const { data: classesData, isLoading: classesLoading } = useClasses();
  const { data: sessions = [] } = useAcademicSessions();
  const [bulkResult, setBulkResult] = useState<BulkPromoteResult | null>(null);

  const classes: ClassItem[] = useMemo(() => classesData?.data ?? [], [classesData]);

  const currentSession = sessions.find((s) => s.isCurrent);

  return (
    <Layout>
      <div className="space-y-5 pb-8">
        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Student Promotions</h1>
          <p className="text-sm text-slate-500">
            Promote students individually or bulk-promote an entire class to the next grade.
          </p>
          {currentSession && (
            <div className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              Active session: {currentSession.name}
            </div>
          )}
        </section>

        {/* ── Summary cards ───────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            {
              label: "Total Classes",
              value: classesLoading ? "—" : String(classes.length),
              icon: <GraduationCap className="h-4 w-4 text-indigo-500" />,
              bg: "bg-indigo-50",
            },
            {
              label: "Active Classes",
              value: classesLoading
                ? "—"
                : String(classes.filter((c) => c.status === "active").length),
              icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
              bg: "bg-emerald-50",
            },
            {
              label: "Academic Sessions",
              value: String(sessions.length),
              icon: <CalendarDays className="h-4 w-4 text-slate-400" />,
              bg: "bg-slate-50",
            },
          ].map((item) => (
            <Card key={item.label} className="border-slate-200/80 shadow-none">
              <CardContent className="flex items-center gap-3 p-4">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    item.bg,
                  )}
                >
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {item.label}
                  </p>
                  <p className="truncate text-base font-bold text-slate-900">{item.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* ── Tabs ─────────────────────────────────────────────────── */}
        <Card className="overflow-hidden border-slate-200/80 shadow-none">
          <CardHeader className="border-b border-slate-100 px-4 py-3">
            <CardTitle className="text-sm font-semibold text-slate-800">Promotion Tools</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Use the tabs below to promote students individually, in bulk, or review history.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {classesLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <Tabs defaultValue="single">
                <TabsList className="mb-4 grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
                  <TabsTrigger value="single" className="gap-1.5 text-xs">
                    <GraduationCap className="h-3.5 w-3.5" />
                    Single Student
                  </TabsTrigger>
                  <TabsTrigger value="bulk" className="gap-1.5 text-xs">
                    <Users className="h-3.5 w-3.5" />
                    Bulk Promote
                  </TabsTrigger>
                  <TabsTrigger value="history" className="gap-1.5 text-xs">
                    <History className="h-3.5 w-3.5" />
                    History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="single">
                  <SinglePromoteForm classes={classes} sessions={sessions} />
                </TabsContent>

                <TabsContent value="bulk">
                  <BulkPromoteForm
                    classes={classes}
                    sessions={sessions}
                    onResult={setBulkResult}
                  />
                </TabsContent>

                <TabsContent value="history">
                  <HistoryTab classes={classes} />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bulk result dialog ─────────────────────────────────────── */}
      <BulkResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />
    </Layout>
  );
}