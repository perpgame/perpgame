import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(active = true) {
  const ref = useRef(null)

  useEffect(() => {
    if (!active || !ref.current) return

    const container = ref.current
    const focusable = () => [...container.querySelectorAll(FOCUSABLE)]
    const previouslyFocused = document.activeElement

    // Focus first focusable element
    const elements = focusable()
    if (elements.length > 0) {
      elements[0].focus()
    }

    function handleKeyDown(e) {
      if (e.key !== 'Tab') return
      const els = focusable()
      if (els.length === 0) return

      const first = els[0]
      const last = els[els.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused && previouslyFocused.focus) {
        previouslyFocused.focus()
      }
    }
  }, [active])

  return ref
}
