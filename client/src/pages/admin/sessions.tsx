/**
 * sessions.tsx
 *
 * Admin page for managing Academic Sessions.
 * Allows creating, editing, deleting, and setting the current session.
 */

import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useAcademicSessions,
  useCreateAcademicSession,
  useUpdateAcademicSession,
  useSetCurrentSession,
  useDeleteAcademicSession,
  type AcademicSession,
} from "@/hooks/use-sessions";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Validation schema (mirrors sessionsApi.academicSessions.create.input)
// ─────────────────────────────────────────────────────────────────────────────

const sessionFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(20, "Max 20 characters"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .min(1, "Start date is required"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .min(1, "End date is required"),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

type SessionFormValues = z.infer<typeof sessionFormSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-PK", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function sessionStatus(session: AcademicSession): "current" | "upcoming" | "past" {
  if (session.isCurrent) return "current";
  const today = new Date().toISOString().slice(0, 10);
  if (session.startDate > today) return "upcoming";
  return "past";
}

// ─────────────────────────────────────────────────────────────────────────────
// Session form dialog (create / edit)
// ─────────────────────────────────────────────────────────────────────────────

interface SessionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog is in edit mode. */
  session?: AcademicSession;
}

function SessionFormDialog({ open, onOpenChange, session }: SessionFormDialogProps) {
  const { toast } = useToast();
  const createMutation = useCreateAcademicSession();
  const updateMutation = useUpdateAcademicSession();

  const isEdit = !!session;

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      name: session?.name ?? "",
      startDate: session?.startDate ?? "",
      endDate: session?.endDate ?? "",
    },
  });

  // Reset form when dialog opens/closes or session changes
  const handleOpenChange = (val: boolean) => {
    if (!val) form.reset();
    onOpenChange(val);
  };

  const onSubmit = async (values: SessionFormValues) => {
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: session!.id, ...values });
        toast({ title: "Session updated", description: `"${values.name}" has been updated.` });
      } else {
        await createMutation.mutateAsync(values);
        toast({ title: "Session created", description: `"${values.name}" has been created.` });
      }
      handleOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: isEdit ? "Failed to update session" : "Failed to create session",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Academic Session" : "New Academic Session"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the session details below."
              : "Create a new academic session for the school year."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 2024-2025" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              {/* Start date */}
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* End date */}
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? "Save Changes" : "Create Session"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session card
// ─────────────────────────────────────────────────────────────────────────────

interface SessionCardProps {
  session: AcademicSession;
  onEdit: (s: AcademicSession) => void;
  onDelete: (s: AcademicSession) => void;
  onSetCurrent: (s: AcademicSession) => void;
  isSettingCurrent: boolean;
}

function SessionCard({ session, onEdit, onDelete, onSetCurrent, isSettingCurrent }: SessionCardProps) {
  const status = sessionStatus(session);

  const statusConfig = {
    current: {
      label: "Current",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    upcoming: {
      label: "Upcoming",
      className: "border-blue-200 bg-blue-50 text-blue-700",
      icon: <Clock className="h-3 w-3" />,
    },
    past: {
      label: "Past",
      className: "border-slate-200 bg-slate-50 text-slate-500",
      icon: <CalendarDays className="h-3 w-3" />,
    },
  }[status];

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border p-4 transition-all duration-200",
        status === "current"
          ? "border-emerald-200 bg-emerald-50/40 shadow-sm shadow-emerald-100"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
      )}
    >
      {/* Current indicator strip */}
      {status === "current" && (
        <div className="absolute inset-y-0 left-0 w-0.5 rounded-l-xl bg-emerald-500" />
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{session.name}</h3>
            {status === "current" && (
              <Star className="h-3.5 w-3.5 shrink-0 fill-emerald-500 text-emerald-500" />
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDate(session.startDate)} — {formatDate(session.endDate)}
          </p>
        </div>

        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            statusConfig.className,
          )}
        >
          {statusConfig.icon}
          {statusConfig.label}
        </span>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
        {status !== "current" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={() => onSetCurrent(session)}
            disabled={isSettingCurrent}
          >
            {isSettingCurrent ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Star className="h-3 w-3" />
            )}
            Set Current
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs text-slate-600 hover:text-slate-900"
          onClick={() => onEdit(session)}
        >
          <Pencil className="h-3 w-3" />
          Edit
        </Button>

        {status !== "current" && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1.5 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-600"
            onClick={() => onDelete(session)}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminSessions() {
  const { toast } = useToast();
  const { data: sessions, isLoading } = useAcademicSessions();
  const setCurrentMutation = useSetCurrentSession();
  const deleteMutation = useDeleteAcademicSession();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editSession, setEditSession] = useState<AcademicSession | null>(null);
  const [deleteSession, setDeleteSession] = useState<AcademicSession | null>(null);
  const [settingCurrentId, setSettingCurrentId] = useState<number | null>(null);

  // ── Set current ──────────────────────────────────────────────────────────
  const handleSetCurrent = async (session: AcademicSession) => {
    setSettingCurrentId(session.id);
    try {
      await setCurrentMutation.mutateAsync(session.id);
      toast({
        title: "Current session updated",
        description: `"${session.name}" is now the active academic session.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to set current session",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    } finally {
      setSettingCurrentId(null);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deleteSession) return;
    try {
      await deleteMutation.mutateAsync(deleteSession.id);
      toast({
        title: "Session deleted",
        description: `"${deleteSession.name}" has been removed.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to delete session",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    } finally {
      setDeleteSession(null);
    }
  };

  // ── Derived stats ────────────────────────────────────────────────────────
  const currentSession = sessions?.find((s) => s.isCurrent);
  const totalSessions = sessions?.length ?? 0;

  return (
    <Layout>
      <div className="space-y-5 pb-8">
        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Academic Sessions</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Manage school years and set the active academic session.
            </p>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="gap-2 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            New Session
          </Button>
        </section>

        {/* ── Summary cards ───────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            {
              label: "Total Sessions",
              value: isLoading ? "—" : String(totalSessions),
              icon: <CalendarDays className="h-4 w-4 text-indigo-500" />,
              bg: "bg-indigo-50",
            },
            {
              label: "Current Session",
              value: isLoading ? "—" : currentSession?.name ?? "None",
              icon: <Star className="h-4 w-4 text-emerald-500" />,
              bg: "bg-emerald-50",
            },
            {
              label: "Past Sessions",
              value: isLoading
                ? "—"
                : String(
                    sessions?.filter((s) => !s.isCurrent && s.endDate < new Date().toISOString().slice(0, 10)).length ?? 0
                  ),
              icon: <Clock className="h-4 w-4 text-slate-400" />,
              bg: "bg-slate-50",
            },
          ].map((item) => (
            <Card key={item.label} className="border-slate-200/80 shadow-none">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", item.bg)}>
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {item.label}
                  </p>
                  <p className="truncate text-base font-bold text-slate-900">{item.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* ── Sessions list ────────────────────────────────────────────── */}
        <Card className="overflow-hidden border-slate-200/80 shadow-none">
          <CardHeader className="border-b border-slate-100 px-4 py-3">
            <CardTitle className="text-sm font-semibold text-slate-800">All Sessions</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Click "Set Current" to activate a session for promotions and class assignments.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : !sessions || sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <CalendarDays className="h-6 w-6 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">No sessions yet</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Create your first academic session to get started.
                  </p>
                </div>
                <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  New Session
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {/* Sort: current first, then by startDate desc */}
                {[...sessions]
                  .sort((a, b) => {
                    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
                    return b.startDate.localeCompare(a.startDate);
                  })
                  .map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onEdit={setEditSession}
                      onDelete={setDeleteSession}
                      onSetCurrent={handleSetCurrent}
                      isSettingCurrent={settingCurrentId === session.id}
                    />
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Create dialog ──────────────────────────────────────────────── */}
      <SessionFormDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      {/* ── Edit dialog ────────────────────────────────────────────────── */}
      {editSession && (
        <SessionFormDialog
          open={!!editSession}
          onOpenChange={(open) => { if (!open) setEditSession(null); }}
          session={editSession}
        />
      )}

      {/* ── Delete confirmation ────────────────────────────────────────── */}
      <AlertDialog open={!!deleteSession} onOpenChange={(open) => { if (!open) setDeleteSession(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Academic Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold">"{deleteSession?.name}"</span>. Any promotion history
              linked to this session will also be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-600"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
