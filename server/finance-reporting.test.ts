import assert from "node:assert/strict";
import test from "node:test";
import {
  type FinanceInvoiceSnapshot,
  buildFinanceReportSnapshot,
  buildOverdueBalanceEntries,
  buildStudentBalanceSummary,
} from "../shared/finance";

const asOf = new Date("2026-03-10T12:00:00Z");

function createInvoices(): FinanceInvoiceSnapshot[] {
  return [
    { id: 1, studentId: 101, amount: 10000, paidAmount: 4000, remainingBalance: 6000, dueDate: "2026-03-05", status: "Unpaid", billingMonth: "2026-03", billingPeriod: "March 2026", invoiceNumber: "INV-202603-00001", student: { name: "Ada Mensah", className: "Grade 5" }, payments: [{ id: 11, feeId: 1, studentId: 101, amount: 4000, paymentDate: "2026-03-06", method: "Cash", receiptNumber: "RCP-202603-00011" }] },
    { id: 2, studentId: 101, amount: 10000, paidAmount: 0, remainingBalance: 10000, dueDate: "2026-03-15", status: "Unpaid", billingMonth: "2026-03", billingPeriod: "March 2026", invoiceNumber: "INV-202603-00002", student: { name: "Ada Mensah", className: "Grade 5" }, payments: [] },
    { id: 3, studentId: 202, amount: 12000, paidAmount: 12000, remainingBalance: 0, dueDate: "2026-03-08", status: "Paid", billingMonth: "2026-03", billingPeriod: "March 2026", invoiceNumber: "INV-202603-00003", student: { name: "Brian Osei", className: "Grade 6" }, payments: [{ id: 12, feeId: 3, studentId: 202, amount: 12000, paymentDate: "2026-03-08", method: "Bank Transfer", receiptNumber: "RCP-202603-00012" }] },
    { id: 4, studentId: 303, amount: 8000, paidAmount: 0, remainingBalance: 8000, dueDate: "2026-03-01", status: "Unpaid", billingMonth: "2026-03", billingPeriod: "March 2026", invoiceNumber: "INV-202603-00004", student: { name: "Chloe Asare", className: "Grade 4" }, payments: [] },
  ];
}

test("buildFinanceReportSnapshot computes finance summaries and breakdowns", () => {
  const report = buildFinanceReportSnapshot(createInvoices(), asOf);

  assert.equal(report.summary.totalInvoices, 4);
  assert.equal(report.summary.totalBilled, 40000);
  assert.equal(report.summary.totalPaid, 16000);
  assert.equal(report.summary.totalOutstanding, 24000);
  assert.equal(report.summary.collectionRate, 40);
  assert.equal(report.summary.overdueInvoices, 2);
  assert.equal(report.summary.overdueBalance, 14000);
  assert.equal(report.summary.studentsWithOutstanding, 2);
  assert.equal(report.summary.studentsWithOverdue, 2);

  const cash = report.paymentMethodBreakdown.find((item) => item.method === "Cash");
  const bank = report.paymentMethodBreakdown.find((item) => item.method === "Bank Transfer");
  assert.deepEqual(cash, { method: "Cash", count: 1, amount: 4000 });
  assert.deepEqual(bank, { method: "Bank Transfer", count: 1, amount: 12000 });

  assert.deepEqual(report.classBreakdown.slice(0, 3), [
    { className: "Grade 5", studentCount: 1, invoiceCount: 2, billed: 20000, paid: 4000, outstanding: 16000, overdueBalance: 6000, collectionRate: 20 },
    { className: "Grade 4", studentCount: 1, invoiceCount: 1, billed: 8000, paid: 0, outstanding: 8000, overdueBalance: 8000, collectionRate: 0 },
    { className: "Grade 6", studentCount: 1, invoiceCount: 1, billed: 12000, paid: 12000, outstanding: 0, overdueBalance: 0, collectionRate: 100 },
  ]);

  assert.deepEqual(report.outstandingStudents[0], {
    studentId: 101,
    studentName: "Ada Mensah",
    className: "Grade 5",
    outstandingBalance: 16000,
    overdueBalance: 6000,
    invoiceCount: 2,
    oldestDueDate: "2026-03-05",
    maxDaysOverdue: 5,
  });
});

test("student balance summaries and overdue worklists highlight reminders", () => {
  const studentBalance = buildStudentBalanceSummary(101, createInvoices(), asOf);
  const overdueEntries = buildOverdueBalanceEntries(createInvoices(), asOf);

  assert.equal(studentBalance.studentName, "Ada Mensah");
  assert.equal(studentBalance.className, "Grade 5");
  assert.equal(studentBalance.outstandingBalance, 16000);
  assert.equal(studentBalance.overdueBalance, 6000);
  assert.equal(studentBalance.openInvoices, 2);
  assert.equal(studentBalance.overdueInvoices, 1);
  assert.equal(studentBalance.dueSoonInvoices, 1);
  assert.equal(studentBalance.nextDueDate, "2026-03-05");
  assert.equal(studentBalance.maxDaysOverdue, 5);
  assert.deepEqual(studentBalance.paymentReminders, [
    { invoiceId: 1, invoiceNumber: "INV-202603-00001", billingPeriod: "March 2026", dueDate: "2026-03-05", remainingBalance: 6000, daysUntilDue: -5, status: "Overdue" },
    { invoiceId: 2, invoiceNumber: "INV-202603-00002", billingPeriod: "March 2026", dueDate: "2026-03-15", remainingBalance: 10000, daysUntilDue: 5, status: "Unpaid" },
  ]);

  assert.deepEqual(overdueEntries.map((entry) => ({ invoiceId: entry.invoiceId, daysOverdue: entry.daysOverdue })), [
    { invoiceId: 4, daysOverdue: 9 },
    { invoiceId: 1, daysOverdue: 5 },
  ]);
});