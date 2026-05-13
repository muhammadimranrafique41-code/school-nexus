import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface OverviewStats {
  totalCampuses: number;
  totalStudents: number;
  totalStaff: number;
  totalFamilies: number;
  totalIncomePaise: number;
  totalExpensesPaise: number;
  totalPendingDuesPaise: number;
  pendingBillingMonths: number;
}

export function useOverview() {
  return useQuery<OverviewStats>({
    queryKey: ["owner", "overview"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/owner/overview");
      const body = await res.json();
      return body.data;
    },
    staleTime: 30_000,
  });
}
