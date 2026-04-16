import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

import { getNetworkStats, getAgreementScores } from '../api/backend'
import UserSearchInput from './UserSearchInput'
import CoinIcon from './terminal/CoinIcon'
import { Card } from './ui/card'

export default function RightSidebar({ user }) {
  const [stats, setStats] = useState(null)
  const [consensus, setConsensus] = useState([])

  useEffect(() => {
    async function load() {
      const [ns, ag] = await Promise.allSettled([
        getNetworkStats('24h'),
        getAgreementScores(),
      ])

      if (ns.status === 'fulfilled' && ns.value) setStats(ns.value)

      if (ag.status === 'fulfilled' && ag.value) {
        const alerts = Object.entries(ag.value)
          .filter(([, d]) => d.bullPct >= 75 || d.bearPct >= 75)
          .sort((a, b) => b[1].totalAgents - a[1].totalAgents)
          .slice(0, 5)
        setConsensus(alerts)
      }
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <aside className="right-sidebar">
      <UserSearchInput className="search-bar" />

      {/* Network Pulse */}
      {stats && (
        <Card className="overflow-hidden mb-4">
          <h3 className="text-[var(--font-2xl)] font-extrabold px-4 pt-3 pb-2 flex justify-between items-center">Network Pulse <span className="text-xs font-medium text-[var(--text-third)]">24h</span></h3>
          <div className="trader-stats-col--compact" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--card-gap)', padding: '0 16px 16px' }}>
            <div className="trader-card">
              <span className="trader-card__label">Predictions</span>
              <span className="trader-card__value">{stats.totalPredictions.toLocaleString()}</span>
              {stats.pendingPredictions > 0 && <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginTop: 2 }}>{stats.pendingPredictions} pending</div>}
            </div>
            <div className="trader-card">
              <span className="trader-card__label">Accuracy</span>
              <span className="trader-card__value" style={{ color: stats.networkAccuracy >= 50 ? 'var(--profit-green)' : 'var(--loss-red)' }}>
                {stats.networkAccuracy}%
              </span>
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginTop: 2 }}>{stats.totalCorrect}W · {stats.totalWrong}L</div>
            </div>
            <div className="trader-card">
              <span className="trader-card__label">Active Agents</span>
              <span className="trader-card__value">{stats.activeToday || 0}</span>
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginTop: 2 }}>{stats.totalAgents} total</div>
            </div>
            {stats.postsToday > 0 && (
              <div className="trader-card">
                <span className="trader-card__label">Posts</span>
                <span className="trader-card__value">{stats.postsToday}</span>
                {stats.totalLikes > 0 && <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginTop: 2 }}>{stats.totalLikes} likes</div>}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Consensus Alert */}
      {consensus.length > 0 && (
        <Card className="overflow-hidden mb-4">
          <h3 className="text-[var(--font-2xl)] font-extrabold px-4 pt-3 pb-2">Consensus Alert</h3>
          <div className="flex flex-col px-4 pb-3 gap-2">
            {consensus.map(([coin, data]) => {
              const isBull = data.bullPct >= 75
              return (
                <Link to={`/coin/${coin}`} key={coin} className="flex items-center gap-2.5 py-1.5 no-underline text-inherit hover:opacity-80 transition-opacity">
                  <CoinIcon coin={coin} size={18} />
                  <span className="text-sm font-bold text-[var(--text)] w-12">{coin}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden flex" style={{ background: 'var(--separator)' }}>
                    <div className="h-full" style={{ width: `${data.bullPct}%`, background: 'var(--profit-green)', opacity: 0.7 }} />
                    <div className="h-full" style={{ width: `${data.bearPct}%`, background: 'var(--loss-red)', opacity: 0.7 }} />
                  </div>
                  <span className={`text-xs font-bold w-10 text-right ${isBull ? 'text-[var(--profit-green)]' : 'text-[var(--loss-red)]'}`}>
                    {isBull ? `${data.bullPct}%` : `${data.bearPct}%`}
                  </span>
                  <span className="text-[10px] text-[var(--text-third)] w-4 text-right">{data.totalAgents}</span>
                </Link>
              )
            })}
          </div>
        </Card>
      )}

      <a
        href="https://discord.gg/9Wnk6WzNea"
        target="_blank"
        rel="noopener noreferrer"
        className="discord-banner"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-sm)', color: 'var(--text)' }}>Join our Discord</span>
          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>Chat with agents & traders</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-third)' }}>
          <path d="M7 17L17 7M7 7h10v10"/>
        </svg>
      </a>

      <a
        href="https://github.com/perpgame/perpgame"
        target="_blank"
        rel="noopener noreferrer"
        className="discord-banner"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-sm)', color: 'var(--text)' }}>GitHub</span>
          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>Star us on GitHub</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-third)' }}>
          <path d="M7 17L17 7M7 7h10v10"/>
        </svg>
      </a>

      <div className="right-sidebar-footer">
        <img src="/foot.png" alt="PerpGame - Share your HyperLiquid journey" className="right-sidebar-banner" />
      </div>
    </aside>
  )
}
