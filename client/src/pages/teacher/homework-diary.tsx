import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO, subDays } from "date-fns";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Calculator,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Globe2,
  Loader2,
  NotebookText,
  PenTool,
  Printer,
} from "lucide-react";
import { useHomeworkDiaryPublishListener } from "@/hooks/use-homework-diary-socket";
import { useTeacherHomeworkClasses } from "@/hooks/use-homework";

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

const subjectStyles: Record<
  string,
  { bg: string; border: string; text: string; icon: typeof BookOpen }
> = {
  Urdu: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", icon: PenTool },
  English: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: NotebookText },
  Math: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", icon: Calculator },
  Mathematics: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", icon: Calculator },
  Islamiat: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", icon: BookOpen },
  Science: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", icon: FlaskConical },
  "Social Studies": { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", icon: Globe2 },
  "Physical Education": { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: BookOpen },
};

const getSubjectStyle = (subject: string) =>
  subjectStyles[subject] ?? { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", icon: BookOpen };

export default function TeacherHomeworkDiaryPage() {
  const { data: classPayload, isLoading: classLoading } = useTeacherHomeworkClasses();
  const classOptions = classPayload?.data ?? [];

  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [diaries, setDiaries] = useState<HomeworkDiary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedClass && classOptions.length > 0) {
      setSelectedClass(classOptions[0].id);
    }
  }, [classOptions, selectedClass]);

  useHomeworkDiaryPublishListener(selectedClass, (published: HomeworkDiary) => {
    setDiaries((prev) => {
      const exists = prev.find((d) => d.id === published.id);
      return exists ? prev.map((d) => (d.id === published.id ? published : d)) : [published, ...prev];
    });
  });

  useEffect(() => {
    if (!selectedClass) {
      setLoading(false);
      return;
    }

    const fetchDiaries = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/homework-diary/class/${selectedClass}`);
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
  }, [selectedClass]);

  const currentDiary = diaries.find((d) => d.date === selectedDate);
  const selectedDateLabel = useMemo(
    () => format(parseISO(selectedDate), "EEEE, MMMM d, yyyy"),
    [selectedDate],
  );
  const classLabel = useMemo(() => {
    const selected = classOptions.find((item) => item.id === selectedClass);
    return selected?.label ?? "Select class";
  }, [classOptions, selectedClass]);

  if (classLoading || loading) {
    return (
      <Layout>
        <div className="flex min-h-[70vh] items-center justify-center">
          <Card className="p-10 text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-slate-400" />
            <p className="text-slate-600">Loading homework diary...</p>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-cyan-50 to-slate-50 px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div className="flex items-center justify-between">
            <Button asChild variant="ghost" className="gap-2">
              <Link href="/teacher">
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
              </Link>
            </Button>
            <Button onClick={() => window.print()} variant="outline" className="gap-2">
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
          </div>

          <Card className="relative overflow-hidden rounded-2xl border border-cyan-100 bg-gradient-to-r from-cyan-400 to-sky-500 p-8 text-white shadow-xl">
            <div className="absolute right-6 top-4 h-20 w-20 rounded-2xl border border-white/20 bg-white/10" />
            <div className="absolute right-2 top-2 h-16 w-16 rounded-2xl border border-white/10 bg-white/5" />
            <div className="relative z-10 space-y-2">
              <h1 className="text-3xl font-display font-bold">Homework Diary</h1>
              <p className="text-sm text-cyan-50">{selectedDateLabel}</p>
              <p className="text-xs text-cyan-100">{classLabel}</p>
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  currentDiary ? "bg-emerald-400 text-emerald-950" : "bg-amber-300 text-amber-950"
                }`}
              >
                {currentDiary ? "Available" : "No diary for this date"}
              </span>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <Button
              onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}
              variant="outline"
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={selectedClass ? String(selectedClass) : ""} onValueChange={(value) => setSelectedClass(Number(value))}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder={classOptions.length ? "Select class" : "No classes"} />
                </SelectTrigger>
                <SelectContent>
                  {classOptions.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <CalendarDays className="h-4 w-4 text-slate-500" />
                    {format(parseISO(selectedDate), "dd-MMM-yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <CalendarComponent
                    mode="single"
                    selected={parseISO(selectedDate)}
                    onSelect={(date) => date && setSelectedDate(format(date, "yyyy-MM-dd"))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button
              onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}
              variant="outline"
              className="gap-2"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {!currentDiary ? (
            <Card className="p-10 text-center text-slate-500">
              <BookOpen className="mx-auto mb-4 h-10 w-10 text-slate-300" />
              <p className="text-base font-semibold text-slate-700">
                No homework diary for {format(parseISO(selectedDate), "MMMM d, yyyy")}
              </p>
              {diaries.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">Select a class to view homework diaries.</p>
              ) : null}
            </Card>
          ) : (
            <div className="grid gap-4">
              {currentDiary.entries.map((entry, index) => {
                const style = getSubjectStyle(entry.subject);
                const Icon = style.icon;

                return (
                  <Card key={`${entry.subject}-${index}`} className={`rounded-2xl border ${style.border} ${style.bg} p-6`}>
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm">
                        <Icon className={`h-6 w-6 ${style.text}`} />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div>
                          <p className={`text-lg font-semibold ${style.text}`}>{entry.subject}</p>
                          <p className="text-sm text-slate-700">{entry.topic}</p>
                        </div>
                        {entry.note ? (
                          <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-600">
                            {entry.note}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
