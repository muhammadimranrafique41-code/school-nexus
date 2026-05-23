import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useSubjects, useCreateSubject, useUpdateSubject, useDeleteSubject } from "@/hooks/use-subjects";
import type { Subject } from "@/hooks/use-subjects";
import { applyDocumentBranding, getCachedPublicSchoolSettings } from "@/lib/utils";
import { BookMarked, Loader2, Plus, Search, Pencil, Trash2, Hash } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateSubjectSchema, UpdateSubjectSchema } from "@/lib/validators/classes";
import type { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Subject form dialog ───────────────────────────────────────────────────────

type SubjectFormValues = z.infer<typeof CreateSubjectSchema>;

function SubjectFormDialog({
  open,
  onOpenChange,
  subject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject?: Subject;
}) {
  const { toast } = useToast();
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const isEdit = Boolean(subject);

  const form = useForm<SubjectFormValues>({
    resolver: zodResolver(CreateSubjectSchema),
    defaultValues: {
      name: subject?.name ?? "",
      code: subject?.code ?? "",
      description: subject?.description ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: subject?.name ?? "",
        code: subject?.code ?? "",
        description: subject?.description ?? "",
      });
    }
  }, [open, subject]);

  const onSubmit = async (values: SubjectFormValues) => {
    try {
      if (isEdit && subject) {
        await updateSubject.mutateAsync({ id: subject.id, ...values });
        toast({ title: "Subject updated", description: `"${values.name}" has been updated.` });
      } else {
        await createSubject.mutateAsync(values);
        toast({ title: "Subject created", description: `"${values.name}" has been added.` });
      }
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: isEdit ? "Unable to update subject" : "Unable to create subject",
        description: error?.message ?? "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const isPending = createSubject.isPending || updateSubject.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {isEdit ? "Edit subject" : "Add new subject"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 pt-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-slate-700">
                    Subject name <span className="text-rose-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input className="h-8 text-sm" placeholder="e.g. Mathematics" {...field} />
                  </FormControl>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-slate-700">
                    Subject code <span className="text-slate-400">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input className="h-8 text-sm" placeholder="e.g. MATH-101" {...field} />
                  </FormControl>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-slate-700">
                    Description <span className="text-slate-400">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[72px] resize-none text-sm"
                      placeholder="Brief description of the subject…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />

            {/* Preview chip */}
            {form.watch("name") && (
              <div className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2">
                <BookMarked className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                <span className="text-[12px] font-semibold text-violet-700">
                  {form.watch("name")}
                  {form.watch("code") ? ` · ${form.watch("code")}` : ""}
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isEdit ? (
                  "Save changes"
                ) : (
                  "Add subject"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSubjects() {
  const settings = getCachedPublicSchoolSettings();
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editSubject, setEditSubject] = useState<Subject | undefined>();
  const [deleteSubject, setDeleteSubject] = useState<Subject | undefined>();
  const { toast } = useToast();

  const { data: subjects = [], isLoading } = useSubjects();
  const deleteSubjectMutation = useDeleteSubject();

  useEffect(() => {
    applyDocumentBranding(settings, "Subjects");
  }, [settings]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return subjects;
    return subjects.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.code ?? "").toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q),
    );
  }, [subjects, search]);

  const handleDelete = async () => {
    if (!deleteSubject) return;
    try {
      await deleteSubjectMutation.mutateAsync(deleteSubject.id);
      toast({ title: "Subject deleted", description: `"${deleteSubject.name}" has been removed.` });
      setDeleteSubject(undefined);
    } catch (error: any) {
      toast({
        title: "Unable to delete subject",
        description: error?.message ?? "Something went wrong",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-4 p-4 md:p-6">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 text-white shadow-md shadow-violet-200">
              <BookMarked className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Subjects</h1>
              <p className="text-[12px] text-slate-400">
                Manage the school's subject catalogue — used across timetables, homework, and exams.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setIsCreateOpen(true)} className="self-start sm:self-auto">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add subject
          </Button>
        </section>

        {/* ── KPI strip ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            {
              label: "Total subjects",
              value: subjects.length,
              icon: BookMarked,
              color: "text-violet-600 bg-violet-50",
              border: "border-violet-100",
            },
            {
              label: "With codes",
              value: subjects.filter((s) => s.code).length,
              icon: Hash,
              color: "text-sky-600 bg-sky-50",
              border: "border-sky-100",
            },
            {
              label: "Showing",
              value: filtered.length,
              icon: Search,
              color: "text-emerald-600 bg-emerald-50",
              border: "border-emerald-100",
            },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-4 text-center shadow-sm",
                item.border,
              )}
            >
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", item.color)}>
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none text-slate-900">{item.value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {item.label}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Table card ──────────────────────────────────────────────── */}
        <Card className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          {/* Toolbar */}
          <CardHeader className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900">Subject catalogue</CardTitle>
              <CardDescription className="text-[11px]">
                {filtered.length} subject{filtered.length !== 1 ? "s" : ""}
                {search ? " matching your search" : " in total"}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search subjects…"
                className="h-8 pl-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>

          {/* Table */}
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[500px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Subject", "Code", "Description", ""].map((h, i) => (
                    <th
                      key={i}
                      className={cn(
                        "px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400",
                        i === 0 && "pl-4 text-left",
                        i === 3 && "pr-4 text-right",
                        i > 0 && i < 3 && "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="py-14 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-violet-500" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-14 text-center text-[13px] text-slate-400">
                      {search ? "No subjects match your search." : "No subjects yet. Add your first subject above."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={cn(
                        "group border-b border-slate-100 last:border-b-0 transition-colors hover:bg-violet-50/30",
                        idx % 2 === 1 && "bg-slate-50/30",
                      )}
                    >
                      {/* Subject name */}
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-[11px] font-bold text-violet-600">
                            {item.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-[13px] font-semibold text-slate-900">{item.name}</span>
                        </div>
                      </td>

                      {/* Code */}
                      <td className="px-3 py-2.5">
                        {item.code ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-sky-100 bg-sky-50 px-2 py-0.5 text-[11px] font-mono font-semibold text-sky-700">
                            <Hash className="h-2.5 w-2.5" />
                            {item.code}
                          </span>
                        ) : (
                          <span className="text-[12px] text-slate-300">—</span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="px-3 py-2.5 max-w-xs">
                        {item.description ? (
                          <span className="line-clamp-1 text-[12px] text-slate-500">{item.description}</span>
                        ) : (
                          <span className="text-[12px] text-slate-300">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 pl-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600"
                            onClick={() => setEditSubject(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                            onClick={() => setDeleteSubject(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ── Create dialog ────────────────────────────────────────────── */}
      <SubjectFormDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
        }}
      />

      {/* ── Edit dialog ──────────────────────────────────────────────── */}
      <SubjectFormDialog
        open={Boolean(editSubject)}
        onOpenChange={(open) => {
          if (!open) setEditSubject(undefined);
        }}
        subject={editSubject}
      />

      {/* ── Delete confirmation ──────────────────────────────────────── */}
      <AlertDialog open={Boolean(deleteSubject)} onOpenChange={(open) => { if (!open) setDeleteSubject(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subject?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>"{deleteSubject?.name}"</strong> from the subject catalogue.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={handleDelete}
              disabled={deleteSubjectMutation.isPending}
            >
              {deleteSubjectMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
