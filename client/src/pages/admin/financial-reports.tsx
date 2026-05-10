import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend, Line, ComposedChart,
} from "recharts";
import {
  BarChart3, Building2, TrendingUp, AlertTriangle, Receipt, Download, Search, Loader2, FileText,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, downloadCsv } from "@/lib/utils";
import {
  useMonthlyFeeSummary,
  useMonthlyFundsSummary,
  useMonthlyPnL,
  useOverdueFeesSnapshot,
  useDailyFeeCollection,
  type MonthlyFeeSummaryRow,
  type MonthlyFundSummaryRow,
  type MonthlyPnLRow,
  type OverdueFeeEntry,
  type DailyFeeCollectionRow,
} from "@/hooks/use-reports";

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

function formatMonth(ym: string) {
  const [, m] = ym.split("-");
  return MONTH_LABELS[m] ?? ym;
}

function formatShortPkr(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-xs">
      <p className="mb-2 font-semibold text-slate-700">{label}</p>
      <div className="space-y-1">
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
            <span className="font-semibold text-slate-800">{formatCurrency(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        <Icon className="h-4 w-4 text-slate-400" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <>
            <div className="text-2xl font-bold text-slate-900">{value}</div>
            {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FeeSummaryChart({ data, loading }: { data?: MonthlyFeeSummaryRow[]; loading?: boolean }) {
  const chartData = useMemo(
    () =>
      (data ?? [])
        .slice()
        .reverse()
        .map((r) => ({
          label: formatMonth(r.month),
          Billed: r.totalBilled,
          Collected: r.totalCollected,
          Outstanding: r.totalOutstanding,
        })),
    [data],
  );

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">Monthly Fee Summary</CardTitle>
        <CardDescription className="text-xs">Total billed, collected, and outstanding per month</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">No data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatShortPkr} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "#f8fafc" }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#64748b", paddingTop: 8 }} />
              <Bar dataKey="Billed" name="Billed" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Collected" name="Collected" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Outstanding" name="Outstanding" fill="#f43f5e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function FundsSummaryChart({ data, loading }: { data?: MonthlyFundSummaryRow[]; loading?: boolean }) {
  const fundTypes = useMemo(() => {
    if (!data) return [];
    const types = new Set(data.map((r) => r.fundType));
    return Array.from(types);
  }, [data]);

  const FUND_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];

  const chartData = useMemo(() => {
    if (!data) return [];
    const months = Array.from(new Set(data.map((r) => r.month))).sort();
    return months.map((month) => {
      const row: Record<string, any> = { label: formatMonth(month) };
      for (const ft of fundTypes) {
        const match = data.find((r) => r.month === month && r.fundType === ft);
        row[ft] = match?.collected ?? 0;
      }
      return row;
    });
  }, [data, fundTypes]);

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">Monthly Funds Summary</CardTitle>
        <CardDescription className="text-xs">Collections broken down by fund type</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">No data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatShortPkr} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "#f8fafc" }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#64748b", paddingTop: 8 }} />
              {fundTypes.map((ft, i) => (
                <Bar key={ft} dataKey={ft} name={ft} fill={FUND_COLORS[i % FUND_COLORS.length]} radius={[3, 3, 0, 0]} stackId="a" />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function PnLChart({ data, loading }: { data?: MonthlyPnLRow[]; loading?: boolean }) {
  const chartData = useMemo(
    () =>
      (data ?? [])
        .slice()
        .reverse()
        .map((r) => ({
          label: formatMonth(r.month),
          Revenue: r.totalRevenue,
          Expenditure: r.totalExpenditure,
          Profit: r.netProfit,
        })),
    [data],
  );

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">Monthly Profit & Loss</CardTitle>
        <CardDescription className="text-xs">Fee revenue vs school expenditures</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">No data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatShortPkr} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "#f8fafc" }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#64748b", paddingTop: 8 }} />
              <Bar dataKey="Revenue" name="Revenue" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expenditure" name="Expenditure" fill="#f43f5e" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="Profit" name="Net Profit" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function OverdueFeesTable({ data, loading }: { data?: OverdueFeeEntry[]; loading?: boolean }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (r) => r.name.toLowerCase().includes(q) || r.className.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-700">Overdue Fees Snapshot</CardTitle>
            <CardDescription className="text-xs">Students with overdue fee status</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search..."
                className="h-8 w-48 pl-8 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                if (!data) return;
                downloadCsv(
                  `overdue-fees-${new Date().toISOString().slice(0, 10)}.csv`,
                  data.map((r) => ({
                    studentId: r.studentId,
                    name: r.name,
                    className: r.className,
                    totalPastDue: r.totalPastDue,
                  })),
                );
              }}
              disabled={!data || data.length === 0}
            >
              <Download className="mr-1 h-3 w-3" />
              CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : !data || data.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">No overdue fees found.</div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Student</TableHead>
                  <TableHead className="text-xs">Class</TableHead>
                  <TableHead className="text-xs text-right">Past Due Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-xs text-slate-400">
                      No results match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell className="text-sm font-medium">{row.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">
                          {row.className}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold text-rose-600">
                        {formatCurrency(row.totalPastDue)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DailyCollectionTable({ data, loading }: { data?: DailyFeeCollectionRow[]; loading?: boolean }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (r) =>
        r.studentReference.toLowerCase().includes(q) ||
        r.paymentMethod.toLowerCase().includes(q) ||
        r.paymentDate.includes(q),
    );
  }, [data, search]);

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-700">Daily Fee Collection</CardTitle>
            <CardDescription className="text-xs">Detailed payment ledger</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search..."
                className="h-8 w-48 pl-8 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                if (!data) return;
                downloadCsv(
                  `daily-collections-${new Date().toISOString().slice(0, 10)}.csv`,
                  data.map((r) => ({
                    paymentDate: r.paymentDate,
                    amount: r.amount,
                    paymentMethod: r.paymentMethod,
                    studentReference: r.studentReference,
                  })),
                );
              }}
              disabled={!data || data.length === 0}
            >
              <Download className="mr-1 h-3 w-3" />
              CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : !data || data.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">No payment records found.</div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Student</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-slate-400">
                      No results match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row, i) => (
                    <TableRow key={`${row.paymentDate}-${i}`}>
                      <TableCell className="text-sm text-slate-600">{row.paymentDate}</TableCell>
                      <TableCell className="text-sm font-medium">{row.studentReference}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs font-normal">
                          {row.paymentMethod}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold text-slate-800">
                        {formatCurrency(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-slate-100 shadow-sm">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export default function FinancialReportsPage() {
  const feeSummary = useMonthlyFeeSummary();
  const fundsSummary = useMonthlyFundsSummary();
  const pnl = useMonthlyPnL();
  const overdue = useOverdueFeesSnapshot();
  const daily = useDailyFeeCollection();

  const isLoading =
    feeSummary.isLoading || fundsSummary.isLoading || pnl.isLoading || overdue.isLoading || daily.isLoading;
  const hasError = feeSummary.error || fundsSummary.error || pnl.error || overdue.error || daily.error;

  const totalBilled = useMemo(
    () => (feeSummary.data ?? []).reduce((s, r) => s + r.totalBilled, 0),
    [feeSummary.data],
  );
  const totalCollected = useMemo(
    () => (feeSummary.data ?? []).reduce((s, r) => s + r.totalCollected, 0),
    [feeSummary.data],
  );
  const totalOutstanding = useMemo(
    () => (feeSummary.data ?? []).reduce((s, r) => s + r.totalOutstanding, 0),
    [feeSummary.data],
  );
  const overdueCount = overdue.data?.length ?? 0;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 className="h-6 w-6 text-indigo-500" />
          Financial Reports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dashboard overview of fee collections, funds breakdown, profit & loss, and payment activity.
        </p>
      </div>

      {hasError && (
        <Card className="mb-6 border-rose-200 bg-rose-50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
            <p className="text-sm text-rose-700">
              Failed to load some report data. Please try refreshing the page.
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <SummaryCard title="Total Billed" value={formatCurrency(totalBilled)} icon={FileText} />
            <SummaryCard title="Total Collected" value={formatCurrency(totalCollected)} icon={Receipt} />
            <SummaryCard title="Outstanding" value={formatCurrency(totalOutstanding)} icon={AlertTriangle} />
            <SummaryCard title="Overdue Accounts" value={String(overdueCount)} icon={Building2} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <FeeSummaryChart data={feeSummary.data} loading={feeSummary.isLoading} />
            <FundsSummaryChart data={fundsSummary.data} loading={fundsSummary.isLoading} />
          </div>

          <PnLChart data={pnl.data} loading={pnl.isLoading} />

          <Tabs defaultValue="overdue" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overdue">
                <AlertTriangle className="mr-1.5 h-4 w-4" />
                Overdue Fees
              </TabsTrigger>
              <TabsTrigger value="daily">
                <Receipt className="mr-1.5 h-4 w-4" />
                Daily Collections
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overdue">
              <OverdueFeesTable data={overdue.data} loading={overdue.isLoading} />
            </TabsContent>
            <TabsContent value="daily">
              <DailyCollectionTable data={daily.data} loading={daily.isLoading} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Layout>
  );
}