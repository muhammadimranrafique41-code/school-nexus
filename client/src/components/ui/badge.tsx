import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white",
        secondary: "border-slate-200/70 bg-slate-100/90 text-slate-700",
        destructive:
          "border-rose-200 bg-rose-50 text-rose-700",
        outline: "border-slate-200/80 bg-white/85 text-slate-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants }
