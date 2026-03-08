import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { useUser } from "./use-auth";
import { getResponseErrorMessage } from "@/lib/utils";

function buildQueryString(filters: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function invalidateAttendanceQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [api.attendance.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.student.attendance.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.student.attendance.summary.path] });
  queryClient.invalidateQueries({ queryKey: [api.teacher.classes.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.teacher.attendance.students.path] });
  queryClient.invalidateQueries({ queryKey: [api.teacher.attendance.history.path] });
  queryClient.invalidateQueries({ queryKey: [api.dashboard.adminStats.path] });
  queryClient.invalidateQueries({ queryKey: [api.dashboard.studentStats.path] });
  queryClient.invalidateQueries({ queryKey: [api.dashboard.teacherStats.path] });
}

export function useAttendance() {
  const { data: user } = useUser();
  return useQuery({
    queryKey: [api.attendance.list.path, user?.id],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (user) {
        headers['x-user-role'] = user.role;
        headers['x-user-id'] = String(user.id);
      }
      const res = await fetch(api.attendance.list.path, {
        headers,
        credentials: "include"
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch attendance"));
      return api.attendance.list.responses[200].parse(await res.json());
    },
    enabled: !!user,
  });
}

export function useCreateAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.attendance.create.input>) => {
      const validated = api.attendance.create.input.parse(data);
      const res = await fetch(api.attendance.create.path, {
        method: api.attendance.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to mark attendance"));
      return api.attendance.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      invalidateAttendanceQueries(queryClient);
    },
  });
}

export function useStudentAttendance() {
  return useQuery({
    queryKey: [api.student.attendance.list.path],
    queryFn: async () => {
      const res = await fetch(api.student.attendance.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch attendance"));
      return api.student.attendance.list.responses[200].parse(await res.json());
    },
  });
}

export function useStudentAttendanceSummary() {
  return useQuery({
    queryKey: [api.student.attendance.summary.path],
    queryFn: async () => {
      const res = await fetch(api.student.attendance.summary.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch attendance summary"));
      return api.student.attendance.summary.responses[200].parse(await res.json());
    },
  });
}

export function useTeacherClasses() {
  return useQuery({
    queryKey: [api.teacher.classes.list.path],
    queryFn: async () => {
      const res = await fetch(api.teacher.classes.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch classes"));
      return api.teacher.classes.list.responses[200].parse(await res.json());
    },
  });
}

export function useTeacherAttendanceStudents(className?: string) {
  return useQuery({
    queryKey: [api.teacher.attendance.students.path, className ?? "all"],
    queryFn: async () => {
      const res = await fetch(`${api.teacher.attendance.students.path}${buildQueryString({ className })}`, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch students"));
      return api.teacher.attendance.students.responses[200].parse(await res.json());
    },
    enabled: !!className,
  });
}

export function useTeacherAttendanceHistory(filters: { className?: string; date?: string } = {}) {
  return useQuery({
    queryKey: [api.teacher.attendance.history.path, filters.className ?? "all", filters.date ?? "all"],
    queryFn: async () => {
      const res = await fetch(`${api.teacher.attendance.history.path}${buildQueryString(filters)}`, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch attendance history"));
      return api.teacher.attendance.history.responses[200].parse(await res.json());
    },
  });
}

export function useTeacherBulkUpsertAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.teacher.attendance.bulkUpsert.input>) => {
      const validated = api.teacher.attendance.bulkUpsert.input.parse(data);
      const res = await fetch(api.teacher.attendance.bulkUpsert.path, {
        method: api.teacher.attendance.bulkUpsert.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to save attendance"));
      return api.teacher.attendance.bulkUpsert.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateAttendanceQueries(queryClient);
    },
  });
}

export function useTeacherUpdateAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & z.infer<typeof api.teacher.attendance.update.input>) => {
      const validated = api.teacher.attendance.update.input.parse(updates);
      const res = await fetch(buildUrl(api.teacher.attendance.update.path, { id }), {
        method: api.teacher.attendance.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to update attendance"));
      return api.teacher.attendance.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateAttendanceQueries(queryClient);
    },
  });
}
