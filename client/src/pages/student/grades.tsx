import { useMemo, useState } from "react";
import { parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Layout } from "@/components/layout";
import { useStudentResultDetail, useStudentResultsOverview } from "@/hooks/use-results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, escapeHtml, formatDate, openPrintWindow } from "@/lib/utils";
import { Award, BarChart3, Download, FileDown, GraduationCap, Loader2, TrendingUp } from "lucide-react";

export default function StudentGrades() {
  const { data, isLoading } = useStudentResultsOverview();
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const examDetail = useStudentResultDetail(selectedExamId);

  const exams = data?.exams ?? [];
  const recentResults = data?.recentResults ?? [];
  const subjectPerformance = useMemo(() => data?.subjectPerformance ?? [], [data]);
  const gradeDistribution = useMemo(() => data?.gradeDistribution ?? [], [data]);
  const trend = useMemo(() => data?.trend ?? [], [data]);

  const exportResults = () => {
    downloadCsv(
      "student-results-summary.csv",
      exams.map((exam) => ({
        Exam: exam.examTitle,
        Type: exam.examType,
        Term: exam.term,
        Date: exam.examDate,
        Percentage: exam.percentage,
        GPA: exam.gpa,
        Status: exam.status,
      })),
    );
  };

  const printOverview = () => {
    const rows = exams
      .map(
        (exam) => `<tr><td>${escapeHtml(exam.examTitle)}</td><td>${escapeHtml(exam.term)}</td><td>${escapeHtml(formatDate(exam.examDate, "MMM dd, yyyy"))}</td><td>${escapeHtml(exam.percentage)}%</td><td>${escapeHtml(exam.gpa)}</td><td>${escapeHtml(exam.status)}</td></tr>`,
      )
      .join("");

    openPrintWindow(
      "Academic Results Report",
      `<h1>Academic Results Report</h1>
       <div class="grid section">
         <div class="card"><strong>Current GPA</strong><div>${escapeHtml(data?.overview.currentGpa ?? 0)}</div></div>
         <div class="card"><strong>Cumulative GPA</strong><div>${escapeHtml(data?.overview.cumulativeGpa ?? 0)}</div></div>
       </div>
       <div class="section"><table><thead><tr><th>Exam</th><th>Term</th><th>Date</th><th>Percentage</th><th>GPA</th><th>Status</th></tr></thead><tbody>${rows || "<tr><td colspan='6'>No result records found.</td></tr>"}</tbody></table></div>`,
      { documentType: "reportCard", subtitle: data?.overview.totalExams ? `${data.overview.totalExams} published exams` : "Academic overview" },
    );
  };

  const printExamDetail = () => {
    if (!examDetail.data) return;
    const rows = examDetail.data.records
      .map(
        (record) => `<tr><td>${escapeHtml(record.subject)}</td><td>${escapeHtml(record.marks)}</td><td>${escapeHtml(record.totalMarks ?? 100)}</td><td>${escapeHtml(record.grade)}</td><td>${escapeHtml(record.remarks ?? "—")}</td></tr>`,
      )
      .join("");

    openPrintWindow(
      `${examDetail.data.exam.examTitle} Result Report`,
      `<h1>${escapeHtml(examDetail.data.exam.examTitle)} Result Report</h1>
       <p>${escapeHtml(examDetail.data.exam.term)} • ${escapeHtml(formatDate(examDetail.data.exam.examDate, "MMM dd, yyyy"))}</p>
       <div class="grid section">
         <div class="card"><strong>Percentage</strong><div>${escapeHtml(examDetail.data.exam.percentage)}%</div></div>
         <div class="card"><strong>GPA</strong><div>${escapeHtml(examDetail.data.exam.gpa)}</div></div>
       </div>
       <div class="section"><table><thead><tr><th>Subject</th><th>Marks</th><th>Total</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      { documentType: "reportCard", subtitle: examDetail.data.exam.term },
    );
  };

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">My Results</h1>
            <p className="mt-1 text-muted-foreground">Track exam-wise performance, GPA, grade spread, and printable result reports.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={exportResults} disabled={exams.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={printOverview} disabled={isLoading}>
              <FileDown className="mr-2 h-4 w-4" /> Print / Save PDF
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Current GPA", value: data?.overview.currentGpa ?? 0, hint: "Latest published exam", icon: GraduationCap },
            { label: "Cumulative GPA", value: data?.overview.cumulativeGpa ?? 0, hint: "Across all exam records", icon: Award },
            { label: "Pass rate", value: `${data?.overview.passRate ?? 0}%`, hint: `${data?.overview.totalExams ?? 0} exam(s)`, icon: TrendingUp },
            { label: "Strongest subject", value: data?.overview.strongestSubject ?? "N/A", hint: `Weakest: ${data?.overview.weakestSubject ?? "N/A"}`, icon: BarChart3 },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-display font-bold">{item.value}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.hint}</p>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary"><item.icon className="h-5 w-5" /></div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-7">
          <Card className="shadow-sm lg:col-span-4">
            <CardHeader>
              <CardTitle>Performance Trend</CardTitle>
              <CardDescription>Exam-wise percentage and GPA trend.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : trend.length === 0 ? (
                <div className="flex h-72 items-center justify-center rounded-xl border border-dashed text-muted-foreground">No performance trend available yet.</div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="percentage" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="gpa" stroke="#14b8a6" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm lg:col-span-3">
            <CardHeader>
              <CardTitle>Grade Distribution</CardTitle>
              <CardDescription>Breakdown of grades across all published results.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : gradeDistribution.length === 0 ? (
                <div className="flex h-72 items-center justify-center rounded-xl border border-dashed text-muted-foreground">No grade distribution available.</div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={gradeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="grade" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Subject Performance</CardTitle>
            <CardDescription>Average subject performance with latest grade snapshots.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : subjectPerformance.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No subject performance data is available yet.</div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subjectPerformance} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" axisLine={false} tickLine={false} />
                      <YAxis dataKey="subject" type="category" axisLine={false} tickLine={false} width={120} />
                      <Tooltip />
                      <Bar dataKey="averagePercentage" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {subjectPerformance.map((subject) => (
                    <div key={subject.subject} className="rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{subject.subject}</p>
                          <p className="text-sm text-muted-foreground">Average marks: {subject.averageMarks}</p>
                        </div>
                        <Badge variant="secondary">Latest grade: {subject.latestGrade}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Exam-wise Results</CardTitle>
            <CardDescription>Review each exam summary and open detailed subject-level records.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-6">Exam</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Percentage</TableHead>
                  <TableHead>GPA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
                ) : exams.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No published exam summaries yet.</TableCell></TableRow>
                ) : (
                  exams.map((exam) => (
                    <TableRow key={exam.examId}>
                      <TableCell className="pl-6 font-medium">{exam.examTitle}</TableCell>
                      <TableCell>{exam.term}</TableCell>
                      <TableCell>{formatDate(parseISO(exam.examDate), "MMM dd, yyyy")}</TableCell>
                      <TableCell>{exam.percentage}%</TableCell>
                      <TableCell>{exam.gpa}</TableCell>
                      <TableCell><Badge variant={exam.status === "Pass" ? "secondary" : "destructive"}>{exam.status}</Badge></TableCell>
                      <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setSelectedExamId(exam.examId)}>View details</Button></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Recent Subject Results</CardTitle>
            <CardDescription>Latest subject-level records published to your account.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-6">Subject</TableHead>
                  <TableHead>Exam</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
                ) : recentResults.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No subject-level result records are available yet.</TableCell></TableRow>
                ) : (
                  recentResults.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="pl-6 font-medium">{record.subject}</TableCell>
                      <TableCell>{record.examTitle ?? "Assessment"}</TableCell>
                      <TableCell>{record.marks}/{record.totalMarks ?? 100}</TableCell>
                      <TableCell><Badge variant={record.grade === "F" ? "destructive" : "secondary"}>{record.grade}</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!selectedExamId} onOpenChange={(open) => !open && setSelectedExamId(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{examDetail.data?.exam.examTitle ?? "Exam Result"}</DialogTitle>
              <DialogDescription>Review subject-wise scores, grades, and remarks for the selected exam.</DialogDescription>
            </DialogHeader>
            {examDetail.isLoading ? (
              <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : !examDetail.data ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Unable to load result details for this exam.</div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-4">
                  {[
                    { label: "Exam type", value: examDetail.data.exam.examType },
                    { label: "Subjects", value: examDetail.data.exam.subjectsCount },
                    { label: "Percentage", value: `${examDetail.data.exam.percentage}%` },
                    { label: "GPA", value: examDetail.data.exam.gpa },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border p-4">
                      <p className="text-sm text-muted-foreground">{item.label}</p>
                      <p className="mt-1 text-xl font-semibold">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button onClick={printExamDetail}><FileDown className="mr-2 h-4 w-4" /> Print exam report</Button>
                </div>
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Marks</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {examDetail.data.records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.subject}</TableCell>
                        <TableCell>{record.marks}</TableCell>
                        <TableCell>{record.totalMarks ?? 100}</TableCell>
                        <TableCell><Badge variant={record.grade === "F" ? "destructive" : "secondary"}>{record.grade}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{record.remarks || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
