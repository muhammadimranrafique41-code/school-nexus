import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface BillingRecord {
  id: number;
  campusId: number;
  amountPaise: number;
  currency: string;
  status: "PAID" | "PENDING" | "OVERDUE" | "CANCELLED";
  billingMonth: number;
  billingYear: number;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useBilling(status?: string) {
  return useQuery<BillingRecord[]>({
    queryKey: ["owner", "billing", status],
    queryFn: async () => {
      const params = status ? `?status=${status}` : "";
      const res = await apiRequest("GET", `/api/owner/billing${params}`);
      const body = await res.json();
      return body.data;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}
