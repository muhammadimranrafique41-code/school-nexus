import { useMemo, useRef, useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import * as Papa from "papaparse";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ExamSubject, MarkEntryStudent } from "../types";

type Row = MarkEntryStudent & { practicalMarks: number | null; theoryMarks: number | null };
type CsvRow = { roll_no?: string; theory_marks?: string; practical_marks?: string; remarks?: string };

const gradeFromPercentage = (percentage: number): string => {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  if (percentage >= 40) return "E";
  return "F";
};

// ─── MarkInput ────────────────────────────────────────────────────────────────
// Defined at MODULE level (outside MarkEntryGrid) so React never unmounts it
// due to a parent re-render. It receives a stable `onUpdate` ref-based callback.
function MarkInput({
  value,
  studentId,
  field,
  max,
  isAbsent,
  onUpdate,
  onFocus,
}: {
  value: number | null;
  studentId: number;
  field: "theoryMarks" | "practicalMarks";
  max: number;
  isAbsent: boolean;
  onUpdate: (studentId: number, patch: Partial<Row>) => void;
  onFocus: (key: string) => void;
}) {
  const invalid = !isAbsent && value !== null && Number(value) > max;
  const input = (
    <Input
      className={invalid ? "border-red-500 ring-1 ring-red-500" : ""}
      readOnly={isAbsent}
      value={value ?? ""}
      onFocus={() => onFocus(`${studentId}-${field}`)}
      onChange={(event) =>
        onUpdate(studentId, {
          [field]: event.target.value === "" ? null : Number(event.target.value),
        })
      }
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onUpdate(studentId, { [field]: null });
          event.currentTarget.blur();
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const inputs = Array.from(
            document.querySelectorAll<HTMLInputElement>("[data-mark-input]"),
          );
          const index = inputs.indexOf(event.currentTarget);
          inputs[index + 2]?.focus();
        }
      }}
      data-mark-input
    />
  );
  return invalid ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{input}</TooltipTrigger>
        <TooltipContent>Maximum allowed: {max}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    input
  );
}

// ─── RemarksInput ─────────────────────────────────────────────────────────────
// Also at module level for the same reason.
function RemarksInput({
  value,
  studentId,
  onUpdate,
}: {
  value: string | null;
  studentId: number;
  onUpdate: (studentId: number, patch: Partial<Row>) => void;
}) {
  return (
    <Input
      value={value ?? ""}
      onChange={(event) => onUpdate(studentId, { remarks: event.target.value })}
    />
  );
}

// ─── MarkEntryGrid ────────────────────────────────────────────────────────────
export function MarkEntryGrid({
  rows,
  subject,
  onChange,
  isLoading,
  error,
}: {
  rows: Row[];
  subject?: ExamSubject;
  onChange: (rows: Row[]) => void;
  isLoading?: boolean;
  error?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const maxTheory = subject?.maxTheoryMarks ?? 0;
  const maxPractical = subject?.maxPracticalMarks ?? 0;

  // ── Keep a stable ref to the latest rows + onChange so that updateRow never
  //    needs to be recreated when rows change. This prevents columns from
  //    recomputing and avoids React unmounting/remounting the input elements.
  const stateRef = useRef({ rows, onChange });
  stateRef.current = { rows, onChange };

  // updateRow is now STABLE — it never changes identity across renders.
  const updateRow = useRef((studentId: number, patch: Partial<Row>) => {
    const { rows: currentRows, onChange: currentOnChange } = stateRef.current;
    currentOnChange(
      currentRows.map((row) =>
        row.studentId === studentId ? { ...row, ...patch } : row,
      ),
    );
  }).current;

  // columns only recomputes when max marks change (not on every row update)
  const columns = useMemo(() => {
    const helper = createColumnHelper<Row>();
    return [
      helper.accessor("rollNo", {
        header: "Roll No",
        cell: (info) => (
          <span className="font-medium">{info.getValue() || "-"}</span>
        ),
      }),
      helper.accessor("name", { header: "Name" }),
      helper.display({
        id: "theory",
        header: "Theory",
        cell: ({ row }) => (
          <MarkInput
            value={row.original.theoryMarks}
            studentId={row.original.studentId}
            field="theoryMarks"
            max={maxTheory}
            isAbsent={row.original.isAbsent}
            onUpdate={updateRow}
            onFocus={setActiveCell}
          />
        ),
      }),
      helper.display({
        id: "practical",
        header: "Practical",
        cell: ({ row }) => (
          <MarkInput
            value={row.original.practicalMarks}
            studentId={row.original.studentId}
            field="practicalMarks"
            max={maxPractical}
            isAbsent={row.original.isAbsent}
            onUpdate={updateRow}
            onFocus={setActiveCell}
          />
        ),
      }),
      helper.display({
        id: "total",
        header: "Total",
        cell: ({ row }) =>
          row.original.isAbsent
            ? "ABSENT"
            : (row.original.theoryMarks ?? 0) + (row.original.practicalMarks ?? 0),
      }),
      helper.display({
        id: "grade",
        header: "Grade",
        cell: ({ row }) => {
          if (row.original.isAbsent) return "-";
          const total =
            (row.original.theoryMarks ?? 0) + (row.original.practicalMarks ?? 0);
          const max = maxTheory + maxPractical;
          return max > 0 ? gradeFromPercentage((total / max) * 100) : "-";
        },
      }),
      helper.display({
        id: "absent",
        header: "Absent",
        cell: ({ row }) => (
          <Checkbox
            checked={row.original.isAbsent}
            onCheckedChange={(checked) =>
              updateRow(row.original.studentId, { isAbsent: checked === true })
            }
          />
        ),
      }),
      helper.display({
        id: "remarks",
        header: "Remarks",
        cell: ({ row }) => (
          <RemarksInput
            value={row.original.remarks}
            studentId={row.original.studentId}
            onUpdate={updateRow}
          />
        ),
      }),
    ];
  }, [maxTheory, maxPractical, updateRow]);

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  const entered = rows.filter(
    (row) => row.isAbsent || row.theoryMarks !== null || row.practicalMarks !== null,
  ).length;
  const absent = rows.filter((row) => row.isAbsent).length;
  const pending = Math.max(rows.length - entered, 0);

  const importCsv = (file: File) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const required = ["roll_no", "theory_marks", "practical_marks", "remarks"];
        const first = result.data[0] ?? {};
        if (!required.every((key) => key in first)) return;
        stateRef.current.onChange(
          stateRef.current.rows.map((row) => {
            const match = result.data.find((item) => item.roll_no === row.rollNo);
            return match
              ? {
                  ...row,
                  theoryMarks: Number(match.theory_marks ?? 0),
                  practicalMarks: Number(match.practical_marks ?? 0),
                  remarks: match.remarks ?? row.remarks,
                }
              : row;
          }),
        );
      },
    });
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(event) =>
          event.target.files?.[0] && importCsv(event.target.files[0])
        }
      />
      <div className="overflow-hidden rounded-lg border bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                  Loading students...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-red-500">
                  Error: {error}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                  {subject
                    ? "No students found in this class"
                    : "Please select an exam and subject to begin"}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={
                    row.original.isAbsent
                      ? "bg-slate-50 text-slate-500"
                      : activeCell?.startsWith(String(row.original.studentId))
                        ? "bg-blue-50/40"
                        : ""
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {rows.length > 0 && (
        <div className="text-sm text-slate-600">
          {entered} / {rows.length} entered · {absent} absent · {pending} pending
        </div>
      )}
      <button
        type="button"
        className="hidden"
        data-import-csv
        onClick={() => fileRef.current?.click()}
      />
    </div>
  );
}
