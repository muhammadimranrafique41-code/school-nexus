import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
      const res = await fetch("/api/owner/campuses", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch campuses");
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
      const res = await fetch("/api/owner/campuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create campus");
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
      const res = await fetch(`/api/owner/campuses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update campus");
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
      const res = await fetch(`/api/owner/campuses/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete campus");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "campuses"] }),
  });
}
