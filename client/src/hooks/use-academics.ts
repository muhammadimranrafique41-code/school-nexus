import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { getResponseErrorMessage } from "@/lib/utils";

function invalidateAcademicQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [api.academics.list.path] });
}

export function useAcademics() {
  return useQuery({
    queryKey: [api.academics.list.path],
    queryFn: async () => {
      const res = await fetch(api.academics.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch classes"));
      return api.academics.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateAcademic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.academics.create.input>) => {
      const validated = api.academics.create.input.parse(data);
      const res = await fetch(api.academics.create.path, {
        method: api.academics.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to create subject"));
      return api.academics.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      invalidateAcademicQueries(queryClient);
    },
  });
}

export function useUpdateAcademic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<z.infer<typeof api.academics.update.input>>) => {
      const validated = api.academics.update.input.parse(updates);
      const res = await fetch(buildUrl(api.academics.update.path, { id }), {
        method: api.academics.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to update subject"));
      return api.academics.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateAcademicQueries(queryClient);
    },
  });
}

export function useDeleteAcademic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(buildUrl(api.academics.delete.path, { id }), {
        method: api.academics.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to delete subject"));
      return api.academics.delete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateAcademicQueries(queryClient);
    },
  });
}