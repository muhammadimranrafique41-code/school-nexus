import { useMemo } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from "date-fns"
import { cn } from "@/lib/utils"

interface AttendanceDay {
  date: string
  status: "present" | "absent" | "late" | "excused" | "no_record"
}

interface AttendanceCalendarProps {
  year: number
  month: number
  records?: AttendanceDay[]
  onDayClick?: (date: string) => void
}

const statusColors: Record<string, string> = {
  present: "bg-emerald-400 text-white",
  absent: "bg-red-400 text-white",
  late: "bg-amber-400 text-white",
  excused: "bg-sky-400 text-white",
  no_record: "bg-slate-100 text-slate-400",
}

const statusDotColors: Record<string, string> = {
  present: "bg-emerald-500",
  absent: "bg-red-500",
  late: "bg-amber-500",
  excused: "bg-sky-500",
}

export function AttendanceCalendar({ year, month, records = [], onDayClick }: AttendanceCalendarProps) {
  const days = useMemo(() => {
    const start = startOfMonth(new Date(year, month - 1))
    const end = endOfMonth(start)
    return eachDayOfInterval({ start, end })
  }, [year, month])

  const recordMap = useMemo(() => {
    const map = new Map<string, AttendanceDay>()
    records.forEach((r) => map.set(r.date, r))
    return map
  }, [records])

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">
          {format(new Date(year, month - 1), "MMMM yyyy")}
        </h3>
        <div className="flex gap-3">
          {Object.entries(statusDotColors).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${color}`} />
              <span className="text-[10px] capitalize text-slate-500">{key}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {dayNames.map((name) => (
          <div key={name} className="py-1 text-center text-[10px] font-bold uppercase text-slate-400">
            {name}
          </div>
        ))}

        {/* Empty cells for offset */}
        {Array.from({ length: new Date(year, month - 1, 1).getDay() }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd")
          const record = recordMap.get(dateStr)
          const status = record?.status ?? "no_record"

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick?.(dateStr)}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-medium transition-colors",
                statusColors[status],
                isToday(day) && "ring-2 ring-indigo-400 ring-offset-1",
                "hover:opacity-80",
              )}
            >
              <span>{format(day, "d")}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
