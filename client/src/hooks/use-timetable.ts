import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { getResponseErrorMessage } from "@/lib/utils";

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