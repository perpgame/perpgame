import { useParams, Link } from 'react-router-dom'
import { AuthGate } from '../components/ui/auth-gate'
import { useState, useEffect, useMemo, useRef } from 'react'
import { Textarea } from '../components/ui/textarea'
import { Input } from '../components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Chip } from '../components/ui/chip'
import PnLChart from '../components/PnLChart'
import AccuracyChart from '../components/AccuracyChart'
import PositionsTable from '../components/PositionsTable'
import TradeHistory from '../components/TradeHistory'
import PostCard from '../components/PostCard'
import Avatar from '../components/Avatar'
import ProfileHeader from '../components/ProfileHeader'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import TraderStatsCards from '../components/TraderStatsCards'
import CoinIcon from '../components/terminal/CoinIcon'
import CopyTradeModal from '../components/CopyTradeModal'
import { ProfileSkeleton } from '../components/Skeleton'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useToast } from '../components/Toast'
import { getUserDisplayName } from '../utils/user'
import {
  getUserPosts as apiGetUserPosts,
  getFollowers as apiGetFollowers,
  getFollowing as apiGetFollowing,
  getUser as apiGetUser,
  getUserPredictionStats as apiGetPredictionStats,
  setUsername as apiSetUsername,
  setBio as apiSetBio,
  setDisplayName as apiSetDisplayName,
  uploadAvatar as apiUploadAvatar,
} from '../api/backend'
import { Button } from '../components/ui/button'
import {
  getUserState,
  getUserFills,
  getUserPortfolio,
  parsePositions,
  parseAccountValue,
  parseTotalPnl,
  parseTotalPnlFromPortfolio,
  buildPnlTimeline,
  buildPnlTimelineFromPortfolio,
  parseClosedTrades,
  buildLeverageMap,
  computeTradeStats,
  parseTraderStats,
} from '../api/hyperliquid'

const PERIOD_MS = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }
const PERIOD_LABELS = { '24h': '24H', '7d': '7D', '30d': '30D', all: 'All' }

function PredictionScore({ stats }) {
  const hasStats = stats && stats.total > 0
  const accuracy = hasStats && stats.accuracy != null ? stats.accuracy : null
  const color = accuracy === null
    ? 'var(--text-secondary)'
    : accuracy >= 60
    ? 'var(--profit-green)'
    : accuracy >= 45
    ? 'var(--text)'
    : 'var(--loss-red)'

  return (
    <div className="profile-stat-pill" style={{ opacity: hasStats ? 1 : 0.5 }}>
      <span className="profile-stat-pill__value" style={{ color }}>
        {accuracy !== null ? `${accuracy.toFixed(0)}%` : '—'}
      </span>
      <span className="profile-stat-pill__label">
        {hasStats ? `${stats.correct}W · ${stats.wrong}L` : 'Predictions'}
      </span>
    </div>
  )
}



function PostsStatsCards({ predictionStats: ps, period = 'all', onPeriodChange }) {
  const [predChartMode, setPredChartMode] = useState('accuracy')
  const correct = ps?.correct ?? 0
  const wrong = ps?.wrong ?? 0
  const total = ps?.total ?? 0
  const pending = ps?.pending ?? 0
  const accuracy = ps?.accuracy != null ? Number(ps.accuracy) : null
  const accuracyColor = accuracy === null
    ? 'var(--text)'
    : accuracy >= 60 ? 'var(--profit-green)'
    : accuracy >= 45 ? 'var(--text)'
    : 'var(--loss-red)'
  const winPct = total > 0 ? (correct / total) * 100 : 0

  return (
    <div className="trader-grid">
    <div className="trader-stats-col">
      <div className="trader-row trader-row--2">
        <div className="trader-card">
          <span className="trader-card__label">Accuracy</span>
          <span className="trader-card__value" style={{ color: accuracyColor }}>
            {accuracy !== null ? `${accuracy.toFixed(0)}%` : '—'}
          </span>
          <div className="trader-card__sub">
            <span className="trader-card__sub-label">Record</span>
            <span className="trader-card__sub-value">{correct}W · {wrong}L</span>
          </div>
          <div className="trader-bar">
            <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${accuracy ?? 0}%` }} />
          </div>
        </div>
        <div className="trader-card">
          <span className="trader-card__label">Predictions</span>
          <span className="trader-card__value">{total}</span>
          <div className="trader-card__sub">
            <span className="trader-card__sub-label">Live</span>
            <span className="trader-card__sub-value">{pending > 0 ? `${pending} pending` : '—'}</span>
          </div>
          <div className="trader-bar">
            <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${winPct}%` }} />
          </div>
        </div>
      </div>
      <div className="trader-row trader-row--2">
        <div className="trader-card">
          <span className="trader-card__label">Long / Short</span>
          <span className="trader-card__value">
            {ps?.longAccuracy != null || ps?.shortAccuracy != null ? (
              <>
                <span style={{ color: 'var(--profit-green)' }}>
                  {ps.longAccuracy != null ? `${ps.longAccuracy}%` : '—'}
                </span>
                {' · '}
                <span style={{ color: 'var(--loss-red)' }}>
                  {ps.shortAccuracy != null ? `${ps.shortAccuracy}%` : '—'}
                </span>
              </>
            ) : '—'}
          </span>
          <div className="trader-card__sub">
            <span className="trader-card__sub-label">Bias</span>
            <span className="trader-card__sub-value">
              {ps?.longAccuracy != null && ps?.shortAccuracy != null
                ? ps.longAccuracy >= ps.shortAccuracy ? 'Longs' : 'Shorts'
                : '—'}
            </span>
          </div>
        </div>
        <div className="trader-card">
          <span className="trader-card__label">Best Coin</span>
          <span className="trader-card__value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {ps?.bestCoin && <CoinIcon coin={ps.bestCoin.coin} size={18} />}
            {ps?.bestCoin ? ps.bestCoin.coin : '—'}
          </span>
          <div className="trader-card__sub">
            <span className="trader-card__sub-label">Accuracy</span>
            <span className="trader-card__sub-value">
              {ps?.bestCoin ? `${ps.bestCoin.accuracy}% (${ps.bestCoin.total})` : '—'}
            </span>
          </div>
        </div>
      </div>
      {ps?.recentOutcomes?.length >= 2 && (
        <div className="trader-chart-card">
          <div className="trader-chart-controls">
            <Tabs value={period} onValueChange={onPeriodChange}>
              <TabsList className="gap-0 p-0 bg-transparent">
                {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                  <TabsTrigger key={key} value={key} className="h-7 px-3 min-w-0 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[12px]">{label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div style={{ marginLeft: 'auto' }}>
              <Tabs value={predChartMode} onValueChange={setPredChartMode}>
                <TabsList className="gap-0 p-0 bg-transparent">
                  <TabsTrigger value="accuracy" className="h-7 px-3 min-w-0 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[12px]">Accuracy</TabsTrigger>
                  <TabsTrigger value="predictions" className="h-7 px-3 min-w-0 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[12px]">Predictions</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          <AccuracyChart outcomes={ps.recentOutcomes} height={200} mode={predChartMode} />
        </div>
      )}
    </div>
    </div>
  )
}

function TraderTab({ trading, filteredPnlData, periodPnl, pnlPeriod, setPnlPeriod }) {
  const ts = trading.traderStats
  const [chartMode, setChartMode] = useState('pnl')

  const accountData = useMemo(() => {
    if (!filteredPnlData?.length) return []
    const currentAv = trading.accountValue
    const currentPnl = periodPnl
    return filteredPnlData.map(p => ({
      ...p,
      pnl: Math.round((currentAv - currentPnl + p.pnl) * 100) / 100,
    }))
  }, [filteredPnlData, trading.accountValue, periodPnl])

  return (
    <div className="trader-grid">
      <TraderStatsCards traderStats={ts} trading={trading} />

      {/* PnL Chart */}
      <div className="trader-chart-card">
        <div className="trader-chart-controls">
          <Tabs value={pnlPeriod} onValueChange={setPnlPeriod}>
            <TabsList className="gap-0 p-0 bg-transparent">
              {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                <TabsTrigger key={key} value={key} className="h-7 px-3 min-w-0 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[12px]">{label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div style={{ marginLeft: 'auto' }}>
            <Tabs value={chartMode} onValueChange={setChartMode}>
              <TabsList className="gap-0 p-0 bg-transparent">
                <TabsTrigger value="pnl" className="h-7 px-3 min-w-0 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[12px]">PnL</TabsTrigger>
                <TabsTrigger value="account" className="h-7 px-3 min-w-0 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[12px]">Account</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        <PnLChart data={chartMode === 'pnl' ? filteredPnlData : accountData} />
      </div>
    </div>
  )
}

export default function Profile({ currentUser, onLogout }) {
  const { address } = useParams()
  const isGuest = !currentUser?.verified
  const isOwn = currentUser.address === address

  if (isGuest && isOwn) {
    return <ProfileGate onVerify={onLogout} />
  }

  return <ProfileContent key={address} currentUser={currentUser} address={address} />
}

function ProfileGate({ onVerify }) {
  return (
    <div>
      <PageHeader title="Profile" showBack />
      <AuthGate
        icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>}
        title="Sign In to view your profile"
        subtitle="Connect and verify your wallet to view your profile and follow users."
        onAction={onVerify}
      />
    </div>
  )
}

function ProfileContent({ currentUser, address }) {
  const [tab, setTab] = useState('trader')
  const [posts, setPosts] = useState([])
  const [profileLoading, setProfileLoading] = useState(true)
  const [pnlPeriod, setPnlPeriod] = useState('all')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [predictionStats, setPredictionStats] = useState(null)
  const [predPeriod, setPredPeriod] = useState('all')
  const [predOutcomeFilter, setPredOutcomeFilter] = useState('all')
  const [predDirectionFilter, setPredDirectionFilter] = useState('all')


  const [profile, setProfile] = useState({
    username: null,
    displayName: null,
    bio: '',
    avatarUrl: null,
    registered: true,
  })

  const [trading, setTrading] = useState({
    positions: [],
    accountValue: 0,
    totalPnl: 0,
    pnlData: [],
    winRate: 0,
    winCount: 0,
    totalTrades: 0,
    txCount: 0,
    closedTrades: [],
    traderStats: null,
  })

  const [social, setSocial] = useState({
    followers: [],
    followingList: [],
  })

  const isOwn = currentUser.address === address
  const toast = useToast()

  useEffect(() => {
    // Load backend data
    async function loadSocialData() {
      try {
        const [userPosts, followersList, followingData, predStats] = await Promise.all([
          apiGetUserPosts(address),
          apiGetFollowers(address),
          apiGetFollowing(address),
          apiGetPredictionStats(address).catch(() => null),
        ])
        if (predStats) setPredictionStats(predStats)
        setPosts(userPosts)
        setSocial({
          followers: followersList,
          followingList: followingData,
        })
      } catch (err) {
        toast.error(err.message || 'Failed to load profile data')
      }

      // Check registration and fetch username/bio/avatar
      try {
        const userData = await apiGetUser(address)
        setProfile({
          registered: true,
          username: userData.username || null,
          displayName: userData.displayName || null,
          bio: userData.bio || '',
          avatarUrl: userData.avatarUrl || null,
          isAgent: userData.isAgent || false,
        })
      } catch {
        setProfile({
          registered: false,
          username: null,
          displayName: null,
          bio: '',
          avatarUrl: null,
        })
      }

    }

    async function fetchHLData() {
      try {
        const [state, fills, portfolioData] = await Promise.all([
          getUserState(address),
          getUserFills(address),
          getUserPortfolio(address).catch(() => null),
        ])
        const portfolioPnl = parseTotalPnlFromPortfolio(portfolioData)
        const portfolioTimeline = portfolioData ? buildPnlTimelineFromPortfolio(portfolioData) : []
        const leverageMap = buildLeverageMap(state)
        const allTrades = parseClosedTrades(fills, leverageMap)
        const stats = computeTradeStats(allTrades)
        const trader = parseTraderStats(state)

        setTrading({
          positions: parsePositions(state),
          accountValue: parseAccountValue(state),
          totalPnl: portfolioPnl != null ? portfolioPnl : parseTotalPnl(fills),
          pnlData: portfolioTimeline.length > 1 ? portfolioTimeline : buildPnlTimeline(fills),
          winRate: stats.winRate,
          winCount: stats.winCount || 0,
          totalTrades: stats.totalTrades,
          txCount: fills.length,
          closedTrades: allTrades.slice(0, 50),
          traderStats: trader,
        })
      } catch (err) {
        console.error('Failed to fetch HyperLiquid data:', err)
      }
    }

    Promise.all([loadSocialData(), fetchHLData()]).finally(() => setProfileLoading(false))
  }, [address, currentUser.address, toast])

  useEffect(() => {
    apiGetPredictionStats(address, predPeriod).then(setPredictionStats).catch(() => {})
  }, [address, predPeriod])

  const handleEditSave = ({ displayName, username, bio, avatarUrl }) => {
    setProfile(p => ({ ...p, displayName, username, bio, avatarUrl }))
    setShowEditModal(false)
  }

  const { filteredPnlData, periodPnl } = useMemo(() => {
    if (!trading.pnlData.length) return { filteredPnlData: [], periodPnl: trading.totalPnl }
    if (pnlPeriod === 'all') return { filteredPnlData: trading.pnlData, periodPnl: trading.totalPnl }

    const latest = trading.pnlData[trading.pnlData.length - 1].ts
    const cutoff = latest - PERIOD_MS[pnlPeriod]
    const startIdx = trading.pnlData.findIndex(p => p.ts >= cutoff)
    if (startIdx < 0) return { filteredPnlData: [], periodPnl: 0 }

    const baseline = startIdx > 0 ? trading.pnlData[startIdx - 1].pnl : 0
    const slice = trading.pnlData.slice(startIdx).map(p => ({
      ...p,
      pnl: Math.round((p.pnl - baseline) * 100) / 100,
    }))
    const pnl = slice.length ? slice[slice.length - 1].pnl : 0
    return { filteredPnlData: slice, periodPnl: pnl }
  }, [trading.pnlData, pnlPeriod, trading.totalPnl])

  const profileUser = { displayName: profile.displayName, username: profile.username, address }

  const refreshPosts = async () => {
    try {
      const userPosts = await apiGetUserPosts(address)
      setPosts(userPosts)
    } catch { /* ignore refresh failure */ }
  }

  if (profileLoading) {
    return (
      <div>
        <PageHeader title="Profile" showBack />
        <ProfileSkeleton />
      </div>
    )
  }

  return (
    <div className="profile-page">
      {/* Sticky header */}
      <PageHeader
        title={getUserDisplayName(profileUser)}
        showBack
        subtitle={`${posts.length} posts`}
      />

      {/* Profile header */}
      <ProfileHeader
        address={address}
        displayName={profile.displayName}
        username={profile.username}
        bio={profile.bio}
        avatarUrl={profile.avatarUrl}
        isAgent={profile.isAgent}
        registered={profile.registered}
        pnl={periodPnl}
        accountValue={trading.accountValue}
        onAddressCopy={() => {
          navigator.clipboard?.writeText(address)
          toast.success('Address copied')
        }}
        socialLinks={
          <>
            <Link to={`/profile/${address}/following`} className="profile-social-link">
              <span className="profile-social-count">{social.followingList.length}</span> Following
            </Link>
            <Link to={`/profile/${address}/followers`} className="profile-social-link">
              <span className="profile-social-count">{social.followers.length}</span> Followers
            </Link>
          </>
        }
        predictionStats={predictionStats}
        actions={isOwn ? (
          <>
            <Button
              variant="outline" size="sm"
              className="rounded-full border-[var(--border)] text-[var(--text)] font-bold"
              onClick={() => setShowEditModal(true)}
            >
              Edit Profile
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline" size="sm"
              className="rounded-full border-[var(--border)] text-[var(--text)] font-bold"
              onClick={() => setShowCopyModal(true)}
            >
              Copy Trade
            </Button>
          </>
        )}
      />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="gap-0 w-full relative rounded-none p-0 border-b border-[var(--border)] overflow-x-auto scrollbar-none flex-nowrap">
          <TabsTrigger value="trader" className="flex-1 basis-0 min-w-[130px] h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">Trader</TabsTrigger>
          <TabsTrigger value="predictions" className="flex-1 basis-0 min-w-[130px] h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">Predictions</TabsTrigger>
          <TabsTrigger value="posts" className="flex-1 basis-0 min-w-[130px] h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">Posts</TabsTrigger>
          <TabsTrigger value="positions" className="flex-1 basis-0 min-w-[140px] h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">{`Positions (${trading.positions.length})`}</TabsTrigger>
          <TabsTrigger value="history" className="flex-1 basis-0 min-w-[130px] h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">History</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'posts' && (() => {
        const regularPosts = posts.filter(p => !p.predictionCoin)
        return (
          <>
            {regularPosts.length === 0 ? (
              <EmptyState
                title={isOwn ? "You haven't posted yet" : "No posts yet"}
              />
            ) : (
              <div className="feed-cards">
                {regularPosts.map(post => (
                  <PostCard key={post.id} post={post} user={currentUser} onUpdate={refreshPosts} />
                ))}
              </div>
            )}
          </>
        )
      })()}

      {tab === 'predictions' && (() => {
        const predPosts = posts.filter(p => p.predictionCoin)
        const filteredPredPosts = predPosts.filter(p => {
          if (predOutcomeFilter !== 'all' && p.predictionOutcome !== predOutcomeFilter) return false
          if (predDirectionFilter !== 'all' && p.direction !== predDirectionFilter) return false
          return true
        })
        return (
          <>
            <PostsStatsCards predictionStats={predictionStats} period={predPeriod} onPeriodChange={setPredPeriod} />
            {predPosts.length === 0 ? (
              <EmptyState
                title={isOwn ? "No predictions yet" : "No predictions yet"}
                subtitle={isOwn ? 'Make a prediction post to see your stats here.' : 'When they make predictions, they will show up here.'}
              />
            ) : (
              <>
                <div className="pred-filters">
                  <div className="pred-filters__group">
                    {[['all', 'All'], ['correct', 'Correct'], ['wrong', 'Wrong']].map(([val, label]) => (
                      <Chip
                        key={val}
                        size="default"
                        onClick={() => setPredOutcomeFilter(val)}
                        className={`cursor-pointer transition-colors ${predOutcomeFilter === val ? 'bg-[rgba(181,239,220,0.12)] text-[var(--text)]' : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'}`}
                      >
                        {label}
                      </Chip>
                    ))}
                  </div>
                  <div className="pred-filters__group">
                    {[['all', 'All'], ['bull', 'Bull'], ['bear', 'Bear']].map(([val, label]) => (
                      <Chip
                        key={val}
                        size="default"
                        onClick={() => setPredDirectionFilter(val)}
                        className={`cursor-pointer transition-colors ${predDirectionFilter === val ? 'bg-[rgba(181,239,220,0.12)] text-[var(--text)]' : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'}`}
                      >
                        {label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="feed-cards">
                  {filteredPredPosts.map(post => (
                    <PostCard key={post.id} post={post} user={currentUser} onUpdate={refreshPosts} />
                  ))}
                  {filteredPredPosts.length === 0 && (
                    <EmptyState title="No predictions match the filter" />
                  )}
                </div>
              </>
            )}
          </>
        )
      })()}

      {tab === 'trader' && <TraderTab trading={trading} filteredPnlData={filteredPnlData} periodPnl={periodPnl} pnlPeriod={pnlPeriod} setPnlPeriod={setPnlPeriod} />}

      {tab === 'positions' && (
        <PositionsTable positions={trading.positions} />
      )}

      {tab === 'history' && (
        <TradeHistory trades={trading.closedTrades} />
      )}

      <CopyTradeModal
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        sourceAddress={address}
        sourceName={getUserDisplayName(profile)}
        user={currentUser}
        trading={trading}
      />

      {showEditModal && (
        <EditProfileModal
          address={address}
          displayName={profile.displayName}
          username={profile.username}
          bio={profile.bio}
          avatarUrl={profile.avatarUrl}
          onSave={handleEditSave}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  )
}

function EditProfileModal({ address, displayName, username, bio, avatarUrl, onSave, onClose }) {
  const [nameInput, setNameInput] = useState(displayName || '')
  const [usernameInput, setUsernameInput] = useState(username || '')
  const [bioInput, setBioInput] = useState(bio || '')
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(avatarUrl)
  const [usernameError, setUsernameError] = useState('')
  const [saving, setSaving] = useState(false)
  const avatarInputRef = useRef(null)
  const toast = useToast()

  const trapRef = useFocusTrap()

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please select a JPEG, PNG, WebP, or GIF image.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB.')
      return
    }
    try {
      const updated = await apiUploadAvatar(file)
      setCurrentAvatarUrl(updated.avatarUrl || null)
    } catch (err) {
      toast.error(err.message || 'Failed to upload avatar')
    }
    e.target.value = ''
  }

  const handleSave = async () => {
    setSaving(true)
    setUsernameError('')

    try {
      // Save display name if changed
      if (nameInput.trim() !== (displayName || '')) {
        await apiSetDisplayName(nameInput.trim())
      }

      // Save username if changed
      const newUsername = usernameInput.toLowerCase()
      if (newUsername !== (username || '')) {
        if (newUsername && !/^[a-z0-9_]{3,20}$/.test(newUsername)) {
          setUsernameError('3-20 chars, a-z, 0-9, _ only')
          setSaving(false)
          return
        }
        if (newUsername) {
          await apiSetUsername(newUsername)
        }
      }

      // Save bio if changed
      if (bioInput !== (bio || '')) {
        await apiSetBio(bioInput)
      }

      onSave({
        displayName: nameInput.trim() || null,
        username: usernameInput.toLowerCase() || username,
        bio: bioInput,
        avatarUrl: currentAvatarUrl,
      })
    } catch (err) {
      if (err.message?.includes('taken') || err.message?.includes('Username')) {
        setUsernameError(err.message)
      } else {
        toast.error(err.message || 'Failed to save profile')
      }
    }
    setSaving(false)
  }

  const inputWrapperClass = "bg-transparent border-[var(--border)]"

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Edit profile">
      <div className="modal-container modal-sm" ref={trapRef} onClick={e => e.stopPropagation()}>
        <div className="edit-profile-header">
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="rounded-full text-[var(--text-secondary)]">
            &times;
          </Button>
          <span className="edit-profile-title">Edit Profile</span>
          <Button size="sm"
            className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold px-5"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        <div className="edit-profile-body">
          <div className="edit-profile-avatar-section">
            <div className="edit-profile-avatar-wrap" onClick={() => avatarInputRef.current?.click()}>
              <Avatar address={address} size={80} avatarUrl={currentAvatarUrl} />
              <div className="edit-profile-avatar-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
          </div>

          <div className="edit-profile-fields">
            <Input
              label="Display Name"
              value={nameInput}
              onValueChange={v => setNameInput(v.slice(0, 50))}
              maxLength={50}
              placeholder="Your display name"
              wrapperClassName={inputWrapperClass}
            />

            <Input
              label="Username"
              value={usernameInput}
              onValueChange={v => { setUsernameInput(v.toLowerCase().replace(/[^a-z0-9_]/g, '')); setUsernameError('') }}
              maxLength={20}
              placeholder="username"
              startContent={<span className="text-[var(--text-third)]">@</span>}
              isInvalid={!!usernameError}
              errorMessage={usernameError}
              wrapperClassName={inputWrapperClass}
            />

            <Textarea
              label="Bio"
              value={bioInput}
              onValueChange={v => setBioInput(v.slice(0, 160))}
              maxLength={160}
              minRows={3}
              placeholder="Tell the world about yourself..."
              description={`${bioInput.length}/160`}
              wrapperClassName="bg-transparent border-[var(--border)]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
