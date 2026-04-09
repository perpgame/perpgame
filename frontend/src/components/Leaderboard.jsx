import { useState, useEffect } from 'react'
import TraderCard from './TraderCard'
import { ExploreListSkeleton } from './Skeleton'
import { getUserState, getUserFills, getUserPortfolio, parseAccountValue, parseTotalPnlFromPortfolio, parseClosedTrades, buildLeverageMap, computeTradeStats } from '../api/hyperliquid'

const FEATURED_TRADERS = [
  '0x5d2f4460ac3514ada79f5d9838916e508ab39bb7',
  '0xd5ff5491f6f3c80438e02c281726757baf4d1070',
  '0xfa6af5f4f7440ce389a1e650991eea45c161e13e',
  '0x218a65e21eddeece7a9df38c6bbdd89f692b7da2',
  '0xddc7e50a83710f9c62efb558bcd0f640314ae2f8',
  '0xf625aabf0c9f527697ff2d99b30dd794cfd76b93',
  '0x020ca66c30bec2c4fe3861a94e4db4a498a35872',
  '0x5078c2fbea2b2ad61bc840bc023e35fce56bedb6',
  '0xb9fee4502de61504e5e6e69faa74df7f0ed6d365',
  '0xc2a30212a8ddac9e123944d6e29faddce994e5f2',
]

export default function Leaderboard({ currentUser }) {
  const [traders, setTraders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)

      const results = await Promise.all(
        FEATURED_TRADERS.map(async (addr) => {
          try {
            const [state, fills, portfolioData] = await Promise.all([
              getUserState(addr),
              getUserFills(addr),
              getUserPortfolio(addr).catch(() => null),
            ])
            const accountValue = parseAccountValue(state)
            const leverageMap = buildLeverageMap(state)
            const trades = parseClosedTrades(fills, leverageMap)
            const stats = computeTradeStats(trades)

            // Use portfolio for accurate all-time PnL, fall back to fills
            const portfolioPnl = parseTotalPnlFromPortfolio(portfolioData)
            const totalPnl = portfolioPnl != null ? portfolioPnl : stats.totalPnl

            // Extract volume from portfolio if available
            let volume = 0
            if (portfolioData && Array.isArray(portfolioData)) {
              for (const [label, data] of portfolioData) {
                if (label === 'perpAllTime' || label === 'allTime') {
                  volume = parseFloat(data?.vlm || 0)
                  if (volume) break
                }
              }
            }

            return {
              address: addr,
              accountValue,
              totalPnl,
              winRate: stats.winRate,
              totalTrades: stats.totalTrades,
              volume,
            }
          } catch {
            return { address: addr, accountValue: 0, totalPnl: 0, winRate: 0, totalTrades: 0, volume: 0 }
          }
        })
      )

      results.sort((a, b) => b.totalPnl - a.totalPnl)
      setTraders(results)
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) {
    return <ExploreListSkeleton count={8} />
  }

  return (
    <div>
      {traders.map((t, i) => (
        <TraderCard
          key={t.address}
          address={t.address}
          pnl={t.totalPnl}
          rank={i + 1}
          winRate={t.winRate}
          totalTrades={t.totalTrades}
          volume={t.volume}
          currentUser={currentUser}
        />
      ))}
    </div>
  )
}
