import { Building2, Users, TrendingUp, AlertTriangle, Clock, Ban, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformStats } from "@/lib/api/superAdminApi";

interface StatCard {
  label: string;
  value: string | number;
  Icon: typeof Building2;
  colorClass: string;
}

function formatPKR(paise: number): string {
  return `Rs. ${(paise / 100).toLocaleString()}`;
}

const accentMap: Record<string, string> = {
  "bg-blue-50 text-blue-700": "bg-blue-500",
  "bg-indigo-50 text-indigo-700": "bg-indigo-500",
  "bg-cyan-50 text-cyan-700": "bg-cyan-500",
  "bg-teal-50 text-teal-700": "bg-teal-500",
  "bg-emerald-50 text-emerald-700": "bg-emerald-500",
  "bg-amber-50 text-amber-700": "bg-amber-500",
  "bg-red-50 text-red-700": "bg-red-500",
  "bg-purple-50 text-purple-700": "bg-purple-500",
  "bg-orange-50 text-orange-700": "bg-orange-500",
};

export function PlatformStatCards({ stats }: { stats: PlatformStats }) {
  const cards: StatCard[] = [
    { label: "Total Schools", value: stats.totalOwners, Icon: Building2, colorClass: "bg-blue-50 text-blue-700" },
    { label: "Total Campuses", value: stats.totalCampuses, Icon: Building2, colorClass: "bg-indigo-50 text-indigo-700" },
    { label: "30-Day Growth", value: `${stats.platformGrowthPercent30d}%`, Icon: BarChart3, colorClass: "bg-cyan-50 text-cyan-700" },
    { label: "Total Students", value: stats.totalStudents.toLocaleString(), Icon: Users, colorClass: "bg-teal-50 text-teal-700" },
    { label: "Platform Revenue", value: formatPKR(stats.totalRevenuePaise), Icon: TrendingUp, colorClass: "bg-emerald-50 text-emerald-700" },
    { label: "Pending Dues", value: formatPKR(stats.totalPendingDuesPaise), Icon: AlertTriangle, colorClass: "bg-amber-50 text-amber-700" },
    { label: "Suspended Schools", value: stats.suspendedSchools, Icon: Ban, colorClass: "bg-red-50 text-red-700" },
    { label: "Trial Schools", value: stats.trialSchools, Icon: Clock, colorClass: "bg-purple-50 text-purple-700" },
    { label: "Overdue Invoices", value: stats.overdueInvoicesCount, Icon: AlertTriangle, colorClass: "bg-orange-50 text-orange-700" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
      {cards.map((card) => {
        const accentColor = accentMap[card.colorClass] ?? "bg-slate-500";
        return (
          <div key={card.label} className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <div className={cn("h-1.5", accentColor)} />
            <div className="p-3 md:p-4">
              <card.Icon className={cn("mb-2 h-5 w-5 md:h-6 md:w-6", card.colorClass.split(" ")[1] ?? "text-slate-700")} />
              <p className="text-xs md:text-sm font-medium text-slate-500">{card.label}</p>
              <p className="text-lg md:text-xl font-bold text-slate-900">{card.value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
