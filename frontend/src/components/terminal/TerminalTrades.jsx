import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { getUserFills, getUserState, parseClosedTrades, buildLeverageMap } from '../../api/hyperliquid'
import TradeList from '../TradeList'

export default function TerminalTrades({ coin, address: addressProp }) {
  const { address: walletAddress } = useAccount()
  const address = addressProp || walletAddress
  const [trades, setTrades] = useState([])

  useEffect(() => {
    if (!address) return
    let cancelled = false

    async function load() {
      try {
        const [fills, state] = await Promise.all([
          getUserFills(address),
          getUserState(address),
        ])
        if (cancelled) return
        const leverageMap = buildLeverageMap(state)
        let closed = parseClosedTrades(fills, leverageMap)
        if (coin) {
          closed = closed.filter(t => t.coin === coin)
        }
        setTrades(closed.slice(0, 50))
      } catch { /* ignore */ }
    }

    load()
    const interval = setInterval(load, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [address, coin])

  if (!trades.length) {
    return (
      <div className="terminal-panel-empty">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        No trade history
      </div>
    )
  }

  return <TradeList trades={trades} />
}
