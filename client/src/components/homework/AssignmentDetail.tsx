import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { BookOpen, Clock, Users, FileText, CalendarDays } from "lucide-react"
import { cn, formatDate } from "@/lib/utils"

interface Assignment {
  id: number
  title: string
  description?: string
  subject: string
  className: string
  dueDate: string
  createdAt?: string
  status: "active" | "closed" | "draft"
  submissionCount: number
  totalStudents: number
  instructions?: string
}

interface AssignmentDetailProps {
  assignment?: Assignment | null
  isLoading?: boolean
}

const statusBadge: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
  draft: "bg-amber-100 text-amber-700 border-amber-200",
}

export function AssignmentDetail({ assignment, isLoading }: AssignmentDetailProps) {
  if (isLoading) {
    return (
      <Card className="border-slate-200/80 bg-white shadow-none">
        <CardHeader className="px-4 py-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-1 h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  if (!assignment) {
    return (
      <Card className="border-slate-200/80 bg-white shadow-none">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <FileText className="h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Select an assignment</p>
          <p className="text-xs text-slate-400">Choose an assignment from the list to view details.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-slate-200/80 bg-white shadow-none">
      <CardHeader className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base font-bold text-slate-900">{assignment.title}</CardTitle>
            <CardDescription className="text-[11px] mt-1">
              {assignment.subject} &middot; {assignment.className}
            </CardDescription>
          </div>
          <Badge variant="outline" className={cn("text-[10px] font-semibold shrink-0", statusBadge[assignment.status])}>
            {assignment.status.charAt(0).toUpperCase() + assignment.status.slice(1)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-center">
            <CalendarDays className="mx-auto h-4 w-4 text-slate-400" />
            <p className="mt-1 text-[10px] text-slate-500">Due Date</p>
            <p className="text-xs font-bold text-slate-900">{formatDate(assignment.dueDate, "MMM dd")}</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-center">
            <Users className="mx-auto h-4 w-4 text-slate-400" />
            <p className="mt-1 text-[10px] text-slate-500">Submissions</p>
            <p className="text-xs font-bold text-slate-900">{assignment.submissionCount}/{assignment.totalStudents}</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-center">
            <Clock className="mx-auto h-4 w-4 text-slate-400" />
            <p className="mt-1 text-[10px] text-slate-500">Created</p>
            <p className="text-xs font-bold text-slate-900">
              {assignment.createdAt ? formatDate(assignment.createdAt, "MMM dd") : "—"}
            </p>
          </div>
        </div>

        {assignment.description && (
          <>
            <Separator />
            <div>
              <h4 className="mb-1.5 text-xs font-bold text-slate-700">Description</h4>
              <p className="text-[13px] text-slate-600 leading-relaxed">{assignment.description}</p>
            </div>
          </>
        )}

        {assignment.instructions && (
          <>
            <Separator />
            <div>
              <h4 className="mb-1.5 text-xs font-bold text-slate-700">Instructions</h4>
              <p className="text-[13px] text-slate-600 leading-relaxed">{assignment.instructions}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
