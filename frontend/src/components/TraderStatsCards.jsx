import { useMemo } from 'react'
import { formatUsd } from '../api/hyperliquid'
import { getPnlColor } from '../utils/format'
import CoinIcon from './terminal/CoinIcon'

function fmtBig(v) {
  if (v == null || isNaN(v)) return '$0.00'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TraderStatsCards({ traderStats: ts, trading, compact }) {
  const winCount = trading?.winCount || 0
  const totalTrades = trading?.totalTrades || 0
  const winRate = trading?.winRate || 0

  const riskReward = useMemo(() => {
    const trades = trading?.closedTrades
    if (!trades?.length) return { avgWin: 0, avgLoss: 0, ratio: 0 }
    const wins = trades.filter(t => t.pnl > 0)
    const losses = trades.filter(t => t.pnl < 0)
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0
    const ratio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0
    return { avgWin, avgLoss, ratio: Math.round(ratio * 100) / 100 }
  }, [trading?.closedTrades])

  const { mostTradedCoin, profitableDays } = useMemo(() => {
    const trades = trading?.closedTrades
    if (!trades?.length) return { mostTradedCoin: null, profitableDays: null }
    const coinCounts = {}
    const dailyPnl = {}
    for (const t of trades) {
      coinCounts[t.coin] = (coinCounts[t.coin] || 0) + 1
      const day = new Date(t.exitTime || t.entryTime).toDateString()
      dailyPnl[day] = (dailyPnl[day] || 0) + t.pnl
    }
    const topCoin = Object.entries(coinCounts).sort((a, b) => b[1] - a[1])[0]
    const totalDays = Object.keys(dailyPnl).length
    const greenDays = Object.values(dailyPnl).filter(p => p > 0).length
    return {
      mostTradedCoin: topCoin ? { coin: topCoin[0], count: topCoin[1], pct: Math.round((topCoin[1] / trades.length) * 100) } : null,
      profitableDays: totalDays > 0 ? { green: greenDays, total: totalDays, pct: Math.round((greenDays / totalDays) * 100) } : null,
    }
  }, [trading?.closedTrades])

  const longPct = ts?.longPct || 0
  const shortPct = ts?.shortPct || 0

  if (compact) {
    return (
      <div className="trader-stats-col trader-stats-col--compact">
        {/* Row 1 */}
        <div className="trader-row trader-row--2">
          <div className="trader-card">
            <span className="trader-card__label">Perp Equity</span>
            <span className="trader-card__value">{formatUsd(ts?.accountValue || 0)}</span>
            <div className="trader-bar">
              <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${Math.min(ts?.marginUsagePct || 0, 100)}%` }} />
            </div>
          </div>
          <div className="trader-card">
            <span className="trader-card__label">Profitable Days</span>
            <span className="trader-card__value">{profitableDays ? `${profitableDays.pct}%` : '—'}</span>
            <div className="trader-bar">
              <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${profitableDays?.pct || 0}%` }} />
            </div>
          </div>
        </div>
        {/* Row 2 */}
        <div className="trader-row trader-row--2">
          <div className="trader-card">
            <span className="trader-card__label">Win Rate</span>
            <span className="trader-card__value">{winCount} / {totalTrades} ({winRate}%)</span>
            <div className="trader-bar">
              <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${winRate}%` }} />
            </div>
          </div>
          <div className="trader-card">
            <span className="trader-card__label">Direction</span>
            <span className="trader-card__value trader-card__value--direction" style={{
              color: ts?.directionBias === 'LONG' ? 'var(--profit-green)' : ts?.directionBias === 'SHORT' ? 'var(--loss-red)' : 'var(--text)',
            }}>
              {ts?.directionBias === 'SHORT' && <span className="trader-arrow trader-arrow--down" />}
              {ts?.directionBias === 'LONG' && <span className="trader-arrow trader-arrow--up" />}
              {ts?.directionBias || 'NEUTRAL'}
            </span>
            <div className="trader-bar">
              <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${longPct}%` }} />
            </div>
          </div>
        </div>
        {/* Row 3 */}
        <div className="trader-row trader-row--2">
          <div className="trader-card">
            <span className="trader-card__label">Avg Leverage</span>
            <span className="trader-card__value">{(ts?.avgLeverage || 0).toFixed(2)}x</span>
          </div>
          <div className="trader-card">
            <span className="trader-card__label">Most Traded</span>
            <span className="trader-card__value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {mostTradedCoin?.coin && <CoinIcon coin={mostTradedCoin.coin} size={18} />}
              {mostTradedCoin?.coin || '—'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Full version (used in Profile TraderTab)
  return (
    <div className="trader-stats-col">
      {/* Row 1: Perp Equity | uPnL */}
      <div className="trader-row trader-row--2">
        <div className="trader-card">
          <span className="trader-card__label">Perp Equity</span>
          <span className="trader-card__value">{formatUsd(ts?.accountValue || 0)}</span>
          <div className="trader-card__sub">
            <span className="trader-card__sub-label">Margin Usage</span>
            <span className="trader-card__sub-value">{(ts?.marginUsagePct || 0).toFixed(2)}%</span>
          </div>
          <div className="trader-bar">
            <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${Math.min(ts?.marginUsagePct || 0, 100)}%` }} />
          </div>
        </div>
        <div className="trader-card">
          <span className="trader-card__label">uPnL</span>
          <span className="trader-card__value" style={{ color: getPnlColor(ts?.totalUnrealizedPnl || 0) }}>
            {formatUsd(ts?.totalUnrealizedPnl || 0)}
          </span>
          <div className="trader-card__sub">
            <span className="trader-card__sub-label">Win Rate</span>
            <span className="trader-card__sub-value">
              {winCount} / {totalTrades} ({winRate}%)
            </span>
          </div>
          <div className="trader-bar">
            <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${winRate}%` }} />
          </div>
        </div>
      </div>

      {/* Row 2: Direction Bias | Position Distribution */}
      <div className="trader-row trader-row--2">
        <div className="trader-card">
          <span className="trader-card__label">Direction Bias</span>
          <span className="trader-card__value trader-card__value--direction" style={{
            color: ts?.directionBias === 'LONG' ? 'var(--profit-green)' : ts?.directionBias === 'SHORT' ? 'var(--loss-red)' : 'var(--text)',
          }}>
            {ts?.directionBias === 'SHORT' && <span className="trader-arrow trader-arrow--down" />}
            {ts?.directionBias === 'LONG' && <span className="trader-arrow trader-arrow--up" />}
            {ts?.directionBias || 'NEUTRAL'}
          </span>
          <div className="trader-card__sub">
            <span className="trader-card__sub-label">Long Exposure</span>
            <span className="trader-card__sub-value">{Math.round(longPct)}%</span>
          </div>
          <div className="trader-bar">
            <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${longPct}%` }} />
          </div>
        </div>
        <div className="trader-card">
          <span className="trader-card__label">Position Distribution</span>
          <div className="trader-card__value" style={{ display: 'flex', gap: 12 }}>
            <span style={{ color: 'var(--profit-green)' }}>{Math.round(longPct)}%</span>
            <span style={{ color: 'var(--loss-red)' }}>{Math.round(shortPct)}%</span>
          </div>
          <div className="trader-bar-labels">
            <span style={{ color: 'var(--profit-green)' }}>{fmtBig(ts?.longExposure || 0)}</span>
            <span style={{ color: 'var(--loss-red)' }}>{fmtBig(ts?.shortExposure || 0)}</span>
          </div>
          <div className="trader-bar">
            <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${longPct}%` }} />
            <div className="trader-bar__fill trader-bar__fill--red" style={{ width: `${shortPct}%` }} />
          </div>
        </div>
      </div>

      {/* Row 3: Profitable Days | Most Traded */}
      <div className="trader-row trader-row--2">
        <div className="trader-card">
          <span className="trader-card__label">Profitable Days</span>
          <span className="trader-card__value">{profitableDays ? `${profitableDays.pct}%` : '—'}</span>
          <div className="trader-card__sub">
            <span className="trader-card__sub-label">{profitableDays ? `${profitableDays.green} of ${profitableDays.total} days` : ''}</span>
          </div>
          <div className="trader-bar">
            <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${profitableDays?.pct || 0}%` }} />
          </div>
        </div>
        <div className="trader-card">
          <span className="trader-card__label">Most Traded</span>
          <span className="trader-card__value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {mostTradedCoin?.coin && <CoinIcon coin={mostTradedCoin.coin} size={18} />}
            {mostTradedCoin?.coin || '—'}
          </span>
          <div className="trader-card__sub">
            <span className="trader-card__sub-label">{mostTradedCoin?.pct || 0}% of trades</span>
          </div>
          <div className="trader-bar">
            <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${mostTradedCoin?.pct || 0}%` }} />
          </div>
        </div>
      </div>

      {/* Row 4: Avg Leverage + Funding | Risk / Reward */}
      <div className="trader-row trader-row--2">
        <div className="trader-card">
          <div className="trader-mini-stats">
            <div>
              <span className="trader-card__label">Avg Leverage</span>
              <span className="trader-card__value">{(ts?.avgLeverage || 0).toFixed(2)}x</span>
            </div>
            <div>
              <span className="trader-card__label">Funding</span>
              <span className="trader-card__value" style={{ color: getPnlColor(ts?.totalFunding || 0) }}>
                {formatUsd(ts?.totalFunding || 0)}
              </span>
            </div>
          </div>
        </div>
        <div className="trader-card">
          <span className="trader-card__label">Risk / Reward</span>
          <span className="trader-card__value">{riskReward.ratio === Infinity ? '∞' : riskReward.ratio.toFixed(2)}</span>
          <div className="trader-card__sub">
            <span className="trader-card__sub-label">Avg Win</span>
            <span className="trader-card__sub-value" style={{ color: 'var(--profit-green)' }}>{formatUsd(riskReward.avgWin)}</span>
          </div>
          <div className="trader-card__sub">
            <span className="trader-card__sub-label">Avg Loss</span>
            <span className="trader-card__sub-value" style={{ color: 'var(--loss-red)' }}>{formatUsd(riskReward.avgLoss)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
