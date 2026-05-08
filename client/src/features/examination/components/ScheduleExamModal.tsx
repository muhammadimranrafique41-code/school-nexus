import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreateExamSession } from "../hooks/useExamSessions";

type ClassOption = { id: number; grade: string; section: string; stream?: string | null; academicYear?: string };
type AcademicSessionOption = { id: number; name: string; isCurrent?: boolean };
type SubjectDraft = { subjectName: string; maxTheoryMarks: number; maxPracticalMarks: number; examDate: string };

export function ScheduleExamModal({ classes, academicSessions }: { classes: ClassOption[]; academicSessions: AcademicSessionOption[] }) {
  const [open, setOpen] = useState(false);
  const [subjects, setSubjects] = useState<SubjectDraft[]>([{ subjectName: "English", maxTheoryMarks: 100, maxPracticalMarks: 0, examDate: "" }]);
  const [form, setForm] = useState({
    academicSessionId: academicSessions.find((session) => session.isCurrent)?.id ?? academicSessions[0]?.id ?? 0,
    classId: classes[0]?.id ?? 0,
    examType: "MAT",
    monthLabel: "",
    title: "",
    startDate: "",
    endDate: "",
    totalMarks: 100,
    passingMarks: 40,
  });
  const createExam = useCreateExamSession();
  const { toast } = useToast();

  const updateSubject = (index: number, patch: Partial<SubjectDraft>) => {
    setSubjects((current) => current.map((subject, subjectIndex) => (subjectIndex === index ? { ...subject, ...patch } : subject)));
  };

  const submit = () => {
    createExam.mutate(
      { ...form, subjects },
      {
        onSuccess: () => {
          toast({ title: "Exam scheduled" });
          setOpen(false);
        },
        onError: (error) => toast({ title: "Could not schedule exam", description: error.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />Schedule New Exam</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Schedule New Exam</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Academic Session</Label>
            <Select value={String(form.academicSessionId)} onValueChange={(value) => setForm({ ...form, academicSessionId: Number(value) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{academicSessions.map((session) => <SelectItem key={session.id} value={String(session.id)}>{session.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={String(form.classId)} onValueChange={(value) => setForm({ ...form, classId: Number(value) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{classes.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.grade} {item.section}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Exam Type</Label>
            <Select value={form.examType} onValueChange={(value) => setForm({ ...form, examType: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MAT">MAT</SelectItem>
                <SelectItem value="HALF_YEARLY">Half-Yearly</SelectItem>
                <SelectItem value="ANNUAL">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Month Label</Label><Input value={form.monthLabel} onChange={(event) => setForm({ ...form, monthLabel: event.target.value })} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Title</Label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
          <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></div>
          <div className="space-y-2"><Label>End Date</Label><Input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></div>
          <div className="space-y-2"><Label>Total Marks</Label><Input type="number" value={form.totalMarks} onChange={(event) => setForm({ ...form, totalMarks: Number(event.target.value) })} /></div>
          <div className="space-y-2"><Label>Passing Marks</Label><Input type="number" value={form.passingMarks} onChange={(event) => setForm({ ...form, passingMarks: Number(event.target.value) })} /></div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Subjects</h3><Button variant="outline" size="sm" onClick={() => setSubjects([...subjects, { subjectName: "", maxTheoryMarks: 100, maxPracticalMarks: 0, examDate: "" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button></div>
          {subjects.map((subject, index) => (
            <div key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_120px_120px_150px_36px]">
              <Input placeholder="Subject" value={subject.subjectName} onChange={(event) => updateSubject(index, { subjectName: event.target.value })} />
              <Input type="number" value={subject.maxTheoryMarks} onChange={(event) => updateSubject(index, { maxTheoryMarks: Number(event.target.value) })} />
              <Input type="number" value={subject.maxPracticalMarks} onChange={(event) => updateSubject(index, { maxPracticalMarks: Number(event.target.value) })} />
              <Input type="date" value={subject.examDate} onChange={(event) => updateSubject(index, { examDate: event.target.value })} />
              <Button variant="ghost" size="icon" disabled={subjects.length === 1} onClick={() => setSubjects(subjects.filter((_, subjectIndex) => subjectIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <Button onClick={submit} disabled={createExam.isPending}>{createExam.isPending ? "Saving..." : "Save Exam"}</Button>
      </DialogContent>
    </Dialog>
  );
}
