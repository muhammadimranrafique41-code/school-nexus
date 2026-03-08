import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100", className)}
      {...props}
    />
  )
}

export { Skeleton }
