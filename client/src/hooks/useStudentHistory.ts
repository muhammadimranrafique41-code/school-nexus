/**
 * @file useStudentHistory.ts
 * @description TanStack Query hook for fetching a student's complete history
 *   (fee ledger, academic records, class transitions) from the server.
 *
 * @module client/src/hooks/useStudentHistory
 */

import { useQuery } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────────────

/** A single fee record in the student's history. */
export interface FeeHistoryItem {
  id: number;
  studentId: number;
  invoiceNumber: string | null;
  description: string;
  amount: number;
  paidAmount: number;
  remainingBalance: number;
  billingPeriod: string;
  dueDate: string;
  status: string;
  feeType: string;
  createdAt: string;
}

/** A single academic record joined with class details. */
export interface AcademicHistoryItem {
  id: number;
  studentId: number;
  classId: number | null;
  grade: string | null;
  academicYear: string;
  sessionStart: string;
  sessionEnd: string | null;
  className: string | null;
  classStream: string | null;
}

/** A single class-transition record. */
export interface ClassTransitionItem {
  id: number;
  studentId: number;
  fromClassId: number | null;
  toClassId: number | null;
  transitionDate: string;
  reason: string | null;
  notes: string | null;
  fromClassName: string | null;
  toClassName: string | null;
}

/** Shape of the data returned by the `/api/student/history/:studentId` endpoint. */
export interface StudentHistoryData {
  feeHistory: FeeHistoryItem[];
  academicHistory: AcademicHistoryItem[];
  transitions: ClassTransitionItem[];
}

// ── Fetch helper ───────────────────────────────────────────────────────────

/**
 * Fetch student history from the API.
 *
 * Throws a descriptive `Error` on non-2xx responses so TanStack Query
 * can surface it via `error`.
 */
async function fetchStudentHistory(
  studentId: number
): Promise<StudentHistoryData> {
  const res = await fetch(`/api/student/history/${studentId}`, {
    credentials: "include",
  });

  if (!res.ok) {
    // Attempt to extract a server-provided error message
    let serverMessage = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") serverMessage = body.error;
      else if (typeof body?.message === "string") serverMessage = body.message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(serverMessage);
  }

  const body = await res.json();
  // The server wraps data in { success: true, data: … }
  return (body?.data ?? body) as StudentHistoryData;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Fetch and cache the complete history for a student.
 *
 * @param studentId - The student's user ID, or `null` to skip the query.
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useStudentHistory(studentId);
 * ```
 */
export function useStudentHistory(studentId: number | null) {
  return useQuery<StudentHistoryData, Error>({
    queryKey: ["studentHistory", studentId],
    queryFn: () => fetchStudentHistory(studentId as number),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Retry transient errors (network / 5xx) up to 1 time.
      // Do NOT retry 4xx client errors.
      if (error?.message?.includes("40")) return false;
      return failureCount < 1;
    },
  });
}
