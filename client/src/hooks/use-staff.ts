import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { getResponseErrorMessage } from "@/lib/utils";

/* ---------- Queries ---------- */

export function useStaffList(filters?: { status?: string; staffType?: string }) {
  return useQuery({
    queryKey: [api.staff.list.path, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.staffType) params.set("staffType", filters.staffType);
      const url = params.toString() ? `${api.staff.list.path}?${params.toString()}` : api.staff.list.path;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch staff"));
      return api.staff.list.responses[200].parse(await res.json());
    },
  });
}

export function useStaff(id: number) {
  return useQuery({
    queryKey: [api.staff.get.path, id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.staff.get.path, { id }), { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch staff"));
      return api.staff.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

/* ---------- Mutations ---------- */

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.staff.create.input>) => {
      const validated = api.staff.create.input.parse(data);
      const res = await fetch(api.staff.create.path, {
        method: api.staff.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to create staff"));
      return api.staff.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: number } & z.infer<typeof api.staff.update.input>) => {
      const { id, ...updates } = payload;
      const validated = api.staff.update.input.parse(updates);
      const res = await fetch(buildUrl(api.staff.update.path, { id }), {
        method: api.staff.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to update staff"));
      return api.staff.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
    },
  });
}

/* ---------- Salary Structure ---------- */

export function useCreateSalaryStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { staffId: number } & z.infer<typeof api.staff.salaryStructure.create.input>) => {
      const { staffId, ...rest } = payload;
      const validated = api.staff.salaryStructure.create.input.parse(rest);
      const res = await fetch(buildUrl(api.staff.salaryStructure.create.path, { id: staffId }), {
        method: api.staff.salaryStructure.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to create salary structure"));
      return api.staff.salaryStructure.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
    },
  });
}

/* ---------- Salary Processing ---------- */

export function useProcessSalary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { staffId: number } & z.infer<typeof api.staff.processSalary.input>) => {
      const { staffId, ...rest } = payload;
      const validated = api.staff.processSalary.input.parse(rest);
      const res = await fetch(buildUrl(api.staff.processSalary.path, { id: staffId }), {
        method: api.staff.processSalary.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to process salary"));
      return api.staff.processSalary.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
    },
  });
}

/* ---------- Salary Payments List ---------- */

export function useSalaryPayments(staffId: number) {
  return useQuery({
    queryKey: [api.staff.salaryPayments.path, staffId],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.staff.salaryPayments.path, { id: staffId }), { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch salary payments"));
      return api.staff.salaryPayments.responses[200].parse(await res.json());
    },
    enabled: !!staffId,
  });
}

/* ---------- Loan Management ---------- */

export function useCreateStaffLoan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { staffId: number } & z.infer<typeof api.staff.loans.create.input>) => {
      const { staffId, ...rest } = payload;
      const validated = api.staff.loans.create.input.parse(rest);
      const res = await fetch(buildUrl(api.staff.loans.create.path, { id: staffId }), {
        method: api.staff.loans.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to create loan"));
      return api.staff.loans.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
    },
  });
}

export function useListStaffLoans(staffId: number) {
  return useQuery({
    queryKey: [api.staff.loans.list.path, staffId],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.staff.loans.list.path, { id: staffId }), { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch loans"));
      return api.staff.loans.list.responses[200].parse(await res.json());
    },
    enabled: !!staffId,
  });
}

export function useCreateLoanRepayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { loanId: number } & z.infer<typeof api.staff.loans.repayment.input>) => {
      const { loanId, ...rest } = payload;
      const validated = api.staff.loans.repayment.input.parse(rest);
      const res = await fetch(buildUrl(api.staff.loans.repayment.path, { loanId }), {
        method: api.staff.loans.repayment.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to record repayment"));
      return api.staff.loans.repayment.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
    },
  });
}

/* ---------- Attendance ---------- */

export function useMarkStaffAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { staffId: number } & z.infer<typeof api.staff.attendance.create.input>) => {
      const { staffId, ...rest } = payload;
      const validated = api.staff.attendance.create.input.parse(rest);
      const res = await fetch(buildUrl(api.staff.attendance.create.path, { id: staffId }), {
        method: api.staff.attendance.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to mark attendance"));
      return api.staff.attendance.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
    },
  });
}

export function useGetStaffAttendance(staffId: number, fromDate?: string, toDate?: string) {
  return useQuery({
    queryKey: [api.staff.attendance.list.path, staffId, fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const baseUrl = buildUrl(api.staff.attendance.list.path, { id: staffId });
      const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch attendance"));
      return api.staff.attendance.list.responses[200].parse(await res.json());
    },
    enabled: !!staffId,
  });
}
