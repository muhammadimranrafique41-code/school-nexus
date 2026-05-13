import {
  Building2,
  Users,
  Briefcase,
  Heart,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from "lucide-react";
import { useOverview } from "@/hooks/my-school/useOverview";
import { useCampuses } from "@/hooks/my-school/useCampuses";
import { StatCard } from "./StatCard";
import { PaymentDueBanner } from "@/components/my-school/PaymentDueBanner";
import { PerformanceChart } from "./PerformanceChart";
import { TopCampusesList } from "./TopCampusesList";
import { MySchoolSubNav } from "../MySchoolSubNav";

function formatPaise(paise: number) {
  return `Rs. ${(paise / 100).toLocaleString()}`;
}

export default function OverviewPage() {
  const { data: stats, isLoading } = useOverview();
  const { data: campuses, isLoading: campusesLoading } = useCampuses();

  const statCards = stats
    ? [
        {
          label: "Campuses",
          value: stats.totalCampuses,
          Icon: Building2,
          colorClass: "bg-blue-50 text-blue-700",
        },
        {
          label: "Students",
          value: stats.totalStudents,
          Icon: Users,
          colorClass: "bg-teal-50 text-teal-700",
        },
        {
          label: "Staff",
          value: stats.totalStaff,
          Icon: Briefcase,
          colorClass: "bg-purple-50 text-purple-700",
        },
        {
          label: "Families",
          value: stats.totalFamilies,
          Icon: Heart,
          colorClass: "bg-amber-50 text-amber-700",
        },
        {
          label: "Income",
          value: formatPaise(stats.totalIncomePaise),
          Icon: TrendingUp,
          colorClass: "bg-emerald-50 text-emerald-700",
        },
        {
          label: "Expenses",
          value: formatPaise(stats.totalExpensesPaise),
          Icon: TrendingDown,
          colorClass: "bg-orange-50 text-orange-700",
        },
        {
          label: "Total Pending Dues",
          value: formatPaise(stats.totalPendingDuesPaise),
          Icon: AlertCircle,
          colorClass: "bg-red-50 text-red-700",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <MySchoolSubNav />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Overview
        </h1>
        <p className="text-sm text-slate-500">
          Summary of all your campuses and their performance.
        </p>
      </div>

      <PaymentDueBanner pendingMonths={stats?.pendingBillingMonths ?? 0} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {isLoading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl bg-slate-100"
              />
            ))
          : statCards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PerformanceChart isLoading={isLoading} />
        </div>
        <div>
          <TopCampusesList
            campuses={campuses}
            isLoading={campusesLoading}
          />
        </div>
      </div>
    </div>
  );
}
