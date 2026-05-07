import * as Papa from "papaparse";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MATAggregate } from "../types";

export function MATAggregateTable({ rows }: { rows: MATAggregate[] }) {
  const months = Array.from(new Set(rows.flatMap((row) => row.monthlyScores.map((score) => score.month))));
  const exportCsv = () => {
    const csv = Papa.unparse(
      rows.map((row, index) => ({
        rank: index + 1,
        student_name: row.name,
        roll_no: row.rollNo,
        ...Object.fromEntries(months.map((month) => [month, row.monthlyScores.find((score) => score.month === month)?.percentage ?? ""])),
        best_average: row.bestNScores.length ? row.bestNScores.reduce((sum, value) => sum + value, 0) / row.bestNScores.length : 0,
        aggregate: row.aggregateMarks,
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mat-summary.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button></div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead><TableHead>Student Name</TableHead><TableHead>Roll No</TableHead>
              {months.map((month) => <TableHead key={month}>{month}</TableHead>)}
              <TableHead>Best 5 Avg</TableHead><TableHead>Aggregate / 50</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.studentId}>
                <TableCell>{index + 1}</TableCell><TableCell>{row.name}</TableCell><TableCell>{row.rollNo || "-"}</TableCell>
                {months.map((month) => <TableCell key={month}>{row.monthlyScores.find((score) => score.month === month)?.percentage ?? "-"}</TableCell>)}
                <TableCell>{row.bestNScores.length ? (row.bestNScores.reduce((sum, value) => sum + value, 0) / row.bestNScores.length).toFixed(2) : "-"}</TableCell>
                <TableCell>{row.aggregateMarks}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
