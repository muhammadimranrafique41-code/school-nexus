import { useState, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { getResponseErrorMessage } from "@/lib/utils";

export type MonthRow = {
  id: string;
  month: string;
  year: number;
  checked: boolean;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function toBillingMonth(month: string, year: number): string {
  const idx = MONTHS.indexOf(month as (typeof MONTHS)[number]);
  return `${year}-${String(idx + 1).padStart(2, "0")}`;
}

export type FamilyPreviewItem = {
  familyId: number;
  familyName: string;
  totalOutstanding: number;
  totalCurrentFees: number;
  siblingCount: number;
  siblings: Array<{
    studentId: number;
    studentName: string;
    className?: string | null;
    previousDuesTotal: number;
    selectedMonthsTotal: number;
    total: number;
  }>;
};

export type FamilyPreviewResponse = {
  summary: {
    totalFamilies: number;
    totalStudents: number;
    totalOutstanding: number;
  };
  families: FamilyPreviewItem[];
};

export type FamilyVoucherResponse = {
  family: {
    id: number;
    name: string;
    guardianDetails: {
      primary?: {
        name?: string | null;
        relation?: string | null;
        phone?: string | null;
        email?: string | null;
      } | null;
      secondary?: {
        name?: string | null;
        relation?: string | null;
        phone?: string | null;
        email?: string | null;
      } | null;
      notes?: string | null;
    };
    walletBalance: number;
    totalOutstanding: number;
    siblingCount: number;
  };
  siblings: Array<{
    studentId: number;
    studentName: string;
    className?: string | null;
    fatherName?: string | null;
    previousDues: Array<{
      feeId: number;
      invoiceNumber?: string | null;
      feeType: string;
      billingPeriod: string;
      amount: number;
      remainingBalance: number;
    }>;
    currentFees: Array<{
      feeId: number;
      invoiceNumber?: string | null;
      feeType: string;
      billingPeriod: string;
      amount: number;
      remainingBalance: number;
    }>;
    total: number;
  }>;
  voucherNumber: string;
  generatedAt: string;
  dueDate: string;
  summary: {
    previousDuesTotal: number;
    currentMonthsTotal: number;
    grossTotal: number;
    discount: number;
    netPayable: number;
    lateFee: number;
    payableWithinDate: number;
    payableAfterDueDate: number;
    amountInWords: string;
  };
};

export type FamilyPreviewFilters = {
  search: string;
};

export function useMonthSelector() {
  const currentYear = new Date().getFullYear();
  const [rows, setRows] = useState<MonthRow[]>(
    MONTHS.map((month, index) => ({
      id: `row-${index}`,
      month,
      year: currentYear,
      checked: false,
    }))
  );

  const toggleCheck = useCallback((id: string) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, checked: !row.checked } : row)));
  }, []);

  const setMonth = useCallback((id: string, month: string) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, month } : row)));
  }, []);

  const setYear = useCallback((id: string, year: number) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, year } : row)));
  }, []);

  const setAllYear = useCallback((year: number) => {
    setRows((prev) => prev.map((row) => ({ ...row, year })));
  }, []);

  const selectAll = useCallback(() => {
    setRows((prev) => prev.map((row) => ({ ...row, checked: true })));
  }, []);

  const clearAll = useCallback(() => {
    setRows((prev) => prev.map((row) => ({ ...row, checked: false })));
  }, []);

  const removeSelected = useCallback((billingMonth: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.checked && toBillingMonth(row.month, row.year) === billingMonth
          ? { ...row, checked: false }
          : row
      )
    );
  }, []);

  const { selectedMonths, duplicates } = useMemo(() => {
    const checked = rows.filter((row) => row.checked);
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const row of checked) {
      const billingMonth = toBillingMonth(row.month, row.year);
      if (seen.has(billingMonth)) dups.add(row.id);
      seen.add(billingMonth);
    }
    const unique = checked.filter((row) => !dups.has(row.id));
    return {
      selectedMonths: unique.map((row) => ({
        ...row,
        billingMonth: toBillingMonth(row.month, row.year),
      })),
      duplicates: dups,
    };
  }, [rows]);

  return {
    rows,
    MONTHS,
    toggleCheck,
    setMonth,
    setYear,
    setAllYear,
    selectAll,
    clearAll,
    removeSelected,
    selectedMonths,
    duplicates,
    selectedCount: selectedMonths.length,
  };
}

export function useFamilyPreview(billingMonths: string[], enabled: boolean) {
  const [filters, setFilters] = useState<FamilyPreviewFilters>({
    search: "",
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const query = useQuery<FamilyPreviewResponse>({
    queryKey: [api.fees.vouchers.previewFamilies.path, billingMonths.join(",")],
    queryFn: async () => {
      const params = new URLSearchParams();
      billingMonths.forEach((month) => params.append("billingMonths", month));
      const res = await fetch(
        `${api.fees.vouchers.previewFamilies.path}?${params}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        throw new Error(
          await getResponseErrorMessage(res, "Failed to load family preview")
        );
      }
      return res.json();
    },
    enabled: enabled && billingMonths.length > 0,
    staleTime: 30_000,
  });

  const filteredFamilies = useMemo(() => {
    const families = query.data?.families ?? [];
    const search = filters.search.trim().toLowerCase();
    if (!search) return families;
    return families.filter((family) => {
      const haystack = [
        family.familyName,
        ...family.siblings.map((sibling) => sibling.studentName),
        ...family.siblings.map((sibling) => sibling.className ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [filters.search, query.data]);

  const toggleExpand = useCallback((familyId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(familyId) ? next.delete(familyId) : next.add(familyId);
      return next;
    });
  }, []);

  return { query, filters, setFilters, filteredFamilies, expandedRows, toggleExpand };
}

export function useFamilyVoucher(familyId: number | null, billingMonths: string[]) {
  return useQuery<FamilyVoucherResponse>({
    queryKey: [api.fees.vouchers.familyVoucher.path, familyId, billingMonths.join(",")],
    queryFn: async () => {
      const params = new URLSearchParams();
      billingMonths.forEach((month) => params.append("billingMonths", month));
      const url = api.fees.vouchers.familyVoucher.path.replace(
        ":familyId",
        String(familyId)
      );
      const res = await fetch(`${url}?${params}`, { credentials: "include" });
      if (!res.ok) {
        throw new Error(await getResponseErrorMessage(res, "Failed to load family voucher"));
      }
      return res.json();
    },
    enabled: familyId !== null && billingMonths.length > 0,
    staleTime: 60_000,
  });
}

export function useGenerateFamilyVouchers() {
  const queryClient = useQueryClient();

  return useMutation<
    { generatedCount: number; families: Array<{ familyId: number; invoiceNumber: string; totalAmount: number }> },
    Error,
    { billingMonths: string[]; familyIds?: number[]; includeOverdue?: boolean }
  >({
    mutationFn: async (input) => {
      const res = await fetch(api.fees.vouchers.generateFamilyVouchers.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(
          await getResponseErrorMessage(res, "Failed to generate family vouchers")
        );
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.fees.vouchers.previewFamilies.path] });
      queryClient.invalidateQueries({ queryKey: [api.families.list.path] });
    },
  });
}
