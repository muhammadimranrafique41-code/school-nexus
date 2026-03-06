import { Layout } from "@/components/layout";
import { useResults } from "@/hooks/use-results";
import { useUser } from "@/hooks/use-auth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function StudentGrades() {
  const { data: user } = useUser();
  const { data: results, isLoading } = useResults();

  const myResults = results;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">My Grades</h1>
          <p className="text-muted-foreground mt-1">Your academic performance.</p>
        </div>

        <div className="bg-white dark:bg-card border rounded-2xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Grade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : myResults?.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No grades recorded yet.</TableCell></TableRow>
              ) : (
                myResults?.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium text-base">{record.subject}</TableCell>
                    <TableCell className="text-muted-foreground">{record.marks} / 100</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`font-bold text-sm px-3 py-1 ${record.grade === 'F' ? 'text-red-500 border-red-200 bg-red-50' : 'text-emerald-600 border-emerald-200 bg-emerald-50'}`}>
                        {record.grade}
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
