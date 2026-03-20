import { useMemo } from "react";
import { Layout } from "@/components/layout";
import { useFees, useStudentBalance } from "@/hooks/use-fees";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildInvoicePrintHtml, buildPaymentReceiptPrintHtml, getFeeStatusClassName } from "@/lib/finance";
import { cn, downloadCsv, formatCurrency, formatDate, openPrintWindow } from "@/lib/utils";
import {
  Banknote, CalendarDays, Download, FileDown, Loader2,
  ReceiptText, AlertTriangle, CheckCircle2, Clock4,
  TrendingUp, CreditCard, ChevronDown, ChevronRight,
  Wallet,
} from "lucide-react";
import { useState } from "react";

/* ─── helpers ────────────────────────────────────────────────────── */
function getReminderMessage(daysUntilDue: number) {
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d overdue`;
  if (daysUntilDue === 0) return "Due today";
  return `Due in ${daysUntilDue}d`;
}

function getStatusConfig(status: string) {
  switch (status?.toLowerCase()) {
    case "paid":
      return { dot: "bg-emerald-400", pill: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2, iconColor: "text-emerald-500" };
    case "overdue":
      return { dot: "bg-red-400", pill: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle, iconColor: "text-red-500" };
    case "partial":
      return { dot: "bg-amber-400", pill: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock4, iconColor: "text-amber-500" };
    default:
      return { dot: "bg-sky-400", pill: "bg-sky-50 text-sky-700 border-sky-200", icon: Clock4, iconColor: "text-sky-500" };
  }
}

function PayProgress({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-400" : pct > 0 ? "bg-amber-400" : "bg-slate-200"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-bold text-slate-400 w-7 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

/* ─── component ──────────────────────────────────────────────────── */
export default function StudentFees() {
  const { data: fees, isLoading } = useFees();
  const { data: studentBalance } = useStudentBalance();
  const [expandedInvoice, setExpandedInvoice] = useState<number | null>(null);

  /* ── derived data ── */
  const invoices = useMemo(
    () => [...(fees ?? [])].sort((a, b) => +new Date(b.dueDate) - +new Date(a.dueDate)),
    [fees],
  );
  const openInvoices = useMemo(
    () => invoices.filter(i => i.remainingBalance > 0).sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)),
    [invoices],
  );
  const overdueInvoices = useMemo(() => openInvoices.filter(i => i.status === "Overdue"), [openInvoices]);
  const outstandingBalance = useMemo(() => invoices.reduce((s, i) => s + i.remainingBalance, 0), [invoices]);
  const totalPaid = useMemo(() => invoices.reduce((s, i) => s + i.paidAmount, 0), [invoices]);
  const totalBilled = useMemo(() => invoices.reduce((s, i) => s + i.amount, 0), [invoices]);

  const recentPayments = useMemo(() =>
    invoices
      .flatMap(inv => (inv.payments ?? []).map(p => ({
        ...p, invoice: inv, invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber ?? `INV-${inv.id}`,
        billingPeriod: inv.billingPeriod,
      })))
      .sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate)),
    [invoices],
  );

  const nextDueInvoice = openInvoices[0];
  const paymentReminders = studentBalance?.paymentReminders ?? [];

  /* ── actions ── */
  const exportInvoices = () =>
    downloadCsv("my-invoices.csv", invoices.map(i => ({
      Invoice: i.invoiceNumber ?? `INV-${i.id}`,
      BillingPeriod: i.billingPeriod, DueDate: i.dueDate,
      TotalAmount: i.amount, PaidAmount: i.paidAmount,
      RemainingBalance: i.remainingBalance, Status: i.status,
    })));

  const printInvoice = (inv: (typeof invoices)[number]) =>
    openPrintWindow(inv.invoiceNumber ?? `Invoice ${inv.id}`, buildInvoicePrintHtml(inv), {
      documentType: "invoice",
      subtitle: `${inv.billingPeriod} • ${inv.student?.name ?? "Student invoice"}`,
    });

  const printReceipt = (payment: (typeof recentPayments)[number]) =>
    openPrintWindow(payment.receiptNumber ?? `Receipt ${payment.id}`,
      buildPaymentReceiptPrintHtml(payment.invoice, payment), {
      documentType: "receipt",
      subtitle: `${payment.invoiceNumber} • ${payment.billingPeriod}`,
    });

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-5">

          {/* ── Page header ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 shadow-md shadow-emerald-200">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">My Fees</h1>
                <p className="text-xs text-slate-500">Invoices, payments & balance overview</p>
              </div>
            </div>
            <Button size="sm" variant="outline"
              className="h-9 gap-1.5 border-slate-200 bg-white text-slate-700 text-xs shadow-sm hover:bg-slate-50 w-fit"
              onClick={exportInvoices} disabled={invoices.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>

          {/* ── Hero balance banner ── */}
          <div className="relative overflow-hidden rounded-2xl bg-emerald-600 px-5 py-5 text-white shadow-lg shadow-emerald-100">
            <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/5" />
            <div className="absolute right-8 top-10 h-16 w-16 rounded-full bg-white/5" />
            <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200 mb-1">Outstanding Balance</p>
                <p className="text-4xl font-bold tracking-tight leading-none">
                  {formatCurrency(studentBalance?.outstandingBalance ?? outstandingBalance)}
                </p>
                <p className="mt-2 text-xs text-emerald-100">
                  {nextDueInvoice
                    ? `Next due · ${formatDate(nextDueInvoice.dueDate, "MMM dd, yyyy")}`
                    : studentBalance?.nextDueDate
                      ? `Next due · ${formatDate(studentBalance.nextDueDate, "MMM dd, yyyy")}`
                      : "No outstanding balance"}
                </p>
              </div>
              {/* mini stat pills */}
              <div className="flex gap-2 flex-wrap">
                {overdueInvoices.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-xl bg-red-400/20 border border-red-300/30 px-3 py-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-200" />
                    <span className="text-xs font-semibold text-red-100">{overdueInvoices.length} Overdue</span>
                  </div>
                )}
                {openInvoices.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-xl bg-white/10 border border-white/20 px-3 py-1.5">
                    <Clock4 className="h-3.5 w-3.5 text-emerald-200" />
                    <span className="text-xs font-semibold text-emerald-100">{openInvoices.length} Open</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Stat strip ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: TrendingUp, label: "Total Billed", value: formatCurrency(studentBalance?.totalBilled ?? totalBilled), accent: "bg-slate-100 text-slate-600" },
              { icon: CheckCircle2, label: "Total Paid", value: formatCurrency(studentBalance?.totalPaid ?? totalPaid), accent: "bg-emerald-50 text-emerald-600" },
              { icon: ReceiptText, label: "Open Invoices", value: studentBalance?.openInvoices ?? openInvoices.length, accent: "bg-sky-50 text-sky-600" },
              { icon: CalendarDays, label: "Due Soon", value: studentBalance?.dueSoonInvoices ?? 0, accent: "bg-amber-50 text-amber-600" },
            ].map(stat => (
              <div key={stat.label}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${stat.accent}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 truncate">{stat.label}</p>
                  <p className="text-base font-bold text-slate-900 leading-tight">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Two-column middle section ── */}
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">

            {/* Payment reminders */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-50">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Payment Reminders</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Upcoming & overdue invoices</p>
                </div>
                {paymentReminders.length > 0 && (
                  <span className="rounded-full bg-red-50 border border-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-600">
                    {paymentReminders.length} alert{paymentReminders.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="p-4 space-y-2.5">
                {paymentReminders.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-300" />
                    <p className="text-sm font-semibold text-slate-600">All clear!</p>
                    <p className="text-xs text-slate-400">No reminders right now.</p>
                  </div>
                ) : (
                  paymentReminders.map(reminder => {
                    const inv = invoices.find(i => i.id === reminder.invoiceId);
                    const sc = getStatusConfig(reminder.status);
                    const StatusIcon = sc.icon;
                    return (
                      <div key={reminder.invoiceId}
                        className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <StatusIcon className={`h-4 w-4 shrink-0 ${sc.iconColor}`} />
                            <div>
                              <p className="text-sm font-bold text-slate-900 leading-tight">
                                {reminder.invoiceNumber ?? `INV-${reminder.invoiceId}`}
                              </p>
                              <p className="text-xs text-slate-500">{reminder.billingPeriod}</p>
                            </div>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sc.pill}`}>
                            {reminder.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Due Date", value: formatDate(reminder.dueDate, "MMM dd, yyyy") },
                            { label: "Balance", value: formatCurrency(reminder.remainingBalance) },
                            { label: "Timeline", value: getReminderMessage(reminder.daysUntilDue) },
                          ].map(row => (
                            <div key={row.label} className="rounded-xl bg-white border border-slate-100 px-2.5 py-2">
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{row.label}</p>
                              <p className="text-xs font-bold text-slate-800 mt-0.5 leading-tight">{row.value}</p>
                            </div>
                          ))}
                        </div>
                        {inv && (
                          <button onClick={() => printInvoice(inv)}
                            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
                            <FileDown className="h-3.5 w-3.5" /> Print Invoice
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Balance summary */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-slate-50">
                <h2 className="text-sm font-bold text-slate-900">Balance Summary</h2>
                <p className="text-xs text-slate-400 mt-0.5">Current billing position</p>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { label: "Total Billed", value: formatCurrency(studentBalance?.totalBilled ?? totalBilled), bold: false },
                  { label: "Total Paid", value: formatCurrency(studentBalance?.totalPaid ?? totalPaid), bold: false, green: true },
                  { label: "Outstanding", value: formatCurrency(studentBalance?.outstandingBalance ?? outstandingBalance), bold: true },
                  { label: "Overdue Balance", value: formatCurrency(studentBalance?.overdueBalance ?? overdueInvoices.reduce((s, i) => s + i.remainingBalance, 0)), bold: false, red: overdueInvoices.length > 0 },
                ].map(row => (
                  <div key={row.label}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
                    <p className="text-xs text-slate-600">{row.label}</p>
                    <p className={`text-sm font-bold ${row.green ? "text-emerald-600" : row.red ? "text-red-600" : row.bold ? "text-slate-900" : "text-slate-700"}`}>
                      {row.value}
                    </p>
                  </div>
                ))}

                {/* Paid progress bar */}
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 mt-1 space-y-1.5">
                  <div className="flex justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Payment Progress</p>
                    <p className="text-[10px] font-bold text-slate-500">
                      {totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0}% cleared
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${totalBilled > 0 ? Math.min(100, (totalPaid / totalBilled) * 100) : 0}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500 leading-relaxed">
                  {studentBalance?.nextDueDate
                    ? `Next payment due · ${formatDate(studentBalance.nextDueDate, "MMMM dd, yyyy")}`
                    : "No upcoming invoice due dates."}
                </div>
              </div>
            </div>
          </div>

          {/* ── Invoice Register — DESKTOP TABLE / MOBILE CARDS ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-50">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Invoice Register</h2>
                <p className="text-xs text-slate-400 mt-0.5">All invoices with payment progress</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                {invoices.length} record{invoices.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 border-b border-slate-100">
                    {["Invoice", "Period", "Due Date", "Total", "Paid", "Balance", "Progress", "Status", ""].map(h => (
                      <TableHead key={h} className={`text-[10px] font-bold uppercase tracking-wider text-slate-400 py-2.5 ${h === "" ? "text-right pr-4" : ""}`}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-emerald-400" />
                      </TableCell>
                    </TableRow>
                  ) : invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center text-sm text-slate-400">No invoice records found.</TableCell>
                    </TableRow>
                  ) : (
                    invoices.map(inv => {
                      const sc = getStatusConfig(inv.status);
                      return (
                        <TableRow key={inv.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-50">
                          <TableCell className="pl-5">
                            <p className="text-xs font-bold text-slate-900">{inv.invoiceNumber ?? `INV-${inv.id}`}</p>
                            <p className="text-[10px] text-slate-400">{inv.feeType}</p>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">{inv.billingPeriod}</TableCell>
                          <TableCell className="text-xs text-slate-600">{formatDate(inv.dueDate, "MMM dd, yyyy")}</TableCell>
                          <TableCell className="text-xs font-semibold text-slate-800">{formatCurrency(inv.amount)}</TableCell>
                          <TableCell className="text-xs text-emerald-600 font-medium">{formatCurrency(inv.paidAmount)}</TableCell>
                          <TableCell className="text-xs font-bold text-slate-900">{formatCurrency(inv.remainingBalance)}</TableCell>
                          <TableCell className="w-28"><PayProgress paid={inv.paidAmount} total={inv.amount} /></TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${sc.pill}`}>
                              <span className={`h-1 w-1 rounded-full ${sc.dot}`} />
                              {inv.status}
                            </span>
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            <button onClick={() => printInvoice(inv)}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm ml-auto">
                              <FileDown className="h-3 w-3" /> Print
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden p-4 space-y-2.5">
              {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" /></div>
              ) : invoices.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">No invoice records found.</p>
              ) : (
                invoices.map(inv => {
                  const sc = getStatusConfig(inv.status);
                  const isOpen = expandedInvoice === inv.id;
                  return (
                    <div key={inv.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 overflow-hidden">
                      <button
                        onClick={() => setExpandedInvoice(isOpen ? null : inv.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${sc.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-slate-900 truncate">{inv.invoiceNumber ?? `INV-${inv.id}`}</p>
                            <p className="text-sm font-bold text-slate-900 shrink-0">{formatCurrency(inv.remainingBalance)}</p>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className="text-xs text-slate-500 truncate">{inv.billingPeriod}</p>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sc.pill}`}>{inv.status}</span>
                          </div>
                          <div className="mt-2"><PayProgress paid={inv.paidAmount} total={inv.amount} /></div>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-100 bg-white px-4 py-3 grid grid-cols-2 gap-2.5">
                          {[
                            { label: "Due Date", value: formatDate(inv.dueDate, "MMM dd, yyyy") },
                            { label: "Total", value: formatCurrency(inv.amount) },
                            { label: "Paid", value: formatCurrency(inv.paidAmount) },
                            { label: "Balance", value: formatCurrency(inv.remainingBalance) },
                            { label: "Fee Type", value: inv.feeType ?? "—" },
                          ].map(row => (
                            <div key={row.label} className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2">
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{row.label}</p>
                              <p className="text-xs font-bold text-slate-800 mt-0.5">{row.value}</p>
                            </div>
                          ))}
                          <button onClick={() => printInvoice(inv)}
                            className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                            <FileDown className="h-3.5 w-3.5" /> Print Invoice
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Bottom row: Payment History + Open Balances ── */}
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">

            {/* Payment History */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-50">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Payment History</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Linked to invoices automatically</p>
                </div>
                {recentPayments.length > 0 && (
                  <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">
                    {recentPayments.length} payment{recentPayments.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Desktop */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 border-b border-slate-100">
                      {["Date", "Invoice", "Method", "Reference", "Amount", ""].map(h => (
                        <TableHead key={h} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-2.5">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">No payments recorded yet.</TableCell>
                      </TableRow>
                    ) : (
                      recentPayments.slice(0, 8).map(p => (
                        <TableRow key={p.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-50">
                          <TableCell className="pl-5 text-xs text-slate-600">{formatDate(p.paymentDate, "MMM dd, yyyy")}</TableCell>
                          <TableCell>
                            <p className="text-xs font-bold text-slate-900">{p.invoiceNumber}</p>
                            <p className="text-[10px] text-slate-400">{p.billingPeriod}</p>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">{p.method}</TableCell>
                          <TableCell className="text-xs text-slate-500 font-mono">{p.reference || p.receiptNumber || "—"}</TableCell>
                          <TableCell className="text-xs font-bold text-emerald-600">{formatCurrency(p.amount)}</TableCell>
                          <TableCell className="pr-4 text-right">
                            <button onClick={() => printReceipt(p)}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm ml-auto">
                              <ReceiptText className="h-3 w-3" /> Receipt
                            </button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile */}
              <div className="sm:hidden p-4 space-y-2">
                {recentPayments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No payments recorded yet.</p>
                ) : (
                  recentPayments.slice(0, 8).map(p => (
                    <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                        <CreditCard className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-900 truncate">{p.invoiceNumber}</p>
                          <p className="text-xs font-bold text-emerald-600 shrink-0">{formatCurrency(p.amount)}</p>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {formatDate(p.paymentDate, "MMM dd, yyyy")} · {p.method}
                        </p>
                      </div>
                      <button onClick={() => printReceipt(p)}
                        className="shrink-0 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
                        <ReceiptText className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Open Balance Follow-up */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-50">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Open Balances</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Invoices with remaining balance</p>
                </div>
              </div>
              <div className="p-4 space-y-2.5">
                {openInvoices.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 py-10 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                    <p className="text-sm font-semibold text-emerald-700">Fully paid up!</p>
                    <p className="text-xs text-emerald-500">New invoices will appear here.</p>
                  </div>
                ) : (
                  openInvoices.slice(0, 5).map(inv => {
                    const sc = getStatusConfig(inv.status);
                    return (
                      <div key={inv.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{inv.invoiceNumber ?? `INV-${inv.id}`}</p>
                            <p className="text-xs text-slate-500">{inv.billingPeriod}</p>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sc.pill}`}>
                            {inv.status}
                          </span>
                        </div>
                        <PayProgress paid={inv.paidAmount} total={inv.amount} />
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-500">
                            Due {formatDate(inv.dueDate, "MMM dd, yyyy")}
                          </p>
                          <p className="text-sm font-bold text-slate-900">{formatCurrency(inv.remainingBalance)}</p>
                        </div>
                        <button onClick={() => printInvoice(inv)}
                          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
                          <FileDown className="h-3 w-3" /> Print Invoice
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </Layout>
  );
}
