import { forwardRef } from "react"
import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const chipVariants = cva(
  "inline-flex items-center rounded-full whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "",
        flat: "",
        outline: "border",
      },
      size: {
        default: "h-6 px-2 text-xs",
        sm: "h-5 px-1.5 text-[10px]",
        lg: "h-7 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Chip = forwardRef(({ className, variant, size, children, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(chipVariants({ variant, size }), className)}
    {...props}
  >
    {children}
  </span>
))
Chip.displayName = "Chip"

export { Chip, chipVariants }
