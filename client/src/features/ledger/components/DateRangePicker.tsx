/**
 * @component DateRangePicker
 * @description
 * Reusable date-range filter with preset shortcuts (This Month, Last Month,
 * Last 3 Months, This Year) and manual from/to date inputs.
 */

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DateRange, DateRangePreset } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Preset helpers
// ─────────────────────────────────────────────────────────────────────────────

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPresetRange(preset: DateRangePreset): DateRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  switch (preset) {
    case "this_month":
      return {
        from: toIso(new Date(y, m, 1)),
        to: toIso(new Date(y, m + 1, 0)),
      };
    case "last_month":
      return {
        from: toIso(new Date(y, m - 1, 1)),
        to: toIso(new Date(y, m, 0)),
      };
    case "last_3_months":
      return {
        from: toIso(new Date(y, m - 2, 1)),
        to: toIso(new Date(y, m + 1, 0)),
      };
    case "this_year":
      return {
        from: toIso(new Date(y, 0, 1)),
        to: toIso(new Date(y, 11, 31)),
      };
    default:
      return {
        from: toIso(new Date(y, m, 1)),
        to: toIso(new Date(y, m + 1, 0)),
      };
  }
}

const PRESET_LABELS: Record<Exclude<DateRangePreset, "custom">, string> = {
  this_month:    "This Month",
  last_month:    "Last Month",
  last_3_months: "Last 3 Months",
  this_year:     "This Year",
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [activePreset, setActivePreset] = useState<DateRangePreset>("this_month");

  function applyPreset(preset: Exclude<DateRangePreset, "custom">) {
    setActivePreset(preset);
    onChange(getPresetRange(preset));
  }

  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    setActivePreset("custom");
    onChange({ ...value, from: e.target.value });
  }

  function handleToChange(e: React.ChangeEvent<HTMLInputElement>) {
    setActivePreset("custom");
    onChange({ ...value, to: e.target.value });
  }

  const presetLabel =
    activePreset === "custom"
      ? `${value.from} → ${value.to}`
      : PRESET_LABELS[activePreset];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            {presetLabel}
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {(Object.keys(PRESET_LABELS) as Exclude<DateRangePreset, "custom">[]).map(
            (preset) => (
              <DropdownMenuItem
                key={preset}
                className={activePreset === preset ? "bg-indigo-50 text-indigo-700" : ""}
                onSelect={() => applyPreset(preset)}
              >
                {PRESET_LABELS[preset]}
              </DropdownMenuItem>
            )
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className={activePreset === "custom" ? "bg-indigo-50 text-indigo-700" : ""}
            onSelect={() => setActivePreset("custom")}
          >
            Custom range…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Manual date inputs (always visible for precision) */}
      <div className="flex items-center gap-1.5">
        <Label className="sr-only">From</Label>
        <Input
          type="date"
          value={value.from}
          onChange={handleFromChange}
          className="h-8 w-36 text-xs"
        />
        <span className="text-xs text-slate-400">→</span>
        <Label className="sr-only">To</Label>
        <Input
          type="date"
          value={value.to}
          onChange={handleToChange}
          className="h-8 w-36 text-xs"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Default range helper (exported for tab initialisation)
// ─────────────────────────────────────────────────────────────────────────────

export function getDefaultDateRange(): DateRange {
  return getPresetRange("this_month");
}
