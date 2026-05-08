import { useState } from "react";
import { Layout } from "@/components/layout";
import { useStaffList, useCreateStaffLoan, useListStaffLoans, useCreateLoanRepayment } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";

const loanSchema = z.object({
  staffId: z.number(),
  loanType: z.string().min(1, "Loan type required"),
  amount: z.number().positive(),
  approvedDate: z.string().min(1),
  monthlyInstallment: z.number().optional(),
  totalInstallments: z.number().optional(),
});

export default function StaffLoansPage() {
  const { data: staff } = useStaffList();
  const createLoan = useCreateStaffLoan();
  const [selectedStaff, setSelectedStaff] = useState<number | null>(null);
  const { data: loans, isLoading: loansLoading } = useListStaffLoans(selectedStaff!);
  const [open, setOpen] = useState(false);
  const form = useForm({ resolver: zodResolver(loanSchema), defaultValues: { staffId: 0, loanType: "", amount: 0, approvedDate: "" } });

  const onSubmit = (data: any) => {
    createLoan.mutate(data, { onSuccess: () => { setOpen(false); form.reset(); } });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Staff Loans</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add Loan</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Loan</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField control={form.control} name="staffId" render={({ field }) => (
                    <FormItem><FormLabel>Staff</FormLabel><FormControl>
                      <select {...field} className="w-full border rounded p-2">
                        <option value={0}>Select</option>
                        {staff?.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                      </select>
                    </FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="loanType" render={({ field }) => (
                    <FormItem><FormLabel>Type</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="amount" render={({ field }) => (
                    <FormItem><FormLabel>Amount</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="approvedDate" render={({ field }) => (
                    <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                  )} />
                  <Button type="submit" disabled={createLoan.isPending}>
                    {createLoan.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Create"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-white dark:bg-card border rounded-2xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Loan Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loansLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : !loans?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No loans.</TableCell></TableRow>
              ) : loans.map(loan => (
                <TableRow key={loan.id}>
                  <TableCell>Staff #{loan.staffId}</TableCell>
                  <TableCell>{loan.loanType}</TableCell>
                  <TableCell>{loan.amount}</TableCell>
                  <TableCell>{loan.status}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => {
                      // Trigger repayment dialog
                    }}>Repay</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
