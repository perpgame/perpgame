import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

const ToastContext = createContext(null)

let nextId = 0

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

function ToastItem({ toast: t, onRemove }) {
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef(null)

  const dismiss = useCallback(() => {
    if (exiting) return
    setExiting(true)
    setTimeout(() => onRemove(t.id), 250)
  }, [t.id, onRemove, exiting])

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, t.duration)
    return () => clearTimeout(timerRef.current)
  }, [t.duration, dismiss])

  return (
    <div
      className={`toast toast--${t.type}${exiting ? ' toast--exit' : ''}`}
      onClick={dismiss}
    >
      <span className="toast-icon">
        {t.type === 'error' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
        {t.type === 'success' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="16 10 10.5 15.5 8 13" />
          </svg>
        )}
        {t.type === 'info' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        )}
      </span>
      <span className="toast-message">{t.message}</span>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((message, type = 'error', duration = 2500) => {
    const id = ++nextId
    setToasts(prev => [...prev.slice(-4), { id, message, type, duration }])
    return id
  }, [])

  const toast = useRef({
    error: (msg) => addToast(msg, 'error'),
    success: (msg) => addToast(msg, 'success'),
    info: (msg) => addToast(msg, 'info'),
  })

  toast.current.error = (msg) => addToast(msg, 'error')
  toast.current.success = (msg) => addToast(msg, 'success')
  toast.current.info = (msg) => addToast(msg, 'info')

  return (
    <ToastContext.Provider value={toast.current}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-container" aria-live="polite" role="status">
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onRemove={removeToast} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
