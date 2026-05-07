/**
 * StudentStatementPage — unified chronological financial activity feed.
 *
 * Accessible at:
 *   /admin/finance/statement/:studentId  (admin view — full controls)
 *   /student/statement                   (student self-view — read-only)
 *
 * Shows:
 *  • Wallet status card with deposit / settle buttons (admin only)
 *  • Summary stats (billed, paid, outstanding, overdue)
 *  • Chronological activity feed merging fees + wallet transactions
 *  • Fee list with PayFeeDialog trigger (admin only)
 */

import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/layout";
import { useStudentStatement, useApplyWalletToFees } from "@/hooks/use-wallet";
import { useUser } from "@/hooks/use-auth";
import { WalletStatusCard } from "@/components/finance/WalletStatusCard";
import { DepositWalletDialog } from "@/components/finance/DepositWalletDialog";
import { PayFeeDialog } from "@/components/finance/PayFeeDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  PlusCircle,
  Zap,
  ArrowLeft,
  Loader2,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Clock4,
  ReceiptText,
  ArrowDownLeft,
  TrendingDown,
  RefreshCw,
  CreditCard,
} from "lucide-react";
import { formatCurrency, formatDate, getErrorMessage } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ── Status config (mirrors student/fees.tsx) ──────────────────────────────────

function getStatusConfig(status: string) {
  switch (status?.toLowerCase()) {
    case "paid":
      return { dot: "bg-emerald-400", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "overdue":
      return { dot: "bg-red-400", pill: "bg-red-50 text-red-700 border-red-200" };
    case "partially paid":
      return { dot: "bg-amber-400", pill: "bg-amber-50 text-amber-700 border-amber-200" };
    default:
      return { dot: "bg-sky-400", pill: "bg-sky-50 text-sky-700 border-sky-200" };
  }
}

// ── Activity feed item type ───────────────────────────────────────────────────

type ActivityItem =
  | {
      kind: "fee";
      id: number;
      date: string;
      label: string;
      sublabel: string;
      amount: number;
      status: string;
      feeId: number;
      remainingBalance: number;
      studentId: number;
      studentName?: string;
    }
  | {
      kind: "wallet_tx";
      id: number;
      date: string;
      label: string;
      sublabel: string;
      amount: number;
      txType: "deposit" | "fee_payment" | "refund" | "adjustment";
    };

// ── Main component ────────────────────────────────────────────────────────────

export default function StudentStatementPage() {
  const { data: user } = useUser();
  const { toast } = useToast();

  // Route params — admin path has :studentId, student path uses own id
  const [matchAdmin, paramsAdmin] = useRoute("/admin/finance/statement/:studentId");
  const isAdmin = user?.role === "admin";

  const studentId = matchAdmin
    ? Number(paramsAdmin?.studentId)
    : user?.role === "student"
    ? user.id
    : undefined;

  const { data: statement, isLoading } = useStudentStatement(studentId);
  const applyWallet = useApplyWalletToFees();

  const [depositOpen, setDepositOpen] = useState(false);
  const [payFeeTarget, setPayFeeTarget] = useState<ActivityItem & { kind: "fee" } | null>(null);

  // ── Build chronological activity feed ──────────────────────────────────────
  const activityFeed = useMemo<ActivityItem[]>(() => {
    if (!statement) return [];

    const items: ActivityItem[] = [];

    // Fee events
    statement.fees.forEach((fee) => {
      items.push({
        kind: "fee",
        id: fee.id,
        date: fee.dueDate,
        label: fee.invoiceNumber ?? `Invoice #${fee.id}`,
        sublabel: fee.billingPeriod ?? fee.feeType ?? "Fee",
        amount: Number(fee.amount),
        status: fee.status,
        feeId: fee.id,
        remainingBalance: Number(fee.remainingBalance),
        studentId: fee.studentId,
        studentName: statement.studentName,
      });
    });

    // Wallet transaction events
    statement.walletTransactions.forEach((tx) => {
      items.push({
        kind: "wallet_tx",
        id: tx.id,
        date: tx.createdAt,
        label: tx.description ?? tx.type,
        sublabel: tx.type.replace("_", " "),
        amount: Math.abs(Number(tx.amount)),
        txType: tx.type,
      });
    });

    // Sort newest first
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [statement]);

  const handleSettle = async () => {
    if (!studentId) return;
    try {
      const result = await applyWallet.mutateAsync(studentId);
      if (result.appliedCount === 0) {
        toast({ title: "Nothing to settle", description: "No outstanding fees or insufficient wallet balance." });
      } else {
        toast({
          title: "Fees settled",
          description: `${result.appliedCount} fee(s) settled · ${formatCurrency(result.totalApplied)} applied.`,
        });
      }
    } catch (err) {
      toast({ title: "Settlement failed", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Layout>
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
        </div>
      </Layout>
    );
  }

  if (!statement) {
    return (
      <Layout>
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
          <AlertTriangle className="h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">Statement not found.</p>
          {isAdmin && (
            <Link href="/admin/finance/wallets">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Wallets
              </Button>
            </Link>
          )}
        </div>
      </Layout>
    );
  }

  const { summary, wallet } = statement;
  const walletBalance = wallet?.balance ?? 0;
  const canSettle = walletBalance > 0 && summary.totalOutstanding > 0;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-5">

          {/* ── Page header ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Link href="/admin/finance/wallets">
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-slate-500">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
              )}
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 shadow-md shadow-violet-200">
                <ReceiptText className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                  {statement.studentName}
                </h1>
                <p className="text-xs text-slate-500">Financial Statement</p>
              </div>
            </div>
          </div>

          {/* ── Two-column layout: wallet card + summary ── */}
          <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">

            {/* Wallet card */}
            <WalletStatusCard
              wallet={wallet ? {
                id: wallet.id,
                studentId: studentId!,
                balance: wallet.balance,
                pendingDeductions: wallet.pendingDeductions,
                updatedAt: typeof wallet.updatedAt === "string" ? wallet.updatedAt : new Date(wallet.updatedAt).toISOString(),
              } : null}
              transactions={statement.walletTransactions.slice(0, 5)}
              actions={
                isAdmin ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setDepositOpen(true)}
                      className="h-8 gap-1.5 text-xs bg-white/20 hover:bg-white/30 text-white border border-white/30"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      Deposit
                    </Button>
                    {canSettle && (
                      <Button
                        size="sm"
                        onClick={handleSettle}
                        disabled={applyWallet.isPending}
                        className="h-8 gap-1.5 text-xs bg-white/20 hover:bg-white/30 text-white border border-white/30"
                      >
                        {applyWallet.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5" />
                        )}
                        Settle
                      </Button>
                    )}
                  </>
                ) : undefined
              }
            />

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3 content-start">
              {[
                { icon: TrendingUp, label: "Total Billed", value: formatCurrency(summary.totalBilled), accent: "bg-slate-100 text-slate-600" },
                { icon: CheckCircle2, label: "Total Paid", value: formatCurrency(summary.totalPaid), accent: "bg-emerald-50 text-emerald-600" },
                { icon: Clock4, label: "Outstanding", value: formatCurrency(summary.totalOutstanding), accent: summary.totalOutstanding > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400" },
                { icon: AlertTriangle, label: "Overdue", value: formatCurrency(summary.totalOverdue), accent: summary.totalOverdue > 0 ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm"
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${stat.accent}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-500 truncate">{stat.label}</p>
                    <p className="text-sm font-bold text-slate-900 leading-tight">{stat.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Activity feed ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-50">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Activity Feed</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Fees and wallet transactions — newest first
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                {activityFeed.length} events
              </span>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 border-b border-slate-100">
                    {["Date", "Description", "Type", "Amount", "Status / Balance", isAdmin ? "Action" : ""].map((h) => (
                      <TableHead
                        key={h}
                        className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-2.5"
                      >
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityFeed.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-sm text-slate-400">
                        No activity yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    activityFeed.map((item) => {
                      if (item.kind === "fee") {
                        const sc = getStatusConfig(item.status);
                        return (
                          <TableRow key={`fee-${item.id}`} className="hover:bg-slate-50/60 border-b border-slate-50">
                            <TableCell className="pl-5 text-xs text-slate-600">
                              {formatDate(item.date, "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell>
                              <p className="text-xs font-bold text-slate-900">{item.label}</p>
                              <p className="text-[10px] text-slate-400">{item.sublabel}</p>
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                <ReceiptText className="h-3 w-3" /> Invoice
                              </span>
                            </TableCell>
                            <TableCell className="text-xs font-bold text-slate-900">
                              {formatCurrency(item.amount)}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${sc.pill}`}>
                                <span className={`h-1 w-1 rounded-full ${sc.dot}`} />
                                {item.status}
                              </span>
                              {item.remainingBalance > 0 && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {formatCurrency(item.remainingBalance)} remaining
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="pr-4">
                              {isAdmin && item.remainingBalance > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 text-[10px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => setPayFeeTarget(item)}
                                >
                                  <CreditCard className="h-3 w-3" /> Pay
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      }

                      // wallet_tx
                      const txIcons = {
                        deposit: { icon: ArrowDownLeft, color: "text-emerald-600", bg: "bg-emerald-100" },
                        fee_payment: { icon: TrendingDown, color: "text-red-500", bg: "bg-red-100" },
                        refund: { icon: RefreshCw, color: "text-sky-600", bg: "bg-sky-100" },
                        adjustment: { icon: Clock4, color: "text-amber-600", bg: "bg-amber-100" },
                      };
                      const txCfg = txIcons[item.txType] ?? txIcons.adjustment;
                      const TxIcon = txCfg.icon;
                      const isDebit = item.txType === "fee_payment";

                      return (
                        <TableRow key={`tx-${item.id}`} className="hover:bg-slate-50/60 border-b border-slate-50">
                          <TableCell className="pl-5 text-xs text-slate-600">
                            {formatDate(item.date, "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell>
                            <p className="text-xs font-semibold text-slate-800 truncate max-w-[200px]">
                              {item.label}
                            </p>
                            <p className="text-[10px] text-slate-400 capitalize">{item.sublabel}</p>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${txCfg.bg} ${txCfg.color}`}>
                              <TxIcon className="h-3 w-3" />
                              {item.txType.replace("_", " ")}
                            </span>
                          </TableCell>
                          <TableCell className={`text-xs font-bold ${isDebit ? "text-red-500" : "text-emerald-600"}`}>
                            {isDebit ? "−" : "+"}{formatCurrency(item.amount)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-400">Wallet</TableCell>
                          <TableCell />
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden p-4 space-y-2">
              {activityFeed.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No activity yet.</p>
              ) : (
                activityFeed.map((item) => {
                  if (item.kind === "fee") {
                    const sc = getStatusConfig(item.status);
                    return (
                      <div key={`fee-${item.id}`} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{item.label}</p>
                            <p className="text-xs text-slate-500">{item.sublabel}</p>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sc.pill}`}>
                            {item.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">{formatDate(item.date, "MMM dd, yyyy")}</span>
                          <span className="font-bold text-slate-900">{formatCurrency(item.amount)}</span>
                        </div>
                        {isAdmin && item.remainingBalance > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full h-7 gap-1 text-[10px] border-emerald-200 text-emerald-700"
                            onClick={() => setPayFeeTarget(item)}
                          >
                            <CreditCard className="h-3 w-3" /> Record Payment
                          </Button>
                        )}
                      </div>
                    );
                  }

                  const isDebit = item.txType === "fee_payment";
                  return (
                    <div key={`tx-${item.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isDebit ? "bg-red-50" : "bg-emerald-50"}`}>
                        <Wallet className={`h-3.5 w-3.5 ${isDebit ? "text-red-500" : "text-emerald-600"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{item.label}</p>
                        <p className="text-[10px] text-slate-400">{formatDate(item.date, "MMM dd, yyyy")}</p>
                      </div>
                      <p className={`text-xs font-bold shrink-0 ${isDebit ? "text-red-500" : "text-emerald-600"}`}>
                        {isDebit ? "−" : "+"}{formatCurrency(item.amount)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Dialogs ── */}
      {isAdmin && statement && (
        <DepositWalletDialog
          open={depositOpen}
          onOpenChange={setDepositOpen}
          student={{ id: statement.studentId, name: statement.studentName }}
          currentBalance={walletBalance}
        />
      )}

      {isAdmin && payFeeTarget && (
        <PayFeeDialog
          open={!!payFeeTarget}
          onOpenChange={(open) => { if (!open) setPayFeeTarget(null); }}
          fee={{
            id: payFeeTarget.feeId,
            invoiceNumber: payFeeTarget.label,
            billingPeriod: payFeeTarget.sublabel,
            remainingBalance: payFeeTarget.remainingBalance,
            studentId: payFeeTarget.studentId,
            studentName: payFeeTarget.studentName,
          }}
          walletBalance={walletBalance}
        />
      )}
    </Layout>
  );
}
