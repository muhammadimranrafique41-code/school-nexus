import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical, Pencil, CheckCircle, RotateCcw, Trash2 } from "lucide-react";
import type { Todo } from "@shared/schema";

interface ContextMenuProps {
  todo: Todo;
  onEdit: (todo: Todo) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: "pending" | "completed") => void;
}

export function TodoContextMenu({ todo, onEdit, onDelete, onStatusChange }: ContextMenuProps) {
  const isCompleted = todo.status === "completed";
  const toggleLabel = isCompleted ? "Mark Pending" : "Mark Completed";
  const toggleStatus: "pending" | "completed" = isCompleted ? "pending" : "completed";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-slate-600">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-white border-slate-200 text-slate-800 shadow-lg">
        <DropdownMenuItem onClick={() => onEdit(todo)} className="focus:bg-slate-50 focus:text-slate-900">
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onStatusChange(todo.id, toggleStatus)} className="focus:bg-slate-50 focus:text-slate-900">
          {isCompleted ? <RotateCcw className="mr-2 h-4 w-4" /> : <CheckCircle className="mr-2 h-4 w-4" />}
          {toggleLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-slate-100" />
        <DropdownMenuItem
          onClick={() => onDelete(todo.id)}
          className="text-red-500 focus:text-red-600 focus:bg-red-50"
        >
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
