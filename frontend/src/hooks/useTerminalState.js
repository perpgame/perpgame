import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
import { getUserState, getFrontendOpenOrders, parsePositions, parseAccountValue } from '../api/hyperliquid'
import { useHlWebSocket } from './useHlWebSocket'

export function useTerminalState(coin) {
  const { address } = useAccount()
  const [positions, setPositions] = useState([])
  const [openOrders, setOpenOrders] = useState([])
  const [accountValue, setAccountValue] = useState(0)
  const [markPrice, setMarkPrice] = useState(null)
  const [allMids, setAllMids] = useState({})
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Fetch user positions and orders
  const refresh = useCallback(async () => {
    if (!address) return
    try {
      const [state, orders] = await Promise.all([
        getUserState(address),
        getFrontendOpenOrders(address),
      ])
      if (!mountedRef.current) return
      setPositions(parsePositions(state))
      setAccountValue(parseAccountValue(state))
      setOpenOrders(orders || [])
    } catch {
      // ignore
    }
  }, [address])

  // Initial load + poll every 10s
  useEffect(() => {
    if (!address) {
      setPositions([])
      setOpenOrders([])
      setAccountValue(0)
      return
    }
    refresh()
    const interval = setInterval(refresh, 10000)
    return () => clearInterval(interval)
  }, [address, refresh])

  // Subscribe to allMids for live prices
  useHlWebSocket('allMids', {}, useCallback((data) => {
    if (data?.mids) {
      setAllMids(data.mids)
    }
  }, []))

  // Derive mark price from allMids
  useEffect(() => {
    if (coin && allMids[coin]) {
      setMarkPrice(parseFloat(allMids[coin]))
    }
  }, [coin, allMids])

  // Get current coin's position
  const currentPosition = positions.find(p => p.coin === coin) || null

  return {
    positions,
    openOrders,
    accountValue,
    markPrice,
    allMids,
    currentPosition,
    refresh,
  }
}
