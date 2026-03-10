import { useMemo } from "react";
import { Layout } from "@/components/layout";
import { useFees, useStudentBalance } from "@/hooks/use-fees";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildInvoicePrintHtml, buildPaymentReceiptPrintHtml, getFeeStatusClassName } from "@/lib/finance";
import { cn, downloadCsv, formatCurrency, formatDate, openPrintWindow } from "@/lib/utils";
import { Banknote, CalendarDays, Download, FileDown, Loader2, ReceiptText } from "lucide-react";

function getReminderMessage(daysUntilDue: number) {
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)} day(s) overdue`;
  if (daysUntilDue === 0) return "Due today";
  return `Due in ${daysUntilDue} day(s)`;
}

export default function StudentFees() {
  const { data: fees, isLoading } = useFees();
  const { data: studentBalance } = useStudentBalance();

  const invoices = useMemo(
    () => [...(fees ?? [])].sort((a, b) => +new Date(b.dueDate) - +new Date(a.dueDate)),
    [fees],
  );

  const openInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.remainingBalance > 0).sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)),
    [invoices],
  );

  const overdueInvoices = useMemo(
    () => openInvoices.filter((invoice) => invoice.status === "Overdue"),
    [openInvoices],
  );

  const outstandingBalance = useMemo(
    () => invoices.reduce((sum, invoice) => sum + invoice.remainingBalance, 0),
    [invoices],
  );

  const totalPaid = useMemo(
    () => invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
    [invoices],
  );

  const recentPayments = useMemo(
    () => invoices
      .flatMap((invoice) =>
        (invoice.payments ?? []).map((payment) => ({
          ...payment,
          invoice,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber ?? `INV-${invoice.id}`,
          billingPeriod: invoice.billingPeriod,
        })),
      )
      .sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate)),
    [invoices],
  );

  const nextDueInvoice = openInvoices[0];
  const paymentReminders = studentBalance?.paymentReminders ?? [];

  const exportInvoices = () => {
    downloadCsv(
      "my-invoices.csv",
      invoices.map((invoice) => ({
        Invoice: invoice.invoiceNumber ?? `INV-${invoice.id}`,
        BillingPeriod: invoice.billingPeriod,
        DueDate: invoice.dueDate,
        TotalAmount: invoice.amount,
        PaidAmount: invoice.paidAmount,
        RemainingBalance: invoice.remainingBalance,
        Status: invoice.status,
      })),
    );
  };

  const printInvoice = (invoice: (typeof invoices)[number]) => {
    openPrintWindow(invoice.invoiceNumber ?? `Invoice ${invoice.id}`, buildInvoicePrintHtml(invoice), {
      documentType: "invoice",
      subtitle: `${invoice.billingPeriod} • ${invoice.student?.name ?? "Student invoice"}`,
    });
  };

  const printReceipt = (payment: (typeof recentPayments)[number]) => {
    openPrintWindow(payment.receiptNumber ?? `Receipt ${payment.id}`, buildPaymentReceiptPrintHtml(payment.invoice, payment), {
      documentType: "receipt",
      subtitle: `${payment.invoiceNumber} • ${payment.billingPeriod}`,
    });
  };

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">My Invoices</h1>
            <p className="mt-1 text-muted-foreground">Track billed amounts, payment history, balances, and printable invoice copies.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={exportInvoices} disabled={invoices.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
          {[
            {
              label: "Outstanding balance",
              value: formatCurrency(studentBalance?.outstandingBalance ?? outstandingBalance),
              hint: studentBalance?.nextDueDate ? `Next due ${formatDate(studentBalance.nextDueDate, "MMM dd, yyyy")}` : nextDueInvoice ? `Next due ${formatDate(nextDueInvoice.dueDate, "MMM dd, yyyy")}` : "No balance pending",
              icon: Banknote,
            },
            {
              label: "Open invoices",
              value: studentBalance?.openInvoices ?? openInvoices.length,
              hint: openInvoices.length ? "Invoices still awaiting settlement" : "All invoices cleared",
              icon: ReceiptText,
            },
            {
              label: "Overdue invoices",
              value: studentBalance?.overdueInvoices ?? overdueInvoices.length,
              hint: overdueInvoices.length ? "Follow up on overdue balances" : "No overdue invoices",
              icon: CalendarDays,
            },
            {
              label: "Due soon",
              value: studentBalance?.dueSoonInvoices ?? 0,
              hint: paymentReminders.length ? `${paymentReminders.length} reminder(s) currently active` : "No upcoming deadlines in the next week",
              icon: CalendarDays,
            },
            {
              label: "Total paid",
              value: formatCurrency(studentBalance?.totalPaid ?? totalPaid),
              hint: `${recentPayments.length} payment record(s) logged`,
              icon: FileDown,
            },
          ].map((item) => (
            <Card key={item.label} className="bg-white/80 transition-all duration-300 hover:-translate-y-1">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-3xl font-display font-bold text-slate-900">{item.value}</p>
                  <p className="mt-2 text-xs font-medium text-slate-500">{item.hint}</p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 p-3 text-violet-600">
                  <item.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="bg-white/85">
            <CardHeader>
              <CardTitle>Payment reminders</CardTitle>
              <CardDescription>Upcoming and overdue invoices that currently need your attention.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {paymentReminders.length === 0 ? (
                <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">
                  You have no immediate payment reminders. New reminders will appear here when an invoice is overdue or due within the next 7 days.
                </div>
              ) : (
                paymentReminders.map((reminder) => {
                  const invoice = invoices.find((item) => item.id === reminder.invoiceId);
                  return (
                    <div key={reminder.invoiceId} className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{reminder.invoiceNumber ?? `INV-${reminder.invoiceId}`}</p>
                          <p className="text-sm text-slate-500">{reminder.billingPeriod}</p>
                        </div>
                        <Badge variant="outline" className={cn("border", getFeeStatusClassName(reminder.status))}>
                          {reminder.status}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Due date</p>
                          <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(reminder.dueDate, "MMM dd, yyyy")}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Balance</p>
                          <p className="mt-1 text-sm font-medium text-slate-900">{formatCurrency(reminder.remainingBalance)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Timeline</p>
                          <p className="mt-1 text-sm font-medium text-slate-900">{getReminderMessage(reminder.daysUntilDue)}</p>
                        </div>
                      </div>
                      {invoice ? (
                        <div className="mt-4">
                          <Button variant="outline" size="sm" onClick={() => printInvoice(invoice)}>
                            <FileDown className="h-4 w-4" /> Print invoice
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="bg-white/85">
            <CardHeader>
              <CardTitle>Account balance summary</CardTitle>
              <CardDescription>Current billing position based on invoices, payments, and receipt history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Total billed", value: formatCurrency(studentBalance?.totalBilled ?? invoices.reduce((sum, invoice) => sum + invoice.amount, 0)) },
                { label: "Total paid", value: formatCurrency(studentBalance?.totalPaid ?? totalPaid) },
                { label: "Outstanding", value: formatCurrency(studentBalance?.outstandingBalance ?? outstandingBalance) },
                { label: "Overdue balance", value: formatCurrency(studentBalance?.overdueBalance ?? overdueInvoices.reduce((sum, invoice) => sum + invoice.remainingBalance, 0)) },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3">
                  <p className="text-sm text-slate-600">{item.label}</p>
                  <p className="text-sm font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
              <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 p-4 text-sm text-slate-600">
                {studentBalance?.nextDueDate
                  ? `Your next scheduled payment is due on ${formatDate(studentBalance.nextDueDate, "MMMM dd, yyyy")}.`
                  : "You do not have any upcoming invoice due dates right now."}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white/85">
          <CardHeader>
            <CardTitle>Invoice Register</CardTitle>
            <CardDescription>Every invoice shows billed amount, payment progress, remaining balance, and quick print access.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-6">Invoice</TableHead>
                  <TableHead>Billing period</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-violet-600" />
                    </TableCell>
                  </TableRow>
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-slate-500">No invoice records found yet.</TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="pl-6">
                        <div>
                          <p className="font-semibold text-slate-900">{invoice.invoiceNumber ?? `INV-${invoice.id}`}</p>
                          <p className="text-xs text-slate-500">{invoice.feeType}</p>
                        </div>
                      </TableCell>
                      <TableCell>{invoice.billingPeriod}</TableCell>
                      <TableCell>{formatDate(invoice.dueDate, "MMMM dd, yyyy")}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(invoice.amount)}</TableCell>
                      <TableCell>{formatCurrency(invoice.paidAmount)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(invoice.remainingBalance)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("border", getFeeStatusClassName(invoice.status))}>
                          {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button variant="outline" size="sm" onClick={() => printInvoice(invoice)}>
                          <FileDown className="h-4 w-4" /> Print
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="bg-white/85">
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>Recorded payments are automatically linked back to the related invoice.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="pl-6">Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="pr-6 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-slate-500">No payments have been recorded yet.</TableCell>
                    </TableRow>
                  ) : (
                    recentPayments.slice(0, 8).map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="pl-6">{formatDate(payment.paymentDate, "MMMM dd, yyyy")}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">{payment.invoiceNumber}</p>
                            <p className="text-xs text-slate-500">{payment.billingPeriod}</p>
                          </div>
                        </TableCell>
                        <TableCell>{payment.method}</TableCell>
                        <TableCell>{payment.reference || payment.receiptNumber || "—"}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(payment.amount)}</TableCell>
                        <TableCell className="pr-6 text-right">
                          <Button variant="outline" size="sm" onClick={() => printReceipt(payment)}>
                            <ReceiptText className="mr-1.5 h-3.5 w-3.5" /> Receipt
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="bg-white/85">
            <CardHeader>
              <CardTitle>Open Balance Follow-up</CardTitle>
              <CardDescription>Keep track of any invoice that still has a remaining balance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {openInvoices.length === 0 ? (
                <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">
                  You are fully paid up. New monthly invoices will appear here when they are generated.
                </div>
              ) : (
                openInvoices.slice(0, 5).map((invoice) => (
                  <div key={invoice.id} className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{invoice.invoiceNumber ?? `INV-${invoice.id}`}</p>
                        <p className="text-sm text-slate-500">{invoice.billingPeriod}</p>
                      </div>
                      <Badge variant="outline" className={cn("border", getFeeStatusClassName(invoice.status))}>
                        {invoice.status}
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-600">
                      <span>Due {formatDate(invoice.dueDate, "MMM dd, yyyy")}</span>
                      <span className="font-semibold text-slate-900">{formatCurrency(invoice.remainingBalance)}</span>
                    </div>
                    <div className="mt-4">
                      <Button variant="outline" size="sm" onClick={() => printInvoice(invoice)}>
                        <FileDown className="h-4 w-4" /> Print invoice
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
