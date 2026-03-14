import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { useUser } from "./use-auth";
import { toast } from "./use-toast";
import { getResponseErrorMessage } from "@/lib/utils";

type MarkCompleteInput = { id: number } & z.infer<typeof api.teacher.pulse.complete.input>;

export function useTeacherPulseToday() {
  const { data: user } = useUser();

  return useQuery({
    queryKey: [api.teacher.pulse.today.path, user?.id],
    queryFn: async () => {
      const res = await fetch(api.teacher.pulse.today.path, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await getResponseErrorMessage(res, "Failed to load today's teaching pulse"));
      }
      return api.teacher.pulse.today.responses[200].parse(await res.json());
    },
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: Infinity,
  });
}

export function useTeacherPulseMarkComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: MarkCompleteInput) => {
      const validated = api.teacher.pulse.complete.input.parse(payload);
      const res = await fetch(buildUrl(api.teacher.pulse.complete.path, { id }), {
        method: api.teacher.pulse.complete.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await getResponseErrorMessage(res, "Failed to mark period complete"));
      }
      return api.teacher.pulse.complete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.teacher.pulse.today.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.teacherStats.path] });
    },
  });
}

export function useTeacherPulseSocket() {
  const queryClient = useQueryClient();
  const { data: user } = useUser();

  useEffect(() => {
    if (!user) return;

    const socket = io("/teacher", {
      withCredentials: true,
    });

    socket.emit("join", user.id);

    socket.on("pulse:updated", () => {
      queryClient.invalidateQueries({ queryKey: [api.teacher.pulse.today.path, user.id] });
      toast({ description: "Your teaching schedule was updated" });
    });

    socket.on("class:assigned", (data: { className: string }) => {
      queryClient.invalidateQueries({ queryKey: [api.teacher.pulse.today.path, user.id] });
      toast({ description: `New class assigned: ${data.className}` });
    });

    socket.on("substitute:confirmed", (data: { period: number }) => {
      toast({ description: `Substitute confirmed for Period ${data.period}` });
    });

    socket.on("connect_error", () => {
      // Silent fail — polling remains as fallback
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient, user]);
}

