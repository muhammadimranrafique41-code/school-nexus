import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api/superAdminApi";

export function useBilling(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["super-admin", "billing", params],
    queryFn: () => superAdminApi.getBilling(params),
  });
}

export function useOverrideBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) =>
      superAdminApi.overrideBilling(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super-admin", "billing"] }),
  });
}
