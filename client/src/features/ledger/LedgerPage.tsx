/**
 * @page LedgerPage
 * @route /admin/ledger
 * @description
 * Root page for the Ledger & Financial Reporting module.
 * Renders four lazy-loaded tabs inside the shared Layout shell:
 *   1. Cash Flow      — KPI cards + charts + AI insight
 *   2. Ledger Register — full append-only entry table
 *   3. Fee Collection  — student fee records + voucher workflow
 *   4. Wallet Ledger   — parent-wallet transaction history
 */

import { lazy, Suspense } from "react";
import { BookOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";
import { AddExpenseDialog } from "./components/AddExpenseDialog";

// ─────────────────────────────────────────────────────────────────────────────
// Lazy-loaded tab panels
// ─────────────────────────────────────────────────────────────────────────────

const CashFlowTab       = lazy(() => import("./tabs/CashFlowTab").then((m) => ({ default: m.CashFlowTab })));
const LedgerRegisterTab = lazy(() => import("./tabs/LedgerRegisterTab").then((m) => ({ default: m.LedgerRegisterTab })));
const FeeCollectionTab  = lazy(() => import("./tabs/FeeCollectionTab").then((m) => ({ default: m.FeeCollectionTab })));
const WalletLedgerTab   = lazy(() => import("./tabs/WalletLedgerTab").then((m) => ({ default: m.WalletLedgerTab })));

// ─────────────────────────────────────────────────────────────────────────────
// Tab skeleton fallback
// ─────────────────────────────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function LedgerPage() {
  return (
    <Layout>
      <div className="space-y-5 p-4 md:p-6">
        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
              <BookOpen className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Ledger &amp; Financial Reports
              </h1>
              <p className="text-xs text-slate-500">
                Unified cash-flow view, fee collection tracking, and wallet activity
              </p>
            </div>
          </div>
          {/* Add Expense button — always visible in the header */}
          <AddExpenseDialog />
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <Tabs defaultValue="cash-flow" className="space-y-4">
          <div className="overflow-x-auto -mx-4 md:-mx-0">
            <div className="px-4 md:px-0 min-w-max">
              <TabsList className="h-9 rounded-lg bg-slate-100 p-1">
                <TabsTrigger
                  value="cash-flow"
                  className="rounded-md px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
                >
                  Cash Flow
                </TabsTrigger>
                <TabsTrigger
                  value="ledger-register"
                  className="rounded-md px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
                >
                  Ledger Register
                </TabsTrigger>
                <TabsTrigger
                  value="fee-collection"
                  className="rounded-md px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
                >
                  Fee Collection
                </TabsTrigger>
                <TabsTrigger
                  value="wallet-ledger"
                  className="rounded-md px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
                >
                  Wallet Ledger
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="cash-flow" className="mt-0">
            <Suspense fallback={<TabSkeleton />}>
              <CashFlowTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="ledger-register" className="mt-0">
            <Suspense fallback={<TabSkeleton />}>
              <LedgerRegisterTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="fee-collection" className="mt-0">
            <Suspense fallback={<TabSkeleton />}>
              <FeeCollectionTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="wallet-ledger" className="mt-0">
            <Suspense fallback={<TabSkeleton />}>
              <WalletLedgerTab />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
