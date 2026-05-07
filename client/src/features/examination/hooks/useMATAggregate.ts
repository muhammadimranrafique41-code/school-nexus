import { useQuery } from "@tanstack/react-query";
import type { ApiResponse, MATAggregate } from "../types";

export function useMATAggregate(classId?: number, academicSessionId?: number, bestOf = 5, outOf = 50) {
  const query = classId && academicSessionId ? `?classId=${classId}&academicSessionId=${academicSessionId}&bestOf=${bestOf}&outOf=${outOf}` : "";
  return useQuery<ApiResponse<MATAggregate[]>>({
    queryKey: [`/api/exams/mat-aggregate${query}`],
    enabled: Boolean(classId && academicSessionId),
  });
}
