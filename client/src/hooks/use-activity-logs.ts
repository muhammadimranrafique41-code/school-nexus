import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const ACTIVITY_LOGS_API = {
  list: "/api/activity-logs",
  detail: (id: number) => `/api/activity-logs/${id}`,
  prune: "/api/activity-logs/prune",
};

export type ActivityLogAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "EXPORT" | "VIEW" | "APPROVE" | "REJECT";

export interface ActivityLog {
  id: number;
  userId: number | null;
  userEmail: string;
  userRole: string;
  action: ActivityLogAction;
  entityType: string;
  entityId: number | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestMethod: string | null;
  requestPath: string | null;
  statusCode: number | null;
  durationMs: number | null;
  createdAt: string;
}

export interface ActivityLogFilters {
  userId?: number;
  userEmail?: string;
  action?: ActivityLogAction;
  entityType?: string;
  entityId?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedActivityLogs {
  logs: ActivityLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function buildQueryString(filters: ActivityLogFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

export function useActivityLogs(filters: ActivityLogFilters) {
  const queryString = buildQueryString(filters);
  return useQuery<PaginatedActivityLogs>({
    queryKey: [ACTIVITY_LOGS_API.list, filters],
    queryFn: async () => {
      const res = await fetch(`${ACTIVITY_LOGS_API.list}?${queryString}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch activity logs");
      const data = await res.json();
      return data.data;
    },
    enabled: filters.page !== undefined,
  });
}

export function useActivityLogDetail(id: number | null) {
  return useQuery<ActivityLog>({
    queryKey: [ACTIVITY_LOGS_API.detail(id ?? 0)],
    queryFn: async () => {
      const res = await fetch(ACTIVITY_LOGS_API.detail(id!), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch activity log detail");
      const data = await res.json();
      return data.data;
    },
    enabled: id !== null,
  });
}

export function usePruneActivityLogs() {
  const queryClient = useQueryClient();
  return useMutation<{ deleted: number }, Error, number>({
    mutationFn: async (retentionDays: number) => {
      const res = await fetch(ACTIVITY_LOGS_API.prune, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to prune activity logs");
      const data = await res.json();
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ACTIVITY_LOGS_API.list] });
    },
  });
}