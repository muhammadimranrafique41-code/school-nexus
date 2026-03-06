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

  const markAttendance = (studentId: number, status: "Present" | "Absent") => {
    createAttendance.mutate({
      studentId,
      teacherId: currentUser!.id,
      date: format(new Date(), 'yyyy-MM-dd'),
      status
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
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Mark Attendance (Today)</h2>
            <div className="bg-white dark:bg-card border rounded-2xl overflow-hidden shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map(student => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.name} ({student.className})</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                          onClick={() => markAttendance(student.id, "Present")}
                          disabled={createAttendance.isPending}
                        >
                          Present
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                          onClick={() => markAttendance(student.id, "Absent")}
                          disabled={createAttendance.isPending}
                        >
                          Absent
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Attendance History</h2>
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
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No records found.</TableCell></TableRow>
                  ) : (
                    myRecords?.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium text-xs">{format(new Date(record.date), 'MMM dd')}</TableCell>
                        <TableCell className="text-xs">{record.student?.name || `ID: ${record.studentId}`}</TableCell>
                        <TableCell>
                          <Badge variant={record.status === 'Present' ? 'default' : 'destructive'} className="text-[10px] h-5">
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
        </div>
      </div>
    </Layout>
  );
}
