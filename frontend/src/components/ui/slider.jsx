import { forwardRef, useCallback, useRef, useEffect } from "react"
import { cn } from "../../lib/utils"

const Slider = forwardRef(({
  className,
  value = 0,
  onChange,
  minValue = 0,
  maxValue = 100,
  step = 1,
  label,
  getValue,
  ...props
}, ref) => {
  const trackRef = useRef(null)
  const dragging = useRef(false)

  const pct = maxValue > minValue
    ? ((value - minValue) / (maxValue - minValue)) * 100
    : 0

  const computeValue = useCallback((clientX) => {
    const track = trackRef.current
    if (!track) return value
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const raw = minValue + ratio * (maxValue - minValue)
    const stepped = Math.round(raw / step) * step
    return Math.max(minValue, Math.min(maxValue, stepped))
  }, [minValue, maxValue, step, value])

  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    const newVal = computeValue(e.clientX)
    if (newVal !== value) onChange?.(newVal)

    const onMove = (ev) => {
      if (!dragging.current) return
      const v = computeValue(ev.clientX)
      if (v !== value) onChange?.(v)
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [computeValue, onChange, value])

  // Also handle native input range as fallback for accessibility
  const handleInputChange = useCallback((e) => {
    onChange?.(Number(e.target.value))
  }, [onChange])

  return (
    <div ref={ref} className={cn("flex flex-col gap-1 w-full", className)} {...props}>
      {(label || getValue) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-sm text-[var(--text-secondary)]">{label}</span>}
          {getValue && <span className="text-sm font-semibold text-[var(--text)]">{getValue(value)}</span>}
        </div>
      )}
      <div
        ref={trackRef}
        className="relative h-5 flex items-center cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
      >
        {/* Track background */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/[0.08]" />
        {/* Filled track */}
        <div
          className="absolute left-0 h-1.5 rounded-full bg-[var(--primary)]"
          style={{ width: `${pct}%` }}
        />
        {/* Thumb */}
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-[var(--primary)] border-2 border-[var(--primary)] -translate-x-1/2 transition-shadow hover:shadow-[0_0_0_4px_rgba(181,239,220,0.15)]"
          style={{ left: `${pct}%` }}
        />
        {/* Hidden native range for accessibility */}
        <input
          type="range"
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          min={minValue}
          max={maxValue}
          step={step}
          value={value}
          onChange={handleInputChange}
          aria-label={label}
        />
      </div>
    </div>
  )
})
Slider.displayName = "Slider"

export { Slider }
