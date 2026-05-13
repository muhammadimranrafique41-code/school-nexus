import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  Icon: LucideIcon;
  colorClass: string;
}

export function StatCard({ label, value, Icon, colorClass }: Props) {
  return (
    <div className={cn("rounded-2xl p-5", colorClass)}>
      <Icon className="mb-3 h-7 w-7 opacity-70" />
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
