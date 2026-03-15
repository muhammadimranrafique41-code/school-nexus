import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Calculator,
  FlaskConical,
  Globe2,
  Languages,
  Music2,
  Palette,
  Dumbbell,
  BookText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const subjectStyles: Record<string, { icon: LucideIcon; className: string }> = {
  Mathematics: { icon: Calculator, className: "border-blue-200 bg-blue-50 text-blue-700" },
  Math: { icon: Calculator, className: "border-blue-200 bg-blue-50 text-blue-700" },
  Physics: { icon: FlaskConical, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  Science: { icon: FlaskConical, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  History: { icon: Globe2, className: "border-amber-200 bg-amber-50 text-amber-700" },
  Geography: { icon: Globe2, className: "border-amber-200 bg-amber-50 text-amber-700" },
  Literature: { icon: BookText, className: "border-violet-200 bg-violet-50 text-violet-700" },
  English: { icon: Languages, className: "border-violet-200 bg-violet-50 text-violet-700" },
  Urdu: { icon: Languages, className: "border-violet-200 bg-violet-50 text-violet-700" },
  Art: { icon: Palette, className: "border-pink-200 bg-pink-50 text-pink-700" },
  Music: { icon: Music2, className: "border-pink-200 bg-pink-50 text-pink-700" },
  "Physical Education": { icon: Dumbbell, className: "border-orange-200 bg-orange-50 text-orange-700" },
  General: { icon: BookOpen, className: "border-slate-200 bg-slate-50 text-slate-700" },
};

export function SubjectChip({ subject }: { subject: string }) {
  const config = subjectStyles[subject] ?? subjectStyles.General;
  const Icon = config.icon;

  return (
    <Badge className={cn("gap-2 rounded-full px-3 py-1 text-xs font-semibold", config.className)} variant="outline">
      <Icon className="h-3.5 w-3.5" />
      {subject}
    </Badge>
  );
}
