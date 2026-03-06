import { useState } from "react";
import { Layout } from "@/components/layout";
import { useAttendance, useCreateAttendance } from "@/hooks/use-attendance";
import { useUsers } from "@/hooks/use-users";
import { useUser } from "@/hooks/use-auth";
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
import { Loader2, CalendarPlus } from "lucide-react";
import { format } from "date-fns";

const attendanceSchema = z.object({
  studentId: z.coerce.number().min(1, "Student is required"),
  date: z.string().min(1, "Date is required"),
  status: z.enum(["Present", "Absent"]),
});

export default function TeacherAttendance() {
  const { data: currentUser } = useUser();
  const { data: attendance, isLoading: attendanceLoading } = useAttendance();
  const { data: users } = useUsers();
  const createAttendance = useCreateAttendance();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<z.infer<typeof attendanceSchema>>({
    resolver: zodResolver(attendanceSchema),
    defaultValues: { studentId: 0, date: format(new Date(), 'yyyy-MM-dd'), status: "Present" }
  });

  const students = users?.filter(u => u.role === 'student') || [];
  const myRecords = attendance?.filter(a => a.teacherId === currentUser?.id);

  const onSubmit = (data: z.infer<typeof attendanceSchema>) => {
    createAttendance.mutate({ ...data, teacherId: currentUser!.id }, {
      onSuccess: () => {
        setIsOpen(false);
        form.reset({ ...form.getValues(), studentId: 0 }); // keep date/status same for quick entry
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-display font-bold">Attendance</h1>
            <p className="text-muted-foreground mt-1">Mark and view daily attendance.</p>
          </div>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl shadow-lg shadow-primary/20">
                <CalendarPlus className="mr-2 h-4 w-4" /> Mark Attendance
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mark Student Attendance</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField control={form.control} name="date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
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
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Present">Present</SelectItem>
                          <SelectItem value="Absent">Absent</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full mt-4" disabled={createAttendance.isPending}>
                    {createAttendance.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Save Record"}
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
                <TableHead>Date</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendanceLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : myRecords?.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">You haven't marked any attendance yet.</TableCell></TableRow>
              ) : (
                myRecords?.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{format(new Date(record.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{record.student?.name || `ID: ${record.studentId}`}</TableCell>
                    <TableCell>
                      <Badge variant={record.status === 'Present' ? 'default' : 'destructive'} 
                             className={record.status === 'Present' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                        {record.status}
                      </Badge>
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
