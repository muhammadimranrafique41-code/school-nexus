import { apiRequest } from "@/lib/queryClient";
import type { Todo } from "@shared/schema";

export interface TodoListResponse {
  data: Todo[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CreateTodoInput {
  content: string;
  reminderAt?: string | null;
}

export interface UpdateTodoInput {
  content?: string;
  status?: "pending" | "completed";
  reminderAt?: string | null;
}

export interface TodoFilters {
  page?: number;
  limit?: number;
  status?: string;
}

export const todosApi = {
  list: async (filters: TodoFilters = {}): Promise<TodoListResponse> => {
    const params = new URLSearchParams();
    if (filters.page) params.set("page", String(filters.page));
    if (filters.limit) params.set("limit", String(filters.limit));
    if (filters.status) params.set("status", filters.status);
    const qs = params.toString();
    const res = await apiRequest("GET", `/api/todos${qs ? `?${qs}` : ""}`);
    const body = await res.json();
    return body.data;
  },

  create: async (input: CreateTodoInput): Promise<Todo> => {
    const res = await apiRequest("POST", "/api/todos", input);
    const body = await res.json();
    return body.data;
  },

  update: async (id: number, input: UpdateTodoInput): Promise<Todo> => {
    const res = await apiRequest("PATCH", `/api/todos/${id}`, input);
    const body = await res.json();
    return body.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiRequest("DELETE", `/api/todos/${id}`);
  },
};
