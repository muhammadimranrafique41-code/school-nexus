import { useQuery } from "@tanstack/react-query";

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
      const res = await fetch(`/api/owner/billing${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch billing");
      const body = await res.json();
      return body.data;
    },
  });
}
