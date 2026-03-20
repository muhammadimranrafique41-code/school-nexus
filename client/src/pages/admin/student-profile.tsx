import { useRoute, Link } from "wouter";
import { Layout } from "@/components/layout";
import { useUsers } from "@/hooks/use-users";
import { useAttendance } from "@/hooks/use-attendance";
import { useFees } from "@/hooks/use-fees";
import { useResults } from "@/hooks/use-results";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { getFeeStatusClassName } from "@/lib/finance";
import {
  ArrowLeft, Edit2, GraduationCap, MapPin, Phone, CalendarDays,
  CheckCircle2, XCircle, TrendingUp, Banknote, QrCode
} from "lucide-react";

// ── Avatar initials ───────────────────────────────────────────────────────
function Avatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-indigo-100 text-2xl font-bold text-indigo-700 shadow-sm border-4 border-white">
      {photoUrl ? <img src={photoUrl} alt={name} className="h-full w-full rounded-3xl object-cover" /> : initials}
    </div>
  );
}

// ── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "border-emerald-200 bg-emerald-50 text-emerald-700",
    inactive: "border-slate-200 bg-slate-50 text-slate-600",
    suspended: "border-rose-200 bg-rose-50 text-rose-700",
    graduated: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", map[status] ?? map.active)}>
      {status || "Active"}
    </span>
  );
}

export default function AdminStudentProfile() {
  const [, params] = useRoute("/admin/students/:id");
  const studentId = parseInt(params?.id || "0", 10);

  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: allAttendance, isLoading: attLoading } = useAttendance();
  const { data: allFees, isLoading: feesLoading } = useFees();
  const { data: allResults, isLoading: resultsLoading } = useResults();

  const student = users?.find(u => u.id === studentId && u.role === "student") as any;
  const attendance = allAttendance?.filter(a => a.studentId === studentId) || [];
  const fees = allFees?.filter(f => f.studentId === studentId) || [];
  const results = allResults?.filter(r => r.studentId === studentId) || [];

  if (usersLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-[400px] rounded-2xl" />
        </div>
      </Layout>
    );
  }

  if (!student) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold text-slate-800">Student Not Found</h2>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/admin/students">Back to Directory</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  // Attendance metrics
  const totalAtt = attendance.length;
  const present = attendance.filter(a => a.status === "Present").length;
  const attendanceRate = totalAtt > 0 ? Math.round((present / totalAtt) * 100) : 0;
  const recentAttendance = [...attendance].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 10);

  // Financial metrics
  const outstandingBal = fees.reduce((sum, f) => sum + f.remainingBalance, 0);
  const openInvoices = fees.filter(f => f.remainingBalance > 0).sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));

  return (
    <Layout>
      <div className="space-y-6 pb-8 max-w-5xl mx-auto">
        
        {/* Header / Nav */}
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <Link href="/admin/students"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Student Profile</h1>
          </div>
          <Button asChild variant="outline" size="sm" className="hidden sm:flex">
            <Link href="/admin/students"><Edit2 className="mr-2 h-3.5 w-3.5" /> Directory Data</Link>
          </Button>
        </div>

        {/* Profile Identity Card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="h-24 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-90" />
          <div className="px-6 pb-6 pt-0 sm:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end gap-5 -mt-10">
              <Avatar name={student.name} photoUrl={student.studentPhotoUrl} />
              
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-slate-900 leading-none">{student.name}</h2>
                  <StatusBadge status={student.studentStatus || "active"} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 mt-1">
                  <span className="flex items-center gap-1.5 font-mono">
                    <QrCode className="h-3.5 w-3.5" /> {student.rollNumber || "No Roll #"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5" /> Class {student.className || "Unassigned"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {student.address || "No address"}
                  </span>
                </div>
              </div>

              <div className="flex self-start sm:self-auto gap-2 mt-4 sm:mt-0">
                <div className="text-right border-r border-slate-200 pr-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attendance</p>
                  <p className="text-xl font-bold text-slate-900">{attendanceRate}%</p>
                </div>
                <div className="text-right pl-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Balance</p>
                  <p className="text-xl font-bold text-amber-600">{formatCurrency(outstandingBal)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start h-12 bg-transparent border-b border-slate-200 rounded-none p-0 overflow-x-auto">
            <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-6 shadow-none">Overview</TabsTrigger>
            <TabsTrigger value="attendance" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-6 shadow-none">Attendance</TabsTrigger>
            <TabsTrigger value="fees" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-6 shadow-none">Fees & Billing</TabsTrigger>
            <TabsTrigger value="results" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-6 shadow-none">Results</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="pt-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="shadow-none border-slate-200">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm">Personal Information</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4 text-sm">
                  <div className="grid grid-cols-3 gap-2 border-b border-slate-50 pb-3">
                    <span className="text-slate-500">Date of Birth</span>
                    <span className="col-span-2 font-medium text-slate-900">{student.dateOfBirth ? formatDate(student.dateOfBirth, "MMM dd, yyyy") : "—"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-slate-50 pb-3">
                    <span className="text-slate-500">Gender</span>
                    <span className="col-span-2 font-medium text-slate-900 capitalize">{student.gender || "—"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-slate-50 pb-3">
                    <span className="text-slate-500">Father's Name</span>
                    <span className="col-span-2 font-medium text-slate-900">{student.fatherName || "—"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-slate-50 pb-3">
                    <span className="text-slate-500">Phone</span>
                    <span className="col-span-2 font-medium text-slate-900 flex items-center gap-2">
                       {student.phone ? <><Phone className="h-3.5 w-3.5" />{student.phone}</> : "—"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-slate-500">Address</span>
                    <span className="col-span-2 font-medium text-slate-900">{student.address || "—"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-none border-slate-200">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm">Academic Details</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4 text-sm">
                  <div className="grid grid-cols-3 gap-2 border-b border-slate-50 pb-3">
                    <span className="text-slate-500">Roll Number</span>
                    <span className="col-span-2 font-medium font-mono text-slate-900">{student.rollNumber || "—"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-slate-50 pb-3">
                    <span className="text-slate-500">Class</span>
                    <span className="col-span-2 font-medium text-slate-900">{student.className || "—"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-slate-50 pb-3">
                    <span className="text-slate-500">Admission Date</span>
                    <span className="col-span-2 font-medium text-slate-900">{student.admissionDate ? formatDate(student.admissionDate, "MMM dd, yyyy") : "—"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-slate-500">System ID</span>
                    <span className="col-span-2 font-mono text-slate-400">USR-{student.id.toString().padStart(6, '0')}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ATTENDANCE TAB */}
          <TabsContent value="attendance" className="pt-6">
            <Card className="shadow-none border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <CardTitle className="text-sm">Attendance History</CardTitle>
                  <CardDescription className="text-xs">Overall rate: <span className="font-bold text-slate-900">{attendanceRate}%</span> ({totalAtt} total sessions)</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {attLoading ? (
                  <div className="p-8 text-center"><Skeleton className="h-4 w-1/2 mx-auto" /></div>
                ) : recentAttendance.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">No attendance records found.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Date</th>
                        <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                        <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentAttendance.map(record => (
                        <tr key={record.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="h-4 w-4 text-slate-400" />
                              {formatDate(record.date, "MMM dd, yyyy")}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            {record.status === "Present" ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" /> Present
                              </span>
                            ) : record.status === "Absent" ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                                <XCircle className="h-3 w-3" /> Absent
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                {record.status}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-slate-500">{record.remarks || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* FEES TAB */}
          <TabsContent value="fees" className="pt-6">
            <Card className="shadow-none border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 bg-amber-50/30">
                <div>
                  <CardTitle className="text-sm">Open Invoices</CardTitle>
                  <CardDescription className="text-xs">Outstanding balance: <span className="font-bold text-amber-600">{formatCurrency(outstandingBal)}</span></CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {feesLoading ? (
                  <div className="p-8 text-center"><Skeleton className="h-4 w-1/2 mx-auto" /></div>
                ) : openInvoices.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    All dues cleared! No open invoices.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Invoice</th>
                        <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Due Date</th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount Due</th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {openInvoices.map(fee => (
                        <tr key={fee.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-3">
                            <span className="block font-mono font-medium text-slate-900">{fee.invoiceNumber || ("INV-" + fee.id)}</span>
                            <span className="block text-xs text-slate-500">{fee.description}</span>
                          </td>
                          <td className="px-5 py-3 font-medium text-slate-700 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {fee.status === "Overdue" && <XCircle className="h-3 w-3 text-rose-500" />}
                              {formatDate(fee.dueDate, "MMM dd, yyyy")}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right font-bold text-slate-900">
                            {formatCurrency(fee.remainingBalance)}
                          </td>
                          <td className="px-5 py-3 text-right">
                             <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-semibold", getFeeStatusClassName(fee.status))}>
                                {fee.status}
                             </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* RESULTS TAB */}
          <TabsContent value="results" className="pt-6">
             <Card className="shadow-none border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                <div>
                   <CardTitle className="text-sm">Academic Results</CardTitle>
                   <CardDescription className="text-xs">All published exam results.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {resultsLoading ? (
                  <div className="p-8 text-center"><Skeleton className="h-4 w-1/2 mx-auto" /></div>
                ) : results.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">No academic results found.</div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {results.map(r => (
                       <div key={r.id} className="rounded-xl border border-slate-200 p-4 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition-colors">
                         <div className="flex justify-between items-start mb-4">
                           <div>
                             <h4 className="font-bold text-slate-900">{r.subject}</h4>
                             <p className="text-xs text-slate-500">{r.examTitle || "General Assessment"}</p>
                           </div>
                           <span className={cn("inline-flex items-center rounded-md border px-2 py-1 text-xs font-bold leading-none align-middle",
                             r.grade === "F" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                           )}>
                              {r.grade}
                           </span>
                         </div>
                         <div className="flex items-end gap-1 font-mono">
                           <span className="text-3xl font-black tracking-tighter text-slate-900 leading-none">{r.marks}</span>
                           <span className="text-sm text-slate-400 mb-1">/ {r.totalMarks || 100}</span>
                         </div>
                       </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </Layout>
  );
}
