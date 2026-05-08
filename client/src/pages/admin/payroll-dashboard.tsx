// Force rebuild
import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { useStaffList } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Calculator, CheckCircle, AlertCircle, CreditCard, FileText } from "lucide-react";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const paymentProcessingSchema = z.object({
  paymentMethod: z.string().min(1, "Payment method is required"),
  transactionId: z.string().optional(),
  remarks: z.string().optional(),
});

interface PayrollEntry {
  staffId: number;
  employeeId: string;
  name: string;
  baseSalary: number;
  allowances: Record<string, number>;
  deductions: Record<string, number>;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
}

export default function PayrollDashboard() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [processingDialogOpen, setProcessingDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<PayrollEntry | null>(null);

  const { data: staffList, isLoading: staffLoading } = useStaffList({ status: 'active' });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const paymentForm = useForm<z.infer<typeof paymentProcessingSchema>>({
    resolver: zodResolver(paymentProcessingSchema),
    defaultValues: {
      paymentMethod: "",
      transactionId: "",
      remarks: "",
    },
  });

  // Get salary structures for all staff
  const salaryStructureQueries = useQueries({
    queries: staffList?.map(staff => ({
      queryKey: [api.staff.salaryStructure.path, staff.id],
      queryFn: async () => {
        const res = await fetch(buildUrl(api.staff.salaryStructure.path, { id: staff.id }), { credentials: "include" });
        if (!res.ok) return null;
        return api.staff.salaryStructure.responses[200].parse(await res.json());
      },
      enabled: !!staffList,
    })) || []
  });

  const structuresLoading = salaryStructureQueries.some(query => query.isLoading);
  const salaryStructures = salaryStructureQueries.map((query, index) => ({
    staffId: staffList?.[index]?.id,
    structure: query.data
  }));

  // Calculate payroll entries
  const payrollEntries = useMemo(() => {
    if (!staffList || !salaryStructures) return [];

    return staffList.map((staff) => {
      const structureData = salaryStructures.find(s => s.staffId === staff.id)?.structure;

      if (!structureData) {
        return {
          staffId: staff.id,
          employeeId: staff.employeeId,
          name: `${staff.firstName} ${staff.lastName}`,
          baseSalary: 0,
          allowances: {},
          deductions: {},
          grossSalary: 0,
          totalDeductions: 0,
          netSalary: 0,
        };
      }

      const baseSalary = Number(structureData.basicSalary) || 0;
      const allowances = structureData.allowances || {};
      const deductions = structureData.deductions || {};

      const totalAllowances = Object.values(allowances).reduce((sum: number, val: any) => sum + Number(val), 0);
      const totalDeductions = Object.values(deductions).reduce((sum: number, val: any) => sum + Number(val), 0);

      const grossSalary = baseSalary + totalAllowances;
      const netSalary = grossSalary - totalDeductions;

      return {
        staffId: staff.id,
        employeeId: staff.employeeId,
        name: `${staff.firstName} ${staff.lastName}`,
        baseSalary,
        allowances,
        deductions,
        grossSalary,
        totalDeductions,
        netSalary,
      };
    });
  }, [staffList, salaryStructures]);

  // Process individual salary payment mutation
  const processSalaryMutation = useMutation({
    mutationFn: async (data: z.infer<typeof paymentProcessingSchema> & { entry: PayrollEntry }) => {
      const { entry, ...paymentData } = data;
      const res = await fetch(buildUrl(api.staff.processSalary.path, { id: entry.staffId }), {
        method: api.staff.processSalary.method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          paymentMonth: `${selectedMonth}-01`,
          grossSalary: entry.grossSalary,
          totalDeductions: entry.totalDeductions,
          netSalary: entry.netSalary,
          paymentDate: new Date().toISOString().split('T')[0],
          ...paymentData,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Failed to process salary for ${entry.name}: ${error}`);
      }

      return res.json();
    },
    onSuccess: (result, variables) => {
      toast({
        title: "Payment processed successfully",
        description: `Salary payment for ${variables.entry.name} has been recorded.`,
      });
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
      setProcessingDialogOpen(false);
      paymentForm.reset();
      setSelectedEntry(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Payment processing failed",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const handleProcessPayment = (entry: PayrollEntry) => {
    setSelectedEntry(entry);
    paymentForm.reset({
      paymentMethod: "Bank Transfer",
      transactionId: "",
      remarks: `Monthly payroll for ${selectedMonth}`,
    });
    setProcessingDialogOpen(true);
  };

  const onPaymentSubmit = (data: z.infer<typeof paymentProcessingSchema>) => {
    if (!selectedEntry) return;
    processSalaryMutation.mutate({ ...data, entry: selectedEntry });
  };

  const isLoading = staffLoading || structuresLoading;
  const totalGross = payrollEntries.reduce((sum, entry) => sum + entry.grossSalary, 0);
  const totalDeductions = payrollEntries.reduce((sum, entry) => sum + entry.totalDeductions, 0);
  const totalNet = payrollEntries.reduce((sum, entry) => sum + entry.netSalary, 0);

  return (
    <Layout>
      <div>Hello Payroll Dashboard</div>
    </Layout>
  );}