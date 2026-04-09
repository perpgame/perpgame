import { forwardRef } from "react"
import { cn } from "../../lib/utils"

const Card = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-[var(--card-radius)] bg-[var(--surface)]", className)}
    {...props}
  />
))
Card.displayName = "Card"

const CardBody = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("p-[var(--card-padding)]", className)}
    {...props}
  />
))
CardBody.displayName = "CardBody"

export { Card, CardBody }
