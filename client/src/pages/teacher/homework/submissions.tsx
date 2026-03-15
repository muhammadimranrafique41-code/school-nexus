import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import Papa from "papaparse";
import { format, formatDistanceToNow } from "date-fns";
import { ColumnDef, SortingState, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useHomeworkDetail, useHomeworkDownloadUrl, useGradeSubmission } from "@/hooks/use-homework";
import { Download, ArrowLeft, FileText, Loader2, ArrowUpDown } from "lucide-react";

type SubmissionRow = {
  id: string | null;
  homeworkId: string;
  studentId: number;
  studentName: string;
  avatarUrl: string | null;
  className: string | null;
  submissionFile: string | null;
  submittedAt: string | null;
  marks: number | null;
  feedback: string | null;
  status: "Submitted" | "Pending" | "Late";
};

const filterTabs = ["all", "submitted", "pending", "late"] as const;

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function GradeControls({ row, homeworkId }: { row: SubmissionRow; homeworkId: string }) {
  const canGrade = Boolean(row.id);
  const [marks, setMarks] = useState(row.marks ?? "");
  const [feedback, setFeedback] = useState(row.feedback ?? "");
  const [open, setOpen] = useState(false);
  const gradeSubmission = useGradeSubmission(row.id ?? "", homeworkId);

  const saveGrade = async () => {
    if (!canGrade) return;
    const numericMarks = typeof marks === "number" ? marks : Number(marks || 0);
    await gradeSubmission.mutateAsync({ marks: numericMarks, feedback });
  };

  return (
    <div className="flex items-center gap-3">
      <Input
        type="number"
        min={0}
        max={100}
        value={marks}
        disabled={!canGrade}
        onChange={(event) => setMarks(event.target.value === "" ? "" : Number(event.target.value))}
        onBlur={saveGrade}
        className="h-9 w-20"
        aria-label="Marks"
      />
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (open && !next) void saveGrade();
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={!canGrade}>
            Feedback
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <Textarea
            rows={4}
            value={feedback ?? ""}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Add feedback for the student"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DownloadButton({ fileKey }: { fileKey: string | null }) {
  const downloadUrl = useHomeworkDownloadUrl();

  if (!fileKey) return <span className="text-xs text-slate-400">—</span>;

  const handleDownload = async () => {
    const result = await downloadUrl.mutateAsync(fileKey);
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  return (
    <Button variant="ghost" size="icon" onClick={handleDownload} aria-label="Download submission">
      <Download className="h-4 w-4" />
    </Button>
  );
}

export default function SubmissionReviewPage() {
  const [match, params] = useRoute("/teacher/homework/:id/submissions");
  const homeworkId = match ? params?.id : null;
  const { data, isLoading } = useHomeworkDetail(homeworkId ?? undefined);
  const detail = data?.data;

  const [filter, setFilter] = useState<typeof filterTabs[number]>("all");
  const [search, setSearch] = useState("");
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [sorting, setSorting] = useState<SortingState>([]);

  const rows = useMemo<SubmissionRow[]>(() => {
    if (!detail) return [];
    const dueDate = new Date(`${detail.dueDate}T23:59:59`);
    return detail.submissions.map((submission) => {
      const submittedAt = submission.submittedAt ? new Date(submission.submittedAt) : null;
      const isLate = submittedAt ? submittedAt.getTime() > dueDate.getTime() : false;
      return {
        id: submission.id,
        homeworkId: detail.id,
        studentId: submission.studentId,
        studentName: submission.student.name,
        avatarUrl: submission.student.avatarUrl ?? null,
        className: submission.student.className ?? null,
        submissionFile: submission.submissionFile ?? null,
        submittedAt: submission.submittedAt ?? null,
        marks: submission.marks ?? null,
        feedback: submission.feedback ?? null,
        status: submission.submittedAt ? (isLate ? "Late" : "Submitted") : "Pending",
      };
    });
  }, [detail]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filter !== "all" && row.status.toLowerCase() !== filter) return false;
      if (search && !row.studentName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [filter, rows, search]);

  const submissionCount = rows.filter((row) => row.status !== "Pending").length;
  const classSize = rows.length;
  const progress = classSize ? Math.round((submissionCount / classSize) * 100) : 0;

  const columns = useMemo<ColumnDef<SubmissionRow>[]>(() => [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
          aria-label="Select all rows"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          aria-label="Select row"
        />
      ),
    },
    {
      accessorKey: "studentName",
      header: ({ column }) => (
        <Button variant="ghost" size="sm" onClick={column.getToggleSortingHandler()}>
          Student <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={row.original.avatarUrl ?? undefined} />
            <AvatarFallback>{row.original.studentName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-slate-900">{row.original.studentName}</p>
            <p className="text-xs text-slate-500">{row.original.className ?? "—"}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "submittedAt",
      header: ({ column }) => (
        <Button variant="ghost" size="sm" onClick={column.getToggleSortingHandler()}>
          Submitted At <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const submittedAt = row.original.submittedAt;
        if (!submittedAt) return <span className="text-xs text-slate-400">Pending</span>;
        const date = new Date(submittedAt);
        return (
          <span title={format(date, "PPpp")} className="text-sm text-slate-600">
            {formatDistanceToNow(date, { addSuffix: true })}
          </span>
        );
      },
    },
    {
      accessorKey: "submissionFile",
      header: "File",
      cell: ({ row }) => <DownloadButton fileKey={row.original.submissionFile} />,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "Late" ? "secondary" : "outline"}>{row.original.status}</Badge>
      ),
    },
    {
      id: "marks",
      header: "Marks",
      cell: ({ row }) => (
        <GradeControls row={row.original} homeworkId={row.original.homeworkId} />
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm">Grade</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Grade submission</SheetTitle>
              <SheetDescription>{row.original.studentName}</SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Submission status</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{row.original.status}</p>
              </div>
              <GradeControls row={row.original} homeworkId={row.original.homeworkId} />
            </div>
          </SheetContent>
        </Sheet>
      ),
    },
  ], []);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => String(row.studentId),
  });

  const exportAll = () => {
    const rowsToExport = filteredRows.map((row) => ({
      student: row.studentName,
      status: row.status,
      marks: row.marks ?? "",
      feedback: row.feedback ?? "",
    }));
    downloadCsv(`homework-${homeworkId}-grades.csv`, rowsToExport);
  };

  const exportSelected = () => {
    const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
    if (selectedRows.length === 0) return;
    downloadCsv(`homework-${homeworkId}-selected-grades.csv`, selectedRows.map((row) => ({
      student: row.studentName,
      status: row.status,
      marks: row.marks ?? "",
      feedback: row.feedback ?? "",
    })));
  };

  if (!match || !homeworkId) {
    return (
      <Layout>
        <Card className="p-8 text-center text-sm text-slate-500">Invalid homework link.</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <Button variant="ghost" className="gap-2" asChild>
          <a href={`/teacher/homework/${homeworkId}/edit`}>
            <ArrowLeft className="h-4 w-4" /> Back to homework
          </a>
        </Button>

        <Card className="border-white/60 bg-white/80 p-6">
          {isLoading || !detail ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading submissions...
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-slate-900">{detail.title}</h1>
                  <p className="mt-1 text-sm text-slate-500">{detail.classLabel} • Due {detail.dueDate}</p>
                </div>
                <Button variant="outline" onClick={exportAll} className="gap-2">
                  <FileText className="h-4 w-4" /> Export CSV
                </Button>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>{submissionCount} / {classSize} submitted ({progress}%)</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="mt-2 h-2" />
              </div>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by student name"
              className="w-64 bg-white/80"
            />
            <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filterTabs[number])}>
              <TabsList className="bg-white/80">
                {filterTabs.map((tab) => (
                  <TabsTrigger key={tab} value={tab} className="capitalize">
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <Button variant="outline" onClick={exportSelected} disabled={table.getSelectedRowModel().rows.length === 0}>
            Export selected grades
          </Button>
        </div>

        <Card className="border-white/60 bg-white/80 p-4">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-slate-500">
                    No submissions found.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className={row.original.status === "Late" ? "bg-amber-50/70" : undefined}>
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
        </Card>
      </div>
    </Layout>
  );
}
