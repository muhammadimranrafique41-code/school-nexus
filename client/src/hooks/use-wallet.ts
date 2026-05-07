/**
 * use-wallet.ts — TanStack Query hooks for the Parent Wallet system.
 *
 * Endpoints consumed:
 *   GET  /api/finance/wallet/:studentId        → wallet balance row
 *   GET  /api/finance/student-statement/:id    → unified statement
 *   POST /api/finance/deposit                  → top-up wallet
 *   POST /api/finance/pay-fee                  → process fee payment
 *   POST /api/finance/apply-wallet/:studentId  → FIFO auto-settle
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "./use-auth";
import { getResponseErrorMessage } from "@/lib/utils";
import { api } from "@shared/routes";

// ── Retry helpers (mirrors use-fees.ts) ───────────────────────────────────────

function shouldRetry(failureCount: number, error: unknown, maxRetries = 3): boolean {
  if (failureCount >= maxRetries) return false;
  const message = error instanceof Error ? error.message : String(error);
  if (/\b4\d{2}\b/.test(message)) return false;
  return true;
}

function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

// ── Query key constants ────────────────────────────────────────────────────────

export const WALLET_QUERY_KEYS = {
  wallet: (studentId: number) => ["/api/finance/wallet", studentId] as const,
  statement: (studentId: number) => ["/api/finance/student-statement", studentId] as const,
} as const;

// ── Cache invalidation helper ─────────────────────────────────────────────────

export function invalidateWalletQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  studentId?: number
) {
  if (studentId) {
    queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.wallet(studentId) });
    queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.statement(studentId) });
  } else {
    queryClient.invalidateQueries({ queryKey: ["/api/finance/wallet"] });
    queryClient.invalidateQueries({ queryKey: ["/api/finance/student-statement"] });
  }
  // Also invalidate fee queries so the fee list reflects updated statuses
  queryClient.invalidateQueries({ queryKey: [api.fees.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.fees.balances.summary.path] });
  queryClient.invalidateQueries({ queryKey: [api.fees.balances.overdue.path] });
  queryClient.invalidateQueries({ queryKey: [api.fees.balances.student.path] });
  queryClient.invalidateQueries({ queryKey: [api.dashboard.adminStats.path] });
  queryClient.invalidateQueries({ queryKey: [api.dashboard.studentStats.path] });
}

// ── TypeScript shapes (inferred from server responses) ────────────────────────

export interface WalletRow {
  id: number;
  studentId: number;
  balance: string | number;
  pendingDeductions: string | number;
  updatedAt: string;
}

export interface WalletTransactionRow {
  id: number;
  walletId: number;
  amount: string | number;
  type: "deposit" | "fee_payment" | "refund" | "adjustment";
  referenceId: number | null;
  description: string | null;
  createdBy: number | null;
  createdAt: string;
}

export interface StudentStatementFee {
  id: number;
  studentId: number;
  invoiceNumber: string | null;
  billingPeriod: string;
  feeType: string | null;
  amount: number | string;
  paidAmount: number | string;
  remainingBalance: number | string;
  status: string;
  dueDate: string;
  payments: Array<{
    id: number;
    feeId: number;
    amount: number | string;
    method: string;
    paymentDate: string;
    receiptNumber: string | null;
    notes: string | null;
  }>;
}

export interface StudentStatement {
  studentId: number;
  studentName: string;
  wallet: {
    id: number;
    balance: number;
    pendingDeductions: number;
    updatedAt: string;
  } | null;
  fees: StudentStatementFee[];
  walletTransactions: WalletTransactionRow[];
  summary: {
    totalBilled: number;
    totalPaid: number;
    totalOutstanding: number;
    totalOverdue: number;
    walletBalance: number;
  };
}

export interface DepositInput {
  studentId: number;
  amount: number;
  description?: string;
}

export interface PayFeeInput {
  feeId: number;
  amount: number;
  paymentMethod: "cash" | "card" | "wallet" | "bank";
  receiptNumber?: string;
  notes?: string;
}

export interface ApplyWalletResult {
  appliedCount: number;
  totalApplied: number;
  remainingWalletBalance: number;
}

// ── Query: wallet balance for a student ───────────────────────────────────────

/**
 * useStudentWallet — fetches the parentWallet row for a student.
 *
 * Students can view their own wallet; admins can view any student's wallet.
 * Pass `studentId` explicitly for admin views; omit to auto-resolve from
 * the current user (student role).
 */
export function useStudentWallet(studentId?: number) {
  const { data: user } = useUser();
  const resolvedId = studentId ?? (user?.role === "student" ? user.id : undefined);

  return useQuery<WalletRow>({
    queryKey: WALLET_QUERY_KEYS.wallet(resolvedId ?? 0),
    queryFn: async () => {
      const res = await fetch(`/api/finance/wallet/${resolvedId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch wallet"));
      return res.json();
    },
    enabled: typeof resolvedId === "number" && resolvedId > 0,
    retry: shouldRetry,
    retryDelay,
  });
}

// ── Query: full student statement ─────────────────────────────────────────────

/**
 * useStudentStatement — fetches the unified financial statement for a student.
 *
 * Includes fees, payments, wallet balance, wallet transactions, and summary.
 */
export function useStudentStatement(studentId?: number) {
  const { data: user } = useUser();
  const resolvedId = studentId ?? (user?.role === "student" ? user.id : undefined);

  return useQuery<StudentStatement>({
    queryKey: WALLET_QUERY_KEYS.statement(resolvedId ?? 0),
    queryFn: async () => {
      const res = await fetch(`/api/finance/student-statement/${resolvedId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch statement"));
      return res.json();
    },
    enabled: typeof resolvedId === "number" && resolvedId > 0,
    retry: shouldRetry,
    retryDelay,
  });
}

// ── Mutation: deposit to wallet ───────────────────────────────────────────────

/**
 * useDepositToWallet — admin mutation to top-up a student's wallet.
 *
 * On success, invalidates wallet + statement + fee queries for the student.
 */
export function useDepositToWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DepositInput) => {
      const res = await fetch("/api/finance/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to deposit to wallet"));
      return res.json() as Promise<{ wallet: WalletRow; newBalance: number; previousBalance: number }>;
    },
    onSuccess: (_data, variables) => {
      invalidateWalletQueries(queryClient, variables.studentId);
    },
  });
}

// ── Mutation: process fee payment ─────────────────────────────────────────────

/**
 * usePayFee — mutation to record a fee payment (cash / card / bank / wallet).
 *
 * On success, invalidates wallet + fee queries for the student.
 */
export function usePayFee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PayFeeInput) => {
      const res = await fetch("/api/finance/pay-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to process payment"));
      return res.json() as Promise<{ fee: StudentStatementFee; payment: object }>;
    },
    onSuccess: () => {
      // We don't know the studentId here so invalidate all wallet/fee queries
      invalidateWalletQueries(queryClient);
    },
  });
}

// ── Mutation: FIFO apply wallet to fees ───────────────────────────────────────

/**
 * useApplyWalletToFees — mutation to auto-settle outstanding fees from wallet
 * balance using FIFO (oldest due date first).
 *
 * On success, invalidates wallet + fee queries for the student.
 */
export function useApplyWalletToFees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (studentId: number) => {
      const res = await fetch(`/api/finance/apply-wallet/${studentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to apply wallet to fees"));
      return res.json() as Promise<ApplyWalletResult>;
    },
    onSuccess: (_data, studentId) => {
      invalidateWalletQueries(queryClient, studentId);
    },
  });
}
