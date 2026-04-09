import { forwardRef, createContext, useContext } from "react"
import { cn } from "../../lib/utils"

const RadioGroupContext = createContext({ value: '', onChange: () => {} })

const RadioGroup = forwardRef(({ className, value, onValueChange, children, ...props }, ref) => (
  <RadioGroupContext.Provider value={{ value, onChange: onValueChange }}>
    <div
      ref={ref}
      role="radiogroup"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    >
      {children}
    </div>
  </RadioGroupContext.Provider>
))
RadioGroup.displayName = "RadioGroup"

const Radio = forwardRef(({ className, value, children, ...props }, ref) => {
  const group = useContext(RadioGroupContext)
  const isSelected = group.value === value

  return (
    <label
      ref={ref}
      className={cn(
        "flex items-center gap-3 max-w-full m-0 p-3 rounded-lg border cursor-pointer bg-transparent transition-colors hover:bg-[var(--surface)]",
        isSelected ? "border-[var(--primary)]" : "border-[var(--border)]",
        className
      )}
      {...props}
    >
      <span className={cn(
        "flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0 transition-colors",
        isSelected ? "border-[var(--primary)]" : "border-[var(--text-secondary)]"
      )}>
        {isSelected && (
          <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />
        )}
      </span>
      <span className="text-[var(--text)]">{children}</span>
      <input
        type="radio"
        className="sr-only"
        value={value}
        checked={isSelected}
        onChange={() => group.onChange?.(value)}
      />
    </label>
  )
})
Radio.displayName = "Radio"

export { RadioGroup, Radio }
