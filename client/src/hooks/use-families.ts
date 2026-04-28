import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { getResponseErrorMessage } from "@/lib/utils";

export function useFamilies() {
  return useQuery({
    queryKey: [api.families.list.path],
    queryFn: async () => {
      const res = await fetch(api.families.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to load families"));
      return res.json();
    },
  });
}

export type CreateFamilyInput = z.infer<typeof api.families.create.input>;

export function useCreateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateFamilyInput) => {
      const validated = api.families.create.input.parse(data);
      const res = await fetch(api.families.create.path, {
        method: api.families.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to create family"));
      return api.families.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.families.list.path] });
    },
  });
}

export function useFamilyDashboard() {
  return useQuery({
    queryKey: [api.families.dashboard.path],
    queryFn: async () => {
      const res = await fetch(api.families.dashboard.path, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to load family dashboard"));
      return res.json();
    },
  });
}

export function usePayFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      familyId,
      amount,
      paymentDate,
      method,
      reference,
      notes,
    }: {
      familyId: number;
      amount: number;
      paymentDate: string;
      method: "Cash" | "Bank Transfer" | "Card" | "Mobile Money" | "Cheque" | "Other";
      reference?: string | null;
      notes?: string | null;
    }) => {
      const res = await fetch(buildUrl(api.families.pay.path, { id: familyId }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount, paymentDate, method, reference, notes }),
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to pay family balance"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.families.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.families.dashboard.path] });
      queryClient.invalidateQueries({ queryKey: [api.fees.list.path] });
    },
  });
}
