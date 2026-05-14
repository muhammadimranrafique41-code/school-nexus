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
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className={cn("rounded-2xl p-5", card.colorClass)}>
          <card.Icon className="mb-3 h-7 w-7 opacity-70" />
          <p className="text-sm font-medium opacity-80">{card.label}</p>
          <p className="text-2xl font-bold">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
