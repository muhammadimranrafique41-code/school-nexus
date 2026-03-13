import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { CreateClassSchema } from "@/lib/validators/classes";
import { getResponseErrorMessage } from "@/lib/utils";
import { z } from "zod";

export function useClasses(filters?: { academicYear?: string; grade?: string }) {
  return useQuery({
    queryKey: [api.classes.list.path, filters],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (filters?.academicYear) searchParams.set("academicYear", filters.academicYear);
      if (filters?.grade) searchParams.set("grade", filters.grade);

      const url = searchParams.toString()
        ? `${api.classes.list.path}?${searchParams.toString()}`
        : api.classes.list.path;

      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch classes"));
      return api.classes.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateClass() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: z.infer<typeof CreateClassSchema>) => {
      const validated = CreateClassSchema.parse(data);
      const res = await fetch("/api/v1/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(validated),
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to create class"));
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.classes.list.path] });
    },
  });
}

