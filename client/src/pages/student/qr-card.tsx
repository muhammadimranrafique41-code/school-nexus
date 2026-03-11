import { Layout } from "@/components/layout";
import { StudentIdCardPreview, buildStudentIdCardPrintHtml, getContactLine, resolveStudentPortraitUrl, type StudentIdCardData, useStudentPortraitUrl } from "@/components/qr-student-id-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUser } from "@/hooks/use-auth";
import { useMyQrCard } from "@/hooks/use-qr-attendance";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard, buildQrImageUrl } from "@/lib/qr";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { api } from "@shared/routes";
import { BadgeCheck, Copy, Loader2, Printer, QrCode, ShieldCheck } from "lucide-react";
import { z } from "zod";

type MyQrCardData = NonNullable<z.infer<(typeof api.qrAttendance.myCard.responses)[200]>["data"]>;
type QrHistoryEvent = MyQrCardData["recentEvents"][number];

export default function StudentQrCard() {
  const { toast } = useToast();
  const { data: user } = useUser();
  const { data: publicSettings } = usePublicSchoolSettings();
  const { data, isLoading } = useMyQrCard();

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
      schoolName,
      shortName,
      motto,
      logoUrl: publicSettings?.branding.logoUrl || undefined,
      studentName,
      className: studentClass,
      fatherName,
      publicId: data.profile.publicId,
      qrUrl: qrImageUrl,
      portraitUrl,
      isActive: data.profile.isActive,
      academicYear,
      currentTerm,
      authenticityLine,
    }
    : null;

  const handleCopy = async () => {
    if (!data?.token) return;
    try {
      await copyToClipboard(data.token);
      toast({ title: "QR token copied", description: "A manual fallback token has been copied to your clipboard." });
    } catch (error) {
      toast({ title: "Unable to copy token", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handlePrint = async () => {
    if (!data || typeof window === "undefined") return;

    const printWindow = window.open("", "_blank", "width=1100,height=1500");
    if (!printWindow) {
      toast({
        title: "Unable to open print view",
        description: "Please allow pop-ups for this site and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      const printCard = {
        ...studentCardData!,
        portraitUrl: await resolveStudentPortraitUrl(studentCardData?.portraitUrl ?? student?.studentPhotoUrl ?? null),
      };
      printWindow.document.open();
      printWindow.document.write(buildStudentIdCardPrintHtml(printCard));
      printWindow.document.close();
    } catch (error) {
      printWindow.close();
      toast({ title: "Unable to print ID card", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <div className="print:hidden">
          <h1 className="text-3xl font-display font-bold">Student ID Card</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Your School Nexus identity card is optimized for both digital presentation and compact printing, while keeping the
            QR attendance credential ready for fast authorized scanning.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,430px)_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Premium ID preview</CardTitle>
              <CardDescription>
                A polished student credential using your live QR attendance token, school branding, and current profile details.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading || !data ? (
                <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>
              ) : (
                <StudentIdCardPreview card={studentCardData!} />
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BadgeCheck className="h-5 w-5" /> Card access & print</CardTitle>
                <CardDescription>
                  Keep the print layout clean while preserving the manual fallback token outside the visible card design.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button className="sm:flex-1" onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print ID card</Button>
                  <Button variant="outline" className="sm:flex-1" onClick={handleCopy}><Copy className="mr-2 h-4 w-4" /> Copy fallback token</Button>
                </div>

                {data ? (
                  <div className="rounded-[1.4rem] border bg-slate-50/90 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Manual fallback token</p>
                    <p className="mt-3 break-all rounded-2xl bg-white px-4 py-3 font-mono text-sm text-slate-900 shadow-sm">{data.token}</p>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[1.25rem] border bg-white p-4">
                    <p className="text-sm text-slate-500">Card ID</p>
                    <p className="mt-2 font-semibold text-slate-900">{data?.profile.publicId ?? "—"}</p>
                  </div>
                  <div className="rounded-[1.25rem] border bg-white p-4">
                    <p className="text-sm text-slate-500">Status</p>
                    <p className="mt-2 font-semibold text-slate-900">{data?.profile.isActive ? "Active" : data ? "Inactive" : "—"}</p>
                  </div>
                  <div className="rounded-[1.25rem] border bg-white p-4">
                    <p className="text-sm text-slate-500">Issued</p>
                    <p className="mt-2 font-semibold text-slate-900">{data ? formatDate(data.profile.issuedAt, "MMM dd, yyyy h:mm a") : "—"}</p>
                  </div>
                  <div className="rounded-[1.25rem] border bg-white p-4">
                    <p className="text-sm text-slate-500">Last used</p>
                    <p className="mt-2 font-semibold text-slate-900">{data?.profile.lastUsedAt ? formatDate(data.profile.lastUsedAt, "MMM dd, yyyy h:mm a") : "Not used yet"}</p>
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      Your QR token remains protected server-side, while the visual card keeps a premium print-safe layout with live identity
                      data when available. Any missing student profile details still fall back gracefully without affecting scan reliability.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent QR activity</CardTitle>
                <CardDescription>Your latest attendance scans remain available beneath the premium card design.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Date</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Method</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentEvents.slice(0, 8).map((event: QrHistoryEvent) => (
                      <TableRow key={event.id}>
                        <TableCell className="pl-6 font-medium">{formatDate(event.scannedAt, "MMM dd, yyyy h:mm a")}</TableCell>
                        <TableCell>{event.direction}</TableCell>
                        <TableCell>{event.status ?? "—"}</TableCell>
                        <TableCell className="capitalize">{event.scanMethod}</TableCell>
                      </TableRow>
                    ))}
                    {recentEvents.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No QR attendance events yet.</TableCell></TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
