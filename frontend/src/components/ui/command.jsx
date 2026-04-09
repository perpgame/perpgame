import { forwardRef } from "react"
import { Command as CommandPrimitive } from "cmdk"
import { cn } from "../../lib/utils"

const Command = forwardRef(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-[var(--card-radius)] bg-[var(--surface)]",
      className
    )}
    {...props}
  />
))
Command.displayName = "Command"

const CommandInput = forwardRef(({ className, ...props }, ref) => (
  <div className="flex items-center border-b border-[var(--separator)] px-3" cmdk-input-wrapper="">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-third)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-[var(--card-radius)] bg-transparent py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-third)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  </div>
))
CommandInput.displayName = "CommandInput"

const CommandList = forwardRef(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)}
    {...props}
  />
))
CommandList.displayName = "CommandList"

const CommandEmpty = forwardRef((props, ref) => (
  <CommandPrimitive.Empty ref={ref} className="py-6 text-center text-sm text-[var(--text-third)]" {...props} />
))
CommandEmpty.displayName = "CommandEmpty"

const CommandGroup = forwardRef(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn("overflow-hidden p-1", className)}
    {...props}
  />
))
CommandGroup.displayName = "CommandGroup"

const CommandItem = forwardRef(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center rounded-[6px] px-2.5 py-2 text-sm text-[var(--text)] outline-none data-[selected=true]:bg-[var(--surface-hover)] data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
      className
    )}
    {...props}
  />
))
CommandItem.displayName = "CommandItem"

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
}
