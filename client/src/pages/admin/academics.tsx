import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useAcademics, useCreateAcademic, useDeleteAcademic, useUpdateAcademic } from "@/hooks/use-academics";
import { useUsers } from "@/hooks/use-users";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, Download, Loader2, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { downloadCsv, getErrorMessage, paginateItems } from "@/lib/utils";

type ListedAcademic = {
  id: number;
  title: string;
  code: string;
  description?: string | null;
  className?: string | null;
  teacherUserId?: number | null;
  teacher?: { id: number; name: string; subject?: string | null };
};

const academicSchema = z.object({
  title: z.string().min(1, "Subject title is required"),
  code: z.string().min(1, "Subject code is required"),
  description: z.string().optional(),
  className: z.string().optional(),
  teacherUserId: z.coerce.number().min(0).optional(),
});

const PAGE_SIZE = 8;

export default function Academics() {
  const { data: academics, isLoading } = useAcademics();
  const { data: users } = useUsers();
  const createAcademic = useCreateAcademic();
  const updateAcademic = useUpdateAcademic();
  const deleteAcademic = useDeleteAcademic();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingAcademic, setEditingAcademic] = useState<ListedAcademic | null>(null);
  const [academicToDelete, setAcademicToDelete] = useState<ListedAcademic | null>(null);

  const form = useForm<z.infer<typeof academicSchema>>({
    resolver: zodResolver(academicSchema),
    defaultValues: { title: "", code: "", description: "", className: "", teacherUserId: 0 },
  });

  const teachers = useMemo(
    () => (users ?? []).filter((user) => user.role === "teacher"),
    [users],
  );

  const classOptions = useMemo(
    () => Array.from(new Set((academics ?? []).map((item) => item.className).filter((value): value is string => Boolean(value)))).sort(),
    [academics],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, classFilter]);

  const filteredAcademics = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return (academics ?? []).filter((item) => {
      const matchesClass = classFilter === "all" ? true : (item.className ?? "") === classFilter;
      const teacherName = item.teacher?.name?.toLowerCase() ?? "";
      const searchable = [item.title, item.code, item.description ?? "", item.className ?? "", teacherName]
        .join(" ")
        .toLowerCase();
      return matchesClass && searchable.includes(query);
    });
  }, [academics, classFilter, searchTerm]);

  const paginated = paginateItems(filteredAcademics, currentPage, PAGE_SIZE);
  const mutationPending = createAcademic.isPending || updateAcademic.isPending;

  const summary = useMemo(() => {
    const items = academics ?? [];
    return {
      total: items.length,
      assignedTeachers: items.filter((item) => item.teacherUserId).length,
      activeClasses: new Set(items.map((item) => item.className).filter(Boolean)).size,
      unassigned: items.filter((item) => !item.teacherUserId).length,
    };
  }, [academics]);

  const resetForm = () => {
    form.reset({ title: "", code: "", description: "", className: "", teacherUserId: 0 });
  };

  const openCreateDialog = () => {
    setEditingAcademic(null);
    resetForm();
    setIsOpen(true);
  };

  const openEditDialog = (academic: ListedAcademic) => {
    setEditingAcademic(academic);
    form.reset({
      title: academic.title,
      code: academic.code,
      description: academic.description ?? "",
      className: academic.className ?? "",
      teacherUserId: academic.teacherUserId ?? 0,
    });
    setIsOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof academicSchema>) => {
    const payload = {
      title: values.title.trim(),
      code: values.code.trim(),
      description: values.description?.trim() || undefined,
      className: values.className?.trim() || undefined,
      teacherUserId: values.teacherUserId ? values.teacherUserId : undefined,
    };

    try {
      if (editingAcademic) {
        await updateAcademic.mutateAsync({ id: editingAcademic.id, ...payload });
      } else {
        await createAcademic.mutateAsync(payload);
      }

      toast({
        title: editingAcademic ? "Subject updated" : "Subject created",
        description: `${payload.title} has been saved successfully.`,
      });
      setIsOpen(false);
      setEditingAcademic(null);
      resetForm();
    } catch (error) {
      toast({
        title: "Unable to save subject",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!academicToDelete) return;

    try {
      await deleteAcademic.mutateAsync(academicToDelete.id);
      toast({ title: "Subject deleted", description: `${academicToDelete.title} has been removed.` });
      setAcademicToDelete(null);
    } catch (error) {
      toast({
        title: "Unable to delete subject",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const exportAcademics = () => {
    downloadCsv(
      "academics-export.csv",
      filteredAcademics.map((item) => ({
        Title: item.title,
        Code: item.code,
        Class: item.className ?? "",
        Teacher: item.teacher?.name ?? "Unassigned",
        Description: item.description ?? "",
      })),
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Academics</h1>
            <p className="mt-1 text-muted-foreground">Manage class subjects, assigned teachers, and curriculum coverage.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={exportAcademics} disabled={filteredAcademics.length === 0} data-testid="academics-export-button">
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={openCreateDialog} data-testid="academics-add-button">
              <Plus className="mr-2 h-4 w-4" /> Add Subject
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Subjects", value: summary.total, icon: BookOpen },
            { label: "Assigned teachers", value: summary.assignedTeachers, icon: Users },
            { label: "Active classes", value: summary.activeClasses, icon: BookOpen },
            { label: "Unassigned", value: summary.unassigned, icon: Users },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-3xl font-display font-bold">{item.value}</p>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) {
              setEditingAcademic(null);
              resetForm();
            }
          }}
        >
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>{editingAcademic ? "Edit subject" : "Create subject"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject title</FormLabel>
                        <FormControl>
                          <Input placeholder="Mathematics" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject code</FormLabel>
                        <FormControl>
                          <Input placeholder="MATH-101" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="className"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Class</FormLabel>
                        <FormControl>
                          <Input placeholder="Grade 10-A" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="teacherUserId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assigned teacher</FormLabel>
                        <Select value={String(field.value ?? 0)} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Assign a teacher" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="0">Unassigned</SelectItem>
                            {teachers.map((teacher) => (
                              <SelectItem key={teacher.id} value={String(teacher.id)}>
                                {teacher.name} {teacher.subject ? `(${teacher.subject})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Outline what this subject covers for the selected class." {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={mutationPending}>
                  {mutationPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingAcademic ? "Save changes" : "Create subject"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search subjects, codes, teachers, or classes"
                className="max-w-md"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                data-testid="academics-search-input"
              />
            </div>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-full lg:w-[220px]">
                <SelectValue placeholder="Filter by class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classOptions.map((className) => (
                  <SelectItem key={className} value={className}>
                    {className}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredAcademics.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No subjects match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.pageItems.map((academic) => (
                  <TableRow key={academic.id}>
                    <TableCell>
                      <div className="font-medium">{academic.title}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{academic.code}</Badge>
                    </TableCell>
                    <TableCell>{academic.className || "—"}</TableCell>
                    <TableCell>{academic.teacher?.name || "Unassigned"}</TableCell>
                    <TableCell className="max-w-[280px] text-muted-foreground">{academic.description || "No description added"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(academic)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setAcademicToDelete(academic)}>
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {filteredAcademics.length > 0 && (
            <div className="flex flex-col gap-3 border-t p-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(paginated.currentPage - 1) * PAGE_SIZE + 1}-{Math.min(paginated.currentPage * PAGE_SIZE, filteredAcademics.length)} of {filteredAcademics.length} subjects
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      className={paginated.currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                      onClick={(event) => {
                        event.preventDefault();
                        setCurrentPage((page) => Math.max(1, page - 1));
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-4 text-sm text-muted-foreground">Page {paginated.currentPage} of {paginated.totalPages}</span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      className={paginated.currentPage === paginated.totalPages ? "pointer-events-none opacity-50" : ""}
                      onClick={(event) => {
                        event.preventDefault();
                        setCurrentPage((page) => Math.min(paginated.totalPages, page + 1));
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>

        <AlertDialog open={!!academicToDelete} onOpenChange={(open) => !open && setAcademicToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete subject?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove {academicToDelete?.title} from the academic catalogue. Results and attendance already recorded will remain untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                {deleteAcademic.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete subject"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}

