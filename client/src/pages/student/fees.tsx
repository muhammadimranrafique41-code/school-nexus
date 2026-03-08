import { Layout } from "@/components/layout";
import { useFees } from "@/hooks/use-fees";
import { useUser } from "@/hooks/use-auth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function StudentFees() {
  const { data: user } = useUser();
  const { data: fees, isLoading } = useFees();

  const myFees = fees?.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">My Fees</h1>
          <p className="text-muted-foreground mt-1">Track your pending and paid invoices.</p>
        </div>

        <div className="bg-white dark:bg-card border rounded-2xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : myFees?.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No fee records found.</TableCell></TableRow>
              ) : (
                myFees?.map((fee) => (
                  <TableRow key={fee.id}>
                    <TableCell className="font-semibold text-base">{formatCurrency(fee.amount)}</TableCell>
                    <TableCell>{formatDate(fee.dueDate, 'MMMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant={fee.status === 'Paid' ? 'default' : 'destructive'}
                        className={fee.status === 'Paid' ? 'bg-emerald-500' : ''}>
                        {fee.status}
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
