import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClasses, useCreateClass } from "@/hooks/use-classes";
import { applyDocumentBranding, getCachedPublicSchoolSettings, paginateItems } from "@/lib/utils";
import { BookOpen, Loader2, Plus, Search, Users, BarChart2, CheckCircle2, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateClassSchema } from "@/lib/validators/classes";
import type { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

// ── Capacity bar ─────────────────────────────────────────────────────────
function CapacityBar({ current, capacity }: { current: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min((current / capacity) * 100, 100) : 0;
  const color =
    pct >= 90 ? "bg-rose-400" :
      pct >= 70 ? "bg-amber-400" :
        "bg-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[12px] font-semibold text-slate-700">{current}/{capacity}</span>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  return status === "active" ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
      <CheckCircle2 className="h-2.5 w-2.5" />Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
      {status}
    </span>
  );
}

export default function AdminClasses() {
  const settings = getCachedPublicSchoolSettings();
  const [gradeFilter, setGradeFilter] = useState("all");
  const [searchYear, setSearchYear] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();

  const filters = useMemo(() => ({
    academicYear: searchYear || undefined,
    grade: gradeFilter === "all" ? undefined : gradeFilter,
  }), [gradeFilter, searchYear]);

  const { data, isLoading } = useClasses(filters);
  const createClass = useCreateClass();
  const classes = data?.data ?? [];

  useEffect(() => { applyDocumentBranding(settings, "Classes"); }, [settings]);
  useEffect(() => { setCurrentPage(1); }, [gradeFilter, searchYear]);

  const gradeOptions = useMemo(
    () => Array.from(new Set(classes.map((c) => c.grade))).sort(),
    [classes],
  );

  const paginated = paginateItems(classes, currentPage, PAGE_SIZE);

  const summary = useMemo(() => {
    const active = classes.filter((c) => c.status === "active");
    const capacity = active.reduce((s, c) => s + c.capacity, 0);
    const enrolled = active.reduce((s, c) => s + c.currentCount, 0);
    return { total: classes.length, active: active.length, capacity, enrolled };
  }, [classes]);

  const form = useForm<z.infer<typeof CreateClassSchema>>({
    resolver: zodResolver(CreateClassSchema),
    defaultValues: {
      grade: "", section: "", stream: "",
      academicYear: settings?.academicConfiguration.currentAcademicYear ?? "",
      capacity: 40,
    },
  });

  const onSubmit = async (values: z.infer<typeof CreateClassSchema>) => {
    try {
      await createClass.mutateAsync(values);
      setSearchYear(values.academicYear);
      toast({ title: "Class created", description: "The class has been created successfully." });
      setIsCreateOpen(false);
      form.reset({ grade: "", section: "", stream: "", academicYear: values.academicYear, capacity: 40 });
    } catch (error: any) {
      toast({ title: "Unable to create class", description: error?.message ?? "Something went wrong", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-4 pb-8">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Classes</h1>
              <p className="text-[12px] text-slate-400">View and manage classes by grade, section, stream, and academic year.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setIsCreateOpen(true)} className="self-start sm:self-auto">
            <Plus className="mr-1.5 h-3.5 w-3.5" />New class
          </Button>
        </section>

        {/* ── KPI strip ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total classes", value: summary.total, icon: BookOpen, color: "text-indigo-600 bg-indigo-50", border: "border-indigo-100" },
            { label: "Active classes", value: summary.active, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50", border: "border-emerald-100" },
            { label: "Enrolled students", value: summary.enrolled, icon: Users, color: "text-sky-600 bg-sky-50", border: "border-sky-100" },
            { label: "Total capacity", value: summary.capacity, icon: BarChart2, color: "text-amber-600 bg-amber-50", border: "border-amber-100" },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border bg-white px-3 py-4 text-center shadow-none",
                item.border,
              )}
            >
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", item.color)}>
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none text-slate-900">{item.value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Table card ──────────────────────────────────────────────── */}
        <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">

          {/* Toolbar */}
          <CardHeader className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900">Class roster</CardTitle>
              <CardDescription className="text-[11px]">
                {classes.length} class{classes.length !== 1 ? "es" : ""} · page {paginated.currentPage} of {paginated.totalPages || 1}
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {/* Year search */}
              <div className="relative w-full sm:w-48">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Academic year…"
                  className="h-8 pl-8 text-sm"
                  value={searchYear}
                  onChange={(e) => setSearchYear(e.target.value)}
                />
              </div>
              {/* Grade filter */}
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger className="h-8 w-full text-sm sm:w-40">
                  <SelectValue placeholder="All grades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All grades</SelectItem>
                  {gradeOptions.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          {/* Table */}
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Grade", "Section", "Stream", "Academic year", "Enrolled", "Status", ""].map((h, i) => (
                    <th
                      key={i}
                      className={cn(
                        "px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400",
                        i === 0 && "pl-4 text-left",
                        i === 6 && "pr-4 text-right",
                        i > 0 && i < 6 && "text-left",
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
                    <td colSpan={7} className="py-14 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-500" />
                    </td>
                  </tr>
                ) : paginated.pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-[13px] text-slate-400">
                      No classes found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  paginated.pageItems.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={cn(
                        "group border-b border-slate-100 last:border-b-0 transition-colors hover:bg-indigo-50/30",
                        idx % 2 === 1 && "bg-slate-50/30",
                      )}
                    >
                      {/* Grade */}
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[11px] font-bold text-indigo-600">
                            {item.grade.slice(0, 2)}
                          </div>
                          <span className="text-[13px] font-semibold text-slate-900">{item.grade}</span>
                        </div>
                      </td>

                      {/* Section */}
                      <td className="px-3 py-2.5">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-[12px] font-bold text-slate-700">
                          {item.section}
                        </span>
                      </td>

                      {/* Stream */}
                      <td className="px-3 py-2.5">
                        {item.stream ? (
                          <span className="text-[12px] font-medium text-slate-600">{item.stream}</span>
                        ) : (
                          <span className="text-[12px] text-slate-300">—</span>
                        )}
                      </td>

                      {/* Academic year */}
                      <td className="px-3 py-2.5">
                        <span className="text-[12px] font-mono text-slate-600">{item.academicYear}</span>
                      </td>

                      {/* Capacity bar */}
                      <td className="px-3 py-2.5">
                        <CapacityBar current={item.currentCount} capacity={item.capacity} />
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5">
                        <StatusBadge status={item.status} />
                      </td>

                      {/* Action */}
                      <td className="py-2.5 pl-3 pr-4 text-right">
                        <Link
                          href={`/admin/classes/${item.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-indigo-700"
                        >
                          Manage <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {classes.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <p className="text-[11px] text-slate-400">
                {(paginated.currentPage - 1) * PAGE_SIZE + 1}–{Math.min(paginated.currentPage * PAGE_SIZE, classes.length)} of {classes.length}
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      className={cn("h-7 text-xs", paginated.currentPage === 1 && "pointer-events-none opacity-40")}
                      onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.max(1, p - 1)); }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-3 text-[11px] text-slate-400">
                      {paginated.currentPage} / {paginated.totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      className={cn("h-7 text-xs", paginated.currentPage === paginated.totalPages && "pointer-events-none opacity-40")}
                      onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.min(paginated.totalPages, p + 1)); }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </Card>

        {/* ── Create class dialog ──────────────────────────────────────── */}
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) form.reset({ grade: "", section: "", stream: "", academicYear: settings?.academicConfiguration.currentAcademicYear ?? "", capacity: 40 });
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Create new class</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 pt-2">

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField control={form.control} name="grade" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-700">Grade</FormLabel>
                      <FormControl><Input className="h-8 text-sm" placeholder="Grade 10" {...field} /></FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="section" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-700">Section</FormLabel>
                      <FormControl><Input className="h-8 text-sm" placeholder="A" {...field} /></FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField control={form.control} name="stream" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-700">Stream <span className="text-slate-400">(optional)</span></FormLabel>
                      <FormControl><Input className="h-8 text-sm" placeholder="Science" {...field} /></FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="academicYear" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-700">Academic year</FormLabel>
                      <FormControl><Input className="h-8 text-sm" placeholder="2025-2026" {...field} /></FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="capacity" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-slate-700">Capacity</FormLabel>
                    <FormControl><Input type="number" min={20} max={60} className="h-8 text-sm" {...field} /></FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )} />

                {/* Summary preview */}
                {form.watch("grade") && form.watch("section") && (
                  <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2">
                    <BookOpen className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    <span className="text-[12px] font-semibold text-indigo-700">
                      {form.watch("grade")}-{form.watch("section")}
                      {form.watch("stream") ? `-${form.watch("stream")}` : ""}
                      {form.watch("academicYear") ? ` · ${form.watch("academicYear")}` : ""}
                    </span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={createClass.isPending}>
                    {createClass.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create class"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
