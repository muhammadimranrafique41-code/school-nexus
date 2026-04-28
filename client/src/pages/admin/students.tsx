import { useState, useMemo, useEffect } from "react";
import { useFamilies } from "@/hooks/use-families";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  useUsers,
  useCreateUser,
  useUpdateUser as useUpdateUserHook,
  useDeleteUser as useDeleteUserHook,
} from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage, paginateItems, downloadCsv, cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Download, GraduationCap, Loader2, Plus, Search, Trash2, Edit2, ChevronRight, UserCheck, UserX, UserMinus } from "lucide-react";
import { FamilySelect } from "@/components/family/FamilySelect";
import { CreateFamilyDialog } from "@/components/family/CreateFamilyDialog";

type ListedStudent = {
  id: number; name: string; email: string; role: string;
  className?: string | null; fatherName?: string | null; studentPhotoUrl?: string | null;
  rollNumber?: string | null; dateOfBirth?: string | null; gender?: string | null;
  admissionDate?: string | null; studentStatus?: string | null; phone?: string | null; address?: string | null;
  familyId?: number | null; familyName?: string | null;
};

const optionalUrlField = z.union([z.string().trim().url("Enter a valid URL"), z.literal("")]).optional();

const studentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().optional(),
  className: z.string().min(1, "Class name is required"),
  fatherName: z.string().optional(),
  studentPhotoUrl: optionalUrlField,
  rollNumber: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  admissionDate: z.string().optional(),
  studentStatus: z.string().optional().default("active"),
  phone: z.string().optional(),
  address: z.string().optional(),
  familyId: z.number().int().positive().nullable().optional(),
  familyName: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.password && data.password.length < 6) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Password must be at least 6 characters" });
  }
});

const PAGE_SIZE = 10;

// ── Avatar initials ───────────────────────────────────────────────────────
function Avatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
      {photoUrl ? <img src={photoUrl} alt={name} className="h-full w-full rounded-full object-cover" /> : initials}
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

export default function StudentManagement() {
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUserHook();
  const deleteUser = useDeleteUserHook();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<ListedStudent | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<ListedStudent | null>(null);
  const [createFamilyOpen, setCreateFamilyOpen] = useState(false);
  const [createFamilySeed, setCreateFamilySeed] = useState<string>("");

  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const emptyStudentDefaults: z.infer<typeof studentSchema> = {
    name: "", email: "", password: "", className: "", fatherName: "", studentPhotoUrl: "",
    rollNumber: "", dateOfBirth: "", gender: "male", admissionDate: "",
    studentStatus: "active", phone: "", address: "", familyId: null, familyName: "",
  };

  const form = useForm<z.infer<typeof studentSchema>>({
    resolver: zodResolver(studentSchema),
    defaultValues: emptyStudentDefaults,
  });

  const { data: familiesData } = useFamilies();
  const families = useMemo(() => ((familiesData ?? []) as Array<{ id: number; name: string }>).map(f => ({ id: f.id, name: f.name })), [familiesData]);

  const students = useMemo(() => (users ?? []).filter(u => u.role === 'student'), [users]);

  // Derived unique classes for filter
  const uniqueClasses = useMemo(() => Array.from(new Set(students.map(s => s.className).filter(Boolean))), [students]);

  // Combined Filtering
  const filteredStudents = useMemo(() => students.filter((student) => {
    const matchesClass = classFilter === "all" || student.className === classFilter;
    const matchesStatus = statusFilter === "all" || (student.studentStatus || "active") === statusFilter;
    const query = searchTerm.toLowerCase();
    const hay = `${student.name} ${student.email} ${student.className} ${student.fatherName} ${student.rollNumber}`.toLowerCase();
    return matchesClass && matchesStatus && hay.includes(query);
  }), [students, classFilter, statusFilter, searchTerm]);

  const paginated = paginateItems(filteredStudents, currentPage, PAGE_SIZE);

  const onSubmit = async (data: z.infer<typeof studentSchema>) => {
    const payload = {
      ...data,
      role: "student" as const,
      password: data.password?.trim() || undefined,
      familyId: data.familyId ?? null,
      familyName: data.familyName ?? "",
    };

    if (!editingStudent && !payload.password) {
      form.setError("password", { message: "Password is required" });
      return;
    }

    try {
      if (editingStudent) {
        await updateUser.mutateAsync({ id: editingStudent.id, ...payload });
      } else {
        await createUser.mutateAsync({ ...payload, password: payload.password! });
      }

      setIsOpen(false);
      setEditingStudent(null);
      form.reset(emptyStudentDefaults);
      toast({ title: editingStudent ? "Student updated" : "Student created", description: `${payload.name} has been saved successfully.` });
    } catch (error) {
      toast({ title: "Unable to save student", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handleEdit = (student: ListedStudent) => {
    form.reset({
      name: student.name, email: student.email, password: "", className: student.className || "",
      fatherName: student.fatherName || "", studentPhotoUrl: student.studentPhotoUrl || "",
      rollNumber: student.rollNumber || "", dateOfBirth: student.dateOfBirth || "",
      gender: student.gender || "male", admissionDate: student.admissionDate || "",
      studentStatus: student.studentStatus || "active", phone: student.phone || "",
      address: student.address || "", familyId: student.familyId ?? null, familyName: student.familyName || "",
    });
    setEditingStudent(student);
    setIsOpen(true);
  };

  const handleDelete = async () => {
    if (!studentToDelete) return;
    try {
      await deleteUser.mutateAsync(studentToDelete.id);
      toast({ title: "Student deleted", description: `${studentToDelete.name} has been removed.` });
      setStudentToDelete(null);
    } catch (error) { toast({ title: "Unable to delete student", description: getErrorMessage(error), variant: "destructive" }); }
  };

  const exportCsv = () => {
    downloadCsv(`students-export.csv`, filteredStudents.map((s) => ({
      "Roll No": s.rollNumber || "", Name: s.name, Email: s.email, Class: s.className || "",
      "Father Name": s.fatherName || "", Status: s.studentStatus || "active",
      Phone: s.phone || "", "Admission Date": s.admissionDate || "", DOB: s.dateOfBirth || "", Gender: s.gender || ""
    })));
  };

  const summary = {
    total: students.length,
    active: students.filter((s) => (s.studentStatus || "active") === "active").length,
    graduated: students.filter((s) => s.studentStatus === "graduated").length,
    inactive: students.filter((s) => ["inactive", "suspended"].includes(s.studentStatus || "")).length,
  };

  return (
    <Layout>
      <div className="space-y-5 pb-8">
        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Student Directory</h1>
              <p className="mt-0.5 text-[12px] text-slate-400">Manage all admitted students, profiles, and statuses.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={filteredStudents.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" />Export CSV
            </Button>
            <Button size="sm" onClick={() => { setEditingStudent(null); form.reset(emptyStudentDefaults); setIsOpen(true); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Add Student
            </Button>
          </div>
        </section>

        {/* ── KPI strip ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Total students", value: summary.total, icon: GraduationCap, color: "text-indigo-600 bg-indigo-50", border: "border-indigo-100" },
            { label: "Active", value: summary.active, icon: UserCheck, color: "text-emerald-600 bg-emerald-50", border: "border-emerald-100" },
            { label: "Graduated", value: summary.graduated, icon: GraduationCap, color: "text-violet-600 bg-violet-50", border: "border-violet-100" },
            { label: "Inactive/Susp.", value: summary.inactive, icon: UserMinus, color: "text-rose-600 bg-rose-50", border: "border-rose-100" },
          ].map((item) => (
            <Card key={item.label} className={cn("border bg-white shadow-none", item.border)}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", item.color)}>
                  <item.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                  <p className="mt-0.5 text-2xl font-bold leading-tight text-slate-900">{item.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* ── Table card ──────────────────────────────────────────────── */}
         <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search name, roll no, email, class…" className="h-8 pl-8 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex flex-1 sm:max-w-[320px] gap-2">
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {uniqueClasses.map(c => <SelectItem key={c} value={c as string}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="graduated">Graduated</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Roll No</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Student</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Family</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Class & Form</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Status</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="py-14 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-500" /></td></tr>
                ) : filteredStudents.length === 0 ? (
                  <tr><td colSpan={6} className="py-14 text-center text-[13px] text-slate-400">No students found.</td></tr>
                ) : (
                  paginated.pageItems.map((student, idx) => (
                    <tr key={student.id} className={cn("group border-b border-slate-100 last:border-b-0 transition-colors duration-100 hover:bg-slate-50/60", idx % 2 === 1 && "bg-slate-50/30")}>
                      <td className="px-4 py-2.5 font-mono text-[12px] font-semibold text-slate-600">
                        {student.rollNumber || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={student.name} photoUrl={student.studentPhotoUrl} />
                          <div>
                            <span className="block text-[13px] font-semibold text-slate-900">{student.name}</span>
                            <span className="block text-[11px] text-slate-400">{student.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block text-[13px] font-medium text-slate-700">{student.className || "—"}</span>
                        {student.fatherName && <span className="block text-[11px] text-slate-400">D/O, S/O {student.fatherName}</span>}
                      </td>
                      <td className="px-3 py-2.5">
  <StatusBadge status={student.studentStatus || "active"} />
</td>
<td className="px-3 py-2.5">
  <span className="block text-[13px] font-semibold text-slate-600">{student.familyName || "None"}</span>
</td>
<td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-50 transition-opacity group-hover:opacity-100">
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-indigo-600 hover:bg-indigo-50" title="View Profile">
                            <Link href={`/admin/students/${student.id}`}><ChevronRight className="h-4 w-4" /></Link>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100" title="Edit student" onClick={() => handleEdit(student)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete student" onClick={() => setStudentToDelete(student)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredStudents.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <p className="text-[11px] text-slate-400">
                {(paginated.currentPage - 1) * PAGE_SIZE + 1}–{Math.min(paginated.currentPage * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} students
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" className={cn("h-7 text-xs", paginated.currentPage === 1 && "pointer-events-none opacity-40")} onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.max(1, p - 1)); }} />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-3 text-[11px] text-slate-400">Page {paginated.currentPage} / {paginated.totalPages}</span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext href="#" className={cn("h-7 text-xs", paginated.currentPage === paginated.totalPages && "pointer-events-none opacity-40")} onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.min(paginated.totalPages, p + 1)); }} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </Card>

        {/* ── Create / Edit Dialog ─────────────────────────────────────── */}
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">{editingStudent ? "Edit student profile" : "Admit new student"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                {/* Academic Identity */}
                <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Academic Details</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField control={form.control} name="rollNumber" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Roll Number</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="SCH-2025-001" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                    <FormField control={form.control} name="className" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Class & Section *</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Grade 10-A" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField control={form.control} name="admissionDate" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Admission Date</FormLabel><FormControl><Input type="date" className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                    <FormField control={form.control} name="studentStatus" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="graduated">Graduated</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                          </SelectContent>
                        </Select>
                      <FormMessage className="text-[11px]" /></FormItem>
                    )} />
                  </div>
                </div>

                {/* Personal / Account */}
                <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Personal & Account</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Full Name *</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Student Name" {...field} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Email *</FormLabel><FormControl><Input type="email" className="h-8 text-sm" placeholder="student@school.edu" {...field} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField control={form.control} name="fatherName" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Father's Name</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Guardian Name" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                    <FormField control={form.control} name="password" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">{editingStudent ? "New password (opt.)" : "Temporary password *"}</FormLabel><FormControl><Input type="password" className="h-8 text-sm" placeholder="••••••••" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                     <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Date of Birth</FormLabel><FormControl><Input type="date" className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                    <FormField control={form.control} name="gender" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Gender</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      <FormMessage className="text-[11px]" /></FormItem>
                    )} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                     <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Contact Number</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="+1234..." {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                     <FormField control={form.control} name="studentPhotoUrl" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Photo URL</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="https://…" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="address" render={({ field }) => (
                    <FormItem><FormLabel className="text-xs font-medium text-slate-700">Address / Location</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Current address..." {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                  )} />
                </div>

                {/* Family linkage */}
                <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Family Linkage</p>
                  <FormField
                    control={form.control}
                    name="familyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-slate-700">Family</FormLabel>
                        <FormControl>
                          <div className="relative flex items-center gap-2">
                            <FamilySelect
                              value={field.value}
                              onChange={(id, family) => {
                                field.onChange(id);
                                if (id !== null && family) {
                                  form.setValue("familyName", family.name);
                                } else {
                                  form.setValue("familyName", "");
                                }
                              }}
                              onCreateNew={(searchTerm) => {
                                setCreateFamilySeed(searchTerm);
                                setCreateFamilyOpen(true);
                              }}
                            />
                            {field.value !== null && !field.dirty ? (
                              <span className="ml-2 text-sm text-gray-500">
                                {families.find(f => f.id === field.value)?.name || "None"}
                              </span>
                            ) : null}
                            {form.watch("familyName") && (
                              <span className="ml-2 text-sm text-gray-600">
                                Selected: {form.watch("familyName")}
                              </span>
                            )}
                          </div>
                        </FormControl>
                        <p className="text-[11px] text-slate-400">
                          Group this student with siblings under a shared family unit. Optional but enables consolidated billing.
                        </p>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={createUser.isPending || updateUser.isPending}>
                    {createUser.isPending || updateUser.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editingStudent ? "Save changes" : "Admit student"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* ── Delete confirm ───────────────────────────────────────────── */}
        <AlertDialog open={!!studentToDelete} onOpenChange={(open) => !open && setStudentToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove student?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                This will permanently remove <strong>{studentToDelete?.name}</strong>. Their attendance, grades, and fees will also be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-8 text-sm">Cancel</AlertDialogCancel>
              <AlertDialogAction className="h-8 bg-rose-600 text-sm hover:bg-rose-700" onClick={handleDelete}>
                {deleteUser.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Create Family (inline shortcut) ──────────────────────────── */}
        <CreateFamilyDialog
          open={createFamilyOpen}
          onOpenChange={setCreateFamilyOpen}
          defaultName={createFamilySeed}
          onCreated={(family) => {
            form.setValue("familyId", family.id, { shouldDirty: true, shouldValidate: true });
            form.setValue("familyName", family.name);
          }}
        />
      </div>
    </Layout>
  );
}
