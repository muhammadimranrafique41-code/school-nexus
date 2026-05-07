/**
 * WalletStatusCard — displays a student's wallet balance, pending deductions,
 * and the last few wallet transactions.
 *
 * Used in:
 *  • student/fees.tsx  (read-only view for the student)
 *  • WalletManagementHub (admin view, with action buttons passed as children)
 */

import { Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw, Clock, TrendingDown } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { WalletRow, WalletTransactionRow } from "@/hooks/use-wallet";

// ── Transaction type config ───────────────────────────────────────────────────

const TX_CONFIG: Record<
  WalletTransactionRow["type"],
  { label: string; icon: React.ElementType; color: string; bg: string; sign: "+" | "−" }
> = {
  deposit: {
    label: "Deposit",
    icon: ArrowDownLeft,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    sign: "+",
  },
  fee_payment: {
    label: "Fee Payment",
    icon: TrendingDown,
    color: "text-red-500",
    bg: "bg-red-50",
    sign: "−",
  },
  refund: {
    label: "Refund",
    icon: RefreshCw,
    color: "text-sky-600",
    bg: "bg-sky-50",
    sign: "+",
  },
  adjustment: {
    label: "Adjustment",
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50",
    sign: "+",
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface WalletStatusCardProps {
  wallet: WalletRow | null | undefined;
  transactions?: WalletTransactionRow[];
  /** Maximum number of recent transactions to display (default: 5) */
  maxTransactions?: number;
  /** Optional action buttons rendered in the card header (e.g. Deposit / Settle) */
  actions?: React.ReactNode;
  /** Show a compact variant without the transaction list */
  compact?: boolean;
  isLoading?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WalletStatusCard({
  wallet,
  transactions = [],
  maxTransactions = 5,
  actions,
  compact = false,
  isLoading = false,
}: WalletStatusCardProps) {
  const balance = wallet ? Number(wallet.balance) : 0;
  const pending = wallet ? Number(wallet.pendingDeductions) : 0;
  const available = balance - pending;
  const recentTx = transactions.slice(0, maxTransactions);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden animate-pulse">
        <div className="h-24 bg-slate-100" />
        <div className="p-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      {/* ── Header banner ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 to-indigo-600 px-5 py-4 text-white">
        {/* decorative circles */}
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/5" />
        <div className="absolute right-10 top-8 h-12 w-12 rounded-full bg-white/5" />

        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-200">
                Wallet Balance
              </p>
              <p className="text-2xl font-bold leading-tight tracking-tight">
                {formatCurrency(balance)}
              </p>
            </div>
          </div>

          {/* Action buttons slot */}
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>

        {/* Pending deductions pill */}
        {pending > 0 && (
          <div className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white/10 border border-white/20 px-3 py-1.5">
            <Clock className="h-3 w-3 text-violet-200" />
            <span className="text-xs font-semibold text-violet-100">
              {formatCurrency(pending)} pending deductions
            </span>
          </div>
        )}
      </div>

      {/* ── Balance breakdown ── */}
      <div className="grid grid-cols-2 gap-2 p-4 pb-0">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Available
          </p>
          <p className={`mt-0.5 text-sm font-bold ${available > 0 ? "text-emerald-600" : "text-slate-700"}`}>
            {formatCurrency(available)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Pending
          </p>
          <p className={`mt-0.5 text-sm font-bold ${pending > 0 ? "text-amber-600" : "text-slate-400"}`}>
            {formatCurrency(pending)}
          </p>
        </div>
      </div>

      {/* ── Last updated ── */}
      {wallet?.updatedAt && (
        <p className="px-4 pt-2 text-[10px] text-slate-400">
          Last updated · {formatDate(wallet.updatedAt, "MMM dd, yyyy HH:mm")}
        </p>
      )}

      {/* ── Recent transactions (hidden in compact mode) ── */}
      {!compact && (
        <div className="p-4 pt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Recent Activity
          </p>

          {recentTx.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center">
              <ArrowUpRight className="h-5 w-5 text-slate-300" />
              <p className="text-xs text-slate-400">No transactions yet</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentTx.map((tx) => {
                const cfg = TX_CONFIG[tx.type] ?? TX_CONFIG.adjustment;
                const TxIcon = cfg.icon;
                const amt = Math.abs(Number(tx.amount));
                const isDebit = tx.type === "fee_payment";

                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}
                    >
                      <TxIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {tx.description ?? cfg.label}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {formatDate(tx.createdAt, "MMM dd, yyyy")} · {cfg.label}
                      </p>
                    </div>
                    <p
                      className={`text-xs font-bold shrink-0 ${
                        isDebit ? "text-red-500" : "text-emerald-600"
                      }`}
                    >
                      {isDebit ? "−" : "+"}{formatCurrency(amt)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
