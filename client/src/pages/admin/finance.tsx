import { useState } from "react";
import { Layout } from "@/components/layout";
import { useFees, useCreateFee, useUpdateFee } from "@/hooks/use-fees";
import { useUsers } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const feeSchema = z.object({
  studentId: z.coerce.number().min(1, "Student is required"),
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  dueDate: z.string().min(1, "Due date is required"),
  status: z.enum(["Paid", "Unpaid"]),
});

export default function Finance() {
  const { data: fees, isLoading: feesLoading } = useFees();
  const { data: users } = useUsers();
  const createFee = useCreateFee();
  const updateFee = useUpdateFee();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<z.infer<typeof feeSchema>>({
    resolver: zodResolver(feeSchema),
    defaultValues: { studentId: 0, amount: 0, dueDate: "", status: "Unpaid" }
  });

  const students = users?.filter(u => u.role === 'student') || [];

  const onSubmit = (data: z.infer<typeof feeSchema>) => {
    createFee.mutate(data, {
      onSuccess: () => {
        setIsOpen(false);
        form.reset();
      }
    });
  };

  const markAsPaid = (id: number) => {
    updateFee.mutate({ id, status: "Paid" });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-display font-bold">Finance</h1>
            <p className="text-muted-foreground mt-1">Manage student fee collections.</p>
          </div>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl shadow-lg shadow-primary/20">
                <Plus className="mr-2 h-4 w-4" /> Assign Fee
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign New Fee</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField control={form.control} name="studentId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Student</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={String(field.value)}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {students.map(s => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.className})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="amount" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount ($)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="dueDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Initial Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Unpaid">Unpaid</SelectItem>
                          <SelectItem value="Paid">Paid</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full mt-4" disabled={createFee.isPending}>
                    {createFee.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Save Fee"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-white dark:bg-card border rounded-2xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feesLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : fees?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No fees recorded.</TableCell></TableRow>
              ) : (
                fees?.map((fee) => (
                  <TableRow key={fee.id}>
                    <TableCell className="font-medium">{fee.student?.name || `ID: ${fee.studentId}`}</TableCell>
                    <TableCell>${fee.amount.toLocaleString()}</TableCell>
                    <TableCell>{format(new Date(fee.dueDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant={fee.status === 'Paid' ? 'default' : 'destructive'} 
                             className={fee.status === 'Paid' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                        {fee.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {fee.status === 'Unpaid' && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                          onClick={() => markAsPaid(fee.id)}
                          disabled={updateFee.isPending}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Mark Paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
