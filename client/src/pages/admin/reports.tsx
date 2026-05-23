import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, History, Database, Loader2, Download, Trash2, Edit3, X, Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  useReportDefinitions,
  useCreateReportDefinition,
  useUpdateReportDefinition,
  useDeleteReportDefinition,
  useReportHistory,
  useRecordReportGeneration,
  useIncrementDownloadCount,
  useCleanReportCache,
  type ReportCategory,
  type ReportDefinition,
} from "@/hooks/use-reports";

const categoryLabels: Record<ReportCategory, string> = {
  academic: "Academic Results",
  fee: "Fee Collection",
  finance: "Finance Summary",
  attendance: "Attendance",
};

const categoryVariants: Record<ReportCategory, "default" | "secondary" | "destructive" | "outline"> = {
  academic: "default",
  fee: "secondary",
  finance: "destructive",
  attendance: "outline",
};

function DefinitionForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: ReportDefinition | null;
  onSubmit: (data: { name: string; category: ReportCategory; description: string | null; parameters: string[] | null; queryTemplate: string | null }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<ReportCategory>(initial?.category ?? "academic");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [parametersStr, setParametersStr] = useState(initial?.parameters?.join("\n") ?? "");
  const [queryTemplate, setQueryTemplate] = useState(initial?.queryTemplate ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      category,
      description: description.trim() || null,
      parameters: parametersStr.trim() ? parametersStr.split("\n").map((s) => s.trim()).filter(Boolean) : null,
      queryTemplate: queryTemplate.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="def-name" className="text-xs font-medium text-slate-700">Report Name</Label>
        <Input id="def-name" className="h-8 w-full text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly Fee Collection" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="def-category" className="text-xs font-medium text-slate-700">Category</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as ReportCategory)}>
          <SelectTrigger id="def-category" className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="def-desc" className="text-xs font-medium text-slate-700">Description</Label>
        <Textarea id="def-desc" className="w-full text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="def-params" className="text-xs font-medium text-slate-700">Parameters (one per line)</Label>
        <Textarea id="def-params" className="w-full text-sm" value={parametersStr} onChange={(e) => setParametersStr(e.target.value)} placeholder="class_id&#10;month&#10;session_id" rows={3} />
        <p className="text-xs text-muted-foreground">Each line is a parameter key the user will fill in when generating the report.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="def-query" className="text-xs font-medium text-slate-700">Query Template</Label>
        <Textarea id="def-query" className="w-full text-sm" value={queryTemplate} onChange={(e) => setQueryTemplate(e.target.value)} placeholder="Optional SQL or service reference" rows={2} />
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button type="submit" disabled={loading || !name.trim()}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initial ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DefinitionsTab() {
  const { data: definitions, isLoading, error } = useReportDefinitions();
  const createMutation = useCreateReportDefinition();
  const updateMutation = useUpdateReportDefinition();
  const deleteMutation = useDeleteReportDefinition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ReportDefinition | null>(null);

  const handleSubmit = async (data: { name: string; category: ReportCategory; description: string | null; parameters: string[] | null; queryTemplate: string | null }) => {
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...data });
        toast({ title: "Definition updated" });
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: "Definition created" });
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Definition deleted" });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-muted-foreground">Failed to load report definitions.</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{definitions?.length ?? 0} definition{(definitions?.length ?? 0) !== 1 ? "s" : ""}</p>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New Definition</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Definition" : "New Report Definition"}</DialogTitle>
              <DialogDescription>Configure the report template and its parameters.</DialogDescription>
            </DialogHeader>
            <DefinitionForm
              initial={editing}
              onSubmit={handleSubmit}
              onCancel={() => { setDialogOpen(false); setEditing(null); }}
              loading={createMutation.isPending || updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {(!definitions || definitions.length === 0) ? (
        <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No report definitions yet.</p>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Create One</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Parameters</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {definitions.map((def) => (
                <TableRow key={def.id}>
                  <TableCell className="font-medium">{def.name}</TableCell>
                  <TableCell>
                    <Badge variant={categoryVariants[def.category]}>{categoryLabels[def.category]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {def.parameters?.join(", ") || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {def.createdAt ? format(new Date(def.createdAt), "MMM d, yyyy") : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Edit"
                        onClick={() => { setEditing(def); setDialogOpen(true); }}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Definition?</AlertDialogTitle>
                            <AlertDialogDescription>This will remove "{def.name}". Related history will be preserved but unlinked.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(def.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function GenerateTab() {
  const { data: definitions, isLoading } = useReportDefinitions();
  const recordMutation = useRecordReportGeneration();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  const selectedDef = definitions?.find((d) => d.id === selectedId);

  const handleGenerate = async () => {
    if (!selectedDef) return;
    setGenerating(true);
    try {
      await recordMutation.mutateAsync({
        reportDefinitionId: selectedDef.id,
        parametersUsed: params as unknown as Record<string, unknown>,
        fileSize: null,
        fileUrl: null,
      });
      toast({ title: "Report generation recorded", description: `${selectedDef.name} has been queued.` });
      setParams({});
    } catch (err) {
      toast({ title: "Generation failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>;
  }

  if (!definitions || definitions.length === 0) {
    return (
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Create a report definition first.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm lg:col-span-2">
        <CardHeader>
          <CardTitle>Generate Report</CardTitle>
          <CardDescription>Select a definition and fill in the parameters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-700">Report Definition</Label>
            <Select
              value={selectedId?.toString() ?? ""}
              onValueChange={(v) => {
                const id = Number(v);
                setSelectedId(id);
                const def = definitions.find((d) => d.id === id);
                setParams(def?.parameters ? Object.fromEntries(def.parameters.map((p) => [p, ""])) : {});
              }}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choose a definition..." /></SelectTrigger>
              <SelectContent>
                {definitions.map((def) => (
                  <SelectItem key={def.id} value={def.id.toString()}>
                    {def.name} — {categoryLabels[def.category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedDef && (
            <>
              {selectedDef.description && (
                <p className="text-sm text-muted-foreground">{selectedDef.description}</p>
              )}

              {selectedDef.parameters && selectedDef.parameters.length > 0 ? (
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-slate-700">Parameters</Label>
                  {selectedDef.parameters.map((param) => (
                    <div key={param} className="space-y-1">
                      <Label className="text-xs font-medium text-slate-700 capitalize">{param.replace(/_/g, " ")}</Label>
                      <Input
                        className="h-8 w-full text-sm"
                        value={params[param] ?? ""}
                        onChange={(e) => setParams((prev) => ({ ...prev, [param]: e.target.value }))}
                        placeholder={`Enter ${param.replace(/_/g, " ")}`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">This report requires no parameters.</p>
              )}

              <Button onClick={handleGenerate} disabled={generating} className="w-full">
                {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Zap className="mr-1.5 h-4 w-4" />
                Generate Report
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Reports aggregate data from the school database and generate PDF documents.</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Available categories:</p>
            <ul className="list-inside list-disc space-y-1">
              <li><Badge variant="default" className="mr-1">Academic</Badge> Exam results</li>
              <li><Badge variant="secondary" className="mr-1">Fee</Badge> Invoices & payments</li>
              <li><Badge variant="destructive" className="mr-1">Finance</Badge> Aggregate overview</li>
              <li><Badge variant="outline" className="mr-1">Attendance</Badge> Daily records</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryTab() {
  const { data: history, isLoading, error } = useReportHistory();
  const { data: definitions } = useReportDefinitions();
  const incrementMutation = useIncrementDownloadCount();

  const getDefName = (defId: number | null) => {
    if (!defId) return "-";
    return definitions?.find((d) => d.id === defId)?.name ?? "-";
  };

  const handleDownload = async (id: number) => {
    try {
      await incrementMutation.mutateAsync(id);
      toast({ title: "Download recorded" });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>;
  }

  if (error) {
    return (
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-muted-foreground">Failed to load history.</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{history?.length ?? 0} generation{(history?.length ?? 0) !== 1 ? "s" : ""}</p>

      {(!history || history.length === 0) ? (
        <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <History className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No reports have been generated yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Definition</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Downloads</TableHead>
                <TableHead className="w-[80px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{getDefName(entry.reportDefinitionId)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.generatedAt ? format(new Date(entry.generatedAt), "MMM d, yyyy HH:mm") : "-"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.fileSize != null ? `${(entry.fileSize / 1024).toFixed(1)} KB` : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{entry.downloadCount}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Record download"
                      onClick={() => handleDownload(entry.id)}
                      disabled={incrementMutation.isPending}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function CacheTab() {
  const cleanMutation = useCleanReportCache();
  const [cleaned, setCleaned] = useState<number | null>(null);

  const handleClean = async () => {
    try {
      const result = await cleanMutation.mutateAsync();
      const count = (result as { deletedCount?: number })?.deletedCount ?? 0;
      setCleaned(count);
      toast({ title: "Cache cleaned", description: `Removed ${count} expired entr${count === 1 ? "y" : "ies"}.` });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Report Cache</CardTitle>
          <CardDescription>Pre-computed report data is stored temporarily for fast retrieval.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span>Cache entries expire automatically based on their TTL.</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <span>Use the clean button to manually purge expired entries.</span>
            </div>
          </div>

          <Button onClick={handleClean} disabled={cleanMutation.isPending} variant="outline" className="w-full">
            {cleanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Trash2 className="mr-1.5 h-4 w-4" />
            Clear Expired Cache
          </Button>

          {cleaned !== null && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Removed {cleaned} expired entr{cleaned === 1 ? "y" : "ies"}.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>How Caching Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>When a report is generated, its data can be cached to avoid re-aggregating the same data on subsequent requests.</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Each cache entry has a unique key derived from definition + parameters.</li>
            <li>Entries expire at the timestamp set during cache creation.</li>
            <li>Expired entries are skipped during lookups and cleaned periodically.</li>
            <li>Cache is entirely optional — reports always work without it.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Layout>
      <div className="space-y-6 p-4 md:p-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Reports</h1>
              <p className="mt-0.5 text-[12px] text-slate-400">Manage report templates, generate PDF reports, and track history.</p>
            </div>
          </div>
        </section>

      <Tabs defaultValue="definitions" className="space-y-6">
        <TabsList>
          <TabsTrigger value="definitions"><FileText className="mr-1.5 h-4 w-4" />Definitions</TabsTrigger>
          <TabsTrigger value="generate"><Zap className="mr-1.5 h-4 w-4" />Generate</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1.5 h-4 w-4" />History</TabsTrigger>
          <TabsTrigger value="cache"><Database className="mr-1.5 h-4 w-4" />Cache</TabsTrigger>
        </TabsList>
        <TabsContent value="definitions"><DefinitionsTab /></TabsContent>
        <TabsContent value="generate"><GenerateTab /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
        <TabsContent value="cache"><CacheTab /></TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}
