import { useState } from "react";
import { Layout } from "@/components/layout";
import { useStaffList, useCreateSalaryStructure, useProcessSalary, useSalaryPayments } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";

const salaryStructureSchema = z.object({
  staffId: z.number(),
  basicSalary: z.number().positive("Basic salary must be positive"),
  effectiveFrom: z.string().min(1, "Effective from is required"),
  effectiveTo: z.string().optional(),
});

export default function StaffSalaryPage() {
  const { data: staffList, isLoading: staffLoading } = useStaffList();
  const createStructure = useCreateSalaryStructure();
  const processSalary = useProcessSalary();
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: payments, isLoading: paymentsLoading } = useSalaryPayments(selectedStaffId!);

  const form = useForm<z.infer<typeof salaryStructureSchema>>({
    resolver: zodResolver(salaryStructureSchema),
    defaultValues: { staffId: 0, basicSalary: 0, effectiveFrom: "", effectiveTo: "" },
  });

  const onSubmit = (data: z.infer<typeof salaryStructureSchema>) => {
    createStructure.mutate(data, {
      onSuccess: () => { setDialogOpen(false); form.reset(); },
    });
  };

  const handleProcess = (staffId: number) => {
    const payload = {
      staffId,
      paymentMonth: new Date().toISOString().slice(0, 7) + "-01",
      grossSalary: 0,
      totalDeductions: 0,
      netSalary: 0,
      paymentDate: new Date().toISOString().slice(0, 10),
    };
    processSalary.mutate(payload);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Staff Salary Management</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Salary Structure
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Salary Structure</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField control={form.control} name="staffId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Staff</FormLabel>
                      <FormControl>
                        <select {...field} className="w-full border rounded p-2">
                          <option value={0}>Select staff</option>
                          {staffList?.map(s => (
                            <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.employeeId})</option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="basicSalary" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Basic Salary</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="effectiveFrom" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Effective From</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" disabled={createStructure.isPending}>
                    {createStructure.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Create"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Staff list with quick actions */}
        <div className="bg-white dark:bg-card border rounded-2xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : !staffList?.length ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No staff found.</TableCell></TableRow>
              ) : staffList.map(staff => (
                <TableRow key={staff.id}>
                  <TableCell className="font-mono">{staff.employeeId}</TableCell>
                  <TableCell>{staff.firstName} {staff.lastName}</TableCell>
                  <TableCell>{staff.staffType}</TableCell>
                  <TableCell className="space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setSelectedStaffId(staff.id)}>
                      View Payments
                    </Button>
                    <Button size="sm" onClick={() => handleProcess(staff.id)} disabled={processSalary.isPending}>
                      Process Salary
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Payments for selected staff */}
        {selectedStaffId && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Salary Payments for Staff #{selectedStaffId}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Payment Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentsLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : !payments?.length ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No payments found.</TableCell></TableRow>
                ) : payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.paymentMonth}</TableCell>
                    <TableCell>{p.grossSalary}</TableCell>
                    <TableCell>{p.totalDeductions}</TableCell>
                    <TableCell>{p.netSalary}</TableCell>
                    <TableCell>{p.paymentDate}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}
