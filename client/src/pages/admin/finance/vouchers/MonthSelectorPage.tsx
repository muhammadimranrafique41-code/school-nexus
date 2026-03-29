import { useLocation } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, X } from "lucide-react";
import { useMonthSelector } from "@/hooks/use-consolidated-vouchers";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

export default function MonthSelectorPage() {
  const [, navigate] = useLocation();
  const {
    rows, MONTHS, toggleCheck, setMonth, setYear, setAllYear,
    selectAll, clearAll, removeSelected, selectedMonths, duplicates, selectedCount,
  } = useMonthSelector();

  function handlePreview() {
    if (selectedCount === 0) return;
    const billingMonths = selectedMonths.map((m) => m.billingMonth);
    navigate(`/admin/finance/vouchers/preview?months=${billingMonths.join(",")}`);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Select Months</h1>
          <p className="text-slate-500 text-sm mt-1">Check months to include in this batch.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select onValueChange={(v) => setAllYear(Number(v))} defaultValue={String(CURRENT_YEAR)}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="All Year" />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>All Year: {y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={selectAll}>All</Button>
          <Button variant="outline" size="sm" onClick={clearAll}>None</Button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">MONTH</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">YEAR</th>
              <th className="text-center px-4 py-2 font-medium text-slate-600">PRINT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isDuplicate = duplicates.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={`border-b border-slate-100 transition-colors ${row.checked ? "bg-blue-50" : "hover:bg-slate-50"}`}
                >
                  <td className="px-4 py-2">
                    <Select value={row.month} onValueChange={(v) => setMonth(row.id, v)}>
                      <SelectTrigger className="w-36 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isDuplicate && (
                      <p className="text-red-500 text-xs mt-1">
                        Duplicate: {row.month} {row.year} already added
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Select value={String(row.year)} onValueChange={(v) => setYear(row.id, Number(v))}>
                      <SelectTrigger className="w-28 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((y) => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Checkbox
                      checked={row.checked}
                      onCheckedChange={() => toggleCheck(row.id)}
                      className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Badge className="bg-blue-100 text-blue-700 border-blue-200 font-semibold">
            {selectedCount} month{selectedCount !== 1 ? "s" : ""} selected
          </Badge>
          <div className="flex flex-wrap gap-1">
            {selectedMonths.map((m) => (
              <Badge
                key={m.billingMonth}
                variant="outline"
                className="text-xs gap-1 cursor-pointer hover:bg-red-50"
                onClick={() => removeSelected(m.billingMonth)}
              >
                {m.month.slice(0, 3)} {m.year}
                <X className="h-3 w-3" />
              </Badge>
            ))}
          </div>
        </div>
        <Button
          onClick={handlePreview}
          disabled={selectedCount === 0}
          className="gap-2"
        >
          Preview Students
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
