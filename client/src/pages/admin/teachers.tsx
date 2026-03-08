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
    password: z.string().min(1, "Password is required"),
    subject: z.string().min(1, "Subject is required"),
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
        defaultValues: { name: "", email: "", password: "", subject: "" }
    });

    const teachers = users?.filter(u => u.role === 'teacher') || [];

    const onSubmit = (data: z.infer<typeof teacherSchema>) => {
        if (editingId) {
            updateUser.mutate({ id: editingId, ...data, role: "teacher" }, {
                onSuccess: () => { setIsOpen(false); setEditingId(null); form.reset(); }
            });
        } else {
            createUser.mutate({ ...data, role: "teacher" }, {
                onSuccess: () => { setIsOpen(false); form.reset(); }
            });
        }
    };

    const handleEdit = (id: number) => {
        const teacher = teachers.find(t => t.id === id);
        if (teacher) {
            form.reset({ name: teacher.name, email: teacher.email, password: "", subject: teacher.subject || "" });
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
                            <Button onClick={() => { setEditingId(null); form.reset(); }}>
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
                                            <FormLabel>Password</FormLabel>
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
                                <TableHead>Subject</TableHead>
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
                                        <TableCell>{teacher.subject}</TableCell>
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
