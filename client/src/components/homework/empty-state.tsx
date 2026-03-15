import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { Link } from "wouter";

export function HomeworkEmptyState({ ctaHref }: { ctaHref: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/70 px-6 py-12 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-100 to-indigo-100">
        <BookOpen className="h-10 w-10 text-indigo-500" />
      </div>
      <h3 className="mt-6 text-xl font-semibold text-slate-900">No homework assigned yet</h3>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        Kickstart the class by assigning the first homework set. Students will see the update instantly.
      </p>
      <Button asChild className="mt-6 h-11 rounded-full px-6">
        <Link href={ctaHref}>Create first assignment</Link>
      </Button>
      <svg
        className="mt-10 w-full max-w-md text-slate-200"
        viewBox="0 0 400 120"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M20 80C60 20 140 20 180 70C220 120 300 120 380 40"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="12 16"
        />
        <circle cx="60" cy="40" r="8" fill="currentColor" />
        <circle cx="200" cy="90" r="6" fill="currentColor" />
        <circle cx="340" cy="30" r="10" fill="currentColor" />
      </svg>
    </div>
  );
}
