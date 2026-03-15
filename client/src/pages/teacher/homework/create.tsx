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
import { BookOpen, CalendarDays, FileUp, Loader2, Plus, X } from "lucide-react";

type FormValues = z.infer<typeof api.teacher.homework.create.input>;

type UploadItem = {
  key: string;
  name: string;
  size: number;
};

type SubjectEntry = {
  id: string;
  subject: string;
  title: string;
  description: string;
};

type SubjectEntryError = {
  subject?: string;
  title?: string;
  description?: string;
};

const priorityOptions = [
  { value: "low", label: "Low", className: "text-slate-600" },
  { value: "medium", label: "Medium", className: "text-blue-600" },
  { value: "high", label: "High", className: "text-orange-600" },
  { value: "urgent", label: "Urgent", className: "text-red-600" },
] as const;

const acceptedTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
];

const makeEntry = (subject: string) => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  subject,
  title: "",
  description: "",
});

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
  const [subjectEntries, setSubjectEntries] = useState<SubjectEntry[]>([makeEntry("")]);
  const [subjectErrors, setSubjectErrors] = useState<Record<string, SubjectEntryError>>({});

  useEffect(() => {
    if (classOptions.length > 0 && form.getValues("classId") === 0) {
      form.setValue("classId", classOptions[0].id);
    }
    if (subjects.length > 0) {
      setSubjectEntries((prev) => {
        if (prev.length === 1 && !prev[0].subject) {
          return [{ ...prev[0], subject: subjects[0] }];
        }
        return prev;
      });
      if (!form.getValues("subject")) {
        form.setValue("subject", subjects[0]);
      }
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
    setSubjectEntries([
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        subject: record.subject,
        title: record.title,
        description: record.description ?? "",
      },
    ]);
    setSubjectErrors({});
  }, [form, homeworkDetail?.data]);

  const titleValue = subjectEntries[0]?.title ?? "";
  const descriptionValue = subjectEntries[0]?.description ?? "";

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

  const handleEntryChange = (id: string, patch: Partial<SubjectEntry>) => {
    setSubjectEntries((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    if (subjectEntries[0]?.id === id) {
      if (patch.subject !== undefined) form.setValue("subject", patch.subject);
      if (patch.title !== undefined) form.setValue("title", patch.title);
      if (patch.description !== undefined) form.setValue("description", patch.description);
    }
  };

  const handleAddSubject = () => {
    if (homeworkId) return;
    setSubjectEntries((prev) => [...prev, makeEntry(subjects[0] ?? "")]);
  };

  const handleRemoveSubject = (id: string) => {
    setSubjectEntries((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
    setSubjectErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const validateSubjects = () => {
    const nextErrors: Record<string, SubjectEntryError> = {};
    for (const entry of subjectEntries) {
      const errors: SubjectEntryError = {};
      if (!entry.subject.trim()) errors.subject = "Subject is required.";
      if (!entry.title.trim()) errors.title = "Title is required.";
      if (entry.title.length > 100) errors.title = "Title must be at most 100 characters.";
      if (entry.description.length > 2000) errors.description = "Instructions must be at most 2000 characters.";
      if (Object.keys(errors).length > 0) {
        nextErrors[entry.id] = errors;
      }
    }
    setSubjectErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (values: FormValues, mode: "publish" | "draft") => {
    if (mode === "draft") setIsSavingDraft(true);
    try {
      const firstEntry = subjectEntries[0];
      if (firstEntry) {
        form.setValue("subject", firstEntry.subject);
        form.setValue("title", firstEntry.title);
        form.setValue("description", firstEntry.description);
      }

      const classIdValue = form.getValues("classId");
      if (!classIdValue || classIdValue === 0) {
        if (classOptions.length > 0) {
          form.setValue("classId", classOptions[0].id);
        } else {
          form.setError("classId", { message: "No class assigned to this teacher yet." });
          return;
        }
      }

      const isValid = await form.trigger(["classId", "dueDate", "priority", "files", "subject", "title", "description"]);
      if (!isValid || !validateSubjects()) {
        return;
      }

      const basePayload = form.getValues();

      if (homeworkId) {
        await updateHomework.mutateAsync({
          ...basePayload,
          subject: subjectEntries[0]?.subject ?? values.subject,
          title: subjectEntries[0]?.title ?? values.title,
          description: subjectEntries[0]?.description ?? values.description,
        });
      } else {
        for (const entry of subjectEntries) {
          await createHomework.mutateAsync({
            ...basePayload,
            subject: entry.subject.trim(),
            title: entry.title.trim(),
            description: entry.description.trim(),
          });
        }
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
                    name="classId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Class</FormLabel>
                        <Select
                          value={field.value ? String(field.value) : ""}
                          onValueChange={(value) => field.onChange(Number(value))}
                          disabled={classOptions.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={classOptions.length ? "Select class" : "No classes available"} />
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
                                <span className="flex items-center gap-2">
                                  <span className={`h-2 w-2 rounded-full ${option.className.replace("text-", "bg-")}`} />
                                  <span className={option.className}>{option.label}</span>
                                </span>
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
                </div>

                {subjectEntries.map((entry, index) => {
                  const errors = subjectErrors[entry.id] ?? {};
                  return (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white/70 p-5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-700">Subject {index + 1}</h3>
                        {subjectEntries.length > 1 && !homeworkId ? (
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveSubject(entry.id)}>
                            Remove
                          </Button>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div>
                          <FormLabel>Subject</FormLabel>
                          <Select
                            value={entry.subject}
                            onValueChange={(value) => handleEntryChange(entry.id, { subject: value })}
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Select subject" />
                            </SelectTrigger>
                            <SelectContent>
                              {subjects.map((subject) => (
                                <SelectItem key={`${entry.id}-${subject}`} value={subject}>
                                  {subject}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {errors.subject ? <p className="mt-1 text-xs text-red-500">{errors.subject}</p> : null}
                        </div>
                        <div>
                          <FormLabel>Title</FormLabel>
                          <Input
                            className="mt-2"
                            placeholder="e.g. Chapter 5 practice set"
                            maxLength={100}
                            value={entry.title}
                            onChange={(event) => handleEntryChange(entry.id, { title: event.target.value })}
                          />
                          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                            <span>Keep it concise and clear.</span>
                            <span>{entry.title.length}/100</span>
                          </div>
                          {errors.title ? <p className="mt-1 text-xs text-red-500">{errors.title}</p> : null}
                        </div>
                      </div>

                      <div className="mt-4">
                        <FormLabel>Instructions</FormLabel>
                        <Textarea
                          className="mt-2"
                          rows={6}
                          placeholder="Explain tasks, expectations, or links..."
                          maxLength={2000}
                          value={entry.description}
                          onChange={(event) => handleEntryChange(entry.id, { description: event.target.value })}
                        />
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                          <span>Hint: Bold / Italic / List</span>
                          <span>{entry.description.length}/2000</span>
                        </div>
                        {errors.description ? <p className="mt-1 text-xs text-red-500">{errors.description}</p> : null}
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between gap-3">
                  <Button type="button" variant="outline" onClick={handleAddSubject} disabled={Boolean(homeworkId)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Subject
                  </Button>
                  {homeworkId ? (
                    <p className="text-xs text-slate-400">Multiple subjects are available only when creating new homework.</p>
                  ) : null}
                </div>

                <FormItem>
                  <FormLabel>File upload</FormLabel>
                  <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/80 p-4 text-center">
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

                <div className="sticky bottom-4 flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lg backdrop-blur md:flex-row">
                  <Button
                    type="submit"
                    className="h-14 flex-1"
                    disabled={createHomework.isPending || updateHomework.isPending || classOptions.length === 0}
                  >
                    {(createHomework.isPending || updateHomework.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Assign to Class"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 flex-1"
                    onClick={() => handleSubmit(form.getValues(), "draft")}
                    disabled={isSavingDraft || createHomework.isPending || updateHomework.isPending || classOptions.length === 0}
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
