import { Layout } from "@/components/layout";
import {
  TeacherIdCardPreview,
  buildTeacherIdCardPrintHtml,
  resolveTeacherPortraitUrl,
  type TeacherIdCardData,
  useTeacherPortraitUrl,
} from "@/components/qr-teacher-id-card";
import { getContactLine } from "@/components/qr-student-id-card";
import { useUser } from "@/hooks/use-auth";
import { useMyQrCard } from "@/hooks/use-qr-attendance";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { buildQrImageUrl, copyToClipboard } from "@/lib/qr";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { api } from "@shared/routes";
import {
  BadgeCheck, CalendarDays, CheckCircle2,
  Copy, CreditCard, Loader2,
  Printer, QrCode, ShieldCheck, User, XCircle,
} from "lucide-react";
import { z } from "zod";

/* ─── types ──────────────────────────────────────────────────────── */
type MyQrCardData = NonNullable<z.infer<(typeof api.qrAttendance.myCard.responses)[200]>["data"]>;
type QrHistoryEvent = MyQrCardData["recentEvents"][number];

/* ─── component ──────────────────────────────────────────────────── */
export default function TeacherQrCard() {
  const { toast } = useToast();
  const { data: user } = useUser();
  const { data: publicSettings } = usePublicSchoolSettings();
  const { data, isLoading } = useMyQrCard();

  /* ── derived data ── */
  const teacher = data?.profile.user ?? user;
  const schoolName = publicSettings?.schoolInformation.schoolName ?? "School Nexus Academy";
  const shortName = publicSettings?.schoolInformation.shortName || schoolName;
  const motto = publicSettings?.schoolInformation.motto?.trim() || "Professional excellence through trusted learning leadership.";
  const academicYear = publicSettings?.academicConfiguration.currentAcademicYear ?? "Current Academic Year";
  const currentTerm = publicSettings?.academicConfiguration.currentTerm ?? "Current Term";
  const teacherName = teacher?.name ?? "Teacher";
  const designation = teacher?.designation?.trim() || "Faculty Member";
  const department = teacher?.department?.trim() || teacher?.subject?.trim() || "Academic Affairs";
  const subject = teacher?.subject?.trim() || "General Studies";
  const employeeId = teacher?.employeeId?.trim() || (data ? data.profile.publicId.toUpperCase() : "Not assigned");
  const qrImageUrl = data ? buildQrImageUrl(data.token, 320) : "";
  const portraitUrl = useTeacherPortraitUrl(teacher?.teacherPhotoUrl ?? null);
  const contactLine = getContactLine(publicSettings);
  const authenticityLine = contactLine
    ? `Official ${shortName} staff credential • ${contactLine}`
    : `Official ${shortName} staff credential • Valid only when scanned through QR Attendance`;
  const recentEvents = data?.recentEvents ?? [];

  const teacherCardData: TeacherIdCardData | null = data
    ? {
      schoolName, shortName, motto,
      logoUrl: publicSettings?.branding.logoUrl || undefined,
      teacherName, designation, department, subject, employeeId,
      publicId: data.profile.publicId,
      qrUrl: qrImageUrl,
      portraitUrl, isActive: data.profile.isActive,
      academicYear, currentTerm, authenticityLine,
    }
    : null;

  /* ── actions ── */
  const handleCopy = async () => {
    if (!data?.token) return;
    try {
      await copyToClipboard(data.token);
      toast({ title: "Token copied", description: "QR fallback token copied to clipboard." });
    } catch (error) {
      toast({ title: "Copy failed", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handlePrint = async () => {
    if (!data || typeof window === "undefined") return;
    const printWindow = window.open("", "_blank", "width=1100,height=1500");
    if (!printWindow) {
      toast({ title: "Pop-up blocked", description: "Allow pop-ups for this site and try again.", variant: "destructive" });
      return;
    }
    try {
      const printCard = {
        ...teacherCardData!,
        portraitUrl: await resolveTeacherPortraitUrl(teacherCardData?.portraitUrl ?? teacher?.teacherPhotoUrl ?? null),
      };
      printWindow.document.open();
      printWindow.document.write(buildTeacherIdCardPrintHtml(printCard));
      printWindow.document.close();
    } catch (error) {
      printWindow.close();
      toast({ title: "Print failed", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 print:bg-white">
        <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-5 print:hidden">

          {/* ── Hero banner ── */}
          <div className="relative overflow-hidden rounded-2xl bg-amber-500 px-5 py-5 text-white shadow-lg shadow-amber-100">
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
            <div className="absolute right-14 top-16 h-20 w-20 rounded-full bg-white/5" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                    <CreditCard className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-100">
                    Teacher Workspace
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight leading-tight">Teacher ID Card</h1>
                <p className="text-sm text-amber-100 font-medium">
                  Staff credential with QR attendance token &amp; print-ready layout
                </p>
              </div>
              {/* status pill */}
              {data && (
                <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5
                  ${data.profile.isActive
                    ? "bg-emerald-400/20 border-emerald-300/30"
                    : "bg-red-400/20 border-red-300/30"
                  }`}>
                  {data.profile.isActive
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                    : <XCircle className="h-4 w-4 text-red-200" />}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200">Card Status</p>
                    <p className="text-base font-black text-white leading-tight">
                      {data.profile.isActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* meta pills */}
            {data && (
              <div className="relative z-10 mt-4 flex flex-wrap gap-2">
                {[
                  { label: "Public ID", value: data.profile.publicId },
                  { label: "Issued", value: formatDate(data.profile.issuedAt, "MMM dd, yyyy") },
                  { label: "Last Used", value: data.profile.lastUsedAt ? formatDate(data.profile.lastUsedAt, "MMM dd, yyyy") : "Never" },
                  { label: "Recent Scans", value: recentEvents.length },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-white/15 border border-white/20 px-3 py-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-200">{s.label}</p>
                    <p className="text-xs font-black text-white leading-tight mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Main layout ── */}
          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">

            {/* ── Left: ID Card Preview ── */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 pt-5 pb-4 border-b border-slate-50">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
                  <QrCode className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">ID Card Preview</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Live data · print-ready layout</p>
                </div>
              </div>

              <div className="p-5">
                {isLoading || !data ? (
                  <div className="flex h-72 items-center justify-center rounded-2xl bg-slate-50 border border-slate-100">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
                      <p className="text-xs text-slate-400">Loading your ID card…</p>
                    </div>
                  </div>
                ) : (
                  <TeacherIdCardPreview card={teacherCardData!} />
                )}

                {/* action buttons */}
                {data && (
                  <div className="flex flex-col gap-2 mt-4 sm:flex-row">
                    <button onClick={handlePrint}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-200 hover:bg-amber-600 transition-colors">
                      <Printer className="h-3.5 w-3.5" /> Print ID Card
                    </button>
                    <button onClick={handleCopy}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
                      <Copy className="h-3.5 w-3.5" /> Copy Token
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right: Details + History ── */}
            <div className="space-y-5">

              {/* Card details */}
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 pt-5 pb-4 border-b border-slate-50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
                    <BadgeCheck className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Card Details</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Staff profile &amp; credential metadata</p>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {/* profile fields */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {[
                      { label: "Full Name", value: teacherName },
                      { label: "Designation", value: designation },
                      { label: "Department", value: department },
                      { label: "Subject", value: subject },
                      { label: "Employee ID", value: employeeId },
                      { label: "Public ID", value: data?.profile.publicId ?? "—" },
                    ].map(row => (
                      <div key={row.label}
                        className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{row.label}</p>
                        <p className="text-xs font-bold text-slate-800 mt-0.5 leading-tight truncate">{row.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* timeline */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { icon: CalendarDays, label: "Issued", value: data ? formatDate(data.profile.issuedAt, "MMM dd, yyyy · h:mm a") : "—" },
                      { icon: CalendarDays, label: "Last Used", value: data?.profile.lastUsedAt ? formatDate(data.profile.lastUsedAt, "MMM dd, yyyy · h:mm a") : "Not used yet" },
                    ].map(row => (
                      <div key={row.label}
                        className="flex items-start gap-2.5 rounded-2xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                          <row.icon className="h-3.5 w-3.5 text-amber-500" />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{row.label}</p>
                          <p className="text-[10px] font-bold text-slate-800 mt-0.5 leading-tight">{row.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* fallback token */}
                  {data && (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fallback Token</p>
                        <button onClick={handleCopy}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                          <Copy className="h-3 w-3" /> Copy
                        </button>
                      </div>
                      <p className="break-all font-mono text-[10px] text-slate-700 leading-relaxed">{data.token}</p>
                    </div>
                  )}

                  {/* security notice */}
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-emerald-700 leading-relaxed">
                      Your QR token is protected server-side. The visual card uses live staff data and falls back gracefully if any profile field is missing — scan reliability is never affected.
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent QR Activity */}
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-50">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
                      <QrCode className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Recent QR Activity</h2>
                      <p className="text-xs text-slate-400 mt-0.5">Latest attendance scan events</p>
                    </div>
                  </div>
                  {recentEvents.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                      {Math.min(recentEvents.length, 8)} records
                    </span>
                  )}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        {["Date & Time", "Direction", "Status", "Method"].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {recentEvents.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-10 text-center text-sm text-slate-400">
                            No QR attendance events yet.
                          </td>
                        </tr>
                      ) : (
                        recentEvents.slice(0, 8).map((event: QrHistoryEvent) => {
                          const isIn = event.direction === "Check In";
                          return (
                            <tr key={event.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="px-4 py-2.5 text-xs font-semibold text-slate-800">
                                {formatDate(event.scannedAt, "MMM dd, yyyy · h:mm a")}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold
                                  ${isIn
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-sky-50 text-sky-700 border-sky-200"
                                  }`}>
                                  {event.direction}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-slate-600">{event.status ?? "—"}</td>
                              <td className="px-4 py-2.5 text-xs capitalize text-slate-500">{event.scanMethod}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden p-4 space-y-2">
                  {recentEvents.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">No QR events yet.</p>
                  ) : (
                    recentEvents.slice(0, 8).map((event: QrHistoryEvent) => {
                      const isIn = event.direction === "Check In";
                      return (
                        <div key={event.id}
                          className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border
                            ${isIn ? "bg-emerald-50 border-emerald-200" : "bg-sky-50 border-sky-200"}`}>
                            <QrCode className={`h-4 w-4 ${isIn ? "text-emerald-500" : "text-sky-500"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {formatDate(event.scannedAt, "MMM dd · h:mm a")}
                              </p>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold
                                ${isIn
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-sky-50 text-sky-700 border-sky-200"
                                }`}>
                                {event.direction}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 capitalize">
                              {event.scanMethod} · {event.status ?? "—"}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
