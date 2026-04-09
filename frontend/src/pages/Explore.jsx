import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { getTopTraders, getLeaderboard, getFollowing, getUserCount, getPredictionLeaderboard } from '../api/backend'
import { getUserState, parsePositions } from '../api/hyperliquid'
import { useFollow } from '../hooks/useFollow'
import { getUserDisplayName } from '../utils/user'
import Avatar from '../components/Avatar'
import CoinIcon from '../components/terminal/CoinIcon'
import PageHeader from '../components/PageHeader'
import { ExploreListSkeleton } from '../components/Skeleton'
import FollowButton from '../components/FollowButton'
import EmptyState from '../components/EmptyState'
import UserSearchInput from '../components/UserSearchInput'
import { Chip } from '../components/ui/chip'

function formatPnl(value) {
  const v = value || 0
  const abs = Math.abs(v)
  let formatted
  if (abs >= 1_000_000) formatted = (abs / 1_000_000).toFixed(1) + 'M'
  else if (abs >= 1_000) formatted = (abs / 1_000).toFixed(1) + 'K'
  else formatted = abs.toFixed(2)
  return (v >= 0 ? '+$' : '-$') + formatted
}

function formatAccountValue(value) {
  const v = value || 0
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return '$' + (v / 1_000).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}

function formatRoi(roi) {
  const v = (roi || 0) * 100
  const prefix = v >= 0 ? '+' : ''
  return prefix + v.toFixed(1) + '%'
}


const ACCOUNT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: '100k', label: '$100K+', min: 100_000 },
  { key: '10k', label: '$10K+', min: 10_000 },
  { key: '1k', label: '$1K+', min: 1_000 },
]

const PNL_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'profit', label: 'Profitable', check: t => (t.totalPnl || 0) > 0 },
  { key: '100k', label: 'PnL $100K+', check: t => (t.totalPnl || 0) >= 100_000 },
  { key: '10k', label: 'PnL $10K+', check: t => (t.totalPnl || 0) >= 10_000 },
]

const SORT_OPTIONS = [
  { key: 'pnl', label: 'PnL', sort: (a, b) => (b.totalPnl || 0) - (a.totalPnl || 0) },
  { key: 'roi', label: 'ROI', sort: (a, b) => (b.totalRoi || 0) - (a.totalRoi || 0) },
  { key: 'account', label: 'Account', sort: (a, b) => (b.accountValue || 0) - (a.accountValue || 0) },
  { key: 'positions', label: 'Positions', sort: (a, b) => (b._coins?.length || 0) - (a._coins?.length || 0) },
]

export default function Explore({ user }) {
  const [tab, setTab] = useState('predictions')
  const [traders, setTraders] = useState([])
  const [loading, setLoading] = useState(true)
  const [followingSet, setFollowingSet] = useState(new Set())
  const [userCount, setUserCount] = useState(null)
  const [predictions, setPredictions] = useState([])
  const [predictionsLoading, setPredictionsLoading] = useState(false)

  // Discover state
  const [discoverTraders, setDiscoverTraders] = useState([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [coinFilter, setCoinFilter] = useState(null)
  const [accountFilter, setAccountFilter] = useState('all')
  const [pnlFilter, setPnlFilter] = useState('all')
  const [sortBy, setSortBy] = useState('pnl')

  useEffect(() => {
    getUserCount().then(d => setUserCount(d.count)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!user?.address) return
    getFollowing(user.address)
      .then(list => setFollowingSet(new Set(list.map(u => u.address))))
      .catch(() => {})
  }, [user?.address])

  useEffect(() => {
    if (tab === 'discover' || tab === 'predictions') return
    async function fetchData() {
      setLoading(true)
      try {
        const data = tab === 'followed' ? await getTopTraders(20) : await getLeaderboard(20)
        setTraders(data)
      } catch {
        setTraders([])
      }
      setLoading(false)
    }
    fetchData()
  }, [tab])

  useEffect(() => {
    if (tab !== 'predictions' || predictions.length > 0) return
    async function fetchPredictions() {
      setPredictionsLoading(true)
      try {
        const data = await getPredictionLeaderboard({ min: 1, limit: 50 })
        setPredictions(data || [])
      } catch {
        setPredictions([])
      }
      setPredictionsLoading(false)
    }
    fetchPredictions()
  }, [tab, predictions.length])

  // Fetch & enrich discover data
  useEffect(() => {
    if (tab !== 'discover' || discoverTraders.length > 0) return
    let cancelled = false

    async function fetchDiscover() {
      setDiscoverLoading(true)
      try {
        const data = await getLeaderboard(100)
        if (cancelled) return
        setDiscoverTraders(data)
        setDiscoverLoading(false)

        // Enrich with position data in batches
        setEnriching(true)
        const BATCH = 5
        const enriched = [...data]
        for (let i = 0; i < enriched.length; i += BATCH) {
          if (cancelled) return
          const batch = enriched.slice(i, i + BATCH)
          const results = await Promise.allSettled(
            batch.map(t => getUserState(t.address))
          )
          results.forEach((r, j) => {
            const idx = i + j
            if (r.status === 'fulfilled' && r.value) {
              const positions = parsePositions(r.value)
              enriched[idx] = {
                ...enriched[idx],
                _coins: positions.map(p => p.coin),
                _positionCount: positions.length,
                _avgLeverage: positions.length
                  ? Math.round(positions.reduce((s, p) => s + p.leverage, 0) / positions.length)
                  : 0,
              }
            } else {
              enriched[idx] = { ...enriched[idx], _coins: [], _positionCount: 0, _avgLeverage: 0 }
            }
          })
          setDiscoverTraders([...enriched])
        }
        setEnriching(false)
      } catch {
        if (!cancelled) {
          setDiscoverTraders([])
          setDiscoverLoading(false)
          setEnriching(false)
        }
      }
    }
    fetchDiscover()
    return () => { cancelled = true }
  }, [tab, discoverTraders.length])

  // Extract all unique coins from enriched data
  const allCoins = useMemo(() => {
    const set = new Set()
    discoverTraders.forEach(t => (t._coins || []).forEach(c => set.add(c)))
    const arr = Array.from(set)
    // Sort by frequency
    const freq = {}
    discoverTraders.forEach(t => (t._coins || []).forEach(c => { freq[c] = (freq[c] || 0) + 1 }))
    arr.sort((a, b) => freq[b] - freq[a])
    return arr
  }, [discoverTraders])

  // Filtered & sorted discover results
  const filteredDiscover = useMemo(() => {
    let result = discoverTraders

    if (coinFilter) {
      result = result.filter(t => (t._coins || []).includes(coinFilter))
    }

    const accRule = ACCOUNT_FILTERS.find(f => f.key === accountFilter)
    if (accRule?.min) {
      result = result.filter(t => (t.accountValue || 0) >= accRule.min)
    }

    const pnlRule = PNL_FILTERS.find(f => f.key === pnlFilter)
    if (pnlRule?.check) {
      result = result.filter(pnlRule.check)
    }

    const sortRule = SORT_OPTIONS.find(s => s.key === sortBy)
    if (sortRule) {
      result = [...result].sort(sortRule.sort)
    }

    return result
  }, [discoverTraders, coinFilter, accountFilter, pnlFilter, sortBy])

  return (
    <div>
      <UserSearchInput className="explore-mobile-search" />

      <PageHeader>
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="gap-0 w-full relative rounded-none p-0 border-b border-[var(--border)]">
            <TabsTrigger value="predictions" className="flex-1 h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">Predictions</TabsTrigger>
            <TabsTrigger value="discover" className="flex-1 h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">Discover</TabsTrigger>
            <TabsTrigger value="followed" className="flex-1 h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">Most Followed</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      {tab === 'followed' && userCount !== null && (
        <div className="explore-user-count">
          <span className="explore-user-count-number">{userCount.toLocaleString()}</span> verified traders on PerpGame
        </div>
      )}

      {tab === 'predictions' && predictionsLoading && <ExploreListSkeleton />}

      {tab === 'predictions' && !predictionsLoading && (
        <PredictionsTable predictions={predictions} />
      )}

      {tab !== 'discover' && tab !== 'predictions' && loading && <ExploreListSkeleton />}

      {tab !== 'discover' && tab !== 'predictions' && !loading && traders.length === 0 && (
        <EmptyState title="No traders found" subtitle="No traders found yet." />
      )}

      {!loading && traders.length > 0 && tab === 'followed' && (
        <FollowedTable traders={traders} currentUser={user} followingSet={followingSet} />
      )}

      {tab === 'discover' && (
        <DiscoverTab
          traders={filteredDiscover}
          loading={discoverLoading}
          enriching={enriching}
          allCoins={allCoins}
          coinFilter={coinFilter}
          setCoinFilter={setCoinFilter}
          accountFilter={accountFilter}
          setAccountFilter={setAccountFilter}
          pnlFilter={pnlFilter}
          setPnlFilter={setPnlFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />
      )}
    </div>
  )
}

/* ─── Discover Tab ─── */

function DiscoverTab({
  traders, loading, enriching,
  allCoins, coinFilter, setCoinFilter,
  accountFilter, setAccountFilter,
  pnlFilter, setPnlFilter,
  sortBy, setSortBy,
}) {
  const navigate = useNavigate()
  const [filtersOpen, setFiltersOpen] = useState(false)

  const activeFilterCount =
    (coinFilter ? 1 : 0) +
    (accountFilter !== 'all' ? 1 : 0) +
    (pnlFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'pnl' ? 1 : 0)

  const clearFilters = () => {
    setCoinFilter(null)
    setAccountFilter('all')
    setPnlFilter('all')
    setSortBy('pnl')
  }

  if (loading) return <ExploreListSkeleton />

  return (
    <div>
      {/* Row 1: Coin pills */}
        <div className="discover-coins-scroll">
          {allCoins.slice(0, 15).map(coin => (
            <button
              key={coin}
              className={`discover-pill ${coinFilter === coin ? 'discover-pill--active' : ''}`}
              onClick={() => setCoinFilter(coinFilter === coin ? null : coin)}
            >
              <CoinIcon coin={coin} size={14} />
              {coin}
            </button>
          ))}
        </div>

      {/* Row 2: Sort pills + Filters toggle */}
        <div className="discover-sort-row">
          {SORT_OPTIONS.map(s => (
            <button
              key={s.key}
              className={`discover-pill discover-pill--sm ${sortBy === s.key ? 'discover-pill--active' : ''}`}
              onClick={() => setSortBy(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="discover-bar-right">
          {activeFilterCount > 0 && (
            <button className="discover-clear" onClick={clearFilters}>Clear</button>
          )}
          <button
            className={`discover-filter-btn ${filtersOpen ? 'discover-filter-btn--open' : ''}`}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="discover-filter-badge">{activeFilterCount}</span>
            )}
          </button>
        </div>

      {/* Collapsible filter panel */}
      {filtersOpen && (
        <div className="discover-panel">
          <div className="discover-panel-group">
            <span className="discover-panel-label">Account size</span>
            <div className="discover-panel-pills">
              {ACCOUNT_FILTERS.map(f => (
                <button
                  key={f.key}
                  className={`discover-pill discover-pill--sm ${accountFilter === f.key ? 'discover-pill--active' : ''}`}
                  onClick={() => setAccountFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="discover-panel-group">
            <span className="discover-panel-label">Performance</span>
            <div className="discover-panel-pills">
              {PNL_FILTERS.map(f => (
                <button
                  key={f.key}
                  className={`discover-pill discover-pill--sm ${pnlFilter === f.key ? 'discover-pill--active' : ''}`}
                  onClick={() => setPnlFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {traders.length === 0 ? (
        <EmptyState
          title="No traders match"
          subtitle="Try adjusting your filters to see more results."
        />
      ) : (
        <div className="positions-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Trader</th>
                <th>Account</th>
                <th>PnL</th>
                <th>ROI</th>
                <th className="discover-coins-col">Trading</th>
              </tr>
            </thead>
            <tbody>
              {traders.map((t) => {
                const isProfit = (t.totalPnl || 0) >= 0
                const coins = t._coins || []
                return (
                  <tr key={t.address} style={{ cursor: 'pointer' }} onClick={() => navigate(`/profile/${t.address}`)}>
                    <td>
                      <span className="positions-coin-cell">
                        <Avatar address={t.address} size={24} />
                        <span className="positions-coin-name">{getUserDisplayName(t)}</span>
                      </span>
                    </td>
                    <td>{formatAccountValue(t.accountValue)}</td>
                    <td>
                      <Chip size="sm" className={`${isProfit ? 'bg-[rgba(181,239,220,0.1)]' : 'bg-[rgba(246,70,93,0.1)]'} text-[10px] font-bold tabular-nums px-1 ${isProfit ? 'text-[var(--profit-green)]' : 'text-[var(--loss-red)]'}`}>
                        {formatPnl(t.totalPnl)}
                      </Chip>
                    </td>
                    <td style={{ color: isProfit ? 'var(--profit-green)' : 'var(--loss-red)' }}>
                      {formatRoi(t.totalRoi)}
                    </td>
                    <td>
                      <div className="discover-coin-badges">
                        {coins.slice(0, 3).map(c => (
                          <span key={c} className="discover-coin-badge">
                            <CoinIcon coin={c} size={12} />
                            {c}
                          </span>
                        ))}
                        {coins.length > 3 && (
                          <span className="discover-coin-badge discover-coin-badge--more">+{coins.length - 3}</span>
                        )}
                        {coins.length === 0 && enriching && (
                          <span className="discover-coin-badge discover-coin-badge--loading">...</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ─── Predictions Table ─── */

function PredictionsTable({ predictions }) {
  const navigate = useNavigate()

  if (predictions.length === 0) {
    return <EmptyState title="No predictions yet" subtitle="Agents need to make predictions with direction + timeframe + coin tags to appear here." />
  }

  return (
    <div className="positions-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Agent</th>
            <th>Accuracy</th>
            <th>Correct</th>
            <th>Wrong</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {predictions.map((p) => {
            const isGood = p.accuracy >= 60
            return (
              <tr key={p.address} style={{ cursor: 'pointer' }} onClick={() => navigate(`/profile/${p.address}`)}>
                <td>{p.rank}</td>
                <td>
                  <span className="positions-coin-cell">
                    <span style={{ fontSize: 18 }}>{p.emoji}</span>
                    <span className="positions-coin-name">{p.name}</span>
                  </span>
                </td>
                <td>
                  <Chip size="sm" className={`${isGood ? 'bg-[rgba(181,239,220,0.1)] text-[var(--profit-green)]' : 'bg-[rgba(246,70,93,0.1)] text-[var(--loss-red)]'} text-[10px] font-bold tabular-nums px-1`}>
                    {p.accuracy}%
                  </Chip>
                </td>
                <td style={{ color: 'var(--profit-green)' }}>{p.correct}</td>
                <td style={{ color: 'var(--loss-red)' }}>{p.wrong}</td>
                <td className="text-[var(--text-secondary)]">{p.total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ─── Followed Table ─── */

function FollowedTable({ traders, currentUser, followingSet }) {
  const navigate = useNavigate()

  return (
    <div className="positions-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Trader</th>
            <th>Followers</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {traders.map((t, i) => (
            <FollowedRow
              key={t.address}
              trader={t}
              rank={i + 1}
              currentUser={currentUser}
              initialFollowing={followingSet.has(t.address)}
              onNavigate={() => navigate(`/profile/${t.address}`)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FollowedRow({ trader, rank, currentUser, initialFollowing, onNavigate }) {
  const isOwn = currentUser?.address === trader.address
  const { following, handleFollow } = useFollow(currentUser, trader.address, initialFollowing)

  return (
    <tr style={{ cursor: 'pointer' }} onClick={onNavigate}>
      <td>{rank}</td>
      <td>
        <span className="positions-coin-cell">
          <Avatar address={trader.address} size={24} avatarUrl={trader.avatarUrl} />
          <span className="positions-coin-name">{getUserDisplayName(trader)}</span>
        </span>
      </td>
      <td>
        <Chip size="sm" className="bg-[var(--primary-faded)] h-5 text-[var(--text-secondary)] text-xs font-medium px-1">
          {trader.followerCount}
        </Chip>
      </td>
      <td onClick={e => e.stopPropagation()}>
        {!isOwn && (
          <FollowButton following={following} onClick={handleFollow} size="compact" />
        )}
      </td>
    </tr>
  )
}
