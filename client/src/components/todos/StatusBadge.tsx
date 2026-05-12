import type { TodoStatus } from "@shared/schema";

const badgeStyles: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
};

export function StatusBadge({ status }: { status: TodoStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold capitalize ${badgeStyles[status] ?? badgeStyles.pending}`}
    >
      {status === "in_progress" ? "In Progress" : status}
    </span>
  );
}
