import { useEffect } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { Button } from './button'

/**
 * Reusable modal wrapper — handles overlay, escape key, focus trap, and layout.
 *
 * @param {string}   title       - Modal header title
 * @param {string}   size        - 'sm' | 'lg' (maps to modal-sm / modal-lg)
 * @param {function} onClose     - Called on overlay click, escape, or close button
 * @param {string}   ariaLabel   - Accessible label (defaults to title)
 * @param {boolean}  hideHeader  - Hide the header entirely
 * @param {React.ReactNode} footer - Optional footer content
 * @param {React.ReactNode} children - Modal body content
 */
export function Modal({ title, size = 'sm', onClose, ariaLabel, hideHeader, footer, children, bodyClassName, bodyStyle }) {
  const trapRef = useFocusTrap()

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={ariaLabel || title}>
      <div className={`modal-container modal-${size}`} ref={trapRef} onClick={e => e.stopPropagation()}>
        {!hideHeader && (
          <div className="modal-header">
            <h3>{title}</h3>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="rounded-full text-[var(--text-secondary)]">
              &times;
            </Button>
          </div>
        )}
        <div className={`modal-body ${bodyClassName || ''}`} style={bodyStyle}>
          {children}
        </div>
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
