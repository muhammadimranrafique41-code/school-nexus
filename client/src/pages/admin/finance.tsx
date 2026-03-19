import { useEffect, useMemo, useState } from "react";
import { feeStatuses, buildDueDateForBillingMonth, formatBillingPeriod } from "@shared/finance";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { useStudents } from "@/hooks/use-users";
import {
  type BillingProfileRecord,
  type FinanceReportFilters,
  type MonthlyGenerationResult,
  useBillingProfiles,
  useCreateFee,
  useDeleteFee,
  useFeeBalanceSummary,
  useFinanceReport,
  useGenerateMonthlyFees,
  useOverdueBalances,
  useRecordFeePayment,
  useUpdateFee,
  useUpsertBillingProfile,
} from "@/hooks/use-fees";
import { FeeAdjustmentDialog } from "./finance/FeeAdjustmentDialog";
import { GenerateSingleStudentFeeDialog } from "./finance/GenerateSingleStudentFeeDialog";
import { ApplyLateFeeDialog } from "./finance/ApplyLateFeeDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Banknote, CalendarDays, Clock, CreditCard, Download, Eye, FilePlus2, Loader2, Pencil, Printer, ReceiptText, RefreshCcw, Search, Settings2, Trash2, Users, Zap, Gift } from "lucide-react";
import { buildInvoicePrintHtml, buildPaymentReceiptPrintHtml, type FeePaymentRecord, type FeeRecord, getCurrentBillingMonth, getFeeStatusClassName, getLatestRecordedPayment } from "@/lib/finance";
import { downloadCsv, formatCurrency, formatDate, getErrorMessage, openPrintWindow, paginateItems } from "@/lib/utils";

const PAGE_SIZE = 8;
type InvoiceFormState = { studentId: string; amount: string; billingMonth: string; dueDate: string; description: string; feeType: string; notes: string; discount: string; discountReason: string };
type PaymentFormState = { amount: string; paymentDate: string; method: "Cash" | "Bank Transfer" | "Card" | "Mobile Money" | "Cheque" | "Other"; reference: string; notes: string; discount: string; discountReason: string };
type BillingProfileFormState = { studentId: string; monthlyAmount: string; dueDay: string; isActive: boolean; notes: string };
type GenerationFormState = { billingMonth: string; dueDayOverride: string };

function createDefaultInvoiceForm(studentId = ""): InvoiceFormState {
  const billingMonth = getCurrentBillingMonth();
  return { studentId, amount: "", billingMonth, dueDate: buildDueDateForBillingMonth(billingMonth, 5), description: "Monthly tuition fee", feeType: "Monthly Fee", notes: "", discount: "", discountReason: "" };
}
function createDefaultPaymentForm(balance = 0): PaymentFormState {
  return { amount: balance > 0 ? String(balance) : "", paymentDate: new Date().toISOString().slice(0, 10), method: "Cash", reference: "", notes: "", discount: "", discountReason: "" };
}
function createDefaultBillingProfileForm(studentId = ""): BillingProfileFormState {
  return { studentId, monthlyAmount: "", dueDay: "5", isActive: true, notes: "" };
}
function buildStatusBadge(status: FeeRecord["status"]) {
  return <Badge variant="outline" className={getFeeStatusClassName(status)}>{status}</Badge>;
}

function formatPercentage(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

export default function Finance() {
  usePublicSchoolSettings();
  const { toast } = useToast();
  const { data: students = [] } = useStudents();
  const { data: profiles = [], isLoading: profilesLoading } = useBillingProfiles();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FeeRecord["status"]>("all");
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<number | null>(null);
  const [detailInvoiceId, setDetailInvoiceId] = useState<number | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<number | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editingProfileStudentId, setEditingProfileStudentId] = useState<number | null>(null);
  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [lateFeeDialogOpen, setLateFeeDialogOpen] = useState(false);
  const [singleStudentFeeDialogOpen, setSingleStudentFeeDialogOpen] = useState(false);
  const [lastGenerationResult, setLastGenerationResult] = useState<MonthlyGenerationResult | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormState>(() => createDefaultInvoiceForm());
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(() => createDefaultPaymentForm());
  const [profileForm, setProfileForm] = useState<BillingProfileFormState>(() => createDefaultBillingProfileForm());
  const [generationForm, setGenerationForm] = useState<GenerationFormState>({ billingMonth: getCurrentBillingMonth(), dueDayOverride: "" });
  const createFee = useCreateFee();
  const updateFee = useUpdateFee();
  const deleteFee = useDeleteFee();
  const recordPayment = useRecordFeePayment();
  const upsertBillingProfile = useUpsertBillingProfile();
  const generateMonthlyFees = useGenerateMonthlyFees();
  const reportFilters = useMemo<FinanceReportFilters>(() => ({ month: monthFilter === "all" ? undefined : monthFilter, studentId: studentFilter === "all" ? undefined : Number(studentFilter), status: statusFilter === "all" ? undefined : statusFilter }), [monthFilter, statusFilter, studentFilter]);
  const { data: report, isLoading: reportLoading } = useFinanceReport(reportFilters);
  const { data: balanceSummary } = useFeeBalanceSummary();
  const { data: overdueBalances = [] } = useOverdueBalances();
  const studentsList = useMemo(() => [...students].sort((a, b) => a.name.localeCompare(b.name)), [students]);
  const studentDirectory = useMemo(() => new Map(studentsList.map((student) => [student.id, student])), [studentsList]);
  const invoices = report?.invoices ?? [];
  const recentPayments = useMemo(() => [...(report?.payments ?? [])].sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate)).slice(0, 6), [report?.payments]);
  const paymentMethodBreakdown = useMemo(() => (report?.paymentMethodBreakdown ?? []).filter((item) => item.count > 0 || item.amount > 0), [report?.paymentMethodBreakdown]);
  const classBreakdown = useMemo(() => (report?.classBreakdown ?? []).slice(0, 6), [report?.classBreakdown]);
  const overduePreview = useMemo(() => overdueBalances.slice(0, 4), [overdueBalances]);
  const invoiceDirectory = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices]);
  const selectedInvoice = useMemo(() => invoices.find((i) => i.id === detailInvoiceId), [detailInvoiceId, invoices]);
  const editingInvoice = useMemo(() => invoices.find((i) => i.id === editingInvoiceId), [editingInvoiceId, invoices]);
  const paymentInvoice = useMemo(() => invoices.find((i) => i.id === paymentInvoiceId), [invoices, paymentInvoiceId]);
  const deletingInvoice = useMemo(() => invoices.find((i) => i.id === deleteInvoiceId), [deleteInvoiceId, invoices]);
  const editingProfile = useMemo(() => profiles.find((p) => p.studentId === editingProfileStudentId), [editingProfileStudentId, profiles]);
  const filteredInvoices = useMemo(() => invoices.filter((invoice) => [invoice.invoiceNumber ?? `INV-${invoice.id}`, invoice.student?.name ?? "", invoice.student?.className ?? "", invoice.billingPeriod, invoice.description, invoice.status].join(" ").toLowerCase().includes(searchTerm.trim().toLowerCase())), [invoices, searchTerm]);
  const paginated = paginateItems(filteredInvoices, currentPage, PAGE_SIZE);
  const missingProfiles = useMemo(() => { const existing = new Set(profiles.map((p) => p.studentId)); return studentsList.filter((student) => !existing.has(student.id)); }, [profiles, studentsList]);
  const billingMonths = useMemo(() => Array.from(new Set(invoices.map((invoice) => invoice.billingMonth))).sort((a, b) => b.localeCompare(a)), [invoices]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, monthFilter, statusFilter, studentFilter]);

  const openCreateInvoiceDialog = () => {
    setEditingInvoiceId(null);
    setInvoiceForm(createDefaultInvoiceForm(studentFilter === "all" ? "" : studentFilter));
    setInvoiceDialogOpen(true);
  };

  const openEditInvoiceDialog = (invoice: FeeRecord) => {
    setEditingInvoiceId(invoice.id);
    setInvoiceForm({
      studentId: String(invoice.studentId),
      amount: String(invoice.amount),
      billingMonth: invoice.billingMonth,
      dueDate: invoice.dueDate,
      description: invoice.description,
      feeType: invoice.feeType,
      notes: invoice.notes ?? "",
      discount: "",
      discountReason: "",
    });
    setInvoiceDialogOpen(true);
  };

  const openPaymentDialog = (invoice: FeeRecord) => {
    setPaymentInvoiceId(invoice.id);
    setPaymentForm(createDefaultPaymentForm(invoice.remainingBalance));
    setPaymentDialogOpen(true);
  };

  const openProfileDialog = (profile?: BillingProfileRecord) => {
    setEditingProfileStudentId(profile?.studentId ?? null);
    setProfileForm(
      profile
        ? {
          studentId: String(profile.studentId),
          monthlyAmount: String(profile.monthlyAmount),
          dueDay: String(profile.dueDay),
          isActive: profile.isActive,
          notes: profile.notes ?? "",
        }
        : createDefaultBillingProfileForm(studentFilter === "all" ? "" : studentFilter),
    );
    setProfileDialogOpen(true);
  };

  const handlePrintInvoice = (invoice: FeeRecord) => {
    openPrintWindow(invoice.invoiceNumber ?? `Invoice ${invoice.id}`, buildInvoicePrintHtml(invoice), {
      documentType: "invoice",
      subtitle: `${invoice.student?.name ?? `Student #${invoice.studentId}`} • ${invoice.billingPeriod}`,
    });
  };

  const handlePrintReceipt = (invoice: FeeRecord, payment: FeePaymentRecord) => {
    openPrintWindow(payment.receiptNumber ?? `Receipt ${payment.id}`, buildPaymentReceiptPrintHtml(invoice, payment), {
      documentType: "receipt",
      subtitle: `${invoice.student?.name ?? `Student #${invoice.studentId}`} • ${invoice.invoiceNumber ?? `INV-${invoice.id}`}`,
    });
  };

  const handleExportInvoices = () => {
    downloadCsv(
      `finance-report-${monthFilter === "all" ? "all" : monthFilter}.csv`,
      filteredInvoices.map((invoice) => ({
        Invoice: invoice.invoiceNumber ?? `INV-${invoice.id}`,
        Student: invoice.student?.name ?? `Student #${invoice.studentId}`,
        Class: invoice.student?.className ?? "",
        BillingMonth: invoice.billingMonth,
        BillingPeriod: invoice.billingPeriod,
        DueDate: invoice.dueDate,
        TotalAmount: invoice.amount,
        PaidAmount: invoice.paidAmount,
        RemainingBalance: invoice.remainingBalance,
        Status: invoice.status,
      })),
    );
  };

  const handleInvoiceSubmit = async () => {
    try {
      const amount = Number(invoiceForm.amount);
      const discount = invoiceForm.discount ? Number(invoiceForm.discount) : null;
      
      // Validate discount
      if (discount && discount > amount) {
        throw new Error("Discount cannot exceed invoice amount");
      }
      
      const payload = {
        studentId: Number(invoiceForm.studentId),
        amount,
        billingMonth: invoiceForm.billingMonth,
        billingPeriod: formatBillingPeriod(invoiceForm.billingMonth),
        dueDate: invoiceForm.dueDate,
        description: invoiceForm.description.trim(),
        feeType: invoiceForm.feeType.trim() || "Monthly Fee",
        notes: invoiceForm.notes.trim() || null,
        lineItems: [{ label: invoiceForm.description.trim() || "Invoice item", amount }],
        source: "manual" as const,
        discount: discount || null,
        discountReason: (discount && invoiceForm.discountReason.trim()) || null,
      };

      if (editingInvoice) {
        await updateFee.mutateAsync({ id: editingInvoice.id, ...payload });
      } else {
        await createFee.mutateAsync(payload);
      }

      toast({
        title: editingInvoice ? "Invoice updated" : "Invoice created",
        description: `${invoiceForm.description} for ${formatCurrency(amount)} has been saved.`,
      });
      setInvoiceDialogOpen(false);
      setEditingInvoiceId(null);
      setInvoiceForm(createDefaultInvoiceForm(studentFilter === "all" ? "" : studentFilter));
    } catch (error) {
      toast({ title: "Unable to save invoice", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handlePaymentSubmit = async () => {
    if (!paymentInvoice) return;

    try {
      const amount = Number(paymentForm.amount);
      // Discount is in the same currency unit as amount, not cents
      const discount = paymentForm.discount ? Number(paymentForm.discount) : null;

      if (!amount || amount <= 0) {
        throw new Error("Payment amount must be greater than 0");
      }

      // Discount cannot exceed the remaining balance
      if (discount && discount > paymentInvoice.remainingBalance) {
        throw new Error("Discount cannot exceed the remaining invoice balance");
      }

      // Calculate net balance after discount
      const balanceAfterDiscount = paymentInvoice.remainingBalance - (discount || 0);
      
      // Payment amount alone should not exceed original balance (but can exceed balance-after-discount for overpayment)
      if (amount > paymentInvoice.remainingBalance) {
        throw new Error(`Payment cannot exceed remaining balance of ${formatCurrency(paymentInvoice.remainingBalance)}`);
      }

      const updatedInvoice = await recordPayment.mutateAsync({
        id: paymentInvoice.id,
        amount,
        paymentDate: paymentForm.paymentDate,
        method: paymentForm.method,
        reference: paymentForm.reference.trim() || null,
        notes: paymentForm.notes.trim() || null,
        discount: discount || null,
        discountReason: (discount && paymentForm.discountReason.trim()) || null,
      });
      const recordedPayment = getLatestRecordedPayment(updatedInvoice);

      const discountText = discount ? ` + ${formatCurrency(discount)} discount` : "";
      toast({
        title: "Payment recorded",
        description: `${formatCurrency(amount)}${discountText} has been applied to ${paymentInvoice.invoiceNumber ?? `invoice ${paymentInvoice.id}`}.`,
      });
      setPaymentDialogOpen(false);
      setPaymentInvoiceId(null);
      setPaymentForm(createDefaultPaymentForm());
      setDetailInvoiceId(null);

      if (recordedPayment) {
        handlePrintReceipt(updatedInvoice, recordedPayment);
      }
    } catch (error) {
      toast({ title: "Unable to record payment", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handleProfileSubmit = async () => {
    try {
      await upsertBillingProfile.mutateAsync({
        studentId: Number(profileForm.studentId),
        monthlyAmount: Number(profileForm.monthlyAmount),
        dueDay: Number(profileForm.dueDay),
        isActive: profileForm.isActive,
        notes: profileForm.notes.trim() || null,
      });
      toast({
        title: editingProfile ? "Billing profile updated" : "Billing profile saved",
        description: "Monthly billing defaults are now available for fee generation.",
      });
      setProfileDialogOpen(false);
      setEditingProfileStudentId(null);
      setProfileForm(createDefaultBillingProfileForm(studentFilter === "all" ? "" : studentFilter));
    } catch (error) {
      toast({ title: "Unable to save billing profile", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handleGenerateMonthlyFees = async () => {
    try {
      const result = await generateMonthlyFees.mutateAsync({
        billingMonth: generationForm.billingMonth,
        dueDayOverride: generationForm.dueDayOverride ? Number(generationForm.dueDayOverride) : undefined,
      });
      setLastGenerationResult(result);
      toast({
        title: "Monthly fee generation complete",
        description: `Generated ${result.generatedCount} invoice(s), skipped ${result.skippedDuplicates} duplicate(s), and flagged ${result.skippedMissingProfiles} student(s) without active billing setup.`,
      });
    } catch (error) {
      toast({ title: "Unable to generate monthly invoices", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handleDeleteInvoice = async () => {
    if (!deletingInvoice) return;

    try {
      await deleteFee.mutateAsync(deletingInvoice.id);
      toast({
        title: "Invoice deleted",
        description: `${deletingInvoice.invoiceNumber ?? `Invoice ${deletingInvoice.id}`} has been removed.`,
      });
      setDeleteInvoiceId(null);
    } catch (error) {
      toast({ title: "Unable to delete invoice", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-8 pb-8">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Finance Workspace</h1>
            <p className="mt-1 text-muted-foreground">Manage invoices, payments, monthly fee generation, reporting, and print-ready student billing documents.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setGenerationDialogOpen(true)}><RefreshCcw className="mr-2 h-4 w-4" />Generate monthly fees</Button>
            <Button variant="outline" onClick={() => setSingleStudentFeeDialogOpen(true)}><Zap className="mr-2 h-4 w-4" />Single student fee</Button>
            <Button variant="outline" onClick={() => setAdjustmentDialogOpen(true)}><Gift className="mr-2 h-4 w-4" />Fee adjustment</Button>
            <Button variant="outline" onClick={() => setLateFeeDialogOpen(true)}><Clock className="mr-2 h-4 w-4" />Apply late fee</Button>
            <Button variant="outline" onClick={() => openProfileDialog()}><Settings2 className="mr-2 h-4 w-4" />Billing profiles</Button>
            <Button variant="outline" onClick={handleExportInvoices} disabled={filteredInvoices.length === 0}><Download className="mr-2 h-4 w-4" />Export invoices</Button>
            <Button onClick={openCreateInvoiceDialog}><FilePlus2 className="mr-2 h-4 w-4" />Create invoice</Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {[
            { label: "Total billed", value: formatCurrency(report?.summary.totalBilled ?? 0), hint: `${report?.summary.totalInvoices ?? 0} invoice(s)`, icon: Banknote },
            { label: "Collected", value: formatCurrency(report?.summary.totalPaid ?? 0), hint: `${report?.summary.paymentsCount ?? 0} payment(s)`, icon: ReceiptText },
            { label: "Collection rate", value: formatPercentage(report?.summary.collectionRate ?? 0), hint: `${report?.summary.studentsWithOutstanding ?? 0} student(s) with balance`, icon: ReceiptText },
            { label: "Outstanding", value: formatCurrency(report?.summary.totalOutstanding ?? 0), hint: `${balanceSummary?.openInvoices ?? 0} open invoice(s)`, icon: CreditCard },
            { label: "Overdue balance", value: formatCurrency(report?.summary.overdueBalance ?? 0), hint: `${report?.summary.overdueInvoices ?? 0} overdue invoice(s)`, icon: CalendarDays },
            { label: "Due soon / missing profiles", value: `${balanceSummary?.dueSoonInvoices ?? 0} / ${missingProfiles.length}`, hint: `${profiles.length} billing profile(s) configured`, icon: Users },
          ].map((item) => (
            <Card key={item.label} className="bg-white/80"><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p><p className="mt-2 text-3xl font-display font-bold text-slate-900">{item.value}</p><p className="mt-2 text-xs text-slate-500">{item.hint}</p></div><div className="rounded-2xl bg-violet-50 p-3 text-violet-600"><item.icon className="h-5 w-5" /></div></CardContent></Card>
          ))}
        </section>

        <Card className="bg-white/80">
          <CardHeader><CardTitle>Report filters</CardTitle><CardDescription>Filter finance activity by month, student, status, and free-text search.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1.5fr_repeat(3,minmax(0,1fr))_auto]">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by student, invoice number, class, or description" className="pl-9" /></div>
            <Select value={monthFilter} onValueChange={setMonthFilter}><SelectTrigger><SelectValue placeholder="All months" /></SelectTrigger><SelectContent><SelectItem value="all">All months</SelectItem>{billingMonths.map((month) => <SelectItem key={month} value={month}>{formatBillingPeriod(month)}</SelectItem>)}</SelectContent></Select>
            <Select value={studentFilter} onValueChange={setStudentFilter}><SelectTrigger><SelectValue placeholder="All students" /></SelectTrigger><SelectContent><SelectItem value="all">All students</SelectItem>{studentsList.map((student) => <SelectItem key={student.id} value={String(student.id)}>{student.name} {student.className ? `(${student.className})` : ""}</SelectItem>)}</SelectContent></Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | FeeRecord["status"])}><SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{feeStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>
            <Button variant="outline" onClick={() => { setSearchTerm(""); setMonthFilter("all"); setStudentFilter("all"); setStatusFilter("all"); }}>Clear filters</Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2.2fr)_340px]">
          <Card className="overflow-hidden bg-white/80">
            <CardHeader className="gap-4 border-b pb-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><CardTitle>Invoices</CardTitle><CardDescription>Detailed invoice ledger with clear billing, payment, balance, due-date, and status visibility.</CardDescription></div><div className="grid gap-2 sm:grid-cols-2"><div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Matching invoices</p><p className="mt-1 text-lg font-semibold text-slate-900">{filteredInvoices.length}</p></div><div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Outstanding</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(filteredInvoices.reduce((sum, invoice) => sum + invoice.remainingBalance, 0))}</p></div></div></div></CardHeader>
            <CardContent className="p-0">
              <div className="hidden border-b bg-slate-50/70 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1.05fr)_minmax(96px,0.5fr)_minmax(96px,0.5fr)_minmax(110px,0.55fr)_minmax(100px,0.5fr)_minmax(100px,0.5fr)_minmax(110px,0.65fr)_auto] lg:gap-4">
                <span>Student</span>
                <span>Invoice</span>
                <span>Total</span>
                <span>Paid</span>
                <span>Balance</span>
                <span>Discount</span>
                <span>Late Fee</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>

              {reportLoading ? (
                <div className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
              ) : filteredInvoices.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">No invoices match the current filters.</div>
              ) : (
                paginated.pageItems.map((invoice) => (
                  <div key={invoice.id} className="border-b border-slate-200/70 px-5 py-4 last:border-b-0">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1.05fr)_minmax(96px,0.5fr)_minmax(96px,0.5fr)_minmax(110px,0.55fr)_minmax(100px,0.5fr)_minmax(100px,0.5fr)_minmax(110px,0.65fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">{invoice.student?.name ?? `Student #${invoice.studentId}`}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <span>{invoice.student?.className ?? "Class not assigned"}</span>
                          <span className="hidden sm:inline">•</span>
                          <span className="truncate">{invoice.description}</span>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{invoice.invoiceNumber ?? `INV-${invoice.id}`}</p>
                        <div className="mt-1 space-y-1 text-xs text-slate-500">
                          <p>{invoice.billingPeriod}</p>
                          <p>Due {formatDate(invoice.dueDate, "MMM dd, yyyy")}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-50/80 p-3 lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">Total</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 lg:mt-0">{formatCurrency(invoice.amount)}</p>
                      </div>

                      <div className="rounded-2xl bg-slate-50/80 p-3 lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">Paid</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-700 lg:mt-0">{formatCurrency(invoice.paidAmount)}</p>
                      </div>

                      <div className="rounded-2xl bg-slate-50/80 p-3 lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">Balance</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 lg:mt-0">{formatCurrency(invoice.remainingBalance)}</p>
                      </div>

                      <div className="rounded-2xl bg-amber-50/80 p-3 lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">Discount</p>
                        <p className="mt-1 text-sm font-semibold text-amber-700 lg:mt-0">
                          {invoice.totalDiscount > 0 ? formatCurrency(invoice.totalDiscount) : "—"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-rose-50/80 p-3 lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">Late Fee</p>
                        <p className="mt-1 text-sm font-semibold text-rose-700 lg:mt-0">
                          {(() => {
                            const lateFees = (invoice.adjustments ?? []).filter((adj: any) => adj.type === "fine").reduce((sum: number, adj: any) => sum + adj.amount, 0);
                            return lateFees > 0 ? formatCurrency(lateFees) : "—";
                          })()}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50/80 p-3 lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">Status</p>
                        <div className="mt-1 flex flex-col gap-2 lg:mt-0">
                          <div>{buildStatusBadge(invoice.status)}</div>
                          <p className="text-xs text-slate-500">{invoice.paymentCount} payment{invoice.paymentCount === 1 ? "" : "s"}</p>
                        </div>
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" title="View invoice details" aria-label={`View details for ${invoice.invoiceNumber ?? `invoice ${invoice.id}`}`} onClick={() => setDetailInvoiceId(invoice.id)}><Eye className="h-3.5 w-3.5" /></Button>
                          {invoice.remainingBalance > 0 && <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" title="Record payment" aria-label={`Record payment for ${invoice.invoiceNumber ?? `invoice ${invoice.id}`}`} onClick={() => openPaymentDialog(invoice)}><ReceiptText className="h-3.5 w-3.5" /></Button>}
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" title="Print invoice" aria-label={`Print ${invoice.invoiceNumber ?? `invoice ${invoice.id}`}`} onClick={() => handlePrintInvoice(invoice)}><Printer className="h-3.5 w-3.5" /></Button>
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" title="Edit invoice" aria-label={`Edit ${invoice.invoiceNumber ?? `invoice ${invoice.id}`}`} onClick={() => openEditInvoiceDialog(invoice)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" title="Delete invoice" aria-label={`Delete ${invoice.invoiceNumber ?? `invoice ${invoice.id}`}`} onClick={() => setDeleteInvoiceId(invoice.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
            {filteredInvoices.length > 0 && <div className="flex flex-col gap-3 border-t p-4 md:flex-row md:items-center md:justify-between"><p className="text-sm text-muted-foreground">Showing {(paginated.currentPage - 1) * PAGE_SIZE + 1}-{Math.min(paginated.currentPage * PAGE_SIZE, filteredInvoices.length)} of {filteredInvoices.length} invoice(s)</p><Pagination className="mx-0 w-auto justify-end"><PaginationContent><PaginationItem><PaginationPrevious href="#" className={paginated.currentPage === 1 ? "pointer-events-none opacity-50" : ""} onClick={(event) => { event.preventDefault(); setCurrentPage((page) => Math.max(1, page - 1)); }} /></PaginationItem><PaginationItem><span className="px-4 text-sm text-muted-foreground">Page {paginated.currentPage} of {paginated.totalPages}</span></PaginationItem><PaginationItem><PaginationNext href="#" className={paginated.currentPage === paginated.totalPages ? "pointer-events-none opacity-50" : ""} onClick={(event) => { event.preventDefault(); setCurrentPage((page) => Math.min(paginated.totalPages, page + 1)); }} /></PaginationItem></PaginationContent></Pagination></div>}
          </Card>

          <div className="space-y-4">
            <Card className="bg-white/80"><CardHeader className="space-y-1 pb-3"><CardTitle className="text-base">Status breakdown</CardTitle><CardDescription className="text-xs">Invoice count and billed value by status.</CardDescription></CardHeader><CardContent className="grid gap-2">{(report?.statusBreakdown ?? []).length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">No invoice status data for the active filters.</div> : (report?.statusBreakdown ?? []).map((item) => <div key={item.status} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3"><div className="flex items-start justify-between gap-3"><div className="space-y-1"><div>{buildStatusBadge(item.status)}</div><p className="text-[11px] text-slate-500">{item.count} invoice(s)</p></div><p className="text-sm font-semibold text-slate-900">{formatCurrency(item.amount)}</p></div></div>)}</CardContent></Card>
            <Card className="bg-white/80"><CardHeader className="space-y-1 pb-3"><CardTitle className="text-base">Balance monitor</CardTitle><CardDescription className="text-xs">Open balances, due-soon counts, and oldest overdue invoices.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-2 gap-2">{[{ label: "Open invoices", value: balanceSummary?.openInvoices ?? 0 }, { label: "Due soon", value: balanceSummary?.dueSoonInvoices ?? 0 }, { label: "Students overdue", value: balanceSummary?.studentsWithOverdue ?? 0 }, { label: "Overdue total", value: formatCurrency(balanceSummary?.totalOverdue ?? 0) }].map((item) => <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{item.label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p></div>)}</div>{overduePreview.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">No overdue invoices need follow-up right now.</div> : overduePreview.map((entry) => <div key={entry.invoiceId} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{entry.studentName}</p><p className="mt-1 text-[11px] text-slate-500">{entry.invoiceNumber ?? `INV-${entry.invoiceId}`} • {entry.className ?? "Unassigned"}</p></div><div className="text-right"><p className="text-sm font-semibold text-slate-900">{formatCurrency(entry.remainingBalance)}</p><p className="mt-1 text-[11px] text-rose-600">{entry.daysOverdue} day(s) overdue</p></div></div></div>)}</CardContent></Card>
            <Card className="bg-white/80"><CardHeader className="space-y-1 pb-3"><CardTitle className="text-base">Outstanding students</CardTitle><CardDescription className="text-xs">Students with open or overdue balances.</CardDescription></CardHeader><CardContent className="space-y-2.5">{(report?.outstandingStudents ?? []).length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">No outstanding balances for the active filter set.</div> : report?.outstandingStudents.slice(0, 5).map((student) => <div key={student.studentId} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{student.studentName}</p><p className="mt-1 text-[11px] text-slate-500">{student.className ?? "Unassigned"} • {student.invoiceCount} open invoice(s)</p>{student.oldestDueDate ? <p className="mt-1 text-[11px] text-slate-500">Oldest due {formatDate(student.oldestDueDate, "MMM dd, yyyy")}</p> : null}</div><div className="text-right"><p className="text-sm font-semibold text-slate-900">{formatCurrency(student.outstandingBalance)}</p>{student.overdueBalance > 0 && <p className="mt-1 text-[11px] text-rose-600">Overdue {formatCurrency(student.overdueBalance)}</p>}{student.maxDaysOverdue > 0 && <p className="mt-1 text-[11px] text-slate-500">{student.maxDaysOverdue} day(s) overdue</p>}</div></div></div>)}</CardContent></Card>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr_1fr]">
          <Card className="bg-white/80"><CardHeader><CardTitle>Recent payments</CardTitle><CardDescription>Latest recorded payment activity for the selected report filters.</CardDescription></CardHeader><CardContent className="space-y-3">{recentPayments.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">Payments will appear here once receipts are recorded.</div> : recentPayments.map((payment) => { const invoice = invoiceDirectory.get(payment.feeId); return <div key={payment.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-slate-900">{studentDirectory.get(payment.studentId)?.name ?? `Student #${payment.studentId}`}</p><p className="text-xs text-slate-500">{payment.receiptNumber ?? "Receipt pending"} • {payment.method} • {formatDate(payment.paymentDate, "MMM dd, yyyy")}</p>{invoice ? <p className="mt-1 text-xs text-slate-500">{invoice.invoiceNumber ?? `INV-${invoice.id}`} • {invoice.billingPeriod}</p> : null}</div><div className="flex items-center gap-3"><p className="text-sm font-semibold text-slate-900">{formatCurrency(payment.amount)}</p>{invoice ? <Button size="sm" variant="outline" onClick={() => handlePrintReceipt(invoice, payment)}><Printer className="mr-1.5 h-3.5 w-3.5" />Receipt</Button> : null}</div></div></div>; })}</CardContent></Card>
          <Card className="bg-white/80"><CardHeader><CardTitle>Monthly revenue</CardTitle><CardDescription>Month-by-month billed and collected totals from the finance report.</CardDescription></CardHeader><CardContent className="space-y-3">{(report?.monthlyRevenue ?? []).slice(0, 6).map((item) => <div key={item.month} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-900">{formatBillingPeriod(item.month)}</p><p className="text-sm text-slate-500">{item.month}</p></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Billed</p><p className="text-lg font-semibold text-slate-900">{formatCurrency(item.billed)}</p></div><div><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Collected</p><p className="text-lg font-semibold text-slate-900">{formatCurrency(item.paid)}</p></div></div></div>)}</CardContent></Card>
          <Card className="bg-white/80"><CardHeader><CardTitle>Billing profiles</CardTitle><CardDescription>Monthly defaults used for duplicate-safe invoice generation.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4"><p className="text-sm font-semibold text-slate-900">Configured profiles</p><p className="mt-1 text-xs text-slate-500">{profiles.length} profile(s) ready for automated monthly billing.</p></div><div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4"><p className="text-sm font-semibold text-slate-900">Students needing setup</p><p className="mt-1 text-xs text-slate-500">{missingProfiles.length} student(s) still need a billing profile.</p></div></div><div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => openProfileDialog()}><Settings2 className="mr-1.5 h-3.5 w-3.5" />Add profile</Button></div>{profilesLoading ? <div className="py-6 text-center text-sm text-slate-500">Loading billing profiles…</div> : profiles.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">No billing profiles yet. Add one to support monthly fee generation.</div> : profiles.slice(0, 6).map((profile) => <div key={profile.studentId} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{profile.student?.name ?? `Student #${profile.studentId}`}</p><p className="text-xs text-slate-500">Due day {profile.dueDay} • {formatCurrency(profile.monthlyAmount)}</p></div><Button size="sm" variant="ghost" onClick={() => openProfileDialog(profile)}>Edit</Button></div><div className="mt-2">{profile.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</div></div>)}</CardContent></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="bg-white/80"><CardHeader><CardTitle>Collections by payment method</CardTitle><CardDescription>How receipts are being recorded across payment channels.</CardDescription></CardHeader><CardContent className="space-y-3">{paymentMethodBreakdown.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">Payment methods will appear after receipts are recorded.</div> : paymentMethodBreakdown.map((item) => <div key={item.method} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.method}</p><p className="text-xs text-slate-500">{item.count} receipt(s)</p></div><p className="text-sm font-semibold text-slate-900">{formatCurrency(item.amount)}</p></div></div>)}</CardContent></Card>
          <Card className="bg-white/80"><CardHeader><CardTitle>Class balance and collection</CardTitle><CardDescription>Top classes by outstanding balance for the selected report filters.</CardDescription></CardHeader><CardContent className="space-y-3">{classBreakdown.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">Class-level balance trends will appear once invoices are available.</div> : classBreakdown.map((item) => <div key={item.className} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.className}</p><p className="text-xs text-slate-500">{item.studentCount} student(s) • {item.invoiceCount} invoice(s)</p></div><div className="text-right"><p className="text-sm font-semibold text-slate-900">{formatCurrency(item.outstanding)}</p><p className="text-xs text-slate-500">{formatPercentage(item.collectionRate)} collected</p></div></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><div><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Billed</p><p className="text-sm font-semibold text-slate-900">{formatCurrency(item.billed)}</p></div><div><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Paid</p><p className="text-sm font-semibold text-slate-900">{formatCurrency(item.paid)}</p></div><div><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Overdue</p><p className="text-sm font-semibold text-slate-900">{formatCurrency(item.overdueBalance)}</p></div></div></div>)}</CardContent></Card>
        </div>

        <Dialog open={invoiceDialogOpen} onOpenChange={(open) => { setInvoiceDialogOpen(open); if (!open) { setEditingInvoiceId(null); setInvoiceForm(createDefaultInvoiceForm(studentFilter === "all" ? "" : studentFilter)); } }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingInvoice ? "Edit invoice" : "Create invoice"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 pt-2 md:grid-cols-2">
              {/* Student (Full Width) */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Student</label>
                <Select value={invoiceForm.studentId} onValueChange={(value) => setInvoiceForm((current) => ({ ...current, studentId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select student" />
                  </SelectTrigger>
                  <SelectContent>
                    {studentsList.map((student) => (
                      <SelectItem key={student.id} value={String(student.id)}>
                        {student.name} {student.className ? `(${student.className})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Billing Month */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Billing month</label>
                <Input type="month" value={invoiceForm.billingMonth} onChange={(event) => setInvoiceForm((current) => ({ ...current, billingMonth: event.target.value }))} />
              </div>

              {/* Due Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Due date</label>
                <Input type="date" value={invoiceForm.dueDate} onChange={(event) => setInvoiceForm((current) => ({ ...current, dueDate: event.target.value }))} />
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input type="number" min="1" value={invoiceForm.amount} onChange={(event) => setInvoiceForm((current) => ({ ...current, amount: event.target.value }))} />
              </div>

              {/* Fee Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Fee type</label>
                <Input value={invoiceForm.feeType} onChange={(event) => setInvoiceForm((current) => ({ ...current, feeType: event.target.value }))} />
              </div>

              {/* Discount */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  🎁 Discount (Optional)
                </label>
                <Input type="number" min="0" step="0.01" value={invoiceForm.discount} onChange={(event) => setInvoiceForm((current) => ({ ...current, discount: event.target.value }))} placeholder="0.00" />
                {invoiceForm.discount && <p className="mt-1 text-xs text-amber-600">Discount: {formatCurrency(Number(invoiceForm.discount))}</p>}
              </div>

              {/* Discount Reason */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Discount reason</label>
                <Input value={invoiceForm.discountReason} onChange={(event) => setInvoiceForm((current) => ({ ...current, discountReason: event.target.value }))} placeholder="e.g., Merit award, scholarship" maxLength={200} disabled={!invoiceForm.discount} />
              </div>

              {/* Description (Full Width) */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Input value={invoiceForm.description} onChange={(event) => setInvoiceForm((current) => ({ ...current, description: event.target.value }))} />
              </div>

              {/* Internal Notes (Full Width) */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Internal notes</label>
                <Textarea value={invoiceForm.notes} onChange={(event) => setInvoiceForm((current) => ({ ...current, notes: event.target.value }))} rows={4} />
              </div>
            </div>

            {/* Summary Preview */}
            {(invoiceForm.amount || invoiceForm.discount) && (
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {invoiceForm.amount && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Invoice Amount</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatCurrency(Number(invoiceForm.amount))}</p>
                    </div>
                  )}
                  {invoiceForm.discount && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-amber-600">Discount</p>
                      <p className="mt-1 font-semibold text-amber-900">-{formatCurrency(Number(invoiceForm.discount))}</p>
                    </div>
                  )}
                  {invoiceForm.amount && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Net Amount</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatCurrency(Number(invoiceForm.amount) - (Number(invoiceForm.discount) || 0))}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleInvoiceSubmit} disabled={createFee.isPending || updateFee.isPending}>
                {createFee.isPending || updateFee.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingInvoice ? (
                  "Save invoice"
                ) : (
                  "Create invoice"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={paymentDialogOpen} onOpenChange={(open) => { setPaymentDialogOpen(open); if (!open) { setPaymentInvoiceId(null); setPaymentForm(createDefaultPaymentForm()); } }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record payment</DialogTitle>
              <DialogDescription>Record payment and optionally apply a discount to the invoice.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {/* Invoice Details */}
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                <p className="font-semibold text-slate-900">{paymentInvoice?.invoiceNumber ?? (paymentInvoice ? `Invoice ${paymentInvoice.id}` : "Invoice")}</p>
                <p className="text-sm text-slate-500">{paymentInvoice?.student?.name ?? "Select an invoice"}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Total</p>
                    <p className="font-semibold text-slate-900">{formatCurrency(paymentInvoice?.amount ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Paid</p>
                    <p className="font-semibold text-slate-900">{formatCurrency(paymentInvoice?.paidAmount ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Balance</p>
                    <p className="font-semibold text-slate-900">{formatCurrency(paymentInvoice?.remainingBalance ?? 0)}</p>
                  </div>
                </div>
              </div>

              {/* Payment Fields */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    💵 Amount *
                  </label>
                  <div className="relative">
                    <Input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" />
                    {paymentForm.amount && <p className="mt-1 text-xs text-slate-600">Payment: {formatCurrency(Number(paymentForm.amount))}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Payment date *</label>
                  <Input type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentDate: event.target.value }))} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Payment method *</label>
                  <Select value={paymentForm.method} onValueChange={(value) => setPaymentForm((current) => ({ ...current, method: value as PaymentFormState["method"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["Cash", "Bank Transfer", "Card", "Mobile Money", "Cheque", "Other"].map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Reference</label>
                  <Input value={paymentForm.reference} onChange={(event) => setPaymentForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Transaction reference" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    🎁 Discount (Optional)
                  </label>
                  <div className="relative">
                    <Input type="number" min="0" step="0.01" value={paymentForm.discount} onChange={(event) => setPaymentForm((current) => ({ ...current, discount: event.target.value }))} placeholder="0.00" />
                    {paymentForm.discount && <p className="mt-1 text-xs text-emerald-600">Discount: {formatCurrency(Number(paymentForm.discount))}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Discount reason</label>
                  <Input value={paymentForm.discountReason} onChange={(event) => setPaymentForm((current) => ({ ...current, discountReason: event.target.value }))} placeholder="e.g., Merit award, early payment discount" maxLength={200} disabled={!paymentForm.discount} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Textarea value={paymentForm.notes} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Additional payment details or instructions..." />
                </div>
              </div>

              {/* Summary */}
              {(paymentForm.amount || paymentForm.discount) && (
                <div className="rounded-2xl border-2 border-blue-100 bg-blue-50/50 p-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Payment amount:</span>
                      <span className="font-semibold text-slate-900">{formatCurrency(Number(paymentForm.amount) || 0)}</span>
                    </div>
                    {paymentForm.discount && (
                      <div className="flex items-center justify-between border-t border-blue-200 pt-2">
                        <span className="text-slate-600">Discount:</span>
                        <span className="font-semibold text-emerald-700">{formatCurrency(Number(paymentForm.discount))}</span>
                      </div>
                    )}
                    {(Number(paymentForm.amount) || 0) + (Number(paymentForm.discount) || 0) > 0 && (
                      <div className="flex items-center justify-between border-t border-blue-200 pt-2">
                        <span className="font-medium text-slate-900">Total adjustment:</span>
                        <span className="text-lg font-bold text-blue-600">{formatCurrency((Number(paymentForm.amount) || 0) + (Number(paymentForm.discount) || 0))}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
              <Button onClick={handlePaymentSubmit} disabled={recordPayment.isPending || !paymentInvoice || !paymentForm.amount}>
                {recordPayment.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ReceiptText className="mr-2 h-4 w-4" />}
                Record payment
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
          <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{editingProfile ? "Edit billing profile" : "Add billing profile"}</DialogTitle></DialogHeader><div className="grid gap-4 pt-2 md:grid-cols-2"><div className="space-y-2 md:col-span-2"><label className="text-sm font-medium">Student</label><Select value={profileForm.studentId} onValueChange={(value) => setProfileForm((current) => ({ ...current, studentId: value }))}><SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger><SelectContent>{studentsList.map((student) => <SelectItem key={student.id} value={String(student.id)}>{student.name} {student.className ? `(${student.className})` : ""}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><label className="text-sm font-medium">Monthly amount</label><Input type="number" min="1" value={profileForm.monthlyAmount} onChange={(event) => setProfileForm((current) => ({ ...current, monthlyAmount: event.target.value }))} /></div><div className="space-y-2"><label className="text-sm font-medium">Due day</label><Input type="number" min="1" max="28" value={profileForm.dueDay} onChange={(event) => setProfileForm((current) => ({ ...current, dueDay: event.target.value }))} /></div><div className="space-y-2 md:col-span-2"><label className="text-sm font-medium">Status</label><Select value={profileForm.isActive ? "active" : "inactive"} onValueChange={(value) => setProfileForm((current) => ({ ...current, isActive: value === "active" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div><div className="space-y-2 md:col-span-2"><label className="text-sm font-medium">Notes</label><Textarea value={profileForm.notes} onChange={(event) => setProfileForm((current) => ({ ...current, notes: event.target.value }))} rows={4} /></div></div><div className="flex justify-end gap-3 pt-2"><Button variant="outline" onClick={() => setProfileDialogOpen(false)}>Cancel</Button><Button onClick={handleProfileSubmit} disabled={upsertBillingProfile.isPending}>{upsertBillingProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save profile"}</Button></div></DialogContent>
        </Dialog>

        <Dialog open={generationDialogOpen} onOpenChange={setGenerationDialogOpen}>
          <DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Generate monthly fees</DialogTitle></DialogHeader><div className="grid gap-4 pt-2 md:grid-cols-2"><div className="space-y-2"><label className="text-sm font-medium">Billing month</label><Input type="month" value={generationForm.billingMonth} onChange={(event) => setGenerationForm((current) => ({ ...current, billingMonth: event.target.value }))} /></div><div className="space-y-2"><label className="text-sm font-medium">Due day override (optional)</label><Input type="number" min="1" max="28" value={generationForm.dueDayOverride} onChange={(event) => setGenerationForm((current) => ({ ...current, dueDayOverride: event.target.value }))} placeholder="Use profile due day if blank" /></div></div><div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm text-slate-600">Duplicate invoice generation is prevented automatically per student and billing month. Students without an active billing profile are skipped and reported.</div>{lastGenerationResult && <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4"><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Generated</p><p className="text-2xl font-display font-bold text-slate-900">{lastGenerationResult.generatedCount}</p></div><div><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Duplicates skipped</p><p className="text-2xl font-display font-bold text-slate-900">{lastGenerationResult.skippedDuplicates}</p></div><div><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Missing profiles</p><p className="text-2xl font-display font-bold text-slate-900">{lastGenerationResult.skippedMissingProfiles}</p></div></div>{lastGenerationResult.skippedStudents.length > 0 && <div className="space-y-2"><p className="text-sm font-semibold text-slate-900">Skipped students</p>{lastGenerationResult.skippedStudents.slice(0, 6).map((student) => <div key={`${student.studentId}-${student.reason}`} className="rounded-xl border border-slate-200/70 bg-white p-3 text-sm"><span className="font-medium text-slate-900">{student.studentName}</span><span className="ml-2 text-slate-500">{student.reason}</span></div>)}</div>}</div>}<div className="flex justify-end gap-3 pt-2"><Button variant="outline" onClick={() => setGenerationDialogOpen(false)}>Close</Button><Button onClick={handleGenerateMonthlyFees} disabled={generateMonthlyFees.isPending}>{generateMonthlyFees.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run generation"}</Button></div></DialogContent>
        </Dialog>

        <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setDetailInvoiceId(null)}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedInvoice?.invoiceNumber ?? (selectedInvoice ? `Invoice ${selectedInvoice.id}` : "Invoice details")}</DialogTitle>
            </DialogHeader>
            
            {selectedInvoice && (
              <div className="space-y-6 pt-4">
                {/* Header Info */}
                <div className="grid gap-4 md:grid-cols-4">
                  {(() => {
                    // Calculate actual status based on remaining balance (accounting for discounts)
                    const totalDiscount = (selectedInvoice as any).totalDiscount ?? (selectedInvoice.payments ?? []).reduce((sum: number, p: any) => sum + (p.discount || 0), 0);
                    const actualRemainingBalance = Math.max(0, selectedInvoice.remainingBalance - totalDiscount);
                    const actualStatus = actualRemainingBalance === 0 && selectedInvoice.paidAmount > 0 ? "Paid" : selectedInvoice.status;
                    
                    const headerItems = [
                      { label: "Student", value: selectedInvoice.student?.name ?? `Student #${selectedInvoice.studentId}` },
                      { label: "Billing period", value: selectedInvoice.billingPeriod },
                      { label: "Due date", value: formatDate(selectedInvoice.dueDate, "MMMM dd, yyyy") },
                      { label: "Status", value: actualStatus },
                    ];
                    
                    return headerItems.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                        <p className="mt-2 font-semibold text-slate-900">{item.value}</p>
                      </div>
                    ));
                  })()}
                </div>

                {/* Amount Summary */}
                {(() => {
                  const totalDiscount = (selectedInvoice as any).totalDiscount ?? (selectedInvoice.payments ?? []).reduce((sum: number, p: any) => sum + (p.discount || 0), 0);
                  const totalLateFee = selectedInvoice.adjustments?.filter(adj => adj.type === "fine").reduce((sum: number, adj: any) => sum + adj.amount, 0) ?? 0;
                  const netAmount = selectedInvoice.amount - totalDiscount + totalLateFee;
                  
                  return (
                    <div className="grid gap-4 sm:grid-cols-5">
                      <div className="rounded-2xl border border-slate-200/70 bg-blue-50/50 p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Original Amount</p>
                        <p className="mt-2 text-lg font-bold text-blue-900">{formatCurrency(selectedInvoice.amount)}</p>
                      </div>
                      {totalDiscount > 0 && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-amber-700 font-semibold">Total Discount</p>
                          <p className="mt-2 text-lg font-bold text-amber-900">-{formatCurrency(totalDiscount)}</p>
                        </div>
                      )}
                      {totalLateFee > 0 && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-rose-700 font-semibold">Late Fee</p>
                          <p className="mt-2 text-lg font-bold text-rose-900">+{formatCurrency(totalLateFee)}</p>
                        </div>
                      )}
                      <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Paid</p>
                        <p className="mt-2 text-lg font-bold text-emerald-700">{formatCurrency(selectedInvoice.paidAmount)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-300 bg-slate-100 p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-700 font-semibold">Remaining</p>
                        <p className="mt-2 text-lg font-bold text-slate-900">{formatCurrency(selectedInvoice.remainingBalance)}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Invoice Items and Adjustments */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3">
                    <h3 className="font-semibold text-slate-900">Invoice items</h3>
                    {(selectedInvoice.lineItems.length ? selectedInvoice.lineItems : [{ label: selectedInvoice.description, amount: selectedInvoice.amount }]).map((item, index) => (
                      <div key={`${item.label}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                        <div>
                          <p className="font-medium text-slate-900">{item.label}</p>
                          <p className="text-xs text-slate-500">{selectedInvoice.description}</p>
                        </div>
                        <p className="font-semibold text-slate-900">{formatCurrency(item.amount)}</p>
                      </div>
                    ))}
                    {selectedInvoice.notes && (
                      <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">Notes:</span> {selectedInvoice.notes}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-semibold text-slate-900">Adjustments & Fees</h3>
                    {(() => {
                      // Collect all adjustments: regular adjustments + payment discounts
                      const adjustmentItems = [
                        // Regular adjustments from adjustments array
                        ...(selectedInvoice.adjustments ?? []),
                        // Virtual discount adjustments from payments
                        ...(selectedInvoice.payments ?? [])
                          .filter((p: any) => p.discount && p.discount > 0)
                          .map((p: any) => ({
                            id: `discount-${p.id}`,
                            type: "discount",
                            reason: p.discountReason || "Payment discount",
                            amount: p.discount,
                            notes: `Applied on ${formatDate(p.paymentDate, "MMM dd, yyyy")}`,
                          })),
                      ];

                      return adjustmentItems.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">
                          No adjustments or discounts applied to this invoice.
                        </div>
                      ) : (
                        adjustmentItems.map((adj: any) => {
                          const isLateFee = adj.type === "fine";
                          const isDiscount = adj.type === "discount";
                          const isScholarship = adj.type === "scholarship";
                          
                          return (
                            <div key={adj.id} className={`rounded-2xl border p-4 ${
                              isLateFee ? "border-rose-200 bg-rose-50/50" : 
                              isDiscount ? "border-amber-200 bg-amber-50/50" :
                              "border-blue-200 bg-blue-50/50"
                            }`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className={`text-sm font-semibold ${
                                    isLateFee ? "text-rose-900" :
                                    isDiscount ? "text-amber-900" :
                                    "text-blue-900"
                                  }`}>
                                    {isLateFee ? "🕐 Late Fee" : isDiscount ? "🎁 Discount" : "🎓 Scholarship"}
                                  </p>
                                  <p className={`text-xs ${
                                    isLateFee ? "text-rose-700" :
                                    isDiscount ? "text-amber-700" :
                                    "text-blue-700"
                                  }`}>
                                    {adj.reason}
                                  </p>
                                </div>
                                <p className={`text-sm font-bold whitespace-nowrap ${
                                  isLateFee ? "text-rose-900" :
                                  isDiscount ? "text-amber-900" :
                                  "text-blue-900"
                                }`}>
                                  {isDiscount || isLateFee ? (isDiscount ? "-" : "+") : "+"}{formatCurrency(adj.amount)}
                                </p>
                              </div>
                              {adj.notes && <p className="mt-2 text-xs text-slate-600">{adj.notes}</p>}
                            </div>
                          );
                        })
                      );
                    })()}
                  </div>
                </div>

                {/* Payments */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-900">Payments</h3>
                  {(selectedInvoice.payments ?? []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">
                      No payments recorded yet for this invoice.
                    </div>
                  ) : (
                    (selectedInvoice.payments ?? []).map((payment: any) => {
                      const discountAmount = payment.discount || 0;
                      return (
                        <div key={payment.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900">{formatDate(payment.paymentDate, "MMM dd, yyyy")}</p>
                              <p className="text-xs text-slate-500">{payment.method} • {payment.receiptNumber ?? "Receipt pending"}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="font-semibold text-slate-900">{formatCurrency(payment.amount)}</p>
                                {discountAmount > 0 && (
                                  <p className="text-xs text-amber-600">-{formatCurrency(discountAmount)} discount</p>
                                )}
                              </div>
                              <Button size="sm" variant="outline" onClick={() => handlePrintReceipt(selectedInvoice, payment)}>
                                <Printer className="mr-1.5 h-3.5 w-3.5" />
                                Receipt
                              </Button>
                            </div>
                          </div>
                          {discountAmount > 0 && (
                            <div className="mt-3 rounded-xl bg-amber-50/50 border border-amber-100 p-3">
                              <div className="flex justify-between items-center gap-2">
                                <div>
                                  <p className="text-xs text-amber-700 font-medium">Discount Applied</p>
                                  <p className="text-xs text-amber-600">{payment.discountReason || "No reason specified"}</p>
                                </div>
                                <p className="font-semibold text-amber-700">{formatCurrency(discountAmount)}</p>
                              </div>
                            </div>
                          )}
                          {(payment.reference || payment.notes) && <p className="mt-2 text-xs text-slate-500">{payment.reference ?? payment.notes}</p>}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap justify-end gap-3">
                  {selectedInvoice.remainingBalance > 0 && (
                    <Button variant="outline" onClick={() => openPaymentDialog(selectedInvoice)}>
                      <ReceiptText className="mr-2 h-4 w-4" />
                      Record payment
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => handlePrintInvoice(selectedInvoice)}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print invoice / Save PDF
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deletingInvoice} onOpenChange={(open) => !open && setDeleteInvoiceId(null)}>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete invoice?</AlertDialogTitle><AlertDialogDescription>This will permanently remove {deletingInvoice?.invoiceNumber ?? (deletingInvoice ? `invoice ${deletingInvoice.id}` : "the selected invoice")} and its payment ledger history.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteInvoice}>{deleteFee.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete invoice"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>

        {/* Fee Adjustment Dialog */}
        <FeeAdjustmentDialog
          open={adjustmentDialogOpen}
          onOpenChange={setAdjustmentDialogOpen}
          selectedStudent={studentFilter === "all" ? undefined : { id: Number(studentFilter), name: studentDirectory.get(Number(studentFilter))?.name ?? "" }}
        />

        {/* Apply Late Fee Dialog */}
        <ApplyLateFeeDialog
          open={lateFeeDialogOpen}
          onOpenChange={setLateFeeDialogOpen}
          selectedStudent={studentFilter === "all" ? undefined : { id: Number(studentFilter), name: studentDirectory.get(Number(studentFilter))?.name ?? "" }}
        />

        {/* Single Student Fee Generation Dialog */}
        <GenerateSingleStudentFeeDialog open={singleStudentFeeDialogOpen} onOpenChange={setSingleStudentFeeDialogOpen} />
      </div>
    </Layout>
  );
}