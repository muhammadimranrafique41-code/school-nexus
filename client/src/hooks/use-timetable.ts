import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { getResponseErrorMessage } from "@/lib/utils";

// ─── Student ────────────────────────────────────────────────────────────────

export function useStudentTimetable() {
  return useQuery({
    queryKey: [api.student.timetable.list.path],
    queryFn: async () => {
      const res = await fetch(api.student.timetable.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch timetable"));
      return api.student.timetable.list.responses[200].parse(await res.json());
    },
  });
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function useAdminTimetables() {
  return useQuery({
    queryKey: [api.adminTimetables.list.path],
    queryFn: async () => {
      const res = await fetch(api.adminTimetables.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch timetables"));
      return res.json() as Promise<any[]>;
    },
  });
}

export function useAdminTimetable(id: number | null) {
  return useQuery({
    queryKey: [api.adminTimetables.getOne.path, id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.adminTimetables.getOne.path, { id: id! }), { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch timetable"));
      return res.json() as Promise<any>;
    },
    enabled: id != null,
  });
}

export function useCreateTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (classId: number) => {
      const res = await fetch(api.adminTimetables.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ classId }),
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to create timetable"));
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [api.adminTimetables.list.path] }),
  });
}

export function useUpsertPeriods(timetableId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periods: any[]) => {
      const id = timetableId!;
      const res = await fetch(buildUrl(api.adminTimetables.upsertPeriods.path, { id }), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ periods }),
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to save timetable"));
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.adminTimetables.list.path] });
      if (timetableId != null)
        qc.invalidateQueries({ queryKey: [api.adminTimetables.getOne.path, timetableId] });
    },
  });
}

export function usePublishTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(buildUrl(api.adminTimetables.publish.path, { id }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to publish timetable"));
      return res.json();
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: [api.adminTimetables.list.path] });
      qc.invalidateQueries({ queryKey: [api.adminTimetables.getOne.path, id] });
    },
  });
}

// ─── Teacher ─────────────────────────────────────────────────────────────────

export function useTeacherTimetable() {
  return useQuery({
    queryKey: [api.teacher.timetable.mine.path],
    queryFn: async () => {
      const res = await fetch(api.teacher.timetable.mine.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch your timetable"));
      return res.json() as Promise<any[]>;
    },
  });
}