import { useState } from "react";
import { StatsCards } from "@/components/dashboard/StatsCards"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAdminStats } from "@/hooks/use-dashboard"
import { TrendingUp, BookOpen, Plus } from "lucide-react"
import { TodosWidget } from "@/components/todos/TodosWidget"
import { CreateTodoModal } from "@/components/todos/CreateTodoModal"

export default function DashboardPage() {
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false)
  const { data: stats, isLoading } = useAdminStats()

  const statCards = stats
    ? [
        { title: "Total Students", value: stats.totalStudents, hint: `${stats.activeClasses} active classes`, icon: BookOpen, iconBg: "bg-indigo-50", iconColor: "text-indigo-600", accent: "border-indigo-100" },
        { title: "Total Teachers", value: stats.totalTeachers, hint: "Faculty directory", icon: TrendingUp, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", accent: "border-emerald-100" },
        { title: "Fees Collected", value: stats.feesCollected, hint: `${stats.pendingPayments} pending`, icon: TrendingUp, iconBg: "bg-violet-50", iconColor: "text-violet-600", accent: "border-violet-100" },
        { title: "Outstanding", value: stats.outstandingFees, hint: `${stats.overdueInvoices} overdue`, icon: TrendingUp, iconBg: "bg-rose-50", iconColor: "text-rose-600", accent: "border-rose-100" },
      ]
    : undefined

  return (
    <div className="space-y-5 pb-8">
      <section className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Dashboard</h1>
            <p className="text-[12px] text-slate-400">Overview of school metrics and activity.</p>
          </div>
        </div>
        <Button
          onClick={() => setIsTodoModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm h-9 px-4 gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add Todo
        </Button>
      </section>

      <StatsCards stats={statCards} isLoading={isLoading} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : (
            <Card className="border-slate-200/80 bg-white shadow-none">
              <CardHeader className="border-b border-slate-100 px-4 py-3">
                <CardTitle className="text-sm font-semibold text-slate-900">System Overview</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Active Classes", value: stats?.activeClasses ?? 0 },
                    { label: "Pending Payments", value: stats?.pendingPayments ?? 0 },
                    { label: "Overdue Invoices", value: stats?.overdueInvoices ?? 0 },
                    { label: "Attendance Today", value: stats?.attendanceMarkedToday ?? 0 },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{item.label}</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <div>
          <TodosWidget />
        </div>
      </div>

      <CreateTodoModal isOpen={isTodoModalOpen} onClose={() => setIsTodoModalOpen(false)} />
    </div>
  )
}
