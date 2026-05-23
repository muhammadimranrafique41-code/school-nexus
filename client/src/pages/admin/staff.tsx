import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useStaffList,
  useCreateStaff,
  useUpdateStaff,
  useCreateSalaryStructure,
  useProcessSalary,
  useCreateStaffLoan,
  useListStaffLoans,
  useMarkStaffAttendance,
} from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Edit2, Trash2, Wallet, Calendar, FileText, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const staffFormSchema = z.object({
  employeeId: z.string().min(1, "Employee ID is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  staffType: z.enum(["teaching", "non-teaching"]),
  designation: z.string().optional(),
  department: z.string().optional(),
  joiningDate: z.string().min(1, "Joining date is required"),
  status: z.string().default("active"),
});

export default function StaffManagement() {
  const { data: staffList, isLoading } = useStaffList();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const createSalaryStructure = useCreateSalaryStructure();
  const processSalary = useProcessSalary();
  const createLoan = useCreateStaffLoan();
  const markAttendance = useMarkStaffAttendance();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);

  const form = useForm<z.infer<typeof staffFormSchema>>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      employeeId: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      staffType: "teaching" as const,
      designation: "",
      department: "",
      joiningDate: new Date().toISOString().split("T")[0],
      status: "active",
    },
  });

  const onSubmit = (data: z.infer<typeof staffFormSchema>) => {
    const payload = {
      ...data,
      email: data.email || undefined,
      phone: data.phone || undefined,
      gender: data.gender || undefined,
      designation: data.designation || undefined,
      department: data.department || undefined,
    };

    if (editingId) {
      updateStaff.mutate({ id: editingId, ...payload }, {
        onSuccess: () => { setIsOpen(false); setEditingId(null); form.reset(); },
      });
    } else {
      createStaff.mutate(payload as any, {
        onSuccess: () => { setIsOpen(false); form.reset(); },
      });
    }
  };

  const handleEdit = (id: number) => {
    const staff = staffList?.find(s => s.id === id);
    if (staff) {
      form.reset({
        employeeId: staff.employeeId,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email || "",
        phone: staff.phone || "",
        gender: staff.gender as any || undefined,
        staffType: staff.staffType as any,
        designation: staff.designation || "",
        department: staff.department || "",
        joiningDate: staff.joiningDate,
        status: staff.status,
      });
      setEditingId(id);
      setIsOpen(true);
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Staff Management</h1>
              <p className="text-[12px] text-slate-400">Manage all staff members, payroll, and attendance.</p>
            </div>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => {
                setEditingId(null);
                form.reset({
                  employeeId: "",
                  firstName: "",
                  lastName: "",
                  email: "",
                  phone: "",
                  staffType: "teaching",
                  designation: "",
                  department: "",
                  joiningDate: new Date().toISOString().split("T")[0],
                  status: "active",
                });
              }}>
                <Plus className="mr-2 h-4 w-4" /> Add Staff
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Staff" : "Add New Staff"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="firstName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="lastName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="employeeId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employee ID</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="staffType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Staff Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="teaching">Teaching</SelectItem>
                            <SelectItem value="non-teaching">Non-Teaching</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input type="email" {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField control={form.control} name="designation" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Designation</FormLabel>
                        <FormControl><Input placeholder="Teacher / Clerk" {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="department" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <FormControl><Input placeholder="Science / Admin" {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="joiningDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Joining Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <Button type="submit" className="w-full" disabled={createStaff.isPending || updateStaff.isPending}>
                    {(createStaff.isPending || updateStaff.isPending) ? <Loader2 className="animate-spin h-4 w-4" /> : "Save"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </section>

        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : !staffList || staffList.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No staff records found.</TableCell></TableRow>
              ) : (
                staffList.map((staff) => (
                  <TableRow key={staff.id}>
                    <TableCell className="font-mono">{staff.employeeId}</TableCell>
                    <TableCell className="font-medium">{staff.firstName} {staff.lastName}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${staff.staffType === 'teaching' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                        {staff.staffType}
                      </span>
                    </TableCell>
                    <TableCell>{staff.designation || "—"}</TableCell>
                    <TableCell>{staff.department || "—"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${staff.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {staff.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(staff.id)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
