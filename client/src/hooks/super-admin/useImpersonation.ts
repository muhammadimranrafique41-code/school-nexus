import { useMutation } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api/superAdminApi";

export function useImpersonate() {
  return useMutation({
    mutationFn: ({ targetUserId, targetRole }: { targetUserId: number; targetRole: "owner" | "admin" }) =>
      superAdminApi.impersonate(targetUserId, targetRole),
  });
}

export function useEndImpersonation() {
  return useMutation({
    mutationFn: () => superAdminApi.endImpersonation(),
  });
}
