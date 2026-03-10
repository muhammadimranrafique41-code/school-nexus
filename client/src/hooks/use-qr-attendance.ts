import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";

type QrHistoryFilters = {
  userId?: number;
  role?: "student" | "teacher";
  attendanceDate?: string;
};

export type QrScanInput = z.input<typeof api.qrAttendance.scan.input>;
export type QrScanPayload = z.infer<typeof api.qrAttendance.scan.input>;
export type QrScanResponseEnvelope = z.infer<(typeof api.qrAttendance.scan.responses)[200]>;

async function parseEnvelope<T extends z.ZodTypeAny>(response: Response, schema: T, fallbackMessage: string) {
  const body = await response.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!response.ok) {
    if (parsed.success && parsed.data && typeof parsed.data === "object" && "error" in parsed.data && typeof parsed.data.error === "string") {
      throw new Error(parsed.data.error);
    }
    throw new Error(fallbackMessage);
  }

  if (!parsed.success) {
    throw new Error(fallbackMessage);
  }

  if (!parsed.data.success || !parsed.data.data) {
    throw new Error(parsed.data.error || fallbackMessage);
  }

  return parsed.data;
}

function buildHistorySearch(filters: QrHistoryFilters) {
  const search = new URLSearchParams();

  if (filters.userId) search.set("userId", String(filters.userId));
  if (filters.role) search.set("role", filters.role);
  if (filters.attendanceDate) search.set("attendanceDate", filters.attendanceDate);

  const query = search.toString();
  return query ? `?${query}` : "";
}

export function invalidateQrAttendanceQueries() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [api.qrAttendance.profiles.list.method, api.qrAttendance.profiles.list.path] }),
    queryClient.invalidateQueries({ queryKey: [api.qrAttendance.history.method, api.qrAttendance.history.path] }),
    queryClient.invalidateQueries({ queryKey: [api.qrAttendance.myCard.method, api.qrAttendance.myCard.path] }),
    queryClient.invalidateQueries({ queryKey: [api.student.attendance.list.path] }),
    queryClient.invalidateQueries({ queryKey: [api.student.attendance.summary.path] }),
    queryClient.invalidateQueries({ queryKey: [api.teacher.attendance.history.path] }),
    queryClient.invalidateQueries({ queryKey: [api.dashboard.adminStats.path] }),
    queryClient.invalidateQueries({ queryKey: [api.dashboard.studentStats.path] }),
    queryClient.invalidateQueries({ queryKey: [api.dashboard.teacherStats.path] }),
  ]);
}

export async function submitQrAttendanceScan(input: QrScanInput) {
  const validated: QrScanPayload = api.qrAttendance.scan.input.parse(input);
  const response = await fetch(api.qrAttendance.scan.path, {
    method: api.qrAttendance.scan.method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validated),
  });

  return parseEnvelope(response, api.qrAttendance.scan.responses[200], "Unable to record QR attendance");
}

export function useQrProfiles() {
  return useQuery({
    queryKey: [api.qrAttendance.profiles.list.method, api.qrAttendance.profiles.list.path],
    queryFn: async () => {
      const response = await fetch(api.qrAttendance.profiles.list.path, { credentials: "include" });
      const parsed = await parseEnvelope(response, api.qrAttendance.profiles.list.responses[200], "Unable to load QR profiles");
      return parsed.data;
    },
  });
}

export function useIssueQrProfile() {
  return useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch(`/api/qr-attendance/profiles/${userId}/issue`, {
        method: "POST",
        credentials: "include",
      });
      return parseEnvelope(response, api.qrAttendance.profiles.issue.responses[200], "Unable to issue QR profile");
    },
    onSuccess: async () => {
      await invalidateQrAttendanceQueries();
    },
  });
}

export function useRegenerateQrProfile() {
  return useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch(`/api/qr-attendance/profiles/${userId}/regenerate`, {
        method: "POST",
        credentials: "include",
      });
      return parseEnvelope(response, api.qrAttendance.profiles.regenerate.responses[200], "Unable to regenerate QR profile");
    },
    onSuccess: async () => {
      await invalidateQrAttendanceQueries();
    },
  });
}

export function useUpdateQrProfileStatus() {
  return useMutation({
    mutationFn: async (input: { userId: number; isActive: boolean }) => {
      const response = await fetch(`/api/qr-attendance/profiles/${input.userId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: input.isActive }),
      });
      return parseEnvelope(response, api.qrAttendance.profiles.updateStatus.responses[200], "Unable to update QR status");
    },
    onSuccess: async () => {
      await invalidateQrAttendanceQueries();
    },
  });
}

export function useMyQrCard() {
  return useQuery({
    queryKey: [api.qrAttendance.myCard.method, api.qrAttendance.myCard.path],
    queryFn: async () => {
      const response = await fetch(api.qrAttendance.myCard.path, { credentials: "include" });
      const parsed = await parseEnvelope(response, api.qrAttendance.myCard.responses[200], "Unable to load your QR card");
      return parsed.data;
    },
  });
}

export function useQrAttendanceHistory(filters: QrHistoryFilters = {}) {
  return useQuery({
    queryKey: [api.qrAttendance.history.method, api.qrAttendance.history.path, filters],
    queryFn: async () => {
      const response = await fetch(`${api.qrAttendance.history.path}${buildHistorySearch(filters)}`, { credentials: "include" });
      const parsed = await parseEnvelope(response, api.qrAttendance.history.responses[200], "Unable to load QR attendance history");
      return parsed.data.events;
    },
  });
}

export function useScanQrAttendance() {
  return useMutation({
    mutationFn: submitQrAttendanceScan,
    onSuccess: async () => {
      await invalidateQrAttendanceQueries();
    },
  });
}
