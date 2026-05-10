import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { formatCurrency } from "@/lib/utils";
import { useStaffList } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
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
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Calculator,
  CheckCircle,
  AlertCircle,
  CreditCard,
  History,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  BookOpen,
  PlusCircle,
  Pencil,
} from "lucide-react";
import { useQueries, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const paymentProcessingSchema = z.object({
  paymentMethod: z.string().min(1, "Payment method is required"),
  transactionId: z.string().optional(),
  remarks: z.string().optional(),
});

// ─── Add / Edit Salary Structure schema ──────────────────────────────────────
// Income Tax and EOBI (Employee) have been removed per the new deduction policy.
// Deductions are now absence-based: (basicSalary / daysInMonth) * daysAbsent.

const addSalarySchema = z.object({
  basicSalary: z
    .string()
    .min(1, "Basic salary is required")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
      message: "Basic salary must be a positive number",
    }),
  // Named allowances — stored as a flat JSON object
  houseRentAllowance: z.string().default("0"),
  medicalAllowance: z.string().default("0"),
  conveyanceAllowance: z.string().default("0"),
  otherAllowance: z.string().default("0"),
  // Absence-based deduction
  daysAbsent: z
    .string()
    .default("0")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, {
      message: "Days absent must be 0 or more",
    }),
  // Other manual deduction
  otherDeduction: z.string().default("0"),
  // Effective date for the salary structure
  effectiveFrom: z.string().min(1, "Effective from date is required"),
});

type AddSalaryFormValues = z.infer<typeof addSalarySchema>;

// ─── SalaryStructure type (from DB) ──────────────────────────────────────────

interface SalaryStructureRecord {
  id: number;
  staffId: number;
  basicSalary: number | string;
  allowances: Record<string, number> | null;
  deductions: Record<string, number> | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

// ─── Helper: days in a given YYYY-MM month ────────────────────────────────────

function getDaysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || !month) return 30;
  return new Date(year, month, 0).getDate();
}

// ─── AddSalaryDialog component ────────────────────────────────────────────────

interface AddSalaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: number;
  staffName: string;
  /** Pre-existing structure to edit; undefined = create new */
  existing?: SalaryStructureRecord;
  /** The payroll period month (YYYY-MM) used as the default effectiveFrom */
  payrollMonth: string;
  onSaved: () => void;
}

function AddSalaryDialog({
  open,
  onOpenChange,
  staffId,
  staffName,
  existing,
  payrollMonth,
  onSaved,
}: AddSalaryDialogProps) {
  const { toast } = useToast();
  const isEdit = !!existing;

  // Derive default effectiveFrom from payrollMonth (YYYY-MM → YYYY-MM-01)
  const defaultEffectiveFrom = existing?.effectiveFrom ?? `${payrollMonth}-01`;

  // Flatten existing allowances/deductions into form fields
  const existingAllowances = existing?.allowances ?? {};
  const existingDeductions = existing?.deductions ?? {};

  // Extract daysAbsent from stored deductions if editing
  const storedDaysAbsent = existingDeductions["Days Absent"] ?? 0;

  const form = useForm<AddSalaryFormValues>({
    resolver: zodResolver(addSalarySchema),
    defaultValues: {
      basicSalary: existing ? String(existing.basicSalary) : "",
      houseRentAllowance: String(existingAllowances["House Rent Allowance"] ?? 0),
      medicalAllowance: String(existingAllowances["Medical Allowance"] ?? 0),
      conveyanceAllowance: String(existingAllowances["Conveyance Allowance"] ?? 0),
      otherAllowance: String(existingAllowances["Other Allowance"] ?? 0),
      daysAbsent: String(storedDaysAbsent),
      otherDeduction: String(existingDeductions["Other Deduction"] ?? 0),
      effectiveFrom: defaultEffectiveFrom,
    },
  });

  // Reactive net salary preview
  const watched = useWatch({ control: form.control });

  const daysInMonth = getDaysInMonth(payrollMonth);

  const preview = useMemo(() => {
    const basic = parseFloat(watched.basicSalary ?? "0") || 0;
    const hra = parseFloat(watched.houseRentAllowance ?? "0") || 0;
    const med = parseFloat(watched.medicalAllowance ?? "0") || 0;
    const conv = parseFloat(watched.conveyanceAllowance ?? "0") || 0;
    const other = parseFloat(watched.otherAllowance ?? "0") || 0;
    const daysAbsent = parseFloat(watched.daysAbsent ?? "0") || 0;
    const otherDed = parseFloat(watched.otherDeduction ?? "0") || 0;

    const totalAllowances = hra + med + conv + other;
    const grossSalary = basic + totalAllowances;

    // Absence deduction: (basic / daysInMonth) * daysAbsent
    const absenceDeduction =
      basic > 0 && daysInMonth > 0
        ? Math.round((basic / daysInMonth) * daysAbsent * 100) / 100
        : 0;

    const totalDeductions = absenceDeduction + otherDed;
    const netSalary = Math.max(0, grossSalary - totalDeductions);

    return {
      basic,
      totalAllowances,
      grossSalary,
      absenceDeduction,
      otherDed,
      totalDeductions,
      netSalary,
      daysInMonth,
    };
  }, [watched, daysInMonth]);

  const saveMutation = useMutation({
    mutationFn: async (values: AddSalaryFormValues) => {
      const allowances: Record<string, number> = {};
      if (parseFloat(values.houseRentAllowance) > 0)
        allowances["House Rent Allowance"] = parseFloat(values.houseRentAllowance);
      if (parseFloat(values.medicalAllowance) > 0)
        allowances["Medical Allowance"] = parseFloat(values.medicalAllowance);
      if (parseFloat(values.conveyanceAllowance) > 0)
        allowances["Conveyance Allowance"] = parseFloat(values.conveyanceAllowance);
      if (parseFloat(values.otherAllowance) > 0)
        allowances["Other Allowance"] = parseFloat(values.otherAllowance);

      // Build deductions: absence-based + other
      const deductions: Record<string, number> = {};
      const daysAbsent = parseFloat(values.daysAbsent) || 0;
      const basic = parseFloat(values.basicSalary) || 0;
      const absenceDeduction =
        basic > 0 && daysInMonth > 0
          ? Math.round((basic / daysInMonth) * daysAbsent * 100) / 100
          : 0;

      if (daysAbsent > 0) {
        deductions["Days Absent"] = daysAbsent;
        deductions["Absence Deduction"] = absenceDeduction;
      }
      if (parseFloat(values.otherDeduction) > 0)
        deductions["Other Deduction"] = parseFloat(values.otherDeduction);

      const body = {
        basicSalary: parseFloat(values.basicSalary),
        allowances: Object.keys(allowances).length ? allowances : null,
        deductions: Object.keys(deductions).length ? deductions : null,
        effectiveFrom: values.effectiveFrom,
      };

      if (isEdit && existing) {
        const res = await fetch(
          `/api/staff/${staffId}/salary-structure/${existing.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Update failed" }));
          throw new Error((err as { message?: string }).message ?? "Update failed");
        }
        return res.json();
      } else {
        const res = await fetch(
          buildUrl(api.staff.salaryStructure.create.path, { id: staffId }),
          {
            method: api.staff.salaryStructure.create.method,
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ ...body, staffId }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Create failed" }));
          throw new Error((err as { message?: string }).message ?? "Create failed");
        }
        return res.json();
      }
    },
    onSuccess: () => {
      toast({
        title: isEdit ? "Salary structure updated" : "Salary structure created",
        description: `Salary for ${staffName} has been ${isEdit ? "updated" : "saved"} successfully.`,
      });
      onSaved();
      onOpenChange(false);
      form.reset();
    },
    onError: (err: Error) => {
      toast({
        title: "Save failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: AddSalaryFormValues) => {
    saveMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <Pencil className="h-5 w-5" />
            ) : (
              <PlusCircle className="h-5 w-5" />
            )}
            {isEdit ? "Edit Salary Structure" : "Add Salary Structure"}
          </DialogTitle>
          <DialogDescription>
            {staffName} — Payroll period: <strong>{payrollMonth}</strong>
            {" "}({daysInMonth} working days)
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Base Salary */}
            <FormField
              control={form.control}
              name="basicSalary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Basic Salary (PKR) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 50000"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Allowances */}
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Allowances
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="houseRentAllowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>House Rent</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="medicalAllowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Medical</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="conveyanceAllowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conveyance</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="otherAllowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Deductions — absence-based */}
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Deductions
            </p>
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Absence deduction = (Basic ÷ {daysInMonth} days) × Days Absent
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="daysAbsent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Days Absent</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max={daysInMonth}
                        step="0.5"
                        placeholder="0"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="otherDeduction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other Deduction</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Effective From */}
            <FormField
              control={form.control}
              name="effectiveFrom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Effective From *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Live Net Salary Preview */}
            <div className="rounded-lg bg-muted/40 border p-4 space-y-1 text-sm">
              <p className="font-semibold mb-2 flex items-center gap-1">
                <Calculator className="h-4 w-4" />
                Net Salary Preview
              </p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Basic Salary</span>
                <span>{formatCurrency(preview.basic)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">+ Total Allowances</span>
                <span className="text-green-600">+{formatCurrency(preview.totalAllowances)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">= Gross Salary</span>
                <span className="font-medium">{formatCurrency(preview.grossSalary)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">− Absence Deduction</span>
                <span className="text-red-600">−{formatCurrency(preview.absenceDeduction)}</span>
              </div>
              {preview.otherDed > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">− Other Deduction</span>
                  <span className="text-red-600">−{formatCurrency(preview.otherDed)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">= Total Deductions</span>
                <span className="text-red-600">−{formatCurrency(preview.totalDeductions)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between font-bold text-base">
                <span>Net Salary</span>
                <span className="text-green-700">{formatCurrency(preview.netSalary)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saveMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {isEdit ? "Update Salary" : "Save Salary"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── PayrollEntry interface ───────────────────────────────────────────────────

interface PayrollEntry {
  staffId: number;
  employeeId: string;
  name: string;
  /** YYYY-MM of the selected payroll period */
  month: string;
  /** Full year number, e.g. 2026 */
  year: number;
  baseSalary: number;
  allowances: Record<string, number>;
  deductions: Record<string, number>;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  /** Amount already paid for this period (from salary_payments) */
  paid: number;
  /** Remaining balance = netSalary - paid */
  balance: number;
  /** Primary key of the salary_structures row, if one exists */
  structureId?: number;
  /** Full salary structure record for pre-populating the edit dialog */
  structureRecord?: SalaryStructureRecord;
}

// ─── Types for Salary History ─────────────────────────────────────────────────

interface LedgerEntry {
  id: number;
  transactionDate: string;
  amount: string;
  description: string | null;
  entryType: string;
  category: string;
}

interface SalaryHistoryEntry {
  id: number;
  staffId: number;
  paymentMonth: string;
  grossSalary: string;
  totalDeductions: string;
  netSalary: string;
  paymentDate: string;
  paymentMethod: string | null;
  transactionId: string | null;
  remarks: string | null;
  processedBy: number | null;
  createdAt: string;
  ledgerEntries: LedgerEntry[];
}

// ─── Salary History Section Component ────────────────────────────────────────

function SalaryHistorySection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: staffList, isLoading: staffLoading } = useStaffList({ status: "active" });

  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const historyQueryKey = [
    "/api/staff/salary-history/ledger",
    selectedStaffId,
    fromDate,
    toDate,
  ];

  const {
    data: salaryHistory,
    isLoading: historyLoading,
    isFetching: historyFetching,
    refetch: refetchHistory,
  } = useQuery<SalaryHistoryEntry[]>({
    queryKey: historyQueryKey,
    queryFn: async () => {
      if (!selectedStaffId) return [];
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const qs = params.toString();
      const url = `/api/staff/${selectedStaffId}/salary-history/ledger${qs ? `?${qs}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error((err as { message?: string }).message ?? "Failed to fetch salary history");
      }
      const json = await res.json();
      return (json.data ?? json) as SalaryHistoryEntry[];
    },
    enabled: !!selectedStaffId,
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payroll/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Reconciliation failed" }));
        throw new Error((err as { message?: string }).message ?? "Reconciliation failed");
      }
      return res.json() as Promise<{
        data?: { reconciledCount: number; failedCount: number };
        reconciledCount?: number;
        failedCount?: number;
      }>;
    },
    onSuccess: (result) => {
      const data = result.data ?? result;
      toast({
        title: "Reconciliation complete",
        description: `${data.reconciledCount ?? 0} entries posted, ${data.failedCount ?? 0} failed.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/salary-history/ledger"] });
      if (selectedStaffId) void refetchHistory();
    },
    onError: (err: Error) => {
      toast({
        title: "Reconciliation failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const totals = useMemo(() => {
    if (!salaryHistory) return { gross: 0, deductions: 0, net: 0 };
    return salaryHistory.reduce(
      (acc, entry) => ({
        gross: acc.gross + parseFloat(entry.grossSalary),
        deductions: acc.deductions + parseFloat(entry.totalDeductions),
        net: acc.net + parseFloat(entry.netSalary),
      }),
      { gross: 0, deductions: 0, net: 0 }
    );
  }, [salaryHistory]);

  const selectedStaffName = useMemo(() => {
    if (!selectedStaffId || !staffList) return "";
    const staff = staffList.find((s) => String(s.id) === selectedStaffId);
    return staff ? `${staff.firstName} ${staff.lastName}` : "";
  }, [selectedStaffId, staffList]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Salary History &amp; Ledger Reconciliation
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => reconcileMutation.mutate()}
            disabled={reconcileMutation.isPending}
          >
            {reconcileMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Reconcile Ledger
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <label className="text-sm font-medium mb-1 block">Staff Member</label>
            <Select
              value={selectedStaffId}
              onValueChange={setSelectedStaffId}
              disabled={staffLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={staffLoading ? "Loading staff…" : "Select staff member"}
                />
              </SelectTrigger>
              <SelectContent>
                {staffList?.map((staff) => (
                  <SelectItem key={staff.id} value={String(staff.id)}>
                    {staff.firstName} {staff.lastName}
                    {staff.employeeId ? ` (${staff.employeeId})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">From</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              max={toDate || undefined}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">To</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate || undefined}
            />
          </div>
        </div>

        {/* Content area */}
        {!selectedStaffId ? (
          <div className="text-center py-10 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Select a staff member to view their salary history.</p>
          </div>
        ) : historyLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : !salaryHistory || salaryHistory.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No salary history found for {selectedStaffName}.</p>
            {(fromDate || toDate) && (
              <p className="text-sm mt-1">Try adjusting the date range filters.</p>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Payment Month</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-center">Ledger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salaryHistory.map((entry) => {
                    const isExpanded = expandedRows.has(entry.id);
                    const hasLedger = entry.ledgerEntries.length > 0;

                    return (
                      <>
                        <TableRow
                          key={entry.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleRow(entry.id)}
                        >
                          <TableCell className="text-center">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>

                          <TableCell className="font-medium">
                            {new Date(entry.paymentMonth).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                            })}
                          </TableCell>

                          <TableCell>
                            {entry.paymentDate
                              ? new Date(entry.paymentDate).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })
                              : "—"}
                          </TableCell>

                          <TableCell className="text-right">
                            {formatCurrency(parseFloat(entry.grossSalary))}
                          </TableCell>

                          <TableCell className="text-right text-red-600">
                            {formatCurrency(parseFloat(entry.totalDeductions))}
                          </TableCell>

                          <TableCell className="text-right font-semibold text-green-700">
                            {formatCurrency(parseFloat(entry.netSalary))}
                          </TableCell>

                          <TableCell>
                            {entry.paymentMethod ? (
                              <Badge variant="secondary">{entry.paymentMethod}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>

                          <TableCell className="text-center">
                            {hasLedger ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Posted
                              </Badge>
                            ) : (
                              <Badge
                                variant="destructive"
                                className="bg-red-100 text-red-800 hover:bg-red-100"
                              >
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Missing
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow key={`${entry.id}-detail`} className="bg-muted/20">
                            <TableCell colSpan={8} className="py-3 px-6">
                              {hasLedger ? (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                    <BookOpen className="h-3 w-3" />
                                    Ledger Entries
                                  </p>
                                  <div className="rounded border bg-white overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead className="bg-muted/40">
                                        <tr>
                                          <th className="text-left px-3 py-2 font-medium">Date</th>
                                          <th className="text-left px-3 py-2 font-medium">Description</th>
                                          <th className="text-left px-3 py-2 font-medium">Type</th>
                                          <th className="text-right px-3 py-2 font-medium">Amount</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {entry.ledgerEntries.map((le) => (
                                          <tr key={le.id} className="border-t">
                                            <td className="px-3 py-2 text-muted-foreground">
                                              {new Date(le.transactionDate).toLocaleDateString(
                                                "en-US",
                                                { year: "numeric", month: "short", day: "numeric" }
                                              )}
                                            </td>
                                            <td className="px-3 py-2 max-w-xs truncate">
                                              {le.description ?? "—"}
                                            </td>
                                            <td className="px-3 py-2">
                                              <Badge
                                                variant={
                                                  le.entryType === "expense"
                                                    ? "destructive"
                                                    : "default"
                                                }
                                                className="text-xs"
                                              >
                                                {le.entryType}
                                              </Badge>
                                            </td>
                                            <td className="px-3 py-2 text-right font-medium">
                                              {formatCurrency(parseFloat(le.amount))}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-sm text-red-600">
                                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                  <span>
                                    No ledger entry found for this payment. Click{" "}
                                    <strong>Reconcile Ledger</strong> to auto-post missing entries.
                                  </span>
                                </div>
                              )}

                              {entry.remarks && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  <span className="font-medium">Remarks:</span> {entry.remarks}
                                </p>
                              )}
                              {entry.transactionId && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  <span className="font-medium">Transaction ID:</span>{" "}
                                  {entry.transactionId}
                                </p>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}

                  {/* Summary totals row */}
                  <TableRow className="bg-muted/30 font-semibold border-t-2">
                    <TableCell />
                    <TableCell colSpan={2} className="text-sm">
                      Total ({salaryHistory.length} payment
                      {salaryHistory.length !== 1 ? "s" : ""})
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.gross)}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {formatCurrency(totals.deductions)}
                    </TableCell>
                    <TableCell className="text-right text-green-700">
                      {formatCurrency(totals.net)}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {historyFetching && !historyLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Refreshing…
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Payroll Page ────────────────────────────────────────────────────────

export default function PayrollPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [processingDialogOpen, setProcessingDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<PayrollEntry | null>(null);

  // ── Add/Edit Salary dialog state ────────────────────────────────────────────
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [salaryDialogTarget, setSalaryDialogTarget] = useState<{
    staffId: number;
    staffName: string;
    existing?: SalaryStructureRecord;
  } | null>(null);

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
          const body = await res.json();
          // Server returns null (200) when no salary structure has been defined yet.
          if (body === null) return null;
          // Use safeParse so a schema mismatch never silently returns undefined —
          // it falls back to the raw body so arithmetic still works.
          const parsed = api.staff.salaryStructure.get.responses[200].safeParse(body);
          return parsed.success ? parsed.data : (body as SalaryStructureRecord);
        },
        enabled: !!staffList,
      })) || [],
  });

  const structuresLoading = salaryStructureQueries.some((query) => query.isLoading);
  const staffSalaryStructures = salaryStructureQueries.map((query, index) => ({
    staffId: staffList?.[index]?.id,
    structure: query.data as SalaryStructureRecord | null | undefined,
  }));

  // ── Salary payments for the selected month (drives Paid / Balance columns) ──
  // Query each staff member's payment history and filter to the selected month.
  const SALARY_PAYMENTS_KEY = "salary-payments-for-month";
  const salaryPaymentQueries = useQueries({
    queries:
      staffList?.map((staff) => ({
        queryKey: [SALARY_PAYMENTS_KEY, staff.id, selectedMonth],
        queryFn: async () => {
          const res = await fetch(
            buildUrl(api.staff.salaryPayments.path, { id: staff.id }),
            { credentials: "include" }
          );
          if (!res.ok) return [];
          const body = await res.json();
          const parsed = api.staff.salaryPayments.responses[200].safeParse(body);
          return parsed.success ? parsed.data : (body as Array<{ paymentMonth: string; netSalary: string | number }>);
        },
        enabled: !!staffList,
      })) || [],
  });

  // Map staffId → total paid amount for the selected month
  const staffPaidMap = useMemo(() => {
    const map = new Map<number, number>();
    salaryPaymentQueries.forEach((query, index) => {
      const staffId = staffList?.[index]?.id;
      if (!staffId) return;
      const payments = query.data ?? [];
      // paymentMonth is stored as YYYY-MM-DD; selectedMonth is YYYY-MM
      const monthTotal = payments
        .filter((p) => String(p.paymentMonth).startsWith(selectedMonth))
        .reduce((sum, p) => sum + Number(p.netSalary), 0);
      map.set(staffId, monthTotal);
    });
    return map;
  }, [salaryPaymentQueries, staffList, selectedMonth]);

  // Derive month/year from selectedMonth
  const [selectedYear, selectedMonthNum] = selectedMonth.split("-").map(Number);
  const monthLabel = new Date(selectedYear, (selectedMonthNum ?? 1) - 1, 1).toLocaleDateString(
    "en-US",
    { month: "long" }
  );

  // Calculate payroll entries
  const payrollEntries = useMemo(() => {
    if (!staffList || !staffSalaryStructures) return [];

    return staffList.map((staff) => {
      const structureData = staffSalaryStructures.find((s) => s.staffId === staff.id)?.structure;

      if (!structureData) {
        return {
          staffId: staff.id,
          employeeId: staff.employeeId,
          name: `${staff.firstName} ${staff.lastName}`,
          month: monthLabel,
          year: selectedYear ?? new Date().getFullYear(),
          baseSalary: 0,
          allowances: {} as Record<string, number>,
          deductions: {} as Record<string, number>,
          grossSalary: 0,
          totalDeductions: 0,
          netSalary: 0,
          paid: 0,
          balance: 0,
          structureId: undefined as number | undefined,
          structureRecord: undefined as SalaryStructureRecord | undefined,
        };
      }

      const baseSalary = Number(structureData.basicSalary) || 0;
      const allowances = (structureData.allowances ?? {}) as Record<string, number>;
      const deductions = (structureData.deductions ?? {}) as Record<string, number>;

      const totalAllowances = Object.values(allowances).reduce(
        (sum: number, val: unknown) => sum + Number(val),
        0
      );

      // Compute absence deduction from stored deductions
      // "Absence Deduction" key holds the computed PKR amount
      const absenceDeductionAmt = Number(deductions["Absence Deduction"] ?? 0);
      const otherDeductionAmt = Number(deductions["Other Deduction"] ?? 0);
      const totalDeductions = absenceDeductionAmt + otherDeductionAmt;

      const grossSalary = baseSalary + totalAllowances;
      const netSalary = Math.max(0, grossSalary - totalDeductions);

      // paid = sum of netSalary from salary_payments for this staff + selected month
      const paid = staffPaidMap.get(staff.id) ?? 0;
      const balance = Math.max(0, netSalary - paid);

      return {
        staffId: staff.id,
        employeeId: staff.employeeId,
        name: `${staff.firstName} ${staff.lastName}`,
        month: monthLabel,
        year: selectedYear ?? new Date().getFullYear(),
        baseSalary,
        allowances,
        deductions,
        grossSalary,
        totalDeductions,
        netSalary,
        paid,
        balance,
        structureId: structureData.id,
        structureRecord: structureData,
      };
    });
  }, [staffList, staffSalaryStructures, monthLabel, selectedYear, staffPaidMap]);

  // ── Add / Edit salary handler ────────────────────────────────────────────────
  const handleAddSalary = (entry: PayrollEntry) => {
    setSalaryDialogTarget({
      staffId: entry.staffId,
      staffName: entry.name,
      existing: entry.structureRecord,
    });
    setSalaryDialogOpen(true);
  };

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
    onSuccess: (_result, variables) => {
      toast({
        title: "Payment processed successfully",
        description: `Salary payment for ${variables.entry.name} has been recorded.`,
      });
      // Invalidate salary payments so Paid / Balance columns update immediately
      queryClient.invalidateQueries({ queryKey: [SALARY_PAYMENTS_KEY, variables.entry.staffId, selectedMonth] });
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
  const totalGross = payrollEntries.reduce((sum, entry) => sum + entry.grossSalary, 0);
  const totalDeductions = payrollEntries.reduce((sum, entry) => sum + entry.totalDeductions, 0);
  const totalNet = payrollEntries.reduce((sum, entry) => sum + entry.netSalary, 0);
  const totalPaid = payrollEntries.reduce((sum, entry) => sum + entry.paid, 0);
  const totalBalance = payrollEntries.reduce((sum, entry) => sum + entry.balance, 0);

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
              Payroll Summary &ndash;{" "}
              {new Date(selectedMonth + "-01").toLocaleDateString("en-US", {
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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                  <div className="text-sm text-green-600">Total Gross</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(totalDeductions)}
                  </div>
                  <div className="text-sm text-red-600">Total Deductions</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {formatCurrency(totalNet)}
                  </div>
                  <div className="text-sm text-purple-600">Total Net</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency(totalBalance)}
                  </div>
                  <div className="text-sm text-orange-600">Total Balance</div>
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
                      <TableHead>Employee Name</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead className="text-right">Base Salary</TableHead>
                      <TableHead className="text-right">Allowances</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net Salary</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollEntries.map((entry) => (
                      <TableRow key={entry.staffId}>
                        <TableCell className="font-medium">
                          {entry.employeeId || "—"}
                        </TableCell>
                        <TableCell>{entry.name}</TableCell>
                        <TableCell>{entry.month}</TableCell>
                        <TableCell>{entry.year}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(entry.baseSalary)}
                        </TableCell>
                        <TableCell className="text-right text-green-700">
                          {formatCurrency(entry.grossSalary - entry.baseSalary)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatCurrency(entry.totalDeductions)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(entry.netSalary)}
                        </TableCell>
                        <TableCell className="text-right text-blue-600">
                          {formatCurrency(entry.paid)}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.balance > 0 ? (
                            <span className="text-orange-600 font-medium">
                              {formatCurrency(entry.balance)}
                            </span>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
                              Paid
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant={entry.structureId ? "outline" : "default"}
                              onClick={() => handleAddSalary(entry)}
                            >
                              {entry.structureId ? (
                                <>
                                  <Pencil className="h-4 w-4 mr-1" />
                                  Edit Salary
                                </>
                              ) : (
                                <>
                                  <PlusCircle className="h-4 w-4 mr-1" />
                                  Add Salary
                                </>
                              )}
                            </Button>
                            {entry.structureId && (
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
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Salary History & Ledger Reconciliation Section */}
        <SalaryHistorySection />

        {/* Payment Processing Dialog */}
        <Dialog open={processingDialogOpen} onOpenChange={setProcessingDialogOpen}>
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
                    Employee ID: {selectedEntry.employeeId || "—"}
                  </p>
                  <p className="text-lg font-bold text-green-600 mt-2">
                    Net Salary: {formatCurrency(selectedEntry.netSalary)}
                  </p>
                  {selectedEntry.balance < selectedEntry.netSalary && (
                    <p className="text-sm text-orange-600">
                      Balance remaining: {formatCurrency(selectedEntry.balance)}
                    </p>
                  )}
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
                              <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
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
                          <FormLabel>Transaction ID / Reference (Optional)</FormLabel>
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

        {/* Add / Edit Salary Structure Dialog */}
        {salaryDialogTarget && (
          <AddSalaryDialog
            open={salaryDialogOpen}
            onOpenChange={(open) => {
              setSalaryDialogOpen(open);
              if (!open) setSalaryDialogTarget(null);
            }}
            staffId={salaryDialogTarget.staffId}
            staffName={salaryDialogTarget.staffName}
            existing={salaryDialogTarget.existing}
            payrollMonth={selectedMonth}
            onSaved={() => {
              // Invalidate salary structure queries so the table refreshes
              queryClient.invalidateQueries({
                queryKey: [api.staff.salaryStructure.get.path],
              });
            }}
          />
        )}
      </div>
    </Layout>
  );
}
