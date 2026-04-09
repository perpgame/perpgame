import { useNavigate } from 'react-router-dom'
import { Chip } from './ui/chip'

function coinLogoUrl(ticker) {
  return `https://cdn.jsdelivr.net/gh/madenix/Crypto-logo-cdn@main/Logos/${ticker.toUpperCase()}.svg`
}

export default function PopularCoins({ coins, limit }) {
  const navigate = useNavigate()
  const items = limit ? coins.slice(0, limit) : coins

  if (!items.length) return null

  return (
    <div className="flex flex-col">
      {items.map(a => (
        <div
          key={a.coin}
          onClick={() => navigate(`/coin/${a.coin}`)}
          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--hover-tint)] transition-colors"
        >
          <img src={coinLogoUrl(a.coin)} alt={a.coin} className="w-5 h-5 rounded-full shrink-0" loading="lazy" />
          <span className="font-semibold text-sm text-[var(--text)] flex-1">{a.coin}</span>
          <span className="text-sm text-[var(--text-secondary)] tabular-nums">{a.postCount}</span>
          {a.recentCount > 0 ? (
            <Chip size="sm" className="bg-[var(--primary-faded2)] h-5 px-1.5 text-[var(--profit-green)] font-semibold text-xs">
              ↑{a.recentCount}
            </Chip>
          ) : (
            <span className="text-sm text-[var(--text-secondary)]">—</span>
          )}
        </div>
      ))}
    </div>
  )
}
