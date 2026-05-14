import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api/superAdminApi";

export function useOwners() {
  return useQuery({
    queryKey: ["super-admin", "owners"],
    queryFn: () => superAdminApi.getOwners(),
  });
}

export function useOwner(id: number) {
  return useQuery({
    queryKey: ["super-admin", "owners", id],
    queryFn: () => superAdminApi.getOwner(id),
    enabled: !!id,
  });
}

export function useCreateOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => superAdminApi.createOwner(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super-admin", "owners"] }),
  });
}

export function useUpdateOwnerStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) =>
      superAdminApi.updateOwnerStatus(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super-admin", "owners"] }),
  });
}
