import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Trash2, Save, Send, Loader2 } from "lucide-react";
import confetti from "canvas-confetti";
import { useUser } from "@/hooks/use-auth";
import { buildUrl } from "shared/routes";
import { api } from "shared/routes";

const subjectColors: Record<string, string> = {
  "Urdu": "from-purple-400 to-purple-600",
  "English": "from-blue-400 to-blue-600",
  "Math": "from-orange-400 to-orange-600",
  "Mathematics": "from-orange-400 to-orange-600",
  "Islamiat": "from-green-400 to-green-600",
  "Science": "from-red-400 to-red-600",
  "Social Studies": "from-indigo-400 to-indigo-600",
  "Physical Education": "from-yellow-400 to-yellow-600",
};

interface Question {
  id: string;
  subject: string;
  question: string;
  type: "text" | "richtext" | "checkbox";
}

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
  questions: Question[];
}

export default function AdminDailyDiaryPage() {
  const { classId: classIdParam, date: dateParam } = useParams();
  const [, navigate] = useLocation();
  const { data: user } = useUser();

  const classId = parseInt(classIdParam || "0");
  const currentDate = dateParam || format(new Date(), "yyyy-MM-dd");

  const [template, setTemplate] = useState<DiaryTemplate | null>(null);
  const [diary, setDiary] = useState<DailyDiary | null>(null);
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Fetch templates and diary
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch templates
        const templatesRes = await fetch(`/api/admin/diary-template/${classId}`);
        if (templatesRes.ok) {
          const templates = (await templatesRes.json()) as DiaryTemplate[];
          if (templates.length > 0) {
            setTemplate(templates[0]);
          }
        }

        // Fetch existing diary
        const diaryRes = await fetch(`/api/admin/daily-diary/${classId}/${currentDate}`);
        if (diaryRes.ok) {
          const existingDiary = (await diaryRes.json()) as DailyDiary | null;
          if (existingDiary) {
            setDiary(existingDiary);
            const contentMap: Record<string, string> = {};
            existingDiary.content.forEach((item) => {
              contentMap[item.questionId] = item.answer;
            });
            setContent(contentMap);
          }
        }
      } catch (err) {
        console.error("Failed to fetch data", err);
      } finally {
        setLoading(false);
      }
    };

    if (classId > 0) {
      fetchData();
    }
  }, [classId, currentDate]);

  const handleUpdateAnswer = (questionId: string, answer: string) => {
    setContent((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSaveDraft = async () => {
    if (!template) return;

    try {
      setSaving(true);
      const contentArray = template.questions.map((q) => ({
        questionId: q.id,
        answer: content[q.id] || "",
      }));

      const payload = {
        templateId: template.id,
        classId,
        date: currentDate,
        content: contentArray,
      };

      const endpoint = diary
        ? `/api/admin/daily-diary/${diary.id}`
        : `/api/admin/daily-diary`;
      const method = diary ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to save diary");
      }

      const updated = (await res.json()) as DailyDiary;
      setDiary(updated);
    } catch (err) {
      console.error("Failed to save diary", err);
      alert("Failed to save diary. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!diary) {
      alert("Please save as draft first");
      return;
    }

    try {
      setPublishing(true);
      const res = await fetch(`/api/admin/daily-diary/${diary.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      });

      if (!res.ok) {
        throw new Error("Failed to publish");
      }

      const published = (await res.json()) as DailyDiary;
      setDiary(published);

      // Confetti animation
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      console.error("Failed to publish", err);
      alert("Failed to publish diary. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6">
        <div className="max-w-5xl mx-auto">
          <Card className="p-12 text-center">
            <Loader2 className="animate-spin mx-auto mb-4" size={32} />
            <p className="text-slate-600">Loading...</p>
          </Card>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6">
        <div className="max-w-5xl mx-auto">
          <Button
            onClick={() => navigate("/admin/")}
            variant="ghost"
            className="mb-6 gap-2"
          >
            <ArrowLeft size={18} />
            Back to Dashboard
          </Button>
          <Card className="p-12 text-center">
            <p className="text-slate-600">No template found for this class</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Back Button */}
        <Button
          onClick={() => navigate("/admin/")}
          variant="ghost"
          className="mb-6 gap-2"
        >
          <ArrowLeft size={18} />
          Back to Dashboard
        </Button>

        {/* Gradient Hero Card */}
        <Card className="mb-8 bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-8 rounded-lg">
          <h1 className="text-4xl font-bold mb-2">{template.title}</h1>
          <p className="text-indigo-100 mb-4">
            {format(parseISO(currentDate), "EEEE, MMMM d, yyyy")}
          </p>
          <div className="flex items-center gap-4 text-sm">
            <span className="bg-white/20 px-3 py-1 rounded-full">
              {template.questions.length} questions
            </span>
            <span
              className={`px-3 py-1 rounded-full font-medium ${
                diary?.status === "published"
                  ? "bg-green-400 text-green-900"
                  : "bg-yellow-400 text-yellow-900"
              }`}
            >
              {diary?.status === "published" ? "Published" : "Draft"}
            </span>
          </div>
        </Card>

        {/* Questions Editor */}
        <div className="space-y-4 mb-8">
          {template.questions.map((question) => {
            const gradient = subjectColors[question.subject] || "from-gray-400 to-gray-600";
            return (
              <Card key={question.id} className="overflow-hidden">
                <div className={`bg-gradient-to-r ${gradient} p-4`}>
                  <div className="text-white">
                    <h3 className="font-bold text-lg">{question.subject}</h3>
                    <p className="text-sm opacity-90">{question.question}</p>
                  </div>
                </div>
                <div className="p-6">
                  {question.type === "text" ? (
                    <Input
                      placeholder="Enter answer..."
                      value={content[question.id] || ""}
                      onChange={(e) =>
                        handleUpdateAnswer(question.id, e.target.value)
                      }
                      className="w-full"
                    />
                  ) : question.type === "checkbox" ? (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={content[question.id] === "yes"}
                        onChange={(e) =>
                          handleUpdateAnswer(question.id, e.target.checked ? "yes" : "no")
                        }
                        className="w-5 h-5"
                      />
                      <span className="text-slate-700">Mark as complete</span>
                    </label>
                  ) : (
                    <textarea
                      placeholder="Enter detailed answer..."
                      value={content[question.id] || ""}
                      onChange={(e) =>
                        handleUpdateAnswer(question.id, e.target.value)
                      }
                      className="w-full p-3 border border-slate-300 rounded-lg resize-none"
                      rows={4}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end sticky bottom-6">
          <Button
            onClick={handleSaveDraft}
            disabled={saving || publishing}
            variant="outline"
            size="lg"
            className="gap-2"
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save Draft"}
          </Button>
          <Button
            onClick={handlePublish}
            disabled={!diary || publishing || saving}
            size="lg"
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <Send size={18} />
            {publishing ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
