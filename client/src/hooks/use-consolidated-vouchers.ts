import { useState, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { getResponseErrorMessage } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonthRow = {
  id: string;
  month: string;
  year: number;
  checked: boolean;
};

export type StudentPreviewItem = {
  studentId: number;
  name: string;
  className?: string | null;
  fatherName?: string | null;
  previousDuesTotal: number;
  selectedMonthsTotal: number;
  grandTotal: number;
  status: "overdue" | "current" | "advance" | "paid";
  breakdown: {
    previousDues: Array<{ feeId: number; vNo?: string | null; feeType: string; month: string; amount: number; balance: number }>;
    currentMonths: Array<{ feeId: number; vNo?: string | null; feeType: string; month: string; amount: number }>;
  };
};

export type StudentPreviewResponse = {
  summary: { total: number; overdue: number; currentOnly: number; alreadyPaid: number };
  students: StudentPreviewItem[];
};

export type ConsolidatedVoucherResponse = {
  student: { id: number; name: string; fatherName?: string | null; className?: string | null };
  voucherNumber: string;
  generatedAt: string;
  dueDate: string;
  sections: {
    previousDues: Array<{ sno: number; vNo?: string | null; feeType: string; month: string; amount: number; balance: number }>;
    currentMonths: Array<{ sno: number; vNo?: string | null; feeType: string; month: string; amount: number }>;
  };
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

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"] as const;

function toBillingMonth(month: string, year: number): string {
  const idx = MONTHS.indexOf(month as typeof MONTHS[number]);
  return `${year}-${String(idx + 1).padStart(2, "0")}`;
}

// ─── useMonthSelector ─────────────────────────────────────────────────────────

export function useMonthSelector() {
  const currentYear = new Date().getFullYear();

  const [rows, setRows] = useState<MonthRow[]>(() =>
    MONTHS.map((month, i) => ({
      id: `row-${i}`,
      month,
      year: currentYear,
      checked: false,
    })),
  );

  const toggleCheck = useCallback((id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r)));
  }, []);

  const setMonth = useCallback((id: string, month: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, month } : r)));
  }, []);

  const setYear = useCallback((id: string, year: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, year } : r)));
  }, []);

  const setAllYear = useCallback((year: number) => {
    setRows((prev) => prev.map((r) => ({ ...r, year })));
  }, []);

  const selectAll = useCallback(() => {
    setRows((prev) => prev.map((r) => ({ ...r, checked: true })));
  }, []);

  const clearAll = useCallback(() => {
    setRows((prev) => prev.map((r) => ({ ...r, checked: false })));
  }, []);

  const removeSelected = useCallback((billingMonth: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.checked && toBillingMonth(r.month, r.year) === billingMonth
          ? { ...r, checked: false }
          : r,
      ),
    );
  }, []);

  const { selectedMonths, duplicates } = useMemo(() => {
    const checked = rows.filter((r) => r.checked);
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const r of checked) {
      const bm = toBillingMonth(r.month, r.year);
      if (seen.has(bm)) dups.add(r.id);
      seen.add(bm);
    }
    const unique = checked.filter((r) => !dups.has(r.id));
    return {
      selectedMonths: unique.map((r) => ({ ...r, billingMonth: toBillingMonth(r.month, r.year) })),
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

// ─── useStudentPreview ────────────────────────────────────────────────────────

export type StudentPreviewFilters = {
  className: string;
  status: string;
  search: string;
};

export function useStudentPreview(billingMonths: string[], enabled: boolean) {
  const [filters, setFilters] = useState<StudentPreviewFilters>({
    className: "",
    status: "all",
    search: "",
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const queryKey = [api.fees.vouchers.previewStudents.path, billingMonths.join(",")];

  const query = useQuery<StudentPreviewResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      billingMonths.forEach((m) => params.append("billingMonths", m));
      const res = await fetch(`${api.fees.vouchers.previewStudents.path}?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to load student preview"));
      return res.json();
    },
    enabled: enabled && billingMonths.length > 0,
    staleTime: 30_000,
  });

  const filteredStudents = useMemo(() => {
    const students = query.data?.students ?? [];
    return students.filter((s) => {
      if (filters.status !== "all" && s.status !== filters.status) return false;
      if (filters.className && s.className !== filters.className) return false;
      if (filters.search && !s.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  }, [query.data, filters]);

  const toggleExpand = useCallback((studentId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(studentId) ? next.delete(studentId) : next.add(studentId);
      return next;
    });
  }, []);

  return { query, filters, setFilters, filteredStudents, expandedRows, toggleExpand };
}

// ─── useConsolidatedVoucher ───────────────────────────────────────────────────

export function useConsolidatedVoucher(studentId: number | null, billingMonths: string[]) {
  const queryKey = [api.fees.vouchers.consolidatedVoucher.path, studentId, billingMonths.join(",")];

  const query = useQuery<ConsolidatedVoucherResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      billingMonths.forEach((m) => params.append("billingMonths", m));
      const url = api.fees.vouchers.consolidatedVoucher.path.replace(":studentId", String(studentId));
      const res = await fetch(`${url}?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to load voucher"));
      return res.json();
    },
    enabled: studentId !== null && billingMonths.length > 0,
    staleTime: 60_000,
  });

  return query;
}

// ─── useGenerateBatch ─────────────────────────────────────────────────────────

export function useGenerateBatch() {
  const queryClient = useQueryClient();

  return useMutation<{ operationId: number }, Error, {
    billingMonths: string[];
    classNames?: string[];
    studentIds?: number[];
    includeOverdue?: boolean;
    force?: boolean;
  }>({
    mutationFn: async (input) => {
      const res = await fetch(api.fees.vouchers.generateBatch.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to start batch generation"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance", "vouchers"] });
    },
  });
}
