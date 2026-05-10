/**
 * @module PayrollService
 * @description
 * Handles salary disbursements, history queries, and professional-grade
 * salary computation following standard accountant practices.
 *
 * Salary computation model (Pakistan / South-Asia standard):
 *  - Gross = Basic + House Rent Allowance + Medical + Conveyance + Other Allowances
 *  - Taxable Income = Gross − Exempt Allowances (HRA up to 45% of basic, Medical up to 10%)
 *  - Income Tax = progressive slab (FBR 2024-25 slabs)
 *  - EOBI (Employee Old-Age Benefits) = 1% of basic (employee share)
 *  - EOBI Employer = 5% of basic
 *  - PESSI / SESSI (Provincial Social Security) = 6% of basic (employer)
 *  - Net = Gross − Income Tax − EOBI Employee − Loan Deductions − Other Deductions
 */

import { db } from "../db.js";
import { eq, and, desc, gte, lte, sql, isNull } from "drizzle-orm";
import {
  salaryPayments,
  ledger,
  type InsertSalaryPayment,
  type SalaryPayment,
} from "../../shared/schema.js";
import { ledgerService } from "./ledgerService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SalaryComponents {
  basicSalary: number;
  houseRentAllowance: number;
  medicalAllowance: number;
  conveyanceAllowance: number;
  otherAllowances?: Record<string, number>;
}

export interface SalaryDeductions {
  incomeTax: number;
  eobiEmployee: number;
  loanDeduction: number;
  otherDeductions: Record<string, number>;
}

export interface ComputedSalarySlip {
  // Earnings
  basicSalary: number;
  houseRentAllowance: number;
  medicalAllowance: number;
  conveyanceAllowance: number;
  otherAllowances: Record<string, number>;
  totalAllowances: number;
  grossSalary: number;

  // Deductions
  incomeTax: number;
  eobiEmployee: number;
  eobiEmployer: number;
  pessiEmployer: number;
  loanDeduction: number;
  otherDeductions: Record<string, number>;
  totalDeductions: number;

  // Net
  netSalary: number;

  // Audit fields
  taxableIncome: number;
  annualTaxableIncome: number;
  appliedTaxSlab: string;
  effectiveTaxRate: number;
}

export interface SalaryHistoryEntry extends SalaryPayment {
  ledgerEntries: Array<{
    id: number;
    transactionDate: Date;
    amount: string;
    description: string | null;
    entryType: string;
    category: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// FBR Income Tax Slabs (Tax Year 2024-25, salaried individuals)
// Source: Finance Act 2024 — Section 149 read with Part I of First Schedule
// ─────────────────────────────────────────────────────────────────────────────

interface TaxSlab {
  minAnnual: number;
  maxAnnual: number | null; // null = no upper limit
  fixedTax: number;
  marginalRate: number; // percentage of amount exceeding minAnnual
  label: string;
}

const FBR_TAX_SLABS_2024_25: TaxSlab[] = [
  {
    minAnnual: 0,
    maxAnnual: 600_000,
    fixedTax: 0,
    marginalRate: 0,
    label: "0% (≤ 600,000)",
  },
  {
    minAnnual: 600_001,
    maxAnnual: 1_200_000,
    fixedTax: 0,
    marginalRate: 5,
    label: "5% on excess over 600,000",
  },
  {
    minAnnual: 1_200_001,
    maxAnnual: 2_200_000,
    fixedTax: 30_000,
    marginalRate: 15,
    label: "30,000 + 15% on excess over 1,200,000",
  },
  {
    minAnnual: 2_200_001,
    maxAnnual: 3_200_000,
    fixedTax: 180_000,
    marginalRate: 25,
    label: "180,000 + 25% on excess over 2,200,000",
  },
  {
    minAnnual: 3_200_001,
    maxAnnual: 4_100_000,
    fixedTax: 430_000,
    marginalRate: 30,
    label: "430,000 + 30% on excess over 3,200,000",
  },
  {
    minAnnual: 4_100_001,
    maxAnnual: null,
    fixedTax: 700_000,
    marginalRate: 35,
    label: "700,000 + 35% on excess over 4,100,000",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper: FBR annual income tax computation
// ─────────────────────────────────────────────────────────────────────────────

function computeAnnualIncomeTax(annualTaxableIncome: number): {
  annualTax: number;
  slab: TaxSlab;
} {
  // Default to the zero-rate slab
  const zeroSlab: TaxSlab = FBR_TAX_SLABS_2024_25[0] ?? {
    minAnnual: 0,
    maxAnnual: 600_000,
    fixedTax: 0,
    marginalRate: 0,
    label: "0%",
  };

  if (annualTaxableIncome <= 0) {
    return { annualTax: 0, slab: zeroSlab };
  }

  // Find the matching slab; fall back to the highest slab if none matches
  const lastSlab: TaxSlab = FBR_TAX_SLABS_2024_25[FBR_TAX_SLABS_2024_25.length - 1] ?? {
    minAnnual: 4_100_001,
    maxAnnual: null,
    fixedTax: 700_000,
    marginalRate: 35,
    label: "700,000 + 35% on excess over 4,100,000",
  };

  let matchedSlab: TaxSlab = lastSlab;
  for (const s of FBR_TAX_SLABS_2024_25) {
    if (
      annualTaxableIncome >= s.minAnnual &&
      (s.maxAnnual === null || annualTaxableIncome <= s.maxAnnual)
    ) {
      matchedSlab = s;
      break;
    }
  }

  const excess = Math.max(0, annualTaxableIncome - matchedSlab.minAnnual + 1);
  const annualTax = matchedSlab.fixedTax + (excess * matchedSlab.marginalRate) / 100;

  return { annualTax, slab: matchedSlab };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service class
// ─────────────────────────────────────────────────────────────────────────────

export class PayrollService {
  // ── Professional Salary Computation ─────────────────────────────────────────

  /**
   * Computes a full salary slip using professional accountant methodology.
   *
   * Follows Pakistan FBR 2024-25 tax rules:
   *  - HRA exemption: lower of (actual HRA) or (45% of basic) or (actual rent paid)
   *  - Medical exemption: lower of (actual medical) or (10% of basic)
   *  - EOBI employee contribution: 1% of basic (min PKR 370/month per EOBI Act)
   *  - EOBI employer contribution: 5% of basic (informational, not deducted from net)
   *  - PESSI/SESSI employer contribution: 6% of basic (informational)
   *
   * @param components - Salary components for the employee.
   * @param loanDeduction - Monthly loan instalment to deduct (default 0).
   * @param otherDeductions - Any additional named deductions.
   * @returns A fully computed `ComputedSalarySlip`.
   */
  computeSalarySlip(
    components: SalaryComponents,
    loanDeduction = 0,
    otherDeductions: Record<string, number> = {}
  ): ComputedSalarySlip {
    const {
      basicSalary,
      houseRentAllowance,
      medicalAllowance,
      conveyanceAllowance,
      otherAllowances = {},
    } = components;

    // ── Step 1: Gross salary ────────────────────────────────────────────────
    const totalOtherAllowances = Object.values(otherAllowances).reduce(
      (sum, v) => sum + v,
      0
    );
    const totalAllowances =
      houseRentAllowance +
      medicalAllowance +
      conveyanceAllowance +
      totalOtherAllowances;
    const grossSalary = basicSalary + totalAllowances;

    // ── Step 2: Taxable income (monthly) ───────────────────────────────────
    // HRA exemption: min(actual HRA, 45% of basic)
    const hraExemption = Math.min(houseRentAllowance, basicSalary * 0.45);
    // Medical exemption: min(actual medical, 10% of basic)
    const medicalExemption = Math.min(medicalAllowance, basicSalary * 0.1);
    // Conveyance: fully taxable (no statutory exemption for non-transport employees)
    const monthlyTaxableIncome =
      grossSalary - hraExemption - medicalExemption;

    // ── Step 3: Annual tax via FBR slabs ───────────────────────────────────
    const annualTaxableIncome = monthlyTaxableIncome * 12;
    const { annualTax, slab } = computeAnnualIncomeTax(annualTaxableIncome);
    const monthlyIncomeTax = Math.round(annualTax / 12);

    // ── Step 4: EOBI contributions ─────────────────────────────────────────
    // Employee: 1% of basic, minimum PKR 370/month
    const eobiEmployee = Math.max(Math.round(basicSalary * 0.01), 370);
    // Employer: 5% of basic (informational — not deducted from employee net)
    const eobiEmployer = Math.round(basicSalary * 0.05);
    // PESSI/SESSI employer: 6% of basic (informational)
    const pessiEmployer = Math.round(basicSalary * 0.06);

    // ── Step 5: Total deductions & net salary ──────────────────────────────
    const totalOtherDeductions = Object.values(otherDeductions).reduce(
      (sum, v) => sum + v,
      0
    );
    const totalDeductions =
      monthlyIncomeTax + eobiEmployee + loanDeduction + totalOtherDeductions;
    const netSalary = Math.max(0, grossSalary - totalDeductions);

    const effectiveTaxRate =
      grossSalary > 0
        ? Math.round((monthlyIncomeTax / grossSalary) * 10000) / 100
        : 0;

    return {
      basicSalary,
      houseRentAllowance,
      medicalAllowance,
      conveyanceAllowance,
      otherAllowances,
      totalAllowances,
      grossSalary,
      incomeTax: monthlyIncomeTax,
      eobiEmployee,
      eobiEmployer,
      pessiEmployer,
      loanDeduction,
      otherDeductions,
      totalDeductions,
      netSalary,
      taxableIncome: monthlyTaxableIncome,
      annualTaxableIncome,
      appliedTaxSlab: slab.label,
      effectiveTaxRate,
    };
  }

  // ── Write operations ─────────────────────────────────────────────────────────

  /**
   * Create a payroll payment for a staff member.
   * The operation is performed inside a DB transaction for the payment row.
   * After the transaction commits, an expense entry is posted to the unified
   * ledger using the payment's effective date (supports backdating).
   */
  async createPayroll(
    data: InsertSalaryPayment & {
      ledgerDescription?: string;
      /** Override the ledger transaction date for backdated payroll entries. */
      effectiveDate?: Date | string;
    }
  ) {
    // Step 1: Insert payroll row atomically
    const payment = await db.transaction(async (tx) => {
      const [newPayment] = await tx
        .insert(salaryPayments)
        .values(data)
        .returning();
      return newPayment;
    });

    // Step 2: Post to unified ledger (outside transaction to avoid rollbacks)
    // Pass effectiveDate so backdated payroll entries land in the correct period.
    try {
      await ledgerService.recordTransaction({
        effectiveDate: data.effectiveDate ?? data.paymentDate,
        entryType: "expense",
        category: "salary",
        amount: Number(data.netSalary ?? data.grossSalary),
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

  // ── Read operations ──────────────────────────────────────────────────────────

  /**
   * Fetch salary history for a staff member, optionally bounded by dates.
   *
   * Fixes the original implementation which incorrectly chained `.where()`
   * calls on a Drizzle query builder — each `.where()` call replaces the
   * previous one rather than ANDing conditions.  The corrected version builds
   * the condition array upfront and passes it to a single `.where(and(...))`.
   *
   * @param staffId  - Staff member primary key.
   * @param fromDate - Inclusive lower bound on `effectiveDate` / `paymentDate`.
   * @param toDate   - Inclusive upper bound on `effectiveDate` / `paymentDate`.
   * @returns        Array of `SalaryPayment` rows, newest first.
   */
  async getSalaryHistory(
    staffId: number,
    fromDate?: Date,
    toDate?: Date
  ): Promise<SalaryPayment[]> {
    const conditions = [eq(salaryPayments.staffId, staffId)];

    if (fromDate) {
      // paymentMonth is a DATE column stored as YYYY-MM-DD
      conditions.push(
        gte(salaryPayments.paymentMonth, fromDate.toISOString().slice(0, 10))
      );
    }
    if (toDate) {
      conditions.push(
        lte(salaryPayments.paymentMonth, toDate.toISOString().slice(0, 10))
      );
    }

    return db
      .select()
      .from(salaryPayments)
      .where(and(...conditions))
      .orderBy(desc(salaryPayments.paymentMonth));
  }

  /**
   * Fetch salary history enriched with the corresponding ledger entries.
   * This is the primary data source for the Salary History UI section.
   *
   * @param staffId  - Staff member primary key.
   * @param fromDate - Optional inclusive start date filter.
   * @param toDate   - Optional inclusive end date filter.
   * @returns        Array of `SalaryHistoryEntry` (payment + ledger entries).
   */
  async getSalaryHistoryWithLedger(
    staffId: number,
    fromDate?: Date,
    toDate?: Date
  ): Promise<SalaryHistoryEntry[]> {
    const payments = await this.getSalaryHistory(staffId, fromDate, toDate);

    const enriched = await Promise.all(
      payments.map(async (payment) => {
        const ledgerEntries = await db
          .select({
            id: ledger.id,
            transactionDate: ledger.transactionDate,
            amount: ledger.amount,
            description: ledger.description,
            entryType: ledger.entryType,
            category: ledger.category,
          })
          .from(ledger)
          .where(
            and(
              eq(ledger.referenceType, "salary_payment"),
              eq(ledger.referenceId, payment.id)
            )
          )
          .orderBy(desc(ledger.transactionDate));

        return { ...payment, ledgerEntries };
      })
    );

    return enriched;
  }

  // ── Reconciliation helpers ───────────────────────────────────────────────────

  /**
   * Finds all salary payment records that do NOT have a corresponding ledger
   * entry.  Used by the reconciliation cron job to detect missing postings.
   *
   * @returns Array of unreconciled `SalaryPayment` rows.
   */
  async findUnreconciledPayments(): Promise<SalaryPayment[]> {
    // LEFT JOIN salary_payments → ledger on referenceType + referenceId,
    // return rows where no ledger entry exists.
    const rows = await db
      .select({ payment: salaryPayments })
      .from(salaryPayments)
      .leftJoin(
        ledger,
        and(
          eq(ledger.referenceType, "salary_payment"),
          eq(ledger.referenceId, salaryPayments.id)
        )
      )
      .where(isNull(ledger.id));

    return rows.map((r) => r.payment);
  }

  /**
   * Posts a missing ledger entry for a salary payment that was previously
   * unreconciled.  Called by the reconciliation cron job.
   *
   * @param payment - The unreconciled `SalaryPayment` row.
   * @returns       The newly created ledger row.
   */
  async postMissingLedgerEntry(payment: SalaryPayment) {
    return ledgerService.recordTransaction({
      // Use the original payment date so the ledger entry lands in the
      // correct accounting period rather than the reconciliation run date.
      effectiveDate: payment.paymentDate,
      entryType: "expense",
      category: "salary",
      amount: Number(payment.netSalary),
      description: `[Reconciled] Salary disbursement – staff #${payment.staffId}, month: ${payment.paymentMonth}`,
      referenceType: "salary_payment",
      referenceId: payment.id,
      sourceModule: "payroll",
      createdBy: payment.processedBy ?? undefined,
    });
  }

  // Placeholder for future payroll configuration storage – can be expanded later.
  async storePayrollConfig(_config: Record<string, unknown>) {
    // Implementation would upsert into a payroll_config table.
    return;
  }
}

// Export a singleton instance like other services
export const payrollService = new PayrollService();
