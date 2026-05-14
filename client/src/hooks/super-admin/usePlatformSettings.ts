import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api/superAdminApi";

export function usePlatformSettings() {
  return useQuery({
    queryKey: ["super-admin", "platform-settings"],
    queryFn: () => superAdminApi.getSettings(),
  });
}

export function useUpdatePlatformSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      superAdminApi.updateSetting(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super-admin", "platform-settings"] }),
  });
}
