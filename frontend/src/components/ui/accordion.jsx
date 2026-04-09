import { forwardRef, useState, createContext, useContext } from "react"
import { cn } from "../../lib/utils"

const AccordionContext = createContext({ expanded: new Set(), toggle: () => {} })

const Accordion = forwardRef(({ className, children, defaultExpandedKeys = [], ...props }, ref) => {
  const [expanded, setExpanded] = useState(() => new Set(defaultExpandedKeys))

  const toggle = (key) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <AccordionContext.Provider value={{ expanded, toggle }}>
      <div ref={ref} className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  )
})
Accordion.displayName = "Accordion"

const AccordionItem = forwardRef(({ className, title, children, itemKey, ...props }, ref) => {
  const { expanded, toggle } = useContext(AccordionContext)
  const isExpanded = expanded.has(itemKey)

  return (
    <div ref={ref} className={cn("w-full", className)} {...props}>
      <button
        type="button"
        className="flex items-center justify-between w-full py-2 text-sm font-medium text-[var(--text-secondary)] cursor-pointer"
        onClick={() => toggle(itemKey)}
        aria-expanded={isExpanded}
      >
        {title}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("transition-transform", isExpanded && "rotate-180")}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {isExpanded && (
        <div className="flex flex-col gap-2 pb-0">
          {children}
        </div>
      )}
    </div>
  )
})
AccordionItem.displayName = "AccordionItem"

export { Accordion, AccordionItem }
