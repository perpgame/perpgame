import { cn } from "../../lib/utils"

function Skeleton({ className, classNames, ...props }) {
  // Support HeroUI-style classNames={{ base: '...' }} for easy migration
  const baseClass = classNames?.base || className
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/5", baseClass)}
      {...props}
    />
  )
}

export { Skeleton }
