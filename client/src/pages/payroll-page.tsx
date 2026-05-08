import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { formatCurrency } from "@/lib/utils";
import { useStaffList } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Calculator,
  CheckCircle,
  AlertCircle,
  CreditCard,
} from "lucide-react";
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

export default function PayrollPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [processingDialogOpen, setProcessingDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<PayrollEntry | null>(null);

  const { data: staffList, isLoading: staffLoading } = useStaffList({ status: "active" });
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
    queries:
      staffList?.map((staff) => ({
        queryKey: [api.staff.salaryStructure.get.path, staff.id],
        queryFn: async () => {
          const res = await fetch(
            buildUrl(api.staff.salaryStructure.get.path, { id: staff.id }),
            { credentials: "include" }
          );
          if (!res.ok) return null;
          return api.staff.salaryStructure.get.responses[200].parse(await res.json());
        },
        enabled: !!staffList,
      })) || [],
  });

  const structuresLoading = salaryStructureQueries.some((query) => query.isLoading);
  const salaryStructures = salaryStructureQueries.map((query, index) => ({
    staffId: staffList?.[index]?.id,
    structure: query.data,
  }));

  // Calculate payroll entries
  const payrollEntries = useMemo(() => {
    if (!staffList || !salaryStructures) return [];

    return staffList.map((staff) => {
      const structureData = salaryStructures.find((s) => s.staffId === staff.id)?.structure;

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

      const totalAllowances = Object.values(allowances).reduce(
        (sum: number, val: any) => sum + Number(val),
        0
      );
      const totalDeductions = Object.values(deductions).reduce(
        (sum: number, val: any) => sum + Number(val),
        0
      );

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
    mutationFn: async (
      data: z.infer<typeof paymentProcessingSchema> & { entry: PayrollEntry }
    ) => {
      const { entry, ...paymentData } = data;
      const res = await fetch(
        buildUrl(api.staff.processSalary.path, { id: entry.staffId }),
        {
          method: api.staff.processSalary.method,
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            paymentMonth: `${selectedMonth}-01`,
            grossSalary: entry.grossSalary,
            totalDeductions: entry.totalDeductions,
            netSalary: entry.netSalary,
            paymentDate: new Date().toISOString().split("T")[0],
            ...paymentData,
          }),
        }
      );

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
        variant: "destructive",
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
  const totalGross = payrollEntries.reduce(
    (sum, entry) => sum + entry.grossSalary,
    0
  );
  const totalDeductions = payrollEntries.reduce(
    (sum, entry) => sum + entry.totalDeductions,
    0
  );
  const totalNet = payrollEntries.reduce(
    (sum, entry) => sum + entry.netSalary,
    0
  );

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Payroll Dashboard</h1>
            <p className="text-muted-foreground">
              Process monthly salary payments for staff
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => {
                  const date = new Date();
                  date.setMonth(date.getMonth() - i);
                  const value = `${date.getFullYear()}-${String(
                    date.getMonth() + 1
                  ).padStart(2, "0")}`;
                  const label = date.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                  });
                  return (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Payroll Summary -{" "}
              {new Date(
                selectedMonth + "-01"
              ).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {payrollEntries.length}
                  </div>
                  <div className="text-sm text-blue-600">Total Staff</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(totalGross)}
                  </div>
                  <div className="text-sm text-green-600">
                    Total Gross Salary
                  </div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(totalDeductions)}
                  </div>
                  <div className="text-sm text-red-600">
                    Total Deductions
                  </div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {formatCurrency(totalNet)}
                  </div>
                  <div className="text-sm text-purple-600">
                    Total Net Salary
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payroll Preview Table */}
        <Card>
          <CardHeader>
            <CardTitle>Payroll Preview for {selectedMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : payrollEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                No active staff found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">
                        Base Salary
                      </TableHead>
                      <TableHead className="text-right">
                        Allowances
                      </TableHead>
                      <TableHead className="text-right">
                        Deductions
                      </TableHead>
                      <TableHead className="text-right">
                        Net Salary
                      </TableHead>
                      <TableHead className="text-center">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollEntries.map((entry) => (
                      <TableRow key={entry.staffId}>
                        <TableCell className="font-medium">
                          {entry.employeeId}
                        </TableCell>
                        <TableCell>{entry.name}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(entry.baseSalary)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(entry.grossSalary - entry.baseSalary)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(entry.totalDeductions)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(entry.netSalary)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            onClick={() => handleProcessPayment(entry)}
                            disabled={processSalaryMutation.isPending}
                          >
                            {processSalaryMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <CreditCard className="h-4 w-4 mr-2" />
                            )}
                            Process Payment
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Processing Dialog */}
        <Dialog
          open={processingDialogOpen}
          onOpenChange={setProcessingDialogOpen}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Process Salary Payment
              </DialogTitle>
            </DialogHeader>
            {selectedEntry && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold">{selectedEntry.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Employee ID: {selectedEntry.employeeId}
                  </p>
                  <p className="text-lg font-bold text-green-600 mt-2">
                    Net Salary: ₹
                    {selectedEntry.netSalary.toLocaleString()}
                  </p>
                </div>

                <Form {...paymentForm}>
                  <form
                    onSubmit={paymentForm.handleSubmit(onPaymentSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={paymentForm.control}
                      name="paymentMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Method</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select payment method" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Bank Transfer">
                                Bank Transfer
                              </SelectItem>
                              <SelectItem value="Cash">Cash</SelectItem>
                              <SelectItem value="Cheque">Cheque</SelectItem>
                              <SelectItem value="UPI">UPI</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={paymentForm.control}
                      name="transactionId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Transaction ID/Reference (Optional)
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter transaction ID or reference number"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={paymentForm.control}
                      name="remarks"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Remarks (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Additional notes or remarks"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setProcessingDialogOpen(false)}
                        disabled={processSalaryMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={processSalaryMutation.isPending}
                      >
                        {processSalaryMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Process Payment
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
