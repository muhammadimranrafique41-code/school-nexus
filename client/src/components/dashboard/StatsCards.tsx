import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Users, GraduationCap, Banknote, TrendingUp } from "lucide-react"

interface StatsCardData {
  title: string
  value: string | number
  hint?: string
  icon: typeof Users
  iconBg: string
  iconColor: string
  accent: string
}

interface StatsCardsProps {
  stats?: StatsCardData[]
  isLoading?: boolean
}

const defaultCards: StatsCardData[] = [
  { title: "Total Students", value: 0, hint: "Enrolled", icon: GraduationCap, iconBg: "bg-indigo-50", iconColor: "text-indigo-600", accent: "border-indigo-100" },
  { title: "Total Teachers", value: 0, hint: "Active faculty", icon: Users, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", accent: "border-emerald-100" },
  { title: "Fees Collected", value: 0, hint: "This month", icon: Banknote, iconBg: "bg-violet-50", iconColor: "text-violet-600", accent: "border-violet-100" },
  { title: "Outstanding", value: 0, hint: "Pending payments", icon: TrendingUp, iconBg: "bg-rose-50", iconColor: "text-rose-600", accent: "border-rose-100" },
]

export function StatsCards({ stats = defaultCards, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title} className={cn("overflow-hidden border bg-white shadow-none transition-shadow hover:shadow-sm", stat.accent)}>
          <div className={cn("h-0.5 w-full bg-gradient-to-r", stat.iconBg)} />
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {stat.title}
                </p>
                <p className="mt-1.5 text-2xl font-bold leading-none text-slate-900">
                  {stat.value}
                </p>
                {stat.hint && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    {stat.hint}
                  </p>
                )}
              </div>
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", stat.iconBg, stat.iconColor)}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
