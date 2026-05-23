/**
 * WalletManagementHub — admin page for managing student wallets.
 *
 * Features:
 *  • Searchable list of all students with their wallet balances
 *  • Deposit button per student (opens DepositWalletDialog)
 *  • FIFO "Settle Fees" button per student (calls apply-wallet endpoint)
 *  • Link to full student statement
 *  • Summary stats: total wallet funds, students with balance, students with overdue
 *
 * Data sources:
 *  • useStudents()  — full student list (name, className, id)
 *  • useFees()      — fee records to compute outstanding + overdue per student
 *  • Per-student wallet fetched lazily via useStudentWallet() in each row
 */

import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useApplyWalletToFees } from "@/hooks/use-wallet";
import { useFees } from "@/hooks/use-fees";
import { useStudents } from "@/hooks/use-users";
import { useToast } from "@/hooks/use-toast";
import { DepositWalletDialog } from "@/components/finance/DepositWalletDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Wallet,
  Search,
  PlusCircle,
  Zap,
  ExternalLink,
  Loader2,
  Users,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { formatCurrency, getErrorMessage } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getResponseErrorMessage } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WalletInfo {
  id: number;
  studentId: number;
  balance: string | number;
  pendingDeductions: string | number;
  updatedAt: string;
}

interface StudentWithWallet {
  id: number;
  name: string;
  className?: string | null;
  wallet: WalletInfo | null;
  hasOverdue: boolean;
  outstandingBalance: number;
}

// ── Per-student wallet fetch ──────────────────────────────────────────────────

function useWalletForStudent(studentId: number) {
  return useQuery<WalletInfo | null>({
    queryKey: ["/api/finance/wallet", studentId],
    queryFn: async () => {
      const res = await fetch(`/api/finance/wallet/${studentId}`, {
        credentials: "include",
      });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30_000,
  });
}

// ── Student wallet row component ──────────────────────────────────────────────

function StudentWalletRow({
  student,
  onDeposit,
}: {
  student: Omit<StudentWithWallet, "wallet">;
  onDeposit: (student: StudentWithWallet) => void;
}) {
  const { data: wallet = null } = useWalletForStudent(student.id);
  const applyWallet = useApplyWalletToFees();
  const { toast } = useToast();

  const balance = wallet ? Number(wallet.balance) : 0;
  const hasBalance = balance > 0;
  const hasOutstanding = student.outstandingBalance > 0;

  const handleSettle = async () => {
    try {
      const result = await applyWallet.mutateAsync(student.id);
      if (result.appliedCount === 0) {
        toast({
          title: "Nothing to settle",
          description: "No outstanding fees or insufficient wallet balance.",
        });
      } else {
        toast({
          title: "Fees settled",
          description: `${result.appliedCount} fee(s) settled · ${formatCurrency(result.totalApplied)} applied · ${formatCurrency(result.remainingWalletBalance)} remaining.`,
        });
      }
    } catch (err) {
      toast({
        title: "Settlement failed",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm hover:shadow-md transition-shadow">
      {/* Avatar */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100">
        <span className="text-sm font-bold text-violet-700">
          {student.name.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Student info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-slate-900 truncate">{student.name}</p>
          {student.hasOverdue && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-600">
              <AlertTriangle className="h-2.5 w-2.5" /> Overdue
            </span>
          )}
        </div>
        {student.className && (
          <p className="text-xs text-slate-500">{student.className}</p>
        )}
        <div className="mt-1 flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Outstanding:{" "}
            <span className={`font-semibold ${student.outstandingBalance > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {formatCurrency(student.outstandingBalance)}
            </span>
          </span>
        </div>
      </div>

      {/* Wallet balance */}
      <div className="text-right shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Wallet
        </p>
        <p className={`text-base font-bold ${hasBalance ? "text-violet-700" : "text-slate-400"}`}>
          {formatCurrency(balance)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
          onClick={() => onDeposit({ ...student, wallet })}
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Deposit
        </Button>

        {hasBalance && hasOutstanding && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={handleSettle}
            disabled={applyWallet.isPending}
          >
            {applyWallet.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Settle
          </Button>
        )}

        <Link href={`/admin/finance/statement/${student.id}`}>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WalletManagementHub() {
  const [search, setSearch] = useState("");
  const [depositTarget, setDepositTarget] = useState<StudentWithWallet | null>(null);

  const { data: students = [], isLoading: studentsLoading } = useStudents();
  const { data: fees = [] } = useFees();

  // Build per-student outstanding + overdue from fees
  const feeStatsByStudent = useMemo(() => {
    const map = new Map<number, { outstanding: number; hasOverdue: boolean }>();
    fees.forEach((fee) => {
      if (!fee.studentId) return;
      const remaining = Number(fee.remainingBalance ?? 0);
      const isOverdue = fee.status === "Overdue" && remaining > 0;
      const existing = map.get(fee.studentId);
      if (existing) {
        existing.outstanding += remaining;
        if (isOverdue) existing.hasOverdue = true;
      } else {
        map.set(fee.studentId, { outstanding: remaining, hasOverdue: isOverdue });
      }
    });
    return map;
  }, [fees]);

  // Build student list — only students (role === "student")
  const studentList = useMemo(
    () =>
      students
        .filter((s) => s.role === "student")
        .map((s) => ({
          id: s.id,
          name: s.name,
          className: s.className,
          hasOverdue: feeStatsByStudent.get(s.id)?.hasOverdue ?? false,
          outstandingBalance: feeStatsByStudent.get(s.id)?.outstanding ?? 0,
        }))
        .sort((a, b) => {
          // Overdue first, then alphabetical
          if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
    [students, feeStatsByStudent]
  );

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return studentList;
    const q = search.toLowerCase();
    return studentList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.className?.toLowerCase().includes(q) ?? false)
    );
  }, [studentList, search]);

  const studentsWithOverdue = useMemo(
    () => studentList.filter((s) => s.hasOverdue).length,
    [studentList]
  );

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-screen-xl p-4 md:p-6 space-y-5">

          {/* ── Page header ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 shadow-md shadow-violet-200">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                  Wallet Management
                </h1>
                <p className="text-xs text-slate-500">
                  Manage student wallet balances and fee settlements
                </p>
              </div>
            </div>
            <Link href="/admin/finance">
              <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs">
                <ExternalLink className="h-3.5 w-3.5" />
                Finance Dashboard
              </Button>
            </Link>
          </div>

          {/* ── Summary stats ── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              {
                icon: Users,
                label: "Total Students",
                value: studentList.length,
                accent: "bg-violet-50 text-violet-600",
                bar: "bg-violet-500",
              },
              {
                icon: AlertTriangle,
                label: "Students with Overdue",
                value: studentsWithOverdue,
                accent: studentsWithOverdue > 0 ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400",
                bar: studentsWithOverdue > 0 ? "bg-red-500" : "bg-slate-300",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden"
              >
                <div className={`h-1 ${stat.bar}`} />
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.accent}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">{stat.label}</p>
                    <p className="text-lg font-bold text-slate-900">{stat.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Search ── */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students by name or class…"
              className="pl-9 bg-white border-slate-200"
            />
          </div>

          {/* ── Student list ── */}
          <div className="space-y-2">
            {studentsLoading ? (
              <div className="flex justify-center py-14">
                <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200/80 bg-white py-14 text-center">
                <Wallet className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-500">No students found</p>
                <p className="text-xs text-slate-400">
                  {search ? "Try a different search term." : "No students registered yet."}
                </p>
              </div>
            ) : (
              filtered.map((student) => (
                <StudentWalletRow
                  key={student.id}
                  student={student}
                  onDeposit={setDepositTarget}
                />
              ))
            )}
          </div>

          {filtered.length > 0 && (
            <p className="text-center text-xs text-slate-400">
              Showing {filtered.length} of {studentList.length} student{studentList.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* ── Deposit dialog ── */}
      {depositTarget && (
        <DepositWalletDialog
          open={!!depositTarget}
          onOpenChange={(open) => { if (!open) setDepositTarget(null); }}
          student={depositTarget}
          currentBalance={Number(depositTarget.wallet?.balance ?? 0)}
        />
      )}
    </Layout>
  );
}
