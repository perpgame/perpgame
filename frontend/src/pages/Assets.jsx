import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '../components/ui/input'
import { Card } from '../components/ui/card'
import { Chip } from '../components/ui/chip'
import { Button } from '../components/ui/button'
import { getPopularCoins } from '../api/backend'
import { getMetaAndAssetCtxs } from '../api/hyperliquid'
import { formatPrice } from '../utils/format'
import { IconSearch } from '../components/Icons'
import PageHeader from '../components/PageHeader'

function coinLogoUrl(ticker) {
  return `https://cdn.jsdelivr.net/gh/madenix/Crypto-logo-cdn@main/Logos/${ticker.toUpperCase()}.svg`
}

const PAGE_SIZE = 50

export default function Assets() {
  const navigate = useNavigate()
  const [allCoins, setAllCoins] = useState([])
  const [search, setSearch] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)

  useEffect(() => {
    async function fetchAssets() {
      try {
        const [[meta, ctxs], popular] = await Promise.all([
          getMetaAndAssetCtxs(),
          getPopularCoins().catch(() => []),
        ])
        const postCountMap = {}
        const recentCountMap = {}
        for (const p of popular) {
          postCountMap[p.coin] = p.postCount
          recentCountMap[p.coin] = p.recentCount || 0
        }
        const coins = meta.universe.map((u, i) => {
          const markPx = parseFloat(ctxs[i].markPx)
          const prevDayPx = parseFloat(ctxs[i].prevDayPx)
          const dayChange = prevDayPx > 0
            ? ((markPx - prevDayPx) / prevDayPx) * 100
            : 0
          return {
            coin: u.name,
            markPx,
            dayChange,
            postCount: postCountMap[u.name] || 0,
            recentCount: recentCountMap[u.name] || 0,
          }
        })
        coins.sort((a, b) => b.postCount - a.postCount)
        setAllCoins(coins)
      } catch {
        // silently fail
      }
    }
    fetchAssets()
  }, [])

  const isSearching = search.trim().length > 0

  const filtered = useMemo(() => {
    if (!isSearching) return allCoins.slice(0, visible)
    const q = search.trim().toUpperCase()
    return allCoins.filter(c => c.coin.includes(q))
  }, [allCoins, search, visible, isSearching])

  return (
    <div>
      <PageHeader showBack>
        <h2 className="font-bold text-lg px-4 py-3">All Assets</h2>
      </PageHeader>

      <div className="px-3 py-2">
        <Input
          placeholder="Search coins..."
          value={search}
          onValueChange={setSearch}
          startContent={<IconSearch size={16} />}
          isClearable
          onClear={() => setSearch('')}
          wrapperClassName="bg-[var(--surface)] rounded-full h-10"
        />
      </div>

      <Card className="mx-3 overflow-hidden">
        {/* Table header */}
        <div className="flex items-center px-4 py-2.5 text-xs font-medium text-[var(--text-third)] border-b border-[var(--separator)]">
          <span className="flex-1">Coin</span>
          <span className="w-20 text-right">Price</span>
          <span className="w-14 text-right">Posts</span>
          <span className="w-14 text-right">24h</span>
        </div>

        {/* Rows */}
        <div className="flex flex-col">
          {filtered.map(a => (
            <div
              key={a.coin}
              onClick={() => navigate(`/coin/${a.coin}`)}
              className="flex items-center px-4 py-2.5 cursor-pointer hover:bg-[var(--hover-tint)] transition-colors border-b border-[var(--separator-subtle)] last:border-b-0"
            >
              <span className="flex items-center gap-2.5 flex-1 min-w-0">
                <img
                  src={coinLogoUrl(a.coin)}
                  alt={a.coin}
                  className="w-6 h-6 rounded-full shrink-0"
                  loading="lazy"
                  onError={e => { e.target.style.display = 'none' }}
                />
                <span className="font-semibold text-sm text-[var(--text)] truncate">{a.coin}</span>
                {a.dayChange !== 0 && (
                  <span className={`text-xs tabular-nums ${a.dayChange >= 0 ? 'text-[var(--profit-green)]' : 'text-[var(--loss-red)]'}`}>
                    {a.dayChange >= 0 ? '+' : ''}{a.dayChange.toFixed(1)}%
                  </span>
                )}
              </span>
              <span className="w-20 text-right text-sm tabular-nums text-[var(--text-secondary)]">
                {formatPrice(a.markPx)}
              </span>
              <span className="w-14 text-right">
                {a.postCount > 0 ? (
                  <Chip size="sm" className="bg-[var(--primary-faded)] h-5 text-[var(--primary)] text-xs font-medium px-1.5">
                    {a.postCount}
                  </Chip>
                ) : (
                  <span className="text-sm text-[var(--text-third)]">—</span>
                )}
              </span>
              <span className="w-14 text-right">
                {a.recentCount > 0 ? (
                  <Chip size="sm" className="bg-[var(--primary-faded2)] h-5 px-1.5 text-[var(--profit-green)] font-semibold text-xs">
                    ↑{a.recentCount}
                  </Chip>
                ) : (
                  <span className="text-sm text-[var(--text-third)]">—</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {filtered.length === 0 && allCoins.length > 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium text-[var(--text)]">No coins found</p>
            <p className="text-xs text-[var(--text-third)]">Try a different search term</p>
          </div>
        )}

        {!isSearching && visible < allCoins.length && (
          <Button
            variant="ghost"
            onClick={() => setVisible(v => v + PAGE_SIZE)}
            className="w-full text-[var(--primary)] font-semibold text-sm border-t border-[var(--separator)] rounded-none"
          >
            Show more ({allCoins.length - visible} remaining)
          </Button>
        )}
      </Card>
    </div>
  )
}
