import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { BookOpen, Clock, Users } from "lucide-react"
import { cn, formatDate } from "@/lib/utils"

interface Assignment {
  id: number
  title: string
  subject: string
  className: string
  dueDate: string
  status: "active" | "closed" | "draft"
  submissionCount: number
  totalStudents: number
}

interface AssignmentListProps {
  assignments?: Assignment[]
  isLoading?: boolean
  onSelect?: (assignment: Assignment) => void
  selectedId?: number | null
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-600 border-slate-200" },
  draft: { label: "Draft", className: "bg-amber-100 text-amber-700 border-amber-200" },
}

export function AssignmentList({ assignments = [], isLoading, onSelect, selectedId }: AssignmentListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-12 text-center">
        <BookOpen className="h-10 w-10 text-slate-300" />
        <p className="text-sm font-semibold text-slate-500">No assignments yet</p>
        <p className="text-xs text-slate-400">Create your first assignment to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {assignments.map((assignment) => {
        const cfg = statusConfig[assignment.status] ?? statusConfig.draft
        const isSelected = selectedId === assignment.id
        return (
          <button
            key={assignment.id}
            onClick={() => onSelect?.(assignment)}
            className={cn(
              "w-full rounded-xl border p-4 text-left transition-all hover:shadow-sm",
              isSelected
                ? "border-indigo-200 bg-indigo-50/60 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900 truncate">{assignment.title}</h4>
                  <Badge variant="outline" className={cn("text-[10px] font-semibold", cfg.className)}>
                    {cfg.label}
                  </Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    {assignment.subject}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {assignment.className}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Due {formatDate(assignment.dueDate, "MMM dd, yyyy")}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold text-slate-900">{assignment.submissionCount}</p>
                <p className="text-[10px] text-slate-400">/ {assignment.totalStudents} submitted</p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
