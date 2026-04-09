
import AssetSelector from './AssetSelector'
import { Chip } from '../ui/chip'

function formatCompact(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

export default function TerminalHeader({ coin, coins, allMids, assetInfo, accountValue, onChangeCoin, children }) {
  const ctx = assetInfo?.ctx
  const markPx = ctx?.markPx ? parseFloat(ctx.markPx) : null
  const mid = allMids[coin] ? parseFloat(allMids[coin]) : markPx

  const prevDayPx = ctx?.prevDayPx ? parseFloat(ctx.prevDayPx) : null
  const currentPx = mid || markPx
  const dayChangePct = (prevDayPx && currentPx)
    ? ((currentPx - prevDayPx) / prevDayPx * 100)
    : null
  const dayChangeUsd = (prevDayPx && currentPx)
    ? (currentPx - prevDayPx)
    : null

  const volume24h = ctx?.dayNtlVlm ? parseFloat(ctx.dayNtlVlm) : null

  return (
    <div className="terminal-header">
      <div className="terminal-header-left">
        <AssetSelector
          coins={coins}
          selected={coin}
          allMids={allMids}
          onSelect={onChangeCoin}
        />

        <div className="terminal-header-price-group">
          {currentPx && (
            <span className="terminal-header-price">
              ${currentPx.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {dayChangePct !== null && (
            <Chip size="sm" className={`${dayChangePct >= 0 ? 'bg-[rgba(181,239,220,0.1)]' : 'bg-[rgba(246,70,93,0.1)]'} text-sm font-bold ${dayChangePct >= 0 ? 'text-[var(--profit-green)]' : 'text-[var(--loss-red)]'}`}>
              {dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%
            </Chip>
          )}
        </div>

        <div className="terminal-header-divider" />

        <div className="terminal-header-stats">
          {dayChangeUsd !== null && (
            <div className="terminal-header-stat">
              <span className="terminal-header-stat-label">24h Change</span>
              <span className="terminal-header-stat-value" style={{ color: dayChangeUsd >= 0 ? 'var(--profit-green)' : 'var(--loss-red)' }}>
                {dayChangeUsd >= 0 ? '+' : ''}{dayChangeUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
          {volume24h !== null && (
            <div className="terminal-header-stat">
              <span className="terminal-header-stat-label">24h Volume</span>
              <span className="terminal-header-stat-value">
                {formatCompact(volume24h)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="terminal-header-right">
        {children}
      </div>
    </div>
  )
}
