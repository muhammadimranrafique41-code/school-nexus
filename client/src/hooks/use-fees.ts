import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { useUser } from "./use-auth";
import { getResponseErrorMessage } from "@/lib/utils";

export type FinanceReportFilters = z.input<typeof api.fees.report.input>;
export type BillingProfileRecord = z.infer<typeof api.fees.profiles.list.responses[200]>[number];
export type FinanceReportRecord = z.infer<typeof api.fees.report.responses[200]>;
export type MonthlyGenerationResult = z.infer<typeof api.fees.generateMonthly.responses[200]>;

function buildFinanceReportUrl(filters?: FinanceReportFilters) {
  const parsed = api.fees.report.input.parse(filters ?? {});
  const params = new URLSearchParams();

  if (parsed.month) params.set("month", parsed.month);
  if (parsed.studentId) params.set("studentId", String(parsed.studentId));
  if (parsed.status) params.set("status", parsed.status);

  const query = params.toString();
  return query ? `${api.fees.report.path}?${query}` : api.fees.report.path;
}

function invalidateFeeQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [api.fees.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.fees.profiles.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.fees.report.path] });
  queryClient.invalidateQueries({ queryKey: [api.dashboard.adminStats.path] });
  queryClient.invalidateQueries({ queryKey: [api.dashboard.studentStats.path] });
}

export function useFees() {
  const { data: user } = useUser();

  return useQuery({
    queryKey: [api.fees.list.path, user?.id],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (user) {
        headers["x-user-role"] = user.role;
        headers["x-user-id"] = String(user.id);
      }

      const res = await fetch(api.fees.list.path, {
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch fees"));
      return api.fees.list.responses[200].parse(await res.json());
    },
    enabled: !!user,
  });
}

export function useCreateFee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: z.infer<typeof api.fees.create.input>) => {
      const validated = api.fees.create.input.parse(data);
      const res = await fetch(api.fees.create.path, {
        method: api.fees.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to add fee"));
      return api.fees.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      invalidateFeeQueries(queryClient);
    },
  });
}

export function useUpdateFee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<z.infer<typeof api.fees.update.input>>) => {
      const validated = api.fees.update.input.parse(updates);
      const url = buildUrl(api.fees.update.path, { id });
      const res = await fetch(url, {
        method: api.fees.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to update fee"));
      return api.fees.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateFeeQueries(queryClient);
    },
  });
}

export function useDeleteFee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(buildUrl(api.fees.delete.path, { id }), {
        method: api.fees.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to delete fee"));
      return api.fees.delete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateFeeQueries(queryClient);
    },
  });
}

export function useRecordFeePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & z.infer<typeof api.fees.payments.record.input>) => {
      const validated = api.fees.payments.record.input.parse(data);
      const res = await fetch(buildUrl(api.fees.payments.record.path, { id }), {
        method: api.fees.payments.record.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to record payment"));
      return api.fees.payments.record.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      invalidateFeeQueries(queryClient);
    },
  });
}

export function useBillingProfiles() {
  return useQuery({
    queryKey: [api.fees.profiles.list.path],
    queryFn: async () => {
      const res = await fetch(api.fees.profiles.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch billing profiles"));
      return api.fees.profiles.list.responses[200].parse(await res.json());
    },
  });
}

export function useUpsertBillingProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: z.infer<typeof api.fees.profiles.upsert.input>) => {
      const validated = api.fees.profiles.upsert.input.parse(data);
      const res = await fetch(api.fees.profiles.upsert.path, {
        method: api.fees.profiles.upsert.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to save billing profile"));
      return api.fees.profiles.upsert.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateFeeQueries(queryClient);
    },
  });
}

export function useGenerateMonthlyFees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: z.infer<typeof api.fees.generateMonthly.input>) => {
      const validated = api.fees.generateMonthly.input.parse(data);
      const res = await fetch(api.fees.generateMonthly.path, {
        method: api.fees.generateMonthly.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to generate monthly invoices"));
      return api.fees.generateMonthly.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      invalidateFeeQueries(queryClient);
    },
  });
}

export function useFinanceReport(filters?: FinanceReportFilters) {
  const parsedFilters = api.fees.report.input.parse(filters ?? {});

  return useQuery({
    queryKey: [api.fees.report.path, parsedFilters],
    queryFn: async () => {
      const res = await fetch(buildFinanceReportUrl(parsedFilters), { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch finance report"));
      return api.fees.report.responses[200].parse(await res.json());
    },
  });
}
