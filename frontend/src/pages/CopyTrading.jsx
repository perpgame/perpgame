import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { AuthGate } from '../components/ui/auth-gate'
import { getWallets, createWallet, deleteWallet, getBalances, getSubscriptions } from '../api/copyTrading'
import { useVerifiedAuth } from '../hooks/useVerifiedAuth'
import { useToast } from '../components/Toast'
import Picker from '@emoji-mart/react'
import emojiData from '@emoji-mart/data'
import { Button } from '../components/ui/button'
import WalletCard3D from '../components/WalletCard3D'


export default function CopyTrading({ user, onLogout }) {
  if (!user?.verified) {
    return (
      <div>
        <div className="copy-page-header">
          <h2 className="copy-page-header-title">Copy Trade Wallets</h2>
        </div>
        <AuthGate
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" /></svg>}
          title="Sign in to copy trade"
          subtitle="Connect and verify your wallet to create copy trading wallets and follow top traders."
          onAction={onLogout}
        />
      </div>
    )
  }

  return <CopyTradingContent user={user} />
}

function CopyTradingContent({ user }) {
  const [wallets, setWallets] = useState([])
  const [balances, setBalances] = useState({})
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const { isReadOnly, requireVerified } = useVerifiedAuth(user)
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      const [walletsData, balancesData, subsData] = await Promise.all([
        getWallets(),
        getBalances().catch(() => ({})),
        getSubscriptions().catch(() => []),
      ])
      setWallets(walletsData || [])
      setBalances(balancesData || {})
      setSubscriptions(Array.isArray(subsData) ? subsData : [])
    } catch (err) {
      toast.error(err.message || 'Failed to load wallets')
    }
    setLoading(false)
  }, [toast])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate async data fetch
  useEffect(() => { load() }, [load])

  const handleCreated = useCallback(async () => {
    setShowModal(false)
    await load()
  }, [load])

  const handleDelete = requireVerified(async (id, walletName) => {
    if (!confirm(`Delete wallet "${walletName}"? This cannot be undone.`)) return
    setDeletingId(id)
    try {
      await deleteWallet(id)
      toast.success('Wallet deleted')
      await load()
    } catch (err) {
      toast.error(err.message || 'Failed to delete wallet')
    }
    setDeletingId(null)
  }, 'Deleting wallet')

  if (loading) {
    return (
      <div>
        <div className="copy-page-header">
          <h2 className="copy-page-header-title">Copy Trade Wallets</h2>
        </div>
        <div className="profile-gate">
          <div className="profile-gate-title">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="copy-page-header">
        <h2 className="copy-page-header-title">Copy Trade Wallets</h2>
        <Button size="sm"
          className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold"
          onClick={requireVerified(() => setShowModal(true), 'Creating wallet')}
        >
          + Create Wallet
        </Button>
      </div>

      {isReadOnly && (
        <div className="read-only-banner">
          <span className="badge-read-only">Read-only</span>
          <span>Verify your wallet to manage copy trading.</span>
        </div>
      )}

      {/* Wallets list */}
      <div className="copy-content">

        {wallets.length === 0 ? (
          <div className="copy-empty-state">
            <div className="copy-empty-cta" onClick={requireVerified(() => setShowModal(true), 'Creating wallet')}>
              <div className="copy-empty-cta-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <div className="copy-empty-cta-title">Create your first wallet</div>
              <div className="copy-empty-cta-desc">Set up a dedicated wallet to start copy trading top traders</div>
            </div>

            <div className="copy-how-it-works">
              <div className="copy-how-step">
                <div className="copy-how-step-num">1</div>
                <div className="copy-how-step-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
                  </svg>
                </div>
                <div className="copy-how-step-title">Create a wallet</div>
                <div className="copy-how-step-desc">Set up a dedicated copy trading wallet</div>
              </div>
              <div className="copy-how-step">
                <div className="copy-how-step-num">2</div>
                <div className="copy-how-step-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                </div>
                <div className="copy-how-step-title">Subscribe to traders</div>
                <div className="copy-how-step-desc">Add source wallet addresses to follow</div>
              </div>
              <div className="copy-how-step">
                <div className="copy-how-step-num">3</div>
                <div className="copy-how-step-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                  </svg>
                </div>
                <div className="copy-how-step-title">Auto-copy trades</div>
                <div className="copy-how-step-desc">Trades are mirrored proportionally to your balance</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="copy-wallet-list">
            {wallets.map((w) => {
              const bal = balances[w.hlAddress]
              const balVal = bal ? parseFloat(bal.committed || 0) : null
              const walletSubs = subscriptions.filter(s => s.subscriber === w.hlAddress)
              const hasActive = walletSubs.length > 0
              return (
                <WalletCard3D key={w.id} isActive={hasActive}>
                  <Link to={`/copy/wallet/${w.id}`} className={`copy-wallet-item${hasActive ? ' copy-wallet-item--active' : ''}`}>
                    <span className="copy-wallet-item-label">
                      <span>{w.emoji || '💼'} {w.name}</span>
                      <button
                        className="copy-wallet-item-delete"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(w.id, w.name) }}
                        disabled={deletingId === w.id}
                        aria-label="Delete wallet"
                      >
                        {deletingId === w.id ? (
                          <span className="copy-wallet-item-delete-loading" />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        )}
                      </button>
                    </span>
                    <span className="copy-wallet-item-value">
                      {balVal !== null
                        ? `$${balVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '—'}
                    </span>
                    <div className="copy-wallet-item-sub">
                      <span className="copy-wallet-item-sub-label">
                        {w.hlAddress.slice(0, 6)}...{w.hlAddress.slice(-4)}
                      </span>
                      <span className="copy-wallet-item-sub-value">
                        {walletSubs.length > 0 ? (
                          <span className="copy-wallet-item-active">
                            <span className="copy-wallet-active-dot" />
                            {walletSubs.length} active
                          </span>
                        ) : (
                          <span className="copy-wallet-item-inactive">No copies</span>
                        )}
                      </span>
                    </div>
                  </Link>
                </WalletCard3D>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <CreateWalletModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}

function CreateWalletModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('💼')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [hlAddress, setHlAddress] = useState('')
  const [creating, setCreating] = useState(false)
  const pickerRef = useRef(null)
  const btnRef = useRef(null)
  const toast = useToast()

  useEffect(() => {
    if (!showEmojiPicker) return
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setShowEmojiPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showEmojiPicker])

  const handleSubmit = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await createWallet(name.trim(), emoji, hlAddress.trim() || undefined)
      toast.success('Wallet created')
      onCreated()
    } catch (err) {
      toast.error(err.message || 'Failed to create wallet')
      setCreating(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !creating) onClose() }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-[var(--text)]">Create Wallet</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex items-start gap-3">
            <div className="relative">
              <button
                ref={btnRef}
                type="button"
                className="w-10 h-10 flex items-center justify-center rounded-lg border border-[var(--border)] bg-transparent text-lg cursor-pointer hover:border-[rgba(181,239,220,0.2)] hover:bg-[rgba(181,239,220,0.04)] transition-colors shrink-0"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              >
                {emoji}
              </button>
              {showEmojiPicker && (
                <div
                  className="copy-emoji-dropdown"
                  ref={pickerRef}
                  style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6 }}
                >
                  <Picker
                    data={emojiData}
                    onEmojiSelect={(e) => { setEmoji(e.native); setShowEmojiPicker(false) }}
                    theme="dark"
                    set="native"
                    previewPosition="none"
                    skinTonePosition="search"
                    perLine={8}
                  />
                </div>
              )}
            </div>
            <Input
              placeholder="e.g. Main Copy Wallet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <button
            type="button"
            className="text-xs text-[var(--text-third)] cursor-pointer hover:text-[var(--text-secondary)] transition-colors mt-2 bg-transparent border-none p-0"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            Advanced {showAdvanced ? '−' : '+'}
          </button>
          {showAdvanced && (
            <Input
              label="Custom HL Address"
              placeholder="Leave empty to use your address"
              value={hlAddress}
              onChange={(e) => setHlAddress(e.target.value)}
            />
          )}
          <Button className="w-full rounded-lg bg-[var(--primary)] text-[#060a0e] font-bold mt-4"
            disabled={creating || !name.trim()}
            loading={creating}
            onClick={handleSubmit}
          >
            Create Wallet
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
