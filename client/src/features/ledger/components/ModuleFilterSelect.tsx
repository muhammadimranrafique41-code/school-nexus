/**
 * @component ModuleFilterSelect
 * @description
 * Source-module dropdown filter for the Ledger Register tab.
 * Allows filtering ledger entries by originating sub-system.
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LedgerSourceModule } from "../types";

const MODULE_OPTIONS: { value: LedgerSourceModule | ""; label: string }[] = [
  { value: "",          label: "All Modules" },
  { value: "fees",      label: "Fees" },
  { value: "staff",     label: "Staff / Salary" },
  { value: "funds",     label: "Funds" },
  { value: "expenses",  label: "Expenses" },
  { value: "wallet",    label: "Wallet" },
  { value: "manual",    label: "Manual Entry" },
];

interface ModuleFilterSelectProps {
  value: LedgerSourceModule | "";
  onChange: (value: LedgerSourceModule | "") => void;
}

export function ModuleFilterSelect({ value, onChange }: ModuleFilterSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as LedgerSourceModule | "")}
    >
      <SelectTrigger className="h-8 w-40 text-xs">
        <SelectValue placeholder="All Modules" />
      </SelectTrigger>
      <SelectContent>
        {MODULE_OPTIONS.map((opt) => (
          <SelectItem key={opt.value || "__all"} value={opt.value || "__all"} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
