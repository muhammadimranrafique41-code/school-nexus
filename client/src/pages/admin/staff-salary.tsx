import { useState } from "react";
import { Layout } from "@/components/layout";
import { useStaffList, useCreateSalaryStructure, useProcessSalary, useSalaryPayments, useSalaryStructure } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Edit2, Trash2, DollarSign, Minus, Plus as PlusIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const allowanceDeductionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.number().positive("Amount must be positive"),
});

const salaryStructureSchema = z.object({
  staffId: z.number(),
  basicSalary: z.number().positive("Basic salary must be positive"),
  allowances: z.array(allowanceDeductionSchema).optional().default([]),
  deductions: z.array(allowanceDeductionSchema).optional().default([]),
  effectiveFrom: z.string().min(1, "Effective from is required"),
  effectiveTo: z.string().optional(),
});

type SalaryStructureForm = z.infer<typeof salaryStructureSchema>;

export default function StaffSalaryPage() {
  const { data: staffList, isLoading: staffLoading } = useStaffList();
  const createStructure = useCreateSalaryStructure();
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  // Get salary structure for selected staff
  const { data: currentStructure, isLoading: structureLoading } = useSalaryStructure(selectedStaffId!);

  const form = useForm<SalaryStructureForm>({
    resolver: zodResolver(salaryStructureSchema),
    defaultValues: {
      staffId: 0,
      basicSalary: 0,
      allowances: [],
      deductions: [],
      effectiveFrom: "",
      effectiveTo: ""
    },
  });

  const { fields: allowanceFields, append: appendAllowance, remove: removeAllowance } = useFieldArray({
    control: form.control,
    name: "allowances",
  });

  const { fields: deductionFields, append: appendDeduction, remove: removeDeduction } = useFieldArray({
    control: form.control,
    name: "deductions",
  });

  const onSubmit = (data: SalaryStructureForm) => {
    // Convert arrays to objects for storage
    const allowances = data.allowances?.reduce((acc, item) => {
      acc[item.name] = item.amount;
      return acc;
    }, {} as Record<string, number>) || {};

    const deductions = data.deductions?.reduce((acc, item) => {
      acc[item.name] = item.amount;
      return acc;
    }, {} as Record<string, number>) || {};

    const payload = {
      staffId: data.staffId,
      basicSalary: data.basicSalary,
      allowances,
      deductions,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo || undefined,
    };

    createStructure.mutate(payload, {
      onSuccess: () => {
        setDialogOpen(false);
        form.reset();
        toast({ title: "Salary structure created", description: "The salary structure has been saved successfully." });
      },
      onError: (error) => {
        toast({ title: "Failed to create salary structure", description: error.message, variant: "destructive" });
      },
    });
  };

  const openStructureDialog = (staffId: number) => {
    form.reset({
      staffId,
      basicSalary: currentStructure?.basicSalary ? Number(currentStructure.basicSalary) : 0,
      allowances: currentStructure?.allowances ? Object.entries(currentStructure.allowances).map(([name, amount]) => ({ name, amount: Number(amount) })) : [],
      deductions: currentStructure?.deductions ? Object.entries(currentStructure.deductions).map(([name, amount]) => ({ name, amount: Number(amount) })) : [],
      effectiveFrom: currentStructure?.effectiveFrom || new Date().toISOString().split('T')[0],
      effectiveTo: currentStructure?.effectiveTo || "",
    });
    setSelectedStaffId(staffId);
    setDialogOpen(true);
  };

  const calculateTotal = (items: Array<{ name: string; amount: number }>) => {
    return items.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const watchedAllowances = form.watch("allowances") || [];
  const watchedDeductions = form.watch("deductions") || [];
  const watchedBasicSalary = form.watch("basicSalary") || 0;
  const totalAllowances = calculateTotal(watchedAllowances);
  const totalDeductions = calculateTotal(watchedDeductions);
  const grossSalary = watchedBasicSalary + totalAllowances;
  const netSalary = grossSalary - totalDeductions;

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Salary Configuration Dashboard</h1>
              <p className="text-[12px] text-slate-400">Manage salary structures, allowances, and deductions for staff members</p>
            </div>
          </div>
        </section>

        {/* Staff Salary Overview */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{staffList?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Active staff members</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Salary Structures</CardTitle>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {staffList?.filter(staff => staff.id).length || 0}
              </div>
              <p className="text-xs text-muted-foreground">Configured salary structures</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Setup</CardTitle>
              <Edit2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(staffList?.length || 0) - (staffList?.filter(staff => staff.id).length || 0)}
              </div>
              <p className="text-xs text-muted-foreground">Need salary configuration</p>
            </CardContent>
          </Card>
        </div>

        {/* Staff List with Salary Structures */}
        <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Staff Salary Structures</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Basic Salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : !staffList?.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No staff found.
                    </TableCell>
                  </TableRow>
                ) : (
                  staffList.map((staff) => (
                    <TableRow key={staff.id}>
                      <TableCell className="font-mono">{staff.employeeId}</TableCell>
                      <TableCell className="font-medium">
                        {staff.firstName} {staff.lastName}
                      </TableCell>
                      <TableCell>
                        <Badge variant={staff.staffType === 'teaching' ? 'default' : 'secondary'}>
                          {staff.staffType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {currentStructure?.basicSalary ? (
                          <span className="font-mono">
                            {formatCurrency(Number(currentStructure.basicSalary))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Not set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={currentStructure ? 'default' : 'outline'}>
                          {currentStructure ? 'Configured' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openStructureDialog(staff.id)}
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Configure
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>

        {/* Salary Structure Configuration Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Configure Salary Structure</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
                {/* Basic Information */}
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField control={form.control} name="basicSalary" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Basic Salary (PKR)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="50000.00"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="effectiveFrom" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Effective From</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="effectiveTo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective To (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Allowances Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <PlusIcon className="h-5 w-5 text-green-600" />
                      Allowances
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendAllowance({ name: "", amount: 0 })}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Allowance
                    </Button>
                  </div>

                  {allowanceFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-end">
                      <FormField
                        control={form.control}
                        name={`allowances.${index}.name`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>Allowance Name</FormLabel>
                            <FormControl>
                              <Input placeholder="HRA, Conveyance, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`allowances.${index}.amount`}
                        render={({ field }) => (
                          <FormItem className="w-32">
                            <FormLabel>Amount (PKR)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeAllowance(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Deductions Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Minus className="h-5 w-5 text-red-600" />
                      Deductions
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendDeduction({ name: "", amount: 0 })}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Deduction
                    </Button>
                  </div>

                  {deductionFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-end">
                      <FormField
                        control={form.control}
                        name={`deductions.${index}.name`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>Deduction Name</FormLabel>
                            <FormControl>
                              <Input placeholder="PF, Insurance, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`deductions.${index}.amount`}
                        render={({ field }) => (
                          <FormItem className="w-32">
                            <FormLabel>Amount (PKR)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeDeduction(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Salary Summary */}
                <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Salary Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span>Basic Salary:</span>
                      <span className="font-mono">{formatCurrency(watchedBasicSalary)}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>Total Allowances:</span>
                      <span className="font-mono">{`+${formatCurrency(totalAllowances)}`}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>Gross Salary:</span>
                      <span className="font-mono">{formatCurrency(grossSalary)}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>Total Deductions:</span>
                      <span className="font-mono">-{formatCurrency(totalDeductions)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-bold text-lg">
                      <span>Net Salary:</span>
                      <span className="font-mono">{formatCurrency(netSalary)}</span>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createStructure.isPending}>
                    {createStructure.isPending ? (
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    ) : (
                      <Edit2 className="h-4 w-4 mr-2" />
                    )}
                    Save Salary Structure
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
