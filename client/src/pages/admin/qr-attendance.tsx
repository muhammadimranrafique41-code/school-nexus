import { useMemo, useState } from "react";
import { StudentIdCardPreview, buildStudentIdCardPrintHtml, getContactLine, type StudentIdCardData } from "@/components/qr-student-id-card";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useIssueQrProfile,
  useQrProfiles,
  useRegenerateQrProfile,
  useUpdateQrProfileStatus,
} from "@/hooks/use-qr-attendance";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { buildQrImageUrl, copyToClipboard } from "@/lib/qr";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { api } from "@shared/routes";
import { Copy, Loader2, Printer, QrCode, RefreshCw } from "lucide-react";
import { z } from "zod";

type QrProfilesPayload = NonNullable<z.infer<(typeof api.qrAttendance.profiles.list.responses)[200]>["data"]>;
type QrRosterItem = QrProfilesPayload["roster"][number];
type QrIssuedCard = NonNullable<z.infer<(typeof api.qrAttendance.profiles.issue.responses)[200]>["data"]>;

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
    const query = search.trim().toLowerCase();
    if (!query) return roster;
    return roster.filter((item: QrRosterItem) => {
      const details = `${item.user.name} ${item.user.email} ${item.user.role} ${item.user.className ?? ""} ${item.user.subject ?? ""} ${item.user.fatherName ?? ""}`.toLowerCase();
      return details.includes(query);
    });
  }, [roster, search]);

  const schoolName = publicSettings?.schoolInformation.schoolName ?? "School Nexus Academy";
  const shortName = publicSettings?.schoolInformation.shortName || schoolName;
  const motto = publicSettings?.schoolInformation.motto?.trim() || "Empowering every learner.";
  const academicYear = publicSettings?.academicConfiguration.currentAcademicYear ?? "Current Academic Year";
  const currentTerm = publicSettings?.academicConfiguration.currentTerm ?? "Current Term";
  const contactLine = getContactLine(publicSettings);
  const authenticityLine = contactLine
    ? `Official ${shortName} credential • ${contactLine}`
    : `Official ${shortName} credential • Valid only when scanned through QR Attendance`;
  const issuedStudentCardData: StudentIdCardData | null = issuedCard?.profile.user?.role === "student"
    ? {
      schoolName,
      shortName,
      motto,
      logoUrl: publicSettings?.branding.logoUrl || undefined,
      studentName: issuedCard.profile.user.name,
      className: issuedCard.profile.user.className?.trim() || "Unassigned",
      fatherName: issuedCard.profile.user.fatherName?.trim() || "Not on file",
      publicId: issuedCard.profile.publicId,
      qrUrl: buildQrImageUrl(issuedCard.token, 320),
      portraitUrl: issuedCard.profile.user.studentPhotoUrl?.trim() || null,
      isActive: issuedCard.profile.isActive,
      academicYear,
      currentTerm,
      authenticityLine,
    }
    : null;

  const handleIssue = async (userId: number) => {
    try {
      const result = await issueProfile.mutateAsync(userId);
      setIssuedCard(result.data);
      toast({ title: "QR card issued", description: result.message || "QR credentials are ready for distribution." });
    } catch (error) {
      toast({ title: "Unable to issue QR card", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handleRegenerate = async (userId: number) => {
    try {
      const result = await regenerateProfile.mutateAsync(userId);
      setIssuedCard(result.data);
      toast({ title: "QR card regenerated", description: result.message || "The previous QR token has been rotated." });
    } catch (error) {
      toast({ title: "Unable to regenerate QR card", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handleStatusChange = async (userId: number, isActive: boolean) => {
    try {
      const result = await updateStatus.mutateAsync({ userId, isActive });
      toast({ title: "QR status updated", description: result.message || `${result.data.profile.user?.name ?? "User"} is now ${isActive ? "active" : "inactive"}.` });
    } catch (error) {
      toast({ title: "Unable to update status", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handleCopy = async () => {
    if (!issuedCard) return;
    try {
      await copyToClipboard(issuedCard.token);
      toast({ title: "QR token copied", description: "The manual fallback token is now on your clipboard." });
    } catch (error) {
      toast({ title: "Unable to copy token", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handlePrint = () => {
    if (!issuedStudentCardData || typeof window === "undefined") return;

    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      toast({ title: "Unable to open print view", description: "Please allow pop-ups for this site and try again.", variant: "destructive" });
      return;
    }

    try {
      printWindow.document.open();
      printWindow.document.write(buildStudentIdCardPrintHtml(issuedStudentCardData));
      printWindow.document.close();
    } catch (error) {
      printWindow.close();
      toast({ title: "Unable to print ID card", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">QR Attendance Management</h1>
          <p className="mt-1 text-muted-foreground">Issue, rotate, activate, and review attendance QR identities for students and teachers without disrupting the existing attendance module.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {[
            { label: "Eligible users", value: summary?.eligibleUsers ?? 0 },
            { label: "Issued", value: summary?.issuedProfiles ?? 0 },
            { label: "Active", value: summary?.activeProfiles ?? 0 },
            { label: "Scans today", value: summary?.scansToday ?? 0 },
            { label: "Students", value: summary?.studentProfiles ?? 0 },
            { label: "Teachers", value: summary?.teacherProfiles ?? 0 },
          ].map((item) => (
            <Card key={item.label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{item.label}</p><p className="mt-2 text-3xl font-display font-bold">{item.value}</p></CardContent></Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Roster</CardTitle>
            <CardDescription>Cards are eligible only for teachers and students. Search the roster, issue a first-time card, or rotate a token when a credential must be replaced.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, role, class, subject, or father name" />
            <div className="overflow-x-auto rounded-[1.5rem] border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Card</TableHead>
                    <TableHead>Today</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-violet-600" /></TableCell></TableRow>
                  ) : filteredRoster.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">No eligible users matched your search.</TableCell></TableRow>
                  ) : (
                    filteredRoster.map((item: QrRosterItem) => (
                      <TableRow key={item.user.id}>
                        <TableCell className="pl-6">
                          <div>
                            <p className="font-semibold text-slate-900">{item.user.name}</p>
                            <p className="text-sm text-slate-500">{item.user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{item.user.role}</Badge></TableCell>
                        <TableCell className="text-slate-500">
                          {item.user.role === "student"
                            ? [item.user.className, item.user.fatherName].filter(Boolean).join(" • ") || "—"
                            : item.user.subject || "—"}
                        </TableCell>
                        <TableCell>
                          {item.profile ? (
                            <div className="text-sm">
                              <p className="font-medium text-slate-900">{item.profile.publicId}</p>
                              <p className="text-slate-500">Issued {formatDate(item.profile.issuedAt, "MMM dd, yyyy")}</p>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">Not issued</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {item.todayDirections.length === 0 ? <Badge variant="outline">No scans</Badge> : item.todayDirections.map((direction: QrRosterItem["todayDirections"][number]) => <Badge key={direction} variant="secondary">{direction}</Badge>)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={item.profile?.isActive ?? false}
                            disabled={!item.profile || updateStatus.isPending}
                            onCheckedChange={(checked) => void handleStatusChange(item.user.id, checked)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => void handleIssue(item.user.id)} disabled={issueProfile.isPending || regenerateProfile.isPending}>
                              <QrCode className="mr-1.5 h-3.5 w-3.5" /> {item.profile ? "View" : "Issue"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void handleRegenerate(item.user.id)} disabled={!item.profile || issueProfile.isPending || regenerateProfile.isPending}>
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Rotate
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={!!issuedCard} onOpenChange={(open) => !open && setIssuedCard(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Issued QR credential</DialogTitle>
            </DialogHeader>
            {issuedCard ? (
              <div className="space-y-5">
                {issuedStudentCardData ? (
                  <StudentIdCardPreview card={issuedStudentCardData} />
                ) : (
                  <div className="space-y-4 text-center">
                    <img src={buildQrImageUrl(issuedCard.token)} alt="Issued QR credential" className="mx-auto aspect-square w-full max-w-[280px] rounded-2xl border bg-white p-3" />
                    <div>
                      <p className="font-semibold text-slate-900">{issuedCard.profile.user?.name ?? `User #${issuedCard.profile.userId}`}</p>
                      <p className="text-sm text-slate-500">Public ID: {issuedCard.profile.publicId}</p>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[1.25rem] border bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Manual fallback token</p>
                    <p className="mt-3 break-all rounded-2xl bg-white px-4 py-3 font-mono text-xs text-slate-700 shadow-sm">{issuedCard.token}</p>
                  </div>
                  <div className="rounded-[1.25rem] border bg-white p-4 text-sm text-slate-600">
                    <p><span className="font-semibold text-slate-900">Public ID:</span> {issuedCard.profile.publicId}</p>
                    <p className="mt-2"><span className="font-semibold text-slate-900">Status:</span> {issuedCard.profile.isActive ? "Active" : "Inactive"}</p>
                    <p className="mt-2"><span className="font-semibold text-slate-900">Issued:</span> {formatDate(issuedCard.profile.issuedAt, "MMM dd, yyyy h:mm a")}</p>
                    <p className="mt-2"><span className="font-semibold text-slate-900">Role:</span> {issuedCard.profile.user?.role ?? "—"}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  {issuedStudentCardData ? (
                    <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print ID card</Button>
                  ) : null}
                  <Button variant="outline" onClick={handleCopy}><Copy className="mr-2 h-4 w-4" /> Copy token</Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
