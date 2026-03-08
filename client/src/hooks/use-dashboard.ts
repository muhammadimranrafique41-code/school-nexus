import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { getResponseErrorMessage } from "@/lib/utils";

export function useAdminStats() {
  return useQuery({
    queryKey: [api.dashboard.adminStats.path],
    queryFn: async () => {
      const res = await fetch(api.dashboard.adminStats.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch admin stats"));
      return api.dashboard.adminStats.responses[200].parse(await res.json());
    },
  });
}

export function useStudentStats(studentId: number) {
  return useQuery({
    queryKey: [api.dashboard.studentStats.path, studentId],
    queryFn: async () => {
      const url = `${api.dashboard.studentStats.path}?id=${encodeURIComponent(String(studentId))}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch student stats"));
      return api.dashboard.studentStats.responses[200].parse(await res.json());
    },
    enabled: !!studentId,
  });
}
