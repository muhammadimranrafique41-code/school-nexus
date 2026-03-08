import { api } from "@shared/routes";
import { escapeHtml, formatCurrency, formatDate } from "@/lib/utils";
import { z } from "zod";

export type FeeRecord = z.infer<typeof api.fees.list.responses[200]>[number];
export type FeePaymentRecord = NonNullable<FeeRecord["payments"]>[number];

function compareFeePayments(left: FeePaymentRecord, right: FeePaymentRecord) {
  return `${left.paymentDate}-${String(left.id).padStart(12, "0")}`.localeCompare(
    `${right.paymentDate}-${String(right.id).padStart(12, "0")}`,
  );
}

export function getSortedFeePayments(fee: FeeRecord, direction: "asc" | "desc" = "desc") {
  const payments = [...(fee.payments ?? [])];
  return payments.sort((left, right) => (direction === "asc" ? compareFeePayments(left, right) : compareFeePayments(right, left)));
}

export function getLatestRecordedPayment(fee: FeeRecord) {
  return (fee.payments ?? []).reduce<FeePaymentRecord | undefined>((latest, payment) => {
    if (!latest) return payment;
    return payment.id > latest.id ? payment : latest;
  }, undefined);
}

export function getCurrentBillingMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getFeeStatusClassName(status: FeeRecord["status"]) {
  switch (status) {
    case "Paid":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Partially Paid":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Overdue":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

export function buildInvoicePrintHtml(fee: FeeRecord) {
  const lineItems = fee.lineItems.length ? fee.lineItems : [{ label: fee.description, amount: fee.amount }];
  const payments = getSortedFeePayments(fee);

  return `
    <div class="section">
      <div class="grid">
        <div class="card">
          <strong>Student</strong>
          <p>${escapeHtml(fee.student?.name ?? `Student #${fee.studentId}`)}</p>
          <p class="muted">${escapeHtml(fee.student?.className ?? "Class not assigned")}</p>
        </div>
        <div class="card">
          <strong>Invoice</strong>
          <p>${escapeHtml(fee.invoiceNumber ?? `INV-${fee.id}`)}</p>
          <p class="muted">${escapeHtml(fee.billingPeriod)}</p>
        </div>
        <div class="card">
          <strong>Due date</strong>
          <p>${escapeHtml(formatDate(fee.dueDate, "MMMM dd, yyyy"))}</p>
          <p class="muted">Status: ${escapeHtml(fee.status)}</p>
        </div>
        <div class="card">
          <strong>Balance summary</strong>
          <p>Total: ${escapeHtml(formatCurrency(fee.amount))}</p>
          <p>Paid: ${escapeHtml(formatCurrency(fee.paidAmount))}</p>
          <p>Balance: ${escapeHtml(formatCurrency(fee.remainingBalance))}</p>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Invoice Items</h2>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems
      .map(
        (item) => `
                <tr>
                  <td>${escapeHtml(item.label)}</td>
                  <td>${escapeHtml(formatCurrency(item.amount))}</td>
                </tr>`,
      )
      .join("")}
        </tbody>
      </table>
      <p class="muted">${escapeHtml(fee.description)}</p>
      ${fee.notes ? `<p><strong>Notes:</strong> ${escapeHtml(fee.notes)}</p>` : ""}
    </div>

    <div class="section">
      <h2>Payment History</h2>
      ${payments.length === 0
      ? `<p>No payments have been recorded against this invoice yet.</p>`
      : `
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Receipt</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${payments
        .map(
          (payment) => `
                    <tr>
                      <td>${escapeHtml(formatDate(payment.paymentDate, "MMMM dd, yyyy"))}</td>
                      <td>${escapeHtml(payment.method)}</td>
                      <td>${escapeHtml(payment.reference ?? "-")}</td>
                      <td>${escapeHtml(payment.receiptNumber ?? "Pending")}</td>
                      <td>${escapeHtml(formatCurrency(payment.amount))}</td>
                    </tr>`,
        )
        .join("")}
            </tbody>
          </table>`}
    </div>
  `;
}

export function buildPaymentReceiptPrintHtml(fee: FeeRecord, payment: FeePaymentRecord) {
  const paymentsAscending = getSortedFeePayments(fee, "asc");
  let runningPaid = 0;
  let balanceBeforePayment = fee.amount;
  let balanceAfterPayment = fee.remainingBalance;

  for (const entry of paymentsAscending) {
    if (entry.id === payment.id) {
      balanceBeforePayment = Math.max(fee.amount - runningPaid, 0);
      runningPaid += entry.amount;
      balanceAfterPayment = Math.max(fee.amount - runningPaid, 0);
      break;
    }

    runningPaid += entry.amount;
  }

  return `
    <div class="section">
      <div class="grid">
        <div class="card">
          <strong>Receipt</strong>
          <p>${escapeHtml(payment.receiptNumber ?? `Pending receipt #${payment.id}`)}</p>
          <p class="muted">Payment date: ${escapeHtml(formatDate(payment.paymentDate, "MMMM dd, yyyy") || payment.paymentDate)}</p>
        </div>
        <div class="card">
          <strong>Student</strong>
          <p>${escapeHtml(fee.student?.name ?? `Student #${fee.studentId}`)}</p>
          <p class="muted">${escapeHtml(fee.student?.className ?? "Class not assigned")}</p>
        </div>
        <div class="card">
          <strong>Invoice</strong>
          <p>${escapeHtml(fee.invoiceNumber ?? `INV-${fee.id}`)}</p>
          <p class="muted">${escapeHtml(fee.billingPeriod)}</p>
        </div>
        <div class="card">
          <strong>Payment method</strong>
          <p>${escapeHtml(payment.method)}</p>
          <p class="muted">Due date: ${escapeHtml(formatDate(fee.dueDate, "MMMM dd, yyyy"))}</p>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Receipt Summary</h2>
      <table>
        <tbody>
          <tr>
            <th>Invoice total</th>
            <td>${escapeHtml(formatCurrency(fee.amount))}</td>
          </tr>
          <tr>
            <th>Balance before payment</th>
            <td>${escapeHtml(formatCurrency(balanceBeforePayment))}</td>
          </tr>
          <tr>
            <th>Amount paid</th>
            <td>${escapeHtml(formatCurrency(payment.amount))}</td>
          </tr>
          <tr>
            <th>Remaining balance</th>
            <td>${escapeHtml(formatCurrency(balanceAfterPayment))}</td>
          </tr>
          <tr>
            <th>Status after payment</th>
            <td>${escapeHtml(balanceAfterPayment === 0 ? "Paid" : "Partially Paid")}</td>
          </tr>
          <tr>
            <th>Reference</th>
            <td>${escapeHtml(payment.reference ?? "Not provided")}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted">This receipt confirms the payment applied to ${escapeHtml(fee.invoiceNumber ?? `invoice ${fee.id}`)}.</p>
      ${payment.notes ? `<p><strong>Notes:</strong> ${escapeHtml(payment.notes)}</p>` : ""}
      ${fee.notes ? `<p><strong>Invoice notes:</strong> ${escapeHtml(fee.notes)}</p>` : ""}
    </div>
  `;
}