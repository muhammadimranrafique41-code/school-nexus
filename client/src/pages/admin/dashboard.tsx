import { useAdminStats } from "@/hooks/use-dashboard";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Banknote, Clock, GraduationCap, TrendingUp, Users } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/utils";

const activityMeta = {
  fee: { icon: Banknote, iconColor: "text-emerald-600", iconBg: "bg-emerald-100" },
  attendance: { icon: Clock, iconColor: "text-amber-600", iconBg: "bg-amber-100" },
} as const;

const revenueChartConfig = {
  revenue: {
    label: "Revenue",
    color: "#8b5cf6",
  },
} as const;

export default function AdminDashboard() {
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6 pb-8">
          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
            <Skeleton className="h-64 rounded-[1.9rem]" />
            <Skeleton className="h-64 rounded-[1.9rem]" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-40 rounded-[1.75rem]" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-7">
            <Skeleton className="h-[27rem] rounded-[1.75rem] lg:col-span-4" />
            <Skeleton className="h-[27rem] rounded-[1.75rem] lg:col-span-3" />
          </div>
        </div>
      </Layout>
    );
  }

  const statCards = [
    { title: "Total Students", value: stats?.totalStudents ?? 0, helper: `${stats?.activeClasses ?? 0} active classes`, icon: GraduationCap, color: "from-blue-600 to-indigo-600", bg: "bg-blue-50" },
    { title: "Total Teachers", value: stats?.totalTeachers ?? 0, helper: "Faculty directory synced", icon: Users, color: "from-emerald-600 to-teal-600", bg: "bg-emerald-50" },
    { title: "Fees Collected", value: formatCurrency(stats?.feesCollected ?? 0), helper: `${stats?.pendingPayments ?? 0} pending payments`, icon: Banknote, color: "from-violet-600 to-purple-600", bg: "bg-violet-50" },
    { title: "Outstanding Fees", value: formatCurrency(stats?.outstandingFees ?? 0), helper: `${stats?.attendanceMarkedToday ?? 0} attendance records today`, icon: TrendingUp, color: "from-rose-600 to-orange-600", bg: "bg-rose-50" },
  ];

  return (
    <Layout>
      <div className="space-y-8 pb-8">
        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="relative overflow-hidden rounded-[1.9rem] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-8 text-white shadow-[0_28px_80px_-32px_rgba(15,23,42,0.75)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(192,132,252,0.22),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(244,114,182,0.18),_transparent_26%)]" />
            <div className="relative space-y-5">
              <Badge variant="outline" className="border-white/15 bg-white/10 text-white backdrop-blur-sm">
                Operations center
              </Badge>
              <div className="space-y-3">
                <h1 className="text-4xl font-display font-bold tracking-tight md:text-5xl">
                  Admin Dashboard
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                  Live operational visibility across enrollment, attendance, teaching activity, and fee collection.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="secondary" className="border-none bg-white text-slate-900 hover:bg-slate-100">
                  <Link href="/admin/users">Review users</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15 hover:text-white"
                >
                  <Link href="/admin/finance">Track finances</Link>
                </Button>
              </div>
            </div>
          </div>

          <Card className="bg-white/75">
            <CardHeader>
              <CardTitle>Today at a glance</CardTitle>
              <CardDescription>
                High-signal operational metrics for the most active workflows in the system.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Active classes", value: stats?.activeClasses ?? 0 },
                { label: "Pending payments", value: stats?.pendingPayments ?? 0 },
                { label: "Attendance today", value: stats?.attendanceMarkedToday ?? 0 },
                { label: "Recent updates", value: stats?.recentActivity?.length ?? 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-3 text-3xl font-display font-bold text-slate-900">{item.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.title} className="overflow-hidden bg-white/80 transition-all duration-300 hover:-translate-y-1">
              <div className={`h-1.5 w-full bg-gradient-to-r ${stat.color}`} />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{stat.title}</CardTitle>
                <div className={`${stat.bg} rounded-2xl p-2.5`}>
                  <stat.icon className="h-5 w-5 text-slate-700" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="mt-1 text-3xl font-display font-bold tracking-tight text-slate-900">{stat.value}</div>
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-500">
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                  <span>{stat.helper}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-none bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-[0_24px_60px_-30px_rgba(37,99,235,0.7)]">
            <CardContent className="p-6 space-y-3">
              <h3 className="text-xl font-bold">Manage Students</h3>
              <p className="text-blue-100/80 text-sm">Create, edit, and export student records from one place.</p>
              <Button asChild variant="secondary" className="bg-white text-blue-600 hover:bg-blue-50 border-none font-bold shadow-sm">
                <Link href="/admin/students">Open Student Manager</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-none bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-[0_24px_60px_-30px_rgba(5,150,105,0.7)]">
            <CardContent className="p-6 space-y-3">
              <h3 className="text-xl font-bold">Manage Teachers</h3>
              <p className="text-emerald-100/80 text-sm">Keep faculty assignments and class coverage current.</p>
              <Button asChild variant="secondary" className="bg-white text-emerald-600 hover:bg-emerald-50 border-none font-bold shadow-sm">
                <Link href="/admin/teachers">Open Teacher Manager</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-none bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-[0_24px_60px_-30px_rgba(139,92,246,0.7)]">
            <CardContent className="p-6 space-y-3">
              <h3 className="text-xl font-bold">Finance Follow-up</h3>
              <p className="text-violet-100/80 text-sm">Track pending balances and payment updates in one workflow.</p>
              <Button asChild variant="secondary" className="bg-white text-violet-600 hover:bg-violet-50 border-none font-bold shadow-sm">
                <Link href="/admin/finance">Review Fee Workflow</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-7">
          <Card className="lg:col-span-4 bg-white/75">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-bold">
                Monthly Revenue
                <Badge variant="secondary" className="font-medium">Last 6 months</Badge>
              </CardTitle>
              <CardDescription>Fee collection trend over the last six completed months.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={revenueChartConfig} className="h-[350px] w-full pt-4">
                <AreaChart data={stats?.monthlyRevenue ?? []}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={(value) => formatCurrency(Number(value))} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />
                    }
                  />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3 bg-white/75">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Recent Activity</CardTitle>
              <CardDescription>Attendance and finance updates are surfaced here in real time.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {(stats?.recentActivity ?? []).length === 0 ? (
                  <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/80 p-8 text-sm text-slate-500">
                    Activity will appear here once attendance and fee updates are recorded.
                  </div>
                ) : (
                  stats?.recentActivity.map((activity) => {
                    const meta = activityMeta[activity.type];
                    const Icon = meta.icon;

                    return (
                      <div key={activity.id} className="flex gap-4 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/75 p-4">
                        <div className={`${meta.iconBg} ${meta.iconColor} h-fit rounded-2xl p-2.5`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold leading-none text-slate-900">{activity.title}</p>
                          <p className="text-sm text-slate-500">{activity.description}</p>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{activity.dateLabel}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
