import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { format, parseISO, addDays, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, Loader2, Calendar } from "lucide-react";
import { useUser } from "@/hooks/use-auth";

const subjectIcons: Record<string, string> = {
  Urdu: "📖",
  English: "📚",
  Math: "🔢",
  Mathematics: "🔢",
  Islamiat: "☪️",
  Science: "🔬",
  "Social Studies": "🌍",
  "Physical Education": "⚽",
};

const subjectColors: Record<string, { bg: string; border: string; text: string }> = {
  Urdu: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
  English: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  Math: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  Mathematics: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  Islamiat: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700" },
  Science: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
  "Social Studies": { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700" },
  "Physical Education": { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700" },
};

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

export default function StudentDailyDiaryPage() {
  const { date: dateParam } = useParams();
  const [, navigate] = useLocation();
  const { data: user } = useUser();

  const currentDate = dateParam || format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(currentDate);
  const [diaries, setDiaries] = useState<HomeworkDiary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDiaries = async () => {
      if (!user?.className) return;
      try {
        setLoading(true);

        const classRes = await fetch(`/api/v1/classes`);
        if (!classRes.ok) return;

        const classData = (await classRes.json()) as {
          data: Array<{ id: number; grade: string; section: string; stream?: string | null }>;
        };

        const matchedClass = classData.data.find((c) => {
          const full = `${c.grade}-${c.section}${c.stream ? `-${c.stream}` : ""}`;
          return (
            c.grade === user.className ||
            `${c.grade}-${c.section}` === user.className ||
            full === user.className
          );
        });

        if (!matchedClass) {
          console.warn(`No class found for ${user.className}`);
          return;
        }

        const res = await fetch(`/api/homework-diary/class/${matchedClass.id}`);
        if (res.ok) {
          const list = (await res.json()) as HomeworkDiary[];
          setDiaries(list.filter((d) => d.status === "published"));
        }
      } catch (err) {
        console.error("Failed to fetch homework diaries", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDiaries();
  }, [user?.className]);

  const currentDiary = diaries.find((d) => d.date === selectedDate);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-cyan-50 p-6 flex items-center justify-center">
        <Card className="p-12 text-center">
          <Loader2 className="animate-spin mx-auto mb-4" size={32} />
          <p className="text-slate-600">Loading diary...</p>
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
      `}</style>

      <div className="max-w-4xl mx-auto">
        <Button onClick={() => navigate("/student/")} variant="ghost" className="no-print mb-6 gap-2">
          <ArrowLeft size={18} />
          Back to Dashboard
        </Button>

        <Card className="mb-8 bg-gradient-to-r from-sky-400 to-cyan-500 text-white p-8 rounded-lg print-area">
          <h1 className="text-3xl font-bold mb-2">Homework Diary</h1>
          <p className="text-sky-100 mb-4">{format(parseISO(selectedDate), "EEEE, MMMM d, yyyy")}</p>
          {currentDiary && (
            <span className="inline-flex items-center gap-1 font-semibold text-green-200 animate-pulse">
              ✅ Published
            </span>
          )}
        </Card>

        {/* Date Navigation */}
        <div className="no-print flex justify-between items-center mb-8 gap-4">
          <Button onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))} variant="outline" className="gap-2">
            <ChevronLeft size={18} /> Previous
          </Button>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
            <Calendar size={18} className="text-slate-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border-0 focus:outline-none"
            />
          </div>
          <Button onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))} variant="outline" className="gap-2">
            Next <ChevronRight size={18} />
          </Button>
        </div>

        {/* Content */}
        {!currentDiary ? (
          <Card className="p-12 text-center print-area">
            <p className="text-slate-600 mb-2">
              No diary available for {format(parseISO(selectedDate), "MMMM d, yyyy")}
            </p>
            {diaries.length === 0 && (
              <p className="text-sm text-slate-500">Check back soon for homework updates</p>
            )}
          </Card>
        ) : (
          <div className="space-y-4 print-area">
            {currentDiary.entries.map((entry, index) => {
              const color = subjectColors[entry.subject] ?? subjectColors["English"];
              const icon = subjectIcons[entry.subject] ?? "📝";
              return (
                <div
                  key={index}
                  style={{ animation: `fadeInUp 0.6s ease-out ${index * 0.1}s both` }}
                >
                  <Card className={`border-l-4 overflow-hidden ${color.border} print-area`}>
                    <div className={`${color.bg} p-6`}>
                      <div className="flex items-start gap-4">
                        <div className="text-4xl">{icon}</div>
                        <div className="flex-1">
                          <h3 className={`text-xl font-bold ${color.text} mb-1`}>{entry.subject}</h3>
                          <p className="text-slate-700 font-medium">{entry.topic}</p>
                          {entry.note && (
                            <div className="mt-3 p-3 bg-white rounded border border-slate-200">
                              <p className="text-slate-600 text-sm whitespace-pre-wrap">{entry.note}</p>
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

        {currentDiary && (
          <div className="no-print flex justify-end mt-8">
            <Button onClick={() => window.print()} variant="outline" className="gap-2">
              <Printer size={18} /> Print / PDF
            </Button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
