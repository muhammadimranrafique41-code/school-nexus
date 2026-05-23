import { BarChart3 } from "lucide-react";
import { usePlatformStats } from "@/hooks/super-admin/usePlatformStats";
import { PlatformStatCards } from "./PlatformStatCards";

export default function PlatformOverviewPage() {
  const { data: stats, isLoading } = usePlatformStats();

  if (isLoading) {
    return <div className="p-4 md:p-6 text-slate-500">Loading platform stats...</div>;
  }

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-950 md:text-2xl">Platform Overview</h1>
          <p className="text-sm text-slate-500">High-level metrics across all schools and campuses.</p>
        </div>
      </div>
      {stats && <PlatformStatCards stats={stats} />}
    </div>
  );
}
