import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ApiResponse, ExamSession, ExamStatistics } from "../types";

export function useExamSessions(classId?: number) {
  const query = classId ? `?classId=${classId}` : "";
  return useQuery<ApiResponse<ExamSession[]>>({ 
    queryKey: [`/api/exams/sessions${query}`],
    staleTime: 30000, // Cache for 30 seconds to avoid refetching
  });
}

export function useCreateExamSession() {
  return useMutation({
    mutationFn: async (payload: unknown) => {
      const response = await apiRequest("POST", "/api/exams/sessions", payload);
      return (await response.json()) as ApiResponse<ExamSession>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/exams/sessions"] }),
  });
}

export function useExamStatistics(sessionId?: number) {
  return useQuery<ApiResponse<ExamStatistics>>({
    queryKey: [`/api/exams/sessions/${sessionId}/statistics`],
    enabled: Boolean(sessionId),
  });
}
