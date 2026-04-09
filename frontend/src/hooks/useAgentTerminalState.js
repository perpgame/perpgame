import { useState, useEffect, useCallback, useRef } from 'react'
import { getUserState, getFrontendOpenOrders, parsePositions, parseAccountValue } from '../api/hyperliquid'

export function useAgentTerminalState(agentAddress) {
  const [positions, setPositions] = useState([])
  const [openOrders, setOpenOrders] = useState([])
  const [accountValue, setAccountValue] = useState(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refresh = useCallback(async () => {
    if (!agentAddress) return
    try {
      const [state, orders] = await Promise.all([
        getUserState(agentAddress),
        getFrontendOpenOrders(agentAddress),
      ])
      if (!mountedRef.current) return
      setPositions(parsePositions(state))
      setAccountValue(parseAccountValue(state))
      setOpenOrders(orders || [])
    } catch {
      // ignore
    }
  }, [agentAddress])

  useEffect(() => {
    if (!agentAddress) {
      setPositions([])
      setOpenOrders([])
      setAccountValue(0)
      return
    }
    refresh()
    const interval = setInterval(refresh, 10000)
    return () => clearInterval(interval)
  }, [agentAddress, refresh])

  return { positions, openOrders, accountValue, refresh }
}
