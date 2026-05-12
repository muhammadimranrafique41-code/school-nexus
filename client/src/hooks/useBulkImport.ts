import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { getResponseErrorMessage } from "@/lib/utils";

export interface RowError {
  row: number;
  field: string;
  value: string;
  reason: string;
}

export interface ImportResponse {
  success: boolean;
  imported: number;
  skipped: number;
  errors: RowError[];
  message: string;
}

export function useBulkImportFamilies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/import/families", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data: ImportResponse = await res.json();
      if (!data.success && data.errors.length > 0 && data.imported === 0) {
        throw new Error(data.message);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.families.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.families.dashboard.path] });
    },
  });
}

export function useBulkImportStudents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/import/students", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data: ImportResponse = await res.json();
      if (!data.success && data.errors.length > 0 && data.imported === 0) {
        throw new Error(data.message);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.students.list.path] });
    },
  });
}
