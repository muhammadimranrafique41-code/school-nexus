import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { todosApi, type TodoFilters, type CreateTodoInput, type UpdateTodoInput } from "@/lib/api/todos";

export function useTodosPreview() {
  return useQuery({
    queryKey: ["todos", "preview"],
    queryFn: () => todosApi.list({ limit: 3, page: 1 }),
  });
}

export function useTodos(filters: TodoFilters = {}) {
  return useQuery({
    queryKey: ["todos", filters],
    queryFn: () => todosApi.list(filters),
  });
}

export function useCreateTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTodoInput) => todosApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todos"] }),
  });
}

export function useUpdateTodoStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "pending" | "completed" }) =>
      todosApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todos"] }),
  });
}

export function useUpdateTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateTodoInput }) =>
      todosApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todos"] }),
  });
}

export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => todosApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todos"] }),
  });
}
