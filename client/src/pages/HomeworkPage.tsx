import { useState } from "react"
import { AssignmentList } from "@/components/homework/AssignmentList"
import { AssignmentDetail } from "@/components/homework/AssignmentDetail"
import { BookOpen } from "lucide-react"

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

const sampleAssignments: Assignment[] = [
  { id: 1, title: "Chapter 5 Exercises", subject: "Mathematics", className: "Class 10", dueDate: "2026-05-20", status: "active", submissionCount: 12, totalStudents: 30 },
  { id: 2, title: "Essay: Climate Change", subject: "English", className: "Class 9", dueDate: "2026-05-18", status: "active", submissionCount: 25, totalStudents: 28 },
  { id: 3, title: "Lab Report: Photosynthesis", subject: "Biology", className: "Class 11", dueDate: "2026-05-25", status: "draft", submissionCount: 0, totalStudents: 25 },
]

export default function HomeworkPage() {
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)

  return (
    <div className="space-y-5 pb-8">
      <section className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Homework</h1>
          <p className="text-[12px] text-slate-400">Create, manage, and review assignments.</p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <AssignmentList
            assignments={sampleAssignments}
            onSelect={(a) => setSelectedAssignment(a)}
            selectedId={selectedAssignment?.id}
          />
        </div>
        <div className="lg:col-span-2">
          <AssignmentDetail assignment={selectedAssignment} />
        </div>
      </div>
    </div>
  )
}
