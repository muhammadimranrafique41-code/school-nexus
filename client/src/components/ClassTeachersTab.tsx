import { useMemo, useState } from "react";
import { useClassTeachers, useAssignClassTeacher, type AssignTeacherInput } from "@/hooks/use-class-teachers";
import { useToast } from "@/hooks/use-toast";
import { useUsers } from "@/hooks/use-users";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Trash2 } from "lucide-react";

const assignSchema = z.object({
  teacherId: z.coerce.number().int().positive(),
  subjectsRaw: z.string().min(1, "Enter at least one subject"),
  periodsPerWeek: z.coerce.number().int().min(1).max(8),
  priority: z.coerce.number().int().min(1).max(5).default(3),
});

type AssignFormValues = z.infer<typeof assignSchema>;

type Props = {
  classId: number;
};

export function ClassTeachersTab({ classId }: Props) {
  const { data: teachers, isLoading } = useClassTeachers(classId);
  const assignMutation = useAssignClassTeacher(classId);
  const { toast } = useToast();
  const { data: users } = useUsers();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AssignFormValues>({
    resolver: zodResolver(assignSchema),
    defaultValues: {
      teacherId: 0,
      subjectsRaw: "",
      periodsPerWeek: 4,
      priority: 3,
    },
  });

  const teacherOptions = useMemo(
    () => (users ?? []).filter((user) => user.role === "teacher"),
    [users],
  );

  const onSubmit = async (values: AssignFormValues) => {
    const subjects = values.subjectsRaw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (subjects.length === 0) {
      form.setError("subjectsRaw", { message: "Enter at least one subject" });
      return;
    }
    if (subjects.length > 5) {
      form.setError("subjectsRaw", { message: "You can assign up to 5 subjects per teacher" });
      return;
    }

    const payload: AssignTeacherInput = {
      teacherId: values.teacherId,
      subjects,
      periodsPerWeek: values.periodsPerWeek,
      priority: values.priority,
    };

    try {
      setIsSubmitting(true);
      await assignMutation.mutateAsync(payload);
      toast({ title: "Teacher assigned", description: "The teacher has been assigned to this class." });
      form.reset({ teacherId: 0, subjectsRaw: "", periodsPerWeek: 4, priority: 3 });
    } catch (error: any) {
      toast({
        title: "Unable to assign teacher",
        description: error?.message ?? "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-4">
          <FormField
            control={form.control}
            name="teacherId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teacher</FormLabel>
                <FormControl>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={String(field.value ?? 0)}
                    onChange={(event) => field.onChange(Number(event.target.value))}
                  >
                    <option value={0}>Select a teacher</option>
                    {teacherOptions.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name} {teacher.subject ? `(${teacher.subject})` : ""}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="subjectsRaw"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Subjects</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Math, Physics" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <FormField
              control={form.control}
              name="periodsPerWeek"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Periods / week</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={8} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={5} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <Button type="submit" disabled={isSubmitting || assignMutation.isPending}>
              {isSubmitting || assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign teacher"}
            </Button>
          </div>
        </form>
      </Form>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Teacher</TableHead>
              <TableHead>Subjects</TableHead>
              <TableHead>Periods / week</TableHead>
              <TableHead>Priority</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : (teachers ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  No teachers assigned to this class yet.
                </TableCell>
              </TableRow>
            ) : (
              (teachers ?? []).map((item) => {
                const teacher = teacherOptions.find((user) => user.id === item.teacherId);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{teacher?.name ?? `Teacher #${item.teacherId}`}</div>
                        {teacher?.subject && (
                          <p className="text-xs text-muted-foreground">Primary: {teacher.subject}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="space-x-1">
                      {item.subjects.map((subject) => (
                        <Badge key={subject} variant="outline">
                          {subject}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell>{item.periodsPerWeek}</TableCell>
                    <TableCell>
                      <Badge variant={item.priority === 1 ? "secondary" : "outline"}>
                        {item.priority === 1 ? "Homeroom" : item.priority}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

