import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface CampusRow {
  id: number;
  name: string;
  subdomain: string;
  address: string;
  contactInfo: { phone: string; email: string };
  logoUrl: string | null;
  ownerId: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  studentCount: number;
  staffCount: number;
  familyCount: number;
  incomePaise: number;
  expensesPaise: number;
  pendingDuesPaise: number;
}

export function useCampuses() {
  return useQuery<CampusRow[]>({
    queryKey: ["owner", "campuses"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/owner/campuses");
      const body = await res.json();
      return body.data;
    },
  });
}

export function useCreateCampus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      subdomain: string;
      address: string;
      contactInfo: { phone: string; email: string };
      logoUrl?: string;
    }) => {
      const res = await apiRequest("POST", "/api/owner/campuses", data);
      const body = await res.json();
      return body.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "campuses"] }),
  });
}

export function useUpdateCampus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: { id: number } & Partial<{
      name: string;
      subdomain: string;
      address: string;
      contactInfo: { phone: string; email: string };
      logoUrl?: string;
      isActive: boolean;
    }>) => {
      const res = await apiRequest("PATCH", `/api/owner/campuses/${id}`, data);
      const body = await res.json();
      return body.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "campuses"] }),
  });
}

export function useDeleteCampus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/owner/campuses/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "campuses"] }),
  });
}
