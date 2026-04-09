import { forwardRef, useState } from "react"
import { cn } from "../../lib/utils"

const Textarea = forwardRef(({
  className,
  wrapperClassName,
  label,
  description,
  isInvalid,
  errorMessage,
  onValueChange,
  minRows = 3,
  maxLength,
  ...props
}, ref) => {
  const [focused, setFocused] = useState(false)

  const handleChange = (e) => {
    props.onChange?.(e)
    onValueChange?.(e.target.value)
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
          "rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 transition-colors",
          focused && "border-[var(--primary)]",
          isInvalid && "border-[var(--loss-red)]",
          wrapperClassName
        )}
      >
        <textarea
          ref={ref}
          rows={minRows}
          maxLength={maxLength}
          className={cn(
            "w-full min-w-0 bg-transparent text-[var(--text)] placeholder:text-[var(--text-secondary)] outline-none resize-none text-sm",
            className
          )}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
          {...props}
          onChange={handleChange}
        />
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
Textarea.displayName = "Textarea"

export { Textarea }
