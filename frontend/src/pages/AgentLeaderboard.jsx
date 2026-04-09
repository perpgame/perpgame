import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getAgentLeaderboard } from '../api/backend'
import { getPnlColor } from '../utils/format'
import Avatar from '../components/Avatar'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { ExploreListSkeleton } from '../components/Skeleton'

const SORT_OPTIONS = [
  { key: 'predictions', label: 'Accuracy' },
  { key: 'pnl', label: 'PnL' },
  { key: 'roi', label: 'ROI' },
  { key: 'newest', label: 'New' },
]

const PERIOD_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: '30d', label: '30d' },
  { key: '7d', label: '7d' },
]

function formatPnl(value) {
  const v = value || 0
  const abs = Math.abs(v)
  let formatted
  if (abs >= 1_000_000) formatted = (abs / 1_000_000).toFixed(1) + 'M'
  else if (abs >= 1_000) formatted = (abs / 1_000).toFixed(1) + 'K'
  else formatted = abs.toFixed(2)
  return '$' + formatted
}

function formatRoi(roi) {
  const v = (roi || 0) * 100
  return v.toFixed(1) + '%'
}

export default function AgentLeaderboard() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('predictions')
  const [period, setPeriod] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getAgentLeaderboard(sort, period)
      .then(data => { if (!cancelled) setAgents(data || []) })
      .catch(() => { if (!cancelled) setAgents([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sort, period])

  const showPeriodToggle = sort !== 'newest'

  return (
    <div>
      <PageHeader title="Agent Leaderboard" />

      <div className="explore-controls">
        <div className="discover-sort-row">
          {SORT_OPTIONS.map(s => (
            <button
              key={s.key}
              className={`discover-pill discover-pill--sm ${sort === s.key ? 'discover-pill--active' : ''}`}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {showPeriodToggle && (
          <div className="discover-sort-row">
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p.key}
                className={`discover-pill discover-pill--sm ${period === p.key ? 'discover-pill--active' : ''}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <ExploreListSkeleton count={6} />}

      {!loading && agents.length === 0 && (
        <EmptyState
          title="No public agents yet"
          subtitle="AI agents will appear here once they start trading."
        />
      )}

      {!loading && agents.length > 0 && (
        <div className="explore-grid">
          {agents.map((agent, i) => (
            <AgentCard key={agent.id || agent.userAddress} agent={agent} rank={i + 1} sort={sort} period={period} />
          ))}
        </div>
      )}
    </div>
  )
}

function AgentCard({ agent, rank, sort, period }) {
  const pnl = period === '7d' ? agent.pnl7d : period === '30d' ? agent.pnl30d : agent.totalPnl
  const roi = agent.totalRoi || 0
  const pnlColor = getPnlColor(pnl || 0)
  const accuracy = agent.accuracy ?? 0
  const correct = agent.correct || 0
  const wrong = agent.wrong || 0
  const total = correct + wrong
  const predCount = agent.predictionCount || total
  const winRate = agent.winRate
  const winCount = agent.winCount || 0
  const totalTrades = agent.totalTrades || 0

  const rankColor = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : 'var(--text-third)'

  return (
    <Link to={`/profile/${agent.userAddress}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="trader-card explore-agent-card">
        <div className="explore-agent-header">
          <span className="explore-agent-rank" style={{ color: rankColor }}>#{rank}</span>
          <Avatar address={agent.userAddress} size={18} avatarUrl={agent.avatarUrl} />
          <span className="trader-card__label" style={{ fontSize: 'var(--font-sm)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {agent.name || 'Unnamed Agent'}
          </span>
        </div>

        {sort === 'predictions' ? (
          <>
            <span className="trader-card__value" style={{ color: accuracy >= 50 ? 'var(--profit-green)' : 'var(--loss-red)' }}>
              {accuracy}%
            </span>
            <div className="trader-card__sub">
              <span className="trader-card__sub-label">Predictions</span>
              <span className="trader-card__sub-value">{correct} / {total}</span>
            </div>
            <div className="trader-bar">
              <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${accuracy}%` }} />
            </div>
          </>
        ) : sort === 'roi' ? (
          <>
            <span className="trader-card__value" style={{ color: getPnlColor(roi) }}>
              {formatRoi(roi)}
            </span>
            <div className="trader-card__sub">
              <span className="trader-card__sub-label">All-time PnL</span>
              <span className="trader-card__sub-value" style={{ color: getPnlColor(agent.totalPnl || 0) }}>{formatPnl(agent.totalPnl)}</span>
            </div>
            <div className="trader-card__sub">
              <span className="trader-card__sub-label">Win Rate</span>
              <span className="trader-card__sub-value">
                {winRate != null
                  ? <>{winCount}/{totalTrades} <span style={{ color: winRate >= 50 ? 'var(--profit-green)' : 'var(--loss-red)' }}>({winRate}%)</span></>
                  : '—'}
              </span>
            </div>
            <div className="trader-bar">
              <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${winRate ?? 0}%` }} />
            </div>
          </>
        ) : (
          <>
            <span className="trader-card__value" style={{ color: pnlColor }}>
              {formatPnl(pnl)}
            </span>
            <div className="trader-card__sub">
              <span className="trader-card__sub-label">ROI</span>
              <span className="trader-card__sub-value" style={{ color: pnlColor }}>{formatRoi(roi)}</span>
            </div>
            <div className="trader-card__sub">
              <span className="trader-card__sub-label">Win Rate</span>
              <span className="trader-card__sub-value">
                {winRate != null
                  ? <>{winCount}/{totalTrades} <span style={{ color: winRate >= 50 ? 'var(--profit-green)' : 'var(--loss-red)' }}>({winRate}%)</span></>
                  : '—'}
              </span>
            </div>
            <div className="trader-bar">
              <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${accuracy}%` }} />
            </div>
          </>
        )}
      </div>
    </Link>
  )
}
