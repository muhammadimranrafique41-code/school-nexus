import { useQuery } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api/superAdminApi";

export function useSystemHealth() {
  return useQuery({
    queryKey: ["super-admin", "system-health"],
    queryFn: () => superAdminApi.getSystemHealth(),
    refetchInterval: 30_000,
  });
}
