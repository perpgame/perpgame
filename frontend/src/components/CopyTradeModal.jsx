import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from './ui/skeleton'
import { Dialog, DialogContent, DialogBody, DialogTitle } from './ui/dialog'
import { getSubscriptions, addSubscription, removeSubscription } from '../api/copyTrading'
import { getMyAgents } from '../api/backend'
import { formatUsd } from '../api/hyperliquid'
import { useVerifiedAuth } from '../hooks/useVerifiedAuth'
import { useToast } from './Toast'
import { getPnlColor } from '../utils/format'
import Avatar from './Avatar'
import TraderStatsCards from './TraderStatsCards'
import { Button } from './ui/button'

export default function CopyTradeModal({ isOpen, onClose, sourceAddress, sourceName, user, trading }) {
  const [agents, setAgents] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const { requireVerified } = useVerifiedAuth(user)
  const toast = useToast()

  const traderStats = trading?.traderStats || null
  const tradingData = trading
  const accountValue = trading?.accountValue || 0
  const totalPnl = trading?.totalPnl || 0

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [a, s] = await Promise.all([
          getMyAgents().catch(() => []),
          getSubscriptions().catch(() => []),
        ])
        if (cancelled) return
        setAgents(a || [])
        setSubscriptions(Array.isArray(s) ? s : [])
        if (a?.length > 0 && !selectedAgent) setSelectedAgent(a[0])
      } catch {
        // fail silently
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [isOpen, sourceAddress])

  const isSubscribed = (agent) => {
    if (!agent) return false
    return subscriptions.some(
      s => s.source?.toLowerCase() === sourceAddress?.toLowerCase() && s.subscriber?.toLowerCase() === agent.address?.toLowerCase()
    )
  }

  const alreadyActive = selectedAgent && isSubscribed(selectedAgent)

  const handleApply = requireVerified(async () => {
    if (!selectedAgent) return
    setActionLoading(true)
    try {
      if (alreadyActive) {
        await removeSubscription(sourceAddress, selectedAgent.address)
        toast.success(`Stopped copying to ${selectedAgent.name || selectedAgent.address.slice(0, 6)}`)
      } else {
        await addSubscription(sourceAddress, selectedAgent.address)
        toast.success(`Now copying to ${selectedAgent.name || selectedAgent.address.slice(0, 6)}`)
      }
      const s = await getSubscriptions().catch(() => [])
      setSubscriptions(Array.isArray(s) ? s : [])
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
    setActionLoading(false)
  }, 'Copy trading')

  const shortAddr = sourceAddress
    ? `${sourceAddress.slice(0, 6)}...${sourceAddress.slice(-4)}`
    : ''

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="3xl" hideCloseButton>
        <DialogTitle className="sr-only">Copy Trade</DialogTitle>
        <DialogBody className="p-0">
          {loading ? (
            <div className="ctm-layout">
              <div className="ctm-left">
                <Skeleton classNames={{ base: 'w-12 h-12 rounded-full bg-white/5' }} />
                <Skeleton classNames={{ base: 'h-4 w-32 rounded-md bg-white/5 mt-3' }} />
                <Skeleton classNames={{ base: 'h-3 w-20 rounded-md bg-white/[0.03] mt-2' }} />
                <div className="ctm-stats-grid" style={{ marginTop: 20 }}>
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="ctm-stat">
                      <Skeleton classNames={{ base: 'h-3 w-14 rounded-md bg-white/[0.03]' }} />
                      <Skeleton classNames={{ base: 'h-4 w-20 rounded-md bg-white/5 mt-1' }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="ctm-right">
                <Skeleton classNames={{ base: 'h-10 w-full rounded-lg bg-white/5' }} />
                <Skeleton classNames={{ base: 'h-[140px] w-full rounded-lg bg-white/5 mt-3' }} />
              </div>
            </div>
          ) : (
            <div className="ctm-layout">
              {/* Left panel — trader profile & stats */}
              <div className="ctm-left">
                <div className="ctm-left-header">
                  <Avatar address={sourceAddress} size={40} />
                  <div>
                    <div className="ctm-left-name">{sourceName || shortAddr}</div>
                    {sourceName && <div className="ctm-left-addr">{shortAddr}</div>}
                  </div>
                  {alreadyActive && (
                    <span className="ctm-active-badge">
                      <span className="ctm-active-dot" />
                      Copying
                    </span>
                  )}
                </div>
                <div className="profile-upper-stats">
                  <div className="profile-stat-pill">
                    <span className="profile-stat-pill__value" style={{ color: getPnlColor(totalPnl) }}>{formatUsd(totalPnl)}</span>
                    <span className="profile-stat-pill__label">PnL</span>
                  </div>
                  <div className="profile-stat-pill">
                    <span className="profile-stat-pill__value">{formatUsd(accountValue)}</span>
                    <span className="profile-stat-pill__label">Account</span>
                  </div>
                </div>
                <TraderStatsCards traderStats={traderStats} trading={tradingData} compact />
              </div>

              {/* Right panel — settings */}
              <div className="ctm-right">
                {/* Wallet selector */}
                <div className="ctm-field">
                  <label className="ctm-label">Select an agent</label>
                  <div className="copy-wallet-list">
                    {agents.map((a) => {
                      const selected = selectedAgent?.address === a.address
                      const subscribed = isSubscribed(a)
                      return (
                        <button
                          key={a.address}
                          className={`copy-wallet-item${selected ? ' copy-wallet-item--selected' : ''}${subscribed ? ' copy-wallet-item--active' : ''}`}
                          onClick={() => setSelectedAgent(a)}
                          type="button"
                        >
                          <span className="copy-wallet-item-label" style={{ gap: 6 }}>
                            <Avatar address={a.address} size={18} avatarUrl={a.avatarUrl} />
                            <span>{a.name || `${a.address.slice(0, 6)}...${a.address.slice(-4)}`}</span>
                          </span>
                          <span className="copy-wallet-item-value">
                            {a.accuracy != null ? `${a.accuracy}%` : '—'}
                          </span>
                          {subscribed && (
                            <div className="copy-wallet-item-sub">
                              <span className="copy-wallet-item-active">
                                <span className="copy-wallet-active-dot" />
                                Copying
                              </span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                    {(agents.length === 0 || agents.length % 2 !== 0) && (
                      <Link
                        to="/deploy"
                        className="copy-wallet-item copy-wallet-item--placeholder"
                        onClick={onClose}
                      >
                        <span className="copy-wallet-placeholder-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </span>
                        <span className="copy-wallet-placeholder-text">Create agent</span>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Settings — coming soon */}
                <div className="ctm-coming-soon">
                  <span className="ctm-coming-soon__text">Settings coming soon</span>
                  <div className="ctm-coming-soon__actions">
                    <Button variant="outline"
                      className="rounded-full border-[var(--separator)] text-[var(--text-secondary)] font-semibold px-6"
                      onClick={onClose}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled
                      className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold px-6 opacity-40 cursor-not-allowed"
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
