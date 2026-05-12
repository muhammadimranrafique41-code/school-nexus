import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TodoItem } from "@/components/todos/TodoItem";
import { CreateTodoModal } from "@/components/todos/CreateTodoModal";
import { useTodos, useUpdateTodoStatus, useDeleteTodo } from "@/hooks/useTodos";
import { toast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { ListTodo } from "lucide-react";

export default function TodosPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useTodos({ page, limit: 10, status: statusFilter });
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

  const filters = [
    { label: "All", value: undefined },
    { label: "Pending", value: "pending" },
    { label: "Completed", value: "completed" },
  ];

  return (
    <Layout>
      <div className="space-y-5 pb-8">
        <section className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md">
              <ListTodo className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">To-dos</h1>
              <p className="text-[12px] text-slate-400">Manage your personal task list.</p>
            </div>
          </div>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm h-9 px-4 gap-1.5"
          >
            + Add New
          </Button>
        </section>

        <Card className="border-slate-200/80 bg-white shadow-none">
          <CardHeader className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              {filters.map((f) => (
                <Button
                  key={f.label}
                  variant={statusFilter === f.value ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setStatusFilter(f.value);
                    setPage(1);
                  }}
                  className={`text-xs h-7 px-3 ${
                    statusFilter === f.value
                      ? "bg-indigo-600/10 text-indigo-700 border border-indigo-200"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 bg-slate-100" />
                ))}
              </div>
            ) : error ? (
              <p className="text-xs text-red-500 p-4">Failed to load todos.</p>
            ) : !data?.data.length ? (
              <div className="p-10 text-center">
                <ListTodo className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No to-dos found.</p>
                <p className="text-xs text-slate-400 mt-1">
                  {statusFilter
                    ? `No ${statusFilter} to-dos. Try a different filter.`
                    : "Click + Add New to get started."}
                </p>
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

                {data.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                    <p className="text-xs text-slate-400">
                      Page {data.page} of {data.totalPages} ({data.total} total)
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-50 h-7"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={page >= data.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-50 h-7"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateTodoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </Layout>
  );
}
