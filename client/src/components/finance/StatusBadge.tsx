import { Badge } from "@/components/ui/badge";

type Status = "overdue" | "current" | "advance" | "paid";

const CONFIG: Record<Status, { label: string; className: string }> = {
  overdue:  { label: "OVERDUE",  className: "bg-red-100 text-red-700 border-red-200" },
  current:  { label: "CURRENT",  className: "bg-blue-100 text-blue-700 border-blue-200" },
  advance:  { label: "ADVANCE",  className: "bg-green-100 text-green-700 border-green-200" },
  paid:     { label: "PAID",     className: "bg-slate-100 text-slate-500 border-slate-200" },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, className } = CONFIG[status];
  return (
    <Badge variant="outline" className={`text-xs font-semibold ${className}`}>
      {label}
    </Badge>
  );
}
