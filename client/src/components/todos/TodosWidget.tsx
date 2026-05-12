import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TodoItem } from "./TodoItem";
import { CreateTodoModal } from "./CreateTodoModal";
import { useTodosPreview, useUpdateTodoStatus, useDeleteTodo } from "@/hooks/useTodos";
import { toast } from "@/hooks/use-toast";

export function TodosWidget() {
  const [, navigate] = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data, isLoading, error } = useTodosPreview();
  const updateStatus = useUpdateTodoStatus();
  const deleteTodo = useDeleteTodo();

  const handleStatusChange = (id: number, status: "pending" | "completed") => {
    updateStatus.mutate(
      { id, status },
      {
        onSuccess: () => toast({ title: `Todo marked as ${status}` }),
        onError: () => toast({ title: "Error", description: "Failed to update status.", variant: "destructive" }),
      },
    );
  };

  const handleDelete = (id: number) => {
    deleteTodo.mutate(id, {
      onSuccess: () => toast({ title: "Todo deleted" }),
      onError: () => toast({ title: "Error", description: "Failed to delete todo.", variant: "destructive" }),
    });
  };

  const handleEdit = () => {
    toast({ title: "Coming soon", description: "Edit functionality will be available soon." });
  };

  return (
    <>
      <Card className="border-slate-200/80 bg-white shadow-none">
        <CardHeader className="border-b border-slate-100 px-4 py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-900">To-dos</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-7 px-2"
          >
            + Add New
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-10 bg-slate-100" />
              <Skeleton className="h-10 bg-slate-100" />
              <Skeleton className="h-10 bg-slate-100" />
            </div>
          ) : error ? (
            <p className="text-xs text-red-500 p-4">Failed to load todos.</p>
          ) : !data?.data.length ? (
            <div className="p-6 text-center">
              <p className="text-sm text-slate-500">No to-dos yet.</p>
              <p className="text-xs text-slate-400 mt-1">Click + Add New to get started.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {data.data.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
              {data.total > 3 && (
                <div className="px-4 py-2 border-t border-slate-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("/admin/todos")}
                    className="w-full text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 h-7"
                  >
                    See More ({data.total - 3} more)
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <CreateTodoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
