import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { toast } from "@/hooks/use-toast";
import { useLogout } from "@/hooks/use-auth";
import { getErrorMessage, getResponseErrorMessage } from "@/lib/utils";

type HomeworkListResponse = z.infer<typeof api.teacher.homework.list.responses[200]>;
type HomeworkDetailResponse = z.infer<typeof api.teacher.homework.detail.responses[200]>;
type HomeworkAssignment = z.infer<typeof api.teacher.homework.create.responses[201]>["data"];
type HomeworkSubmission = z.infer<typeof api.teacher.homework.grade.responses[200]>["data"];
type StudentHomeworkListResponse = z.infer<typeof api.student.homework.list.responses[200]>;

function buildQueryString(filters: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function invalidateHomeworkQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: ["teacher-homework"] });
  if (id) queryClient.invalidateQueries({ queryKey: ["homework-detail", id] });
}

export function useTeacherHomeworkClasses() {
  const logout = useLogout();
  return useQuery({
    queryKey: ["teacher-homework-classes"],
    queryFn: async () => {
      const res = await fetch(api.teacher.homework.classes.path, { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        logout.mutate();
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to load classes"));
      return api.teacher.homework.classes.responses[200].parse(await res.json());
    },
  });
}

export function useTeacherHomework(filters: z.infer<typeof api.teacher.homework.list.input> = {}) {
  const logout = useLogout();
  return useQuery({
    queryKey: ["teacher-homework", filters],
    queryFn: async () => {
      const res = await fetch(`${api.teacher.homework.list.path}${buildQueryString(filters)}`, { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        logout.mutate();
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch homework"));
      return api.teacher.homework.list.responses[200].parse(await res.json());
    },
  });
}

export function useStudentTeacherHomework(filters: z.infer<typeof api.student.homework.list.input> = {}) {
  const logout = useLogout();
  return useQuery({
    queryKey: ["student-teacher-homework", filters],
    queryFn: async () => {
      const res = await fetch(`${api.student.homework.list.path}${buildQueryString(filters)}`, { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        logout.mutate();
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch homework"));
      return api.student.homework.list.responses[200].parse(await res.json()) as StudentHomeworkListResponse;
    },
  });
}

export function useHomeworkDetail(id?: string) {
  const logout = useLogout();
  return useQuery({
    queryKey: ["homework-detail", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(buildUrl(api.teacher.homework.detail.path, { id }), { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        logout.mutate();
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch homework detail"));
      return api.teacher.homework.detail.responses[200].parse(await res.json());
    },
    enabled: Boolean(id),
  });
}

export function useCreateHomework() {
  const queryClient = useQueryClient();
  const logout = useLogout();

  return useMutation({
    mutationFn: async (data: z.infer<typeof api.teacher.homework.create.input>) => {
      const validated = api.teacher.homework.create.input.parse(data);
      const res = await fetch(api.teacher.homework.create.path, {
        method: api.teacher.homework.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (res.status === 401 || res.status === 403) {
        logout.mutate();
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to create homework"));
      return api.teacher.homework.create.responses[201].parse(await res.json());
    },
    onSuccess: (payload) => {
      invalidateHomeworkQueries(queryClient, payload.data?.id);
      toast({ title: "Homework assigned", description: "The assignment has been published to your class." });
    },
    onError: (error) => {
      toast({ title: "Unable to assign homework", description: getErrorMessage(error), variant: "destructive" });
    },
  });
}

export function useUpdateHomework(id: string) {
  const queryClient = useQueryClient();
  const logout = useLogout();

  return useMutation({
    mutationFn: async (updates: z.infer<typeof api.teacher.homework.update.input>) => {
      const validated = api.teacher.homework.update.input.parse(updates);
      const res = await fetch(buildUrl(api.teacher.homework.update.path, { id }), {
        method: api.teacher.homework.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (res.status === 401 || res.status === 403) {
        logout.mutate();
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to update homework"));
      return api.teacher.homework.update.responses[200].parse(await res.json());
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["teacher-homework"] });
      await queryClient.cancelQueries({ queryKey: ["homework-detail", id] });

      const previousLists = queryClient.getQueriesData<HomeworkListResponse>({ queryKey: ["teacher-homework"] });
      const previousDetail = queryClient.getQueryData<HomeworkDetailResponse>(["homework-detail", id]);

      queryClient.setQueriesData<HomeworkListResponse>({ queryKey: ["teacher-homework"] }, (current) => {
        if (!current?.data) return current;
        return {
          ...current,
          data: current.data.map((item) =>
            item.id === id ? { ...item, ...updates } : item,
          ),
        };
      });

      if (previousDetail?.data) {
        queryClient.setQueryData<HomeworkDetailResponse>(["homework-detail", id], {
          ...previousDetail,
          data: { ...previousDetail.data, ...updates },
        });
      }

      return { previousLists, previousDetail };
    },
    onError: (error, _updates, context) => {
      context?.previousLists.forEach(([key, data]) => queryClient.setQueryData(key, data));
      if (context?.previousDetail) queryClient.setQueryData(["homework-detail", id], context.previousDetail);
      toast({ title: "Unable to update homework", description: getErrorMessage(error), variant: "destructive" });
    },
    onSuccess: () => {
      invalidateHomeworkQueries(queryClient, id);
      toast({ title: "Homework updated", description: "Your changes were saved." });
    },
  });
}

export function useCancelHomework() {
  const queryClient = useQueryClient();
  const logout = useLogout();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(buildUrl(api.teacher.homework.cancel.path, { id }), {
        method: api.teacher.homework.cancel.method,
        credentials: "include",
      });
      if (res.status === 401 || res.status === 403) {
        logout.mutate();
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to cancel homework"));
      return api.teacher.homework.cancel.responses[200].parse(await res.json());
    },
    onSuccess: (_payload, id) => {
      invalidateHomeworkQueries(queryClient, id);
      toast({ title: "Homework cancelled", description: "Students will no longer see this assignment." });
    },
    onError: (error) => {
      toast({ title: "Unable to cancel homework", description: getErrorMessage(error), variant: "destructive" });
    },
  });
}

export function useGradeSubmission(submissionId: string, homeworkId: string) {
  const queryClient = useQueryClient();
  const logout = useLogout();

  return useMutation({
    mutationFn: async (payload: z.infer<typeof api.teacher.homework.grade.input>) => {
      const validated = api.teacher.homework.grade.input.parse(payload);
      const res = await fetch(buildUrl(api.teacher.homework.grade.path, { id: homeworkId, submissionId }), {
        method: api.teacher.homework.grade.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (res.status === 401 || res.status === 403) {
        logout.mutate();
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to update grade"));
      return api.teacher.homework.grade.responses[200].parse(await res.json());
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["homework-detail", homeworkId] });
      const previousDetail = queryClient.getQueryData<HomeworkDetailResponse>(["homework-detail", homeworkId]);

      if (previousDetail?.data) {
        const updatedSubmissions = previousDetail.data.submissions.map((submission) =>
          submission.id === submissionId
            ? { ...submission, marks: Number(updates.marks), feedback: updates.feedback }
            : submission,
        );
        queryClient.setQueryData<HomeworkDetailResponse>(["homework-detail", homeworkId], {
          ...previousDetail,
          data: { ...previousDetail.data, submissions: updatedSubmissions },
        });
      }

      return { previousDetail };
    },
    onError: (error, _updates, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(["homework-detail", homeworkId], context.previousDetail);
      }
      toast({ title: "Unable to update grade", description: getErrorMessage(error), variant: "destructive" });
    },
    onSuccess: (payload) => {
      invalidateHomeworkQueries(queryClient, homeworkId);
      const studentName = payload.data?.student?.name ?? "student";
      toast({ title: "Grade saved", description: `Marks updated for ${studentName}.` });
    },
  });
}

export function useHomeworkUploadUrl() {
  const logout = useLogout();
  return useMutation({
    mutationFn: async (input: z.infer<typeof api.uploads.presign.input>) => {
      const validated = api.uploads.presign.input.parse(input);
      const res = await fetch(api.uploads.presign.path, {
        method: api.uploads.presign.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (res.status === 401 || res.status === 403) {
        logout.mutate();
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to prepare upload"));
      return api.uploads.presign.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      toast({ title: "Upload ready", description: "Your file upload has been prepared." });
    },
    onError: (error) => {
      toast({ title: "Upload failed", description: getErrorMessage(error), variant: "destructive" });
    },
  });
}

export function useHomeworkDownloadUrl() {
  const logout = useLogout();
  return useMutation({
    mutationFn: async (key: string) => {
      const query = buildQueryString({ key });
      const res = await fetch(`${api.uploads.download.path}${query}`, { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        logout.mutate();
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to prepare download"));
      return api.uploads.download.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      toast({ title: "Download ready", description: "Your file link is ready." });
    },
    onError: (error) => {
      toast({ title: "Download failed", description: getErrorMessage(error), variant: "destructive" });
    },
  });
}
