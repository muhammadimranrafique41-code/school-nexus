import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { useUser } from "./use-auth";
import { getResponseErrorMessage } from "@/lib/utils";

function invalidateFeeQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [api.fees.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.dashboard.adminStats.path] });
  queryClient.invalidateQueries({ queryKey: [api.dashboard.studentStats.path] });
}

export function useFees() {
  const { data: user } = useUser();
  return useQuery({
    queryKey: [api.fees.list.path, user?.id],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (user) {
        headers['x-user-role'] = user.role;
        headers['x-user-id'] = String(user.id);
      }
      const res = await fetch(api.fees.list.path, {
        headers,
        credentials: "include"
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch fees"));
      return api.fees.list.responses[200].parse(await res.json());
    },
    enabled: !!user,
  });
}

export function useCreateFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.fees.create.input>) => {
      const validated = api.fees.create.input.parse(data);
      const res = await fetch(api.fees.create.path, {
        method: api.fees.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to add fee"));
      return api.fees.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      invalidateFeeQueries(queryClient);
    },
  });
}

export function useUpdateFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<z.infer<typeof api.fees.update.input>>) => {
      const validated = api.fees.update.input.parse(updates);
      const url = buildUrl(api.fees.update.path, { id });
      const res = await fetch(url, {
        method: api.fees.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to update fee"));
      return api.fees.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateFeeQueries(queryClient);
    },
  });
}

export function useDeleteFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(buildUrl(api.fees.delete.path, { id }), {
        method: api.fees.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to delete fee"));
      return api.fees.delete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateFeeQueries(queryClient);
    },
  });
}
