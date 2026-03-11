import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useUsers, useCreateUser, useDeleteUser, useUpdateUser } from "@/hooks/use-users";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { Download, Loader2, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { downloadCsv, getErrorMessage, paginateItems } from "@/lib/utils";

type UsersManagementProps = { roleFilter?: "admin" | "teacher" | "student" };
type ListedUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  subject?: string | null;
  className?: string | null;
  fatherName?: string | null;
  studentPhotoUrl?: string | null;
};

const optionalUrlField = z.union([z.string().trim().url("Enter a valid photo URL"), z.literal("")]).optional();

const userSchema = z.object({
  name: z.string().min(1, "Name is required"), email: z.string().email("Invalid email"), password: z.string().optional(), role: z.enum(["admin", "teacher", "student"]), subject: z.string().optional(), className: z.string().optional(), fatherName: z.string().optional(), studentPhotoUrl: optionalUrlField,
}).superRefine((data, ctx) => {
  if (data.password && data.password.length < 6) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Password must be at least 6 characters" });
  if (data.role === "teacher" && !data.subject?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subject"], message: "Subject is required for teachers" });
  if (data.role === "student" && !data.className?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["className"], message: "Class is required for students" });
});

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
  const form = useForm<z.infer<typeof userSchema>>({ resolver: zodResolver(userSchema), defaultValues: { name: "", email: "", password: "", role: defaultRole, subject: "", className: "", fatherName: "", studentPhotoUrl: "" } });
  const watchRole = form.watch("role");
  const mutationPending = createUser.isPending || updateUser.isPending;

  useEffect(() => setActiveRole(roleFilter ?? "all"), [roleFilter]);
  useEffect(() => setCurrentPage(1), [activeRole, searchTerm]);
  const filteredUsers = useMemo(() => (users ?? []).filter((user) => {
    const matchesRole = activeRole === "all" ? true : user.role === activeRole;
    const query = searchTerm.toLowerCase();
    const haystack = `${user.name} ${user.email} ${user.className ?? ""} ${user.subject ?? ""} ${user.fatherName ?? ""}`.toLowerCase();
    return matchesRole && haystack.includes(query);
  }), [activeRole, searchTerm, users]);
  const paginated = paginateItems(filteredUsers, currentPage, 8);

  const openCreateDialog = () => { setEditingUser(null); form.reset({ name: "", email: "", password: "", role: defaultRole, subject: "", className: "", fatherName: "", studentPhotoUrl: "" }); setIsOpen(true); };
  const openEditDialog = (user: ListedUser) => { setEditingUser(user); form.reset({ name: user.name, email: user.email, password: "", role: roleFilter ?? (user.role === "admin" || user.role === "teacher" ? user.role : "student"), subject: user.subject ?? "", className: user.className ?? "", fatherName: user.fatherName ?? "", studentPhotoUrl: user.studentPhotoUrl ?? "" }); setIsOpen(true); };
  const onSubmit = async (values: z.infer<typeof userSchema>) => {
    const role = roleFilter ?? values.role;
    const payload = {
      ...values,
      role,
      password: values.password?.trim() || undefined,
      subject: role === "teacher" ? values.subject?.trim() || undefined : undefined,
      className: role === "student" ? values.className?.trim() || undefined : undefined,
      fatherName: role === "student" ? values.fatherName?.trim() || undefined : undefined,
      studentPhotoUrl: role === "student" ? values.studentPhotoUrl?.trim() || undefined : undefined,
    };
    if (!editingUser && !payload.password) return form.setError("password", { message: "Temporary password is required" });
    try {
      if (editingUser) await updateUser.mutateAsync({ id: editingUser.id, ...payload }); else await createUser.mutateAsync({ ...payload, password: payload.password! });
      toast({ title: editingUser ? "User updated" : "User created", description: `${payload.name} has been saved successfully.` });
      setIsOpen(false); setEditingUser(null); form.reset({ name: "", email: "", password: "", role: defaultRole, subject: "", className: "", fatherName: "", studentPhotoUrl: "" });
    } catch (error) { toast({ title: "Unable to save user", description: getErrorMessage(error), variant: "destructive" }); }
  };
  const handleDelete = async () => {
    if (!userToDelete) return;
    try { await deleteUser.mutateAsync(userToDelete.id); toast({ title: "User deleted", description: `${userToDelete.name} has been removed.` }); setUserToDelete(null); }
    catch (error) { toast({ title: "Unable to delete user", description: getErrorMessage(error), variant: "destructive" }); }
  };
  const summary = { total: users?.length ?? 0, students: users?.filter((u) => u.role === "student").length ?? 0, teachers: users?.filter((u) => u.role === "teacher").length ?? 0, admins: users?.filter((u) => u.role === "admin").length ?? 0 };
  const exportUsers = () => downloadCsv(`${roleFilter ?? "users"}-export.csv`, filteredUsers.map((user) => ({ Name: user.name, Email: user.email, Role: user.role, Subject: user.subject ?? "", Class: user.className ?? "", "Father Name": user.fatherName ?? "", "Photo URL": user.studentPhotoUrl ?? "" })));

  return (
    <Layout>
      <div className="space-y-8 pb-8">
        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="relative overflow-hidden rounded-[1.9rem] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-8 text-white shadow-[0_28px_80px_-32px_rgba(15,23,42,0.75)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(129,140,248,0.22),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(236,72,153,0.18),_transparent_26%)]" />
            <div className="relative space-y-5">
              <Badge variant="outline" className="border-white/15 bg-white/10 text-white">Directory workspace</Badge>
              <div className="space-y-3">
                <h1 className="text-4xl font-display font-bold tracking-tight md:text-5xl">
                  {roleFilter ? `${roleFilter[0].toUpperCase()}${roleFilter.slice(1)} Directory` : "User Management"}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                  {roleFilter ? `Manage all ${roleFilter}s in the system with premium search, filters, and role-aware editing.` : "Manage admins, teachers, and students from one unified directory experience."}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" className="border-none bg-white text-slate-900 hover:bg-slate-100" onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" /> Add User
                </Button>
                <Button variant="outline" className="border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15 hover:text-white" onClick={exportUsers} disabled={filteredUsers.length === 0}>
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
            </div>
          </div>

          <Card className="bg-white/75">
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              {[
                { label: "All users", value: summary.total, accent: "from-violet-500/15 to-fuchsia-500/15", iconClass: "text-violet-600" },
                { label: "Students", value: summary.students, accent: "from-sky-500/15 to-indigo-500/15", iconClass: "text-sky-600" },
                { label: "Teachers", value: summary.teachers, accent: "from-emerald-500/15 to-teal-500/15", iconClass: "text-emerald-600" },
                { label: "Admins", value: summary.admins, accent: "from-amber-500/15 to-orange-500/15", iconClass: "text-amber-600" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className="mt-3 text-3xl font-display font-bold text-slate-900">{item.value}</p>
                  </div>
                  <div className={`rounded-2xl bg-gradient-to-br ${item.accent} p-3 ${item.iconClass}`}>
                    <Users className="h-5 w-5" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>{editingUser ? "Edit User" : "Create New User"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="email" render={({ field }) => <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="john@school.edu" {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="password" render={({ field }) => <FormItem><FormLabel>{editingUser ? "New Password (optional)" : "Temporary Password"}</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="role" render={({ field }) => <FormItem><FormLabel>Role</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!!roleFilter}><FormControl><SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger></FormControl><SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="teacher">Teacher</SelectItem><SelectItem value="student">Student</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
                {watchRole === "teacher" && <FormField control={form.control} name="subject" render={({ field }) => <FormItem><FormLabel>Subject</FormLabel><FormControl><Input placeholder="Mathematics" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>} />}
                {watchRole === "student" && (
                  <>
                    <FormField control={form.control} name="className" render={({ field }) => <FormItem><FormLabel>Class</FormLabel><FormControl><Input placeholder="Grade 10-A" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="fatherName" render={({ field }) => <FormItem><FormLabel>Father&apos;s Name</FormLabel><FormControl><Input placeholder="Muhammad Aslam" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="studentPhotoUrl" render={({ field }) => <FormItem><FormLabel>Student Photo URL</FormLabel><FormControl><Input placeholder="https://example.com/student-photo.jpg" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>} />
                  </>
                )}
                <Button type="submit" className="mt-4 w-full" disabled={mutationPending}>
                  {mutationPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingUser ? "Save Changes" : "Create User"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Card className="overflow-hidden bg-white/80">
          <CardContent className="p-0">
            <div className="flex flex-col gap-4 border-b border-slate-200/70 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 items-center gap-3 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3">
                <Search className="h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search users, classes, subjects, or father names..."
                  className="h-auto max-w-sm border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {!roleFilter && (
                <Select value={activeRole} onValueChange={(value: "all" | "admin" | "teacher" | "student") => setActiveRole(value)}>
                  <SelectTrigger className="w-full lg:w-[200px]">
                    <SelectValue placeholder="Filter by role" />
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

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-violet-600" />
                      </TableCell>
                    </TableRow>
                  ) : filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-slate-500">No users found.</TableCell>
                    </TableRow>
                  ) : (
                    paginated.pageItems.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-semibold text-slate-900">{user.name}</TableCell>
                        <TableCell className="text-slate-500">{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === "admin" ? "default" : user.role === "teacher" ? "secondary" : "outline"} className="capitalize">
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-500">{user.role === "teacher" ? user.subject : [user.className, user.fatherName].filter(Boolean).join(" • ") || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(user)}>
                              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                            </Button>
                            <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => setUserToDelete(user)}>
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {filteredUsers.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-200/70 p-4 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-slate-500">
                  Showing {(paginated.currentPage - 1) * 8 + 1}-{Math.min(paginated.currentPage * 8, filteredUsers.length)} of {filteredUsers.length} users
                </p>
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious href="#" className={paginated.currentPage === 1 ? "pointer-events-none opacity-50" : ""} onClick={(e) => { e.preventDefault(); setCurrentPage((page) => Math.max(1, page - 1)); }} />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-4 text-sm text-slate-500">Page {paginated.currentPage} of {paginated.totalPages}</span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext href="#" className={paginated.currentPage === paginated.totalPages ? "pointer-events-none opacity-50" : ""} onClick={(e) => { e.preventDefault(); setCurrentPage((page) => Math.min(paginated.totalPages, page + 1)); }} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete user?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently remove {userToDelete?.name} and their linked role profile.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>
                {deleteUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}