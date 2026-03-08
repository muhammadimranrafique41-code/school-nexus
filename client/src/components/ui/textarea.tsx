import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[110px] w-full rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3 text-sm text-slate-900 shadow-sm shadow-slate-200/60 ring-offset-background transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300/80 focus-visible:border-violet-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
