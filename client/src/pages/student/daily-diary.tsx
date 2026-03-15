import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { format, parseISO, addDays, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, Loader2, Calendar } from "lucide-react";
import { useUser } from "@/hooks/use-auth";

const subjectIcons: Record<string, string> = {
  "Urdu": "📖",
  "English": "📚",
  "Math": "🔢",
  "Mathematics": "🔢",
  "Islamiat": "☪️",
  "Science": "🔬",
  "Social Studies": "🌍",
  "Physical Education": "⚽",
};

const subjectColors: Record<string, { bg: string; border: string; text: string }> = {
  "Urdu": { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
  "English": { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  "Math": { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  "Mathematics": { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  "Islamiat": { bg: "bg-green-50", border: "border-green-200", text: "text-green-700" },
  "Science": { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
  "Social Studies": { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700" },
  "Physical Education": { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700" },
};

interface DiaryContent {
  questionId: string;
  answer: string;
}

interface DailyDiary {
  id: number;
  templateId: number;
  classId: number;
  date: string;
  content: DiaryContent[];
  status: "draft" | "published";
}

interface DiaryTemplate {
  id: number;
  classId: number;
  title: string;
  questions: Array<{
    id: string;
    subject: string;
    question: string;
    type: string;
  }>;
}

export default function StudentDailyDiaryPage() {
  const { date: dateParam } = useParams();
  const [, navigate] = useLocation();
  const { data: user } = useUser();

  const currentDate = dateParam || format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(currentDate);

  const [diaries, setDiaries] = useState<DailyDiary[]>([]);
  const [templates, setTemplates] = useState<Record<number, DiaryTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [visibleIndex, setVisibleIndex] = useState(0);

  // Fetch diaries
  useEffect(() => {
    const fetchDiaries = async () => {
      if (!user?.className) return;

      try {
        setLoading(true);
        // Get all classes and filter by className
        const classRes = await fetch(`/api/v1/classes`);
        if (!classRes.ok) return;

        const classData = (await classRes.json()) as { data: Array<{ id: number; grade: string; section: string }> };
        const matchedClass = classData.data.find(
          (c) => c.grade === user.className || `${c.grade}-${c.section}` === user.className
        );
        
        if (!matchedClass) {
          console.warn(`No class found for ${user.className}`);
          return;
        }

        const classId = matchedClass.id;

        // Fetch diaries
        const diariesRes = await fetch(`/api/daily-diary/class/${classId}`);
        if (diariesRes.ok) {
          const diariesList = (await diariesRes.json()) as DailyDiary[];
          setDiaries(diariesList);

          // Fetch templates for each diary
          const templateMap: Record<number, DiaryTemplate> = {};
          for (const diary of diariesList) {
            if (!templateMap[diary.templateId]) {
              const templateRes = await fetch(`/api/admin/diary-template/${diary.classId}`);
              if (templateRes.ok) {
                const templatesList = (await templateRes.json()) as DiaryTemplate[];
                const template = templatesList.find((t) => t.id === diary.templateId);
                if (template) {
                  templateMap[diary.templateId] = template;
                }
              }
            }
          }
          setTemplates(templateMap);
        }
      } catch (err) {
        console.error("Failed to fetch diaries", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDiaries();
  }, [user?.className]);

  const currentDiary = diaries.find((d) => d.date === selectedDate);
  const template = currentDiary ? templates[currentDiary.templateId] : null;

  const handlePrevDate = () => {
    const newDate = subDays(parseISO(selectedDate), 1);
    setSelectedDate(format(newDate, "yyyy-MM-dd"));
    setVisibleIndex(0);
  };

  const handleNextDate = () => {
    const newDate = addDays(parseISO(selectedDate), 1);
    setSelectedDate(format(newDate, "yyyy-MM-dd"));
    setVisibleIndex(0);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-cyan-50 p-6 flex items-center justify-center">
        <Card className="p-12 text-center">
          <Loader2 className="animate-spin mx-auto mb-4" size={32} />
          <p className="text-slate-600">Loading diaries...</p>
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
        {/* Back Button */}
        <Button
          onClick={() => navigate("/student/")}
          variant="ghost"
          className="no-print mb-6 gap-2"
        >
          <ArrowLeft size={18} />
          Back to Dashboard
        </Button>

        {/* Gradient Hero Card */}
        <Card className="mb-8 bg-gradient-to-r from-sky-400 to-cyan-500 text-white p-8 rounded-lg print-area">
          <h1 className="text-3xl font-bold mb-2">Daily Diary</h1>
          <p className="text-sky-100 mb-4">
            {format(parseISO(selectedDate), "EEEE, MMMM d, yyyy")}
          </p>
          {currentDiary && (
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1 font-semibold ${
                  currentDiary.status === "published"
                    ? "text-green-200 animate-pulse"
                    : "text-yellow-200"
                }`}
              >
                {currentDiary.status === "published" ? "✅ Published" : "⏳ Draft"}
              </span>
            </div>
          )}
        </Card>

        {/* Navigation */}
        {!loading && diaries.length > 0 && (
          <div className="no-print flex justify-between items-center mb-8 gap-4">
            <Button
              onClick={handlePrevDate}
              variant="outline"
              className="gap-2"
            >
              <ChevronLeft size={18} />
              Previous
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
            <Button
              onClick={handleNextDate}
              variant="outline"
              className="gap-2"
            >
              Next
              <ChevronRight size={18} />
            </Button>
          </div>
        )}

        {/* Main Content */}
        {!currentDiary ? (
          <Card className="p-12 text-center print-area">
            <p className="text-slate-600 mb-4">
              No diary available for {format(parseISO(selectedDate), "MMMM d, yyyy")}
            </p>
            {diaries.length === 0 && (
              <p className="text-sm text-slate-500">Check back soon for homework updates</p>
            )}
          </Card>
        ) : template ? (
          <div className="space-y-4 print-area">
            {template.questions.map((question, index) => {
              const color = subjectColors[question.subject] || subjectColors["English"];
              const icon = subjectIcons[question.subject] || "📝";
              const answer = currentDiary.content.find((c) => c.questionId === question.id)?.answer;

              return (
                <div
                  key={question.id}
                  className={`animate-fade-in-up`}
                  style={{
                    animation: `fadeInUp 0.6s ease-out ${index * 0.1}s both`,
                  }}
                >
                  <Card
                    className={`border-l-4 overflow-hidden ${color.border} print-area`}
                  >
                    <div className={`${color.bg} p-6`}>
                      <div className="flex items-start gap-4">
                        <div className="text-4xl">{icon}</div>
                        <div className="flex-1">
                          <h3 className={`text-xl font-bold ${color.text} mb-1`}>
                            {question.subject}
                          </h3>
                          <p className="text-slate-700">{question.question}</p>
                        </div>
                      </div>
                      {answer && (
                        <div className="mt-4 p-4 bg-white rounded border border-slate-200">
                          <p className="text-slate-700 whitespace-pre-wrap">{answer}</p>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        ) : (
          <Card className="p-12 text-center print-area">
            <p className="text-slate-600">Template information unavailable</p>
          </Card>
        )}

        {/* Print Button */}
        {currentDiary && (
          <div className="no-print flex justify-end gap-4 mt-8">
            <Button
              onClick={handlePrint}
              variant="outline"
              className="gap-2"
            >
              <Printer size={18} />
              Print / PDF
            </Button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
