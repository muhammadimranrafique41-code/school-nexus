import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClasses, useCreateClass } from "@/hooks/use-classes";
import { applyDocumentBranding, getCachedPublicSchoolSettings, paginateItems } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateClassSchema } from "@/lib/validators/classes";
import type { z } from "zod";
import { useToast } from "@/hooks/use-toast";

export default function AdminClasses() {
  const settings = getCachedPublicSchoolSettings();
  const [gradeFilter, setGradeFilter] = useState("all");
  const [searchYear, setSearchYear] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { toast } = useToast();

  const filters = useMemo(
    () => ({
      academicYear: searchYear || undefined,
      grade: gradeFilter === "all" ? undefined : gradeFilter,
    }),
    [gradeFilter, searchYear],
  );

  const { data, isLoading } = useClasses(filters);
  const createClass = useCreateClass();

  const classes = data?.data ?? [];

  useEffect(() => {
    applyDocumentBranding(settings, "Classes");
  }, [settings]);

  useEffect(() => {
    setCurrentPage(1);
  }, [gradeFilter, searchYear]);

  const gradeOptions = useMemo(
    () => Array.from(new Set(classes.map((item) => item.grade))).sort(),
    [classes],
  );

  const paginated = paginateItems(classes, currentPage, 12);

  const summary = useMemo(() => {
    const items = classes;
    const active = items.filter((item) => item.status === "active");
    const totalCapacity = active.reduce((sum, item) => sum + item.capacity, 0);
    const enrolled = active.reduce((sum, item) => sum + item.currentCount, 0);
    return {
      total: items.length,
      active: active.length,
      capacity: totalCapacity,
      enrolled,
    };
  }, [classes]);

  const form = useForm<z.infer<typeof CreateClassSchema>>({
    resolver: zodResolver(CreateClassSchema),
    defaultValues: {
      grade: "",
      section: "",
      stream: "",
      academicYear: settings?.academicConfiguration.currentAcademicYear ?? "",
      capacity: 40,
    },
  });

  const onSubmit = async (values: z.infer<typeof CreateClassSchema>) => {
    try {
      await createClass.mutateAsync(values);
      // After creating, show this year's classes by default
      setSearchYear(values.academicYear);
      toast({
        title: "Class created",
        description: "The class has been created successfully.",
      });
      setIsCreateOpen(false);
      form.reset({
        grade: "",
        section: "",
        stream: "",
        academicYear: values.academicYear,
        capacity: 40,
      });
    } catch (error: any) {
      toast({
        title: "Unable to create class",
        description: error?.message ?? "Something went wrong",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Classes</h1>
            <p className="mt-1 text-muted-foreground">
              View configured classes by grade, section, stream, and academic year.
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="self-start">
            <Plus className="mr-2 h-4 w-4" />
            New class
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total classes</p>
              <p className="mt-2 text-3xl font-display font-bold">{summary.total}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Active classes</p>
              <p className="mt-2 text-3xl font-display font-bold">{summary.active}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Enrolled students</p>
              <p className="mt-2 text-3xl font-display font-bold">{summary.enrolled}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total capacity</p>
              <p className="mt-2 text-3xl font-display font-bold">{summary.capacity}</p>
            </CardContent>
          </Card>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-3">
              <Input
                placeholder="Academic year (e.g. 2025-2026)"
                className="w-full md:w-60"
                value={searchYear}
                onChange={(event) => setSearchYear(event.target.value)}
              />
            </div>
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grades</SelectItem>
                {gradeOptions.map((grade) => (
                  <SelectItem key={grade} value={grade}>
                    {grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Grade</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Stream</TableHead>
                <TableHead>Academic Year</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : paginated.pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No classes found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.pageItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.grade}</TableCell>
                    <TableCell>{item.section}</TableCell>
                    <TableCell>{item.stream || "—"}</TableCell>
                    <TableCell>{item.academicYear}</TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {item.currentCount} / {item.capacity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.status === "active" ? "outline" : "secondary"}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/classes/${item.id}`} className="text-sm font-medium text-primary hover:underline">
                        Manage teachers
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              form.reset({
                grade: "",
                section: "",
                stream: "",
                academicYear: settings?.academicConfiguration.currentAcademicYear ?? "",
                capacity: 40,
              });
            }
          }}
        >
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Create class</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="grade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grade</FormLabel>
                        <FormControl>
                          <Input placeholder="Grade 10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="section"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section</FormLabel>
                        <FormControl>
                          <Input placeholder="A" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="stream"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stream</FormLabel>
                        <FormControl>
                          <Input placeholder="Science" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="academicYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Academic year</FormLabel>
                        <FormControl>
                          <Input placeholder="2025-2026" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacity</FormLabel>
                      <FormControl>
                        <Input type="number" min={20} max={60} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={createClass.isPending}>
                  {createClass.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create class"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

