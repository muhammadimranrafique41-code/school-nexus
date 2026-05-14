import { useQuery } from "@tanstack/react-query";
import { superAdminApi, type PlatformStats } from "@/lib/api/superAdminApi";

export function usePlatformStats() {
  return useQuery<PlatformStats>({
    queryKey: ["super-admin", "platform-stats"],
    queryFn: () => superAdminApi.getPlatformStats(),
    staleTime: 60_000,
  });
}
