import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useUsers, useCreateUser, useDeleteUser, useUpdateUser } from "@/hooks/use-users";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Card, CardContent } from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Download, GraduationCap, Loader2, Pencil, Plus, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import { downloadCsv, getErrorMessage, paginateItems } from "@/lib/utils";
import { cn } from "@/lib/utils";

type UsersManagementProps = { roleFilter?: "admin" | "teacher" | "student" };
type ListedUser = {
  id: number; name: string; email: string; role: string;
  subject?: string | null; designation?: string | null; department?: string | null;
  employeeId?: string | null; teacherPhotoUrl?: string | null; className?: string | null;
  fatherName?: string | null; studentPhotoUrl?: string | null;
  rollNumber?: string | null; dateOfBirth?: string | null; gender?: string | null;
  admissionDate?: string | null; studentStatus?: string | null; phone?: string | null; address?: string | null;
};

const optionalUrlField = z.union([z.string().trim().url("Enter a valid photo URL"), z.literal("")]).optional();
const userSchema = z.object({
  name: z.string().min(1, "Name is required"), email: z.string().email("Invalid email"),
  password: z.string().optional(), role: z.enum(["admin", "teacher", "student"]),
  subject: z.string().optional(), designation: z.string().optional(), department: z.string().optional(),
  employeeId: z.string().optional(), teacherPhotoUrl: optionalUrlField,
  className: z.string().optional(), fatherName: z.string().optional(), studentPhotoUrl: optionalUrlField,
  rollNumber: z.string().optional(), dateOfBirth: z.string().optional(), gender: z.string().optional(),
  admissionDate: z.string().optional(), studentStatus: z.string().optional().default("active"),
  phone: z.string().optional(), address: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.password && data.password.length < 6) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Password must be at least 6 characters" });
  if (data.role === "teacher" && !data.subject?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subject"], message: "Subject is required for teachers" });
  if (data.role === "student" && !data.className?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["className"], message: "Class is required for students" });
});

const PAGE_SIZE = 10;

// ── Role badge ────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    admin: "border-violet-200 bg-violet-50 text-violet-700",
    teacher: "border-emerald-200 bg-emerald-50 text-emerald-700",
    student: "border-sky-200 bg-sky-50 text-sky-700",
  };
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", map[role] ?? "border-slate-200 bg-slate-50 text-slate-500")}>
      {role}
    </span>
  );
}

// ── Avatar initials ───────────────────────────────────────────────────────
function Avatar({ name, photoUrl, role }: { name: string; photoUrl?: string | null; role: string }) {
  const colors: Record<string, string> = {
    admin: "bg-violet-100 text-violet-700",
    teacher: "bg-emerald-100 text-emerald-700",
    student: "bg-sky-100 text-sky-700",
  };
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", colors[role] ?? "bg-slate-100 text-slate-600")}>
      {photoUrl ? <img src={photoUrl} alt={name} className="h-full w-full rounded-full object-cover" /> : initials}
    </div>
  );
}

export default function UsersManagement({ roleFilter }: UsersManagementProps) {
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeRole, setActiveRole] = useState<"all" | "admin" | "teacher" | "student">(roleFilter ?? "all");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingUser, setEditingUser] = useState<ListedUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<ListedUser | null>(null);

  const defaultRole = roleFilter ?? "student";
  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: "", email: "", password: "", role: defaultRole, subject: "", designation: "", department: "", employeeId: "", teacherPhotoUrl: "", className: "", fatherName: "", studentPhotoUrl: "", rollNumber: "", dateOfBirth: "", gender: "male", admissionDate: "", studentStatus: "active", phone: "", address: "" },
  });
  const watchRole = form.watch("role");
  const mutationPending = createUser.isPending || updateUser.isPending;

  useEffect(() => setActiveRole(roleFilter ?? "all"), [roleFilter]);
  useEffect(() => setCurrentPage(1), [activeRole, searchTerm]);

  const filteredUsers = useMemo(() => (users ?? []).filter((user) => {
    const matchesRole = activeRole === "all" || user.role === activeRole;
    const query = searchTerm.toLowerCase();
    const hay = `${user.name} ${user.email} ${user.className ?? ""} ${user.subject ?? ""} ${user.fatherName ?? ""} ${user.designation ?? ""} ${user.department ?? ""} ${user.employeeId ?? ""}`.toLowerCase();
    return matchesRole && hay.includes(query);
  }), [activeRole, searchTerm, users]);

  const paginated = paginateItems(filteredUsers, currentPage, PAGE_SIZE);

  const openCreateDialog = () => {
    setEditingUser(null);
    form.reset({ name: "", email: "", password: "", role: defaultRole, subject: "", designation: "", department: "", employeeId: "", teacherPhotoUrl: "", className: "", fatherName: "", studentPhotoUrl: "", rollNumber: "", dateOfBirth: "", gender: "male", admissionDate: "", studentStatus: "active", phone: "", address: "" });
    setIsOpen(true);
  };

  const openEditDialog = (user: ListedUser) => {
    setEditingUser(user);
    form.reset({ name: user.name, email: user.email, password: "", role: roleFilter ?? (user.role === "admin" || user.role === "teacher" ? user.role : "student"), subject: user.subject ?? "", designation: user.designation ?? "", department: user.department ?? "", employeeId: user.employeeId ?? "", teacherPhotoUrl: user.teacherPhotoUrl ?? "", className: user.className ?? "", fatherName: user.fatherName ?? "", studentPhotoUrl: user.studentPhotoUrl ?? "", rollNumber: user.rollNumber ?? "", dateOfBirth: user.dateOfBirth ?? "", gender: user.gender ?? "male", admissionDate: user.admissionDate ?? "", studentStatus: user.studentStatus ?? "active", phone: user.phone ?? "", address: user.address ?? "" });
    setIsOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof userSchema>) => {
    const role = roleFilter ?? values.role;
    const payload = {
      ...values, role,
      password: values.password?.trim() || undefined,
      subject: role === "teacher" ? values.subject?.trim() || undefined : undefined,
      designation: role === "teacher" ? values.designation?.trim() || undefined : undefined,
      department: role === "teacher" ? values.department?.trim() || undefined : undefined,
      employeeId: role === "teacher" ? values.employeeId?.trim() || undefined : undefined,
      teacherPhotoUrl: role === "teacher" ? values.teacherPhotoUrl?.trim() || undefined : undefined,
      className: role === "student" ? values.className?.trim() || undefined : undefined,
      fatherName: role === "student" ? values.fatherName?.trim() || undefined : undefined,
      studentPhotoUrl: role === "student" ? values.studentPhotoUrl?.trim() || undefined : undefined,
      rollNumber: role === "student" ? values.rollNumber?.trim() || undefined : undefined,
      dateOfBirth: role === "student" ? values.dateOfBirth?.trim() || undefined : undefined,
      gender: role === "student" ? values.gender || undefined : undefined,
      admissionDate: role === "student" ? values.admissionDate?.trim() || undefined : undefined,
      studentStatus: role === "student" ? values.studentStatus || undefined : undefined,
      phone: role === "student" ? values.phone?.trim() || undefined : undefined,
      address: role === "student" ? values.address?.trim() || undefined : undefined,
    };
    if (!editingUser && !payload.password) return form.setError("password", { message: "Temporary password is required" });
    try {
      if (editingUser) await updateUser.mutateAsync({ id: editingUser.id, ...payload });
      else await createUser.mutateAsync({ ...payload, password: payload.password! });
      toast({ title: editingUser ? "User updated" : "User created", description: `${payload.name} has been saved successfully.` });
      setIsOpen(false); setEditingUser(null);
      form.reset({ name: "", email: "", password: "", role: defaultRole, subject: "", designation: "", department: "", employeeId: "", teacherPhotoUrl: "", className: "", fatherName: "", studentPhotoUrl: "", rollNumber: "", dateOfBirth: "", gender: "male", admissionDate: "", studentStatus: "active", phone: "", address: "" });
    } catch (error) { toast({ title: "Unable to save user", description: getErrorMessage(error), variant: "destructive" }); }
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteUser.mutateAsync(userToDelete.id);
      toast({ title: "User deleted", description: `${userToDelete.name} has been removed.` });
      setUserToDelete(null);
    } catch (error) { toast({ title: "Unable to delete user", description: getErrorMessage(error), variant: "destructive" }); }
  };

  const summary = {
    total: users?.length ?? 0,
    students: users?.filter((u) => u.role === "student").length ?? 0,
    teachers: users?.filter((u) => u.role === "teacher").length ?? 0,
    admins: users?.filter((u) => u.role === "admin").length ?? 0,
  };

  const exportUsers = () => downloadCsv(`${roleFilter ?? "users"}-export.csv`, filteredUsers.map((user) => ({ Name: user.name, Email: user.email, Role: user.role, Subject: user.subject ?? "", Designation: user.designation ?? "", Department: user.department ?? "", "Employee ID": user.employeeId ?? "", Class: user.className ?? "", "Father Name": user.fatherName ?? "", "Teacher Photo URL": user.teacherPhotoUrl ?? "", "Student Photo URL": user.studentPhotoUrl ?? "" })));

  return (
    <Layout>
      <div className="space-y-5 pb-8">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: title + accent bar */}
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {roleFilter ? `${roleFilter[0].toUpperCase()}${roleFilter.slice(1)} Directory` : "User Management"}
              </h1>
              <p className="mt-0.5 text-[12px] text-slate-400">
                {roleFilter
                  ? `Manage all ${roleFilter}s — search, filter, and edit with role-aware forms.`
                  : "Unified directory for admins, teachers, and students."}
              </p>
            </div>
          </div>
          {/* Right: actions */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportUsers} disabled={filteredUsers.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" />Export CSV
            </Button>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Add User
            </Button>
          </div>
        </section>

        {/* ── KPI strip ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Total users", value: summary.total, icon: Users, color: "text-indigo-600 bg-indigo-50", border: "border-indigo-100" },
            { label: "Students", value: summary.students, icon: GraduationCap, color: "text-sky-600 bg-sky-50", border: "border-sky-100" },
            { label: "Teachers", value: summary.teachers, icon: Users, color: "text-emerald-600 bg-emerald-50", border: "border-emerald-100" },
            { label: "Admins", value: summary.admins, icon: ShieldCheck, color: "text-violet-600 bg-violet-50", border: "border-violet-100" },
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

          {/* Toolbar */}
          <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search name, email, class, subject…"
                className="h-8 pl-8 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {!roleFilter && (
              <Select value={activeRole} onValueChange={(v: "all" | "admin" | "teacher" | "student") => setActiveRole(v)}>
                <SelectTrigger className="h-8 w-full text-sm sm:w-[160px]">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                  <SelectItem value="teacher">Teachers</SelectItem>
                  <SelectItem value="student">Students</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Table */}
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">User</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Email</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Role</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Details</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-14 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-500" />
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-14 text-center text-[13px] text-slate-400">
                      No users found matching your search.
                    </td>
                  </tr>
                ) : (
                  paginated.pageItems.map((user, idx) => {
                    const details = user.role === "teacher"
                      ? [user.subject, user.designation, user.department, user.employeeId].filter(Boolean).join(" · ") || "—"
                      : [user.className, user.fatherName].filter(Boolean).join(" · ") || "—";
                    return (
                      <tr
                        key={user.id}
                        className={cn(
                          "group border-b border-slate-100 last:border-b-0 transition-colors duration-100 hover:bg-indigo-50/40",
                          idx % 2 === 1 && "bg-slate-50/30",
                        )}
                      >
                        {/* User — avatar + name */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar
                              name={user.name}
                              photoUrl={user.role === "teacher" ? user.teacherPhotoUrl : user.studentPhotoUrl}
                              role={user.role}
                            />
                            <span className="text-[13px] font-semibold text-slate-900">{user.name}</span>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-3 py-2.5">
                          <span className="text-[12px] text-slate-500">{user.email}</span>
                        </td>

                        {/* Role badge */}
                        <td className="px-3 py-2.5">
                          <RoleBadge role={user.role} />
                        </td>

                        {/* Details */}
                        <td className="px-3 py-2.5">
                          <span className="max-w-[200px] truncate text-[12px] text-slate-400">{details}</span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-50 transition-opacity group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                              title="Edit user"
                              onClick={() => openEditDialog(user)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Delete user"
                              onClick={() => setUserToDelete(user)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredUsers.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <p className="text-[11px] text-slate-400">
                {(paginated.currentPage - 1) * PAGE_SIZE + 1}–{Math.min(paginated.currentPage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length} users
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      className={cn("h-7 text-xs", paginated.currentPage === 1 && "pointer-events-none opacity-40")}
                      onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.max(1, p - 1)); }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-3 text-[11px] text-slate-400">Page {paginated.currentPage} / {paginated.totalPages}</span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      className={cn("h-7 text-xs", paginated.currentPage === paginated.totalPages && "pointer-events-none opacity-40")}
                      onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.min(paginated.totalPages, p + 1)); }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </Card>

        {/* ── Create / Edit Dialog ─────────────────────────────────────── */}
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                {editingUser ? "Edit user" : "Add new user"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 pt-2">

                {/* Core fields */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-700">Full name</FormLabel>
                      <FormControl><Input className="h-8 text-sm" placeholder="John Doe" {...field} /></FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-700">Email</FormLabel>
                      <FormControl><Input type="email" className="h-8 text-sm" placeholder="john@school.edu" {...field} /></FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-700">{editingUser ? "New password (optional)" : "Temporary password"}</FormLabel>
                      <FormControl><Input type="password" className="h-8 text-sm" placeholder="••••••••" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-700">Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!!roleFilter}>
                        <FormControl><SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="teacher">Teacher</SelectItem>
                          <SelectItem value="student">Student</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                </div>

                {/* Teacher-specific fields */}
                {watchRole === "teacher" && (
                  <div className="space-y-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600">Teacher details</p>
                    <FormField control={form.control} name="subject" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-slate-700">Subject *</FormLabel>
                        <FormControl><Input className="h-8 text-sm" placeholder="Mathematics" {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField control={form.control} name="designation" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs font-medium text-slate-700">Designation</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Senior Teacher" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                      )} />
                      <FormField control={form.control} name="department" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs font-medium text-slate-700">Department</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Science Dept." {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                      )} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField control={form.control} name="employeeId" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs font-medium text-slate-700">Employee ID</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="SNX-T-001" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                      )} />
                      <FormField control={form.control} name="teacherPhotoUrl" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs font-medium text-slate-700">Photo URL</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="https://…" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                      )} />
                    </div>
                  </div>
                )}

                {/* Student-specific fields */}
                {watchRole === "student" && (
                  <div className="space-y-3 rounded-lg border border-sky-100 bg-sky-50/40 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600">Student details</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField control={form.control} name="rollNumber" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs font-medium text-slate-700">Roll Number</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="SCH-2025-001" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                      )} />
                      <FormField control={form.control} name="className" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs font-medium text-slate-700">Class *</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Grade 10-A" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                      )} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                       <FormField control={form.control} name="fatherName" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs font-medium text-slate-700">Father's Name</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Guardian Name" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                      )} />
                      <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs font-medium text-slate-700">Date of Birth</FormLabel><FormControl><Input type="date" className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                      )} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
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
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField control={form.control} name="admissionDate" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs font-medium text-slate-700">Admission Date</FormLabel><FormControl><Input type="date" className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                      )} />
                       <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs font-medium text-slate-700">Contact Number</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="+1234..." {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="studentPhotoUrl" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Photo URL</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="https://…" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-medium text-slate-700">Address / Location</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Current address..." {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                    )} />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={mutationPending}>
                    {mutationPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editingUser ? "Save changes" : "Create user"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* ── Delete confirm ───────────────────────────────────────────── */}
        <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete user?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                This will permanently remove <strong>{userToDelete?.name}</strong> and their linked role profile.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-8 text-sm">Cancel</AlertDialogCancel>
              <AlertDialogAction className="h-8 bg-rose-600 text-sm hover:bg-rose-700" onClick={handleDelete}>
                {deleteUser.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
