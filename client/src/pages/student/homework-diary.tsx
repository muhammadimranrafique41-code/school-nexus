import { useState, useEffect } from "react";
import { format, parseISO, addDays, subDays } from "date-fns";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, Loader2, Calendar, BookOpen } from "lucide-react";
import { useUser } from "@/hooks/use-auth";
import { useHomeworkDiaryPublishListener } from "@/hooks/use-homework-diary-socket";

interface DiaryEntry {
  subject: string;
  topic: string;
  note?: string;
}

interface HomeworkDiary {
  id: number;
  classId: number;
  date: string;
  entries: DiaryEntry[];
  status: "draft" | "published";
}

const subjectColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  Urdu:               { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700",  icon: "📖" },
  English:            { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",    icon: "📚" },
  Math:               { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700",  icon: "🔢" },
  Mathematics:        { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700",  icon: "🔢" },
  Islamiat:           { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",   icon: "☪️" },
  Science:            { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",     icon: "🔬" },
  "Social Studies":   { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700",  icon: "🌍" },
  "Physical Education": { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", icon: "⚽" },
};

const getSubjectStyle = (subject: string) =>
  subjectColors[subject] ?? { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", icon: "📝" };

export default function StudentHomeworkDiaryPage() {
  const [, navigate] = useLocation();
  const { data: user } = useUser();

  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const [diaries, setDiaries] = useState<HomeworkDiary[]>([]);
  const [classId, setClassId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Real-time publish listener
  useHomeworkDiaryPublishListener(classId, (published: HomeworkDiary) => {
    setDiaries((prev) => {
      const exists = prev.find((d) => d.id === published.id);
      return exists ? prev.map((d) => (d.id === published.id ? published : d)) : [published, ...prev];
    });
  });

  useEffect(() => {
    if (!user?.className) { setLoading(false); return; }

    const fetchDiaries = async () => {
      try {
        setLoading(true);
        const classRes = await fetch(`/api/v1/classes`);
        if (!classRes.ok) return;

        const classData = (await classRes.json()) as {
          data: Array<{ id: number; grade: string; section: string; stream?: string | null }>;
        };

        const matched = classData.data.find((c) => {
          const full = `${c.grade}-${c.section}${c.stream ? `-${c.stream}` : ""}`;
          return (
            c.grade === user.className ||
            `${c.grade}-${c.section}` === user.className ||
            full === user.className
          );
        });

        if (!matched) return;
        setClassId(matched.id);

        const res = await fetch(`/api/homework-diary/class/${matched.id}`);
        if (res.ok) {
          const list = (await res.json()) as HomeworkDiary[];
          setDiaries(list.filter((d) => d.status === "published"));
        }
      } catch (err) {
        console.error("Failed to fetch homework diaries:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDiaries();
    const interval = setInterval(fetchDiaries, 30000);
    return () => clearInterval(interval);
  }, [user?.className]);

  const currentDiary = diaries.find((d) => d.date === selectedDate);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-cyan-50 p-6 flex items-center justify-center">
        <Card className="p-12 text-center">
          <Loader2 className="animate-spin mx-auto mb-4" size={32} />
          <p className="text-slate-600">Loading homework diary...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-cyan-50 p-6">
      <style>{`
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .print-area { page-break-inside: avoid; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="max-w-4xl mx-auto">
        {/* Back */}
        <Button onClick={() => navigate("/student/")} variant="ghost" className="no-print mb-6 gap-2">
          <ArrowLeft size={18} /> Back to Dashboard
        </Button>

        {/* Hero */}
        <Card className="mb-8 bg-gradient-to-r from-cyan-400 via-cyan-400 to-sky-500 text-white p-8 rounded-xl shadow-lg print-area relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-10">
            <BookOpen size={140} className="text-white" />
          </div>
          <div className="relative z-10">
            <h1 className="text-3xl font-bold mb-1">Homework Diary</h1>
            <p className="text-cyan-100 mb-3">{format(parseISO(selectedDate), "EEEE, MMMM d, yyyy")}</p>
            {currentDiary ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-400 text-green-900 font-semibold text-sm animate-pulse">
                ✅ Available
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-300 text-yellow-900 font-semibold text-sm">
                ⏳ No diary for this date
              </span>
            )}
          </div>
        </Card>

        {/* Date Navigation */}
        <div className="no-print flex justify-between items-center mb-8 gap-4">
          <Button
            onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}
            variant="outline"
            className="gap-2"
          >
            <ChevronLeft size={18} /> Previous
          </Button>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border shadow-sm">
            <Calendar size={18} className="text-slate-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border-0 focus:outline-none text-slate-700"
            />
          </div>
          <Button
            onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}
            variant="outline"
            className="gap-2"
          >
            Next <ChevronRight size={18} />
          </Button>
        </div>

        {/* Content */}
        {!currentDiary ? (
          <Card className="p-12 text-center print-area">
            <BookOpen size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-slate-600 mb-2">
              No homework diary for {format(parseISO(selectedDate), "MMMM d, yyyy")}
            </p>
            {diaries.length === 0 && (
              <p className="text-sm text-slate-400">Check back soon for homework updates</p>
            )}
          </Card>
        ) : (
          <div className="space-y-4 print-area">
            {currentDiary.entries.map((entry, index) => {
              const style = getSubjectStyle(entry.subject);
              return (
                <div key={index} style={{ animation: `fadeInUp 0.6s ease-out ${index * 0.1}s both` }}>
                  <Card className={`border-l-4 overflow-hidden ${style.border} print-area`}>
                    <div className={`${style.bg} p-6`}>
                      <div className="flex items-start gap-4">
                        <div className="text-4xl">{style.icon}</div>
                        <div className="flex-1">
                          <h3 className={`text-xl font-bold ${style.text} mb-1`}>{entry.subject}</h3>
                          <p className="text-slate-700 font-medium">{entry.topic}</p>
                          {entry.note && (
                            <div className="mt-3 p-3 bg-white rounded border border-slate-200">
                              <p className="text-slate-600 text-sm whitespace-pre-wrap">📌 {entry.note}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        )}

        {/* Print */}
        {currentDiary && (
          <div className="no-print flex justify-end mt-8">
            <Button onClick={() => window.print()} variant="outline" className="gap-2">
              <Printer size={18} /> Print / PDF
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
