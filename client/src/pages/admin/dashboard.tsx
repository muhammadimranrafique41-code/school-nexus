import { useAdminStats } from "@/hooks/use-dashboard";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Banknote, BookOpen, CalendarCheck, Clock, GraduationCap, Printer, TrendingUp, Users } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Link } from "wouter";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { FinanceVoucherOperationRecord } from "@shared/finance";

const activityMeta = {
  fee: { icon: Banknote, iconColor: "text-emerald-600", iconBg: "bg-emerald-50" },
  attendance: { icon: CalendarCheck, iconColor: "text-amber-600", iconBg: "bg-amber-50" },
} as const;

const revenueChartConfig = {
  revenue: { label: "Revenue", color: "#6366f1" },
} as const;

// ── tiny helpers ─────────────────────────────────────────────────────────
function StatPill({ value, label, accent }: { value: string | number; label: string; accent: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border px-4 py-3 text-center", accent)}>
      <p className="text-xl font-bold leading-none text-slate-900 sm:text-2xl">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
    </div>
  );
}

function QuickLinkCard({
  href, title, description, colorFrom, colorTo, textAccent, btnAccent,
}: {
  href: string; title: string; description: string;
  colorFrom: string; colorTo: string; textAccent: string; btnAccent: string;
}) {
  return (
    <Link href={href} className="group block">
      <div className={cn(
        "relative overflow-hidden rounded-xl border-0 p-5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md",
        `bg-gradient-to-br ${colorFrom} ${colorTo}`,
      )}>
        {/* subtle top-right glow */}
        <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
        <p className={cn("text-sm font-bold", textAccent)}>{title}</p>
        <p className="mt-1 text-[12px] text-white/70 leading-snug">{description}</p>
        <span className={cn(
          "mt-3 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold",
          btnAccent,
        )}>
          Open →
        </span>
      </div>
    </Link>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-5 pb-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-72 rounded-xl" />
          <div className="grid gap-3 lg:grid-cols-7">
            <Skeleton className="h-64 rounded-xl lg:col-span-4" />
            <Skeleton className="h-64 rounded-xl lg:col-span-3" />
          </div>
        </div>
      </Layout>
    );
  }

  const statCards = [
    {
      title: "Total Students", value: stats?.totalStudents ?? 0,
      hint: `${stats?.activeClasses ?? 0} active classes`,
      icon: GraduationCap, iconBg: "bg-indigo-50", iconColor: "text-indigo-600",
      accent: "border-indigo-100", bar: "from-indigo-500 to-blue-500",
    },
    {
      title: "Total Teachers", value: stats?.totalTeachers ?? 0,
      hint: "Faculty directory synced",
      icon: Users, iconBg: "bg-emerald-50", iconColor: "text-emerald-600",
      accent: "border-emerald-100", bar: "from-emerald-500 to-teal-500",
    },
    {
      title: "Fees Collected", value: formatCurrency(stats?.feesCollected ?? 0),
      hint: `${stats?.pendingPayments ?? 0} pending`,
      icon: Banknote, iconBg: "bg-violet-50", iconColor: "text-violet-600",
      accent: "border-violet-100", bar: "from-violet-500 to-purple-500",
    },
    {
      title: "Outstanding Fees", value: formatCurrency(stats?.outstandingFees ?? 0),
      hint: `${stats?.overdueInvoices ?? 0} overdue invoice(s)`,
      icon: TrendingUp, iconBg: "bg-rose-50", iconColor: "text-rose-600",
      accent: "border-rose-100", bar: "from-rose-500 to-orange-500",
    },
  ];

  return (
    <Layout>
      <div className="space-y-5 pb-8">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
              <p className="text-[12px] text-slate-400">Live visibility across enrollment, attendance, and finance.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/users">Users</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/finance">Finance</Link>
            </Button>
          </div>
        </section>

        {/* ── Primary KPI cards ────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.title} className={cn("overflow-hidden border bg-white shadow-none transition-shadow hover:shadow-sm", stat.accent)}>
              {/* colour bar */}
              <div className={cn("h-0.5 w-full bg-gradient-to-r", stat.bar)} />
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{stat.title}</p>
                    <p className="mt-1.5 text-2xl font-bold leading-none text-slate-900">{stat.value}</p>
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
                      <TrendingUp className="h-3 w-3 text-emerald-500" />{stat.hint}
                    </p>
                  </div>
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", stat.iconBg, stat.iconColor)}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* ── Today at a glance ────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Active classes", value: stats?.activeClasses ?? 0, accent: "border-slate-200 bg-white" },
            { label: "Pending payments", value: stats?.pendingPayments ?? 0, accent: "border-amber-100 bg-amber-50/40" },
            { label: "Overdue invoices", value: stats?.overdueInvoices ?? 0, accent: "border-rose-100 bg-rose-50/40" },
            { label: "Attendance today", value: stats?.attendanceMarkedToday ?? 0, accent: "border-emerald-100 bg-emerald-50/40" },
          ].map((item) => (
            <StatPill key={item.label} value={item.value} label={item.label} accent={item.accent} />
          ))}
        </section>

        {/* ── Quick-link action cards ───────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickLinkCard href="/admin/students" title="Manage Students" description="Create, edit, and export student records." colorFrom="from-indigo-600" colorTo="to-blue-600" textAccent="text-white" btnAccent="bg-white/20 text-white hover:bg-white/30" />
          <QuickLinkCard href="/admin/teachers" title="Manage Teachers" description="Assignments and class coverage current." colorFrom="from-emerald-600" colorTo="to-teal-600" textAccent="text-white" btnAccent="bg-white/20 text-white hover:bg-white/30" />
          <QuickLinkCard href="/admin/finance" title="Finance Follow-up" description="Track balances, overdue invoices, and payments." colorFrom="from-violet-600" colorTo="to-purple-600" textAccent="text-white" btnAccent="bg-white/20 text-white hover:bg-white/30" />
        </section>

        {/* ── Recent bulk voucher operations ───────────────────────────── */}
        {(stats?.recentVoucherOperations ?? []).length > 0 && (
          <Card className="border-slate-200/80 bg-white shadow-none">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50">
                  <Printer className="h-3.5 w-3.5 text-violet-500" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Recent bulk voucher jobs</CardTitle>
                  <CardDescription className="text-[11px]">Last 5 bulk voucher print operations.</CardDescription>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                <Link href="/admin/finance/bulk-print">View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {(stats?.recentVoucherOperations as FinanceVoucherOperationRecord[]).map((op) => {
                  const colorMap: Record<string, string> = {
                    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
                    running: "border-blue-200   bg-blue-50   text-blue-700",
                    queued: "border-amber-200  bg-amber-50  text-amber-700",
                    failed: "border-rose-200   bg-rose-50   text-rose-700",
                    cancelled: "border-slate-200  bg-slate-50  text-slate-500",
                  };
                  return (
                    <div key={op.id} className={cn("rounded-lg border p-3 text-xs", colorMap[op.status] ?? "border-slate-200 bg-slate-50")}>
                      <p className="font-bold capitalize">{op.status}</p>
                      <p className="mt-0.5 text-[11px] opacity-75">{op.billingMonths.join(", ")}</p>
                      <p className="mt-0.5 opacity-65">{op.generatedCount}/{op.totalInvoices} vouchers</p>
                      {op.createdAt && <p className="mt-0.5 opacity-55">{formatDate(op.createdAt, "MMM dd")}</p>}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Revenue chart + Recent activity ──────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-7">

          {/* Revenue chart */}
          <Card className="border-slate-200/80 bg-white shadow-none lg:col-span-4">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">Monthly Revenue</CardTitle>
                <CardDescription className="text-[11px]">Fee collection trend — last 6 months.</CardDescription>
              </div>
              <Badge variant="secondary" className="text-[10px] font-semibold">Last 6 months</Badge>
            </CardHeader>
            <CardContent className="px-2 pb-4 pt-2">
              <ChartContainer config={revenueChartConfig} className="h-[260px] w-full">
                <AreaChart data={stats?.monthlyRevenue ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => formatCurrency(Number(v))} width={72} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card className="border-slate-200/80 bg-white shadow-none lg:col-span-3">
            <CardHeader className="border-b border-slate-100 px-4 py-3">
              <CardTitle className="text-sm font-semibold text-slate-900">Recent Activity</CardTitle>
              <CardDescription className="text-[11px]">Attendance and finance updates in real time.</CardDescription>
            </CardHeader>
            <CardContent className="p-3">
              {(stats?.recentActivity ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-[12px] text-slate-400">
                  Activity will appear here once attendance and fee updates are recorded.
                </div>
              ) : (
                <div className="space-y-2">
                  {stats?.recentActivity.map((activity) => {
                    const meta = activityMeta[activity.type];
                    const Icon = meta.icon;
                    return (
                      <div key={activity.id} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5 transition-colors hover:bg-indigo-50/30">
                        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", meta.iconBg, meta.iconColor)}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold leading-tight text-slate-900">{activity.title}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{activity.description}</p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{activity.dateLabel}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </Layout>
  );
}
