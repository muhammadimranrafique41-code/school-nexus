import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import confetti from "canvas-confetti";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Share2, Download, Loader2, Lock, Notebook,
  Sparkles, BookOpen, FileText, Send,
} from "lucide-react";
import { useUser } from "@/hooks/use-auth";
import { ClassSelector } from "./components/class-selector";
import { DatePicker } from "./components/date-picker";
import { DiaryTable } from "./components/diary-table";
import { cn } from "@/lib/utils";

export default function HomeworkDiaryPage() {
  const { data: user, isLoading: userLoading } = useUser();

  // ── Loading state ──────────────────────────────────────────────────────
  if (userLoading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            <p className="text-[13px] text-slate-400">Loading…</p>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Access guard ───────────────────────────────────────────────────────
  if (user?.role !== "admin") {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center p-4">
          <Card className="w-full max-w-sm border-rose-100 bg-white shadow-none">
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50">
                <Lock className="h-5 w-5 text-rose-500" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Access Denied</h2>
              <p className="text-[13px] text-slate-400">You don't have permission to access this page.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // ── State ──────────────────────────────────────────────────────────────
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [entries, setEntries] = useState<Array<{ subject: string; topic: string; note?: string }>>([]);
  const [diaryId, setDiaryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<"draft" | "published">("draft");

  const subjectColors: Record<string, { badge: string; text: string }> = {
    Urdu: { badge: "bg-purple-100", text: "text-purple-700" },
    English: { badge: "bg-blue-100", text: "text-blue-700" },
    Math: { badge: "bg-orange-100", text: "text-orange-700" },
    Mathematics: { badge: "bg-orange-100", text: "text-orange-700" },
    Islamiat: { badge: "bg-green-100", text: "text-green-700" },
    Science: { badge: "bg-red-100", text: "text-red-700" },
    "Social Studies": { badge: "bg-indigo-100", text: "text-indigo-700" },
    "Physical Education": { badge: "bg-yellow-100", text: "text-yellow-700" },
  };

  const dateStr = useMemo(() => format(selectedDate, "yyyy-MM-dd"), [selectedDate]);
  const dateLabel = useMemo(() => format(selectedDate, "EEE, MMM d yyyy"), [selectedDate]);

  // ── Load diary on class/date change ───────────────────────────────────
  React.useEffect(() => {
    if (!selectedClass) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/homework-diary/${selectedClass}/${dateStr}`);
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setDiaryId(data.id);
            setEntries(data.entries || []);
            setStatus(data.status || "draft");
          } else {
            setDiaryId(null); setEntries([]); setStatus("draft");
          }
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, [selectedClass, dateStr]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleAddEntry = () => setEntries([...entries, { subject: "", topic: "", note: "" }]);
  const handleUpdateEntry = (i: number, field: string, value: string) => {
    const next = [...entries]; next[i] = { ...next[i], [field]: value }; setEntries(next);
  };
  const handleRemoveEntry = (i: number) => setEntries(entries.filter((_, idx) => idx !== i));

  const handleSaveDraft = async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      if (diaryId) {
        const res = await fetch(`/api/admin/homework-diary/${diaryId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries, status: "draft" }),
        });
        if (res.ok) setStatus("draft");
      } else {
        const res = await fetch("/api/admin/homework-diary", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: selectedClass, date: dateStr, entries }),
        });
        if (res.ok) { const d = await res.json(); setDiaryId(d.id); setStatus("draft"); }
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const publishDiary = async (id: number) => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/homework-diary/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      });
      if (res.ok) {
        setStatus("published");
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        window.dispatchEvent(new CustomEvent("homework-diary-published", { detail: { classId: selectedClass, date: dateStr } }));
      }
    } catch (err) { console.error(err); }
    finally { setPublishing(false); }
  };

  const handlePublish = async () => {
    if (!diaryId) {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/homework-diary", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: selectedClass, date: dateStr, entries }),
        });
        if (res.ok) { const d = await res.json(); setDiaryId(d.id); publishDiary(d.id); }
      } finally { setLoading(false); }
    } else { publishDiary(diaryId); }
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const isPublished = status === "published";

  return (
    <Layout>
      <div className="space-y-4 pb-8">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Homework Diary</h1>
              <p className="text-[12px] text-slate-400">Create and publish daily homework entries per class.</p>
            </div>
          </div>
          {/* Status pill */}
          <span className={cn(
            "inline-flex items-center gap-1.5 self-start rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide sm:self-auto",
            isPublished
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700",
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", isPublished ? "bg-emerald-500" : "bg-amber-500")} />
            {isPublished ? "Published" : "Draft"}
          </span>
        </section>

        {/* ── Controls ─────────────────────────────────────────────────── */}
        <Card className="border-slate-200/80 bg-white shadow-none">
          <CardContent className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
              {/* Class */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Class</label>
                <ClassSelector value={selectedClass} onChange={setSelectedClass} />
              </div>
              {/* Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Date</label>
                <DatePicker value={selectedDate} onChange={setSelectedDate} />
              </div>
              {/* Date display pill */}
              <div className="flex items-end">
                <div className="flex w-full items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  <span className="text-[12px] font-semibold text-slate-700">
                    {selectedClass ? dateLabel : "Select a class to begin"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!selectedClass ? (
          <Card className="border-dashed border-slate-200 bg-white shadow-none">
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                <Notebook className="h-6 w-6 text-slate-300" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-600">No class selected</p>
                <p className="mt-0.5 text-[12px] text-slate-400">Choose a class above to start creating diary entries.</p>
              </div>
              <div className="w-full max-w-xs">
                <ClassSelector value={selectedClass} onChange={setSelectedClass} />
              </div>
            </CardContent>
          </Card>

        ) : loading ? (
          <Card className="border-slate-200/80 bg-white shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-14">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              <p className="text-[12px] text-slate-400">Loading diary…</p>
            </CardContent>
          </Card>

        ) : (
          <>
            {/* ── Diary entries card ────────────────────────────────────── */}
            <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
              <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                    <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-900">Diary Entries</CardTitle>
                    <CardDescription className="text-[11px]">
                      {entries.length} subject{entries.length !== 1 ? "s" : ""} · {dateLabel}
                    </CardDescription>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={handleAddEntry} className="h-8 gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Add Subject</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </CardHeader>

              <CardContent className="p-0">
                {entries.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
                      <Plus className="h-4 w-4 text-slate-300" />
                    </div>
                    <p className="text-[12px] text-slate-400">No entries yet — add a subject to get started.</p>
                  </div>
                ) : (
                  <div className="p-4">
                    <DiaryTable
                      entries={entries}
                      onUpdateEntry={handleUpdateEntry}
                      onRemoveEntry={handleRemoveEntry}
                      subjectColors={subjectColors}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Action bar ────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Hint */}
              <div className="flex items-center gap-2 text-[12px] text-slate-400">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                Draft entries are saved per class and date until published.
              </div>

              {/* Buttons — stacked on mobile, row on sm+ */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 sm:w-auto"
                  onClick={() => window.print()}
                >
                  <Download className="h-3.5 w-3.5" />
                  Print / PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 sm:w-auto"
                  disabled={loading || !entries.length}
                  onClick={handleSaveDraft}
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  {loading ? "Saving…" : "Save Draft"}
                </Button>
                <Button
                  size="sm"
                  className={cn(
                    "w-full gap-1.5 sm:w-auto",
                    isPublished
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-emerald-600 text-white hover:bg-emerald-700",
                  )}
                  disabled={publishing || !entries.length}
                  onClick={handlePublish}
                >
                  {publishing ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Publishing…</>
                  ) : isPublished ? (
                    <><Send className="h-3.5 w-3.5" /> Re-publish</>
                  ) : (
                    <><Share2 className="h-3.5 w-3.5" /> Publish to Students</>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Print styles ────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          body { background: white; }
          .shadow-lg, .shadow-xl, .shadow-md { box-shadow: none !important; }
          nav, header, footer, [data-print-hide] { display: none !important; }
        }
      `}</style>
    </Layout>
  );
}
