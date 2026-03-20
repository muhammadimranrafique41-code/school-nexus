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
import {
  exportSchoolSettings, parseImportedSchoolSettings,
  useAdminSchoolSettings, useImportSchoolSettings, useRestoreSchoolSettings,
  useUpdateSchoolSettings, useTimetableSettings, useUpdateTimetableSettings,
} from "@/hooks/use-settings"
import { cn, formatDate, getErrorMessage } from "@/lib/utils"
import {
  BellRing, Building2, Download, FileJson, History, Loader2,
  Palette, RotateCcw, Save, Settings2, ShieldCheck, SlidersHorizontal,
  Upload, CalendarClock, CheckCircle2, AlertCircle,
} from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type SettingsTab = keyof SchoolSettingsData | "timetable"

const settingsTabs: Array<{ key: SettingsTab; label: string; short: string; icon: React.ElementType }> = [
  { key: "schoolInformation", label: schoolSettingsCategoryLabels.schoolInformation, short: "School", icon: Building2 },
  { key: "academicConfiguration", label: schoolSettingsCategoryLabels.academicConfiguration, short: "Academic", icon: SlidersHorizontal },
  { key: "financialSettings", label: schoolSettingsCategoryLabels.financialSettings, short: "Finance", icon: FileJson },
  { key: "branding", label: schoolSettingsCategoryLabels.branding, short: "Branding", icon: Palette },
  { key: "systemPreferences", label: schoolSettingsCategoryLabels.systemPreferences, short: "System", icon: Settings2 },
  { key: "documentTemplates", label: schoolSettingsCategoryLabels.documentTemplates, short: "Docs", icon: ShieldCheck },
  { key: "notificationSettings", label: schoolSettingsCategoryLabels.notificationSettings, short: "Notifs", icon: BellRing },
  { key: "timetable", label: "Timetable Defaults", short: "Timetable", icon: CalendarClock },
]

// ── Field helpers ─────────────────────────────────────────────────────────
function FieldShell({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function ToggleField({ label, hint, checked, onCheckedChange }: {
  label: string; hint: string; checked: boolean; onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-slate-900">{label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0 mt-0.5" />
    </div>
  )
}

// ── Timetable tab ─────────────────────────────────────────────────────────
function TimetableSettingsTab() {
  const { toast } = useToast()
  const { data, isLoading, isError } = useTimetableSettings()
  const updateMutation = useUpdateTimetableSettings()
  const [draft, setDraft] = useState<any>(null)

  useEffect(() => { if (data) setDraft(data) }, [data])

  const isDirty = useMemo(() => {
    if (!draft || !data) return false
    return JSON.stringify(draft) !== JSON.stringify(data)
  }, [draft, data])

  const startTotalMinutes = useMemo(() => {
    const [h, m] = (draft?.startTime ?? "08:00").split(":").map(Number)
    return h * 60 + m
  }, [draft?.startTime])
  const endTotalMinutes = useMemo(() => {
    const [h, m] = (draft?.endTime ?? "15:00").split(":").map(Number)
    return h * 60 + m
  }, [draft?.endTime])
  const totalMinutes = endTotalMinutes - startTotalMinutes

  const computedTotalPeriods = useMemo(() => {
    if (!draft) return 0
    const breaksTotal = draft.breakAfterPeriod.length * draft.breakDuration
    return Math.floor((totalMinutes - breaksTotal) / draft.periodDuration)
  }, [draft, totalMinutes])

  const timeline = useMemo(() => {
    if (!draft) return []
    const blocks: any[] = []
    let t = startTotalMinutes, p = 1
    while (p <= computedTotalPeriods) {
      blocks.push({ type: "period", number: p, start: t, duration: draft.periodDuration })
      t += draft.periodDuration
      if (draft.breakAfterPeriod.includes(p)) {
        blocks.push({ type: "break", start: t, duration: draft.breakDuration })
        t += draft.breakDuration
      }
      p++
    }
    return blocks
  }, [draft, startTotalMinutes, computedTotalPeriods])

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60), m = mins % 60
    const ampm = h >= 12 ? "PM" : "AM"
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`
  }

  const handleSave = () => {
    if (!draft) return
    updateMutation.mutate(draft, {
      onSuccess: (saved) => {
        toast({ title: "Timetable settings saved" })
        window.dispatchEvent(new CustomEvent("timetable-settings-updated", { detail: saved }))
      },
      onError: (e) => toast({ variant: "destructive", title: "Save failed", description: getErrorMessage(e) }),
    })
  }

  if (isError) return (
    <Card className="border-rose-100 bg-rose-50/50 shadow-none">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50"><AlertCircle className="h-5 w-5 text-rose-500" /></div>
        <p className="text-[13px] font-semibold text-slate-900">Failed to load settings</p>
        <p className="text-[12px] text-slate-400">Please refresh the page.</p>
      </CardContent>
    </Card>
  )
  if (isLoading || !draft) return (
    <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-indigo-500" /></div>
  )

  const breaksMins = draft.breakAfterPeriod.length * draft.breakDuration
  const teachMins = totalMinutes - breaksMins
  const totalHoursStr = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`

  return (
    <Card className="border-slate-200/80 bg-white shadow-none">
      <CardHeader className="border-b border-slate-100 px-4 py-3">
        <CardTitle className="text-sm font-semibold text-slate-900">Timetable Defaults</CardTitle>
        <CardDescription className="text-[11px]">School hours, working days, and period configuration.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-4">

        {/* School hours */}
        <div className="space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">School Hours</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldShell label="Start time">
              <Input type="time" className="h-8 text-sm" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
            </FieldShell>
            <FieldShell label="End time">
              <Input type="time" className="h-8 text-sm" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
            </FieldShell>
          </div>
          <p className="text-[11px] text-slate-400">Total: {totalHoursStr}</p>
        </div>

        <Separator />

        {/* Working days */}
        <div className="space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Working Days</p>
          <ToggleGroup type="multiple" value={draft.workingDays.map(String)}
            onValueChange={(v) => {
              const next = v.map(Number).sort()
              if (!next.some((d) => d >= 1 && d <= 5)) {
                toast({ variant: "destructive", description: "At least one weekday must be selected" })
                setTimeout(() => setDraft({ ...draft, workingDays: [1] }), 300)
                return
              }
              setDraft({ ...draft, workingDays: next })
            }}
            className="flex-wrap justify-start gap-1.5"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <ToggleGroupItem key={d} value={String(d)} className="h-8 px-3 text-xs data-[state=on]:bg-indigo-600 data-[state=on]:text-white">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d - 1]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Separator />

        {/* Config */}
        <div className="space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Configuration</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldShell label="Period duration">
              <Select value={String(draft.periodDuration)} onValueChange={(v) => setDraft({ ...draft, periodDuration: Number(v) })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{[30, 35, 40, 45, 50, 60].map((m) => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}</SelectContent>
              </Select>
            </FieldShell>
            <FieldShell label="Break after period">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 w-full justify-start text-sm font-normal truncate">
                    {draft.breakAfterPeriod.length > 0 ? `After P${draft.breakAfterPeriod.join(", P")}` : "No breaks"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2">
                  <div className="max-h-52 overflow-y-auto space-y-0.5">
                    {Array.from({ length: Math.max(8, computedTotalPeriods) }).map((_, i) => {
                      const p = i + 1
                      return (
                        <div key={p} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                          <Checkbox id={`break-${p}`} checked={draft.breakAfterPeriod.includes(p)}
                            onCheckedChange={(c) => setDraft({ ...draft, breakAfterPeriod: c ? [...draft.breakAfterPeriod, p].sort((a, b) => a - b) : draft.breakAfterPeriod.filter((x: number) => x !== p) })} />
                          <label htmlFor={`break-${p}`} className="text-[12px] font-medium cursor-pointer">After Period {p}</label>
                        </div>
                      )
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </FieldShell>
            <FieldShell label="Break duration">
              <Select value={String(draft.breakDuration)} onValueChange={(v) => setDraft({ ...draft, breakDuration: Number(v) })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{[5, 10, 15, 20, 30].map((m) => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}</SelectContent>
              </Select>
            </FieldShell>
            <FieldShell label="Number of breaks">
              <div className="flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                {draft.breakAfterPeriod.length} break{draft.breakAfterPeriod.length !== 1 ? "s" : ""}
              </div>
            </FieldShell>
          </div>
        </div>

        <Separator />

        {/* Live preview */}
        <div className="space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Live Preview</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
              {computedTotalPeriods} periods
            </span>
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              {teachMins}m teaching
            </span>
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {breaksMins}m breaks
            </span>
          </div>
          <div className="w-full overflow-x-auto pb-2">
            <div className="flex items-stretch gap-1.5 min-w-max">
              {timeline.map((block, i) => (
                <div key={i} className={cn(
                  "flex flex-col items-center justify-center rounded-lg border px-2 py-2 shrink-0",
                  block.type === "period"
                    ? "bg-indigo-50 border-indigo-200 text-indigo-900 w-20"
                    : "bg-amber-50 border-amber-200 text-amber-700 w-16",
                )}>
                  <p className="text-[11px] font-bold">{block.type === "period" ? `P${block.number}` : "Break"}</p>
                  <p className="text-[10px] opacity-70">{block.duration}m</p>
                  <p className="text-[10px] font-semibold">{formatTime(block.start)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Button size="sm" onClick={handleSave} disabled={!isDirty || updateMutation.isPending}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
          {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Timetable Settings
        </Button>
      </CardContent>
    </Card>
  )
}

// ── Content card wrapper for tab panels ───────────────────────────────────
function SettingsCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="border-slate-200/80 bg-white shadow-none">
      <CardHeader className="border-b border-slate-100 px-4 py-3">
        <CardTitle className="text-sm font-semibold text-slate-900">{title}</CardTitle>
        <CardDescription className="text-[11px]">{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
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
    setDraft((c) => c ? { ...c, [section]: { ...c[section], ...patch } } : c)
  }

  const updateListField = (section: "academicConfiguration", field: "academicLevels" | "gradingScale", value: string) => {
    patchSection(section, { [field]: value.split(",").map((i) => i.trim()).filter(Boolean) } as any)
  }

  const saveSettings = () => {
    if (!draft) return
    updateMutation.mutate({ data: draft, changeSummary: changeSummary || undefined }, {
      onSuccess: () => { setChangeSummary(""); toast({ title: "Settings saved" }) },
      onError: (e) => toast({ variant: "destructive", title: "Save failed", description: getErrorMessage(e) }),
    })
  }

  const handleExport = async () => {
    try {
      const payload = await exportSchoolSettings()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = Object.assign(document.createElement("a"), { href: url, download: `school-settings-v${payload.version}.json` })
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url)
      toast({ title: "Export ready", description: `Downloaded v${payload.version} settings backup.` })
    } catch (e) { toast({ variant: "destructive", title: "Export failed", description: getErrorMessage(e) }) }
  }

  const handleImport = () => {
    try {
      const parsed = parseImportedSchoolSettings(importValue)
      importMutation.mutate({ data: parsed, changeSummary: changeSummary || "Imported school settings backup" }, {
        onSuccess: () => { setImportOpen(false); setImportValue(""); setChangeSummary(""); toast({ title: "Settings imported" }) },
        onError: (e) => toast({ variant: "destructive", title: "Import failed", description: getErrorMessage(e) }),
      })
    } catch (e) { toast({ variant: "destructive", title: "Invalid backup", description: getErrorMessage(e, "Upload a valid settings export JSON.") }) }
  }

  const handleRestore = (version: number) => {
    restoreMutation.mutate({ version, changeSummary: changeSummary || `Restored settings version ${version}` }, {
      onSuccess: () => { setRestoreTarget(null); setChangeSummary(""); toast({ title: "Version restored" }) },
      onError: (e) => toast({ variant: "destructive", title: "Restore failed", description: getErrorMessage(e) }),
    })
  }

  if (isLoading || !draft || !data) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-4 pb-8">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">School Settings</h1>
              <p className="text-[12px] text-slate-400">Configure branding, academics, finance, notifications, and more.</p>
            </div>
          </div>
          {/* Version pills */}
          <div className="flex flex-wrap gap-2 sm:items-center">
            <span className="inline-flex items-center rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
              v{data.settings.version}
            </span>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold",
              data.settings.completionPercentage === 100
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700",
            )}>
              {data.settings.completionPercentage}% complete
            </span>
            <span className="text-[11px] text-slate-400">
              Updated {formatDate(data.settings.updatedAt, "MMM dd, yyyy")}
            </span>
          </div>
        </section>

        {/* ── Action bar: change summary + save/export/import ──────────── */}
        <Card className="border-slate-200/80 bg-white shadow-none">
          <CardContent className="p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="Describe what changed for the audit trail (optional)…"
                className="h-8 flex-1 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5" />Export
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setImportOpen(true)}>
                  <Upload className="h-3.5 w-3.5" />Import
                </Button>
                <Button size="sm" className="h-8 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={saveSettings} disabled={!isDirty || updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save settings
                  {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Main grid ───────────────────────────────────────────────── */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">

          {/* ── Tabs ──────────────────────────────────────────────────── */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)} className="space-y-3">

            {/* Tab list — scrollable on mobile */}
            <div className="w-full overflow-x-auto pb-1">
              <TabsList className="inline-flex h-auto min-w-full gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:min-w-0 sm:w-full sm:flex-wrap sm:h-auto">
                {settingsTabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <TabsTrigger
                      key={tab.key}
                      value={tab.key}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold whitespace-nowrap transition-all",
                        "data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm",
                        "data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:bg-white data-[state=inactive]:hover:text-slate-900",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="hidden sm:inline">{tab.short}</span>
                      <span className="sm:hidden">{tab.short}</span>
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </div>

            {/* ── School information ─────────────────────────────────── */}
            <TabsContent value="schoolInformation">
              <SettingsCard title="School information" description="Core identity used in headers, reports, certificates, and contact surfaces.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldShell label="School name"><Input className="h-8 text-sm" value={draft.schoolInformation.schoolName} onChange={(e) => patchSection("schoolInformation", { schoolName: e.target.value })} /></FieldShell>
                  <FieldShell label="Short name"><Input className="h-8 text-sm" value={draft.schoolInformation.shortName} onChange={(e) => patchSection("schoolInformation", { shortName: e.target.value })} /></FieldShell>
                  <FieldShell label="School code"><Input className="h-8 text-sm" value={draft.schoolInformation.schoolCode} onChange={(e) => patchSection("schoolInformation", { schoolCode: e.target.value })} /></FieldShell>
                  <FieldShell label="Principal name"><Input className="h-8 text-sm" value={draft.schoolInformation.principalName} onChange={(e) => patchSection("schoolInformation", { principalName: e.target.value })} /></FieldShell>
                  <FieldShell label="School email"><Input className="h-8 text-sm" value={draft.schoolInformation.schoolEmail} onChange={(e) => patchSection("schoolInformation", { schoolEmail: e.target.value })} /></FieldShell>
                  <FieldShell label="School phone"><Input className="h-8 text-sm" value={draft.schoolInformation.schoolPhone} onChange={(e) => patchSection("schoolInformation", { schoolPhone: e.target.value })} /></FieldShell>
                  <FieldShell label="Website URL"><Input className="h-8 text-sm" value={draft.schoolInformation.websiteUrl} onChange={(e) => patchSection("schoolInformation", { websiteUrl: e.target.value })} /></FieldShell>
                  <FieldShell label="Motto"><Input className="h-8 text-sm" value={draft.schoolInformation.motto} onChange={(e) => patchSection("schoolInformation", { motto: e.target.value })} /></FieldShell>
                  <div className="sm:col-span-2">
                    <FieldShell label="School address"><Textarea className="text-sm" value={draft.schoolInformation.schoolAddress} onChange={(e) => patchSection("schoolInformation", { schoolAddress: e.target.value })} rows={3} /></FieldShell>
                  </div>
                </div>
              </SettingsCard>
            </TabsContent>

            {/* ── Academic configuration ─────────────────────────────── */}
            <TabsContent value="academicConfiguration">
              <SettingsCard title="Academic configuration" description="Active academic cycle, grading structure, and instructional setup.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldShell label="Current academic year"><Input className="h-8 text-sm" value={draft.academicConfiguration.currentAcademicYear} onChange={(e) => patchSection("academicConfiguration", { currentAcademicYear: e.target.value })} /></FieldShell>
                  <FieldShell label="Current term"><Input className="h-8 text-sm" value={draft.academicConfiguration.currentTerm} onChange={(e) => patchSection("academicConfiguration", { currentTerm: e.target.value })} /></FieldShell>
                  <FieldShell label="Week starts on">
                    <Select value={draft.academicConfiguration.weekStartsOn} onValueChange={(v) => patchSection("academicConfiguration", { weekStartsOn: v as any })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Monday">Monday</SelectItem><SelectItem value="Sunday">Sunday</SelectItem><SelectItem value="Saturday">Saturday</SelectItem></SelectContent>
                    </Select>
                  </FieldShell>
                  <FieldShell label="Periods per day"><Input type="number" min={1} max={12} className="h-8 text-sm" value={draft.academicConfiguration.periodsPerDay} onChange={(e) => patchSection("academicConfiguration", { periodsPerDay: Number(e.target.value) || 1 })} /></FieldShell>
                  <FieldShell label="Passing score (%)"><Input type="number" min={0} max={100} className="h-8 text-sm" value={draft.academicConfiguration.passingScore} onChange={(e) => patchSection("academicConfiguration", { passingScore: Number(e.target.value) || 0 })} /></FieldShell>
                  <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                    <FieldShell label="Academic levels" hint="Comma-separated"><Textarea className="text-sm" value={draft.academicConfiguration.academicLevels.join(", ")} onChange={(e) => updateListField("academicConfiguration", "academicLevels", e.target.value)} rows={3} /></FieldShell>
                    <FieldShell label="Grading scale" hint="Comma-separated"><Textarea className="text-sm" value={draft.academicConfiguration.gradingScale.join(", ")} onChange={(e) => updateListField("academicConfiguration", "gradingScale", e.target.value)} rows={3} /></FieldShell>
                  </div>
                </div>
              </SettingsCard>
            </TabsContent>

            {/* ── Financial settings ─────────────────────────────────── */}
            <TabsContent value="financialSettings">
              <SettingsCard title="Financial settings" description="Currency, locale, invoice numbering, and payment defaults.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldShell label="Currency code"><Input className="h-8 text-sm" value={draft.financialSettings.currencyCode} onChange={(e) => patchSection("financialSettings", { currencyCode: e.target.value.toUpperCase() })} /></FieldShell>
                  <FieldShell label="Currency symbol"><Input className="h-8 text-sm" value={draft.financialSettings.currencySymbol} onChange={(e) => patchSection("financialSettings", { currencySymbol: e.target.value })} /></FieldShell>
                  <FieldShell label="Locale"><Input className="h-8 text-sm" value={draft.financialSettings.locale} onChange={(e) => patchSection("financialSettings", { locale: e.target.value })} /></FieldShell>
                  <FieldShell label="Timezone"><Input className="h-8 text-sm" value={draft.financialSettings.timezone} onChange={(e) => patchSection("financialSettings", { timezone: e.target.value })} /></FieldShell>
                  <FieldShell label="Date format">
                    <Select value={draft.financialSettings.dateFormat} onValueChange={(v) => patchSection("financialSettings", { dateFormat: v as any })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["PPP", "MMMM dd, yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FieldShell>
                  <FieldShell label="Late fee %"><Input type="number" min={0} max={100} className="h-8 text-sm" value={draft.financialSettings.lateFeePercentage} onChange={(e) => patchSection("financialSettings", { lateFeePercentage: Number(e.target.value) || 0 })} /></FieldShell>
                  <FieldShell label="Invoice prefix"><Input className="h-8 text-sm" value={draft.financialSettings.invoicePrefix} onChange={(e) => patchSection("financialSettings", { invoicePrefix: e.target.value })} /></FieldShell>
                  <FieldShell label="Receipt prefix"><Input className="h-8 text-sm" value={draft.financialSettings.receiptPrefix} onChange={(e) => patchSection("financialSettings", { receiptPrefix: e.target.value })} /></FieldShell>
                </div>
              </SettingsCard>
            </TabsContent>

            {/* ── Branding ───────────────────────────────────────────── */}
            <TabsContent value="branding">
              <SettingsCard title="Branding & appearance" description="Login copy, favicons, color tokens, and visual brand details.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldShell label="Header title"><Input className="h-8 text-sm" value={draft.branding.headerTitle} onChange={(e) => patchSection("branding", { headerTitle: e.target.value })} /></FieldShell>
                  <FieldShell label="Header subtitle"><Input className="h-8 text-sm" value={draft.branding.headerSubtitle} onChange={(e) => patchSection("branding", { headerSubtitle: e.target.value })} /></FieldShell>
                  <FieldShell label="Login welcome title"><Input className="h-8 text-sm" value={draft.branding.loginWelcomeTitle} onChange={(e) => patchSection("branding", { loginWelcomeTitle: e.target.value })} /></FieldShell>
                  <FieldShell label="Login welcome subtitle"><Input className="h-8 text-sm" value={draft.branding.loginWelcomeSubtitle} onChange={(e) => patchSection("branding", { loginWelcomeSubtitle: e.target.value })} /></FieldShell>
                  <FieldShell label="Primary color"><Input className="h-8 text-sm" value={draft.branding.primaryColor} onChange={(e) => patchSection("branding", { primaryColor: e.target.value })} /></FieldShell>
                  <FieldShell label="Secondary color"><Input className="h-8 text-sm" value={draft.branding.secondaryColor} onChange={(e) => patchSection("branding", { secondaryColor: e.target.value })} /></FieldShell>
                  <FieldShell label="Accent color"><Input className="h-8 text-sm" value={draft.branding.accentColor} onChange={(e) => patchSection("branding", { accentColor: e.target.value })} /></FieldShell>
                  <FieldShell label="Logo URL"><Input className="h-8 text-sm" value={draft.branding.logoUrl} onChange={(e) => patchSection("branding", { logoUrl: e.target.value })} /></FieldShell>
                  <div className="sm:col-span-2">
                    <FieldShell label="Favicon URL"><Input className="h-8 text-sm" value={draft.branding.faviconUrl} onChange={(e) => patchSection("branding", { faviconUrl: e.target.value })} /></FieldShell>
                  </div>
                </div>
              </SettingsCard>
            </TabsContent>

            {/* ── System preferences ─────────────────────────────────── */}
            <TabsContent value="systemPreferences">
              <SettingsCard title="System preferences" description="Toggle global product behavior for branding, maintenance, and scheduling.">
                <div className="space-y-2.5">
                  <ToggleField label="Public branding" hint="Show school-specific branding in login and browser titles." checked={draft.systemPreferences.enablePublicBranding} onCheckedChange={(v) => patchSection("systemPreferences", { enablePublicBranding: v })} />
                  <ToggleField label="Document watermark" hint="Applies a branded watermark to printable documents." checked={draft.systemPreferences.enableDocumentWatermark} onCheckedChange={(v) => patchSection("systemPreferences", { enableDocumentWatermark: v })} />
                  <ToggleField label="Allow weekend classes" hint="Classes or exams can be scheduled on weekends." checked={draft.systemPreferences.allowWeekendClasses} onCheckedChange={(v) => patchSection("systemPreferences", { allowWeekendClasses: v })} />
                  <ToggleField label="Parent portal" hint="Marks parent-facing features as available." checked={draft.systemPreferences.enableParentPortal} onCheckedChange={(v) => patchSection("systemPreferences", { enableParentPortal: v })} />
                  <ToggleField label="Auto-promote students" hint="Academic rollover treats progression as automatic." checked={draft.systemPreferences.autoPromoteStudents} onCheckedChange={(v) => patchSection("systemPreferences", { autoPromoteStudents: v })} />
                  <ToggleField label="Maintenance mode" hint="Displays a maintenance notice across the app." checked={draft.systemPreferences.maintenanceMode} onCheckedChange={(v) => patchSection("systemPreferences", { maintenanceMode: v })} />
                  <FieldShell label="Maintenance message">
                    <Textarea className="text-sm" value={draft.systemPreferences.maintenanceMessage} onChange={(e) => patchSection("systemPreferences", { maintenanceMessage: e.target.value })} rows={3} />
                  </FieldShell>
                </div>
              </SettingsCard>
            </TabsContent>

            {/* ── Document templates ─────────────────────────────────── */}
            <TabsContent value="documentTemplates">
              <SettingsCard title="Document templates" description="Brand invoices, report cards, certificates, and PDFs with school-specific copy.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldShell label="Invoice header"><Input className="h-8 text-sm" value={draft.documentTemplates.invoiceHeader} onChange={(e) => patchSection("documentTemplates", { invoiceHeader: e.target.value })} /></FieldShell>
                  <FieldShell label="Report card header"><Input className="h-8 text-sm" value={draft.documentTemplates.reportCardHeader} onChange={(e) => patchSection("documentTemplates", { reportCardHeader: e.target.value })} /></FieldShell>
                  <FieldShell label="Certificate header"><Input className="h-8 text-sm" value={draft.documentTemplates.certificateHeader} onChange={(e) => patchSection("documentTemplates", { certificateHeader: e.target.value })} /></FieldShell>
                  <FieldShell label="Signature line label"><Input className="h-8 text-sm" value={draft.documentTemplates.signatureLineLabel} onChange={(e) => patchSection("documentTemplates", { signatureLineLabel: e.target.value })} /></FieldShell>
                  <FieldShell label="Report card footer"><Textarea className="text-sm" value={draft.documentTemplates.reportCardFooter} onChange={(e) => patchSection("documentTemplates", { reportCardFooter: e.target.value })} rows={3} /></FieldShell>
                  <FieldShell label="Certificate footer"><Textarea className="text-sm" value={draft.documentTemplates.certificateFooter} onChange={(e) => patchSection("documentTemplates", { certificateFooter: e.target.value })} rows={3} /></FieldShell>
                  <div className="sm:col-span-2">
                    <FieldShell label="Global footer note"><Textarea className="text-sm" value={draft.documentTemplates.footerNote} onChange={(e) => patchSection("documentTemplates", { footerNote: e.target.value })} rows={2} /></FieldShell>
                  </div>
                </div>
              </SettingsCard>
            </TabsContent>

            {/* ── Notification settings ──────────────────────────────── */}
            <TabsContent value="notificationSettings">
              <SettingsCard title="Notification settings" description="Messaging rules, sender details, and service credentials for email and SMS.">
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <ToggleField label="Fee reminders" hint="Reminders for unpaid balances." checked={draft.notificationSettings.sendFeeReminders} onCheckedChange={(v) => patchSection("notificationSettings", { sendFeeReminders: v })} />
                    <ToggleField label="Attendance alerts" hint="Notify on attendance issues." checked={draft.notificationSettings.sendAttendanceAlerts} onCheckedChange={(v) => patchSection("notificationSettings", { sendAttendanceAlerts: v })} />
                    <ToggleField label="Results alerts" hint="Notify when results are published." checked={draft.notificationSettings.sendResultPublishedAlerts} onCheckedChange={(v) => patchSection("notificationSettings", { sendResultPublishedAlerts: v })} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldShell label="Sender name"><Input className="h-8 text-sm" value={draft.notificationSettings.senderName} onChange={(e) => patchSection("notificationSettings", { senderName: e.target.value })} /></FieldShell>
                    <FieldShell label="Reply-to email"><Input className="h-8 text-sm" value={draft.notificationSettings.replyToEmail} onChange={(e) => patchSection("notificationSettings", { replyToEmail: e.target.value })} /></FieldShell>
                    <FieldShell label="SMTP host"><Input className="h-8 text-sm" value={draft.notificationSettings.smtpHost} onChange={(e) => patchSection("notificationSettings", { smtpHost: e.target.value })} /></FieldShell>
                    <FieldShell label="SMTP port"><Input type="number" min={1} max={65535} className="h-8 text-sm" value={draft.notificationSettings.smtpPort} onChange={(e) => patchSection("notificationSettings", { smtpPort: Number(e.target.value) || 587 })} /></FieldShell>
                    <FieldShell label="SMTP username"><Input className="h-8 text-sm" value={draft.notificationSettings.smtpUsername} onChange={(e) => patchSection("notificationSettings", { smtpUsername: e.target.value })} /></FieldShell>
                    <FieldShell label="SMTP password" hint="Encrypted at rest"><Input type="password" className="h-8 text-sm" value={draft.notificationSettings.smtpPassword} onChange={(e) => patchSection("notificationSettings", { smtpPassword: e.target.value })} /></FieldShell>
                    <div className="sm:col-span-2">
                      <FieldShell label="SMS API key" hint="Encrypted at rest"><Textarea className="text-sm" value={draft.notificationSettings.smsApiKey} onChange={(e) => patchSection("notificationSettings", { smsApiKey: e.target.value })} rows={3} /></FieldShell>
                    </div>
                  </div>
                </div>
              </SettingsCard>
            </TabsContent>

            <TabsContent value="timetable"><TimetableSettingsTab /></TabsContent>
          </Tabs>

          {/* ── Right sidebar ────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Setup progress */}
            <Card className="border-slate-200/80 bg-white shadow-none">
              <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg",
                  data.settings.isSetupComplete ? "bg-emerald-50" : "bg-amber-50")}>
                  {data.settings.isSetupComplete
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    : <AlertCircle className="h-3.5 w-3.5 text-amber-600" />}
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Setup progress</CardTitle>
                  <CardDescription className="text-[11px]">{data.settings.completionPercentage}% complete</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={cn("h-full rounded-full transition-all", data.settings.completionPercentage === 100 ? "bg-emerald-500" : "bg-indigo-500")}
                    style={{ width: `${data.settings.completionPercentage}%` }}
                  />
                </div>
                <div className="space-y-1.5">
                  {data.settings.completionChecklist.map((item) => (
                    <div key={item.key} className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", item.complete ? "bg-emerald-500" : "bg-amber-400")} />
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-slate-900">{item.label}</p>
                        <p className="text-[10px] text-slate-400">{schoolSettingsCategoryLabels[item.category]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Version history */}
            <Card className="border-slate-200/80 bg-white shadow-none">
              <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50">
                  <History className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Version history</CardTitle>
                  <CardDescription className="text-[11px]">Restore any previous version.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {data.versions.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-400">No versions yet.</p>
                ) : data.versions.map((v) => (
                  <div key={v.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-bold text-slate-900">v{v.version}</p>
                        <p className="text-[10px] text-slate-400">{formatDate(v.createdAt, "MMM dd, yyyy · hh:mm a")}</p>
                      </div>
                      <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => { setRestoreTarget(v.version); handleRestore(v.version) }}
                        disabled={restoreMutation.isPending && restoreTarget === v.version}>
                        {restoreMutation.isPending && restoreTarget === v.version
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <RotateCcw className="h-3 w-3" />}
                        Restore
                      </Button>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{v.changeSummary || "No summary"}</p>
                    {v.createdBy && <p className="mt-0.5 text-[10px] text-slate-400">by {v.createdBy.name}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Audit trail */}
            <Card className="border-slate-200/80 bg-white shadow-none">
              <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-100 px-4 py-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50">
                  <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Audit trail</CardTitle>
                  <CardDescription className="text-[11px]">Latest configuration activity.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-3 space-y-1.5">
                {data.auditLog.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-400">No audit entries yet.</p>
                ) : data.auditLog.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        {entry.action}
                      </span>
                      {entry.category && (
                        <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {schoolSettingsCategoryLabels[entry.category]}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] font-semibold text-slate-900 leading-tight">
                      {entry.changeSummary || entry.fieldPath || "Configuration change"}
                    </p>
                    {(entry.previousValue || entry.nextValue) && (
                      <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                        {entry.previousValue || "—"} → {entry.nextValue || "—"}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {formatDate(entry.createdAt, "MMM dd · hh:mm a")}
                      {entry.createdBy ? ` · ${entry.createdBy.name}` : ""}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Import dialog ─────────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Import settings backup</DialogTitle>
            <DialogDescription className="text-[12px]">Paste a previously exported JSON payload. Creates a new version and audit entry.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={importValue}
            onChange={(e) => setImportValue(e.target.value)}
            rows={16}
            className="font-mono text-xs"
            placeholder='{"version": 3, "data": { ... }}'
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleImport} disabled={importMutation.isPending || !importValue.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
              {importMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
