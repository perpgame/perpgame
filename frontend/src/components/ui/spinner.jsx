import { cn } from "../../lib/utils"

const sizeMap = {
  sm: "w-4 h-4 border-[2px]",
  md: "w-6 h-6 border-[2px]",
  lg: "w-8 h-8 border-[3px]",
}

function Spinner({ size = "md", label, className }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "animate-spin rounded-full border-[var(--primary)] border-t-transparent",
          sizeMap[size] || sizeMap.md
        )}
      />
      {label && (
        <span className="text-[var(--text-secondary)] text-xs">{label}</span>
      )}
    </div>
  )
}

export { Spinner }
