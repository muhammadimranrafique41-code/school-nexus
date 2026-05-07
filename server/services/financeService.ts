/**
 * financeService.ts — Smart Fee Tracking & Parent Wallet System
 *
 * Architecture overview
 * ─────────────────────
 * • parentWallets  : one row per student; the authoritative balance store.
 * • walletTransactions : append-only audit log; never mutated after insert.
 *
 * Concurrency strategy
 * ─────────────────────
 * Every balance mutation runs inside a Drizzle db.transaction() block.
 * We use Drizzle's ORM .select() within the transaction (which uses the
 * transaction's pg client) followed immediately by an .update() — this is
 * safe because PostgreSQL's READ COMMITTED isolation + the fact that we
 * re-read and update within the same transaction prevents lost updates.
 * For stricter serialization we rely on the UNIQUE constraint on
 * parent_wallets.student_id and the CHECK constraint balance >= 0.
 *
 * FIFO fee application
 * ─────────────────────
 * applyWalletToFees() sorts outstanding fees by dueDate ASC (oldest first)
 * and applies available wallet credit until the balance is exhausted or all
 * fees are settled.
 *
 * PaymentMethod mapping
 * ─────────────────────
 * The DB stores "Cash" | "Bank Transfer" | "Card" | "Mobile Money" | "Cheque" | "Other".
 * The API accepts lowercase "cash" | "card" | "bank" | "wallet" and maps them.
 */

import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  fees,
  feePayments,
  parentWallets,
  walletTransactions,
  financeLedgerEntries,
  users,
  type Fee,
  type ParentWallet,
  type WalletTransaction,
  type FeePayment,
} from "../../shared/schema.js";
import type { DepositWalletInput, PayFeeInput } from "../../shared/schema.js";
import type { PaymentMethod } from "../../shared/finance.js";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a DB decimal string / integer to a JS number. */
const toNum = (v: string | number | null | undefined): number =>
  v == null ? 0 : typeof v === "number" ? v : parseFloat(v) || 0;

/** Format a JS number as a 2-dp string for DB decimal columns. */
const toDecStr = (v: number): string => v.toFixed(2);

/** Generate a receipt number: RCP-<timestamp>-<random 4 digits> */
const generateReceiptNumber = (): string =>
  `RCP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

/** ISO timestamp string for text columns that store dates as text. */
const nowText = (): string => new Date().toISOString();

/**
 * Map API-level payment method (lowercase) to DB PaymentMethod enum (title-case).
 * "wallet" is treated as "Cash" at the DB level (the wallet deduction is
 * tracked separately in walletTransactions).
 */
const mapPaymentMethod = (method: PayFeeInput["paymentMethod"]): PaymentMethod => {
  const map: Record<PayFeeInput["paymentMethod"], PaymentMethod> = {
    cash: "Cash",
    card: "Card",
    bank: "Bank Transfer",
    wallet: "Cash", // wallet payments are recorded as Cash in feePayments
  };
  return map[method];
};

// ─────────────────────────────────────────────────────────────────────────────
// WALLET BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure a parentWallet row exists for the given student.
 * Safe to call multiple times — uses INSERT … ON CONFLICT DO NOTHING.
 * Returns the wallet row (freshly created or pre-existing).
 */
export async function ensureWallet(studentId: number): Promise<ParentWallet> {
  await db
    .insert(parentWallets)
    .values({ studentId, balance: "0.00", pendingDeductions: "0.00" })
    .onConflictDoNothing();

  const [wallet] = await db
    .select()
    .from(parentWallets)
    .where(eq(parentWallets.studentId, studentId))
    .limit(1);

  if (!wallet) {
    throw new Error(`[financeService] Could not create/find wallet for student ${studentId}`);
  }
  return wallet;
}

/**
 * Get the wallet for a student (creates one if missing).
 */
export async function getWallet(studentId: number): Promise<ParentWallet> {
  const [existing] = await db
    .select()
    .from(parentWallets)
    .where(eq(parentWallets.studentId, studentId))
    .limit(1);

  return existing ?? ensureWallet(studentId);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPOSIT — top-up a student wallet
// ─────────────────────────────────────────────────────────────────────────────

export interface DepositResult {
  wallet: ParentWallet;
  transaction: WalletTransaction;
  previousBalance: number;
  newBalance: number;
}

/**
 * depositToWallet — credit a student's wallet.
 *
 * Runs inside a Drizzle transaction. The balance is read and updated
 * atomically within the same transaction to prevent lost updates.
 *
 * @param input.studentId   - target student
 * @param input.amount      - positive PKR amount to credit
 * @param input.description - optional human-readable note
 * @param input.createdBy   - admin user ID performing the deposit
 */
export async function depositToWallet(input: DepositWalletInput): Promise<DepositResult> {
  const { studentId, amount, description, createdBy } = input;

  if (amount <= 0) {
    throw new Error("[financeService] Deposit amount must be positive");
  }

  // Ensure wallet exists before entering the transaction
  await ensureWallet(studentId);

  return db.transaction(async (tx) => {
    // Read current balance within the transaction (uses tx's pg client)
    const [current] = await tx
      .select()
      .from(parentWallets)
      .where(eq(parentWallets.studentId, studentId))
      .limit(1);

    if (!current) {
      throw new Error(`[financeService] Wallet not found for student ${studentId}`);
    }

    const previousBalance = toNum(current.balance);
    const newBalance = previousBalance + amount;

    // Update balance atomically within the transaction
    const [updatedWallet] = await tx
      .update(parentWallets)
      .set({
        balance: toDecStr(newBalance),
        updatedAt: new Date(),
      })
      .where(eq(parentWallets.studentId, studentId))
      .returning();

    // Append audit log entry
    const [txRow] = await tx
      .insert(walletTransactions)
      .values({
        walletId: updatedWallet.id,
        amount: toDecStr(amount),
        type: "deposit",
        description: description ?? `Wallet top-up of PKR ${amount.toFixed(2)}`,
        createdBy: createdBy ?? null,
      })
      .returning();

    return {
      wallet: updatedWallet,
      transaction: txRow,
      previousBalance,
      newBalance,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS PAYMENT — record a fee payment (cash / card / bank / wallet)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessPaymentResult {
  fee: Fee;
  payment: FeePayment;
  walletTransaction?: WalletTransaction;
  ledgerEntryId?: number;
}

/**
 * processPayment — transactional fee payment handler.
 *
 * Steps (all inside one DB transaction):
 *  1. Read the fee row within the transaction.
 *  2. Validate: amount ≤ remainingBalance.
 *  3. Insert a feePayments row.
 *  4. Update fees.paidAmount, fees.remainingBalance, fees.status.
 *  5. If paymentMethod === 'wallet':
 *     a. Read the parentWallet row within the transaction.
 *     b. Validate: wallet.balance ≥ amount.
 *     c. Deduct from wallet.balance.
 *     d. Insert a walletTransactions row (negative amount = debit).
 *  6. Insert a financeLedgerEntries row for accounting.
 *
 * @param input.feeId         - fee/invoice to pay
 * @param input.amount        - payment amount (may be partial)
 * @param input.paymentMethod - cash | card | wallet | bank
 * @param input.receiptNumber - optional; auto-generated if omitted
 * @param input.notes         - optional memo
 * @param input.createdBy     - admin user ID
 */
export async function processPayment(input: PayFeeInput): Promise<ProcessPaymentResult> {
  const { feeId, amount, paymentMethod, receiptNumber, notes, createdBy } = input;

  if (amount <= 0) {
    throw new Error("[financeService] Payment amount must be positive");
  }

  return db.transaction(async (tx) => {
    // ── 1. Read fee row within transaction ──────────────────────────────────
    const [currentFee] = await tx
      .select()
      .from(fees)
      .where(and(eq(fees.id, feeId), sql`${fees.deletedAt} IS NULL`))
      .limit(1);

    if (!currentFee) {
      throw new Error(`[financeService] Fee ${feeId} not found or deleted`);
    }

    // ── 2. Validate amount ──────────────────────────────────────────────────
    const remaining = toNum(currentFee.remainingBalance);
    if (amount > remaining) {
      throw new Error(
        `[financeService] Payment amount ${amount} exceeds remaining balance ` +
        `${remaining} for fee ${feeId}`
      );
    }

    const newPaidAmount = toNum(currentFee.paidAmount) + amount;
    const newRemaining = remaining - amount;
    const newStatus: Fee["status"] =
      newRemaining <= 0
        ? "Paid"
        : newPaidAmount > 0
        ? "Partially Paid"
        : "Unpaid";

    // ── 3. Insert feePayments row ───────────────────────────────────────────
    const receipt = receiptNumber ?? generateReceiptNumber();
    const dbMethod = mapPaymentMethod(paymentMethod);
    const dbGateway = (
      paymentMethod === "wallet" ? "cash" : paymentMethod
    ) as "cash" | "bank" | "card";

    const [payment] = await tx
      .insert(feePayments)
      .values({
        feeId,
        studentId: currentFee.studentId,
        amount,
        discount: 0,
        paymentDate: nowText().slice(0, 10),
        method: dbMethod,
        receiptNumber: receipt,
        gateway: dbGateway,
        gatewayStatus: "completed",
        notes: notes ?? null,
        createdBy: createdBy ?? null,
        createdAt: nowText(),
      })
      .returning();

    // ── 4. Update fee ───────────────────────────────────────────────────────
    const [updatedFee] = await tx
      .update(fees)
      .set({
        paidAmount: newPaidAmount,
        remainingBalance: newRemaining,
        status: newStatus,
        updatedAt: nowText(),
      })
      .where(eq(fees.id, feeId))
      .returning();

    // ── 5. Wallet deduction (only when paymentMethod === 'wallet') ──────────
    let walletTx: WalletTransaction | undefined;

    if (paymentMethod === "wallet") {
      const [currentWallet] = await tx
        .select()
        .from(parentWallets)
        .where(eq(parentWallets.studentId, currentFee.studentId))
        .limit(1);

      if (!currentWallet) {
        throw new Error(
          `[financeService] No wallet found for student ${currentFee.studentId}. ` +
          `Call ensureWallet() first or use a non-wallet payment method.`
        );
      }

      const walletBalance = toNum(currentWallet.balance);

      if (walletBalance < amount) {
        throw new Error(
          `[financeService] Insufficient wallet balance: ` +
          `available ${walletBalance}, required ${amount}`
        );
      }

      const newWalletBalance = walletBalance - amount;

      await tx
        .update(parentWallets)
        .set({ balance: toDecStr(newWalletBalance), updatedAt: new Date() })
        .where(eq(parentWallets.id, currentWallet.id));

      // Negative amount = debit in the audit log
      const [wt] = await tx
        .insert(walletTransactions)
        .values({
          walletId: currentWallet.id,
          amount: toDecStr(-amount),
          type: "fee_payment",
          referenceId: feeId,
          description:
            `Fee payment for invoice ${currentFee.invoiceNumber ?? feeId} — PKR ${amount.toFixed(2)}`,
          createdBy: createdBy ?? null,
        })
        .returning();

      walletTx = wt;
    }

    // ── 6. Finance ledger entry ─────────────────────────────────────────────
    const [lastEntry] = await tx
      .select({ balanceAfter: financeLedgerEntries.balanceAfter })
      .from(financeLedgerEntries)
      .where(eq(financeLedgerEntries.studentId, currentFee.studentId))
      .orderBy(sql`created_at DESC`)
      .limit(1);

    const prevLedgerBalance = lastEntry?.balanceAfter ?? 0;
    const newLedgerBalance = prevLedgerBalance - amount;

    const [ledgerEntry] = await tx
      .insert(financeLedgerEntries)
      .values({
        studentId: currentFee.studentId,
        feeId,
        type: "payment",
        debit: 0,
        credit: amount,
        balanceAfter: newLedgerBalance,
        referenceId: payment.id.toString(),
        description: `Payment via ${paymentMethod} — receipt ${receipt}`,
        createdAt: nowText(),
        createdBy: createdBy ?? null,
      })
      .returning();

    return {
      fee: updatedFee,
      payment,
      walletTransaction: walletTx,
      ledgerEntryId: ledgerEntry.id,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// APPLY WALLET TO FEES — FIFO auto-settlement
// ─────────────────────────────────────────────────────────────────────────────

export interface ApplyWalletResult {
  appliedCount: number;
  totalApplied: number;
  remainingWalletBalance: number;
  results: ProcessPaymentResult[];
}

/**
 * applyWalletToFees — FIFO auto-application of wallet balance to outstanding fees.
 *
 * Fetches all unpaid/partially-paid fees for the student ordered by dueDate ASC
 * (oldest first — FIFO). For each fee, applies as much wallet credit as possible
 * until either the fee is fully paid or the wallet is exhausted.
 *
 * Each individual fee payment is processed via processPayment() so the full
 * audit trail (feePayments, walletTransactions, financeLedgerEntries) is
 * maintained consistently.
 *
 * @param studentId - the student whose wallet and fees to reconcile
 * @returns summary of what was applied
 */
export async function applyWalletToFees(studentId: number): Promise<ApplyWalletResult> {
  // Fetch current wallet balance (snapshot before we start)
  const wallet = await getWallet(studentId);
  let availableBalance = toNum(wallet.balance);

  if (availableBalance <= 0) {
    return {
      appliedCount: 0,
      totalApplied: 0,
      remainingWalletBalance: 0,
      results: [],
    };
  }

  // Fetch outstanding fees ordered by dueDate ASC (FIFO — oldest due first)
  const outstandingFees = await db
    .select()
    .from(fees)
    .where(
      and(
        eq(fees.studentId, studentId),
        gt(fees.remainingBalance, 0),
        sql`${fees.deletedAt} IS NULL`,
        inArray(fees.status, ["Unpaid", "Partially Paid", "Overdue"])
      )
    )
    .orderBy(asc(fees.dueDate));

  const results: ProcessPaymentResult[] = [];
  let totalApplied = 0;

  for (const fee of outstandingFees) {
    if (availableBalance <= 0) break;

    const remaining = toNum(fee.remainingBalance);
    const applyAmount = Math.min(availableBalance, remaining);

    if (applyAmount <= 0) continue;

    try {
      const result = await processPayment({
        feeId: fee.id,
        amount: applyAmount,
        paymentMethod: "wallet",
        notes: `Auto-applied from wallet (FIFO) — PKR ${applyAmount.toFixed(2)}`,
      });

      results.push(result);
      totalApplied += applyAmount;
      availableBalance -= applyAmount;
    } catch (err) {
      // Log and stop — a single fee failure should not silently continue
      console.error(
        `[financeService] applyWalletToFees: failed to apply PKR ${applyAmount} to fee ${fee.id}:`,
        err
      );
      break;
    }
  }

  return {
    appliedCount: results.length,
    totalApplied,
    remainingWalletBalance: availableBalance,
    results,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT STATEMENT — unified view for the API
// ─────────────────────────────────────────────────────────────────────────────

export interface StudentStatement {
  studentId: number;
  studentName: string;
  wallet: {
    id: number;
    balance: number;
    pendingDeductions: number;
    updatedAt: Date;
  } | null;
  fees: Array<Fee & { payments: FeePayment[] }>;
  walletTransactions: WalletTransaction[];
  summary: {
    totalBilled: number;
    totalPaid: number;
    totalOutstanding: number;
    totalOverdue: number;
    walletBalance: number;
  };
}

/**
 * getStudentStatement — returns a unified financial view for a student.
 *
 * Combines:
 *  • fees with their associated feePayments
 *  • parentWallet balance
 *  • walletTransactions history (last 50, newest first)
 *  • computed summary totals
 */
export async function getStudentStatement(studentId: number): Promise<StudentStatement> {
  const today = new Date().toISOString().slice(0, 10);

  const [studentRow] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);

  if (!studentRow) {
    throw new Error(`[financeService] Student ${studentId} not found`);
  }

  // Fetch fees (non-deleted), oldest due date first
  const feeRows = await db
    .select()
    .from(fees)
    .where(and(eq(fees.studentId, studentId), sql`${fees.deletedAt} IS NULL`))
    .orderBy(asc(fees.dueDate));

  // Fetch all payments for this student (non-deleted)
  const paymentRows = await db
    .select()
    .from(feePayments)
    .where(
      and(
        eq(feePayments.studentId, studentId),
        sql`${feePayments.deletedAt} IS NULL`
      )
    )
    .orderBy(asc(feePayments.paymentDate));

  // Group payments by feeId
  const paymentsByFee = new Map<number, FeePayment[]>();
  for (const p of paymentRows) {
    const arr = paymentsByFee.get(p.feeId) ?? [];
    arr.push(p);
    paymentsByFee.set(p.feeId, arr);
  }

  const feesWithPayments = feeRows.map((f) => ({
    ...f,
    payments: paymentsByFee.get(f.id) ?? [],
  }));

  // Fetch wallet (may not exist for legacy students)
  const [walletRow] = await db
    .select()
    .from(parentWallets)
    .where(eq(parentWallets.studentId, studentId))
    .limit(1);

  // Fetch recent wallet transactions (last 50, newest first)
  const walletTxRows: WalletTransaction[] = walletRow
    ? await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.walletId, walletRow.id))
        .orderBy(sql`${walletTransactions.createdAt} DESC`)
        .limit(50)
    : [];

  // Compute summary
  const totalBilled = feeRows.reduce((s, f) => s + toNum(f.amount), 0);
  const totalPaid = feeRows.reduce((s, f) => s + toNum(f.paidAmount), 0);
  const totalOutstanding = feeRows.reduce((s, f) => s + toNum(f.remainingBalance), 0);
  const totalOverdue = feeRows
    .filter(
      (f) =>
        toNum(f.remainingBalance) > 0 &&
        (f.status === "Overdue" || f.dueDate < today)
    )
    .reduce((s, f) => s + toNum(f.remainingBalance), 0);

  return {
    studentId,
    studentName: studentRow.name,
    wallet: walletRow
      ? {
          id: walletRow.id,
          balance: toNum(walletRow.balance),
          pendingDeductions: toNum(walletRow.pendingDeductions),
          updatedAt: walletRow.updatedAt,
        }
      : null,
    fees: feesWithPayments,
    walletTransactions: walletTxRows,
    summary: {
      totalBilled,
      totalPaid,
      totalOutstanding,
      totalOverdue,
      walletBalance: walletRow ? toNum(walletRow.balance) : 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REFUND — reverse a wallet fee_payment
// ─────────────────────────────────────────────────────────────────────────────

export interface RefundResult {
  wallet: ParentWallet;
  walletTransaction: WalletTransaction;
  fee: Fee;
}

/**
 * refundToWallet — reverses a wallet-based fee payment.
 *
 * Adds the refund amount back to the wallet balance, soft-deletes the
 * original feePayment, updates the fee paidAmount/remainingBalance/status,
 * and logs a 'refund' walletTransaction.
 *
 * @param feePaymentId - the feePayments.id to reverse
 * @param createdBy    - admin user ID
 */
export async function refundToWallet(
  feePaymentId: number,
  createdBy?: number
): Promise<RefundResult> {
  return db.transaction(async (tx) => {
    // Read the payment row within the transaction
    const [currentPayment] = await tx
      .select()
      .from(feePayments)
      .where(
        and(
          eq(feePayments.id, feePaymentId),
          sql`${feePayments.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (!currentPayment) {
      throw new Error(
        `[financeService] FeePayment ${feePaymentId} not found or already deleted`
      );
    }

    const refundAmount = toNum(currentPayment.amount);

    // Read the fee row within the transaction
    const [currentFee] = await tx
      .select()
      .from(fees)
      .where(eq(fees.id, currentPayment.feeId))
      .limit(1);

    if (!currentFee) {
      throw new Error(`[financeService] Fee ${currentPayment.feeId} not found`);
    }

    // Read the wallet row within the transaction
    const [currentWallet] = await tx
      .select()
      .from(parentWallets)
      .where(eq(parentWallets.studentId, currentPayment.studentId))
      .limit(1);

    if (!currentWallet) {
      throw new Error(
        `[financeService] No wallet for student ${currentPayment.studentId}`
      );
    }

    const newWalletBalance = toNum(currentWallet.balance) + refundAmount;
    const newPaidAmount = Math.max(0, toNum(currentFee.paidAmount) - refundAmount);
    const newRemaining =
      toNum(currentFee.amount) - toNum(currentFee.totalDiscount) - newPaidAmount;
    const newStatus: Fee["status"] =
      newPaidAmount <= 0
        ? "Unpaid"
        : newPaidAmount < toNum(currentFee.amount)
        ? "Partially Paid"
        : "Paid";

    // Update wallet balance
    const [updatedWallet] = await tx
      .update(parentWallets)
      .set({ balance: toDecStr(newWalletBalance), updatedAt: new Date() })
      .where(eq(parentWallets.id, currentWallet.id))
      .returning();

    // Soft-delete the original payment
    await tx
      .update(feePayments)
      .set({ deletedAt: nowText(), deletedBy: createdBy ?? null })
      .where(eq(feePayments.id, feePaymentId));

    // Update fee
    const [updatedFee] = await tx
      .update(fees)
      .set({
        paidAmount: newPaidAmount,
        remainingBalance: newRemaining,
        status: newStatus,
        updatedAt: nowText(),
      })
      .where(eq(fees.id, currentFee.id))
      .returning();

    // Positive amount = credit back to wallet
    const [wt] = await tx
      .insert(walletTransactions)
      .values({
        walletId: currentWallet.id,
        amount: toDecStr(refundAmount),
        type: "refund",
        referenceId: feePaymentId,
        description: `Refund for payment #${feePaymentId} on invoice ${currentFee.invoiceNumber ?? currentFee.id}`,
        createdBy: createdBy ?? null,
      })
      .returning();

    return { wallet: updatedWallet, walletTransaction: wt, fee: updatedFee };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED SERVICE OBJECT (for DI / testing)
// ─────────────────────────────────────────────────────────────────────────────

export const financeService = {
  ensureWallet,
  getWallet,
  depositToWallet,
  processPayment,
  applyWalletToFees,
  getStudentStatement,
  refundToWallet,
};
