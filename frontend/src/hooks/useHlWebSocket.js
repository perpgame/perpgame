import { useEffect, useRef } from 'react'
import { subscribe } from '../api/hyperliquidWs'

export function useHlWebSocket(channel, params, callback, enabled = true) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const paramsKey = JSON.stringify(params)

  useEffect(() => {
    if (!enabled || !channel) return

    const unsub = subscribe(channel, params, (data) => {
      callbackRef.current(data)
    })

    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, paramsKey, enabled])
}
