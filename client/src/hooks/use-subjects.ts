import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { getResponseErrorMessage } from "@/lib/utils";
import type { z } from "zod";

const SUBJECTS_KEY = api.subjects.list.path;

export type Subject = {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
  createdAt?: string | Date;
};

export type CreateSubjectInput = {
  name: string;
  code?: string | null;
  description?: string | null;
};

export type UpdateSubjectInput = Partial<CreateSubjectInput>;

// ── List ──────────────────────────────────────────────────────────────────────

export function useSubjects() {
  return useQuery<Subject[]>({
    queryKey: [SUBJECTS_KEY],
    queryFn: async () => {
      const res = await fetch(api.subjects.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch subjects"));
      return res.json();
    },
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateSubject() {
  const queryClient = useQueryClient();
  return useMutation<Subject, Error, CreateSubjectInput>({
    mutationFn: async (data) => {
      const res = await fetch(api.subjects.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to create subject"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUBJECTS_KEY] });
    },
  });
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateSubject() {
  const queryClient = useQueryClient();
  return useMutation<Subject, Error, { id: number } & UpdateSubjectInput>({
    mutationFn: async ({ id, ...data }) => {
      const res = await fetch(api.subjects.update.path.replace(":id", String(id)), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to update subject"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUBJECTS_KEY] });
    },
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteSubject() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await fetch(api.subjects.delete.path.replace(":id", String(id)), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to delete subject"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUBJECTS_KEY] });
    },
  });
}
