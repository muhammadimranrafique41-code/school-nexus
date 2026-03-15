import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-100 text-emerald-700",
  completed: "border-slate-200 bg-slate-100 text-slate-700",
  cancelled: "border-rose-200 bg-rose-100 text-rose-700",
};

export function StatusBadge({ status }: { status: "active" | "completed" | "cancelled" }) {
  return (
    <Badge className={cn("capitalize", statusStyles[status])} variant="outline">
      {status}
    </Badge>
  );
}
