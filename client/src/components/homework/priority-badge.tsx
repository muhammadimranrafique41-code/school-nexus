import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const priorityStyles: Record<string, string> = {
  low: "border-slate-200 bg-slate-100 text-slate-600",
  medium: "border-blue-200 bg-blue-100 text-blue-700",
  high: "border-orange-200 bg-orange-100 text-orange-700",
  urgent: "border-rose-200 bg-rose-100 text-rose-700",
};

export function PriorityBadge({ priority }: { priority: "low" | "medium" | "high" | "urgent" }) {
  return (
    <Badge className={cn("capitalize", priorityStyles[priority])} variant="outline">
      {priority}
    </Badge>
  );
}
