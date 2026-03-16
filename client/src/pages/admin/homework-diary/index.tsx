import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import confetti from "canvas-confetti";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Share2, Download, Loader2, Lock, Notebook, Sparkles } from "lucide-react";
import { useUser } from "@/hooks/use-auth";
import { ClassSelector } from "./components/class-selector";
import { DatePicker } from "./components/date-picker";
import { DiaryTable } from "./components/diary-table";

export default function HomeworkDiaryPage() {
  const { data: user, isLoading: userLoading } = useUser();

  if (userLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="p-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-slate-400" size={32} />
              <p className="text-slate-600">Loading...</p>
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  if (user?.role !== "admin") {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="p-8 max-w-md text-center">
            <Lock className="mx-auto mb-4 text-red-500" size={48} />
            <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
            <p className="text-slate-600">You do not have permission to access this page.</p>
          </Card>
        </div>
      </Layout>
    );
  }

  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [entries, setEntries] = useState<Array<{
    subject: string;
    topic: string;
    note?: string;
  }>>([]);
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
  const dateLabel = useMemo(() => format(selectedDate, "EEEE, MMMM d, yyyy"), [selectedDate]);

  React.useEffect(() => {
    if (!selectedClass) return;

    const loadDiary = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/admin/homework-diary/${selectedClass}/${dateStr}`,
        );
        if (response.ok) {
          const data = await response.json();
          if (data) {
            setDiaryId(data.id);
            setEntries(data.entries || []);
            setStatus(data.status || "draft");
          } else {
            setDiaryId(null);
            setEntries([]);
            setStatus("draft");
          }
        }
      } catch (err) {
        console.error("Failed to load diary:", err);
      } finally {
        setLoading(false);
      }
    };

    loadDiary();
  }, [selectedClass, dateStr]);

  const handleAddEntry = () => {
    setEntries([...entries, { subject: "", topic: "", note: "" }]);
  };

  const handleUpdateEntry = (index: number, field: string, value: string) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
  };

  const handleRemoveEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const handleSaveDraft = async () => {
    if (!selectedClass) return;
    setLoading(true);

    try {
      if (diaryId) {
        const response = await fetch(`/api/admin/homework-diary/${diaryId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries, status: "draft" }),
        });
        if (response.ok) {
          setStatus("draft");
        }
      } else {
        const response = await fetch("/api/admin/homework-diary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: selectedClass, date: dateStr, entries }),
        });
        if (response.ok) {
          const data = await response.json();
          setDiaryId(data.id);
          setStatus("draft");
        }
      }
    } catch (err) {
      console.error("Failed to save draft:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!diaryId) {
      setLoading(true);
      try {
        const response = await fetch("/api/admin/homework-diary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: selectedClass, date: dateStr, entries }),
        });
        if (response.ok) {
          const data = await response.json();
          setDiaryId(data.id);
          publishDiary(data.id);
        }
      } finally {
        setLoading(false);
      }
    } else {
      publishDiary(diaryId);
    }
  };

  const publishDiary = async (id: number) => {
    setPublishing(true);
    try {
      const response = await fetch(`/api/admin/homework-diary/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      });
      if (response.ok) {
        setStatus("published");
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });

        window.dispatchEvent(new CustomEvent("homework-diary-published", {
          detail: { classId: selectedClass, date: dateStr },
        }));
      }
    } catch (err) {
      console.error("Failed to publish diary:", err);
    } finally {
      setPublishing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Layout>
      <div className="space-y-8">
        <Card className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 p-8 text-white shadow-xl">
          <div className="absolute right-6 top-6 h-24 w-24 rounded-3xl border border-white/10 bg-white/10" />
          <div className="absolute right-12 top-10 h-16 w-16 rounded-2xl border border-white/10 bg-white/5" />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-200">Admin workspace</p>
              <h1 className="text-3xl font-display font-bold">Homework Diary Studio</h1>
              <p className="text-sm text-indigo-100">Create polished homework diaries and publish instantly.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="rounded-full bg-white/10 text-white">Status: {status}</Badge>
              <Badge className="rounded-full border border-white/20 bg-white/5 text-white">{dateLabel}</Badge>
            </div>
          </div>
        </Card>

        <Card className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-lg">
          <div className="grid gap-6 lg:grid-cols-[2fr_2fr_1fr]">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Class</label>
              <ClassSelector value={selectedClass} onChange={setSelectedClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Date</label>
              <DatePicker value={selectedDate} onChange={setSelectedDate} />
            </div>
            <div className="flex items-end">
              <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {selectedClass ? "Ready to edit" : "Select a class"}
              </div>
            </div>
          </div>
        </Card>

        {!selectedClass ? (
          <Card className="p-12 text-center">
            <Notebook className="mx-auto mb-4 text-slate-300" size={48} />
            <p className="text-slate-600 mb-4">Select a class to begin creating homework diary entries</p>
            <ClassSelector value={selectedClass} onChange={setSelectedClass} />
          </Card>
        ) : loading ? (
          <Card className="p-12 text-center">
            <Loader2 className="animate-spin mx-auto mb-4 text-slate-400" size={32} />
            <p className="text-slate-600">Loading diary...</p>
          </Card>
        ) : (
          <>
            <div className="rounded-3xl border border-white/70 bg-white/80 shadow-lg">
              <div className="border-b border-slate-100 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Diary entries</p>
                    <h2 className="text-lg font-semibold text-slate-900">Subjects and tasks</h2>
                  </div>
                  <Button onClick={handleAddEntry} variant="outline" className="gap-2">
                    <Plus size={18} />
                    Add Subject
                  </Button>
                </div>
              </div>
              <div className="p-6">
                <DiaryTable
                  entries={entries}
                  onUpdateEntry={handleUpdateEntry}
                  onRemoveEntry={handleRemoveEntry}
                  subjectColors={subjectColors}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <Sparkles className="h-4 w-4 text-indigo-500" />
                Draft saved entries appear for your selected class and date.
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handlePrint} variant="outline" className="gap-2">
                  <Download size={18} />
                  Print / PDF
                </Button>
                <Button
                  onClick={handleSaveDraft}
                  variant="outline"
                  disabled={loading || !entries.length}
                >
                  {loading ? "Saving..." : "Save Draft"}
                </Button>
                <Button
                  onClick={handlePublish}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
                  disabled={publishing || !entries.length}
                >
                  {publishing ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Publishing...
                    </>
                  ) : (
                    <>
                      <Share2 size={18} />
                      Publish to Students
                    </>
                  )}
                </Button>
              </div>
            </div>

            <style>{`
              @media print {
                body { background: white; }
                .shadow-lg, .shadow-xl { box-shadow: none !important; }
                button, .flex.justify-between, .flex.justify-end { display: none !important; }
              }
            `}</style>
          </>
        )}
      </div>
    </Layout>
  );
}
