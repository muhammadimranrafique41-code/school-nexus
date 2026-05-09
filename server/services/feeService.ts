/**
 * @module FeeService
 * @description
 * Business-logic layer for student fee and invoice operations.
 *
 * Responsibilities:
 *  - CRUD operations for fee invoices (delegated to the storage layer).
 *  - Payment recording with automatic ledger posting via `LedgerService`.
 *  - Overdue / outstanding balance calculations.
 *
 * Integration contract:
 *  Every confirmed fee payment MUST produce a corresponding `ledger` row
 *  (entry_type = 'income', category = 'fee') so that the unified cash-flow
 *  register remains the single source of truth.  The ledger post is performed
 *  inside `recordPayment` immediately after the storage layer confirms the
 *  payment; if the ledger insert fails the error is logged but does NOT roll
 *  back the payment (the payment is the authoritative record; the ledger post
 *  can be reconciled later via the `LedgerService.hasEntry` helper).
 */

import { storage } from "../storage.ts";
import type { CreateFeeInput, FeeStatus, UpdateFeeInput, RecordFeePaymentInput } from "../../shared/finance.js";
import type { FeeWithStudent } from "../../shared/schema.js";
import { ledgerService } from "./ledgerService.js";

export class FeeService {
  /**
   * Returns all fee invoices across all students.
   */
  async getAllFees(): Promise<FeeWithStudent[]> {
    return storage.getFees();
  }

  /**
   * Returns all fee invoices for a specific student.
   *
   * @param studentId - User ID of the student.
   */
  async getFeesByStudent(studentId: number): Promise<FeeWithStudent[]> {
    return storage.getFeesByStudent(studentId);
  }

  /**
   * Returns a single fee invoice by its primary key.
   *
   * @param feeId - Fee invoice ID.
   */
  async getFeeById(feeId: number): Promise<FeeWithStudent | undefined> {
    return storage.getFee(feeId);
  }

  /**
   * Creates a new fee invoice.
   *
   * Business rules enforced by the storage layer:
   *  - Student must exist with role `'student'`.
   *  - `amount` must be positive.
   *  - `dueDate` must be a valid ISO date string.
   *  - Invoice number is auto-generated.
   *
   * @param input - Validated fee creation payload.
   */
  async createFee(input: CreateFeeInput): Promise<FeeWithStudent> {
    return storage.createFee(input);
  }

  /**
   * Updates an existing fee invoice.
   *
   * Business rules enforced by the storage layer:
   *  - Cannot reduce `amount` below the already-paid amount.
   *  - Student existence is re-validated on update.
   *
   * @param feeId   - Fee invoice ID to update.
   * @param updates - Partial update payload.
   */
  async updateFee(feeId: number, updates: UpdateFeeInput): Promise<FeeWithStudent | undefined> {
    return storage.updateFee(feeId, updates);
  }

  /**
   * Permanently deletes a fee invoice.
   *
   * @param feeId - Fee invoice ID to delete.
   * @returns `true` if the row was deleted; `false` if not found.
   *
   * @remarks
   * Consider soft-deletes in future iterations to preserve the audit trail.
   */
  async deleteFee(feeId: number): Promise<boolean> {
    return storage.deleteFee(feeId);
  }

  /**
   * Records a fee payment and posts the corresponding income entry to the
   * unified ledger.
   *
   * Flow:
   *  1. Delegate to `storage.recordFeePayment` — this persists the payment
   *     row, updates the fee's `paidAmount` / `remainingBalance`, and
   *     transitions the fee status (Unpaid → Partially Paid → Paid).
   *  2. On success, call `ledgerService.recordTransaction` with:
   *       - `entryType`     = `'income'`
   *       - `category`      = `'fee'`
   *       - `referenceType` = `'fee_payment'`
   *       - `referenceId`   = the new payment's ID (idempotency key)
   *  3. If the ledger post throws, the error is logged to `console.error`
   *     but the payment result is still returned to the caller.  This
   *     "best-effort" strategy ensures that a transient DB hiccup on the
   *     ledger side does not surface as a payment failure to the end user.
   *     Operators can detect and repair missing ledger rows using
   *     `LedgerService.hasEntry('fee_payment', paymentId)`.
   *
   * @param feeId      - Fee invoice ID being paid against.
   * @param payment    - Payment details (amount, method, receipt number, etc.).
   * @param recordedBy - User ID of the operator recording the payment.
   * @returns          The updated fee invoice with the new payment attached,
   *                   or `undefined` if the fee was not found.
   */
  async recordPayment(
    feeId: number,
    payment: RecordFeePaymentInput,
    recordedBy?: number
  ): Promise<FeeWithStudent | undefined> {
    // ── Step 1: Persist the payment in the domain table ───────────────────
    const updatedFee = await storage.recordFeePayment(feeId, payment, recordedBy);

    if (!updatedFee) {
      // Fee not found — nothing to post to the ledger.
      return undefined;
    }

    // ── Step 2: Derive the newly created payment ID for idempotency ───────
    // `storage.recordFeePayment` returns the updated fee with its payments
    // array.  The most-recent payment (last in the array) is the one just
    // created.
    const latestPayment = updatedFee.payments?.at(-1);

    // ── Step 3: Post income entry to the unified ledger ───────────────────
    try {
      await ledgerService.recordTransaction({
        entryType: "income",
        category: "fee",
        amount: payment.amount,
        description: [
          `Fee payment`,
          updatedFee.student?.name ? `for ${updatedFee.student.name}` : null,
          updatedFee.billingMonth ? `(${updatedFee.billingMonth})` : null,
          payment.reference ? `— receipt ${payment.reference}` : null,
        ]
          .filter(Boolean)
          .join(" "),
        referenceType: "fee_payment",
        // Use the payment ID as the idempotency key when available.
        referenceId: latestPayment?.id ?? feeId,
        sourceModule: "fees",
        createdBy: recordedBy,
      });
    } catch (ledgerErr) {
      // Non-fatal: log for reconciliation but do not surface to the caller.
      console.error(
        `[FeeService] Ledger post failed for fee_payment on fee #${feeId}:`,
        ledgerErr
      );
    }

    return updatedFee;
  }

  /**
   * Checks whether a fee invoice is currently overdue.
   *
   * A fee is overdue when its due date has passed and it still carries a
   * positive remaining balance.
   *
   * @param feeId - Fee invoice ID.
   * @returns `true` if overdue; `false` if paid or not yet due.
   */
  async isOverdue(feeId: number): Promise<boolean> {
    const fee = await this.getFeeById(feeId);
    if (!fee) return false;

    const dueDate = new Date(fee.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return fee.remainingBalance > 0 && dueDate < today;
  }

  /**
   * Calculates the total outstanding (unpaid) balance for a student across
   * all their fee invoices.
   *
   * @param studentId - User ID of the student.
   */
  async calculateStudentOutstanding(studentId: number): Promise<number> {
    const fees = await this.getFeesByStudent(studentId);
    return fees.reduce((sum, fee) => sum + fee.remainingBalance, 0);
  }

  /**
   * Calculates the total overdue balance for a student — i.e. the sum of
   * remaining balances on invoices whose due date has already passed.
   *
   * @param studentId - User ID of the student.
   */
  async calculateStudentOverdue(studentId: number): Promise<number> {
    const fees = await this.getFeesByStudent(studentId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return fees.reduce((sum, fee) => {
      const dueDate = new Date(fee.dueDate);
      return dueDate < today && fee.remainingBalance > 0
        ? sum + fee.remainingBalance
        : sum;
    }, 0);
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const feeService = new FeeService();
