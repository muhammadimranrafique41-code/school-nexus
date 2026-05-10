import { useState } from "react"
import { AttendanceCalendar } from "@/components/attendance/AttendanceCalendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ClipboardCheck, CalendarDays } from "lucide-react"

export default function AttendancePage() {
  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [viewYear] = useState(now.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  return (
    <div className="space-y-5 pb-8">
      <section className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Attendance</h1>
          <p className="text-[12px] text-slate-400">Track and manage daily attendance records.</p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={() => setViewMonth((m) => Math.max(1, m - 1))}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium hover:bg-slate-50"
            >
              &larr; Prev
            </button>
            <button
              onClick={() => setViewMonth((m) => Math.min(12, m + 1))}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium hover:bg-slate-50"
            >
              Next &rarr;
            </button>
          </div>
          <AttendanceCalendar
            year={viewYear}
            month={viewMonth}
            onDayClick={(date) => setSelectedDate(date)}
          />
        </div>

        <Card className="border-slate-200/80 bg-white shadow-none">
          <CardHeader className="border-b border-slate-100 px-4 py-3">
            <CardTitle className="text-sm font-semibold text-slate-900">Day Details</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {selectedDate ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CalendarDays className="h-8 w-8 text-indigo-400" />
                <p className="text-sm font-semibold text-slate-700">{selectedDate}</p>
                <p className="text-xs text-slate-400">Click a date on the calendar to view attendance details.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CalendarDays className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-500">No date selected</p>
                <p className="text-xs text-slate-400">Click a date on the calendar to view details.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
