import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { useUser } from "./use-auth";
import { getResponseErrorMessage } from "@/lib/utils";

function invalidateResultQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [api.results.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.student.results.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.student.results.detail.path] });
  queryClient.invalidateQueries({ queryKey: [api.dashboard.teacherStats.path] });
}

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
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch results"));
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
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to add result"));
      return api.results.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      invalidateResultQueries(queryClient);
    },
  });
}

export function useUpdateResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<z.infer<typeof api.results.update.input>>) => {
      const validated = api.results.update.input.parse(updates);
      const res = await fetch(buildUrl(api.results.update.path, { id }), {
        method: api.results.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to update result"));
      return api.results.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateResultQueries(queryClient);
    },
  });
}

export function useDeleteResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(buildUrl(api.results.delete.path, { id }), {
        method: api.results.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to delete result"));
      return api.results.delete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateResultQueries(queryClient);
    },
  });
}

export function useStudentResultsOverview() {
  return useQuery({
    queryKey: [api.student.results.list.path],
    queryFn: async () => {
      const res = await fetch(api.student.results.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch results overview"));
      return api.student.results.list.responses[200].parse(await res.json());
    },
  });
}

export function useStudentResultDetail(examId?: string | null) {
  return useQuery({
    queryKey: [api.student.results.detail.path, examId ?? "none"],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.student.results.detail.path, { examId: examId ?? "" }), { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch result details"));
      return api.student.results.detail.responses[200].parse(await res.json());
    },
    enabled: !!examId,
  });
}
