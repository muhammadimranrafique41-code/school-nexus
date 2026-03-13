import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { getResponseErrorMessage } from "@/lib/utils";

const assignTeacherInputSchema = z.object({
  teacherId: z.coerce.number().int().positive(),
  subjects: z.array(z.string().min(1)).min(1).max(5),
  periodsPerWeek: z.coerce.number().int().min(1).max(8),
  priority: z.coerce.number().int().min(1).max(5).default(3),
});

export type AssignTeacherInput = z.infer<typeof assignTeacherInputSchema>;

export function useClassTeachers(classId: number) {
  return useQuery({
    queryKey: [api.classes.teachers.list.path, classId],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.classes.teachers.list.path, { id: classId }), {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch class teachers"));
      return api.classes.teachers.list.responses[200].parse(await res.json());
    },
    enabled: Number.isFinite(classId) && classId > 0,
  });
}

export function useAssignClassTeacher(classId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (raw: AssignTeacherInput) => {
      const validated = assignTeacherInputSchema.parse(raw);
      const url = buildUrl("/api/v1/classes/:id/assign-teacher", { id: classId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(validated),
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to assign teacher"));
      return (await res.json()) as { success: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.classes.teachers.list.path, classId] });
    },
  });
}

