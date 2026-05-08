import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ApiResponse, MarkEntryStudent } from "../types";

export function useExamMarks(subjectId?: number) {
  return useQuery<ApiResponse<MarkEntryStudent[]>>({
    queryKey: [`/api/exams/subjects/${subjectId ?? 0}/marks`],
    enabled: Boolean(subjectId && subjectId > 0),
  });
}

export function useSaveExamMarks(subjectId?: number) {
  return useMutation({
    mutationFn: async (entries: unknown[]) => {
      if (!subjectId) throw new Error("Subject is required");
      const response = await apiRequest("POST", `/api/exams/subjects/${subjectId}/marks`, { entries });
      return (await response.json()) as ApiResponse<unknown>;
    },
    onSuccess: () => {
      if (subjectId) queryClient.invalidateQueries({ queryKey: [`/api/exams/subjects/${subjectId}/marks`] });
    },
  });
}
