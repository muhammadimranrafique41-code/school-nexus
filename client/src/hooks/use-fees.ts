import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

export function useFees() {
  return useQuery({
    queryKey: [api.fees.list.path],
    queryFn: async () => {
      const res = await fetch(api.fees.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch fees");
      return api.fees.list.responses[200].parse(await res.json());
    },
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
      if (!res.ok) throw new Error("Failed to add fee");
      return api.fees.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.fees.list.path] });
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
      if (!res.ok) throw new Error("Failed to update fee");
      return api.fees.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.fees.list.path] });
    },
  });
}
