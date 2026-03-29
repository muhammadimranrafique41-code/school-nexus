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
import { Banknote, CalendarDays, Clock, CreditCard, Download, Eye, FilePlus2, Filter, Layers, Loader2, Pencil, Printer, ReceiptText, RefreshCcw, Search, Settings2, Trash2, Users, X, Zap, Gift } from "lucide-react";
import { buildInvoicePrintHtml, buildPaymentReceiptPrintHtml, type FeePaymentRecord, type FeeRecord, getCurrentBillingMonth, getFeeStatusClassName, getLatestRecordedPayment } from "@/lib/finance";
import { downloadCsv, formatCurrency, formatDate, getErrorMessage, openPrintWindow, paginateItems } from "@/lib/utils";

const PAGE_SIZE = 10;
type InvoiceFormState = { studentId: string; amount: string; billingMonth: string; dueDate: string; description: string; feeType: string; notes: string; discount: string; discountReason: string };
type PaymentFormState = { amount: string; paymentDate: string; method: "Cash" | "Bank Transfer" | "Card" | "Mobile Money" | "Cheque" | "Other"; reference: string; notes: string; discount: string; discountReason: string };
type BillingProfileFormState = { studentId: string; monthlyAmount: string; dueDay: string; isActive: boolean; notes: string };
type GenerationFormState = { billingMonth: string; dueDayOverride: string; classNameFilter: string };

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

// ── Compact column header ─────────────────────────────────────────────────
function ColHead({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 first:pl-4 last:pr-4 ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

// ── Compact table cell ───────────────────────────────────────────────────
function TD({ children, right, className = "" }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <td className={`px-3 py-0 first:pl-4 last:pr-4 ${right ? "text-right" : ""} ${className}`}>
      {children}
    </td>
  );
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
  const [generationForm, setGenerationForm] = useState<GenerationFormState>({ billingMonth: getCurrentBillingMonth(), dueDayOverride: "", classNameFilter: "all" });

  const createFee = useCreateFee();
  const updateFee = useUpdateFee();
  const deleteFee = useDeleteFee();
  const recordPayment = useRecordFeePayment();
  const upsertBillingProfile = useUpsertBillingProfile();
  const generateMonthlyFees = useGenerateMonthlyFees();

  const reportFilters = useMemo<FinanceReportFilters>(() => ({
    month: monthFilter === "all" ? undefined : monthFilter,
    studentId: studentFilter === "all" ? undefined : Number(studentFilter),
    status: statusFilter === "all" ? undefined : statusFilter,
  }), [monthFilter, statusFilter, studentFilter]);

  const { data: report, isLoading: reportLoading } = useFinanceReport(reportFilters);
  const { data: balanceSummary } = useFeeBalanceSummary();
  const { data: overdueBalances = [] } = useOverdueBalances();

  const studentsList = useMemo(() => [...students].sort((a, b) => a.name.localeCompare(b.name)), [students]);
  const studentClassOptions = useMemo(
    () => Array.from(new Set(
      studentsList
        .map((student) => student.className?.trim())
        .filter((className): className is string => Boolean(className)),
    )).sort((a, b) => a.localeCompare(b)),
    [studentsList],
  );
  const studentDirectory = useMemo(() => new Map(studentsList.map((s) => [s.id, s])), [studentsList]);
  const invoices = report?.invoices ?? [];
  const recentPayments = useMemo(() => [...(report?.payments ?? [])].sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate)).slice(0, 6), [report?.payments]);
  const paymentMethodBreakdown = useMemo(() => (report?.paymentMethodBreakdown ?? []).filter((i) => i.count > 0 || i.amount > 0), [report?.paymentMethodBreakdown]);
  const classBreakdown = useMemo(() => (report?.classBreakdown ?? []).slice(0, 6), [report?.classBreakdown]);
  const overduePreview = useMemo(() => overdueBalances.slice(0, 4), [overdueBalances]);
  const invoiceDirectory = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);
  const selectedInvoice = useMemo(() => invoices.find((i) => i.id === detailInvoiceId), [detailInvoiceId, invoices]);
  const editingInvoice = useMemo(() => invoices.find((i) => i.id === editingInvoiceId), [editingInvoiceId, invoices]);
  const paymentInvoice = useMemo(() => invoices.find((i) => i.id === paymentInvoiceId), [invoices, paymentInvoiceId]);
  const deletingInvoice = useMemo(() => invoices.find((i) => i.id === deleteInvoiceId), [deleteInvoiceId, invoices]);
  const editingProfile = useMemo(() => profiles.find((p) => p.studentId === editingProfileStudentId), [editingProfileStudentId, profiles]);
  const filteredInvoices = useMemo(() => invoices.filter((invoice) =>
    [invoice.invoiceNumber ?? `INV-${invoice.id}`, invoice.student?.name ?? "", invoice.student?.className ?? "", invoice.billingPeriod, invoice.description, invoice.status]
      .join(" ").toLowerCase().includes(searchTerm.trim().toLowerCase())
  ), [invoices, searchTerm]);
  const paginated = paginateItems(filteredInvoices, currentPage, PAGE_SIZE);
  const missingProfiles = useMemo(() => {
    const existing = new Set(profiles.map((p) => p.studentId));
    return studentsList.filter((s) => !existing.has(s.id));
  }, [profiles, studentsList]);
  const billingMonths = useMemo(() => Array.from(new Set(invoices.map((i) => i.billingMonth))).sort((a, b) => b.localeCompare(a)), [invoices]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, monthFilter, statusFilter, studentFilter]);

  const openCreateInvoiceDialog = () => {
    setEditingInvoiceId(null);
    setInvoiceForm(createDefaultInvoiceForm(studentFilter === "all" ? "" : studentFilter));
    setInvoiceDialogOpen(true);
  };
  const openEditInvoiceDialog = (invoice: FeeRecord) => {
    setEditingInvoiceId(invoice.id);
    setInvoiceForm({ studentId: String(invoice.studentId), amount: String(invoice.amount), billingMonth: invoice.billingMonth, dueDate: invoice.dueDate, description: invoice.description, feeType: invoice.feeType, notes: invoice.notes ?? "", discount: "", discountReason: "" });
    setInvoiceDialogOpen(true);
  };
  const openPaymentDialog = (invoice: FeeRecord) => {
    setPaymentInvoiceId(invoice.id);
    setPaymentForm(createDefaultPaymentForm(invoice.remainingBalance));
    setPaymentDialogOpen(true);
  };
  const openProfileDialog = (profile?: BillingProfileRecord) => {
    setEditingProfileStudentId(profile?.studentId ?? null);
    setProfileForm(profile ? { studentId: String(profile.studentId), monthlyAmount: String(profile.monthlyAmount), dueDay: String(profile.dueDay), isActive: profile.isActive, notes: profile.notes ?? "" } : createDefaultBillingProfileForm(studentFilter === "all" ? "" : studentFilter));
    setProfileDialogOpen(true);
  };
  const handlePrintInvoice = (invoice: FeeRecord) => openPrintWindow(invoice.invoiceNumber ?? `Invoice ${invoice.id}`, buildInvoicePrintHtml(invoice), { documentType: "invoice", subtitle: `${invoice.student?.name ?? `Student #${invoice.studentId}`} • ${invoice.billingPeriod}` });
  const handlePrintReceipt = (invoice: FeeRecord, payment: FeePaymentRecord) => openPrintWindow(payment.receiptNumber ?? `Receipt ${payment.id}`, buildPaymentReceiptPrintHtml(invoice, payment), { documentType: "receipt", subtitle: `${invoice.student?.name ?? `Student #${invoice.studentId}`} • ${invoice.invoiceNumber ?? `INV-${invoice.id}`}` });
  const handleExportInvoices = () => downloadCsv(`finance-report-${monthFilter === "all" ? "all" : monthFilter}.csv`, filteredInvoices.map((invoice) => ({ Invoice: invoice.invoiceNumber ?? `INV-${invoice.id}`, Student: invoice.student?.name ?? `Student #${invoice.studentId}`, Class: invoice.student?.className ?? "", BillingMonth: invoice.billingMonth, BillingPeriod: invoice.billingPeriod, DueDate: invoice.dueDate, TotalAmount: invoice.amount, Discount: invoice.totalDiscount ?? 0, PaidAmount: invoice.paidAmount, RemainingBalance: invoice.remainingBalance, Status: invoice.status })));

  const handleInvoiceSubmit = async () => {
    try {
      const amount = Number(invoiceForm.amount);
      const discount = invoiceForm.discount ? Number(invoiceForm.discount) : null;
      if (discount && discount > amount) throw new Error("Discount cannot exceed invoice amount");
      const payload = { studentId: Number(invoiceForm.studentId), amount, billingMonth: invoiceForm.billingMonth, billingPeriod: formatBillingPeriod(invoiceForm.billingMonth), dueDate: invoiceForm.dueDate, description: invoiceForm.description.trim(), feeType: invoiceForm.feeType.trim() || "Monthly Fee", notes: invoiceForm.notes.trim() || null, lineItems: [{ label: invoiceForm.description.trim() || "Invoice item", amount }], source: "manual" as const, discount: discount || null, discountReason: (discount && invoiceForm.discountReason.trim()) || null };
      if (editingInvoice) { await updateFee.mutateAsync({ id: editingInvoice.id, ...payload }); } else { await createFee.mutateAsync(payload); }
      toast({ title: editingInvoice ? "Invoice updated" : "Invoice created", description: `${invoiceForm.description} for ${formatCurrency(amount)} has been saved.` });
      setInvoiceDialogOpen(false); setEditingInvoiceId(null); setInvoiceForm(createDefaultInvoiceForm(studentFilter === "all" ? "" : studentFilter));
    } catch (error) { toast({ title: "Unable to save invoice", description: getErrorMessage(error), variant: "destructive" }); }
  };

  const handlePaymentSubmit = async () => {
    if (!paymentInvoice) return;
    try {
      const amount = Number(paymentForm.amount);
      const discount = paymentForm.discount ? Number(paymentForm.discount) : null;
      if (!amount || amount <= 0) throw new Error("Payment amount must be greater than 0");
      if (discount && discount > paymentInvoice.remainingBalance) throw new Error("Discount cannot exceed the remaining invoice balance");
      if (amount > paymentInvoice.remainingBalance) throw new Error(`Payment cannot exceed remaining balance of ${formatCurrency(paymentInvoice.remainingBalance)}`);
      const updatedInvoice = await recordPayment.mutateAsync({ id: paymentInvoice.id, amount, paymentDate: paymentForm.paymentDate, method: paymentForm.method, reference: paymentForm.reference.trim() || null, notes: paymentForm.notes.trim() || null, discount: discount || null, discountReason: (discount && paymentForm.discountReason.trim()) || null });
      const recordedPayment = getLatestRecordedPayment(updatedInvoice);
      const discountText = discount ? ` + ${formatCurrency(discount)} discount` : "";
      toast({ title: "Payment recorded", description: `${formatCurrency(amount)}${discountText} applied to ${paymentInvoice.invoiceNumber ?? `invoice ${paymentInvoice.id}`}.` });
      setPaymentDialogOpen(false); setPaymentInvoiceId(null); setPaymentForm(createDefaultPaymentForm()); setDetailInvoiceId(null);
      if (recordedPayment) handlePrintReceipt(updatedInvoice, recordedPayment);
    } catch (error) { toast({ title: "Unable to record payment", description: getErrorMessage(error), variant: "destructive" }); }
  };

  const handleProfileSubmit = async () => {
    try {
      await upsertBillingProfile.mutateAsync({ studentId: Number(profileForm.studentId), monthlyAmount: Number(profileForm.monthlyAmount), dueDay: Number(profileForm.dueDay), isActive: profileForm.isActive, notes: profileForm.notes.trim() || null });
      toast({ title: editingProfile ? "Billing profile updated" : "Billing profile saved", description: "Monthly billing defaults are now available for fee generation." });
      setProfileDialogOpen(false); setEditingProfileStudentId(null); setProfileForm(createDefaultBillingProfileForm(studentFilter === "all" ? "" : studentFilter));
    } catch (error) { toast({ title: "Unable to save billing profile", description: getErrorMessage(error), variant: "destructive" }); }
  };

  const handleGenerateMonthlyFees = async () => {
    try {
      const result = await generateMonthlyFees.mutateAsync({
        billingMonth: generationForm.billingMonth,
        dueDayOverride: generationForm.dueDayOverride ? Number(generationForm.dueDayOverride) : undefined,
        classNameFilter: generationForm.classNameFilter === "all" ? undefined : generationForm.classNameFilter,
      });
      setLastGenerationResult(result);
      const scopeLabel = result.classNameFilter ? ` for ${result.classNameFilter}` : "";
      toast({ title: "Monthly fee generation complete", description: `Processed ${result.targetStudentCount} student(s)${scopeLabel}: generated ${result.generatedCount}, skipped ${result.skippedDuplicates} duplicates, flagged ${result.skippedMissingProfiles} without active billing, and logged ${result.errorCount} error(s).` });
    } catch (error) { toast({ title: "Unable to generate monthly invoices", description: getErrorMessage(error), variant: "destructive" }); }
  };

  const handleDeleteInvoice = async () => {
    if (!deletingInvoice) return;
    try {
      await deleteFee.mutateAsync(deletingInvoice.id);
      toast({ title: "Invoice deleted", description: `${deletingInvoice.invoiceNumber ?? `Invoice ${deletingInvoice.id}`} has been removed.` });
      setDeleteInvoiceId(null);
    } catch (error) { toast({ title: "Unable to delete invoice", description: getErrorMessage(error), variant: "destructive" }); }
  };

  return (
    <Layout>
      <div className="space-y-6 pb-8">

        {/* ── Page header ───────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Finance Workspace</h1>
              <p className="mt-0.5 text-[12px] text-slate-400">Manage invoices, payments, monthly fee generation, and billing documents.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setGenerationDialogOpen(true)}><RefreshCcw className="mr-1.5 h-3.5 w-3.5" />Generate fees</Button>
            <Button variant="outline" size="sm" onClick={() => setSingleStudentFeeDialogOpen(true)}><Zap className="mr-1.5 h-3.5 w-3.5" />Single student</Button>
            <Button variant="outline" size="sm" onClick={() => setAdjustmentDialogOpen(true)}><Gift className="mr-1.5 h-3.5 w-3.5" />Adjustment</Button>
            <Button variant="outline" size="sm" onClick={() => setLateFeeDialogOpen(true)}><Clock className="mr-1.5 h-3.5 w-3.5" />Late fee</Button>
            <Button variant="outline" size="sm" onClick={() => openProfileDialog()}><Settings2 className="mr-1.5 h-3.5 w-3.5" />Billing profiles</Button>
            <Button variant="outline" size="sm" onClick={() => { window.location.href = "/admin/finance/vouchers/generate"; }}><Layers className="mr-1.5 h-3.5 w-3.5" />Consolidated Vouchers</Button>
            <Button variant="outline" size="sm" onClick={handleExportInvoices} disabled={filteredInvoices.length === 0}><Download className="mr-1.5 h-3.5 w-3.5" />Export</Button>
            <Button size="sm" onClick={openCreateInvoiceDialog}><FilePlus2 className="mr-1.5 h-3.5 w-3.5" />Create invoice</Button>
          </div>
        </section>

        {/* ── KPI strip ─────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Total billed", value: formatCurrency(report?.summary.totalBilled ?? 0), hint: `${report?.summary.totalInvoices ?? 0} invoices`, icon: Banknote, iconBg: "bg-indigo-50", iconColor: "text-indigo-600", border: "border-indigo-100/60" },
            { label: "Collected", value: formatCurrency(report?.summary.totalPaid ?? 0), hint: `${report?.summary.paymentsCount ?? 0} payments`, icon: ReceiptText, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", border: "border-emerald-100/60" },
            { label: "Collection rate", value: formatPercentage(report?.summary.collectionRate ?? 0), hint: `${report?.summary.studentsWithOutstanding ?? 0} with balance`, icon: ReceiptText, iconBg: "bg-blue-50", iconColor: "text-blue-600", border: "border-blue-100/60" },
            { label: "Outstanding", value: formatCurrency(report?.summary.totalOutstanding ?? 0), hint: `${balanceSummary?.openInvoices ?? 0} open`, icon: CreditCard, iconBg: "bg-amber-50", iconColor: "text-amber-600", border: "border-amber-100/60" },
            { label: "Overdue", value: formatCurrency(report?.summary.overdueBalance ?? 0), hint: `${report?.summary.overdueInvoices ?? 0} overdue`, icon: CalendarDays, iconBg: "bg-rose-50", iconColor: "text-rose-600", border: "border-rose-100/60" },
            { label: "Due soon / No profile", value: `${balanceSummary?.dueSoonInvoices ?? 0} / ${missingProfiles.length}`, hint: `${profiles.length} profiles set`, icon: Users, iconBg: "bg-slate-100", iconColor: "text-slate-500", border: "border-slate-200/60" },
          ].map((item) => (
            <div
              key={item.label}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border bg-white px-3 py-4 text-center shadow-none transition-shadow hover:shadow-sm ${item.border}`}
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.iconBg} ${item.iconColor}`}>
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 leading-tight">{item.label}</p>
                <p className="mt-1 text-xl font-bold leading-none text-slate-900 sm:text-2xl">{item.value}</p>
                <p className="mt-1 text-[11px] text-slate-400 leading-tight">{item.hint}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Filters ───────────────────────────────────────────────────── */}
        <Card className="border-slate-200/80 bg-white shadow-none">
          {/* Filter bar header label */}
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50">
              <Filter className="h-3.5 w-3.5 text-indigo-500" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Filters</span>
            {/* Active filter count badge */}
            {(searchTerm || monthFilter !== "all" || studentFilter !== "all" || statusFilter !== "all") && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
                {[searchTerm, monthFilter !== "all", studentFilter !== "all", statusFilter !== "all"].filter(Boolean).length} active
              </span>
            )}
          </div>

          <CardContent className="p-3">
            {/* Single row on lg+; responsive stacking on mobile */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search student, invoice #, class…"
                  className="h-9 pl-9 text-sm"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Month */}
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="h-9 w-full text-sm lg:w-[148px]">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <SelectValue placeholder="All months" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All months</SelectItem>
                  {billingMonths.map((m) => <SelectItem key={m} value={m}>{formatBillingPeriod(m)}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Student */}
              <Select value={studentFilter} onValueChange={setStudentFilter}>
                <SelectTrigger className="h-9 w-full text-sm lg:w-[148px]">
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <SelectValue placeholder="All students" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All students</SelectItem>
                  {studentsList.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.className ? ` (${s.className})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Status */}
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | FeeRecord["status"])}>
                <SelectTrigger className="h-9 w-full text-sm lg:w-[140px]">
                  <div className="flex items-center gap-2">
                    <ReceiptText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <SelectValue placeholder="All statuses" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {feeStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Clear */}
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full gap-1.5 border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 lg:w-auto"
                onClick={() => { setSearchTerm(""); setMonthFilter("all"); setStudentFilter("all"); setStatusFilter("all"); }}
              >
                <X className="h-3.5 w-3.5" />
                <span>Clear</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Invoice table — full width ────────────────────────────────── */}
        <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
          {/* Card header */}
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900">Invoices</CardTitle>
              <CardDescription className="text-[11px]">
                {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""} &nbsp;·&nbsp; Outstanding {formatCurrency(filteredInvoices.reduce((s, i) => s + i.remainingBalance, 0))}
              </CardDescription>
            </div>
          </CardHeader>

          {/* Table */}
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr>
                  <ColHead>Student</ColHead>
                  <ColHead>Invoice</ColHead>
                  <ColHead>Period</ColHead>
                  <ColHead right>Total</ColHead>
                  <ColHead right>Paid</ColHead>
                  <ColHead right>Balance</ColHead>
                  <ColHead right>Discount</ColHead>
                  <ColHead>Status</ColHead>
                  <ColHead right>Actions</ColHead>
                </tr>
              </thead>
              <tbody>
                {reportLoading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-slate-400">
                      No invoices match the current filters.
                    </td>
                  </tr>
                ) : (
                  paginated.pageItems.map((invoice, idx) => {
                    const lateFees = (invoice.adjustments ?? []).filter((a: any) => a.type === "fine").reduce((s: number, a: any) => s + a.amount, 0);
                    return (
                      <tr
                        key={invoice.id}
                        className={`group border-b border-slate-100 last:border-b-0 transition-colors duration-100 hover:bg-indigo-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                      >
                        {/* Student */}
                        <TD>
                          <div className="py-2.5">
                            <p className="max-w-[160px] truncate text-[13px] font-semibold text-slate-900">
                              {invoice.student?.name ?? `Student #${invoice.studentId}`}
                            </p>
                            <p className="max-w-[160px] truncate text-[11px] text-slate-400">
                              {invoice.student?.className ?? "—"}
                            </p>
                          </div>
                        </TD>

                        {/* Invoice # */}
                        <TD>
                          <p className="text-[12px] font-mono font-medium text-slate-700">
                            {invoice.invoiceNumber ?? `INV-${invoice.id}`}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Due {formatDate(invoice.dueDate, "MMM dd")}
                          </p>
                        </TD>

                        {/* Period */}
                        <TD>
                          <p className="text-[12px] text-slate-600">{invoice.billingPeriod}</p>
                          <p className="text-[11px] text-slate-400">{invoice.paymentCount} pmt{invoice.paymentCount !== 1 ? "s" : ""}</p>
                        </TD>

                        {/* Total */}
                        <TD right>
                          <p className="text-[13px] font-semibold text-slate-900">{formatCurrency(invoice.amount)}</p>
                        </TD>

                        {/* Paid */}
                        <TD right>
                          <p className="text-[13px] font-semibold text-emerald-600">{formatCurrency(invoice.paidAmount)}</p>
                        </TD>

                        {/* Balance */}
                        <TD right>
                          <p className={`text-[13px] font-semibold ${invoice.remainingBalance > 0 ? "text-rose-600" : "text-slate-400"}`}>
                            {formatCurrency(invoice.remainingBalance)}
                          </p>
                        </TD>

                        {/* Discount + late fee pill */}
                        <TD right>
                          <div className="flex flex-col items-end gap-0.5">
                            {invoice.totalDiscount > 0 && (
                              <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                -{formatCurrency(invoice.totalDiscount)}
                              </span>
                            )}
                            {lateFees > 0 && (
                              <span className="inline-block rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                                +{formatCurrency(lateFees)}
                              </span>
                            )}
                            {invoice.totalDiscount === 0 && lateFees === 0 && (
                              <span className="text-[12px] text-slate-300">—</span>
                            )}
                          </div>
                        </TD>

                        {/* Status */}
                        <TD>
                          {buildStatusBadge(invoice.status)}
                        </TD>

                        {/* Actions */}
                        <TD right>
                          <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="View details" onClick={() => setDetailInvoiceId(invoice.id)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {invoice.remainingBalance > 0 && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-emerald-600 hover:bg-emerald-50" title="Record payment" onClick={() => openPaymentDialog(invoice)}>
                                <ReceiptText className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="Print" onClick={() => handlePrintInvoice(invoice)}>
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="Edit" onClick={() => openEditInvoiceDialog(invoice)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-rose-500 hover:bg-rose-50" title="Delete" onClick={() => setDeleteInvoiceId(invoice.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TD>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredInvoices.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <p className="text-[11px] text-slate-400">
                {(paginated.currentPage - 1) * PAGE_SIZE + 1}–{Math.min(paginated.currentPage * PAGE_SIZE, filteredInvoices.length)} of {filteredInvoices.length}
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" className={`h-7 text-xs ${paginated.currentPage === 1 ? "pointer-events-none opacity-40" : ""}`} onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.max(1, p - 1)); }} />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-3 text-[11px] text-slate-400">Page {paginated.currentPage} / {paginated.totalPages}</span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext href="#" className={`h-7 text-xs ${paginated.currentPage === paginated.totalPages ? "pointer-events-none opacity-40" : ""}`} onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.min(paginated.totalPages, p + 1)); }} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </Card>

        {/* ── Below-table analytics: 3-column grid ──────────────────────── */}
        <div className="grid gap-4 md:grid-cols-3">

          {/* Status breakdown */}
          <Card className="border-slate-200/80 bg-white shadow-none">
            <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                <ReceiptText className="h-3.5 w-3.5 text-indigo-500" />
              </div>
              <CardTitle className="text-sm font-semibold text-slate-900">Status breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(report?.statusBreakdown ?? []).length === 0 ? (
                <p className="px-4 py-4 text-[12px] text-slate-400">No data for active filters.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Status</th>
                      <th className="px-4 py-2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Count</th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report?.statusBreakdown ?? []).map((item, idx) => (
                      <tr key={item.status} className={`border-b border-slate-100 last:border-b-0 ${idx % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}>
                        <td className="px-4 py-2.5">{buildStatusBadge(item.status)}</td>
                        <td className="px-4 py-2.5 text-center text-[12px] font-semibold text-slate-600">{item.count}</td>
                        <td className="px-4 py-2.5 text-right text-[12px] font-bold text-slate-900">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Balance monitor */}
          <Card className="border-slate-200/80 bg-white shadow-none">
            <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50">
                <CalendarDays className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <CardTitle className="text-sm font-semibold text-slate-900">Balance monitor</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: "Open invoices", value: balanceSummary?.openInvoices ?? 0, color: "text-slate-900" },
                  { label: "Due soon", value: balanceSummary?.dueSoonInvoices ?? 0, color: "text-amber-700" },
                  { label: "Students overdue", value: balanceSummary?.studentsWithOverdue ?? 0, color: "text-rose-700" },
                  { label: "Total overdue", value: formatCurrency(balanceSummary?.totalOverdue ?? 0), color: "text-rose-700" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{item.label}</p>
                    <p className={`mt-0.5 text-sm font-bold ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Overdue invoices</p>
              <div className="space-y-1.5">
                {overduePreview.length === 0 ? (
                  <p className="text-[12px] text-slate-400">No overdue invoices.</p>
                ) : overduePreview.map((entry) => (
                  <div key={entry.invoiceId} className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="max-w-[130px] truncate text-[12px] font-semibold text-slate-800">{entry.studentName}</p>
                      <p className="text-[11px] text-rose-500">{entry.daysOverdue}d overdue</p>
                    </div>
                    <p className="text-[12px] font-bold text-slate-900">{formatCurrency(entry.remainingBalance)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Outstanding students */}
          <Card className="border-slate-200/80 bg-white shadow-none">
            <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50">
                <Users className="h-3.5 w-3.5 text-rose-500" />
              </div>
              <CardTitle className="text-sm font-semibold text-slate-900">Outstanding students</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(report?.outstandingStudents ?? []).length === 0 ? (
                <p className="px-4 py-4 text-[12px] text-slate-400">No outstanding balances.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Student</th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report?.outstandingStudents.slice(0, 6).map((student, idx) => (
                      <tr key={student.studentId} className={`border-b border-slate-100 last:border-b-0 ${idx % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}>
                        <td className="px-4 py-2.5">
                          <p className="max-w-[160px] truncate text-[12px] font-semibold text-slate-900">{student.studentName}</p>
                          <p className="text-[10px] text-slate-400">{student.className ?? "—"} · {student.invoiceCount} open</p>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <p className="text-[12px] font-bold text-slate-900">{formatCurrency(student.outstandingBalance)}</p>
                          {student.overdueBalance > 0 && <p className="text-[10px] font-semibold text-rose-500">{formatCurrency(student.overdueBalance)} overdue</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Bottom analytics row ──────────────────────────────────────── */}
        <div className="grid gap-5 xl:grid-cols-3">

          {/* Recent payments */}
          <Card className="border-slate-200/80 bg-white shadow-none">
            <CardHeader className="px-4 py-3 pb-2">
              <CardTitle className="text-sm font-semibold">Recent payments</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {recentPayments.length === 0 ? (
                  <p className="text-[12px] text-slate-400">No payments recorded yet.</p>
                ) : recentPayments.map((payment) => {
                  const invoice = invoiceDirectory.get(payment.feeId);
                  return (
                    <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                      <div className="min-w-0">
                        <p className="max-w-[140px] truncate text-[12px] font-semibold text-slate-900">{studentDirectory.get(payment.studentId)?.name ?? `#${payment.studentId}`}</p>
                        <p className="text-[10px] text-slate-400">{payment.method} · {formatDate(payment.paymentDate, "MMM dd")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-bold text-slate-900">{formatCurrency(payment.amount)}</p>
                        {invoice && <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => handlePrintReceipt(invoice, payment)}><Printer className="h-3 w-3" /></Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Monthly revenue */}
          <Card className="border-slate-200/80 bg-white shadow-none">
            <CardHeader className="px-4 py-3 pb-2">
              <CardTitle className="text-sm font-semibold">Monthly revenue</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {(report?.monthlyRevenue ?? []).slice(0, 6).map((item) => (
                  <div key={item.month} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[12px] font-semibold text-slate-800">{formatBillingPeriod(item.month)}</p>
                      <p className="text-[10px] text-slate-400">{item.month}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Billed</p>
                        <p className="text-[13px] font-bold text-slate-900">{formatCurrency(item.billed)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Collected</p>
                        <p className="text-[13px] font-bold text-emerald-600">{formatCurrency(item.paid)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Billing profiles */}
          <Card className="border-slate-200/80 bg-white shadow-none">
            <CardHeader className="flex flex-row items-center justify-between px-4 py-3 pb-2">
              <CardTitle className="text-sm font-semibold">Billing profiles</CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openProfileDialog()}><Settings2 className="mr-1 h-3 w-3" />Add</Button>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <p className="text-[10px] text-slate-400">Configured</p>
                  <p className="text-sm font-bold text-slate-900">{profiles.length}</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2">
                  <p className="text-[10px] text-amber-600">Need setup</p>
                  <p className="text-sm font-bold text-amber-700">{missingProfiles.length}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {profilesLoading ? (
                  <p className="text-[12px] text-slate-400">Loading…</p>
                ) : profiles.length === 0 ? (
                  <p className="text-[12px] text-slate-400">No billing profiles yet.</p>
                ) : profiles.slice(0, 5).map((profile) => (
                  <div key={profile.studentId} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="max-w-[140px] truncate text-[12px] font-semibold text-slate-900">{profile.student?.name ?? `#${profile.studentId}`}</p>
                      <p className="text-[10px] text-slate-400">Due day {profile.dueDay} · {formatCurrency(profile.monthlyAmount)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={profile.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] px-1.5" : "text-[10px] px-1.5"}>
                        {profile.isActive ? "Active" : "Off"}
                      </Badge>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => openProfileDialog(profile)}>Edit</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Payment method + Class breakdown ─────────────────────────── */}
        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="border-slate-200/80 bg-white shadow-none">
            <CardHeader className="px-4 py-3 pb-2">
              <CardTitle className="text-sm font-semibold">Collections by payment method</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-1.5">
                {paymentMethodBreakdown.length === 0 ? (
                  <p className="text-[12px] text-slate-400">No payment data yet.</p>
                ) : paymentMethodBreakdown.map((item) => (
                  <div key={item.method} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <div>
                      <p className="text-[12px] font-semibold text-slate-800">{item.method}</p>
                      <p className="text-[11px] text-slate-400">{item.count} receipt{item.count !== 1 ? "s" : ""}</p>
                    </div>
                    <p className="text-[13px] font-bold text-slate-900">{formatCurrency(item.amount)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white shadow-none">
            <CardHeader className="px-4 py-3 pb-2">
              <CardTitle className="text-sm font-semibold">Class balance & collection</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-1.5">
                {classBreakdown.length === 0 ? (
                  <p className="text-[12px] text-slate-400">No class data yet.</p>
                ) : classBreakdown.map((item) => (
                  <div key={item.className} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-slate-900">{item.className}</p>
                      <p className="text-[11px] text-slate-400">{formatPercentage(item.collectionRate)} collected</p>
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {[{ l: "Billed", v: item.billed }, { l: "Paid", v: item.paid }, { l: "Outstanding", v: item.outstanding }].map((col) => (
                        <div key={col.l}>
                          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">{col.l}</p>
                          <p className="text-[12px] font-semibold text-slate-800">{formatCurrency(col.v)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            DIALOGS — unchanged logic, tightened UI
        ══════════════════════════════════════════════════════════════════ */}

        {/* Create / Edit Invoice */}
        <Dialog open={invoiceDialogOpen} onOpenChange={(open) => { setInvoiceDialogOpen(open); if (!open) { setEditingInvoiceId(null); setInvoiceForm(createDefaultInvoiceForm(studentFilter === "all" ? "" : studentFilter)); } }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingInvoice ? "Edit invoice" : "Create invoice"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 pt-2 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-slate-700">Student</label>
                <Select value={invoiceForm.studentId} onValueChange={(v) => setInvoiceForm((c) => ({ ...c, studentId: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>{studentsList.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.className ? ` (${s.className})` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Billing month</label><Input type="month" className="h-8 text-sm" value={invoiceForm.billingMonth} onChange={(e) => setInvoiceForm((c) => ({ ...c, billingMonth: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Due date</label><Input type="date" className="h-8 text-sm" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm((c) => ({ ...c, dueDate: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Amount</label><Input type="number" min="1" className="h-8 text-sm" value={invoiceForm.amount} onChange={(e) => setInvoiceForm((c) => ({ ...c, amount: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Fee type</label><Input className="h-8 text-sm" value={invoiceForm.feeType} onChange={(e) => setInvoiceForm((c) => ({ ...c, feeType: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Discount (optional)</label><Input type="number" min="0" step="0.01" className="h-8 text-sm" placeholder="0.00" value={invoiceForm.discount} onChange={(e) => setInvoiceForm((c) => ({ ...c, discount: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Discount reason</label><Input className="h-8 text-sm" placeholder="e.g., Merit award" maxLength={200} disabled={!invoiceForm.discount} value={invoiceForm.discountReason} onChange={(e) => setInvoiceForm((c) => ({ ...c, discountReason: e.target.value }))} /></div>
              <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Description</label><Input className="h-8 text-sm" value={invoiceForm.description} onChange={(e) => setInvoiceForm((c) => ({ ...c, description: e.target.value }))} /></div>
              <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Internal notes</label><Textarea className="text-sm" value={invoiceForm.notes} onChange={(e) => setInvoiceForm((c) => ({ ...c, notes: e.target.value }))} rows={3} /></div>
            </div>
            {(invoiceForm.amount || invoiceForm.discount) && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-6 text-sm">
                  {invoiceForm.amount && <div><p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Amount</p><p className="font-semibold text-slate-900">{formatCurrency(Number(invoiceForm.amount))}</p></div>}
                  {invoiceForm.discount && <div><p className="text-[10px] uppercase tracking-[0.14em] text-amber-500">Discount</p><p className="font-semibold text-amber-700">−{formatCurrency(Number(invoiceForm.discount))}</p></div>}
                  {invoiceForm.amount && <div><p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Net</p><p className="font-bold text-slate-900">{formatCurrency(Number(invoiceForm.amount) - (Number(invoiceForm.discount) || 0))}</p></div>}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setInvoiceDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleInvoiceSubmit} disabled={createFee.isPending || updateFee.isPending}>
                {(createFee.isPending || updateFee.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editingInvoice ? "Save invoice" : "Create invoice"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Record Payment */}
        <Dialog open={paymentDialogOpen} onOpenChange={(open) => { setPaymentDialogOpen(open); if (!open) { setPaymentInvoiceId(null); setPaymentForm(createDefaultPaymentForm()); } }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Record payment</DialogTitle>
              <DialogDescription className="text-xs">Apply payment and optional discount to the invoice.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[12px] font-semibold text-slate-800">{paymentInvoice?.invoiceNumber ?? "Invoice"} · {paymentInvoice?.student?.name}</p>
                <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                  {[{ l: "Total", v: paymentInvoice?.amount ?? 0 }, { l: "Paid", v: paymentInvoice?.paidAmount ?? 0 }, { l: "Balance", v: paymentInvoice?.remainingBalance ?? 0 }].map((i) => (
                    <div key={i.l}><p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{i.l}</p><p className="font-semibold text-slate-900">{formatCurrency(i.v)}</p></div>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Amount *</label><Input type="number" min="0" step="0.01" className="h-8 text-sm" placeholder="0.00" value={paymentForm.amount} onChange={(e) => setPaymentForm((c) => ({ ...c, amount: e.target.value }))} /></div>
                <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Payment date *</label><Input type="date" className="h-8 text-sm" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((c) => ({ ...c, paymentDate: e.target.value }))} /></div>
                <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Method *</label>
                  <Select value={paymentForm.method} onValueChange={(v) => setPaymentForm((c) => ({ ...c, method: v as PaymentFormState["method"] }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Cash", "Bank Transfer", "Card", "Mobile Money", "Cheque", "Other"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Reference</label><Input className="h-8 text-sm" placeholder="Transaction ref" value={paymentForm.reference} onChange={(e) => setPaymentForm((c) => ({ ...c, reference: e.target.value }))} /></div>
                <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Discount (optional)</label><Input type="number" min="0" step="0.01" className="h-8 text-sm" placeholder="0.00" value={paymentForm.discount} onChange={(e) => setPaymentForm((c) => ({ ...c, discount: e.target.value }))} /></div>
                <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Discount reason</label><Input className="h-8 text-sm" placeholder="e.g., Early payment" maxLength={200} disabled={!paymentForm.discount} value={paymentForm.discountReason} onChange={(e) => setPaymentForm((c) => ({ ...c, discountReason: e.target.value }))} /></div>
                <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Notes</label><Textarea className="text-sm" rows={2} placeholder="Additional details…" value={paymentForm.notes} onChange={(e) => setPaymentForm((c) => ({ ...c, notes: e.target.value }))} /></div>
              </div>
              {(paymentForm.amount || paymentForm.discount) && (
                <div className="flex items-center gap-6 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm">
                  <div><p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Payment</p><p className="font-semibold text-slate-900">{formatCurrency(Number(paymentForm.amount) || 0)}</p></div>
                  {paymentForm.discount && <div><p className="text-[10px] uppercase tracking-[0.14em] text-emerald-500">Discount</p><p className="font-semibold text-emerald-700">{formatCurrency(Number(paymentForm.discount))}</p></div>}
                  <div><p className="text-[10px] uppercase tracking-[0.14em] text-blue-500">Total adj.</p><p className="font-bold text-blue-700">{formatCurrency((Number(paymentForm.amount) || 0) + (Number(paymentForm.discount) || 0))}</p></div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handlePaymentSubmit} disabled={recordPayment.isPending || !paymentInvoice || !paymentForm.amount}>
                {recordPayment.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ReceiptText className="mr-1.5 h-3.5 w-3.5" />}
                Record payment
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Billing Profile */}
        <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editingProfile ? "Edit billing profile" : "Add billing profile"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 pt-2 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Student</label><Select value={profileForm.studentId} onValueChange={(v) => setProfileForm((c) => ({ ...c, studentId: v }))}><SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select student" /></SelectTrigger><SelectContent>{studentsList.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.className ? ` (${s.className})` : ""}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Monthly amount</label><Input type="number" min="1" className="h-8 text-sm" value={profileForm.monthlyAmount} onChange={(e) => setProfileForm((c) => ({ ...c, monthlyAmount: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Due day</label><Input type="number" min="1" max="28" className="h-8 text-sm" value={profileForm.dueDay} onChange={(e) => setProfileForm((c) => ({ ...c, dueDay: e.target.value }))} /></div>
              <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Status</label><Select value={profileForm.isActive ? "active" : "inactive"} onValueChange={(v) => setProfileForm((c) => ({ ...c, isActive: v === "active" }))}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Notes</label><Textarea className="text-sm" value={profileForm.notes} onChange={(e) => setProfileForm((c) => ({ ...c, notes: e.target.value }))} rows={3} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-1"><Button variant="outline" size="sm" onClick={() => setProfileDialogOpen(false)}>Cancel</Button><Button size="sm" onClick={handleProfileSubmit} disabled={upsertBillingProfile.isPending}>{upsertBillingProfile.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save profile"}</Button></div>
          </DialogContent>
        </Dialog>

        {/* Generate Monthly Fees */}
        <Dialog open={generationDialogOpen} onOpenChange={setGenerationDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Generate monthly fees</DialogTitle></DialogHeader>
            <div className="grid gap-3 pt-2 md:grid-cols-2">
              <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Billing month</label><Input type="month" className="h-8 text-sm" value={generationForm.billingMonth} onChange={(e) => setGenerationForm((c) => ({ ...c, billingMonth: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Due day override</label><Input type="number" min="1" max="28" className="h-8 text-sm" placeholder="Use profile default" value={generationForm.dueDayOverride} onChange={(e) => setGenerationForm((c) => ({ ...c, dueDayOverride: e.target.value }))} /></div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-slate-700">Class scope</label>
                <Select value={generationForm.classNameFilter} onValueChange={(value) => setGenerationForm((c) => ({ ...c, classNameFilter: value }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {studentClassOptions.map((className) => <SelectItem key={className} value={className}>{className}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Duplicate prevention is automatic per student and billing month. You can now run generation for all classes or limit it to a single class. Students without an active billing profile are skipped.</p>
            {lastGenerationResult && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[{ l: "Target students", v: lastGenerationResult.targetStudentCount }, { l: "Generated", v: lastGenerationResult.generatedCount }, { l: "Duplicates skipped", v: lastGenerationResult.skippedDuplicates }, { l: "Missing profiles", v: lastGenerationResult.skippedMissingProfiles }].map((i) => (
                    <div key={i.l}><p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{i.l}</p><p className="text-xl font-bold text-slate-900">{i.v}</p></div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  Scope: <span className="font-medium text-slate-700">{lastGenerationResult.classNameFilter ?? "All classes"}</span>
                  {" • "}
                  Errors: <span className="font-medium text-slate-700">{lastGenerationResult.errorCount}</span>
                </p>
                {lastGenerationResult.skippedStudents.length > 0 && (
                  <div className="space-y-1"><p className="text-[11px] font-semibold text-slate-700">Skipped students</p>{lastGenerationResult.skippedStudents.slice(0, 6).map((s) => <div key={`${s.studentId}-${s.reason}`} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]"><span className="font-medium text-slate-800">{s.studentName}</span><span className="ml-2 text-slate-400">{s.reason}</span></div>)}</div>
                )}
                {lastGenerationResult.errors.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-slate-700">Generation errors</p>
                    {lastGenerationResult.errors.slice(0, 6).map((error) => <div key={`${error.studentId}-${error.message}`} className="rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-[11px]"><span className="font-medium text-slate-800">{error.studentName}</span><span className="ml-2 text-rose-500">{error.message}</span></div>)}
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setGenerationDialogOpen(false)}>Close</Button><Button size="sm" onClick={handleGenerateMonthlyFees} disabled={generateMonthlyFees.isPending}>{generateMonthlyFees.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run generation"}</Button></div>
          </DialogContent>
        </Dialog>

        {/* Invoice Detail */}
        <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setDetailInvoiceId(null)}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedInvoice?.invoiceNumber ?? (selectedInvoice ? `Invoice ${selectedInvoice.id}` : "Invoice details")}</DialogTitle>
            </DialogHeader>
            {selectedInvoice && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[{ label: "Student", value: selectedInvoice.student?.name ?? `#${selectedInvoice.studentId}` }, { label: "Period", value: selectedInvoice.billingPeriod }, { label: "Due date", value: formatDate(selectedInvoice.dueDate, "MMM dd, yyyy") }, { label: "Status", value: selectedInvoice.remainingBalance <= 0 && selectedInvoice.paidAmount > 0 ? "Paid" : selectedInvoice.status }].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{item.label}</p>
                      <p className="mt-0.5 text-[13px] font-semibold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
                {(() => {
                  const totalDiscount = selectedInvoice.totalDiscount;
                  const totalLateFee = selectedInvoice.adjustments?.filter((a: any) => a.type === "fine").reduce((s: number, a: any) => s + a.amount, 0) ?? 0;
                  return (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.14em] text-blue-500">Original</p><p className="mt-0.5 text-sm font-bold text-blue-900">{formatCurrency(selectedInvoice.amount)}</p></div>
                      {totalDiscount > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.14em] text-amber-600">Discount</p><p className="mt-0.5 text-sm font-bold text-amber-900">−{formatCurrency(totalDiscount)}</p></div>}
                      {totalLateFee > 0 && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.14em] text-rose-600">Late fee</p><p className="mt-0.5 text-sm font-bold text-rose-900">+{formatCurrency(totalLateFee)}</p></div>}
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.14em] text-emerald-600">Paid</p><p className="mt-0.5 text-sm font-bold text-emerald-700">{formatCurrency(selectedInvoice.paidAmount)}</p></div>
                      <div className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Remaining</p><p className="mt-0.5 text-sm font-bold text-slate-900">{formatCurrency(selectedInvoice.remainingBalance)}</p></div>
                    </div>
                  );
                })()}
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold text-slate-700">Invoice items</p>
                    {(selectedInvoice.lineItems.length ? selectedInvoice.lineItems : [{ label: selectedInvoice.description, amount: selectedInvoice.amount }]).map((item, index) => (
                      <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                        <p className="text-[12px] font-medium text-slate-800">{item.label}</p>
                        <p className="text-[12px] font-semibold text-slate-900">{formatCurrency(item.amount)}</p>
                      </div>
                    ))}
                    {selectedInvoice.notes && <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-500">{selectedInvoice.notes}</div>}
                  </div>
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold text-slate-700">Adjustments</p>
                    {(() => {
                      const items = [...(selectedInvoice.adjustments ?? []), ...(selectedInvoice.payments ?? []).filter((p: any) => p.discount > 0).map((p: any) => ({ id: `d-${p.id}`, type: "discount", reason: p.discountReason || "Payment discount", amount: p.discount, notes: `Applied ${formatDate(p.paymentDate, "MMM dd")}` }))];
                      return items.length === 0 ? <p className="text-[12px] text-slate-400">No adjustments.</p> : items.map((adj: any) => (
                        <div key={adj.id} className={`rounded-lg border px-3 py-2 ${adj.type === "fine" ? "border-rose-100 bg-rose-50/50" : "border-amber-100 bg-amber-50/50"}`}>
                          <div className="flex items-center justify-between">
                            <p className="text-[12px] font-semibold text-slate-800">{adj.type === "fine" ? "Late fee" : "Discount"} — {adj.reason}</p>
                            <p className={`text-[12px] font-bold ${adj.type === "fine" ? "text-rose-700" : "text-amber-700"}`}>{adj.type === "fine" ? "+" : "−"}{formatCurrency(adj.amount)}</p>
                          </div>
                          {adj.notes && <p className="mt-0.5 text-[10px] text-slate-400">{adj.notes}</p>}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[12px] font-semibold text-slate-700">Payments</p>
                  {(selectedInvoice.payments ?? []).length === 0 ? <p className="text-[12px] text-slate-400">No payments recorded yet.</p> : (selectedInvoice.payments ?? []).map((payment: any) => (
                    <div key={payment.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                      <div><p className="text-[12px] font-semibold text-slate-900">{formatDate(payment.paymentDate, "MMM dd, yyyy")}</p><p className="text-[11px] text-slate-400">{payment.method} · {payment.receiptNumber ?? "pending"}</p></div>
                      <div className="flex items-center gap-2"><p className="text-[13px] font-bold text-slate-900">{formatCurrency(payment.amount)}</p><Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => handlePrintReceipt(selectedInvoice, payment)}><Printer className="h-3 w-3" /></Button></div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {selectedInvoice.remainingBalance > 0 && <Button variant="outline" size="sm" onClick={() => openPaymentDialog(selectedInvoice)}><ReceiptText className="mr-1.5 h-3.5 w-3.5" />Record payment</Button>}
                  <Button variant="outline" size="sm" onClick={() => handlePrintInvoice(selectedInvoice)}><Printer className="mr-1.5 h-3.5 w-3.5" />Print / PDF</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog open={!!deletingInvoice} onOpenChange={(open) => !open && setDeleteInvoiceId(null)}>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete invoice?</AlertDialogTitle><AlertDialogDescription>This will permanently remove {deletingInvoice?.invoiceNumber ?? "the selected invoice"} and its payment history.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteInvoice}>{deleteFee.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>

        <FeeAdjustmentDialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen} selectedStudent={studentFilter === "all" ? undefined : { id: Number(studentFilter), name: studentDirectory.get(Number(studentFilter))?.name ?? "" }} />
        <ApplyLateFeeDialog open={lateFeeDialogOpen} onOpenChange={setLateFeeDialogOpen} selectedStudent={studentFilter === "all" ? undefined : { id: Number(studentFilter), name: studentDirectory.get(Number(studentFilter))?.name ?? "" }} />
        <GenerateSingleStudentFeeDialog open={singleStudentFeeDialogOpen} onOpenChange={setSingleStudentFeeDialogOpen} />
      </div>
    </Layout>
  );
}
// import { useEffect, useMemo, useState } from "react";
// import { feeStatuses, buildDueDateForBillingMonth, formatBillingPeriod } from "@shared/finance";
// import { Layout } from "@/components/layout";
// import { useToast } from "@/hooks/use-toast";
// import { usePublicSchoolSettings } from "@/hooks/use-settings";
// import { useStudents } from "@/hooks/use-users";
// import {
//   type BillingProfileRecord,
//   type FinanceReportFilters,
//   type MonthlyGenerationResult,
//   useBillingProfiles,
//   useCreateFee,
//   useDeleteFee,
//   useFeeBalanceSummary,
//   useFinanceReport,
//   useGenerateMonthlyFees,
//   useOverdueBalances,
//   useRecordFeePayment,
//   useUpdateFee,
//   useUpsertBillingProfile,
// } from "@/hooks/use-fees";
// import { FeeAdjustmentDialog } from "./finance/FeeAdjustmentDialog";
// import { GenerateSingleStudentFeeDialog } from "./finance/GenerateSingleStudentFeeDialog";
// import { ApplyLateFeeDialog } from "./finance/ApplyLateFeeDialog";
// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// import { Input } from "@/components/ui/input";
// import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Textarea } from "@/components/ui/textarea";
// import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
// import { Banknote, CalendarDays, Clock, CreditCard, Download, Eye, FilePlus2, Loader2, Pencil, Printer, ReceiptText, RefreshCcw, Search, Settings2, Trash2, Users, Zap, Gift } from "lucide-react";
// import { buildInvoicePrintHtml, buildPaymentReceiptPrintHtml, type FeePaymentRecord, type FeeRecord, getCurrentBillingMonth, getFeeStatusClassName, getLatestRecordedPayment } from "@/lib/finance";
// import { downloadCsv, formatCurrency, formatDate, getErrorMessage, openPrintWindow, paginateItems } from "@/lib/utils";

// const PAGE_SIZE = 10;
// type InvoiceFormState = { studentId: string; amount: string; billingMonth: string; dueDate: string; description: string; feeType: string; notes: string; discount: string; discountReason: string };
// type PaymentFormState = { amount: string; paymentDate: string; method: "Cash" | "Bank Transfer" | "Card" | "Mobile Money" | "Cheque" | "Other"; reference: string; notes: string; discount: string; discountReason: string };
// type BillingProfileFormState = { studentId: string; monthlyAmount: string; dueDay: string; isActive: boolean; notes: string };
// type GenerationFormState = { billingMonth: string; dueDayOverride: string };

// function createDefaultInvoiceForm(studentId = ""): InvoiceFormState {
//   const billingMonth = getCurrentBillingMonth();
//   return { studentId, amount: "", billingMonth, dueDate: buildDueDateForBillingMonth(billingMonth, 5), description: "Monthly tuition fee", feeType: "Monthly Fee", notes: "", discount: "", discountReason: "" };
// }
// function createDefaultPaymentForm(balance = 0): PaymentFormState {
//   return { amount: balance > 0 ? String(balance) : "", paymentDate: new Date().toISOString().slice(0, 10), method: "Cash", reference: "", notes: "", discount: "", discountReason: "" };
// }
// function createDefaultBillingProfileForm(studentId = ""): BillingProfileFormState {
//   return { studentId, monthlyAmount: "", dueDay: "5", isActive: true, notes: "" };
// }
// function buildStatusBadge(status: FeeRecord["status"]) {
//   return <Badge variant="outline" className={getFeeStatusClassName(status)}>{status}</Badge>;
// }
// function formatPercentage(value: number) {
//   return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
// }

// // ── Compact column header ─────────────────────────────────────────────────
// function ColHead({ children, right }: { children: React.ReactNode; right?: boolean }) {
//   return (
//     <th
//       className={`whitespace-nowrap border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 first:pl-4 last:pr-4 ${right ? "text-right" : "text-left"}`}
//     >
//       {children}
//     </th>
//   );
// }

// // ── Compact table cell ───────────────────────────────────────────────────
// function TD({ children, right, className = "" }: { children: React.ReactNode; right?: boolean; className?: string }) {
//   return (
//     <td className={`px-3 py-0 first:pl-4 last:pr-4 ${right ? "text-right" : ""} ${className}`}>
//       {children}
//     </td>
//   );
// }

// export default function Finance() {
//   usePublicSchoolSettings();
//   const { toast } = useToast();
//   const { data: students = [] } = useStudents();
//   const { data: profiles = [], isLoading: profilesLoading } = useBillingProfiles();
//   const [searchTerm, setSearchTerm] = useState("");
//   const [statusFilter, setStatusFilter] = useState<"all" | FeeRecord["status"]>("all");
//   const [studentFilter, setStudentFilter] = useState<string>("all");
//   const [monthFilter, setMonthFilter] = useState<string>("all");
//   const [currentPage, setCurrentPage] = useState(1);
//   const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
//   const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
//   const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
//   const [paymentInvoiceId, setPaymentInvoiceId] = useState<number | null>(null);
//   const [detailInvoiceId, setDetailInvoiceId] = useState<number | null>(null);
//   const [deleteInvoiceId, setDeleteInvoiceId] = useState<number | null>(null);
//   const [profileDialogOpen, setProfileDialogOpen] = useState(false);
//   const [editingProfileStudentId, setEditingProfileStudentId] = useState<number | null>(null);
//   const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
//   const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
//   const [lateFeeDialogOpen, setLateFeeDialogOpen] = useState(false);
//   const [singleStudentFeeDialogOpen, setSingleStudentFeeDialogOpen] = useState(false);
//   const [lastGenerationResult, setLastGenerationResult] = useState<MonthlyGenerationResult | null>(null);
//   const [invoiceForm, setInvoiceForm] = useState<InvoiceFormState>(() => createDefaultInvoiceForm());
//   const [paymentForm, setPaymentForm] = useState<PaymentFormState>(() => createDefaultPaymentForm());
//   const [profileForm, setProfileForm] = useState<BillingProfileFormState>(() => createDefaultBillingProfileForm());
//   const [generationForm, setGenerationForm] = useState<GenerationFormState>({ billingMonth: getCurrentBillingMonth(), dueDayOverride: "" });

//   const createFee = useCreateFee();
//   const updateFee = useUpdateFee();
//   const deleteFee = useDeleteFee();
//   const recordPayment = useRecordFeePayment();
//   const upsertBillingProfile = useUpsertBillingProfile();
//   const generateMonthlyFees = useGenerateMonthlyFees();

//   const reportFilters = useMemo<FinanceReportFilters>(() => ({
//     month: monthFilter === "all" ? undefined : monthFilter,
//     studentId: studentFilter === "all" ? undefined : Number(studentFilter),
//     status: statusFilter === "all" ? undefined : statusFilter,
//   }), [monthFilter, statusFilter, studentFilter]);

//   const { data: report, isLoading: reportLoading } = useFinanceReport(reportFilters);
//   const { data: balanceSummary } = useFeeBalanceSummary();
//   const { data: overdueBalances = [] } = useOverdueBalances();

//   const studentsList = useMemo(() => [...students].sort((a, b) => a.name.localeCompare(b.name)), [students]);
//   const studentDirectory = useMemo(() => new Map(studentsList.map((s) => [s.id, s])), [studentsList]);
//   const invoices = report?.invoices ?? [];
//   const recentPayments = useMemo(() => [...(report?.payments ?? [])].sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate)).slice(0, 6), [report?.payments]);
//   const paymentMethodBreakdown = useMemo(() => (report?.paymentMethodBreakdown ?? []).filter((i) => i.count > 0 || i.amount > 0), [report?.paymentMethodBreakdown]);
//   const classBreakdown = useMemo(() => (report?.classBreakdown ?? []).slice(0, 6), [report?.classBreakdown]);
//   const overduePreview = useMemo(() => overdueBalances.slice(0, 4), [overdueBalances]);
//   const invoiceDirectory = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);
//   const selectedInvoice = useMemo(() => invoices.find((i) => i.id === detailInvoiceId), [detailInvoiceId, invoices]);
//   const editingInvoice = useMemo(() => invoices.find((i) => i.id === editingInvoiceId), [editingInvoiceId, invoices]);
//   const paymentInvoice = useMemo(() => invoices.find((i) => i.id === paymentInvoiceId), [invoices, paymentInvoiceId]);
//   const deletingInvoice = useMemo(() => invoices.find((i) => i.id === deleteInvoiceId), [deleteInvoiceId, invoices]);
//   const editingProfile = useMemo(() => profiles.find((p) => p.studentId === editingProfileStudentId), [editingProfileStudentId, profiles]);
//   const filteredInvoices = useMemo(() => invoices.filter((invoice) =>
//     [invoice.invoiceNumber ?? `INV-${invoice.id}`, invoice.student?.name ?? "", invoice.student?.className ?? "", invoice.billingPeriod, invoice.description, invoice.status]
//       .join(" ").toLowerCase().includes(searchTerm.trim().toLowerCase())
//   ), [invoices, searchTerm]);
//   const paginated = paginateItems(filteredInvoices, currentPage, PAGE_SIZE);
//   const missingProfiles = useMemo(() => {
//     const existing = new Set(profiles.map((p) => p.studentId));
//     return studentsList.filter((s) => !existing.has(s.id));
//   }, [profiles, studentsList]);
//   const billingMonths = useMemo(() => Array.from(new Set(invoices.map((i) => i.billingMonth))).sort((a, b) => b.localeCompare(a)), [invoices]);

//   useEffect(() => { setCurrentPage(1); }, [searchTerm, monthFilter, statusFilter, studentFilter]);

//   const openCreateInvoiceDialog = () => {
//     setEditingInvoiceId(null);
//     setInvoiceForm(createDefaultInvoiceForm(studentFilter === "all" ? "" : studentFilter));
//     setInvoiceDialogOpen(true);
//   };
//   const openEditInvoiceDialog = (invoice: FeeRecord) => {
//     setEditingInvoiceId(invoice.id);
//     setInvoiceForm({ studentId: String(invoice.studentId), amount: String(invoice.amount), billingMonth: invoice.billingMonth, dueDate: invoice.dueDate, description: invoice.description, feeType: invoice.feeType, notes: invoice.notes ?? "", discount: "", discountReason: "" });
//     setInvoiceDialogOpen(true);
//   };
//   const openPaymentDialog = (invoice: FeeRecord) => {
//     setPaymentInvoiceId(invoice.id);
//     setPaymentForm(createDefaultPaymentForm(invoice.remainingBalance));
//     setPaymentDialogOpen(true);
//   };
//   const openProfileDialog = (profile?: BillingProfileRecord) => {
//     setEditingProfileStudentId(profile?.studentId ?? null);
//     setProfileForm(profile ? { studentId: String(profile.studentId), monthlyAmount: String(profile.monthlyAmount), dueDay: String(profile.dueDay), isActive: profile.isActive, notes: profile.notes ?? "" } : createDefaultBillingProfileForm(studentFilter === "all" ? "" : studentFilter));
//     setProfileDialogOpen(true);
//   };
//   const handlePrintInvoice = (invoice: FeeRecord) => openPrintWindow(invoice.invoiceNumber ?? `Invoice ${invoice.id}`, buildInvoicePrintHtml(invoice), { documentType: "invoice", subtitle: `${invoice.student?.name ?? `Student #${invoice.studentId}`} • ${invoice.billingPeriod}` });
//   const handlePrintReceipt = (invoice: FeeRecord, payment: FeePaymentRecord) => openPrintWindow(payment.receiptNumber ?? `Receipt ${payment.id}`, buildPaymentReceiptPrintHtml(invoice, payment), { documentType: "receipt", subtitle: `${invoice.student?.name ?? `Student #${invoice.studentId}`} • ${invoice.invoiceNumber ?? `INV-${invoice.id}`}` });
//   const handleExportInvoices = () => downloadCsv(`finance-report-${monthFilter === "all" ? "all" : monthFilter}.csv`, filteredInvoices.map((invoice) => ({ Invoice: invoice.invoiceNumber ?? `INV-${invoice.id}`, Student: invoice.student?.name ?? `Student #${invoice.studentId}`, Class: invoice.student?.className ?? "", BillingMonth: invoice.billingMonth, BillingPeriod: invoice.billingPeriod, DueDate: invoice.dueDate, TotalAmount: invoice.amount, Discount: invoice.totalDiscount ?? 0, PaidAmount: invoice.paidAmount, RemainingBalance: invoice.remainingBalance, Status: invoice.status })));

//   const handleInvoiceSubmit = async () => {
//     try {
//       const amount = Number(invoiceForm.amount);
//       const discount = invoiceForm.discount ? Number(invoiceForm.discount) : null;
//       if (discount && discount > amount) throw new Error("Discount cannot exceed invoice amount");
//       const payload = { studentId: Number(invoiceForm.studentId), amount, billingMonth: invoiceForm.billingMonth, billingPeriod: formatBillingPeriod(invoiceForm.billingMonth), dueDate: invoiceForm.dueDate, description: invoiceForm.description.trim(), feeType: invoiceForm.feeType.trim() || "Monthly Fee", notes: invoiceForm.notes.trim() || null, lineItems: [{ label: invoiceForm.description.trim() || "Invoice item", amount }], source: "manual" as const, discount: discount || null, discountReason: (discount && invoiceForm.discountReason.trim()) || null };
//       if (editingInvoice) { await updateFee.mutateAsync({ id: editingInvoice.id, ...payload }); } else { await createFee.mutateAsync(payload); }
//       toast({ title: editingInvoice ? "Invoice updated" : "Invoice created", description: `${invoiceForm.description} for ${formatCurrency(amount)} has been saved.` });
//       setInvoiceDialogOpen(false); setEditingInvoiceId(null); setInvoiceForm(createDefaultInvoiceForm(studentFilter === "all" ? "" : studentFilter));
//     } catch (error) { toast({ title: "Unable to save invoice", description: getErrorMessage(error), variant: "destructive" }); }
//   };

//   const handlePaymentSubmit = async () => {
//     if (!paymentInvoice) return;
//     try {
//       const amount = Number(paymentForm.amount);
//       const discount = paymentForm.discount ? Number(paymentForm.discount) : null;
//       if (!amount || amount <= 0) throw new Error("Payment amount must be greater than 0");
//       if (discount && discount > paymentInvoice.remainingBalance) throw new Error("Discount cannot exceed the remaining invoice balance");
//       if (amount > paymentInvoice.remainingBalance) throw new Error(`Payment cannot exceed remaining balance of ${formatCurrency(paymentInvoice.remainingBalance)}`);
//       const updatedInvoice = await recordPayment.mutateAsync({ id: paymentInvoice.id, amount, paymentDate: paymentForm.paymentDate, method: paymentForm.method, reference: paymentForm.reference.trim() || null, notes: paymentForm.notes.trim() || null, discount: discount || null, discountReason: (discount && paymentForm.discountReason.trim()) || null });
//       const recordedPayment = getLatestRecordedPayment(updatedInvoice);
//       const discountText = discount ? ` + ${formatCurrency(discount)} discount` : "";
//       toast({ title: "Payment recorded", description: `${formatCurrency(amount)}${discountText} applied to ${paymentInvoice.invoiceNumber ?? `invoice ${paymentInvoice.id}`}.` });
//       setPaymentDialogOpen(false); setPaymentInvoiceId(null); setPaymentForm(createDefaultPaymentForm()); setDetailInvoiceId(null);
//       if (recordedPayment) handlePrintReceipt(updatedInvoice, recordedPayment);
//     } catch (error) { toast({ title: "Unable to record payment", description: getErrorMessage(error), variant: "destructive" }); }
//   };

//   const handleProfileSubmit = async () => {
//     try {
//       await upsertBillingProfile.mutateAsync({ studentId: Number(profileForm.studentId), monthlyAmount: Number(profileForm.monthlyAmount), dueDay: Number(profileForm.dueDay), isActive: profileForm.isActive, notes: profileForm.notes.trim() || null });
//       toast({ title: editingProfile ? "Billing profile updated" : "Billing profile saved", description: "Monthly billing defaults are now available for fee generation." });
//       setProfileDialogOpen(false); setEditingProfileStudentId(null); setProfileForm(createDefaultBillingProfileForm(studentFilter === "all" ? "" : studentFilter));
//     } catch (error) { toast({ title: "Unable to save billing profile", description: getErrorMessage(error), variant: "destructive" }); }
//   };

//   const handleGenerateMonthlyFees = async () => {
//     try {
//       const result = await generateMonthlyFees.mutateAsync({ billingMonth: generationForm.billingMonth, dueDayOverride: generationForm.dueDayOverride ? Number(generationForm.dueDayOverride) : undefined });
//       setLastGenerationResult(result);
//       toast({ title: "Monthly fee generation complete", description: `Generated ${result.generatedCount} invoice(s), skipped ${result.skippedDuplicates} duplicate(s), and flagged ${result.skippedMissingProfiles} student(s) without active billing setup.` });
//     } catch (error) { toast({ title: "Unable to generate monthly invoices", description: getErrorMessage(error), variant: "destructive" }); }
//   };

//   const handleDeleteInvoice = async () => {
//     if (!deletingInvoice) return;
//     try {
//       await deleteFee.mutateAsync(deletingInvoice.id);
//       toast({ title: "Invoice deleted", description: `${deletingInvoice.invoiceNumber ?? `Invoice ${deletingInvoice.id}`} has been removed.` });
//       setDeleteInvoiceId(null);
//     } catch (error) { toast({ title: "Unable to delete invoice", description: getErrorMessage(error), variant: "destructive" }); }
//   };

//   return (
//     <Layout>
//       <div className="space-y-6 pb-8">

//         {/* ── Page header ───────────────────────────────────────────────── */}
//         <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
//           <div>
//             <h1 className="text-2xl font-bold tracking-tight text-slate-900">Finance Workspace</h1>
//             <p className="mt-0.5 text-sm text-slate-500">Manage invoices, payments, monthly fee generation, and billing documents.</p>
//           </div>
//           <div className="flex flex-wrap gap-2">
//             <Button variant="outline" size="sm" onClick={() => setGenerationDialogOpen(true)}><RefreshCcw className="mr-1.5 h-3.5 w-3.5" />Generate fees</Button>
//             <Button variant="outline" size="sm" onClick={() => setSingleStudentFeeDialogOpen(true)}><Zap className="mr-1.5 h-3.5 w-3.5" />Single student</Button>
//             <Button variant="outline" size="sm" onClick={() => setAdjustmentDialogOpen(true)}><Gift className="mr-1.5 h-3.5 w-3.5" />Adjustment</Button>
//             <Button variant="outline" size="sm" onClick={() => setLateFeeDialogOpen(true)}><Clock className="mr-1.5 h-3.5 w-3.5" />Late fee</Button>
//             <Button variant="outline" size="sm" onClick={() => openProfileDialog()}><Settings2 className="mr-1.5 h-3.5 w-3.5" />Billing profiles</Button>
//             <Button variant="outline" size="sm" onClick={handleExportInvoices} disabled={filteredInvoices.length === 0}><Download className="mr-1.5 h-3.5 w-3.5" />Export</Button>
//             <Button size="sm" onClick={openCreateInvoiceDialog}><FilePlus2 className="mr-1.5 h-3.5 w-3.5" />Create invoice</Button>
//           </div>
//         </section>

//         {/* ── KPI strip ─────────────────────────────────────────────────── */}
//         <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
//           {[
//             { label: "Total billed", value: formatCurrency(report?.summary.totalBilled ?? 0), hint: `${report?.summary.totalInvoices ?? 0} invoices`, icon: Banknote, iconBg: "bg-indigo-50", iconColor: "text-indigo-600", border: "border-indigo-100/60" },
//             { label: "Collected", value: formatCurrency(report?.summary.totalPaid ?? 0), hint: `${report?.summary.paymentsCount ?? 0} payments`, icon: ReceiptText, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", border: "border-emerald-100/60" },
//             { label: "Collection rate", value: formatPercentage(report?.summary.collectionRate ?? 0), hint: `${report?.summary.studentsWithOutstanding ?? 0} with balance`, icon: ReceiptText, iconBg: "bg-blue-50", iconColor: "text-blue-600", border: "border-blue-100/60" },
//             { label: "Outstanding", value: formatCurrency(report?.summary.totalOutstanding ?? 0), hint: `${balanceSummary?.openInvoices ?? 0} open`, icon: CreditCard, iconBg: "bg-amber-50", iconColor: "text-amber-600", border: "border-amber-100/60" },
//             { label: "Overdue", value: formatCurrency(report?.summary.overdueBalance ?? 0), hint: `${report?.summary.overdueInvoices ?? 0} overdue`, icon: CalendarDays, iconBg: "bg-rose-50", iconColor: "text-rose-600", border: "border-rose-100/60" },
//             { label: "Due soon / No profile", value: `${balanceSummary?.dueSoonInvoices ?? 0} / ${missingProfiles.length}`, hint: `${profiles.length} profiles set`, icon: Users, iconBg: "bg-slate-100", iconColor: "text-slate-500", border: "border-slate-200/60" },
//           ].map((item) => (
//             <div
//               key={item.label}
//               className={`flex flex-col items-center justify-center gap-2 rounded-xl border bg-white px-3 py-4 text-center shadow-none transition-shadow hover:shadow-sm ${item.border}`}
//             >
//               <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.iconBg} ${item.iconColor}`}>
//                 <item.icon className="h-4 w-4" />
//               </div>
//               <div>
//                 <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 leading-tight">{item.label}</p>
//                 <p className="mt-1 text-xl font-bold leading-none text-slate-900 sm:text-2xl">{item.value}</p>
//                 <p className="mt-1 text-[11px] text-slate-400 leading-tight">{item.hint}</p>
//               </div>
//             </div>
//           ))}
//         </section>

//         {/* ── Filters ───────────────────────────────────────────────────── */}
//         <Card className="border-slate-200/80 bg-white shadow-none">
//           <CardContent className="p-3">
//             <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
//               {/* Search — full width on mobile, grows on desktop */}
//               <div className="relative w-full sm:min-w-[200px] sm:flex-1">
//                 <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
//                 <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search student, invoice #, class…" className="h-9 pl-8 text-sm" />
//               </div>
//               {/* Selects — 2-col on mobile, inline on sm+ */}
//               <div className="grid grid-cols-2 gap-2 sm:contents">
//                 <Select value={monthFilter} onValueChange={setMonthFilter}>
//                   <SelectTrigger className="h-9 w-full text-sm sm:w-[140px]"><SelectValue placeholder="All months" /></SelectTrigger>
//                   <SelectContent><SelectItem value="all">All months</SelectItem>{billingMonths.map((m) => <SelectItem key={m} value={m}>{formatBillingPeriod(m)}</SelectItem>)}</SelectContent>
//                 </Select>
//                 <Select value={studentFilter} onValueChange={setStudentFilter}>
//                   <SelectTrigger className="h-9 w-full text-sm sm:w-[140px]"><SelectValue placeholder="All students" /></SelectTrigger>
//                   <SelectContent><SelectItem value="all">All students</SelectItem>{studentsList.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.className ? ` (${s.className})` : ""}</SelectItem>)}</SelectContent>
//                 </Select>
//                 <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | FeeRecord["status"])}>
//                   <SelectTrigger className="h-9 w-full text-sm sm:w-[140px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
//                   <SelectContent><SelectItem value="all">All statuses</SelectItem>{feeStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
//                 </Select>
//                 <Button variant="outline" size="sm" className="h-9 w-full sm:w-auto" onClick={() => { setSearchTerm(""); setMonthFilter("all"); setStudentFilter("all"); setStatusFilter("all"); }}>
//                   Clear filters
//                 </Button>
//               </div>
//             </div>
//           </CardContent>
//         </Card>

//         {/* ── Invoice table — full width ────────────────────────────────── */}
//         <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
//           {/* Card header */}
//           <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
//             <div>
//               <CardTitle className="text-sm font-semibold text-slate-900">Invoices</CardTitle>
//               <CardDescription className="text-[11px]">
//                 {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""} &nbsp;·&nbsp; Outstanding {formatCurrency(filteredInvoices.reduce((s, i) => s + i.remainingBalance, 0))}
//               </CardDescription>
//             </div>
//           </CardHeader>

//           {/* Table */}
//           <div className="w-full overflow-x-auto">
//             <table className="w-full min-w-[860px] border-collapse text-sm">
//               <thead>
//                 <tr>
//                   <ColHead>Student</ColHead>
//                   <ColHead>Invoice</ColHead>
//                   <ColHead>Period</ColHead>
//                   <ColHead right>Total</ColHead>
//                   <ColHead right>Paid</ColHead>
//                   <ColHead right>Balance</ColHead>
//                   <ColHead right>Discount</ColHead>
//                   <ColHead>Status</ColHead>
//                   <ColHead right>Actions</ColHead>
//                 </tr>
//               </thead>
//               <tbody>
//                 {reportLoading ? (
//                   <tr>
//                     <td colSpan={9} className="py-12 text-center">
//                       <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
//                     </td>
//                   </tr>
//                 ) : filteredInvoices.length === 0 ? (
//                   <tr>
//                     <td colSpan={9} className="py-12 text-center text-sm text-slate-400">
//                       No invoices match the current filters.
//                     </td>
//                   </tr>
//                 ) : (
//                   paginated.pageItems.map((invoice, idx) => {
//                     const lateFees = (invoice.adjustments ?? []).filter((a: any) => a.type === "fine").reduce((s: number, a: any) => s + a.amount, 0);
//                     return (
//                       <tr
//                         key={invoice.id}
//                         className={`group border-b border-slate-100 last:border-b-0 transition-colors duration-100 hover:bg-indigo-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
//                       >
//                         {/* Student */}
//                         <TD>
//                           <div className="py-2.5">
//                             <p className="max-w-[160px] truncate text-[13px] font-semibold text-slate-900">
//                               {invoice.student?.name ?? `Student #${invoice.studentId}`}
//                             </p>
//                             <p className="max-w-[160px] truncate text-[11px] text-slate-400">
//                               {invoice.student?.className ?? "—"}
//                             </p>
//                           </div>
//                         </TD>

//                         {/* Invoice # */}
//                         <TD>
//                           <p className="text-[12px] font-mono font-medium text-slate-700">
//                             {invoice.invoiceNumber ?? `INV-${invoice.id}`}
//                           </p>
//                           <p className="text-[11px] text-slate-400">
//                             Due {formatDate(invoice.dueDate, "MMM dd")}
//                           </p>
//                         </TD>

//                         {/* Period */}
//                         <TD>
//                           <p className="text-[12px] text-slate-600">{invoice.billingPeriod}</p>
//                           <p className="text-[11px] text-slate-400">{invoice.paymentCount} pmt{invoice.paymentCount !== 1 ? "s" : ""}</p>
//                         </TD>

//                         {/* Total */}
//                         <TD right>
//                           <p className="text-[13px] font-semibold text-slate-900">{formatCurrency(invoice.amount)}</p>
//                         </TD>

//                         {/* Paid */}
//                         <TD right>
//                           <p className="text-[13px] font-semibold text-emerald-600">{formatCurrency(invoice.paidAmount)}</p>
//                         </TD>

//                         {/* Balance */}
//                         <TD right>
//                           <p className={`text-[13px] font-semibold ${invoice.remainingBalance > 0 ? "text-rose-600" : "text-slate-400"}`}>
//                             {formatCurrency(invoice.remainingBalance)}
//                           </p>
//                         </TD>

//                         {/* Discount + late fee pill */}
//                         <TD right>
//                           <div className="flex flex-col items-end gap-0.5">
//                             {invoice.totalDiscount > 0 && (
//                               <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
//                                 -{formatCurrency(invoice.totalDiscount)}
//                               </span>
//                             )}
//                             {lateFees > 0 && (
//                               <span className="inline-block rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
//                                 +{formatCurrency(lateFees)}
//                               </span>
//                             )}
//                             {invoice.totalDiscount === 0 && lateFees === 0 && (
//                               <span className="text-[12px] text-slate-300">—</span>
//                             )}
//                           </div>
//                         </TD>

//                         {/* Status */}
//                         <TD>
//                           {buildStatusBadge(invoice.status)}
//                         </TD>

//                         {/* Actions */}
//                         <TD right>
//                           <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
//                             <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="View details" onClick={() => setDetailInvoiceId(invoice.id)}>
//                               <Eye className="h-3.5 w-3.5" />
//                             </Button>
//                             {invoice.remainingBalance > 0 && (
//                               <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-emerald-600 hover:bg-emerald-50" title="Record payment" onClick={() => openPaymentDialog(invoice)}>
//                                 <ReceiptText className="h-3.5 w-3.5" />
//                               </Button>
//                             )}
//                             <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="Print" onClick={() => handlePrintInvoice(invoice)}>
//                               <Printer className="h-3.5 w-3.5" />
//                             </Button>
//                             <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="Edit" onClick={() => openEditInvoiceDialog(invoice)}>
//                               <Pencil className="h-3.5 w-3.5" />
//                             </Button>
//                             <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-rose-500 hover:bg-rose-50" title="Delete" onClick={() => setDeleteInvoiceId(invoice.id)}>
//                               <Trash2 className="h-3.5 w-3.5" />
//                             </Button>
//                           </div>
//                         </TD>
//                       </tr>
//                     );
//                   })
//                 )}
//               </tbody>
//             </table>
//           </div>

//           {/* Pagination */}
//           {filteredInvoices.length > 0 && (
//             <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
//               <p className="text-[11px] text-slate-400">
//                 {(paginated.currentPage - 1) * PAGE_SIZE + 1}–{Math.min(paginated.currentPage * PAGE_SIZE, filteredInvoices.length)} of {filteredInvoices.length}
//               </p>
//               <Pagination className="mx-0 w-auto justify-end">
//                 <PaginationContent>
//                   <PaginationItem>
//                     <PaginationPrevious href="#" className={`h-7 text-xs ${paginated.currentPage === 1 ? "pointer-events-none opacity-40" : ""}`} onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.max(1, p - 1)); }} />
//                   </PaginationItem>
//                   <PaginationItem>
//                     <span className="px-3 text-[11px] text-slate-400">Page {paginated.currentPage} / {paginated.totalPages}</span>
//                   </PaginationItem>
//                   <PaginationItem>
//                     <PaginationNext href="#" className={`h-7 text-xs ${paginated.currentPage === paginated.totalPages ? "pointer-events-none opacity-40" : ""}`} onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.min(paginated.totalPages, p + 1)); }} />
//                   </PaginationItem>
//                 </PaginationContent>
//               </Pagination>
//             </div>
//           )}
//         </Card>

//         {/* ── Below-table analytics: 3-column grid ──────────────────────── */}
//         <div className="grid gap-4 md:grid-cols-3">

//           {/* Status breakdown */}
//           <Card className="border-slate-200/80 bg-white shadow-none">
//             <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
//               <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
//                 <ReceiptText className="h-3.5 w-3.5 text-indigo-500" />
//               </div>
//               <CardTitle className="text-sm font-semibold text-slate-900">Status breakdown</CardTitle>
//             </CardHeader>
//             <CardContent className="p-0">
//               {(report?.statusBreakdown ?? []).length === 0 ? (
//                 <p className="px-4 py-4 text-[12px] text-slate-400">No data for active filters.</p>
//               ) : (
//                 <table className="w-full border-collapse text-sm">
//                   <thead>
//                     <tr className="border-b border-slate-100 bg-slate-50/70">
//                       <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Status</th>
//                       <th className="px-4 py-2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Count</th>
//                       <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Amount</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {(report?.statusBreakdown ?? []).map((item, idx) => (
//                       <tr key={item.status} className={`border-b border-slate-100 last:border-b-0 ${idx % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}>
//                         <td className="px-4 py-2.5">{buildStatusBadge(item.status)}</td>
//                         <td className="px-4 py-2.5 text-center text-[12px] font-semibold text-slate-600">{item.count}</td>
//                         <td className="px-4 py-2.5 text-right text-[12px] font-bold text-slate-900">{formatCurrency(item.amount)}</td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               )}
//             </CardContent>
//           </Card>

//           {/* Balance monitor */}
//           <Card className="border-slate-200/80 bg-white shadow-none">
//             <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
//               <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50">
//                 <CalendarDays className="h-3.5 w-3.5 text-amber-500" />
//               </div>
//               <CardTitle className="text-sm font-semibold text-slate-900">Balance monitor</CardTitle>
//             </CardHeader>
//             <CardContent className="px-4 pb-4 pt-3">
//               <div className="grid grid-cols-2 gap-2 mb-3">
//                 {[
//                   { label: "Open invoices", value: balanceSummary?.openInvoices ?? 0, color: "text-slate-900" },
//                   { label: "Due soon", value: balanceSummary?.dueSoonInvoices ?? 0, color: "text-amber-700" },
//                   { label: "Students overdue", value: balanceSummary?.studentsWithOverdue ?? 0, color: "text-rose-700" },
//                   { label: "Total overdue", value: formatCurrency(balanceSummary?.totalOverdue ?? 0), color: "text-rose-700" },
//                 ].map((item) => (
//                   <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
//                     <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{item.label}</p>
//                     <p className={`mt-0.5 text-sm font-bold ${item.color}`}>{item.value}</p>
//                   </div>
//                 ))}
//               </div>
//               <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Overdue invoices</p>
//               <div className="space-y-1.5">
//                 {overduePreview.length === 0 ? (
//                   <p className="text-[12px] text-slate-400">No overdue invoices.</p>
//                 ) : overduePreview.map((entry) => (
//                   <div key={entry.invoiceId} className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50/40 px-3 py-2">
//                     <div className="min-w-0">
//                       <p className="max-w-[130px] truncate text-[12px] font-semibold text-slate-800">{entry.studentName}</p>
//                       <p className="text-[11px] text-rose-500">{entry.daysOverdue}d overdue</p>
//                     </div>
//                     <p className="text-[12px] font-bold text-slate-900">{formatCurrency(entry.remainingBalance)}</p>
//                   </div>
//                 ))}
//               </div>
//             </CardContent>
//           </Card>

//           {/* Outstanding students */}
//           <Card className="border-slate-200/80 bg-white shadow-none">
//             <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
//               <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50">
//                 <Users className="h-3.5 w-3.5 text-rose-500" />
//               </div>
//               <CardTitle className="text-sm font-semibold text-slate-900">Outstanding students</CardTitle>
//             </CardHeader>
//             <CardContent className="p-0">
//               {(report?.outstandingStudents ?? []).length === 0 ? (
//                 <p className="px-4 py-4 text-[12px] text-slate-400">No outstanding balances.</p>
//               ) : (
//                 <table className="w-full border-collapse text-sm">
//                   <thead>
//                     <tr className="border-b border-slate-100 bg-slate-50/70">
//                       <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Student</th>
//                       <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Balance</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {report?.outstandingStudents.slice(0, 6).map((student, idx) => (
//                       <tr key={student.studentId} className={`border-b border-slate-100 last:border-b-0 ${idx % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}>
//                         <td className="px-4 py-2.5">
//                           <p className="max-w-[160px] truncate text-[12px] font-semibold text-slate-900">{student.studentName}</p>
//                           <p className="text-[10px] text-slate-400">{student.className ?? "—"} · {student.invoiceCount} open</p>
//                         </td>
//                         <td className="px-4 py-2.5 text-right">
//                           <p className="text-[12px] font-bold text-slate-900">{formatCurrency(student.outstandingBalance)}</p>
//                           {student.overdueBalance > 0 && <p className="text-[10px] font-semibold text-rose-500">{formatCurrency(student.overdueBalance)} overdue</p>}
//                         </td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               )}
//             </CardContent>
//           </Card>
//         </div>

//         {/* ── Bottom analytics row ──────────────────────────────────────── */}
//         <div className="grid gap-5 xl:grid-cols-3">

//           {/* Recent payments */}
//           <Card className="border-slate-200/80 bg-white shadow-none">
//             <CardHeader className="px-4 py-3 pb-2">
//               <CardTitle className="text-sm font-semibold">Recent payments</CardTitle>
//             </CardHeader>
//             <CardContent className="px-4 pb-4">
//               <div className="space-y-2">
//                 {recentPayments.length === 0 ? (
//                   <p className="text-[12px] text-slate-400">No payments recorded yet.</p>
//                 ) : recentPayments.map((payment) => {
//                   const invoice = invoiceDirectory.get(payment.feeId);
//                   return (
//                     <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
//                       <div className="min-w-0">
//                         <p className="max-w-[140px] truncate text-[12px] font-semibold text-slate-900">{studentDirectory.get(payment.studentId)?.name ?? `#${payment.studentId}`}</p>
//                         <p className="text-[10px] text-slate-400">{payment.method} · {formatDate(payment.paymentDate, "MMM dd")}</p>
//                       </div>
//                       <div className="flex items-center gap-2">
//                         <p className="text-[13px] font-bold text-slate-900">{formatCurrency(payment.amount)}</p>
//                         {invoice && <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => handlePrintReceipt(invoice, payment)}><Printer className="h-3 w-3" /></Button>}
//                       </div>
//                     </div>
//                   );
//                 })}
//               </div>
//             </CardContent>
//           </Card>

//           {/* Monthly revenue */}
//           <Card className="border-slate-200/80 bg-white shadow-none">
//             <CardHeader className="px-4 py-3 pb-2">
//               <CardTitle className="text-sm font-semibold">Monthly revenue</CardTitle>
//             </CardHeader>
//             <CardContent className="px-4 pb-4">
//               <div className="space-y-2">
//                 {(report?.monthlyRevenue ?? []).slice(0, 6).map((item) => (
//                   <div key={item.month} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
//                     <div className="flex items-center justify-between mb-1.5">
//                       <p className="text-[12px] font-semibold text-slate-800">{formatBillingPeriod(item.month)}</p>
//                       <p className="text-[10px] text-slate-400">{item.month}</p>
//                     </div>
//                     <div className="flex items-center justify-between">
//                       <div>
//                         <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Billed</p>
//                         <p className="text-[13px] font-bold text-slate-900">{formatCurrency(item.billed)}</p>
//                       </div>
//                       <div className="text-right">
//                         <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Collected</p>
//                         <p className="text-[13px] font-bold text-emerald-600">{formatCurrency(item.paid)}</p>
//                       </div>
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             </CardContent>
//           </Card>

//           {/* Billing profiles */}
//           <Card className="border-slate-200/80 bg-white shadow-none">
//             <CardHeader className="flex flex-row items-center justify-between px-4 py-3 pb-2">
//               <CardTitle className="text-sm font-semibold">Billing profiles</CardTitle>
//               <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openProfileDialog()}><Settings2 className="mr-1 h-3 w-3" />Add</Button>
//             </CardHeader>
//             <CardContent className="px-4 pb-4">
//               <div className="mb-2 grid grid-cols-2 gap-2">
//                 <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
//                   <p className="text-[10px] text-slate-400">Configured</p>
//                   <p className="text-sm font-bold text-slate-900">{profiles.length}</p>
//                 </div>
//                 <div className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2">
//                   <p className="text-[10px] text-amber-600">Need setup</p>
//                   <p className="text-sm font-bold text-amber-700">{missingProfiles.length}</p>
//                 </div>
//               </div>
//               <div className="space-y-1.5">
//                 {profilesLoading ? (
//                   <p className="text-[12px] text-slate-400">Loading…</p>
//                 ) : profiles.length === 0 ? (
//                   <p className="text-[12px] text-slate-400">No billing profiles yet.</p>
//                 ) : profiles.slice(0, 5).map((profile) => (
//                   <div key={profile.studentId} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
//                     <div className="min-w-0">
//                       <p className="max-w-[140px] truncate text-[12px] font-semibold text-slate-900">{profile.student?.name ?? `#${profile.studentId}`}</p>
//                       <p className="text-[10px] text-slate-400">Due day {profile.dueDay} · {formatCurrency(profile.monthlyAmount)}</p>
//                     </div>
//                     <div className="flex items-center gap-1.5">
//                       <Badge variant="outline" className={profile.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] px-1.5" : "text-[10px] px-1.5"}>
//                         {profile.isActive ? "Active" : "Off"}
//                       </Badge>
//                       <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => openProfileDialog(profile)}>Edit</Button>
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             </CardContent>
//           </Card>
//         </div>

//         {/* ── Payment method + Class breakdown ─────────────────────────── */}
//         <div className="grid gap-5 xl:grid-cols-2">
//           <Card className="border-slate-200/80 bg-white shadow-none">
//             <CardHeader className="px-4 py-3 pb-2">
//               <CardTitle className="text-sm font-semibold">Collections by payment method</CardTitle>
//             </CardHeader>
//             <CardContent className="px-4 pb-4">
//               <div className="space-y-1.5">
//                 {paymentMethodBreakdown.length === 0 ? (
//                   <p className="text-[12px] text-slate-400">No payment data yet.</p>
//                 ) : paymentMethodBreakdown.map((item) => (
//                   <div key={item.method} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
//                     <div>
//                       <p className="text-[12px] font-semibold text-slate-800">{item.method}</p>
//                       <p className="text-[11px] text-slate-400">{item.count} receipt{item.count !== 1 ? "s" : ""}</p>
//                     </div>
//                     <p className="text-[13px] font-bold text-slate-900">{formatCurrency(item.amount)}</p>
//                   </div>
//                 ))}
//               </div>
//             </CardContent>
//           </Card>

//           <Card className="border-slate-200/80 bg-white shadow-none">
//             <CardHeader className="px-4 py-3 pb-2">
//               <CardTitle className="text-sm font-semibold">Class balance & collection</CardTitle>
//             </CardHeader>
//             <CardContent className="px-4 pb-4">
//               <div className="space-y-1.5">
//                 {classBreakdown.length === 0 ? (
//                   <p className="text-[12px] text-slate-400">No class data yet.</p>
//                 ) : classBreakdown.map((item) => (
//                   <div key={item.className} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
//                     <div className="flex items-center justify-between gap-2">
//                       <p className="text-[12px] font-semibold text-slate-900">{item.className}</p>
//                       <p className="text-[11px] text-slate-400">{formatPercentage(item.collectionRate)} collected</p>
//                     </div>
//                     <div className="mt-1.5 grid grid-cols-3 gap-2">
//                       {[{ l: "Billed", v: item.billed }, { l: "Paid", v: item.paid }, { l: "Outstanding", v: item.outstanding }].map((col) => (
//                         <div key={col.l}>
//                           <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">{col.l}</p>
//                           <p className="text-[12px] font-semibold text-slate-800">{formatCurrency(col.v)}</p>
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             </CardContent>
//           </Card>
//         </div>

//         {/* ══════════════════════════════════════════════════════════════════
//             DIALOGS — unchanged logic, tightened UI
//         ══════════════════════════════════════════════════════════════════ */}

//         {/* Create / Edit Invoice */}
//         <Dialog open={invoiceDialogOpen} onOpenChange={(open) => { setInvoiceDialogOpen(open); if (!open) { setEditingInvoiceId(null); setInvoiceForm(createDefaultInvoiceForm(studentFilter === "all" ? "" : studentFilter)); } }}>
//           <DialogContent className="sm:max-w-2xl">
//             <DialogHeader>
//               <DialogTitle>{editingInvoice ? "Edit invoice" : "Create invoice"}</DialogTitle>
//             </DialogHeader>
//             <div className="grid gap-3 pt-2 md:grid-cols-2">
//               <div className="space-y-1.5 md:col-span-2">
//                 <label className="text-xs font-medium text-slate-700">Student</label>
//                 <Select value={invoiceForm.studentId} onValueChange={(v) => setInvoiceForm((c) => ({ ...c, studentId: v }))}>
//                   <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select student" /></SelectTrigger>
//                   <SelectContent>{studentsList.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.className ? ` (${s.className})` : ""}</SelectItem>)}</SelectContent>
//                 </Select>
//               </div>
//               <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Billing month</label><Input type="month" className="h-8 text-sm" value={invoiceForm.billingMonth} onChange={(e) => setInvoiceForm((c) => ({ ...c, billingMonth: e.target.value }))} /></div>
//               <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Due date</label><Input type="date" className="h-8 text-sm" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm((c) => ({ ...c, dueDate: e.target.value }))} /></div>
//               <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Amount</label><Input type="number" min="1" className="h-8 text-sm" value={invoiceForm.amount} onChange={(e) => setInvoiceForm((c) => ({ ...c, amount: e.target.value }))} /></div>
//               <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Fee type</label><Input className="h-8 text-sm" value={invoiceForm.feeType} onChange={(e) => setInvoiceForm((c) => ({ ...c, feeType: e.target.value }))} /></div>
//               <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Discount (optional)</label><Input type="number" min="0" step="0.01" className="h-8 text-sm" placeholder="0.00" value={invoiceForm.discount} onChange={(e) => setInvoiceForm((c) => ({ ...c, discount: e.target.value }))} /></div>
//               <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Discount reason</label><Input className="h-8 text-sm" placeholder="e.g., Merit award" maxLength={200} disabled={!invoiceForm.discount} value={invoiceForm.discountReason} onChange={(e) => setInvoiceForm((c) => ({ ...c, discountReason: e.target.value }))} /></div>
//               <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Description</label><Input className="h-8 text-sm" value={invoiceForm.description} onChange={(e) => setInvoiceForm((c) => ({ ...c, description: e.target.value }))} /></div>
//               <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Internal notes</label><Textarea className="text-sm" value={invoiceForm.notes} onChange={(e) => setInvoiceForm((c) => ({ ...c, notes: e.target.value }))} rows={3} /></div>
//             </div>
//             {(invoiceForm.amount || invoiceForm.discount) && (
//               <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
//                 <div className="flex items-center gap-6 text-sm">
//                   {invoiceForm.amount && <div><p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Amount</p><p className="font-semibold text-slate-900">{formatCurrency(Number(invoiceForm.amount))}</p></div>}
//                   {invoiceForm.discount && <div><p className="text-[10px] uppercase tracking-[0.14em] text-amber-500">Discount</p><p className="font-semibold text-amber-700">−{formatCurrency(Number(invoiceForm.discount))}</p></div>}
//                   {invoiceForm.amount && <div><p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Net</p><p className="font-bold text-slate-900">{formatCurrency(Number(invoiceForm.amount) - (Number(invoiceForm.discount) || 0))}</p></div>}
//                 </div>
//               </div>
//             )}
//             <div className="flex justify-end gap-2 pt-1">
//               <Button variant="outline" size="sm" onClick={() => setInvoiceDialogOpen(false)}>Cancel</Button>
//               <Button size="sm" onClick={handleInvoiceSubmit} disabled={createFee.isPending || updateFee.isPending}>
//                 {(createFee.isPending || updateFee.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editingInvoice ? "Save invoice" : "Create invoice"}
//               </Button>
//             </div>
//           </DialogContent>
//         </Dialog>

//         {/* Record Payment */}
//         <Dialog open={paymentDialogOpen} onOpenChange={(open) => { setPaymentDialogOpen(open); if (!open) { setPaymentInvoiceId(null); setPaymentForm(createDefaultPaymentForm()); } }}>
//           <DialogContent className="sm:max-w-lg">
//             <DialogHeader>
//               <DialogTitle>Record payment</DialogTitle>
//               <DialogDescription className="text-xs">Apply payment and optional discount to the invoice.</DialogDescription>
//             </DialogHeader>
//             <div className="space-y-3 pt-1">
//               <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
//                 <p className="text-[12px] font-semibold text-slate-800">{paymentInvoice?.invoiceNumber ?? "Invoice"} · {paymentInvoice?.student?.name}</p>
//                 <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
//                   {[{ l: "Total", v: paymentInvoice?.amount ?? 0 }, { l: "Paid", v: paymentInvoice?.paidAmount ?? 0 }, { l: "Balance", v: paymentInvoice?.remainingBalance ?? 0 }].map((i) => (
//                     <div key={i.l}><p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{i.l}</p><p className="font-semibold text-slate-900">{formatCurrency(i.v)}</p></div>
//                   ))}
//                 </div>
//               </div>
//               <div className="grid gap-3 md:grid-cols-2">
//                 <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Amount *</label><Input type="number" min="0" step="0.01" className="h-8 text-sm" placeholder="0.00" value={paymentForm.amount} onChange={(e) => setPaymentForm((c) => ({ ...c, amount: e.target.value }))} /></div>
//                 <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Payment date *</label><Input type="date" className="h-8 text-sm" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((c) => ({ ...c, paymentDate: e.target.value }))} /></div>
//                 <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Method *</label>
//                   <Select value={paymentForm.method} onValueChange={(v) => setPaymentForm((c) => ({ ...c, method: v as PaymentFormState["method"] }))}>
//                     <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
//                     <SelectContent>{["Cash", "Bank Transfer", "Card", "Mobile Money", "Cheque", "Other"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
//                   </Select>
//                 </div>
//                 <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Reference</label><Input className="h-8 text-sm" placeholder="Transaction ref" value={paymentForm.reference} onChange={(e) => setPaymentForm((c) => ({ ...c, reference: e.target.value }))} /></div>
//                 <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Discount (optional)</label><Input type="number" min="0" step="0.01" className="h-8 text-sm" placeholder="0.00" value={paymentForm.discount} onChange={(e) => setPaymentForm((c) => ({ ...c, discount: e.target.value }))} /></div>
//                 <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Discount reason</label><Input className="h-8 text-sm" placeholder="e.g., Early payment" maxLength={200} disabled={!paymentForm.discount} value={paymentForm.discountReason} onChange={(e) => setPaymentForm((c) => ({ ...c, discountReason: e.target.value }))} /></div>
//                 <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Notes</label><Textarea className="text-sm" rows={2} placeholder="Additional details…" value={paymentForm.notes} onChange={(e) => setPaymentForm((c) => ({ ...c, notes: e.target.value }))} /></div>
//               </div>
//               {(paymentForm.amount || paymentForm.discount) && (
//                 <div className="flex items-center gap-6 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm">
//                   <div><p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Payment</p><p className="font-semibold text-slate-900">{formatCurrency(Number(paymentForm.amount) || 0)}</p></div>
//                   {paymentForm.discount && <div><p className="text-[10px] uppercase tracking-[0.14em] text-emerald-500">Discount</p><p className="font-semibold text-emerald-700">{formatCurrency(Number(paymentForm.discount))}</p></div>}
//                   <div><p className="text-[10px] uppercase tracking-[0.14em] text-blue-500">Total adj.</p><p className="font-bold text-blue-700">{formatCurrency((Number(paymentForm.amount) || 0) + (Number(paymentForm.discount) || 0))}</p></div>
//                 </div>
//               )}
//             </div>
//             <div className="flex justify-end gap-2 pt-1">
//               <Button variant="outline" size="sm" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
//               <Button size="sm" onClick={handlePaymentSubmit} disabled={recordPayment.isPending || !paymentInvoice || !paymentForm.amount}>
//                 {recordPayment.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ReceiptText className="mr-1.5 h-3.5 w-3.5" />}
//                 Record payment
//               </Button>
//             </div>
//           </DialogContent>
//         </Dialog>

//         {/* Billing Profile */}
//         <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
//           <DialogContent className="sm:max-w-md">
//             <DialogHeader><DialogTitle>{editingProfile ? "Edit billing profile" : "Add billing profile"}</DialogTitle></DialogHeader>
//             <div className="grid gap-3 pt-2 md:grid-cols-2">
//               <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Student</label><Select value={profileForm.studentId} onValueChange={(v) => setProfileForm((c) => ({ ...c, studentId: v }))}><SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select student" /></SelectTrigger><SelectContent>{studentsList.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.className ? ` (${s.className})` : ""}</SelectItem>)}</SelectContent></Select></div>
//               <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Monthly amount</label><Input type="number" min="1" className="h-8 text-sm" value={profileForm.monthlyAmount} onChange={(e) => setProfileForm((c) => ({ ...c, monthlyAmount: e.target.value }))} /></div>
//               <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Due day</label><Input type="number" min="1" max="28" className="h-8 text-sm" value={profileForm.dueDay} onChange={(e) => setProfileForm((c) => ({ ...c, dueDay: e.target.value }))} /></div>
//               <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Status</label><Select value={profileForm.isActive ? "active" : "inactive"} onValueChange={(v) => setProfileForm((c) => ({ ...c, isActive: v === "active" }))}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
//               <div className="space-y-1.5 md:col-span-2"><label className="text-xs font-medium text-slate-700">Notes</label><Textarea className="text-sm" value={profileForm.notes} onChange={(e) => setProfileForm((c) => ({ ...c, notes: e.target.value }))} rows={3} /></div>
//             </div>
//             <div className="flex justify-end gap-2 pt-1"><Button variant="outline" size="sm" onClick={() => setProfileDialogOpen(false)}>Cancel</Button><Button size="sm" onClick={handleProfileSubmit} disabled={upsertBillingProfile.isPending}>{upsertBillingProfile.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save profile"}</Button></div>
//           </DialogContent>
//         </Dialog>

//         {/* Generate Monthly Fees */}
//         <Dialog open={generationDialogOpen} onOpenChange={setGenerationDialogOpen}>
//           <DialogContent className="sm:max-w-md">
//             <DialogHeader><DialogTitle>Generate monthly fees</DialogTitle></DialogHeader>
//             <div className="grid gap-3 pt-2 md:grid-cols-2">
//               <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Billing month</label><Input type="month" className="h-8 text-sm" value={generationForm.billingMonth} onChange={(e) => setGenerationForm((c) => ({ ...c, billingMonth: e.target.value }))} /></div>
//               <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Due day override</label><Input type="number" min="1" max="28" className="h-8 text-sm" placeholder="Use profile default" value={generationForm.dueDayOverride} onChange={(e) => setGenerationForm((c) => ({ ...c, dueDayOverride: e.target.value }))} /></div>
//             </div>
//             <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Duplicate prevention is automatic per student and billing month. Students without an active billing profile are skipped.</p>
//             {lastGenerationResult && (
//               <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
//                 <div className="grid grid-cols-3 gap-3">
//                   {[{ l: "Generated", v: lastGenerationResult.generatedCount }, { l: "Duplicates skipped", v: lastGenerationResult.skippedDuplicates }, { l: "Missing profiles", v: lastGenerationResult.skippedMissingProfiles }].map((i) => (
//                     <div key={i.l}><p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{i.l}</p><p className="text-xl font-bold text-slate-900">{i.v}</p></div>
//                   ))}
//                 </div>
//                 {lastGenerationResult.skippedStudents.length > 0 && (
//                   <div className="space-y-1"><p className="text-[11px] font-semibold text-slate-700">Skipped students</p>{lastGenerationResult.skippedStudents.slice(0, 6).map((s) => <div key={`${s.studentId}-${s.reason}`} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]"><span className="font-medium text-slate-800">{s.studentName}</span><span className="ml-2 text-slate-400">{s.reason}</span></div>)}</div>
//                 )}
//               </div>
//             )}
//             <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setGenerationDialogOpen(false)}>Close</Button><Button size="sm" onClick={handleGenerateMonthlyFees} disabled={generateMonthlyFees.isPending}>{generateMonthlyFees.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run generation"}</Button></div>
//           </DialogContent>
//         </Dialog>

//         {/* Invoice Detail */}
//         <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setDetailInvoiceId(null)}>
//           <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
//             <DialogHeader>
//               <DialogTitle>{selectedInvoice?.invoiceNumber ?? (selectedInvoice ? `Invoice ${selectedInvoice.id}` : "Invoice details")}</DialogTitle>
//             </DialogHeader>
//             {selectedInvoice && (
//               <div className="space-y-4 pt-2">
//                 <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
//                   {[{ label: "Student", value: selectedInvoice.student?.name ?? `#${selectedInvoice.studentId}` }, { label: "Period", value: selectedInvoice.billingPeriod }, { label: "Due date", value: formatDate(selectedInvoice.dueDate, "MMM dd, yyyy") }, { label: "Status", value: selectedInvoice.remainingBalance <= 0 && selectedInvoice.paidAmount > 0 ? "Paid" : selectedInvoice.status }].map((item) => (
//                     <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
//                       <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{item.label}</p>
//                       <p className="mt-0.5 text-[13px] font-semibold text-slate-900">{item.value}</p>
//                     </div>
//                   ))}
//                 </div>
//                 {(() => {
//                   const totalDiscount = selectedInvoice.totalDiscount;
//                   const totalLateFee = selectedInvoice.adjustments?.filter((a: any) => a.type === "fine").reduce((s: number, a: any) => s + a.amount, 0) ?? 0;
//                   return (
//                     <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
//                       <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.14em] text-blue-500">Original</p><p className="mt-0.5 text-sm font-bold text-blue-900">{formatCurrency(selectedInvoice.amount)}</p></div>
//                       {totalDiscount > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.14em] text-amber-600">Discount</p><p className="mt-0.5 text-sm font-bold text-amber-900">−{formatCurrency(totalDiscount)}</p></div>}
//                       {totalLateFee > 0 && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.14em] text-rose-600">Late fee</p><p className="mt-0.5 text-sm font-bold text-rose-900">+{formatCurrency(totalLateFee)}</p></div>}
//                       <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.14em] text-emerald-600">Paid</p><p className="mt-0.5 text-sm font-bold text-emerald-700">{formatCurrency(selectedInvoice.paidAmount)}</p></div>
//                       <div className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Remaining</p><p className="mt-0.5 text-sm font-bold text-slate-900">{formatCurrency(selectedInvoice.remainingBalance)}</p></div>
//                     </div>
//                   );
//                 })()}
//                 <div className="grid gap-4 lg:grid-cols-2">
//                   <div className="space-y-2">
//                     <p className="text-[12px] font-semibold text-slate-700">Invoice items</p>
//                     {(selectedInvoice.lineItems.length ? selectedInvoice.lineItems : [{ label: selectedInvoice.description, amount: selectedInvoice.amount }]).map((item, index) => (
//                       <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
//                         <p className="text-[12px] font-medium text-slate-800">{item.label}</p>
//                         <p className="text-[12px] font-semibold text-slate-900">{formatCurrency(item.amount)}</p>
//                       </div>
//                     ))}
//                     {selectedInvoice.notes && <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-500">{selectedInvoice.notes}</div>}
//                   </div>
//                   <div className="space-y-2">
//                     <p className="text-[12px] font-semibold text-slate-700">Adjustments</p>
//                     {(() => {
//                       const items = [...(selectedInvoice.adjustments ?? []), ...(selectedInvoice.payments ?? []).filter((p: any) => p.discount > 0).map((p: any) => ({ id: `d-${p.id}`, type: "discount", reason: p.discountReason || "Payment discount", amount: p.discount, notes: `Applied ${formatDate(p.paymentDate, "MMM dd")}` }))];
//                       return items.length === 0 ? <p className="text-[12px] text-slate-400">No adjustments.</p> : items.map((adj: any) => (
//                         <div key={adj.id} className={`rounded-lg border px-3 py-2 ${adj.type === "fine" ? "border-rose-100 bg-rose-50/50" : "border-amber-100 bg-amber-50/50"}`}>
//                           <div className="flex items-center justify-between">
//                             <p className="text-[12px] font-semibold text-slate-800">{adj.type === "fine" ? "Late fee" : "Discount"} — {adj.reason}</p>
//                             <p className={`text-[12px] font-bold ${adj.type === "fine" ? "text-rose-700" : "text-amber-700"}`}>{adj.type === "fine" ? "+" : "−"}{formatCurrency(adj.amount)}</p>
//                           </div>
//                           {adj.notes && <p className="mt-0.5 text-[10px] text-slate-400">{adj.notes}</p>}
//                         </div>
//                       ));
//                     })()}
//                   </div>
//                 </div>
//                 <div className="space-y-2">
//                   <p className="text-[12px] font-semibold text-slate-700">Payments</p>
//                   {(selectedInvoice.payments ?? []).length === 0 ? <p className="text-[12px] text-slate-400">No payments recorded yet.</p> : (selectedInvoice.payments ?? []).map((payment: any) => (
//                     <div key={payment.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
//                       <div><p className="text-[12px] font-semibold text-slate-900">{formatDate(payment.paymentDate, "MMM dd, yyyy")}</p><p className="text-[11px] text-slate-400">{payment.method} · {payment.receiptNumber ?? "pending"}</p></div>
//                       <div className="flex items-center gap-2"><p className="text-[13px] font-bold text-slate-900">{formatCurrency(payment.amount)}</p><Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => handlePrintReceipt(selectedInvoice, payment)}><Printer className="h-3 w-3" /></Button></div>
//                     </div>
//                   ))}
//                 </div>
//                 <div className="flex flex-wrap justify-end gap-2">
//                   {selectedInvoice.remainingBalance > 0 && <Button variant="outline" size="sm" onClick={() => openPaymentDialog(selectedInvoice)}><ReceiptText className="mr-1.5 h-3.5 w-3.5" />Record payment</Button>}
//                   <Button variant="outline" size="sm" onClick={() => handlePrintInvoice(selectedInvoice)}><Printer className="mr-1.5 h-3.5 w-3.5" />Print / PDF</Button>
//                 </div>
//               </div>
//             )}
//           </DialogContent>
//         </Dialog>

//         {/* Delete confirm */}
//         <AlertDialog open={!!deletingInvoice} onOpenChange={(open) => !open && setDeleteInvoiceId(null)}>
//           <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete invoice?</AlertDialogTitle><AlertDialogDescription>This will permanently remove {deletingInvoice?.invoiceNumber ?? "the selected invoice"} and its payment history.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteInvoice}>{deleteFee.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
//         </AlertDialog>

//         <FeeAdjustmentDialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen} selectedStudent={studentFilter === "all" ? undefined : { id: Number(studentFilter), name: studentDirectory.get(Number(studentFilter))?.name ?? "" }} />
//         <ApplyLateFeeDialog open={lateFeeDialogOpen} onOpenChange={setLateFeeDialogOpen} selectedStudent={studentFilter === "all" ? undefined : { id: Number(studentFilter), name: studentDirectory.get(Number(studentFilter))?.name ?? "" }} />
//         <GenerateSingleStudentFeeDialog open={singleStudentFeeDialogOpen} onOpenChange={setSingleStudentFeeDialogOpen} />
//       </div>
//     </Layout>
//   );
// }
