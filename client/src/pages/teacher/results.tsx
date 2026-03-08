import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useResults, useCreateResult, useDeleteResult, useUpdateResult } from "@/hooks/use-results";
import { useUsers } from "@/hooks/use-users";
import { useUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Award, Download, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { calculateGrade, downloadCsv, getErrorMessage, paginateItems } from "@/lib/utils";

type ListedResult = {
  id: number;
  studentId: number;
  subject: string;
  marks: number;
  grade: string;
  student?: { name: string; className?: string | null };
};

const resultSchema = z.object({
  studentId: z.coerce.number().min(1, "Student is required"),
  marks: z.coerce.number().min(0).max(100, "Marks must be between 0 and 100"),
});

const PAGE_SIZE = 8;

export default function TeacherResults() {
  const { data: currentUser } = useUser();
  const { data: results, isLoading } = useResults();
  const { data: users } = useUsers();
  const createResult = useCreateResult();
  const updateResult = useUpdateResult();
  const deleteResult = useDeleteResult();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingResult, setEditingResult] = useState<ListedResult | null>(null);
  const [resultToDelete, setResultToDelete] = useState<ListedResult | null>(null);

  const form = useForm<z.infer<typeof resultSchema>>({
    resolver: zodResolver(resultSchema),
    defaultValues: { studentId: 0, marks: 0 },
  });

  const students = useMemo(() => (users ?? []).filter((user) => user.role === "student"), [users]);
  const subjectName = currentUser?.subject?.trim() || "";
  const mutationPending = createResult.isPending || updateResult.isPending;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const myResults = useMemo(() => {
    const baseResults = subjectName ? (results ?? []).filter((record) => record.subject === subjectName) : [];
    const query = searchTerm.trim().toLowerCase();
    return [...baseResults]
      .sort((a, b) => b.id - a.id)
      .filter((record) => {
        const searchable = `${record.student?.name ?? ""} ${record.student?.className ?? ""} ${record.grade} ${record.marks}`.toLowerCase();
        return searchable.includes(query);
      });
  }, [results, searchTerm, subjectName]);

  const paginated = paginateItems(myResults, currentPage, PAGE_SIZE);

  const summary = useMemo(() => {
    const total = myResults.length;
    const average = total ? Math.round(myResults.reduce((sum, record) => sum + record.marks, 0) / total) : 0;
    const passRate = total ? Math.round((myResults.filter((record) => record.grade !== "F").length / total) * 100) : 0;
    const highest = total ? Math.max(...myResults.map((record) => record.marks)) : 0;
    return { total, average, passRate, highest };
  }, [myResults]);

  const resetForm = () => {
    form.reset({ studentId: 0, marks: 0 });
  };

  const openCreateDialog = () => {
    setEditingResult(null);
    resetForm();
    setIsOpen(true);
  };

  const openEditDialog = (result: ListedResult) => {
    setEditingResult(result);
    form.reset({ studentId: result.studentId, marks: result.marks });
    setIsOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof resultSchema>) => {
    if (!subjectName) {
      toast({ title: "Subject missing", description: "Assign a subject to this teacher account before managing results.", variant: "destructive" });
      return;
    }

    const payload = {
      studentId: values.studentId,
      marks: values.marks,
      subject: subjectName,
      grade: calculateGrade(values.marks),
    };

    try {
      if (editingResult) {
        await updateResult.mutateAsync({ id: editingResult.id, ...payload });
      } else {
        await createResult.mutateAsync(payload);
      }

      toast({
        title: editingResult ? "Result updated" : "Result added",
        description: `Saved ${payload.subject} marks for the selected student.`,
      });
      setIsOpen(false);
      setEditingResult(null);
      resetForm();
    } catch (error) {
      toast({ title: "Unable to save result", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!resultToDelete) return;
    try {
      await deleteResult.mutateAsync(resultToDelete.id);
      toast({ title: "Result deleted", description: `Removed the result entry for ${resultToDelete.student?.name || `student ${resultToDelete.studentId}`}.` });
      setResultToDelete(null);
    } catch (error) {
      toast({ title: "Unable to delete result", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const exportResults = () => {
    downloadCsv(
      `${(subjectName || "subject").toLowerCase().replaceAll(" ", "-")}-results.csv`,
      myResults.map((record) => ({
        Student: record.student?.name ?? `ID: ${record.studentId}`,
        Class: record.student?.className ?? "",
        Subject: record.subject,
        Marks: record.marks,
        Grade: record.grade,
      })),
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Results</h1>
            <p className="mt-1 text-muted-foreground">Manage grades for {subjectName || "your assigned subject"}.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={exportResults} disabled={myResults.length === 0} data-testid="teacher-results-export-button">
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={openCreateDialog} disabled={!subjectName} data-testid="teacher-results-add-button">
              <Plus className="mr-2 h-4 w-4" /> Add Result
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Entries", value: summary.total },
            { label: "Average marks", value: `${summary.average}%` },
            { label: "Pass rate", value: `${summary.passRate}%` },
            { label: "Highest score", value: `${summary.highest}%` },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-3xl font-display font-bold">{item.value}</p>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Award className="h-5 w-5" />
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
              setEditingResult(null);
              resetForm();
            }
          }}
        >
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>{editingResult ? "Edit result" : "Add result"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="studentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Student</FormLabel>
                      <Select value={String(field.value ?? 0)} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select student" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {students.map((student) => (
                            <SelectItem key={student.id} value={String(student.id)}>
                              {student.name} {student.className ? `(${student.className})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="marks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Marks (0-100)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" max="100" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Grade is calculated automatically using the shared grading scale.</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={mutationPending || !subjectName}>
                  {mutationPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingResult ? "Save changes" : "Save result"}
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
                placeholder="Search by student, class, grade, or mark"
                className="max-w-md"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                data-testid="teacher-results-search-input"
              />
            </div>
            {!subjectName && <p className="text-sm text-destructive">This teacher account does not have a subject assigned yet.</p>}
          </div>

          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Marks</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : myResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No results recorded for this subject yet.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.pageItems.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.student?.name || `ID: ${record.studentId}`}</TableCell>
                    <TableCell>{record.student?.className || "—"}</TableCell>
                    <TableCell>{record.marks}/100</TableCell>
                    <TableCell>
                      <Badge variant={record.grade === "F" ? "destructive" : "secondary"}>{record.grade}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(record)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setResultToDelete(record)}>
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {myResults.length > 0 && (
            <div className="flex flex-col gap-3 border-t p-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(paginated.currentPage - 1) * PAGE_SIZE + 1}-{Math.min(paginated.currentPage * PAGE_SIZE, myResults.length)} of {myResults.length} results
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

        <AlertDialog open={!!resultToDelete} onOpenChange={(open) => !open && setResultToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete result?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the stored mark for {resultToDelete?.student?.name || `student ${resultToDelete?.studentId}`}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                {deleteResult.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete result"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
