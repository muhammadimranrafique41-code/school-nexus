/**
 * @module ledger/types
 * @description
 * Local TypeScript types for the Ledger & Financial Reporting feature module.
 * These types mirror the server-side schema types but are shaped for UI consumption
 * (string amounts converted to numbers, dates as strings for display, etc.).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Domain enums (kept in sync with shared/schema.ts constants)
// ─────────────────────────────────────────────────────────────────────────────

export type LedgerEntryType = "income" | "expense";

export type LedgerCategory = "fee" | "salary" | "fund" | "expense" | "other";

export type LedgerSourceModule =
  | "fees"
  | "staff"
  | "funds"
  | "expenses"
  | "wallet"
  | "manual";

export type LedgerReferenceType =
  | "fee_payment"
  | "salary_payment"
  | "fund_receipt"
  | "expense_entry"
  | "loan_repayment"
  | "wallet_deposit"
  | "manual_entry";

// ─────────────────────────────────────────────────────────────────────────────
// API response shapes
// ─────────────────────────────────────────────────────────────────────────────

/** A single row from the `ledger` table as returned by the API. */
export interface LedgerEntry {
  id: number;
  transactionDate: string;
  entryType: LedgerEntryType;
  category: LedgerCategory;
  /** Decimal string from the DB, e.g. "12500.00" */
  amount: string;
  description: string | null;
  referenceType: LedgerReferenceType | null;
  referenceId: number | null;
  sourceModule: LedgerSourceModule | null;
  createdBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Paginated response from GET /api/ledger/entries */
export interface LedgerEntriesPage {
  entries: LedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Monthly aggregate row from the cash_flow_summary view */
export interface CashFlowSummaryRow {
  year: number;
  month: number;
  totalIncome: string;
  totalExpense: string;
  netCashFlow: string;
}

/** KPI totals for a date range from GET /api/ledger/period-summary */
export interface PeriodSummary {
  totalIncome: string;
  totalExpense: string;
  netCashFlow: string;
}

/** Per-category breakdown row */
export interface CategoryBreakdownRow {
  category: LedgerCategory;
  entryType: LedgerEntryType;
  total: string;
}

/** Per-source-module breakdown row */
export interface ModuleBreakdownRow {
  sourceModule: LedgerSourceModule | null;
  entryType: LedgerEntryType;
  total: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter / query state types
// ─────────────────────────────────────────────────────────────────────────────

/** Filter state used by LedgerRegisterTab */
export interface LedgerFilter {
  from?: string;
  to?: string;
  entryType?: LedgerEntryType | "";
  sourceModule?: LedgerSourceModule | "";
  search?: string;
  page: number;
  pageSize: number;
}

/** Date range used by CashFlowTab and period-summary queries */
export interface DateRange {
  from: string;
  to: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helper types
// ─────────────────────────────────────────────────────────────────────────────

/** Shape used by MonthlyRevenueChart bar data */
export interface MonthlyBarDatum {
  /** e.g. "Jan 25" */
  label: string;
  income: number;
  expense: number;
  net: number;
}

/** Shape used by CategoryBreakdownChart pie data */
export interface CategoryPieDatum {
  name: string;
  value: number;
  color: string;
  percentage: number;
}

/** Preset date range options for DateRangePicker */
export type DateRangePreset =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "this_year"
  | "custom";
