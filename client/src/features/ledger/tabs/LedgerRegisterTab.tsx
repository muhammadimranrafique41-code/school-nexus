/**
 * @tab LedgerRegisterTab
 * @description
 * Paginated, filterable table of all ledger entries.
 * Filters: date range, source module, entry type, text search.
 * Actions: CSV export.
 */

import { useState, useMemo } from "react";
import { Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker, getDefaultDateRange } from "../components/DateRangePicker";
import { ModuleFilterSelect } from "../components/ModuleFilterSelect";
import { LedgerEntryTable } from "../components/LedgerEntryTable";
import { useLedgerEntries } from "../hooks/use-ledger";
import { downloadCsv } from "@/lib/utils";
import type { DateRange, LedgerEntryType, LedgerFilter, LedgerSourceModule } from "../types";

export function LedgerRegisterTab() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [entryType, setEntryType] = useState<LedgerEntryType | "">("");
  const [sourceModule, setSourceModule] = useState<LedgerSourceModule | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filters: LedgerFilter = {
    from: dateRange.from,
    to: dateRange.to,
    entryType: entryType || undefined,
    sourceModule: sourceModule || undefined,
    page,
    pageSize: 25,
  };

  const { data, isLoading } = useLedgerEntries(filters);

  // Client-side description search filter
  const filteredData = useMemo(() => {
    if (!data || !search.trim()) return data;
    const q = search.toLowerCase();
    return {
      ...data,
      entries: data.entries.filter(
        (e) =>
          e.description?.toLowerCase().includes(q) ||
          e.category?.toLowerCase().includes(q) ||
          e.sourceModule?.toLowerCase().includes(q)
      ),
    };
  }, [data, search]);

  // Reset to page 1 when filters change
  function handleFilterChange() {
    setPage(1);
  }

  // CSV export
  function handleExport() {
    if (!data?.entries.length) return;
    const rows = data.entries.map((e) => ({
      Date: e.transactionDate,
      Type: e.entryType,
      Category: e.category,
      Module: e.sourceModule ?? "",
      Description: e.description ?? "",
      Reference: e.referenceType ? `${e.referenceType}#${e.referenceId}` : "",
      Amount: e.amount,
      "Created By": e.createdBy ?? "System",
    }));
    downloadCsv(rows, `ledger-${dateRange.from}-to-${dateRange.to}.csv`);
  }

  return (
    <div className="space-y-4">
      {/* ── Filter toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker
          value={dateRange}
          onChange={(r) => { setDateRange(r); handleFilterChange(); }}
        />

        <ModuleFilterSelect
          value={sourceModule}
          onChange={(v) => { setSourceModule(v); handleFilterChange(); }}
        />

        {/* Entry type toggle */}
        <Select
          value={entryType || "__all"}
          onValueChange={(v) => {
            setEntryType(v === "__all" ? "" : (v as LedgerEntryType));
            handleFilterChange();
          }}
        >
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all" className="text-xs">All Types</SelectItem>
            <SelectItem value="income" className="text-xs">Income</SelectItem>
            <SelectItem value="expense" className="text-xs">Expense</SelectItem>
          </SelectContent>
        </Select>

        {/* Description search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Export */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8 gap-1.5 text-xs"
          onClick={handleExport}
          disabled={!data?.entries.length}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* ── Results summary ────────────────────────────────────────────────── */}
      {data && (
        <p className="text-[11px] text-slate-400">
          Showing{" "}
          <span className="font-medium text-slate-600">
            {filteredData?.entries.length ?? 0}
          </span>{" "}
          of{" "}
          <span className="font-medium text-slate-600">{data.total}</span> entries
        </p>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <LedgerEntryTable
        data={filteredData}
        isLoading={isLoading}
        page={page}
        onPageChange={setPage}
      />
    </div>
  );
}
