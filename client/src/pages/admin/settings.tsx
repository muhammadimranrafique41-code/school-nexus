import { useEffect, useMemo, useState, type ReactNode } from "react"
import { cloneSchoolSettingsData, schoolSettingsCategoryLabels, type SchoolSettingsData } from "@shared/settings"
import { Layout } from "@/components/layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { exportSchoolSettings, parseImportedSchoolSettings, useAdminSchoolSettings, useImportSchoolSettings, useRestoreSchoolSettings, useUpdateSchoolSettings } from "@/hooks/use-settings"
import { cn, formatDate, getErrorMessage } from "@/lib/utils"
import { BellRing, Building2, Download, FileJson, History, Loader2, Palette, RotateCcw, Save, Settings2, ShieldCheck, SlidersHorizontal, Upload } from "lucide-react"

type SettingsTab = keyof SchoolSettingsData

const settingsTabs: Array<{ key: SettingsTab; label: string; icon: typeof Building2 }> = [
  { key: "schoolInformation", label: schoolSettingsCategoryLabels.schoolInformation, icon: Building2 },
  { key: "academicConfiguration", label: schoolSettingsCategoryLabels.academicConfiguration, icon: SlidersHorizontal },
  { key: "financialSettings", label: schoolSettingsCategoryLabels.financialSettings, icon: FileJson },
  { key: "branding", label: schoolSettingsCategoryLabels.branding, icon: Palette },
  { key: "systemPreferences", label: schoolSettingsCategoryLabels.systemPreferences, icon: Settings2 },
  { key: "documentTemplates", label: schoolSettingsCategoryLabels.documentTemplates, icon: ShieldCheck },
  { key: "notificationSettings", label: schoolSettingsCategoryLabels.notificationSettings, icon: BellRing },
]

function FieldShell({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

function ToggleField({ label, hint, checked, onCheckedChange }: { label: string; hint: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm shadow-slate-200/50">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export default function AdminSettings() {
  const { toast } = useToast()
  const { data, isLoading } = useAdminSchoolSettings()
  const updateMutation = useUpdateSchoolSettings()
  const importMutation = useImportSchoolSettings()
  const restoreMutation = useRestoreSchoolSettings()

  const [draft, setDraft] = useState<SchoolSettingsData | null>(null)
  const [changeSummary, setChangeSummary] = useState("")
  const [importOpen, setImportOpen] = useState(false)
  const [importValue, setImportValue] = useState("")
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>("schoolInformation")

  useEffect(() => {
    if (!data) return
    setDraft(cloneSchoolSettingsData(data.settings.data))
  }, [data?.settings.updatedAt])

  const isDirty = useMemo(() => {
    if (!draft || !data) return false
    return JSON.stringify(draft) !== JSON.stringify(data.settings.data)
  }, [data, draft])

  const patchSection = <K extends keyof SchoolSettingsData>(section: K, patch: Partial<SchoolSettingsData[K]>) => {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        [section]: {
          ...current[section],
          ...patch,
        },
      }
    })
  }

  const updateListField = (
    section: "academicConfiguration",
    field: "academicLevels" | "gradingScale",
    value: string,
  ) => {
    patchSection(section, {
      [field]: value.split(",").map((item) => item.trim()).filter(Boolean),
    } as Partial<SchoolSettingsData["academicConfiguration"]>)
  }

  const saveSettings = () => {
    if (!draft) return

    updateMutation.mutate(
      { data: draft, changeSummary: changeSummary || undefined },
      {
        onSuccess: () => {
          setChangeSummary("")
          toast({ title: "Settings saved", description: "School configuration was updated successfully." })
        },
        onError: (error) => {
          toast({ variant: "destructive", title: "Save failed", description: getErrorMessage(error) })
        },
      },
    )
  }

  const handleExport = async () => {
    try {
      const payload = await exportSchoolSettings()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `school-settings-v${payload.version}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast({ title: "Export ready", description: `Downloaded version ${payload.version} settings backup.` })
    } catch (error) {
      toast({ variant: "destructive", title: "Export failed", description: getErrorMessage(error) })
    }
  }

  const handleImport = () => {
    try {
      const parsed = parseImportedSchoolSettings(importValue)
      importMutation.mutate(
        { data: parsed, changeSummary: changeSummary || "Imported school settings backup" },
        {
          onSuccess: () => {
            setImportOpen(false)
            setImportValue("")
            setChangeSummary("")
            toast({ title: "Settings imported", description: "The backup has been applied and versioned." })
          },
          onError: (error) => {
            toast({ variant: "destructive", title: "Import failed", description: getErrorMessage(error) })
          },
        },
      )
    } catch (error) {
      toast({ variant: "destructive", title: "Invalid backup", description: getErrorMessage(error, "Upload a valid settings export JSON file.") })
    }
  }

  const handleRestore = (version: number) => {
    restoreMutation.mutate(
      { version, changeSummary: changeSummary || `Restored settings version ${version}` },
      {
        onSuccess: () => {
          setRestoreTarget(null)
          setChangeSummary("")
          toast({ title: "Version restored", description: `Settings version ${version} is now active.` })
        },
        onError: (error) => {
          toast({ variant: "destructive", title: "Restore failed", description: getErrorMessage(error) })
        },
      },
    )
  }

  if (isLoading || !draft || !data) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center rounded-[2rem] border border-white/60 bg-white/80 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur-xl">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/80 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.4)] backdrop-blur-xl">
          <div className="bg-gradient-to-r from-slate-950 via-violet-950 to-fuchsia-950 px-6 py-8 text-white md:px-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-100">
                  <Settings2 className="h-3.5 w-3.5" /> Admin configuration center
                </div>
                <h1 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">School Settings & Configuration</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                  Customize branding, academic structure, finance defaults, document templates, and notification behavior from one premium admin-only workspace.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Active version</p>
                  <p className="mt-1 text-2xl font-bold">v{data.settings.version}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Completion</p>
                  <p className="mt-1 text-2xl font-bold">{data.settings.completionPercentage}%</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Last updated</p>
                  <p className="mt-1 text-sm font-semibold">{formatDate(data.settings.updatedAt, "MMM dd, yyyy")}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-slate-200/70 px-6 py-5 md:px-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">Change summary</p>
              <p className="mt-1 text-xs text-slate-500">Every save, import, and restore is versioned and written to the audit log.</p>
            </div>
            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[36rem] xl:flex-row">
              <Input value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} placeholder="Describe what changed for the audit trail" className="xl:flex-1" />
              <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4" /> Export</Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import</Button>
              <Button onClick={saveSettings} disabled={!isDirty || updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_380px]">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTab)} className="space-y-6">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-[1.5rem] border border-white/60 bg-white/70 p-2 md:grid-cols-4 xl:grid-cols-7">
              {settingsTabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <TabsTrigger key={tab.key} value={tab.key} className="justify-start rounded-[1rem] px-3 py-3 text-left data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-fuchsia-600 data-[state=active]:text-white data-[state=active]:shadow-lg">
                    <Icon className="mr-2 h-4 w-4" />
                    <span className="truncate text-xs font-semibold md:text-sm">{tab.label}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>

            <TabsContent value="schoolInformation">
              <Card className="border-white/60 bg-white/80 shadow-lg shadow-slate-200/50">
                <CardHeader><CardTitle>School information</CardTitle><CardDescription>Core identity used in headers, reports, certificates, and contact surfaces.</CardDescription></CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                  <FieldShell label="School name"><Input value={draft.schoolInformation.schoolName} onChange={(e) => patchSection("schoolInformation", { schoolName: e.target.value })} /></FieldShell>
                  <FieldShell label="Short name"><Input value={draft.schoolInformation.shortName} onChange={(e) => patchSection("schoolInformation", { shortName: e.target.value })} /></FieldShell>
                  <FieldShell label="School code"><Input value={draft.schoolInformation.schoolCode} onChange={(e) => patchSection("schoolInformation", { schoolCode: e.target.value })} /></FieldShell>
                  <FieldShell label="Principal name"><Input value={draft.schoolInformation.principalName} onChange={(e) => patchSection("schoolInformation", { principalName: e.target.value })} /></FieldShell>
                  <FieldShell label="School email"><Input value={draft.schoolInformation.schoolEmail} onChange={(e) => patchSection("schoolInformation", { schoolEmail: e.target.value })} /></FieldShell>
                  <FieldShell label="School phone"><Input value={draft.schoolInformation.schoolPhone} onChange={(e) => patchSection("schoolInformation", { schoolPhone: e.target.value })} /></FieldShell>
                  <FieldShell label="Website URL"><Input value={draft.schoolInformation.websiteUrl} onChange={(e) => patchSection("schoolInformation", { websiteUrl: e.target.value })} /></FieldShell>
                  <FieldShell label="Motto"><Input value={draft.schoolInformation.motto} onChange={(e) => patchSection("schoolInformation", { motto: e.target.value })} /></FieldShell>
                  <div className="md:col-span-2"><FieldShell label="School address"><Textarea value={draft.schoolInformation.schoolAddress} onChange={(e) => patchSection("schoolInformation", { schoolAddress: e.target.value })} rows={4} /></FieldShell></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="academicConfiguration">
              <Card className="border-white/60 bg-white/80 shadow-lg shadow-slate-200/50">
                <CardHeader><CardTitle>Academic configuration</CardTitle><CardDescription>Define the active academic cycle, grading structure, and instructional setup.</CardDescription></CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                  <FieldShell label="Current academic year"><Input value={draft.academicConfiguration.currentAcademicYear} onChange={(e) => patchSection("academicConfiguration", { currentAcademicYear: e.target.value })} /></FieldShell>
                  <FieldShell label="Current term"><Input value={draft.academicConfiguration.currentTerm} onChange={(e) => patchSection("academicConfiguration", { currentTerm: e.target.value })} /></FieldShell>
                  <FieldShell label="Week starts on"><Select value={draft.academicConfiguration.weekStartsOn} onValueChange={(value) => patchSection("academicConfiguration", { weekStartsOn: value as SchoolSettingsData["academicConfiguration"]["weekStartsOn"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Monday">Monday</SelectItem><SelectItem value="Sunday">Sunday</SelectItem><SelectItem value="Saturday">Saturday</SelectItem></SelectContent></Select></FieldShell>
                  <FieldShell label="Periods per day"><Input type="number" min={1} max={12} value={draft.academicConfiguration.periodsPerDay} onChange={(e) => patchSection("academicConfiguration", { periodsPerDay: Number(e.target.value) || 1 })} /></FieldShell>
                  <FieldShell label="Passing score (%)"><Input type="number" min={0} max={100} value={draft.academicConfiguration.passingScore} onChange={(e) => patchSection("academicConfiguration", { passingScore: Number(e.target.value) || 0 })} /></FieldShell>
                  <div className="md:col-span-2 grid gap-6 md:grid-cols-2">
                    <FieldShell label="Academic levels" hint="Comma-separated values"><Textarea value={draft.academicConfiguration.academicLevels.join(", ")} onChange={(e) => updateListField("academicConfiguration", "academicLevels", e.target.value)} rows={4} /></FieldShell>
                    <FieldShell label="Grading scale" hint="Comma-separated values"><Textarea value={draft.academicConfiguration.gradingScale.join(", ")} onChange={(e) => updateListField("academicConfiguration", "gradingScale", e.target.value)} rows={4} /></FieldShell>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="financialSettings">
              <Card className="border-white/60 bg-white/80 shadow-lg shadow-slate-200/50">
                <CardHeader><CardTitle>Financial settings</CardTitle><CardDescription>Configure currency, locale, invoice numbering, and payment defaults used across finance screens.</CardDescription></CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                  <FieldShell label="Currency code"><Input value={draft.financialSettings.currencyCode} onChange={(e) => patchSection("financialSettings", { currencyCode: e.target.value.toUpperCase() })} /></FieldShell>
                  <FieldShell label="Currency symbol"><Input value={draft.financialSettings.currencySymbol} onChange={(e) => patchSection("financialSettings", { currencySymbol: e.target.value })} /></FieldShell>
                  <FieldShell label="Locale"><Input value={draft.financialSettings.locale} onChange={(e) => patchSection("financialSettings", { locale: e.target.value })} /></FieldShell>
                  <FieldShell label="Timezone"><Input value={draft.financialSettings.timezone} onChange={(e) => patchSection("financialSettings", { timezone: e.target.value })} /></FieldShell>
                  <FieldShell label="Date format"><Select value={draft.financialSettings.dateFormat} onValueChange={(value) => patchSection("financialSettings", { dateFormat: value as SchoolSettingsData["financialSettings"]["dateFormat"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PPP">PPP</SelectItem><SelectItem value="MMMM dd, yyyy">MMMM dd, yyyy</SelectItem><SelectItem value="dd/MM/yyyy">dd/MM/yyyy</SelectItem><SelectItem value="MM/dd/yyyy">MM/dd/yyyy</SelectItem><SelectItem value="yyyy-MM-dd">yyyy-MM-dd</SelectItem></SelectContent></Select></FieldShell>
                  <FieldShell label="Late fee percentage"><Input type="number" min={0} max={100} value={draft.financialSettings.lateFeePercentage} onChange={(e) => patchSection("financialSettings", { lateFeePercentage: Number(e.target.value) || 0 })} /></FieldShell>
                  <FieldShell label="Invoice prefix"><Input value={draft.financialSettings.invoicePrefix} onChange={(e) => patchSection("financialSettings", { invoicePrefix: e.target.value })} /></FieldShell>
                  <FieldShell label="Receipt prefix"><Input value={draft.financialSettings.receiptPrefix} onChange={(e) => patchSection("financialSettings", { receiptPrefix: e.target.value })} /></FieldShell>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="branding">
              <Card className="border-white/60 bg-white/80 shadow-lg shadow-slate-200/50">
                <CardHeader><CardTitle>Branding & appearance</CardTitle><CardDescription>Drive the authenticated experience, login copy, favicons, and visual brand details from one place.</CardDescription></CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                  <FieldShell label="Header title"><Input value={draft.branding.headerTitle} onChange={(e) => patchSection("branding", { headerTitle: e.target.value })} /></FieldShell>
                  <FieldShell label="Header subtitle"><Input value={draft.branding.headerSubtitle} onChange={(e) => patchSection("branding", { headerSubtitle: e.target.value })} /></FieldShell>
                  <FieldShell label="Login welcome title"><Input value={draft.branding.loginWelcomeTitle} onChange={(e) => patchSection("branding", { loginWelcomeTitle: e.target.value })} /></FieldShell>
                  <FieldShell label="Login welcome subtitle"><Input value={draft.branding.loginWelcomeSubtitle} onChange={(e) => patchSection("branding", { loginWelcomeSubtitle: e.target.value })} /></FieldShell>
                  <FieldShell label="Primary color token"><Input value={draft.branding.primaryColor} onChange={(e) => patchSection("branding", { primaryColor: e.target.value })} /></FieldShell>
                  <FieldShell label="Secondary color token"><Input value={draft.branding.secondaryColor} onChange={(e) => patchSection("branding", { secondaryColor: e.target.value })} /></FieldShell>
                  <FieldShell label="Accent color token"><Input value={draft.branding.accentColor} onChange={(e) => patchSection("branding", { accentColor: e.target.value })} /></FieldShell>
                  <FieldShell label="Logo URL"><Input value={draft.branding.logoUrl} onChange={(e) => patchSection("branding", { logoUrl: e.target.value })} /></FieldShell>
                  <div className="md:col-span-2"><FieldShell label="Favicon URL"><Input value={draft.branding.faviconUrl} onChange={(e) => patchSection("branding", { faviconUrl: e.target.value })} /></FieldShell></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="systemPreferences">
              <Card className="border-white/60 bg-white/80 shadow-lg shadow-slate-200/50">
                <CardHeader><CardTitle>System preferences</CardTitle><CardDescription>Turn global product behavior on or off for branding, maintenance, promotions, and scheduling.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <ToggleField label="Enable public branding" hint="Show school-specific branding in public-facing experiences like login and browser titles." checked={draft.systemPreferences.enablePublicBranding} onCheckedChange={(checked) => patchSection("systemPreferences", { enablePublicBranding: checked })} />
                  <ToggleField label="Document watermark" hint="Applies a subtle branded watermark to printable documents generated from the app." checked={draft.systemPreferences.enableDocumentWatermark} onCheckedChange={(checked) => patchSection("systemPreferences", { enableDocumentWatermark: checked })} />
                  <ToggleField label="Allow weekend classes" hint="Use this when classes or exam sessions can be scheduled on weekends." checked={draft.systemPreferences.allowWeekendClasses} onCheckedChange={(checked) => patchSection("systemPreferences", { allowWeekendClasses: checked })} />
                  <ToggleField label="Enable parent portal" hint="Marks parent-facing functionality as available for future surfaces and integrations." checked={draft.systemPreferences.enableParentPortal} onCheckedChange={(checked) => patchSection("systemPreferences", { enableParentPortal: checked })} />
                  <ToggleField label="Auto-promote students" hint="Signals that academic rollover should treat student progression as automatic by default." checked={draft.systemPreferences.autoPromoteStudents} onCheckedChange={(checked) => patchSection("systemPreferences", { autoPromoteStudents: checked })} />
                  <ToggleField label="Maintenance mode" hint="Displays a maintenance notice in the authenticated shell and public surfaces." checked={draft.systemPreferences.maintenanceMode} onCheckedChange={(checked) => patchSection("systemPreferences", { maintenanceMode: checked })} />
                  <FieldShell label="Maintenance message"><Textarea value={draft.systemPreferences.maintenanceMessage} onChange={(e) => patchSection("systemPreferences", { maintenanceMessage: e.target.value })} rows={4} /></FieldShell>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documentTemplates">
              <Card className="border-white/60 bg-white/80 shadow-lg shadow-slate-200/50">
                <CardHeader><CardTitle>Document templates</CardTitle><CardDescription>Brand printable invoices, report cards, certificates, and generated PDFs with school-specific copy.</CardDescription></CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                  <FieldShell label="Invoice header"><Input value={draft.documentTemplates.invoiceHeader} onChange={(e) => patchSection("documentTemplates", { invoiceHeader: e.target.value })} /></FieldShell>
                  <FieldShell label="Report card header"><Input value={draft.documentTemplates.reportCardHeader} onChange={(e) => patchSection("documentTemplates", { reportCardHeader: e.target.value })} /></FieldShell>
                  <FieldShell label="Certificate header"><Input value={draft.documentTemplates.certificateHeader} onChange={(e) => patchSection("documentTemplates", { certificateHeader: e.target.value })} /></FieldShell>
                  <FieldShell label="Signature line label"><Input value={draft.documentTemplates.signatureLineLabel} onChange={(e) => patchSection("documentTemplates", { signatureLineLabel: e.target.value })} /></FieldShell>
                  <FieldShell label="Report card footer"><Textarea value={draft.documentTemplates.reportCardFooter} onChange={(e) => patchSection("documentTemplates", { reportCardFooter: e.target.value })} rows={4} /></FieldShell>
                  <FieldShell label="Certificate footer"><Textarea value={draft.documentTemplates.certificateFooter} onChange={(e) => patchSection("documentTemplates", { certificateFooter: e.target.value })} rows={4} /></FieldShell>
                  <div className="md:col-span-2"><FieldShell label="Global footer note"><Textarea value={draft.documentTemplates.footerNote} onChange={(e) => patchSection("documentTemplates", { footerNote: e.target.value })} rows={3} /></FieldShell></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notificationSettings">
              <Card className="border-white/60 bg-white/80 shadow-lg shadow-slate-200/50">
                <CardHeader><CardTitle>Notification settings</CardTitle><CardDescription>Configure messaging rules, sender details, and encrypted service credentials for email and SMS workflows.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <ToggleField label="Fee reminders" hint="Send reminders about unpaid balances and upcoming fee deadlines." checked={draft.notificationSettings.sendFeeReminders} onCheckedChange={(checked) => patchSection("notificationSettings", { sendFeeReminders: checked })} />
                    <ToggleField label="Attendance alerts" hint="Send notifications when attendance issues require immediate attention." checked={draft.notificationSettings.sendAttendanceAlerts} onCheckedChange={(checked) => patchSection("notificationSettings", { sendAttendanceAlerts: checked })} />
                    <ToggleField label="Results published alerts" hint="Notify families and students when new result records are published." checked={draft.notificationSettings.sendResultPublishedAlerts} onCheckedChange={(checked) => patchSection("notificationSettings", { sendResultPublishedAlerts: checked })} />
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    <FieldShell label="Sender name"><Input value={draft.notificationSettings.senderName} onChange={(e) => patchSection("notificationSettings", { senderName: e.target.value })} /></FieldShell>
                    <FieldShell label="Reply-to email"><Input value={draft.notificationSettings.replyToEmail} onChange={(e) => patchSection("notificationSettings", { replyToEmail: e.target.value })} /></FieldShell>
                    <FieldShell label="SMTP host"><Input value={draft.notificationSettings.smtpHost} onChange={(e) => patchSection("notificationSettings", { smtpHost: e.target.value })} /></FieldShell>
                    <FieldShell label="SMTP port"><Input type="number" min={1} max={65535} value={draft.notificationSettings.smtpPort} onChange={(e) => patchSection("notificationSettings", { smtpPort: Number(e.target.value) || 587 })} /></FieldShell>
                    <FieldShell label="SMTP username"><Input value={draft.notificationSettings.smtpUsername} onChange={(e) => patchSection("notificationSettings", { smtpUsername: e.target.value })} /></FieldShell>
                    <FieldShell label="SMTP password" hint="Encrypted at rest on the server"><Input type="password" value={draft.notificationSettings.smtpPassword} onChange={(e) => patchSection("notificationSettings", { smtpPassword: e.target.value })} /></FieldShell>
                    <div className="md:col-span-2"><FieldShell label="SMS API key" hint="Encrypted at rest on the server"><Textarea value={draft.notificationSettings.smsApiKey} onChange={(e) => patchSection("notificationSettings", { smsApiKey: e.target.value })} rows={4} /></FieldShell></div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="space-y-6">
            <Card className="border-white/60 bg-white/80 shadow-lg shadow-slate-200/50">
              <CardHeader>
                <CardTitle>Setup progress</CardTitle>
                <CardDescription>Track required items before the configuration is considered complete.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                    <span>{data.settings.isSetupComplete ? "Setup complete" : "Setup in progress"}</span>
                    <span>{data.settings.completionPercentage}%</span>
                  </div>
                  <Progress value={data.settings.completionPercentage} className="h-3 rounded-full bg-slate-100" />
                </div>
                <div className="space-y-3">
                  {data.settings.completionChecklist.map((item) => (
                    <div key={item.key} className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3">
                      <div className={cn("mt-0.5 h-2.5 w-2.5 rounded-full", item.complete ? "bg-emerald-500" : "bg-amber-500")} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        <p className="text-xs text-slate-500">{schoolSettingsCategoryLabels[item.category]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/60 bg-white/80 shadow-lg shadow-slate-200/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><History className="h-4 w-4 text-violet-600" /> Version history</CardTitle>
                <CardDescription>Restore a previous version at any time. Every restore creates a new tracked version.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.versions.map((version) => (
                  <div key={version.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Version {version.version}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(version.createdAt, "MMM dd, yyyy • hh:mm a")}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { setRestoreTarget(version.version); handleRestore(version.version) }} disabled={restoreMutation.isPending && restoreTarget === version.version}>
                        {restoreMutation.isPending && restoreTarget === version.version ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Restore
                      </Button>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">{version.changeSummary || "No summary provided"}</p>
                    {version.createdBy ? <p className="mt-2 text-xs text-slate-500">by {version.createdBy.name}</p> : null}
                  </div>
                ))}
                {data.versions.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">No historical versions have been created yet.</p> : null}
              </CardContent>
            </Card>

            <Card className="border-white/60 bg-white/80 shadow-lg shadow-slate-200/50">
              <CardHeader>
                <CardTitle>Audit trail</CardTitle>
                <CardDescription>Review the latest configuration activity with category-level visibility.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.auditLog.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="uppercase tracking-[0.18em]">{entry.action}</Badge>
                      {entry.category ? <Badge variant="secondary">{schoolSettingsCategoryLabels[entry.category]}</Badge> : null}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{entry.changeSummary || entry.fieldPath || "Configuration change"}</p>
                    {(entry.previousValue || entry.nextValue) ? (
                      <p className="mt-2 text-xs leading-5 text-slate-500">{entry.previousValue || "—"} → {entry.nextValue || "—"}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-500">{formatDate(entry.createdAt, "MMM dd, yyyy • hh:mm a")}{entry.createdBy ? ` • ${entry.createdBy.name}` : ""}</p>
                  </div>
                ))}
                {data.auditLog.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">Audit entries will appear here after the first configuration change.</p> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import settings backup</DialogTitle>
            <DialogDescription>Paste a previously exported JSON payload. Importing creates a new version and audit log entry.</DialogDescription>
          </DialogHeader>
          <Textarea value={importValue} onChange={(event) => setImportValue(event.target.value)} rows={18} className="font-mono text-xs" placeholder='{"version": 3, "data": { ... }}' />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={importMutation.isPending || !importValue.trim()}>
              {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}