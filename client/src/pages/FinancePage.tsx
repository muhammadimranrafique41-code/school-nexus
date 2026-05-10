import { FeeTable } from "@/components/finance/FeeTable"
import { Banknote, TrendingUp } from "lucide-react"

export default function FinancePage() {
  return (
    <div className="space-y-5 pb-8">
      <section className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 text-white shadow-md">
          <Banknote className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Finance</h1>
          <p className="text-[12px] text-slate-400">Manage fee records, payments, and financial reports.</p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Billed", value: "PKR 0", icon: Banknote, accent: "bg-indigo-50 text-indigo-600" },
          { label: "Collected", value: "PKR 0", icon: TrendingUp, accent: "bg-emerald-50 text-emerald-600" },
          { label: "Outstanding", value: "PKR 0", icon: Banknote, accent: "bg-amber-50 text-amber-600" },
          { label: "Overdue", value: "PKR 0", icon: TrendingUp, accent: "bg-rose-50 text-rose-600" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.accent}`}>
              <item.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500">{item.label}</p>
              <p className="text-base font-bold text-slate-900">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      <FeeTable />
    </div>
  )
}
