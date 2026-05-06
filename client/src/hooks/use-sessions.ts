/**
 * use-sessions.ts
 *
 * TanStack Query hooks for the Academic Sessions & Student Promotion APIs.
 * All route contracts are sourced from `sessionsApi` in shared/routes.ts to
 * guarantee full type safety between client and server.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionsApi } from "@shared/routes";
import { getResponseErrorMessage } from "@/lib/utils";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Inferred types from the shared route contracts
// ─────────────────────────────────────────────────────────────────────────────

export type AcademicSession = z.infer<
  typeof sessionsApi.academicSessions.list.responses[200]
>[number];

export type PromotionHistoryItem = z.infer<
  typeof sessionsApi.promotions.studentHistory.responses[200]
>[number];

export type BulkPromoteResult = z.infer<
  typeof sessionsApi.promotions.bulkPromote.responses[200]
>;

// ─────────────────────────────────────────────────────────────────────────────
// Query keys (centralised to avoid typos)
// ─────────────────────────────────────────────────────────────────────────────

export const sessionKeys = {
  all: [sessionsApi.academicSessions.list.path] as const,
  current: [sessionsApi.academicSessions.current.path] as const,
  detail: (id: number) => [sessionsApi.academicSessions.get.path, id] as const,
  studentHistory: (studentId: number) =>
    [sessionsApi.promotions.studentHistory.path, studentId] as const,
  classHistory: (classId: number) =>
    [sessionsApi.promotions.classHistory.path, classId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Academic Session hooks
// ─────────────────────────────────────────────────────────────────────────────

/** List all academic sessions, newest first. */
export function useAcademicSessions() {
  return useQuery({
    queryKey: sessionKeys.all,
    queryFn: async () => {
      const res = await fetch(sessionsApi.academicSessions.list.path, {
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to fetch academic sessions")
        );
      return sessionsApi.academicSessions.list.responses[200].parse(
        await res.json()
      );
    },
  });
}

/** Get the currently active academic session (may be null). */
export function useCurrentAcademicSession() {
  return useQuery({
    queryKey: sessionKeys.current,
    queryFn: async () => {
      const res = await fetch(sessionsApi.academicSessions.current.path, {
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to fetch current session")
        );
      return sessionsApi.academicSessions.current.responses[200].parse(
        await res.json()
      );
    },
  });
}

/** Create a new academic session. */
export function useCreateAcademicSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: z.infer<typeof sessionsApi.academicSessions.create.input>
    ) => {
      const validated = sessionsApi.academicSessions.create.input.parse(input);
      const res = await fetch(sessionsApi.academicSessions.create.path, {
        method: sessionsApi.academicSessions.create.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(validated),
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to create academic session")
        );
      return sessionsApi.academicSessions.create.responses[201].parse(
        await res.json()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: sessionKeys.current });
    },
  });
}

/** Partially update an academic session. */
export function useUpdateAcademicSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: { id: number } & z.infer<
      typeof sessionsApi.academicSessions.update.input
    >) => {
      const validated =
        sessionsApi.academicSessions.update.input.parse(input);
      const res = await fetch(
        sessionsApi.academicSessions.update.path.replace(":id", String(id)),
        {
          method: sessionsApi.academicSessions.update.method,
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(validated),
        }
      );
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to update academic session")
        );
      return sessionsApi.academicSessions.update.responses[200].parse(
        await res.json()
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: sessionKeys.current });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(vars.id) });
    },
  });
}

/** Mark a session as the current one. */
export function useSetCurrentSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(
        sessionsApi.academicSessions.setCurrent.path.replace(":id", String(id)),
        {
          method: sessionsApi.academicSessions.setCurrent.method,
          credentials: "include",
        }
      );
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to set current session")
        );
      return sessionsApi.academicSessions.setCurrent.responses[200].parse(
        await res.json()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: sessionKeys.current });
    },
  });
}

/** Delete a non-current academic session. */
export function useDeleteAcademicSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(
        sessionsApi.academicSessions.delete.path.replace(":id", String(id)),
        {
          method: sessionsApi.academicSessions.delete.method,
          credentials: "include",
        }
      );
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to delete academic session")
        );
      return sessionsApi.academicSessions.delete.responses[200].parse(
        await res.json()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: sessionKeys.current });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotion hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Promote a single student to a new class. */
export function usePromoteStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: z.infer<typeof sessionsApi.promotions.promoteStudent.input>
    ) => {
      const validated =
        sessionsApi.promotions.promoteStudent.input.parse(input);
      const res = await fetch(sessionsApi.promotions.promoteStudent.path, {
        method: sessionsApi.promotions.promoteStudent.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(validated),
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to promote student")
        );
      return sessionsApi.promotions.promoteStudent.responses[201].parse(
        await res.json()
      );
    },
    onSuccess: (_data, vars) => {
      // Invalidate the promoted student's history and the classes list
      queryClient.invalidateQueries({
        queryKey: sessionKeys.studentHistory(vars.studentId),
      });
      queryClient.invalidateQueries({
        queryKey: sessionKeys.classHistory(vars.toClassId),
      });
    },
  });
}

/** Bulk-promote all students in a source class to a target class. */
export function useBulkPromote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: z.infer<typeof sessionsApi.promotions.bulkPromote.input>
    ) => {
      const validated = sessionsApi.promotions.bulkPromote.input.parse(input);
      const res = await fetch(sessionsApi.promotions.bulkPromote.path, {
        method: sessionsApi.promotions.bulkPromote.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(validated),
      });
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(res, "Failed to bulk promote class")
        );
      return sessionsApi.promotions.bulkPromote.responses[200].parse(
        await res.json()
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.classHistory(vars.fromClassId),
      });
      queryClient.invalidateQueries({
        queryKey: sessionKeys.classHistory(vars.toClassId),
      });
    },
  });
}

/** Get the full promotion history for a specific student. */
export function useStudentPromotionHistory(studentId: number | null) {
  return useQuery({
    queryKey: sessionKeys.studentHistory(studentId ?? 0),
    enabled: studentId !== null && studentId > 0,
    queryFn: async () => {
      const res = await fetch(
        sessionsApi.promotions.studentHistory.path.replace(
          ":studentId",
          String(studentId)
        ),
        { credentials: "include" }
      );
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(
            res,
            "Failed to fetch student promotion history"
          )
        );
      return sessionsApi.promotions.studentHistory.responses[200].parse(
        await res.json()
      );
    },
  });
}

/** Get all promotions that targeted a specific class. */
export function useClassPromotionHistory(classId: number | null) {
  return useQuery({
    queryKey: sessionKeys.classHistory(classId ?? 0),
    enabled: classId !== null && classId > 0,
    queryFn: async () => {
      const res = await fetch(
        sessionsApi.promotions.classHistory.path.replace(
          ":classId",
          String(classId)
        ),
        { credentials: "include" }
      );
      if (!res.ok)
        throw new Error(
          await getResponseErrorMessage(
            res,
            "Failed to fetch class promotion history"
          )
        );
      return sessionsApi.promotions.classHistory.responses[200].parse(
        await res.json()
      );
    },
  });
}
