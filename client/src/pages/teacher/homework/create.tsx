import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { z } from "zod";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useAcademics } from "@/hooks/use-academics";
import { useCreateHomework, useHomeworkDetail, useHomeworkUploadUrl, useTeacherHomeworkClasses, useUpdateHomework } from "@/hooks/use-homework";
import { api } from "@shared/routes";
import { BookOpen, CalendarDays, FileUp, Loader2, X } from "lucide-react";

type FormValues = z.infer<typeof api.teacher.homework.create.input>;

type UploadItem = {
  key: string;
  name: string;
  size: number;
};

const priorityOptions = [
  { value: "low", label: "🔵 Low" },
  { value: "medium", label: "🟡 Medium" },
  { value: "high", label: "🟠 High" },
  { value: "urgent", label: "🔴 Urgent" },
] as const;

const acceptedTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
];

export default function HomeworkCreatorPage() {
  const [matchEdit, params] = useRoute("/teacher/homework/:id/edit");
  const homeworkId = matchEdit ? params?.id : null;
  const [, navigate] = useLocation();

  const { data: classPayload } = useTeacherHomeworkClasses();
  const { data: academics } = useAcademics();
  const { data: homeworkDetail, isLoading: detailLoading } = useHomeworkDetail(homeworkId ?? undefined);
  const uploadUrl = useHomeworkUploadUrl();
  const createHomework = useCreateHomework();
  const updateHomework = useUpdateHomework(homeworkId ?? "");

  const subjects = useMemo(
    () => Array.from(new Set((academics ?? []).map((item) => item.title))).sort(),
    [academics],
  );
  const classOptions = classPayload?.data ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(api.teacher.homework.create.input),
    defaultValues: {
      classId: classOptions[0]?.id ?? 0,
      subject: "",
      title: "",
      description: "",
      dueDate: "",
      priority: "medium",
      files: [],
    },
  });

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  useEffect(() => {
    if (classOptions.length > 0 && form.getValues("classId") === 0) {
      form.setValue("classId", classOptions[0].id);
    }
    if (subjects.length > 0 && !form.getValues("subject")) {
      form.setValue("subject", subjects[0]);
    }
  }, [classOptions, form, subjects]);

  useEffect(() => {
    if (!homeworkDetail?.data) return;
    const record = homeworkDetail.data;
    form.reset({
      classId: record.classId,
      subject: record.subject,
      title: record.title,
      description: record.description ?? "",
      dueDate: record.dueDate,
      priority: record.priority,
      files: record.files ?? [],
    });
    setUploads(
      (record.files ?? []).map((key) => ({
        key,
        name: key.split("/").pop() ?? "file",
        size: 0,
      })),
    );
  }, [form, homeworkDetail?.data]);

  const titleValue = form.watch("title") || "";
  const descriptionValue = form.watch("description") || "";

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!acceptedTypes.includes(file.type)) {
        form.setError("files", { message: "Only PDF, DOC, DOCX, PNG, and JPG files are allowed." });
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        form.setError("files", { message: "Each file must be under 10MB." });
        continue;
      }

      const presigned = await uploadUrl.mutateAsync({
        filename: file.name,
        contentType: file.type,
        folder: "homework",
      });

      const uploadRes = await fetch(presigned.url, {
        method: presigned.method,
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        form.setError("files", { message: "Upload failed. Please try again." });
        continue;
      }

      const newItem = { key: presigned.key, name: file.name, size: file.size };
      setUploads((prev) => [...prev, newItem]);
      form.setValue("files", [...(form.getValues("files") ?? []), presigned.key], { shouldValidate: true });
    }
  };

  const handleRemoveFile = (key: string) => {
    setUploads((prev) => prev.filter((item) => item.key !== key));
    form.setValue("files", (form.getValues("files") ?? []).filter((item) => item !== key), { shouldValidate: true });
  };

  const handleSubmit = async (values: FormValues, mode: "publish" | "draft") => {
    if (mode === "draft") setIsSavingDraft(true);
    try {
      if (homeworkId) {
        await updateHomework.mutateAsync(values);
      } else {
        await createHomework.mutateAsync(values);
      }
      if (mode === "publish") {
        navigate("/teacher/homework");
      }
    } finally {
      if (mode === "draft") setIsSavingDraft(false);
    }
  };

  if (homeworkId && detailLoading) {
    return (
      <Layout>
        <Card className="p-8">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading assignment...
          </div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="rounded-[2.5rem] bg-gradient-to-r from-emerald-500 to-blue-600 p-8 text-white shadow-[0_24px_60px_-35px_rgba(15,23,42,0.4)]">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
              <BookOpen className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold">{homeworkId ? "Edit assignment" : "Assign Homework"}</h1>
              <p className="mt-2 text-sm text-blue-100">
                {homeworkId ? "Update the assignment details for your class." : "Create a new assignment and notify students instantly."}
              </p>
            </div>
          </div>
        </div>

        <Card className="border-white/60 bg-white/70 backdrop-blur-xl shadow-xl">
          <div className="p-6 md:p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit((values) => handleSubmit(values, "publish"))} className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select subject" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {subjects.map((subject) => (
                              <SelectItem key={subject} value={subject}>
                                {subject}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="classId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Class</FormLabel>
                        <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select class" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {classOptions.map((item) => (
                              <SelectItem key={item.id} value={String(item.id)}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {priorityOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Chapter 5 practice set" maxLength={100} {...field} />
                      </FormControl>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Keep it concise and clear.</span>
                        <span>{titleValue.length}/100</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instructions</FormLabel>
                      <FormControl>
                        <Textarea rows={8} placeholder="Explain tasks, expectations, or links..." maxLength={2000} {...field} />
                      </FormControl>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Hint: Bold / Italic / List</span>
                        <span>{descriptionValue.length}/2000</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 lg:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start">
                              <CalendarDays className="mr-2 h-4 w-4" />
                              {field.value ? format(new Date(field.value), "PPP") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : "")}
                              disabled={(date) => date < new Date()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormItem>
                    <FormLabel>File upload</FormLabel>
                    <div className="flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/80 p-4 text-center">
                      <FileUp className="h-6 w-6 text-slate-400" />
                      <p className="mt-2 text-sm text-slate-600">Click or drag PDF/worksheet</p>
                      <p className="text-xs text-slate-400">Max 10MB, .pdf .doc .docx .png .jpg</p>
                      <Input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                        className="mt-3"
                        onChange={(event) => handleFileUpload(event.target.files)}
                      />
                    </div>
                    <FormMessage />
                    {uploads.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {uploads.map((file) => (
                          <span key={file.key} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                            {file.name}
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(file.key)}
                              className="text-slate-400 hover:text-slate-600"
                              aria-label="Remove file"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </FormItem>
                </div>

                <div className="sticky bottom-4 flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lg backdrop-blur md:flex-row">
                  <Button type="submit" className="h-14 flex-1" disabled={createHomework.isPending || updateHomework.isPending}>
                    {(createHomework.isPending || updateHomework.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "🚀 Assign to Class"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 flex-1"
                    onClick={() => handleSubmit(form.getValues(), "draft")}
                    disabled={isSavingDraft || createHomework.isPending || updateHomework.isPending}
                  >
                    {isSavingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Draft"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
