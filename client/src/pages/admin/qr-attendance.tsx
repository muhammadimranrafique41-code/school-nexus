import { useMemo, useState } from "react";
import {
  TeacherIdCardPreview, buildTeacherIdCardPrintHtml,
  resolveTeacherPortraitUrl, type TeacherIdCardData, useTeacherPortraitUrl,
} from "@/components/qr-teacher-id-card";
import {
  StudentIdCardPreview, buildStudentIdCardPrintHtml,
  getContactLine, resolveStudentPortraitUrl, type StudentIdCardData, useStudentPortraitUrl,
} from "@/components/qr-student-id-card";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useIssueQrProfile, useQrProfiles,
  useRegenerateQrProfile, useUpdateQrProfileStatus,
} from "@/hooks/use-qr-attendance";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { buildQrImageUrl, copyToClipboard } from "@/lib/qr";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { api } from "@shared/routes";
import { Copy, GraduationCap, Loader2, Printer, QrCode, RefreshCw, ScanLine, Search, ShieldCheck, Users } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";

type QrProfilesPayload = NonNullable<z.infer<(typeof api.qrAttendance.profiles.list.responses)[200]>["data"]>;
type QrRosterItem = QrProfilesPayload["roster"][number];
type QrIssuedCard = NonNullable<z.infer<(typeof api.qrAttendance.profiles.issue.responses)[200]>["data"]>;

// ── Role badge ────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    student: "border-sky-200 bg-sky-50 text-sky-700",
    teacher: "border-emerald-200 bg-emerald-50 text-emerald-700",
    admin: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
      styles[role] ?? "border-slate-200 bg-slate-50 text-slate-500",
    )}>
      {role}
    </span>
  );
}

// ── Avatar initials ───────────────────────────────────────────────────────
function Avatar({ name, role }: { name: string; role: string }) {
  const colors: Record<string, string> = {
    student: "bg-sky-100 text-sky-700",
    teacher: "bg-emerald-100 text-emerald-700",
    admin: "bg-violet-100 text-violet-700",
  };
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={cn(
      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
      colors[role] ?? "bg-slate-100 text-slate-600",
    )}>
      {initials}
    </div>
  );
}

export default function AdminQrAttendance() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [issuedCard, setIssuedCard] = useState<QrIssuedCard | null>(null);

  const { data: publicSettings } = usePublicSchoolSettings();
  const { data, isLoading } = useQrProfiles();
  const issueProfile = useIssueQrProfile();
  const regenerateProfile = useRegenerateQrProfile();
  const updateStatus = useUpdateQrProfileStatus();

  const roster = data?.roster ?? [];
  const summary = data?.summary;

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((item: QrRosterItem) => {
      const hay = `${item.user.name} ${item.user.email} ${item.user.role} ${item.user.className ?? ""} ${item.user.subject ?? ""} ${item.user.fatherName ?? ""} ${item.user.designation ?? ""} ${item.user.department ?? ""} ${item.user.employeeId ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [roster, search]);

  // ── School meta ─────────────────────────────────────────────────────
  const schoolName = publicSettings?.schoolInformation.schoolName ?? "School Nexus Academy";
  const shortName = publicSettings?.schoolInformation.shortName || schoolName;
  const motto = publicSettings?.schoolInformation.motto?.trim() || "Empowering every learner.";
  const academicYear = publicSettings?.academicConfiguration.currentAcademicYear ?? "Current Academic Year";
  const currentTerm = publicSettings?.academicConfiguration.currentTerm ?? "Current Term";
  const contactLine = getContactLine(publicSettings);
  const authenticityLine = contactLine
    ? `Official ${shortName} credential • ${contactLine}`
    : `Official ${shortName} credential • Valid only when scanned through QR Attendance`;

  // ── Issued card data ─────────────────────────────────────────────────
  const issuedStudentPortraitUrl = useStudentPortraitUrl(
    issuedCard?.profile.user?.role === "student" ? issuedCard.profile.user.studentPhotoUrl ?? null : null,
  );
  const issuedTeacherPortraitUrl = useTeacherPortraitUrl(
    issuedCard?.profile.user?.role === "teacher" ? issuedCard.profile.user.teacherPhotoUrl ?? null : null,
  );

  const issuedStudentCardData: StudentIdCardData | null =
    issuedCard?.profile.user?.role === "student"
      ? { schoolName, shortName, motto, logoUrl: publicSettings?.branding.logoUrl || undefined, studentName: issuedCard.profile.user.name, className: issuedCard.profile.user.className?.trim() || "Unassigned", fatherName: issuedCard.profile.user.fatherName?.trim() || "Not on file", publicId: issuedCard.profile.publicId, qrUrl: buildQrImageUrl(issuedCard.token, 320), portraitUrl: issuedStudentPortraitUrl, isActive: issuedCard.profile.isActive, academicYear, currentTerm, authenticityLine }
      : null;

  const issuedTeacherCardData: TeacherIdCardData | null =
    issuedCard?.profile.user?.role === "teacher"
      ? { schoolName, shortName, motto, logoUrl: publicSettings?.branding.logoUrl || undefined, teacherName: issuedCard.profile.user.name, designation: issuedCard.profile.user.designation?.trim() || "Faculty Member", department: issuedCard.profile.user.department?.trim() || issuedCard.profile.user.subject?.trim() || "Academic Affairs", subject: issuedCard.profile.user.subject?.trim() || "General Studies", employeeId: issuedCard.profile.user.employeeId?.trim() || issuedCard.profile.publicId.toUpperCase(), publicId: issuedCard.profile.publicId, qrUrl: buildQrImageUrl(issuedCard.token, 320), portraitUrl: issuedTeacherPortraitUrl, isActive: issuedCard.profile.isActive, academicYear, currentTerm, authenticityLine: contactLine ? `Official ${shortName} staff credential • ${contactLine}` : `Official ${shortName} staff credential • Valid only when scanned through QR Attendance` }
      : null;

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleIssue = async (userId: number) => {
    try {
      const r = await issueProfile.mutateAsync(userId);
      setIssuedCard(r.data);
      toast({ title: "QR card issued", description: r.message || "QR credentials are ready." });
    } catch (e) { toast({ title: "Unable to issue QR card", description: getErrorMessage(e), variant: "destructive" }); }
  };

  const handleRegenerate = async (userId: number) => {
    try {
      const r = await regenerateProfile.mutateAsync(userId);
      setIssuedCard(r.data);
      toast({ title: "QR card regenerated", description: r.message || "Previous token has been rotated." });
    } catch (e) { toast({ title: "Unable to regenerate", description: getErrorMessage(e), variant: "destructive" }); }
  };

  const handleStatusChange = async (userId: number, isActive: boolean) => {
    try {
      const r = await updateStatus.mutateAsync({ userId, isActive });
      toast({ title: "Status updated", description: `${r.data.profile.user?.name ?? "User"} is now ${isActive ? "active" : "inactive"}.` });
    } catch (e) { toast({ title: "Unable to update status", description: getErrorMessage(e), variant: "destructive" }); }
  };

  const handleCopy = async () => {
    if (!issuedCard) return;
    try { await copyToClipboard(issuedCard.token); toast({ title: "Token copied" }); }
    catch (e) { toast({ title: "Unable to copy", description: getErrorMessage(e), variant: "destructive" }); }
  };

  const handlePrint = async () => {
    if ((!issuedStudentCardData && !issuedTeacherCardData) || typeof window === "undefined") return;
    const pw = window.open("", "_blank", "width=1100,height=1500");
    if (!pw) { toast({ title: "Allow pop-ups to print", variant: "destructive" }); return; }
    try {
      const markup = issuedStudentCardData
        ? buildStudentIdCardPrintHtml({ ...issuedStudentCardData, portraitUrl: await resolveStudentPortraitUrl(issuedStudentCardData.portraitUrl ?? issuedCard?.profile.user?.studentPhotoUrl ?? null) })
        : issuedTeacherCardData
          ? buildTeacherIdCardPrintHtml({ ...issuedTeacherCardData, portraitUrl: await resolveTeacherPortraitUrl(issuedTeacherCardData.portraitUrl ?? issuedCard?.profile.user?.teacherPhotoUrl ?? null) })
          : null;
      if (!markup) { pw.close(); return; }
      pw.document.open(); pw.document.write(markup); pw.document.close();
    } catch (e) { pw.close(); toast({ title: "Print failed", description: getErrorMessage(e), variant: "destructive" }); }
  };

  // ── KPI data ─────────────────────────────────────────────────────────
  const kpis = [
    { label: "Eligible", value: summary?.eligibleUsers ?? 0, icon: Users, color: "text-indigo-600 bg-indigo-50", border: "border-indigo-100" },
    { label: "Issued", value: summary?.issuedProfiles ?? 0, icon: QrCode, color: "text-blue-600 bg-blue-50", border: "border-blue-100" },
    { label: "Active", value: summary?.activeProfiles ?? 0, icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50", border: "border-emerald-100" },
    { label: "Scans today", value: summary?.scansToday ?? 0, icon: ScanLine, color: "text-violet-600 bg-violet-50", border: "border-violet-100" },
    { label: "Students", value: summary?.studentProfiles ?? 0, icon: GraduationCap, color: "text-sky-600 bg-sky-50", border: "border-sky-100" },
    { label: "Teachers", value: summary?.teacherProfiles ?? 0, icon: Users, color: "text-amber-600 bg-amber-50", border: "border-amber-100" },
  ];

  return (
    <Layout>
      <div className="space-y-4 pb-8">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">QR Attendance</h1>
              <p className="text-[12px] text-slate-400">Issue, rotate, and manage QR credentials for students and teachers.</p>
            </div>
          </div>
        </section>

        {/* ── KPI strip ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {kpis.map((item) => (
            <div
              key={item.label}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border bg-white px-3 py-4 text-center shadow-none",
                item.border,
              )}
            >
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", item.color)}>
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none text-slate-900">{item.value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Roster card ─────────────────────────────────────────────── */}
        <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
          <CardHeader className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                <Users className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">Roster</CardTitle>
                <CardDescription className="text-[11px]">
                  {filteredRoster.length} user{filteredRoster.length !== 1 ? "s" : ""} · eligible teachers and students only
                </CardDescription>
              </div>
            </div>
            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, class, subject…"
                className="h-8 pl-8 text-sm"
              />
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["User", "Role", "Details", "Card ID", "Today", "Active", ""].map((h, i) => (
                      <th key={i} className={cn(
                        "px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400",
                        i === 0 && "pl-4 text-left",
                        i === 6 && "pr-4 text-right",
                        i > 0 && i < 6 && "text-left",
                      )}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-500" />
                      </td>
                    </tr>
                  ) : filteredRoster.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-[13px] text-slate-400">
                        No eligible users matched your search.
                      </td>
                    </tr>
                  ) : (
                    filteredRoster.map((item: QrRosterItem, idx: number) => {
                      const details = item.user.role === "student"
                        ? [item.user.className, item.user.fatherName].filter(Boolean).join(" · ") || "—"
                        : [item.user.subject, item.user.designation, item.user.department, item.user.employeeId].filter(Boolean).join(" · ") || "—";

                      return (
                        <tr
                          key={item.user.id}
                          className={cn(
                            "group border-b border-slate-100 last:border-b-0 transition-colors hover:bg-indigo-50/30",
                            idx % 2 === 1 && "bg-slate-50/30",
                          )}
                        >
                          {/* User */}
                          <td className="py-2.5 pl-4 pr-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={item.user.name} role={item.user.role} />
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-slate-900">{item.user.name}</p>
                                <p className="max-w-[160px] truncate text-[11px] text-slate-400">{item.user.email}</p>
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td className="px-3 py-2.5">
                            <RoleBadge role={item.user.role} />
                          </td>

                          {/* Details */}
                          <td className="px-3 py-2.5">
                            <span className="max-w-[180px] truncate text-[12px] text-slate-400">{details}</span>
                          </td>

                          {/* Card */}
                          <td className="px-3 py-2.5">
                            {item.profile ? (
                              <div>
                                <p className="font-mono text-[12px] font-semibold text-slate-800">{item.profile.publicId}</p>
                                <p className="text-[10px] text-slate-400">
                                  {formatDate(item.profile.issuedAt, "MMM dd, yyyy")}
                                </p>
                              </div>
                            ) : (
                              <span className="text-[12px] text-slate-300">Not issued</span>
                            )}
                          </td>

                          {/* Today's scans */}
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {item.todayDirections.length === 0 ? (
                                <span className="text-[11px] text-slate-300">—</span>
                              ) : (
                                item.todayDirections.map((dir: QrRosterItem["todayDirections"][number]) => (
                                  <span key={dir} className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                    {dir}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>

                          {/* Active toggle */}
                          <td className="px-3 py-2.5">
                            <Switch
                              checked={item.profile?.isActive ?? false}
                              disabled={!item.profile || updateStatus.isPending}
                              onCheckedChange={(checked) => void handleStatusChange(item.user.id, checked)}
                            />
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 pl-3 pr-4 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg hover:bg-indigo-50 hover:text-indigo-600"
                                title={item.profile ? "View / re-issue" : "Issue QR card"}
                                disabled={issueProfile.isPending || regenerateProfile.isPending}
                                onClick={() => void handleIssue(item.user.id)}
                              >
                                <QrCode className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg hover:bg-amber-50 hover:text-amber-600"
                                title="Rotate token"
                                disabled={!item.profile || issueProfile.isPending || regenerateProfile.isPending}
                                onClick={() => void handleRegenerate(item.user.id)}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Issued card dialog ───────────────────────────────────────── */}
        <Dialog open={!!issuedCard} onOpenChange={(open) => !open && setIssuedCard(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Issued QR Credential</DialogTitle>
            </DialogHeader>

            {issuedCard && (
              <div className="space-y-4 pt-1">
                {/* ID card preview */}
                {issuedStudentCardData ? (
                  <StudentIdCardPreview card={issuedStudentCardData} />
                ) : issuedTeacherCardData ? (
                  <TeacherIdCardPreview card={issuedTeacherCardData} />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <img
                      src={buildQrImageUrl(issuedCard.token)}
                      alt="QR credential"
                      className="mx-auto aspect-square w-full max-w-[220px] rounded-xl border bg-white p-3"
                    />
                    <div>
                      <p className="text-[13px] font-semibold text-slate-900">{issuedCard.profile.user?.name ?? `User #${issuedCard.profile.userId}`}</p>
                      <p className="text-[11px] text-slate-400">ID: {issuedCard.profile.publicId}</p>
                    </div>
                  </div>
                )}

                {/* Token + meta */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Manual fallback token</p>
                    <p className="mt-2 break-all rounded-md bg-white px-3 py-2 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">
                      {issuedCard.token}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-white p-3 text-[12px]">
                    {[
                      { l: "Public ID", v: issuedCard.profile.publicId },
                      { l: "Status", v: issuedCard.profile.isActive ? "Active" : "Inactive" },
                      { l: "Issued", v: formatDate(issuedCard.profile.issuedAt, "MMM dd, yyyy h:mm a") },
                      { l: "Role", v: issuedCard.profile.user?.role ?? "—" },
                    ].map((row) => (
                      <div key={row.l} className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-b-0">
                        <span className="text-slate-400">{row.l}</span>
                        <span className="font-semibold text-slate-900">{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dialog actions */}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  {(issuedStudentCardData || issuedTeacherCardData) && (
                    <Button variant="outline" size="sm" onClick={handlePrint}>
                      <Printer className="mr-1.5 h-3.5 w-3.5" /> Print ID card
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy token
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
