import { forwardRef, useState } from "react"
import { cn } from "../../lib/utils"

const Input = forwardRef(({
  className,
  wrapperClassName,
  type,
  startContent,
  endContent,
  label,
  description,
  isInvalid,
  errorMessage,
  isClearable,
  onClear,
  onValueChange,
  size = "default",
  ...props
}, ref) => {
  const [focused, setFocused] = useState(false)

  const sizeClasses = {
    default: "h-10 text-sm",
    sm: "h-8 text-sm",
    lg: "h-12 text-base",
  }

  const handleChange = (e) => {
    props.onChange?.(e)
    onValueChange?.(e.target.value)
  }

  const handleClear = () => {
    onClear?.()
    onValueChange?.("")
  }

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label className="text-[var(--text-secondary)] text-xs font-medium uppercase tracking-wider">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-[var(--border)] bg-transparent px-3 transition-colors",
          focused && "border-[var(--primary)]",
          isInvalid && "border-[var(--loss-red)]",
          sizeClasses[size] || sizeClasses.default,
          wrapperClassName
        )}
      >
        {startContent}
        <input
          type={type}
          ref={ref}
          className={cn(
            "flex-1 min-w-0 bg-transparent text-[var(--text)] placeholder:text-[var(--text-secondary)] outline-none",
            className
          )}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
          {...props}
          onChange={handleChange}
        />
        {isClearable && props.value && (
          <button
            type="button"
            className="text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors shrink-0 cursor-pointer"
            onClick={handleClear}
            tabIndex={-1}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
            </svg>
          </button>
        )}
        {endContent}
      </div>
      {description && !isInvalid && (
        <p className="text-xs text-[var(--text-secondary)]">{description}</p>
      )}
      {isInvalid && errorMessage && (
        <p className="text-xs text-[var(--loss-red)]">{errorMessage}</p>
      )}
    </div>
  )
})
Input.displayName = "Input"

export { Input }
