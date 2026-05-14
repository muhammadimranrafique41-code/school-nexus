import { useQuery } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api/superAdminApi";

export function useAuditLogs(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["super-admin", "audit-logs", params],
    queryFn: () => superAdminApi.getAuditLogs(params),
  });
}
