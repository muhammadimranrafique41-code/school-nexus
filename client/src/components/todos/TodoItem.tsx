import { Clock } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { TodoContextMenu } from "./TodoContextMenu";
import type { Todo } from "@shared/schema";

interface TodoItemProps {
  todo: Todo;
  onStatusChange: (id: number, status: "pending" | "completed") => void;
  onDelete: (id: number) => void;
  onEdit: (todo: Todo) => void;
}

function formatReminderDate(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function TodoItem({ todo, onStatusChange, onDelete, onEdit }: TodoItemProps) {
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-slate-100 last:border-b-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="truncate text-sm text-slate-800">{todo.title}</span>
        {todo.dueDate && (
          <span className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
            <Clock className="h-3 w-3" />
            {formatReminderDate(todo.dueDate)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <StatusBadge status={todo.status} />
        <TodoContextMenu
          todo={todo}
          onEdit={onEdit}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  );
}
