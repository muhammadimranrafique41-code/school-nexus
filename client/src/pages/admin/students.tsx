import { useState, useMemo } from "react";
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
import { Download, GraduationCap, Loader2, Plus, Search, Trash2, Edit2, ChevronRight, UserCheck, UserX, UserMinus, UploadCloud } from "lucide-react";
import { FamilySelect } from "@/components/family/FamilySelect";
import { CreateFamilyDialog } from "@/components/family/CreateFamilyDialog";
import { BulkImportModal } from "@/components/import/BulkImportModal";
import { useFamilies } from "@/hooks/use-families";
import { formatCurrency } from "@shared/finance";
import type { FamilyGuardianDetails } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Phone, Mail, IdCard, MapPin, Briefcase, Users, Wallet, AlertCircle, Eye, Edit2 as Edit2Icon, MoreHorizontal } from "lucide-react";

type FamilyMember = {
  id: number;
  name: string;
  email: string;
  role: string;
  className?: string | null;
  studentStatus?: string | null;
  studentPhotoUrl?: string | null;
  outstandingBalance: number;
  openInvoices: number;
};

type FamilyRow = {
  id: number;
  name: string;
  guardianDetails: FamilyGuardianDetails | null | undefined;
  walletBalance: number;
  totalOutstanding: number;
  siblingCount: number;
  siblings: FamilyMember[];
};

type ListedStudent = {
  id: number; name: string; email: string; role: string;
  className?: string | null; fatherName?: string | null; studentPhotoUrl?: string | null;
  rollNumber?: string | null; dateOfBirth?: string | null; gender?: string | null;
  admissionDate?: string | null; studentStatus?: string | null; phone?: string | null; address?: string | null;
  familyId?: number | null; familyName?: string | null;
  cnic?: string | null; religion?: string | null; studentDiscount?: number | null;
  createdAt?: string | null;
};

const optionalUrlField = z.union([z.string().trim().url("Enter a valid URL"), z.literal("")]).optional();

const cnicPattern = /^\d{5}-\d{7}-\d{1}$/;

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
  cnic: z.string().regex(cnicPattern, "Invalid CNIC format (XXXXX-XXXXXXX-X)").optional().or(z.literal("")),
  religion: z.string().optional().default("Islam"),
  studentDiscount: z.coerce.number().min(0, "Discount cannot be negative").optional().default(0),
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
  const { data: familiesData } = useFamilies();
  const createUser = useCreateUser();
  const updateUser = useUpdateUserHook();
  const deleteUser = useDeleteUserHook();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<ListedStudent | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<ListedStudent | null>(null);
  const [createFamilyOpen, setCreateFamilyOpen] = useState(false);
  const [createFamilySeed, setCreateFamilySeed] = useState<string>("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [viewingFamily, setViewingFamily] = useState<FamilyRow | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const emptyStudentDefaults: z.infer<typeof studentSchema> = {
    name: "", email: "", password: "", className: "", fatherName: "", studentPhotoUrl: "",
    rollNumber: "", dateOfBirth: "", gender: "male", admissionDate: "",
    studentStatus: "active", phone: "", address: "", familyId: null, familyName: "",
    cnic: "", religion: "Islam", studentDiscount: 0,
  };

  const form = useForm<z.infer<typeof studentSchema>>({
    resolver: zodResolver(studentSchema),
    defaultValues: emptyStudentDefaults,
  });

  const students = useMemo(() => (users ?? []).filter(u => u.role === 'student'), [users]);

  const families = useMemo<FamilyRow[]>(() => (familiesData ?? []) as FamilyRow[], [familiesData]);

  const getFamilyForStudent = (student: ListedStudent): FamilyRow | undefined => {
    if (!student.familyId) return undefined;
    return families.find(f => f.id === student.familyId);
  };

  // Derived unique classes for filter
  const uniqueClasses = useMemo(() => Array.from(new Set(students.map(s => s.className).filter(Boolean))), [students]);

  // Combined Filtering
  const filteredStudents = useMemo(() => students.filter((student) => {
    const matchesClass = classFilter === "all" || student.className === classFilter;
    const matchesStatus = statusFilter === "all" || (student.studentStatus || "active") === statusFilter;
    const query = searchTerm.toLowerCase();
    const hay = `${student.name} ${student.email} ${student.className} ${student.fatherName} ${student.rollNumber} ${student.cnic}`.toLowerCase();
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
      dateOfBirth: data.dateOfBirth || undefined,
      admissionDate: data.admissionDate || undefined,
      cnic: data.cnic || undefined,
      religion: data.religion || undefined,
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
      cnic: student.cnic || "", religion: student.religion || "Islam", studentDiscount: Number(student.studentDiscount) || 0,
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
      Phone: s.phone || "", "Admission Date": s.admissionDate || "", DOB: s.dateOfBirth || "", Gender: s.gender || "",
      CNIC: s.cnic || "", Religion: s.religion || "", "Discount (Rs)": s.studentDiscount ? Number(s.studentDiscount).toFixed(2) : "0",
      "Family": s.familyName || "", "Created At": s.createdAt || ""
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
      <div className="space-y-5 p-4 md:p-6">
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
            <Button size="sm" variant="outline" onClick={() => setImportModalOpen(true)}>
              <UploadCloud className="mr-1.5 h-3.5 w-3.5" />Bulk Import
            </Button>
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
            <Card key={item.label} className={cn("rounded-xl border border-slate-200/80 bg-white shadow-sm", item.border)}>
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
         <Card className="rounded-xl overflow-hidden border border-slate-200/80 bg-white shadow-sm">
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
            <table className="w-full min-w-[1400px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                    Name / ID ↑
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Family Name</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Phone</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Primary Guardian</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Members</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Outstanding</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Wallet</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Email</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">CNIC</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Class</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Section</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">DOB</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Religion</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Admission</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Status</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Discount</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Created At</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={18} className="py-14 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-500" /></td></tr>
                ) : filteredStudents.length === 0 ? (
                  <tr><td colSpan={18} className="py-14 text-center text-[13px] text-slate-400">No students found.</td></tr>
                ) : (
                  paginated.pageItems.map((student, idx) => (
                    <tr key={student.id} className={cn("group border-b border-slate-100 last:border-b-0 transition-colors duration-100 hover:bg-slate-50/60", idx % 2 === 1 && "bg-slate-50/30")}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={student.name} photoUrl={student.studentPhotoUrl} />
                          <div>
                            <span className="block text-[13px] font-semibold text-slate-900">{student.name}</span>
                            <span className="block text-[11px] font-mono text-slate-500">{student.rollNumber || `ID: ${student.id}`}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {student.familyId ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">
                              {(student.familyName || "F").charAt(0).toUpperCase()}
                            </div>
                            <span className="block text-[12px] font-medium text-slate-700">{student.familyName || "—"}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] italic text-slate-400">Not linked</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const family = getFamilyForStudent(student);
                          const guardian = family?.guardianDetails?.primary ?? null;
                          return guardian?.phone ? (
                            <span className="flex items-center gap-1 text-[11px] text-slate-600">
                              <Phone className="h-3 w-3 text-slate-400" />
                              {guardian.phone}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const family = getFamilyForStudent(student);
                          const guardian = family?.guardianDetails?.primary ?? null;
                          return guardian?.name ? (
                            <div>
                              <span className="block text-[12px] font-medium text-slate-700">{guardian.name}</span>
                              <span className="block text-[10px] text-slate-400">{guardian.relation || "Guardian"}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] italic text-slate-400">—</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {(() => {
                          const family = getFamilyForStudent(student);
                          return family ? (
                            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                              {family.siblingCount}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {(() => {
                          const family = getFamilyForStudent(student);
                          return family ? (
                            <span className={cn("text-[12px] font-semibold", family.totalOutstanding > 0 ? "text-rose-600" : "text-slate-500")}>
                              {formatCurrency(family.totalOutstanding)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {(() => {
                          const family = getFamilyForStudent(student);
                          return family ? (
                            <span className="text-[12px] font-semibold text-violet-600">
                              {formatCurrency(family.walletBalance)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const family = getFamilyForStudent(student);
                          const guardian = family?.guardianDetails?.primary ?? null;
                          return guardian?.email ? (
                            <span className="flex items-center gap-1 text-[11px] text-slate-600">
                              <Mail className="h-3 w-3 text-slate-400" />
                              <span className="truncate max-w-[140px]">{guardian.email}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const family = getFamilyForStudent(student);
                          const guardian = family?.guardianDetails?.primary ?? null;
                          return guardian?.cnic ? (
                            <span className="block text-[11px] font-mono text-slate-600">{guardian.cnic}</span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block text-[13px] font-semibold text-slate-700">{student.className || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block text-[13px] text-slate-600">
                          {(() => {
                            const parts = (student.className || "").split(/[-\s]+/);
                            return parts.length > 1 ? parts[parts.length - 1] : "—";
                          })()}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block text-[12px] text-slate-600">{student.dateOfBirth ? (() => { try { const d = new Date(student.dateOfBirth); return isNaN(d.getTime()) ? "—" : d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return "—"; } })() : "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block text-[13px] text-slate-600">{student.religion || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block text-[12px] text-slate-600">{student.admissionDate ? (() => { try { const d = new Date(student.admissionDate); return isNaN(d.getTime()) ? "—" : d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return "—"; } })() : "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={student.studentStatus || "active"} />
                      </td>
                      <td className="px-3 py-2.5">
                        {student.studentDiscount && Number(student.studentDiscount) > 0 ? (
                          <span className="block text-[13px] font-semibold text-emerald-600">Rs {Number(student.studentDiscount).toFixed(2)}</span>
                        ) : (
                          <span className="block text-[12px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="block text-[11px] text-slate-500">
                          {student.createdAt ? (() => { try { const d = new Date(student.createdAt); return isNaN(d.getTime()) ? "—" : d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return "—"; } })() : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-50 transition-opacity group-hover:opacity-100">
                          {student.familyId && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-indigo-600 hover:bg-indigo-50" title="View Family Details">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => {
                                  const family = getFamilyForStudent(student);
                                  if (family) setViewingFamily(family);
                                }}>
                                  <Eye className="mr-2 h-3.5 w-3.5" />View Family Details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/students/${student.id}`}>
                                    <ChevronRight className="mr-2 h-3.5 w-3.5" />View Student Profile
                                  </Link>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {!student.familyId && (
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-indigo-600 hover:bg-indigo-50" title="View Profile">
                              <Link href={`/admin/students/${student.id}`}><ChevronRight className="h-4 w-4" /></Link>
                            </Button>
                          )}
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
                  <div className="grid gap-3 sm:grid-cols-3">
                    <FormField control={form.control} name="cnic" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">CNIC</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="XXXXX-XXXXXXX-X" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                    <FormField control={form.control} name="religion" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Religion</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="Islam">Islam</SelectItem>
                            <SelectItem value="Christianity">Christianity</SelectItem>
                            <SelectItem value="Hinduism">Hinduism</SelectItem>
                            <SelectItem value="Ahmadiyya">Ahmadiyya</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      <FormMessage className="text-[11px]" /></FormItem>
                    )} />
                    <FormField control={form.control} name="studentDiscount" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Discount (Rs)</FormLabel><FormControl><Input type="number" min="0" className="h-8 text-sm" placeholder="0" {...field} value={field.value ?? 0} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                  </div>
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
                          <FamilySelect
                            value={field.value ?? null}
                            onChange={(id, family) => {
                              field.onChange(id);
                              form.setValue("familyName", id !== null && family ? family.name : "");
                            }}
                            onCreateNew={(searchTerm) => {
                              setCreateFamilySeed(searchTerm);
                              setCreateFamilyOpen(true);
                            }}
                          />
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

        {/* ── Family Details Sheet ─────────────────────────────────────── */}
        <Sheet open={!!viewingFamily} onOpenChange={(open) => !open && setViewingFamily(null)}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
            {viewingFamily && (() => {
              const guardian = viewingFamily.guardianDetails?.primary ?? null;
              const notes = viewingFamily.guardianDetails?.notes ?? null;
              return (
                <>
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2 text-base font-semibold">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
                        {viewingFamily.name.split(" ").map((p) => p[0]).filter(Boolean).join("").slice(0, 2).toUpperCase()}
                      </div>
                      {viewingFamily.name}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-slate-500">
                      Family ID #{viewingFamily.id} · {viewingFamily.siblingCount} linked member{viewingFamily.siblingCount === 1 ? "" : "s"}
                    </SheetDescription>
                  </SheetHeader>

                  <div className="mt-5 space-y-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-rose-100 bg-rose-50/40 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />Outstanding
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-rose-700">{formatCurrency(viewingFamily.totalOutstanding)}</p>
                      </div>
                      <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-500 flex items-center gap-1">
                          <Wallet className="h-3 w-3" />Wallet
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-violet-700">{formatCurrency(viewingFamily.walletBalance)}</p>
                      </div>
                    </div>

                    <section className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 flex items-center gap-1">
                        <Users className="h-3 w-3" />Primary Guardian
                      </p>
                      {guardian && Object.values(guardian).some(Boolean) ? (
                        <div className="mt-2 space-y-1.5">
                          {guardian.name && (
                            <p className="text-sm font-semibold text-slate-900">
                              {guardian.name}
                              {guardian.relation && <span className="ml-2 text-xs font-normal text-slate-500">({guardian.relation})</span>}
                            </p>
                          )}
                          <div className="grid grid-cols-1 gap-1.5 text-[12px] text-slate-600">
                            {guardian.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-slate-400" />{guardian.phone}</p>}
                            {guardian.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-slate-400" />{guardian.email}</p>}
                            {guardian.cnic && <p className="flex items-center gap-1.5"><IdCard className="h-3 w-3 text-slate-400" />{guardian.cnic}</p>}
                            {guardian.occupation && <p className="flex items-center gap-1.5"><Briefcase className="h-3 w-3 text-slate-400" />{guardian.occupation}</p>}
                            {guardian.address && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-slate-400" />{guardian.address}</p>}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs italic text-slate-400">No guardian information on file.</p>
                      )}
                      {notes && (
                        <p className="mt-3 border-t border-slate-200 pt-2 text-[12px] text-slate-600"><span className="font-semibold text-slate-700">Notes: </span>{notes}</p>
                      )}
                    </section>

                    <section>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 flex items-center gap-1">
                          <Users className="h-3 w-3" />Linked Members
                        </p>
                        <span className="text-[11px] text-slate-400">{viewingFamily.siblings.length} total</span>
                      </div>
                      {viewingFamily.siblings.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-6 text-center text-xs italic text-slate-400">
                          No members linked to this family yet.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {viewingFamily.siblings.map((member) => {
                            const profileHref = member.role === "student"
                              ? `/admin/students/${member.id}`
                              : `/admin/users/${member.id}`;
                            return (
                              <li key={member.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-900">{member.name}</span>
                                    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", member.role === "student" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-600")}>
                                      {member.role}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                    {member.email}
                                    {member.className ? ` · ${member.className}` : ""}
                                  </p>
                                </div>
                                <div className="ml-3 flex shrink-0 items-center gap-2">
                                  {member.role === "student" && (
                                    <span className={cn("text-[12px] font-semibold", member.outstandingBalance > 0 ? "text-rose-600" : "text-slate-500")}>
                                      {formatCurrency(member.outstandingBalance)}
                                    </span>
                                  )}
                                  <Button asChild variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-indigo-600 hover:bg-indigo-50">
                                    <Link href={profileHref}><ChevronRight className="h-4 w-4" /></Link>
                                  </Button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  </div>
                </>
              );
            })()}
          </SheetContent>
        </Sheet>

        {/* ── Bulk Import Modal ────────────────────────────────────────── */}
        <BulkImportModal
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
          defaultTab="students"
        />
      </div>
    </Layout>
  );
}
