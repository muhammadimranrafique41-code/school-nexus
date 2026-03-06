import { Layout } from "@/components/layout";
import { useAttendance } from "@/hooks/use-attendance";
import { useUser } from "@/hooks/use-auth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function StudentAttendance() {
  const { data: user } = useUser();
  const { data: attendance, isLoading } = useAttendance();

  const myRecords = attendance?.filter(a => a.studentId === user?.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">My Attendance</h1>
          <p className="text-muted-foreground mt-1">Review your attendance history.</p>
        </div>

        <div className="bg-white dark:bg-card border rounded-2xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={2} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : myRecords?.length === 0 ? (
                <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">No attendance records found.</TableCell></TableRow>
              ) : (
                myRecords?.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      {format(new Date(record.date), 'MMMM dd, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={record.status === 'Present' ? 'default' : 'destructive'} 
                             className={record.status === 'Present' ? 'bg-emerald-500' : ''}>
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
