import { usePlatformStats } from "@/hooks/super-admin/usePlatformStats";
import { PlatformStatCards } from "./PlatformStatCards";

export default function PlatformOverviewPage() {
  const { data: stats, isLoading } = usePlatformStats();

  if (isLoading) {
    return <div className="text-slate-500">Loading platform stats...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Overview</h1>
        <p className="text-sm text-slate-500">
          High-level metrics across all schools and campuses.
        </p>
      </div>
      {stats && <PlatformStatCards stats={stats} />}
    </div>
  );
}
