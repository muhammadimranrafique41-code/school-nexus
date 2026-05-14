import { Activity, Database, HardDrive, Wifi } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SystemHealth } from "@/lib/api/superAdminApi";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface HealthCardProps {
  title: string;
  value: string | number;
  unit?: string;
  status: "healthy" | "warning" | "critical";
  Icon: typeof Activity;
}

function HealthCard({ title, value, unit, status, Icon }: HealthCardProps) {
  const statusColors = {
    healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    critical: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <Card className={statusColors[status]}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-5 w-5 opacity-70" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {value}{unit && <span className="text-sm ml-1 opacity-70">{unit}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export function HealthCards({ health }: { health: SystemHealth }) {
  const dbStatus = health.databaseLatencyMs < 200
    ? "healthy"
    : health.databaseLatencyMs < 500
    ? "warning"
    : "critical";

  const storagePercent = health.storageTotalBytes > 0
    ? health.storageUsedBytes / health.storageTotalBytes
    : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <HealthCard
        title="Database"
        value={health.databaseConnected ? "Connected" : "Disconnected"}
        Icon={Database}
        status={health.databaseConnected ? "healthy" : "critical"}
      />
      <HealthCard
        title="DB Latency"
        value={health.databaseLatencyMs}
        unit="ms"
        Icon={Database}
        status={dbStatus}
      />
      <HealthCard
        title="Storage Used"
        value={formatBytes(health.storageUsedBytes)}
        Icon={HardDrive}
        status={storagePercent > 0.8 ? "warning" : "healthy"}
      />
      <HealthCard
        title="Active Sessions"
        value={health.activeSessions}
        Icon={Wifi}
        status={health.activeSessions > 100 ? "warning" : "healthy"}
      />
    </div>
  );
}
