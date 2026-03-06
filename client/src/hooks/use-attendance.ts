import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";
import { useUser } from "./use-auth";

export function useAttendance() {
  const { data: user } = useUser();
  return useQuery({
    queryKey: [api.attendance.list.path, user?.id],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (user) {
        headers['x-user-role'] = user.role;
        headers['x-user-id'] = String(user.id);
      }
      const res = await fetch(api.attendance.list.path, { 
        headers,
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Failed to fetch attendance");
      return api.attendance.list.responses[200].parse(await res.json());
    },
    enabled: !!user,
  });
}

export function useCreateAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.attendance.create.input>) => {
      const validated = api.attendance.create.input.parse(data);
      const res = await fetch(api.attendance.create.path, {
        method: api.attendance.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark attendance");
      return api.attendance.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.attendance.list.path] });
    },
  });
}
