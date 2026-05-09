import { db } from "../db.js";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  salaryPayments,
  type InsertSalaryPayment,
  // If a dedicated payroll config table is added later, import it here
} from "../../shared/schema.js";
import { ledgerService } from "./ledgerService.js";

/**
 * PayrollService handles salary disbursements and history queries.
 * It mirrors the patterns used in StaffService for transaction safety and
 * unified‑ledger integration.
 */
export class PayrollService {
  /**
   * Create a payroll payment for a staff member.
   * The operation is performed inside a DB transaction for the payment row.
   * After the transaction commits, an expense entry is posted to the unified ledger.
   */
  async createPayroll(data: InsertSalaryPayment & { ledgerDescription?: string }) {
    // Step 1: Insert payroll row atomically
    const payment = await db.transaction(async (tx) => {
      const [newPayment] = await tx
        .insert(salaryPayments)
        .values(data)
        .returning();
      return newPayment;
    });

    // Step 2: Post to unified ledger (outside transaction to avoid rollbacks)
    try {
      await ledgerService.recordTransaction({
        entryType: "expense",
        category: "salary",
        amount: Number(data.netSalary ?? data.amount),
        description:
          data.ledgerDescription ||
          `Salary disbursement – staff #${data.staffId}, month: ${data.paymentMonth}`,
        referenceType: "salary_payment",
        referenceId: payment.id,
        sourceModule: "payroll",
        createdBy: data.processedBy ?? undefined,
      });
    } catch (err) {
      console.error(
        `[PayrollService] Ledger post failed for salary_payment #${payment.id}:`,
        err
      );
    }
    return payment;
  }

  /**
   * Retrieve a single payroll entry.
   */
  async getPayroll(id: number) {
    return db
      .select()
      .from(salaryPayments)
      .where(eq(salaryPayments.id, id))
      .limit(1);
  }

  /**
   * Fetch salary history for a staff member, optionally bounded by dates.
   */
  async getSalaryHistory(
    staffId: number,
    fromDate?: Date,
    toDate?: Date
  ) {
    let query = db
      .select()
      .from(salaryPayments)
      .where(eq(salaryPayments.staffId, staffId))
      .orderBy(desc(salaryPayments.effectiveDate));

    if (fromDate) {
      query = query.where(sql`${salaryPayments.effectiveDate} >= ${fromDate}`);
    }
    if (toDate) {
      query = query.where(sql`${salaryPayments.effectiveDate} <= ${toDate}`);
    }
    return query;
  }

  // Placeholder for future payroll configuration storage – can be expanded later.
  async storePayrollConfig(_config: Record<string, unknown>) {
    // Implementation would upsert into a payroll_config table.
    return;
  }
}

// Export a singleton instance like other services
export const payrollService = new PayrollService();
