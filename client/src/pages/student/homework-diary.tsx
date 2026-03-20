import { useEffect, useMemo, useState } from "react";
import { addDays, format, isSameDay, isToday, parseISO, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
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
  CheckCircle2,
  Circle,
  ClipboardList,
} from "lucide-react";
import { useUser } from "@/hooks/use-auth";
import { useHomeworkDiaryPublishListener } from "@/hooks/use-homework-diary-socket";

/* ─── types ──────────────────────────────────────────────────────── */
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

/* ─── subject palette ────────────────────────────────────────────── */
const SUBJECT_MAP: Record<string, {
  accent: string;   // left-border + icon bg
  iconBg: string;
  iconText: string;
  badge: string;
  icon: typeof BookOpen;
}> = {
  Urdu: { accent: "border-l-violet-400", iconBg: "bg-violet-50", iconText: "text-violet-600", badge: "bg-violet-50 text-violet-700 border-violet-200", icon: PenTool },
  English: { accent: "border-l-sky-400", iconBg: "bg-sky-50", iconText: "text-sky-600", badge: "bg-sky-50 text-sky-700 border-sky-200", icon: NotebookText },
  Math: { accent: "border-l-orange-400", iconBg: "bg-orange-50", iconText: "text-orange-600", badge: "bg-orange-50 text-orange-700 border-orange-200", icon: Calculator },
  Mathematics: { accent: "border-l-orange-400", iconBg: "bg-orange-50", iconText: "text-orange-600", badge: "bg-orange-50 text-orange-700 border-orange-200", icon: Calculator },
  Islamiat: { accent: "border-l-emerald-400", iconBg: "bg-emerald-50", iconText: "text-emerald-600", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: BookOpen },
  Science: { accent: "border-l-rose-400", iconBg: "bg-rose-50", iconText: "text-rose-600", badge: "bg-rose-50 text-rose-700 border-rose-200", icon: FlaskConical },
  "Social Studies": { accent: "border-l-indigo-400", iconBg: "bg-indigo-50", iconText: "text-indigo-600", badge: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: Globe2 },
  "Physical Education": { accent: "border-l-amber-400", iconBg: "bg-amber-50", iconText: "text-amber-600", badge: "bg-amber-50 text-amber-700 border-amber-200", icon: BookOpen },
};

const getStyle = (subject: string) =>
  SUBJECT_MAP[subject] ?? {
    accent: "border-l-slate-300", iconBg: "bg-slate-50", iconText: "text-slate-500",
    badge: "bg-slate-50 text-slate-600 border-slate-200", icon: BookOpen,
  };

/* ─── component ──────────────────────────────────────────────────── */
export default function StudentHomeworkDiaryPage() {
  const { data: user } = useUser();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [diaries, setDiaries] = useState<HomeworkDiary[]>([]);
  const [classId, setClassId] = useState<number | null>(null);
  const [classLabel, setClassLabel] = useState<string>("Your class");
  const [loading, setLoading] = useState(true);

  /* real-time updates */
  useHomeworkDiaryPublishListener(classId, (published: HomeworkDiary) => {
    setDiaries(prev => {
      const exists = prev.find(d => d.id === published.id);
      return exists
        ? prev.map(d => (d.id === published.id ? published : d))
        : [published, ...prev];
    });
  });

  /* fetch */
  useEffect(() => {
    if (!user?.className) { setLoading(false); return; }
    const fetchDiaries = async () => {
      try {
        setLoading(true);
        const classRes = await fetch("/api/v1/classes");
        if (!classRes.ok) return;
        const classData = (await classRes.json()) as {
          data: Array<{ id: number; grade: string; section: string; stream?: string | null }>;
        };
        const matched = classData.data.find(c => {
          const full = `${c.grade}-${c.section}${c.stream ? `-${c.stream}` : ""}`;
          return c.grade === user.className || `${c.grade}-${c.section}` === user.className || full === user.className;
        });
        if (!matched) return;
        setClassId(matched.id);
        setClassLabel(`${matched.grade}-${matched.section}${matched.stream ? `-${matched.stream}` : ""}`);
        const res = await fetch(`/api/homework-diary/class/${matched.id}`);
        if (res.ok) {
          const list = (await res.json()) as HomeworkDiary[];
          setDiaries(list.filter(d => d.status === "published"));
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

  /* derived */
  const currentDiary = diaries.find(d => d.date === selectedDate);
  const selectedParsed = parseISO(selectedDate);
  const selectedDateLabel = useMemo(() => format(selectedParsed, "EEEE, MMMM d, yyyy"), [selectedDate]);

  /* week strip: Mon–Sat of current week */
  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedParsed, { weekStartsOn: 1 }); // Monday
    return eachDayOfInterval({ start, end: addDays(start, 5) });    // Mon–Sat
  }, [selectedDate]);

  const hasDiary = (date: Date) =>
    diaries.some(d => d.date === format(date, "yyyy-MM-dd"));

  /* navigation helpers */
  const goTo = (dateStr: string) => setSelectedDate(dateStr);
  const prev = () => goTo(format(subDays(selectedParsed, 1), "yyyy-MM-dd"));
  const next = () => goTo(format(addDays(selectedParsed, 1), "yyyy-MM-dd"));

  /* ── loading ── */
  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[70vh] items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-teal-500" />
            <p className="text-sm text-slate-500 font-medium">Loading diary…</p>
          </div>
        </div>
      </Layout>
    );
  }

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-5 space-y-4">

          {/* ── Top nav bar ── */}
          <div className="flex items-center justify-between">
            <Button asChild variant="ghost" size="sm"
              className="gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 h-8 px-2 text-xs font-medium">
              <Link href="/student">
                <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
              </Link>
            </Button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 h-8 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors">
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </div>

          {/* ── Hero header ── */}
          <div className="relative overflow-hidden rounded-2xl bg-teal-600 px-5 py-5 text-white shadow-lg shadow-teal-100">
            {/* Decorative rings */}
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full border border-white/10 bg-white/5" />
            <div className="absolute -right-1 top-8 h-14 w-14 rounded-full border border-white/10 bg-white/5" />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                    <ClipboardList className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-teal-100">Homework Diary</span>
                </div>
                <h1 className="text-xl font-bold leading-tight tracking-tight">{selectedDateLabel}</h1>
                <p className="text-sm text-teal-100 font-medium">{classLabel}</p>
              </div>

              <div className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold
                ${currentDiary
                  ? "bg-emerald-400/20 text-emerald-100 border border-emerald-300/30"
                  : "bg-white/10 text-teal-100 border border-white/20"
                }`}>
                {currentDiary
                  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Available</>
                  : <><Circle className="h-3.5 w-3.5" /> No entry</>
                }
              </div>
            </div>

            {/* Entry count bar */}
            {currentDiary && (
              <div className="relative z-10 mt-3 flex items-center gap-2">
                <div className="flex -space-x-1">
                  {currentDiary.entries.slice(0, 5).map((e, i) => {
                    const s = getStyle(e.subject);
                    return (
                      <div key={i} className={`h-5 w-5 rounded-full border-2 border-teal-600 ${s.iconBg} flex items-center justify-center`}>
                        <s.icon className={`h-2.5 w-2.5 ${s.iconText}`} />
                      </div>
                    );
                  })}
                  {currentDiary.entries.length > 5 && (
                    <div className="h-5 w-5 rounded-full border-2 border-teal-600 bg-white/20 flex items-center justify-center">
                      <span className="text-[8px] font-bold text-white">+{currentDiary.entries.length - 5}</span>
                    </div>
                  )}
                </div>
                <span className="text-xs text-teal-100">
                  {currentDiary.entries.length} assignment{currentDiary.entries.length !== 1 ? "s" : ""} today
                </span>
              </div>
            )}
          </div>

          {/* ── Week strip ── */}
          <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-6 gap-1">
              {weekDays.map(day => {
                const dStr = format(day, "yyyy-MM-dd");
                const isSelected = dStr === selectedDate;
                const hasEntry = hasDiary(day);
                const todayDay = isToday(day);
                return (
                  <button
                    key={dStr}
                    onClick={() => goTo(dStr)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl py-2 transition-all
                      ${isSelected
                        ? "bg-teal-600 text-white shadow-sm shadow-teal-200"
                        : todayDay
                          ? "bg-teal-50 text-teal-700"
                          : "text-slate-500 hover:bg-slate-50"
                      }`}
                  >
                    <span className={`text-[10px] font-semibold uppercase tracking-wider
                      ${isSelected ? "text-teal-100" : todayDay ? "text-teal-500" : "text-slate-400"}`}>
                      {format(day, "EEE")}
                    </span>
                    <span className={`text-base font-bold leading-none ${isSelected ? "text-white" : ""}`}>
                      {format(day, "d")}
                    </span>
                    {/* dot indicator */}
                    <span className={`h-1 w-1 rounded-full mt-0.5 transition-all
                      ${hasEntry
                        ? isSelected ? "bg-teal-200" : "bg-teal-400"
                        : "bg-transparent"
                      }`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Date navigation ── */}
          <div className="flex items-center gap-2">
            <button onClick={prev}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>

            <Popover>
              <PopoverTrigger asChild>
                <button className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
                  <CalendarDays className="h-3.5 w-3.5 text-teal-500" />
                  {format(selectedParsed, "dd MMM yyyy")}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <CalendarComponent
                  mode="single"
                  selected={selectedParsed}
                  onSelect={date => date && setSelectedDate(format(date, "yyyy-MM-dd"))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <button onClick={next}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* ── Diary entries ── */}
          {!currentDiary ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center shadow-sm">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <BookOpen className="h-6 w-6 text-slate-300" />
              </div>
              <p className="font-semibold text-slate-700 text-sm">No diary for {format(selectedParsed, "MMMM d")}</p>
              <p className="mt-1 text-xs text-slate-400">
                {diaries.length === 0
                  ? "Check back soon for homework updates."
                  : "Try a different date using the calendar above."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* section label */}
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Assignments
                </p>
                <span className="rounded-full bg-teal-50 border border-teal-100 px-2.5 py-0.5 text-[10px] font-bold text-teal-600">
                  {currentDiary.entries.length} total
                </span>
              </div>

              {currentDiary.entries.map((entry, index) => {
                const style = getStyle(entry.subject);
                const Icon = style.icon;
                return (
                  <div
                    key={`${entry.subject}-${index}`}
                    className={`flex gap-0 rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm
                      hover:shadow-md transition-shadow`}
                  >
                    {/* coloured left accent bar */}
                    <div className={`w-1 shrink-0 ${style.accent.replace("border-l-", "bg-")}`} />

                    {/* content */}
                    <div className="flex flex-1 items-start gap-3 px-4 py-3.5">
                      {/* icon */}
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBg}`}>
                        <Icon className={`h-4 w-4 ${style.iconText}`} />
                      </div>

                      {/* text */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
                            {entry.subject}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 leading-snug">{entry.topic}</p>
                        {entry.note && (
                          <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-50 pt-1.5 mt-1.5">
                            {entry.note}
                          </p>
                        )}
                      </div>

                      {/* index badge */}
                      <span className="shrink-0 text-[10px] font-bold text-slate-300 mt-0.5">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* footer summary */}
              <div className="flex items-center gap-2 pt-1 px-1 flex-wrap">
                {currentDiary.entries.map((e, i) => {
                  const s = getStyle(e.subject);
                  return (
                    <span key={i} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.badge}`}>
                      <s.icon className="h-2.5 w-2.5" />
                      {e.subject}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
