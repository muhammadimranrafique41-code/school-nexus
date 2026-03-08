import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { getResponseErrorMessage } from "@/lib/utils";

function invalidateUserRelatedQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.students.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.teachers.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.attendance.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.results.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.fees.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.dashboard.adminStats.path] });
}

export function useUsers() {
  return useQuery({
    queryKey: [api.users.list.path],
    queryFn: async () => {
      const res = await fetch(api.users.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch users"));
      return api.users.list.responses[200].parse(await res.json());
    },
  });
}

export function useStudents() {
  return useQuery({
    queryKey: [api.students.list.path],
    queryFn: async () => {
      const res = await fetch(api.students.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch students"));
      return api.students.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.users.create.input>) => {
      const validated = api.users.create.input.parse(data);
      const res = await fetch(api.users.create.path, {
        method: api.users.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to create user"));
      return api.users.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      invalidateUserRelatedQueries(queryClient);
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: number } & z.infer<typeof api.users.update.input>) => {
      const { id, ...updates } = data;
      const validated = api.users.update.input.parse(updates);
      const res = await fetch(buildUrl(api.users.update.path, { id }), {
        method: api.users.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to update user"));
      return api.users.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateUserRelatedQueries(queryClient);
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(buildUrl(api.users.delete.path, { id }), {
        method: api.users.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to delete user"));
      return api.users.delete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateUserRelatedQueries(queryClient);
    },
  });
}
