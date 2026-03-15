import { Link } from "wouter";
import { BookOpen, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useUser } from "@/hooks/use-auth";

export default function DailyDiaryCard() {
  const { data: user } = useUser();
  const [publishStatus, setPublishStatus] = useState<"available" | "pending">("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkDiaryStatus = async () => {
      if (!user?.className) return;

      try {
        // Get all classes and filter by className
        const classRes = await fetch(`/api/v1/classes`);
        if (!classRes.ok) return;

        const classData = (await classRes.json()) as { data: Array<{ id: number; grade: string; section: string; stream?: string | null }> };
        const matchedClass = classData.data.find((c) => {
          const full = `${c.grade}-${c.section}${c.stream ? `-${c.stream}` : ""}`;
          return (
            c.grade === user.className ||
            `${c.grade}-${c.section}` === user.className ||
            full === user.className
          );
        });

        if (!matchedClass) return;

        const classId = matchedClass.id;

        // Check today's homework diary
        const today = format(new Date(), "yyyy-MM-dd");
        const diaryRes = await fetch(`/api/homework-diary/${classId}/${today}`);
        if (diaryRes.ok) {
          const diary = (await diaryRes.json()) as { status: string } | null;
          if (diary?.status === "published") {
            setPublishStatus("available");
          }
        }
      } catch (err) {
        console.error("Failed to check diary status", err);
      } finally {
        setLoading(false);
      }
    };

    checkDiaryStatus();

    // Poll every 30 seconds
    const interval = setInterval(checkDiaryStatus, 30000);
    return () => clearInterval(interval);
  }, [user?.className]);

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <Link href={`/student/daily-diary/${today}`}>
      <div className="group cursor-pointer">
        <div className="bg-gradient-to-br from-cyan-400 via-cyan-400 to-sky-500 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 min-h-[200px] flex flex-col justify-between relative overflow-hidden">
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 opacity-10">
            <BookOpen size={120} className="text-white" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-white/20 rounded-lg backdrop-blur">
                <BookOpen size={24} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Daily Diary</h3>
                <p className="text-cyan-100 text-sm">Today's homework</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 space-y-4">
            <div>
              <p className="text-cyan-100 text-sm mb-2">Status</p>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-semibold text-sm transition-all ${
                    publishStatus === "available"
                      ? "bg-green-400 text-green-900 animate-pulse"
                      : "bg-yellow-300 text-yellow-900"
                  }`}
                >
                  {publishStatus === "available" ? "✅ Available" : "⏳ Pending"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-white group-hover:gap-3 transition-all">
              <span className="text-sm font-medium">View Diary</span>
              <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
