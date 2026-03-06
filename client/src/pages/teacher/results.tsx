import { useState } from "react";
import { Layout } from "@/components/layout";
import { useResults, useCreateResult } from "@/hooks/use-results";
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
import { Loader2, Plus } from "lucide-react";

const resultSchema = z.object({
  studentId: z.coerce.number().min(1, "Student is required"),
  marks: z.coerce.number().min(0).max(100, "Marks must be between 0 and 100"),
});

const calculateGrade = (marks: number) => {
  if (marks >= 90) return "A";
  if (marks >= 80) return "B";
  if (marks >= 70) return "C";
  if (marks >= 60) return "D";
  return "F";
};

export default function TeacherResults() {
  const { data: currentUser } = useUser();
  const { data: results, isLoading: resultsLoading } = useResults();
  const { data: users } = useUsers();
  const createResult = useCreateResult();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<z.infer<typeof resultSchema>>({
    resolver: zodResolver(resultSchema),
    defaultValues: { studentId: 0, marks: 0 }
  });

  const students = users?.filter(u => u.role === 'student') || [];
  // Filter only results for this teacher's subject
  const myResults = results?.filter(r => r.subject === currentUser?.subject);

  const onSubmit = (data: z.infer<typeof resultSchema>) => {
    const grade = calculateGrade(data.marks);
    createResult.mutate({ 
      ...data, 
      subject: currentUser!.subject || "General",
      grade
    }, {
      onSuccess: () => {
        setIsOpen(false);
        form.reset();
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-display font-bold">Results</h1>
            <p className="text-muted-foreground mt-1">Manage grades for {currentUser?.subject}.</p>
          </div>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl shadow-lg shadow-primary/20">
                <Plus className="mr-2 h-4 w-4" /> Add Result
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enter Student Result</DialogTitle>
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
                  <FormField control={form.control} name="marks" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Marks (0-100)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <p className="text-xs text-muted-foreground mt-1">Grade will be calculated automatically.</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full mt-4" disabled={createResult.isPending}>
                    {createResult.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Save Result"}
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
                <TableHead>Marks</TableHead>
                <TableHead>Grade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultsLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : myResults?.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No results recorded for your subject yet.</TableCell></TableRow>
              ) : (
                myResults?.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.student?.name || `ID: ${record.studentId}`}</TableCell>
                    <TableCell>{record.marks}/100</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`font-bold text-sm ${record.grade === 'F' ? 'text-red-500 border-red-200 bg-red-50' : 'text-emerald-600 border-emerald-200 bg-emerald-50'}`}>
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
