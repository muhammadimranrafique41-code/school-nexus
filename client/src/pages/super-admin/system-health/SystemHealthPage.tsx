import { Activity } from "lucide-react";
import { useSystemHealth } from "@/hooks/super-admin/useSystemHealth";
import { HealthCards } from "./HealthCards";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function SystemHealthPage() {
  const { data: health, isLoading } = useSystemHealth();

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-950 md:text-2xl">System Health</h1>
          <p className="text-sm text-slate-500">Real-time platform infrastructure status.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : health ? (
        <>
          <HealthCards health={health} />

          <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base md:text-lg">Latency Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 text-sm">
                <div>
                  <span className="text-slate-500">API Latency P50:</span>
                  <span className="ml-2 font-medium">
                    {health.apiLatencyP50Ms > 0 ? `${health.apiLatencyP50Ms} ms` : "N/A (tracking not yet enabled)"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">API Latency P95:</span>
                  <span className="ml-2 font-medium">
                    {health.apiLatencyP95Ms > 0 ? `${health.apiLatencyP95Ms} ms` : "N/A (tracking not yet enabled)"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Storage Total:</span>
                  <span className="ml-2 font-medium">
                    {formatBytes(health.storageTotalBytes)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Last Checked:</span>
                  <span className="ml-2 font-medium">
                    {new Date(health.timestamp).toLocaleString("en-PK")}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
