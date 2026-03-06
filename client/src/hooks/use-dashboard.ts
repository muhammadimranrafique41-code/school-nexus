import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

export function useAdminStats() {
  return useQuery({
    queryKey: [api.dashboard.adminStats.path],
    queryFn: async () => {
      const res = await fetch(api.dashboard.adminStats.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch admin stats");
      return api.dashboard.adminStats.responses[200].parse(await res.json());
    },
  });
}

export function useStudentStats(studentId: number) {
  return useQuery({
    queryKey: [api.dashboard.studentStats.path, studentId],
    queryFn: async () => {
      const url = buildUrl(api.dashboard.studentStats.path, { id: studentId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch student stats");
      return api.dashboard.studentStats.responses[200].parse(await res.json());
    },
    enabled: !!studentId,
  });
}
