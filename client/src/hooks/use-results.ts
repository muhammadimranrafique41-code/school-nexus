import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";
import { useUser } from "./use-auth";

export function useResults() {
  const { data: user } = useUser();
  return useQuery({
    queryKey: [api.results.list.path, user?.id],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (user) {
        headers['x-user-role'] = user.role;
        headers['x-user-id'] = String(user.id);
      }
      const res = await fetch(api.results.list.path, { 
        headers,
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Failed to fetch results");
      return api.results.list.responses[200].parse(await res.json());
    },
    enabled: !!user,
  });
}

export function useCreateResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.results.create.input>) => {
      const validated = api.results.create.input.parse(data);
      const res = await fetch(api.results.create.path, {
        method: api.results.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add result");
      return api.results.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.results.list.path] });
    },
  });
}
