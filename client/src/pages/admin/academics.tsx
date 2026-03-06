import { Layout } from "@/components/layout";
import { useAttendance } from "@/hooks/use-attendance";
import { useResults } from "@/hooks/use-results";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function Academics() {
  const { data: attendance, isLoading: attendanceLoading } = useAttendance();
  const { data: results, isLoading: resultsLoading } = useResults();

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Academics Overview</h1>
          <p className="text-muted-foreground mt-1">Global view of attendance and grades.</p>
        </div>

        <Tabs defaultValue="attendance" className="w-full">
          <TabsList className="grid w-[400px] grid-cols-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl h-11">
            <TabsTrigger value="attendance" className="rounded-lg font-medium">Attendance Logs</TabsTrigger>
            <TabsTrigger value="results" className="rounded-lg font-medium">All Results</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="mt-6">
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
                  ) : attendance?.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No attendance records found.</TableCell></TableRow>
                  ) : (
                    attendance?.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {format(new Date(record.date), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>{record.student?.name || `ID: ${record.studentId}`}</TableCell>
                        <TableCell>
                          <Badge variant={record.status === 'Present' ? 'default' : 'destructive'} className={record.status === 'Present' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                            {record.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="results" className="mt-6">
            <div className="bg-white dark:bg-card border rounded-2xl overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Marks</TableHead>
                    <TableHead>Grade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultsLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                  ) : results?.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No results found.</TableCell></TableRow>
                  ) : (
                    results?.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.student?.name || `ID: ${record.studentId}`}</TableCell>
                        <TableCell>{record.subject}</TableCell>
                        <TableCell>{record.marks}/100</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-bold text-sm bg-slate-50">
                            {record.grade}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
