import { useQuery } from "@tanstack/react-query";

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
      const res = await fetch("/api/owner/overview", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch overview");
      const body = await res.json();
      return body.data;
    },
    staleTime: 30_000,
  });
}
