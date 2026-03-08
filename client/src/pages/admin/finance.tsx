import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useFees, useCreateFee, useDeleteFee, useUpdateFee } from "@/hooks/use-fees";
import { useUsers } from "@/hooks/use-users";
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
import { Banknote, CheckCircle2, Download, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { downloadCsv, formatCurrency, formatDate, getErrorMessage, paginateItems } from "@/lib/utils";

type ListedFee = {
  id: number;
  studentId: number;
  amount: number;
  dueDate: string;
  status: string;
  student?: { name: string; className?: string | null };
};

const feeSchema = z.object({
  studentId: z.coerce.number().min(1, "Student is required"),
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  dueDate: z.string().min(1, "Due date is required"),
  status: z.enum(["Paid", "Unpaid"]),
});

const PAGE_SIZE = 8;

export default function Finance() {
  const { data: fees, isLoading } = useFees();
  const { data: users } = useUsers();
  const createFee = useCreateFee();
  const updateFee = useUpdateFee();
  const deleteFee = useDeleteFee();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Paid" | "Unpaid">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingFee, setEditingFee] = useState<ListedFee | null>(null);
  const [feeToDelete, setFeeToDelete] = useState<ListedFee | null>(null);

  const form = useForm<z.infer<typeof feeSchema>>({
    resolver: zodResolver(feeSchema),
    defaultValues: { studentId: 0, amount: 0, dueDate: "", status: "Unpaid" },
  });

  const students = useMemo(() => (users ?? []).filter((user) => user.role === "student"), [users]);
  const mutationPending = createFee.isPending || updateFee.isPending;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const filteredFees = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return (fees ?? []).filter((fee) => {
      const matchesStatus = statusFilter === "all" ? true : fee.status === statusFilter;
      const studentName = fee.student?.name?.toLowerCase() ?? "";
      const className = fee.student?.className?.toLowerCase() ?? "";
      const searchable = `${studentName} ${className} ${fee.id} ${fee.amount}`;
      return matchesStatus && searchable.includes(query);
    });
  }, [fees, searchTerm, statusFilter]);

  const paginated = paginateItems(filteredFees, currentPage, PAGE_SIZE);

  const summary = useMemo(() => {
    const items = fees ?? [];
    const totalBilled = items.reduce((sum, fee) => sum + fee.amount, 0);
    const collected = items.filter((fee) => fee.status === "Paid").reduce((sum, fee) => sum + fee.amount, 0);
    const outstanding = items.filter((fee) => fee.status === "Unpaid").reduce((sum, fee) => sum + fee.amount, 0);
    const unpaidInvoices = items.filter((fee) => fee.status === "Unpaid").length;
    return { totalBilled, collected, outstanding, unpaidInvoices };
  }, [fees]);

  const resetForm = () => {
    form.reset({ studentId: 0, amount: 0, dueDate: "", status: "Unpaid" });
  };

  const openCreateDialog = () => {
    setEditingFee(null);
    resetForm();
    setIsOpen(true);
  };

  const openEditDialog = (fee: ListedFee) => {
    setEditingFee(fee);
    form.reset({ studentId: fee.studentId, amount: fee.amount, dueDate: fee.dueDate, status: fee.status === "Paid" ? "Paid" : "Unpaid" });
    setIsOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof feeSchema>) => {
    try {
      if (editingFee) {
        await updateFee.mutateAsync({ id: editingFee.id, ...values });
      } else {
        await createFee.mutateAsync(values);
      }

      toast({
        title: editingFee ? "Fee updated" : "Fee assigned",
        description: `Invoice for ${formatCurrency(values.amount)} has been saved.`,
      });
      setIsOpen(false);
      setEditingFee(null);
      resetForm();
    } catch (error) {
      toast({ title: "Unable to save fee", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const markAsPaid = async (fee: ListedFee) => {
    try {
      await updateFee.mutateAsync({ id: fee.id, status: "Paid" });
      toast({ title: "Fee updated", description: `Invoice #${fee.id} has been marked as paid.` });
    } catch (error) {
      toast({ title: "Unable to update fee", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!feeToDelete) return;
    try {
      await deleteFee.mutateAsync(feeToDelete.id);
      toast({ title: "Fee deleted", description: `Invoice #${feeToDelete.id} has been removed.` });
      setFeeToDelete(null);
    } catch (error) {
      toast({ title: "Unable to delete fee", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const exportFees = () => {
    downloadCsv(
      "fees-export.csv",
      filteredFees.map((fee) => ({
        Invoice: fee.id,
        Student: fee.student?.name ?? `ID: ${fee.studentId}`,
        Class: fee.student?.className ?? "",
        Amount: fee.amount,
        DueDate: fee.dueDate,
        Status: fee.status,
      })),
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Finance</h1>
            <p className="mt-1 text-muted-foreground">Track invoices, payment status, and outstanding balances for students.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={exportFees} disabled={filteredFees.length === 0} data-testid="finance-export-button">
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={openCreateDialog} data-testid="finance-add-button">
              <Plus className="mr-2 h-4 w-4" /> Assign Fee
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total billed", value: formatCurrency(summary.totalBilled) },
            { label: "Collected", value: formatCurrency(summary.collected) },
            { label: "Outstanding", value: formatCurrency(summary.outstanding) },
            { label: "Unpaid invoices", value: summary.unpaidInvoices },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-3xl font-display font-bold">{item.value}</p>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Banknote className="h-5 w-5" />
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
              setEditingFee(null);
              resetForm();
            }
          }}
        >
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>{editingFee ? "Edit fee" : "Assign new fee"}</DialogTitle>
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

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Unpaid">Unpaid</SelectItem>
                          <SelectItem value="Paid">Paid</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={mutationPending}>
                  {mutationPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingFee ? "Save changes" : "Save fee"}
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
                placeholder="Search by student, class, invoice, or amount"
                className="max-w-md"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                data-testid="finance-search-input"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value: "all" | "Paid" | "Unpaid") => setStatusFilter(value)}>
              <SelectTrigger className="w-full lg:w-[220px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Status</TableHead>
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
              ) : filteredFees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No fee records match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.pageItems.map((fee) => (
                  <TableRow key={fee.id}>
                    <TableCell>
                      <div className="font-medium">{fee.student?.name || `ID: ${fee.studentId}`}</div>
                      <div className="text-xs text-muted-foreground">{fee.student?.className || "Class not set"}</div>
                    </TableCell>
                    <TableCell>{formatCurrency(fee.amount)}</TableCell>
                    <TableCell>{formatDate(fee.dueDate, "MMM dd, yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant={fee.status === "Paid" ? "secondary" : "destructive"}>{fee.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {fee.status === "Unpaid" && (
                          <Button variant="outline" size="sm" onClick={() => markAsPaid(fee)} disabled={updateFee.isPending}>
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Mark paid
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(fee)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setFeeToDelete(fee)}>
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {filteredFees.length > 0 && (
            <div className="flex flex-col gap-3 border-t p-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(paginated.currentPage - 1) * PAGE_SIZE + 1}-{Math.min(paginated.currentPage * PAGE_SIZE, filteredFees.length)} of {filteredFees.length} invoices
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

        <AlertDialog open={!!feeToDelete} onOpenChange={(open) => !open && setFeeToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete fee record?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove invoice #{feeToDelete?.id} for {feeToDelete?.student?.name || `student ${feeToDelete?.studentId}`}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                {deleteFee.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete fee"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
