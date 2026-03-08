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

const studentSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email(),
    password: z.string().min(1, "Password is required"),
    className: z.string().min(1, "Class name is required"),
});

export default function StudentManagement() {
    const { data: users, isLoading } = useUsers();
    const createUser = useCreateUser();
    const updateUser = useUpdateUserHook();
    const deleteUser = useDeleteUserHook();
    const [isOpen, setIsOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const form = useForm<z.infer<typeof studentSchema>>({
        resolver: zodResolver(studentSchema),
        defaultValues: { name: "", email: "", password: "", className: "" }
    });

    const students = users?.filter(u => u.role === 'student') || [];
    const editingStudent = students.find(s => s.id === editingId);

    const onSubmit = (data: z.infer<typeof studentSchema>) => {
        if (editingId) {
            updateUser.mutate({ id: editingId, ...data, role: "student" }, {
                onSuccess: () => { setIsOpen(false); setEditingId(null); form.reset(); }
            });
        } else {
            createUser.mutate({ ...data, role: "student" }, {
                onSuccess: () => { setIsOpen(false); form.reset(); }
            });
        }
    };

    const handleEdit = (id: number) => {
        const student = students.find(s => s.id === id);
        if (student) {
            form.reset({ name: student.name, email: student.email, password: "", className: student.className || "" });
            setEditingId(id);
            setIsOpen(true);
        }
    };

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold">Students Management</h1>
                        <p className="text-muted-foreground mt-1">Manage all students in the system.</p>
                    </div>
                    <Dialog open={isOpen} onOpenChange={setIsOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={() => { setEditingId(null); form.reset(); }}>
                                <Plus className="mr-2 h-4 w-4" /> Add Student
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingId ? "Edit Student" : "Add New Student"}</DialogTitle>
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
                                            <FormLabel>Password</FormLabel>
                                            <FormControl><Input type="password" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="className" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Class Name</FormLabel>
                                            <FormControl><Input {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
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
                                <TableHead>Class</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                            ) : students.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No students found.</TableCell></TableRow>
                            ) : (
                                students.map(student => (
                                    <TableRow key={student.id}>
                                        <TableCell className="font-medium">{student.name}</TableCell>
                                        <TableCell>{student.email}</TableCell>
                                        <TableCell>{student.className}</TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button size="sm" variant="outline" onClick={() => handleEdit(student.id)}>
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" variant="destructive" onClick={() => deleteUser.mutate(student.id)}>
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
