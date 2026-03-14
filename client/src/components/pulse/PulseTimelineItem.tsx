import { Button } from "@/components/ui/button";

type PulseStatus = "scheduled" | "completed" | "missed" | "cancelled";

export interface PulseItem {
  id: number;
  period: number;
  subject: string;
  startTime: string;
  endTime: string;
  room: string | null;
  status: PulseStatus;
  markedAt?: string | null;
}

const STATUS_STYLES: Record<PulseStatus, string> = {
  scheduled: "border-l-blue-500 bg-blue-50 text-blue-900",
  completed: "border-l-green-500 bg-green-50 text-green-900",
  missed: "border-l-red-500 bg-red-50 text-red-900",
  cancelled: "border-l-gray-400 bg-gray-50 text-gray-600",
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

interface PulseTimelineItemProps {
  period: PulseItem;
  onMarkComplete: () => void;
  isPending: boolean;
}

export function PulseTimelineItem({ period, onMarkComplete, isPending }: PulseTimelineItemProps) {
  const style = STATUS_STYLES[period.status];

  return (
    <div
      className={`flex items-center justify-between rounded-xl border-l-4 p-4 md:p-6 transition-all hover:shadow-md ${style}`}
    >
      {/* Left: Period badge + details */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-xl font-bold text-white">
          {period.period}
        </div>
        <div>
          <p className="text-lg font-semibold leading-tight">{period.subject}</p>
          <p className="text-sm opacity-70">
            {period.startTime} – {period.endTime}
            {period.room && `  ·  Room ${period.room}`}
          </p>
        </div>
      </div>

      {/* Right: Action or status badge */}
      {period.status === "scheduled" && (
        <Button
          size="sm"
          onClick={onMarkComplete}
          disabled={isPending}
          className="min-w-[130px] bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Mark complete
        </Button>
      )}

      {period.status === "completed" && (
        <span className="rounded-full bg-green-200 px-3 py-1 text-xs font-medium text-green-800">
          Completed {period.markedAt ? formatTime(period.markedAt) : ""}
        </span>
      )}

      {period.status === "missed" && (
        <span className="rounded-full bg-red-200 px-3 py-1 text-xs text-red-800">Missed</span>
      )}

      {period.status === "cancelled" && (
        <span className="rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-700">Cancelled</span>
      )}
    </div>
  );
}

