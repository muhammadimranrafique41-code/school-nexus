import { db } from "../db.js";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  staff,
  salaryStructures,
  salaryPayments,
  staffLoans,
  loanRepayments,
  staffAttendance,
  financeLedgerEntries,
  type InsertStaff,
  type InsertSalaryStructure,
  type InsertSalaryPayment,
  type InsertStaffLoan,
  type InsertLoanRepayment,
} from "../../shared/schema.js";

export class StaffService {
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

  async createSalaryStructure(data: InsertSalaryStructure) {
    const [created] = await db.insert(salaryStructures).values(data).returning();
    return created;
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

  async processSalary(data: InsertSalaryPayment & { ledgerDescription?: string }) {
    return db.transaction(async (tx) => {
      const [payment] = await tx.insert(salaryPayments).values(data).returning();

      // Create ledger entry for expense tracking
      await tx.insert(financeLedgerEntries).values({
        studentId: 0, // System entry
        type: "payment",
        debit: 0,
        credit: Number(data.netSalary),
        balanceAfter: 0,
        referenceId: `SALARY-${payment.id}`,
        description: data.ledgerDescription || `Salary payment for staff ${data.staffId}`,
        createdAt: new Date().toISOString(),
        createdBy: data.processedBy,
      });

      return payment;
    });
  }

  async getSalaryPayments(staffId: number, limit = 12) {
    return db
      .select()
      .from(salaryPayments)
      .where(eq(salaryPayments.staffId, staffId))
      .orderBy(desc(salaryPayments.paymentMonth))
      .limit(limit);
  }

  async createLoan(data: InsertStaffLoan) {
    const [loan] = await db.insert(staffLoans).values(data).returning();
    return loan;
  }

  async getStaffLoans(staffId: number) {
    return db.select().from(staffLoans).where(eq(staffLoans.staffId, staffId)).orderBy(desc(staffLoans.createdAt));
  }

  async recordLoanRepayment(data: InsertLoanRepayment) {
    return db.transaction(async (tx) => {
      const [repayment] = await tx.insert(loanRepayments).values(data).returning();

      // Update loan balance
      const [loan] = await tx.select().from(staffLoans).where(eq(staffLoans.id, data.loanId)).limit(1);
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

      return repayment;
    });
  }

  async markAttendance(staffId: number, date: string, status: string, checkIn?: string, checkOut?: string) {
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

export const staffService = new StaffService();
