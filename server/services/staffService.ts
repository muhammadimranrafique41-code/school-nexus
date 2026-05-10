/**
 * @module StaffService
 * @description
 * Business-logic layer for staff, salary, loan, and attendance operations.
 *
 * Integration contract with the unified ledger:
 *  - `processSalary`       → posts an `expense / salary` entry via `LedgerService`.
 *  - `recordLoanRepayment` → posts an `expense / other`  entry via `LedgerService`
 *                            (loan disbursements are outflows from the school's perspective).
 *
 * Salary disbursements are tracked exclusively in the unified `ledger` table.
 * The `finance_ledger_entries` table is a student-fee ledger and must NOT be
 * used for staff salary entries (its `student_id` FK would reject them).
 */

import { db } from "../db.js";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  staff,
  salaryStructures,
  salaryPayments,
  staffLoans,
  loanRepayments,
  staffAttendance,
  type InsertStaff,
  type InsertSalaryStructure,
  type InsertSalaryPayment,
  type InsertStaffLoan,
  type InsertLoanRepayment,
} from "../../shared/schema.js";
import { ledgerService } from "./ledgerService.js";

export class StaffService {
  // ── Staff CRUD ─────────────────────────────────────────────────────────────

  async createStaff(data: InsertStaff) {
    const [created] = await db.insert(staff).values(data).returning();
    return created;
  }

  async getStaff(id: number) {
    const [record] = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
    return record;
  }

  async listStaff(filters?: { status?: string; staffType?: string }) {
    let query = db.select().from(staff);
    const conditions = [];
    if (filters?.status) conditions.push(eq(staff.status, filters.status));
    if (filters?.staffType) conditions.push(eq(staff.staffType, filters.staffType));
    if (conditions.length) query = query.where(and(...conditions)) as any;
    return query.orderBy(desc(staff.createdAt));
  }

  async updateStaff(id: number, data: Partial<InsertStaff>) {
    const [updated] = await db
      .update(staff)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(staff.id, id))
      .returning();
    return updated;
  }

  // ── Salary structures ──────────────────────────────────────────────────────

  async createSalaryStructure(data: InsertSalaryStructure) {
    const [created] = await db.insert(salaryStructures).values(data).returning();
    return created;
  }

  /**
   * Updates an existing salary structure row by its primary key.
   * Only the fields supplied in `data` are changed; all others are preserved.
   *
   * @param id   - Primary key of the `salary_structures` row to update.
   * @param data - Partial salary structure fields to overwrite.
   * @returns    The updated row, or `undefined` if no row matched.
   */
  async updateSalaryStructure(
    id: number,
    data: Partial<Omit<InsertSalaryStructure, "staffId">>
  ) {
    const [updated] = await db
      .update(salaryStructures)
      .set(data)
      .where(eq(salaryStructures.id, id))
      .returning();
    return updated;
  }

  async getCurrentSalaryStructure(staffId: number) {
    const today = new Date().toISOString().split("T")[0];
    const [structure] = await db
      .select()
      .from(salaryStructures)
      .where(
        and(
          eq(salaryStructures.staffId, staffId),
          sql`${salaryStructures.effectiveFrom} <= ${today}`,
          sql`(${salaryStructures.effectiveTo} IS NULL OR ${salaryStructures.effectiveTo} >= ${today})`
        )
      )
      .orderBy(desc(salaryStructures.effectiveFrom))
      .limit(1);
    return structure;
  }

  // ── Salary payments ────────────────────────────────────────────────────────

  /**
   * Processes a salary disbursement for a staff member.
   *
   * Flow:
   *  1. Inserts the `salary_payments` row inside a DB transaction.
   *  2. Writes a legacy `finance_ledger_entries` row (backward-compat).
   *  3. After the transaction commits, posts an `expense / salary` entry to
   *     the unified `ledger` table via `LedgerService.recordTransaction`.
   *
   * Ledger idempotency:
   *  The `referenceType = 'salary_payment'` + `referenceId = payment.id` pair
   *  acts as the idempotency key — retrying a failed ledger post will not
   *  produce a duplicate row.
   *
   * @param data - Salary payment payload including optional `ledgerDescription`.
   * @returns    The newly created `salary_payments` row.
   */
  async processSalary(data: InsertSalaryPayment & { ledgerDescription?: string }) {
    // ── Step 1: Persist salary payment row atomically ──────────────────────
    // NOTE: The legacy `finance_ledger_entries` write has been removed.
    // That table has a NOT NULL FK to `users.id` (student-fee ledger) and is
    // not appropriate for staff salary entries.  All salary disbursements are
    // tracked in the unified `ledger` table (Step 2 below).
    const payment = await db.transaction(async (tx) => {
      const [newPayment] = await tx.insert(salaryPayments).values(data).returning();
      return newPayment;
    });

    // ── Step 3: Post expense entry to the unified ledger ──────────────────
    // Performed outside the domain transaction so a ledger failure does not
    // roll back the salary payment.  Missing entries can be detected via
    // `LedgerService.hasEntry('salary_payment', payment.id)`.
    try {
      await ledgerService.recordTransaction({
        entryType: "expense",
        category: "salary",
        amount: Number(data.netSalary),
        description:
          data.ledgerDescription ||
          `Salary disbursement — staff #${data.staffId}, month: ${data.paymentMonth}`,
        referenceType: "salary_payment",
        referenceId: payment.id,
        sourceModule: "staff",
        createdBy: data.processedBy ?? undefined,
      });
    } catch (ledgerErr) {
      console.error(
        `[StaffService] Unified ledger post failed for salary_payment #${payment.id}:`,
        ledgerErr
      );
    }

    return payment;
  }

  async getSalaryPayments(staffId: number, limit = 12) {
    return db
      .select()
      .from(salaryPayments)
      .where(eq(salaryPayments.staffId, staffId))
      .orderBy(desc(salaryPayments.paymentMonth))
      .limit(limit);
  }

  // ── Staff loans ────────────────────────────────────────────────────────────

  async createLoan(data: InsertStaffLoan) {
    const [loan] = await db.insert(staffLoans).values(data).returning();
    return loan;
  }

  async getStaffLoans(staffId: number) {
    return db
      .select()
      .from(staffLoans)
      .where(eq(staffLoans.staffId, staffId))
      .orderBy(desc(staffLoans.createdAt));
  }

  /**
   * Records a loan repayment instalment and updates the outstanding balance.
   *
   * Flow:
   *  1. Inserts the `loan_repayments` row and updates `staff_loans.outstanding_balance`
   *     atomically inside a DB transaction.
   *  2. After commit, posts an `expense / other` entry to the unified ledger
   *     (loan repayments are cash outflows from the school's perspective when
   *     the school is the lender).
   *
   * @param data - Loan repayment payload.
   * @returns    The newly created `loan_repayments` row.
   */
  async recordLoanRepayment(data: InsertLoanRepayment) {
    // ── Step 1: Persist repayment + update loan balance atomically ─────────
    const repayment = await db.transaction(async (tx) => {
      const [newRepayment] = await tx.insert(loanRepayments).values(data).returning();

      // Recalculate outstanding balance and mark loan as completed if cleared.
      const [loan] = await tx
        .select()
        .from(staffLoans)
        .where(eq(staffLoans.id, data.loanId))
        .limit(1);

      if (loan) {
        const newBalance = Number(loan.outstandingBalance || 0) - Number(data.amount);
        const newPaid = (loan.installmentsPaid || 0) + 1;
        await tx
          .update(staffLoans)
          .set({
            outstandingBalance: String(Math.max(0, newBalance)),
            installmentsPaid: newPaid,
            status: newBalance <= 0 ? "completed" : "active",
          })
          .where(eq(staffLoans.id, data.loanId));
      }

      return newRepayment;
    });

    // ── Step 2: Post expense entry to the unified ledger ──────────────────
    try {
      await ledgerService.recordTransaction({
        entryType: "expense",
        category: "other",
        amount: Number(data.amount),
        description: `Loan repayment — loan #${data.loanId}, instalment #${repayment.id}`,
        referenceType: "loan_repayment",
        referenceId: repayment.id,
        sourceModule: "staff",
        createdBy: undefined,
      });
    } catch (ledgerErr) {
      console.error(
        `[StaffService] Unified ledger post failed for loan_repayment #${repayment.id}:`,
        ledgerErr
      );
    }

    return repayment;
  }

  // ── Attendance ─────────────────────────────────────────────────────────────

  async markAttendance(
    staffId: number,
    date: string,
    status: string,
    checkIn?: string,
    checkOut?: string
  ) {
    const [record] = await db
      .insert(staffAttendance)
      .values({ staffId, attendanceDate: date, status, checkIn, checkOut })
      .onConflictDoUpdate({
        target: [staffAttendance.staffId, staffAttendance.attendanceDate],
        set: { status, checkIn, checkOut },
      })
      .returning();
    return record;
  }

  async getAttendance(staffId: number, fromDate?: string, toDate?: string) {
    const conditions = [eq(staffAttendance.staffId, staffId)];
    if (fromDate) conditions.push(sql`${staffAttendance.attendanceDate} >= ${fromDate}`);
    if (toDate) conditions.push(sql`${staffAttendance.attendanceDate} <= ${toDate}`);
    return db
      .select()
      .from(staffAttendance)
      .where(and(...conditions))
      .orderBy(desc(staffAttendance.attendanceDate));
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const staffService = new StaffService();
