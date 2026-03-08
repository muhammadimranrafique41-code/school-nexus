import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold tracking-tight transition-all duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0",
  {
    variants: {
      variant: {
        default:
          "border border-white/10 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 text-white shadow-lg shadow-fuchsia-900/25 hover:from-violet-500 hover:via-fuchsia-500 hover:to-pink-500",
        destructive:
          "border border-rose-400/20 bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-lg shadow-rose-900/20 hover:from-rose-500 hover:to-red-500",
        outline:
          "border border-slate-200/80 bg-white/85 text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur-sm hover:border-violet-200 hover:bg-violet-50/80 hover:text-violet-700",
        secondary: "border border-slate-200/80 bg-slate-100/90 text-slate-700 shadow-sm shadow-slate-200/50 hover:bg-slate-200/80",
        ghost: "border border-transparent bg-transparent text-slate-600 shadow-none hover:bg-white/80 hover:text-slate-900",
      },
      // Heights are set as "min" heights, because sometimes Ai will place large amount of content
      // inside buttons. With a min-height they will look appropriate with small amounts of content,
      // but will expand to fit large amounts of content.
      size: {
        default: "min-h-11 px-4 py-2.5",
        sm: "min-h-9 rounded-xl px-3 text-xs",
        lg: "min-h-12 rounded-2xl px-8 text-sm",
        icon: "h-10 w-10 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
