import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useCreateUser } from "@/hooks/use-users";

const userSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.enum(["admin", "teacher", "student"]),
    subject: z.string().optional(),
    className: z.string().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

interface UserFormProps {
    defaultRole?: "admin" | "teacher" | "student";
    onSuccess?: () => void;
    showRoleSelect?: boolean;
}

export function UserForm({ defaultRole = "student", onSuccess, showRoleSelect = true }: UserFormProps) {
    const createUser = useCreateUser();

    const form = useForm<UserFormValues>({
        resolver: zodResolver(userSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
            role: defaultRole,
            subject: "",
            className: ""
        }
    });

    const watchRole = form.watch("role");

    const onSubmit = (data: UserFormValues) => {
        createUser.mutate(data, {
            onSuccess: () => {
                form.reset();
                onSuccess?.();
            }
        });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input type="email" placeholder="john@school.edu" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Temporary Password</FormLabel>
                        <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                {showRoleSelect && (
                    <FormField control={form.control} name="role" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Role</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a role" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="teacher">Teacher</SelectItem>
                                    <SelectItem value="student">Student</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                )}

                {(watchRole === 'teacher' || (!showRoleSelect && defaultRole === 'teacher')) && (
                    <FormField control={form.control} name="subject" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Subject</FormLabel>
                            <FormControl><Input placeholder="Mathematics" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                )}

                {(watchRole === 'student' || (!showRoleSelect && defaultRole === 'student')) && (
                    <FormField control={form.control} name="className" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Class</FormLabel>
                            <FormControl><Input placeholder="Grade 10-A" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                )}

                <Button type="submit" className="w-full mt-6 h-11" disabled={createUser.isPending}>
                    {createUser.isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                        </>
                    ) : "Create User"}
                </Button>
            </form>
        </Form>
    );
}
