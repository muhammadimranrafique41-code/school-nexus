import { useState } from "react";
import { Layout } from "@/components/layout";
import {
    useUsers,
    useCreateUser,
    useUpdateUser as useUpdateUserHook,
    useDeleteUser as useDeleteUserHook,
} from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Edit2, Trash2 } from "lucide-react";

const teacherSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email(),
    password: z.string().optional(),
    subject: z.string().min(1, "Subject is required"),
    designation: z.string().optional(),
    department: z.string().optional(),
    employeeId: z.string().optional(),
    teacherPhotoUrl: z.union([z.string().trim().url("Enter a valid photo URL"), z.literal("")]).optional(),
});

export default function TeacherManagement() {
    const { data: users, isLoading } = useUsers();
    const createUser = useCreateUser();
    const updateUser = useUpdateUserHook();
    const deleteUser = useDeleteUserHook();
    const [isOpen, setIsOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const form = useForm<z.infer<typeof teacherSchema>>({
        resolver: zodResolver(teacherSchema),
        defaultValues: { name: "", email: "", password: "", subject: "", designation: "", department: "", employeeId: "", teacherPhotoUrl: "" }
    });

    const teachers = users?.filter(u => u.role === 'teacher') || [];

    const onSubmit = (data: z.infer<typeof teacherSchema>) => {
        if (!editingId && !data.password?.trim()) {
            form.setError("password", { message: "Password is required" });
            return;
        }

        const payload = {
            ...data,
            role: "teacher" as const,
            password: data.password?.trim() || undefined,
            subject: data.subject.trim(),
            designation: data.designation?.trim() || undefined,
            department: data.department?.trim() || undefined,
            employeeId: data.employeeId?.trim() || undefined,
            teacherPhotoUrl: data.teacherPhotoUrl?.trim() || undefined,
        };

        if (editingId) {
            updateUser.mutate({ id: editingId, ...payload }, {
                onSuccess: () => { setIsOpen(false); setEditingId(null); form.reset(); }
            });
        } else {
            createUser.mutate({ ...payload, password: payload.password! }, {
                onSuccess: () => { setIsOpen(false); form.reset(); }
            });
        }
    };

    const handleEdit = (id: number) => {
        const teacher = teachers.find(t => t.id === id);
        if (teacher) {
            form.reset({ name: teacher.name, email: teacher.email, password: "", subject: teacher.subject || "", designation: teacher.designation || "", department: teacher.department || "", employeeId: teacher.employeeId || "", teacherPhotoUrl: teacher.teacherPhotoUrl || "" });
            setEditingId(id);
            setIsOpen(true);
        }
    };

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold">Teachers Management</h1>
                        <p className="text-muted-foreground mt-1">Manage all teachers in the system.</p>
                    </div>
                    <Dialog open={isOpen} onOpenChange={setIsOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={() => { setEditingId(null); form.reset({ name: "", email: "", password: "", subject: "", designation: "", department: "", employeeId: "", teacherPhotoUrl: "" }); }}>
                                <Plus className="mr-2 h-4 w-4" /> Add Teacher
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingId ? "Edit Teacher" : "Add New Teacher"}</DialogTitle>
                            </DialogHeader>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                                    <FormField control={form.control} name="name" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Name</FormLabel>
                                            <FormControl><Input {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="email" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl><Input type="email" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="password" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{editingId ? "New Password (optional)" : "Password"}</FormLabel>
                                            <FormControl><Input type="password" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="subject" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Subject</FormLabel>
                                            <FormControl><Input {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <FormField control={form.control} name="designation" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Designation</FormLabel>
                                                <FormControl><Input placeholder="Senior Teacher" {...field} value={field.value ?? ""} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="department" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Department</FormLabel>
                                                <FormControl><Input placeholder="Science Department" {...field} value={field.value ?? ""} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <FormField control={form.control} name="employeeId" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Employee ID</FormLabel>
                                                <FormControl><Input placeholder="SNX-T-001" {...field} value={field.value ?? ""} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="teacherPhotoUrl" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Teacher Photo URL</FormLabel>
                                                <FormControl><Input placeholder="https://example.com/teacher-photo.jpg" {...field} value={field.value ?? ""} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                    <Button type="submit" className="w-full" disabled={createUser.isPending || updateUser.isPending}>
                                        {createUser.isPending || updateUser.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Save"}
                                    </Button>
                                </form>
                            </Form>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="bg-white dark:bg-card border rounded-2xl overflow-hidden shadow-sm">
                    <Table>
                        <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role Details</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                            ) : teachers.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No teachers found.</TableCell></TableRow>
                            ) : (
                                teachers.map(teacher => (
                                    <TableRow key={teacher.id}>
                                        <TableCell className="font-medium">{teacher.name}</TableCell>
                                        <TableCell>{teacher.email}</TableCell>
                                        <TableCell>{[teacher.subject, teacher.designation, teacher.department, teacher.employeeId].filter(Boolean).join(" • ") || "—"}</TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button size="sm" variant="outline" onClick={() => handleEdit(teacher.id)}>
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" variant="destructive" onClick={() => deleteUser.mutate(teacher.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </Layout>
    );
}
