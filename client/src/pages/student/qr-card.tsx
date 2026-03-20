import { Layout } from "@/components/layout";
import {
  StudentIdCardPreview, buildStudentIdCardPrintHtml,
  getContactLine, resolveStudentPortraitUrl,
  type StudentIdCardData, useStudentPortraitUrl,
} from "@/components/qr-student-id-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useUser } from "@/hooks/use-auth";
import { useMyQrCard } from "@/hooks/use-qr-attendance";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard, buildQrImageUrl } from "@/lib/qr";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { api } from "@shared/routes";
import { BadgeCheck, CheckCircle2, Copy, Loader2, Printer, QrCode, ShieldCheck, Clock } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";

type MyQrCardData = NonNullable<z.infer<(typeof api.qrAttendance.myCard.responses)[200]>["data"]>;
type QrHistoryEvent = MyQrCardData["recentEvents"][number];

export default function StudentQrCard() {
  const { toast } = useToast();
  const { data: user } = useUser();
  const { data: publicSettings } = usePublicSchoolSettings();
  const { data, isLoading } = useMyQrCard();

  // ── School & student meta ─────────────────────────────────────────────
  const student = data?.profile.user ?? user;
  const schoolName = publicSettings?.schoolInformation.schoolName ?? "School Nexus Academy";
  const shortName = publicSettings?.schoolInformation.shortName || schoolName;
  const motto = publicSettings?.schoolInformation.motto?.trim() || "Empowering every learner.";
  const academicYear = publicSettings?.academicConfiguration.currentAcademicYear ?? "Current Academic Year";
  const currentTerm = publicSettings?.academicConfiguration.currentTerm ?? "Current Term";
  const studentName = student?.name ?? "Student";
  const studentClass = student?.className?.trim() || "Unassigned";
  const fatherName = student?.fatherName?.trim() || "Not on file";
  const qrImageUrl = data ? buildQrImageUrl(data.token, 320) : "";
  const portraitUrl = useStudentPortraitUrl(student?.studentPhotoUrl ?? null);
  const contactLine = getContactLine(publicSettings);
  const authenticityLine = contactLine
    ? `Official ${shortName} credential • ${contactLine}`
    : `Official ${shortName} credential • Valid only when scanned through QR Attendance`;

  const recentEvents = data?.recentEvents ?? [];

  const studentCardData: StudentIdCardData | null = data
    ? {
      schoolName, shortName, motto,
      logoUrl: publicSettings?.branding.logoUrl || undefined,
      studentName, className: studentClass, fatherName,
      publicId: data.profile.publicId,
      qrUrl: qrImageUrl,
      portraitUrl,
      isActive: data.profile.isActive,
      academicYear, currentTerm, authenticityLine,
    }
    : null;

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!data?.token) return;
    try {
      await copyToClipboard(data.token);
      toast({ title: "Token copied", description: "Manual fallback token is on your clipboard." });
    } catch (error) {
      toast({ title: "Unable to copy", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handlePrint = async () => {
    if (!data || typeof window === "undefined") return;
    const pw = window.open("", "_blank", "width=1100,height=1500");
    if (!pw) { toast({ title: "Allow pop-ups to print", variant: "destructive" }); return; }
    try {
      const printCard = {
        ...studentCardData!,
        portraitUrl: await resolveStudentPortraitUrl(studentCardData?.portraitUrl ?? student?.studentPhotoUrl ?? null),
      };
      pw.document.open(); pw.document.write(buildStudentIdCardPrintHtml(printCard)); pw.document.close();
    } catch (error) {
      pw.close();
      toast({ title: "Print failed", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-4 pb-8">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">My QR ID Card</h1>
              <p className="text-[12px] text-slate-400">Digital identity card ready for QR attendance scanning.</p>
            </div>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!data}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />Copy token
            </Button>
            <Button size="sm" onClick={handlePrint} disabled={!data}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />Print card
            </Button>
          </div>
        </section>

        {/* ── Main grid ───────────────────────────────────────────────── */}
        <div className="grid gap-4 xl:grid-cols-[400px_1fr]">

          {/* ── Left: ID card preview ──────────────────────────────────── */}
          <Card className="border-slate-200/80 bg-white shadow-none">
            <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                <QrCode className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">ID Card Preview</CardTitle>
                <CardDescription className="text-[11px]">Live QR token with your school branding and profile.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {isLoading || !data ? (
                <div className="flex min-h-[320px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                </div>
              ) : (
                <StudentIdCardPreview card={studentCardData!} />
              )}
            </CardContent>
          </Card>

          {/* ── Right: details + activity ──────────────────────────────── */}
          <div className="space-y-4">

            {/* Card details */}
            <Card className="border-slate-200/80 bg-white shadow-none">
              <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Card Details</CardTitle>
                  <CardDescription className="text-[11px]">Credential info and manual fallback token.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Card ID", value: data?.profile.publicId ?? "—" },
                    {
                      label: "Status",
                      value: data?.profile.isActive ? "Active" : data ? "Inactive" : "—",
                      valueClass: data?.profile.isActive ? "text-emerald-700" : "text-rose-600",
                    },
                    { label: "Issued", value: data ? formatDate(data.profile.issuedAt, "MMM dd, yyyy") : "—" },
                    { label: "Last used", value: data?.profile.lastUsedAt ? formatDate(data.profile.lastUsedAt, "MMM dd, yyyy") : "Not used yet" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{item.label}</p>
                      <p className={cn("mt-0.5 text-[13px] font-semibold text-slate-900", item.valueClass)}>
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Active status badge */}
                {data && (
                  <div className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5",
                    data.profile.isActive
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-rose-200 bg-rose-50",
                  )}>
                    <CheckCircle2 className={cn("h-4 w-4 shrink-0", data.profile.isActive ? "text-emerald-600" : "text-rose-500")} />
                    <p className={cn("text-[12px] font-semibold", data.profile.isActive ? "text-emerald-800" : "text-rose-700")}>
                      {data.profile.isActive
                        ? "Card is active and ready for QR scanning."
                        : "Card is inactive. Contact admin to re-activate."}
                    </p>
                  </div>
                )}

                {/* Token */}
                {data && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">Manual fallback token</p>
                    <div className="flex items-center gap-2">
                      <p className="flex-1 break-all rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-700">
                        {data.token}
                      </p>
                      <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-lg" onClick={handleCopy}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Security note */}
                <div className="flex items-start gap-2.5 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                  <p className="text-[11px] text-indigo-800 leading-snug">
                    Your QR token is protected server-side. Missing profile details fall back gracefully without affecting scan reliability.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Recent QR activity */}
            <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
              <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Recent QR Activity</CardTitle>
                  <CardDescription className="text-[11px]">
                    {recentEvents.length > 0 ? `${recentEvents.length} scan event${recentEvents.length !== 1 ? "s" : ""}` : "No scans yet"}
                  </CardDescription>
                </div>
              </CardHeader>
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {["Date & Time", "Direction", "Status", "Method"].map((h, i) => (
                        <th key={i} className={cn(
                          "px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400",
                          i === 0 && "pl-4 text-left", i > 0 && "text-left",
                        )}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentEvents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-[13px] text-slate-400">
                          No QR attendance events yet.
                        </td>
                      </tr>
                    ) : (
                      recentEvents.slice(0, 8).map((event: QrHistoryEvent, idx: number) => (
                        <tr key={event.id} className={cn(
                          "border-b border-slate-100 last:border-b-0 transition-colors hover:bg-slate-50/60",
                          idx % 2 === 1 && "bg-slate-50/30",
                        )}>
                          <td className="py-2.5 pl-4 pr-3 text-[12px] font-semibold text-slate-900">
                            {formatDate(event.scannedAt, "MMM dd, yyyy")}
                            <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                              {formatDate(event.scannedAt, "h:mm a")}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn(
                              "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                              event.direction === "in"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-indigo-200 bg-indigo-50 text-indigo-700",
                            )}>
                              {event.direction}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-slate-600">{event.status ?? "—"}</td>
                          <td className="px-3 py-2.5 text-[12px] capitalize text-slate-500">{event.scanMethod}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
