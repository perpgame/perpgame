import { useState, useEffect, useCallback } from 'react'
import { getL2Book } from '../../api/hyperliquid'
import { useHlWebSocket } from '../../hooks/useHlWebSocket'

function formatBookPrice(p) {
  const n = parseFloat(p)
  if (n >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(4)
}

function formatBookSize(s) {
  const n = parseFloat(s)
  if (n >= 1000) return n.toFixed(1)
  if (n >= 1) return n.toFixed(3)
  return n.toFixed(4)
}

export default function OrderBook({ coin, markPrice }) {
  const [bids, setBids] = useState([])
  const [asks, setAsks] = useState([])

  useEffect(() => {
    if (!coin) return
    let cancelled = false
    async function load() {
      try {
        const data = await getL2Book(coin, 5)
        if (cancelled) return
        if (data?.levels) {
          setBids((data.levels[0] || []).slice(0, 10))
          setAsks((data.levels[1] || []).slice(0, 10))
        }
      } catch { /* ignore */ }
    }
    load()
    return () => { cancelled = true }
  }, [coin])

  useHlWebSocket('l2Book', { coin }, useCallback((data) => {
    if (data?.levels) {
      setBids((data.levels[0] || []).slice(0, 10))
      setAsks((data.levels[1] || []).slice(0, 10))
    }
  }, []))

  // Compute cumulative totals
  const asksWithTotal = [...asks].reverse().map((ask, i, arr) => {
    const sz = parseFloat(ask.sz)
    const prev = i > 0 ? arr[i - 1]._total : 0
    ask._total = prev + sz
    return ask
  })
  const bidsWithTotal = bids.map((bid, i) => {
    const sz = parseFloat(bid.sz)
    const prev = i > 0 ? bids[i - 1]._total : 0
    bid._total = prev + sz
    return bid
  })

  const maxTotal = Math.max(
    asksWithTotal.length ? asksWithTotal[asksWithTotal.length - 1]._total : 0,
    bidsWithTotal.length ? bidsWithTotal[bidsWithTotal.length - 1]._total : 0,
    0.001
  )

  const spread = (bids[0] && asks[0])
    ? parseFloat(asks[0].px) - parseFloat(bids[0].px)
    : null
  const spreadPct = (spread !== null && bids[0])
    ? (spread / parseFloat(bids[0].px) * 100)
    : null

  return (
    <div className="terminal-orderbook">
      <div className="orderbook-col-header">
        <span>Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      <div className="orderbook-asks">
        {asksWithTotal.map((ask, i) => {
          const pct = (ask._total / maxTotal) * 100
          return (
            <div key={i} className="orderbook-row">
              <div className="orderbook-bar ask" style={{ width: `${pct}%` }} />
              <span className="orderbook-price ask">{formatBookPrice(ask.px)}</span>
              <span className="orderbook-size">{formatBookSize(ask.sz)}</span>
              <span className="orderbook-total">{formatBookSize(ask._total)}</span>
            </div>
          )
        })}
      </div>

      <div className="orderbook-mid">
        <span className="orderbook-mid-price">
          {markPrice
            ? '$' + markPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '-'}
        </span>
        {spreadPct !== null && (
          <span className="orderbook-mid-spread">
            Spread {spread.toFixed(2)} ({spreadPct.toFixed(3)}%)
          </span>
        )}
      </div>

      <div className="orderbook-bids">
        {bidsWithTotal.map((bid, i) => {
          const pct = (bid._total / maxTotal) * 100
          return (
            <div key={i} className="orderbook-row">
              <div className="orderbook-bar bid" style={{ width: `${pct}%` }} />
              <span className="orderbook-price bid">{formatBookPrice(bid.px)}</span>
              <span className="orderbook-size">{formatBookSize(bid.sz)}</span>
              <span className="orderbook-total">{formatBookSize(bid._total)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
