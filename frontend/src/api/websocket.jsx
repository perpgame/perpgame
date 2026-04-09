import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { getSessionToken } from './backend'

const WsContext = createContext(null)

const INITIAL_RECONNECT_MS = 1000
const MAX_RECONNECT_MS = 30000

function getWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const apiUrl = import.meta.env.VITE_API_URL || '/api'
  // No token in URL — auth is handled via cookie or first message
  if (apiUrl.startsWith('/')) {
    return `${protocol}//${window.location.host}${apiUrl.replace(/\/api$/, '')}/ws`
  }
  return apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '') + '/ws'
}

export function WebSocketProvider({ children, enabled }) {
  const [status, setStatus] = useState('disconnected')
  const wsRef = useRef(null)
  const handlersRef = useRef(new Map())
  const reconnectTimer = useRef(null)
  const reconnectDelay = useRef(INITIAL_RECONNECT_MS)
  const enabledRef = useRef(enabled)
  const mountedRef = useRef(true)

  enabledRef.current = enabled

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!enabledRef.current || !mountedRef.current) return
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return

    cleanup()
    setStatus('connecting')

    try {
      const ws = new WebSocket(getWsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        // Send auth token as first message (server also accepts cookie auth)
        const token = getSessionToken()
        if (token) {
          ws.send(JSON.stringify({ type: 'auth', token }))
        }
        setStatus('connected')
        reconnectDelay.current = INITIAL_RECONNECT_MS
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type) {
            const handlers = handlersRef.current.get(msg.type)
            if (handlers) {
              handlers.forEach(fn => {
                try { fn(msg.data) } catch { /* handler error */ }
              })
            }
          }
        } catch { /* parse error */ }
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setStatus('disconnected')
        wsRef.current = null
        scheduleReconnect()
      }

      ws.onerror = () => {
        // onclose will fire after onerror
      }
    } catch {
      setStatus('disconnected')
      scheduleReconnect()
    }
  }, [cleanup])

  const scheduleReconnect = useCallback(() => {
    if (!enabledRef.current || !mountedRef.current) return
    if (reconnectTimer.current) return

    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null
      if (enabledRef.current && mountedRef.current) {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_MS)
        connect()
      }
    }, reconnectDelay.current)
  }, [connect])

  const disconnect = useCallback(() => {
    cleanup()
    setStatus('disconnected')
    reconnectDelay.current = INITIAL_RECONNECT_MS
  }, [cleanup])

  // Subscribe to a message type. Returns an unsubscribe function.
  const subscribe = useCallback((type, handler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set())
    }
    handlersRef.current.get(type).add(handler)

    return () => {
      const handlers = handlersRef.current.get(type)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          handlersRef.current.delete(type)
        }
      }
    }
  }, [])

  // Connect/disconnect when enabled changes
  useEffect(() => {
    if (enabled) {
      connect()
    } else {
      disconnect()
    }
  }, [enabled, connect, disconnect])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [cleanup])

  // Send a JSON message to the server via WebSocket
  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data))
    }
  }, [])

  const value = { status, subscribe, send, disconnect }

  return (
    <WsContext.Provider value={value}>
      {children}
    </WsContext.Provider>
  )
}

export function useWs() {
  return useContext(WsContext)
}

// Convenience hook: subscribe to a WS message type
export function useWsSubscription(type, handler) {
  const ws = useWs()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!ws) return
    const stableHandler = (data) => handlerRef.current(data)
    return ws.subscribe(type, stableHandler)
  }, [ws, type])
}
