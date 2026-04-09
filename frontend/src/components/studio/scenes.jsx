import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardBody } from '../ui/card'
import { Chip } from '../ui/chip'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { DataGrid, DataGridRow } from '../ui/data-grid'
import { SideChip } from '../ui/side-chip'
import CoinIcon from '../terminal/CoinIcon'
import Avatar from '../Avatar'
import ProfileHeader from '../ProfileHeader'
import PositionList from '../PositionList'
import TradeList from '../TradeList'
import PostCard from '../PostCard'
import TraderStatsCards from '../TraderStatsCards'
import PnLChart from '../PnLChart'
import { IconHeart, IconComment, IconRepost, IconShare } from '../Icons'
import { compactUsd } from '../../utils/format'

// ─── Shared helpers ───────────────────────────────────────────────

function useCountUp(target, duration = 1200, active = false) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active) { setValue(0); return }
    let start = null
    let raf
    const step = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setValue((1 - Math.pow(1 - p, 3)) * target)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [active, target, duration])
  return value
}

function useSequence(playing, delays) {
  const [steps, setSteps] = useState(() => delays.map(() => false))
  useEffect(() => {
    if (!playing) { setSteps(delays.map(() => false)); return }
    const timers = delays.map((d, i) =>
      setTimeout(() => setSteps((s) => { const n = [...s]; n[i] = true; return n }), d)
    )
    return () => timers.forEach(clearTimeout)
  }, [playing])
  return steps
}

function AnimatedCounter({ target, active, duration = 800 }) {
  const val = useCountUp(target, duration, active)
  return Math.round(val)
}

const slideUp = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { type: 'spring', stiffness: 260, damping: 24 },
}

// ─── Scene 1: Trade Execution ─────────────────────────────────────

export function TradeExecutionScene({ playing, paused }) {
  const [price, setPrice] = useState(3241.80)
  const [typedSize, setTypedSize] = useState('')
  const steps = useSequence(playing, [200, 800, 1400, 2200, 3000, 3800])

  useEffect(() => {
    if (!playing || paused) { if (!playing) setPrice(3241.80); return }
    const iv = setInterval(() => {
      setPrice((p) => +(p + (Math.random() - 0.35) * 1.2).toFixed(2))
    }, 120)
    return () => clearInterval(iv)
  }, [playing, paused])

  useEffect(() => {
    if (!steps[2]) { setTypedSize(''); return }
    const full = '2.50'
    let i = 0
    const iv = setInterval(() => {
      i++
      setTypedSize(full.slice(0, i))
      if (i >= full.length) clearInterval(iv)
    }, 140)
    return () => clearInterval(iv)
  }, [steps[2]])

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20, overflow: 'hidden' }}>
      <AnimatePresence mode="wait">
        {steps[0] && (
          <motion.div key="header" {...slideUp} className="flex items-center gap-3.5" style={{ width: '100%', maxWidth: 380 }}>
            <CoinIcon coin="ETH" size={48} />
            <div>
              <div className="text-[22px] font-bold text-[var(--text)]">ETH / USD</div>
              <motion.div
                className="text-[28px] font-extrabold text-[var(--primary)] tabular-nums"
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 0.3, repeat: Infinity, repeatDelay: 0.8 }}
              >
                ${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </motion.div>
            </div>
          </motion.div>
        )}

        {steps[1] && (
          <motion.div
            key="order"
            initial={{ opacity: 0, y: 80, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
            style={{ width: '100%', maxWidth: 380 }}
          >
            <Card>
              <CardBody className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-[16px] font-bold text-[var(--text)]">Market Buy</span>
                  <Chip size="sm" className="bg-[rgba(181,239,220,0.1)] text-[var(--profit-green)] font-semibold">LONG</Chip>
                </div>

                <Input
                  label="Size (ETH)"
                  value={typedSize}
                  placeholder="0.00"
                  readOnly
                  endContent={
                    steps[2] && !steps[3]
                      ? <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }} className="text-[var(--primary)]">|</motion.span>
                      : <CoinIcon coin="ETH" size={16} />
                  }
                />

                <Input
                  label="Leverage"
                  value="10x"
                  readOnly
                />

                {steps[3] && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
                    <Input
                      label="Est. Entry Price"
                      value="$3,242.10"
                      readOnly
                    />
                  </motion.div>
                )}

                <motion.div
                  animate={steps[4] ? { scale: [1, 0.96, 1], boxShadow: ['0 0 0px var(--primary)', '0 0 24px var(--primary)', '0 0 0px var(--primary)'] } : {}}
                  transition={{ duration: 0.5 }}
                >
                  <Button
                    className={`w-full rounded-[10px] font-bold text-[15px] h-12 ${steps[4] ? 'bg-[var(--primary)] text-[#060a0e]' : 'bg-[rgba(181,239,220,0.15)] text-[var(--primary)]'}`}
                  >
                    {steps[4] ? 'Confirmed' : 'Confirm Trade'}
                  </Button>
                </motion.div>
              </CardBody>
            </Card>
          </motion.div>
        )}

        {steps[5] && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{ width: '100%', maxWidth: 380 }}
          >
            <Card className="border border-[rgba(181,239,220,0.25)]" style={{ background: 'linear-gradient(135deg, rgba(181,239,220,0.15), rgba(181,239,220,0.05))' }}>
              <CardBody className="flex items-center gap-3">
                <Chip size="lg" className="bg-[var(--profit-green)] text-[#000] font-bold rounded-full w-8 h-8 flex items-center justify-center p-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                </Chip>
                <div>
                  <div className="text-[13px] text-[var(--text-secondary)] mb-0.5">Trade Executed</div>
                  <div className="text-[22px] font-extrabold text-[var(--profit-green)]">+$127.40</div>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Scene 2: Portfolio Growth ────────────────────────────────────

const MOCK_POSITIONS = [
  { coin: 'BTC', side: 'Long', leverage: 10, size: 0.16, entryPrice: 62100, markPrice: 63340, unrealizedPnl: 1240, liquidationPx: 56800, marginUsed: 1000 },
  { coin: 'ETH', side: 'Short', leverage: 5, size: -1.5, entryPrice: 3300, markPrice: 3403, unrealizedPnl: -155, liquidationPx: 3960, marginUsed: 990 },
  { coin: 'SOL', side: 'Long', leverage: 20, size: 28.3, entryPrice: 98.4, markPrice: 142.8, unrealizedPnl: 1255.5, liquidationPx: 93.5, marginUsed: 139 },
]

const MOCK_ORDERS = [
  { oid: 1, coin: 'BTC', side: 'B', orderType: 'Limit', sz: '0.05', limitPx: '61200' },
  { oid: 2, coin: 'ETH', side: 'A', orderType: 'Stop Market', sz: '2.0', limitPx: '3150', triggerPx: 3150 },
]

const MOCK_TRADES = [
  { coin: 'BTC', side: 'Long', size: 0.12, entryPrice: 60800, exitPrice: 63100, pnl: 276, exitTime: Date.now() - 3600000 },
  { coin: 'ETH', side: 'Short', size: 3.0, entryPrice: 3450, exitPrice: 3320, pnl: 390, exitTime: Date.now() - 86400000 },
  { coin: 'SOL', side: 'Long', size: 40, entryPrice: 95.2, exitPrice: 88.1, pnl: -284, exitTime: Date.now() - 172800000 },
]

const MOCK_ORDER_HISTORY = [
  { oid: 10, coin: 'BTC', side: 'Buy', sideType: 'long', type: 'Market', size: '0.12 BTC', price: 'Market', trigger: '—', status: 'filled' },
  { oid: 11, coin: 'ETH', side: 'Sell', sideType: 'short', type: 'Limit', size: '3.0 ETH', price: '$3,450', trigger: '—', status: 'filled' },
  { oid: 12, coin: 'SOL', side: 'Buy', sideType: 'long', type: 'Stop Market', size: '40 SOL', price: 'Market', trigger: 'Trigger @ $95.20', status: 'canceled' },
]

const MOCK_TRANSFERS = [
  { type: 'deposit', usdc: 5000, fee: 0, time: Date.now() - 604800000 },
  { type: 'withdraw', usdc: -1200, fee: 1, time: Date.now() - 259200000 },
  { type: 'deposit', usdc: 3000, fee: 0, time: Date.now() - 86400000 },
]

const PORTFOLIO_TABS = ['positions', 'orders', 'history', 'fills', 'transfers']
const PORTFOLIO_TAB_LABELS = { positions: 'Positions', orders: 'Open Orders', history: 'Trades', fills: 'Orders', transfers: 'Transfers' }

function PortfolioTabContent({ tab }) {
  if (tab === 'positions') return <PositionList positions={MOCK_POSITIONS} />

  if (tab === 'orders') {
    return (
      <DataGrid
        columns={['Coin', 'Side', 'Type', 'Size', 'Price']}
        minWidth="420px"
        className="mx-3 my-3 overflow-x-auto"
        data={MOCK_ORDERS}
        renderRow={(o, _i, grid) => (
          <DataGridRow key={o.oid} {...grid}>
            <span className="flex items-center justify-center gap-2 min-w-0 px-8">
              <CoinIcon coin={o.coin} size={20} />
              <span className="font-semibold text-sm text-[var(--text)] shrink-0">{o.coin}</span>
            </span>
            <span className="flex justify-center px-8">
              <SideChip isLong={o.side === 'B'}>{o.side === 'B' ? 'Buy' : 'Sell'}</SideChip>
            </span>
            <span className="text-[14px] text-[var(--text-secondary)] px-8">{o.orderType}</span>
            <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{o.sz}</span>
            <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{compactUsd(parseFloat(o.limitPx))}</span>
          </DataGridRow>
        )}
      />
    )
  }

  if (tab === 'history') return <TradeList trades={MOCK_TRADES} />

  if (tab === 'fills') {
    return (
      <DataGrid
        columns={['Coin', 'Side', 'Type', 'Size', 'Price', 'Trigger', 'Status']}
        minWidth="580px"
        className="mx-3 my-3 overflow-x-auto"
        data={MOCK_ORDER_HISTORY}
        renderRow={(o, _i, grid) => {
          const statusColor = o.status === 'filled' ? 'text-[var(--profit-green)]' : 'text-[var(--text-third)]'
          return (
            <DataGridRow key={o.oid} {...grid}>
              <span className="flex items-center justify-center gap-2 min-w-0 px-8">
                <CoinIcon coin={o.coin} size={20} />
                <span className="font-semibold text-sm text-[var(--text)] shrink-0">{o.coin}</span>
              </span>
              <span className="flex justify-center px-8">
                <SideChip isLong={o.sideType === 'long'}>{o.side}</SideChip>
              </span>
              <span className="text-[14px] text-[var(--text-secondary)] px-8">{o.type}</span>
              <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{o.size}</span>
              <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{o.price}</span>
              <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{o.trigger}</span>
              <span className={`text-xs font-medium px-8 ${statusColor}`}>{o.status === 'filled' ? 'Filled' : 'Canceled'}</span>
            </DataGridRow>
          )
        }}
      />
    )
  }

  if (tab === 'transfers') {
    return (
      <DataGrid
        columns={['Coin', 'Type', 'Amount', 'Fee', 'Time']}
        minWidth="420px"
        className="mx-3 my-3 overflow-x-auto"
        data={MOCK_TRANSFERS}
        renderRow={(t, i, grid) => {
          const isDeposit = t.type === 'deposit'
          return (
            <DataGridRow key={i} {...grid}>
              <span className="flex items-center justify-center gap-2 min-w-0 px-8">
                <CoinIcon coin="USDC" size={20} />
                <span className="font-semibold text-sm text-[var(--text)] shrink-0">USDC</span>
              </span>
              <span className="flex justify-center px-8">
                <SideChip isLong={isDeposit}>{isDeposit ? 'Deposit' : 'Withdrawal'}</SideChip>
              </span>
              <span className="text-[14px] tabular-nums font-medium px-8" style={{ color: isDeposit ? 'var(--profit-green)' : 'var(--loss-red)' }}>
                {isDeposit ? '+' : ''}{compactUsd(t.usdc)}
              </span>
              <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">
                {t.fee > 0 ? compactUsd(t.fee) : '—'}
              </span>
              <span className="text-xs tabular-nums text-[var(--text-third)] px-8">
                {new Date(t.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </DataGridRow>
          )
        }}
      />
    )
  }

  return null
}

export function PortfolioGrowthScene({ playing, paused }) {
  const steps = useSequence(playing, [300, 1600, 2600])
  const [activeTab, setActiveTab] = useState('positions')

  const portfolioValue = useCountUp(12450, 1400, steps[0])
  const pnlValue = useCountUp(2340.5, 1000, steps[1])
  const tabsVisible = steps[2]

  // Cycle through tabs once they appear
  useEffect(() => {
    if (!tabsVisible || paused) return
    let i = PORTFOLIO_TABS.indexOf(activeTab)
    const iv = setInterval(() => {
      i = (i + 1) % PORTFOLIO_TABS.length
      setActiveTab(PORTFOLIO_TABS[i])
    }, 2400)
    return () => clearInterval(iv)
  }, [tabsVisible, paused]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset tab when animation stops
  if (!tabsVisible && activeTab !== 'positions') {
    setActiveTab('positions')
  }

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 12, overflow: 'hidden' }}>
      {steps[0] && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} style={{ textAlign: 'center' }}>
          <div className="text-[12px] text-[var(--text-third)] mb-1 tracking-wider uppercase font-semibold">Portfolio Value</div>
          <div className="text-[44px] font-extrabold text-[var(--text)] tabular-nums leading-none">
            ${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {steps[1] && (
          <motion.div
            key="pnl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex gap-2 items-baseline justify-center"
          >
            <span className="text-[20px] font-bold text-[var(--profit-green)] tabular-nums">
              +${pnlValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <Chip size="sm" className="bg-[rgba(181,239,220,0.1)] text-[var(--profit-green)] font-semibold">+23.1%</Chip>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {steps[2] && (
          <motion.div
            key="tabs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{ width: '100%' }}
          >
            <div className="port-tabs">
              <Tabs value={activeTab}>
                <TabsList className="w-full border-b border-[var(--separator)]">
                  {PORTFOLIO_TABS.map(t => (
                    <TabsTrigger key={t} value={t} className="flex-1 h-12 text-[14px] font-medium text-[var(--text-secondary)] data-[state=active]:text-[var(--text)] data-[state=active]:font-bold">{PORTFOLIO_TAB_LABELS[t]}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                <PortfolioTabContent tab={activeTab} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Scene 3: Copy Trading ────────────────────────────────────────

const FOLLOWER_TRADES = [
  { name: 'alex.eth', address: '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', coin: 'BTC', side: 'Long', size: '$5,000' },
  { name: 'solartrader', address: '0xb2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', coin: 'BTC', side: 'Long', size: '$2,100' },
  { name: '0xwhale', address: '0xc3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', coin: 'BTC', side: 'Long', size: '$8,400' },
]

export function CopyTradingScene({ playing, paused }) {
  const steps = useSequence(playing, [300, 1200, 1800, 2600, 3200, 3800])

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '28px 32px', gap: 0, overflow: 'hidden' }}>
      {/* Leader card — mirrors TraderCard structure */}
      <AnimatePresence>
        {steps[0] && (
          <motion.div
            key="leader"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            style={{ width: '100%', maxWidth: 380 }}
          >
            <Card className="border border-[rgba(181,239,220,0.2)]">
              <CardBody>
                <div className="sidebar-box-item" style={{ gap: 12 }}>
                  <Avatar address="0xprotrader1234567890abcdef1234567890abcdef" size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[15px] font-bold text-[var(--text)]">ProTrader.eth</span>
                      <Chip size="sm" className="bg-[var(--primary)] text-[var(--bg)] font-bold">TOP TRADER</Chip>
                    </div>
                    <div className="text-[13px] font-semibold text-[var(--profit-green)]">+$48,200 PnL</div>
                    <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                      <span>72% win</span>
                      <span> · </span>
                      <span>341 trades</span>
                    </div>
                  </div>
                  <Button size="sm" className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold px-4 h-8">
                    Copy
                  </Button>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Arrow connector */}
      <AnimatePresence>
        {steps[1] && (
          <motion.div key="connector" className="flex flex-col items-center" style={{ padding: '6px 0' }}>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 36 }}
              transition={{ duration: 0.4 }}
              style={{ width: 2, background: 'linear-gradient(to bottom, var(--primary), rgba(181,239,220,0.2))', borderRadius: 2 }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
            >
              <svg width="16" height="10" viewBox="0 0 16 10"><path d="M8 10L0 0h16z" fill="var(--primary)" /></svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {steps[2] && (
          <motion.div
            key="following"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.5, 1] }}
            transition={{ duration: 1.2 }}
            className="text-[13px] text-[var(--primary)] font-semibold tracking-wider uppercase py-1.5"
          >
            Following...
          </motion.div>
        )}
      </AnimatePresence>

      {/* Follower cards — mirrors TraderCard / sidebar-box-item structure */}
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)', marginTop: 4 }}>
        <AnimatePresence>
          {FOLLOWER_TRADES.map((f, i) =>
            steps[i + 3] && (
              <motion.div
                key={f.name}
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              >
                <Card>
                  <CardBody>
                    <div className="sidebar-box-item" style={{ gap: 12 }}>
                      <Avatar address={f.address} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] font-semibold text-[var(--text)]">{f.name}</span>
                          <Chip size="sm" className="bg-[rgba(181,239,220,0.12)] text-[var(--primary)] font-semibold">Auto-copied</Chip>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[var(--text-secondary)]">
                          <CoinIcon coin={f.coin} size={14} />
                          <Chip size="sm" className="bg-[rgba(181,239,220,0.1)] text-[var(--profit-green)] font-semibold">{f.side}</Chip>
                          <span>{f.size}</span>
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Scene 4: Live Feed ───────────────────────────────────────────
// Mirrors PostCard internal structure: Card > Avatar + header + content + action bar

const FEED_POSTS = [
  { username: 'CryptoKing', displayName: 'Crypto King', address: '0x1111111111111111111111111111111111111111', content: 'Longed $ETH at $3,200 - breakout incoming', coin: 'ETH', pnl: 840, likes: 42, comments: 8, trending: true },
  { username: 'DeFi_Whale', displayName: 'DeFi Whale', address: '0x2222222222222222222222222222222222222222', content: 'Shorted $BTC at $64,500 before CPI data', coin: 'BTC', pnl: 2100, likes: 87, comments: 23, trending: false },
  { username: 'SolanaMaxi', displayName: 'Solana Maxi', address: '0x3333333333333333333333333333333333333333', content: 'SOL breakout confirmed, adding to long', coin: 'SOL', pnl: 560, likes: 31, comments: 5, trending: false },
  { username: 'TraderAnon', displayName: 'Trader Anon', address: '0x4444444444444444444444444444444444444444', content: 'Took profit on ARB short. Clean setup.', coin: 'ARB', pnl: 380, likes: 19, comments: 3, trending: false },
]

export function LiveFeedScene({ playing, paused }) {
  const steps = useSequence(playing, [300, 900, 1500, 2100, 2800])

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '24px 12px', gap: 0, overflow: 'hidden' }}>
      <AnimatePresence>
        {steps[0] && (
          <motion.div
            key="header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex justify-between items-center"
            style={{ width: '100%', maxWidth: 420, marginBottom: 8, padding: '0 4px' }}
          >
            <span className="text-[16px] font-bold text-[var(--text)]">Live Feed</span>
            <motion.div
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="flex items-center gap-1.5"
            >
              <Chip size="sm" className="bg-[rgba(181,239,220,0.15)] text-[var(--profit-green)] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--profit-green)] mr-1 inline-block" />
                LIVE
              </Chip>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Posts — mirrors PostCard layout: Card > flex gap-3 > Avatar + content */}
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AnimatePresence>
          {FEED_POSTS.map((post, i) =>
            steps[i] && (
              <motion.div
                key={post.username}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 240, damping: 22 }}
              >
                <Card className="flex gap-3 p-3 sm:p-4 mx-3 relative">
                  <Avatar address={post.address} size={40} />
                  <div className="flex-1 min-w-0">
                    {/* Header — matches PostCard header structure */}
                    <div className="flex items-start gap-1.5 text-sm">
                      <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                        <span className="font-bold text-[var(--text)]">{post.displayName}</span>
                        <span className="text-[var(--text-third)]">@{post.username}</span>
                        <span className="text-[var(--text-third)]">·</span>
                        <span className="text-[var(--text-third)]">just now</span>
                        <Chip size="sm" className="tweet-coin-badge">${post.coin}</Chip>
                        <Chip size="sm" className="font-semibold tabular-nums bg-[rgba(181,239,220,0.1)] text-[var(--profit-green)]">
                          +${post.pnl.toLocaleString()}
                        </Chip>
                      </div>
                      {post.trending && (
                        <motion.div
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ duration: 1.6, repeat: Infinity }}
                        >
                          <Chip size="sm" className="bg-[var(--primary)] text-[var(--bg)] font-bold">TRENDING</Chip>
                        </motion.div>
                      )}
                    </div>

                    {/* Content — matches tweet-content */}
                    <div className="tweet-content">{post.content}</div>

                    {/* Actions — matches PostCard action bar */}
                    <div className="flex items-center justify-between max-w-[320px] mt-2 -ml-2">
                      <span className="tweet-action">
                        <span className="tweet-action-icon"><IconComment size={16} /></span>
                        <span>{steps[4] ? <AnimatedCounter target={post.comments} active={steps[4]} duration={600} /> : 0}</span>
                      </span>
                      <span className="tweet-action">
                        <span className="tweet-action-icon"><IconRepost size={16} /></span>
                        <span>0</span>
                      </span>
                      <span className="tweet-action like">
                        <span className="tweet-action-icon"><IconHeart size={16} /></span>
                        <span>{steps[4] ? <AnimatedCounter target={post.likes} active={steps[4]} /> : 0}</span>
                      </span>
                      <span className="tweet-action">
                        <span className="tweet-action-icon"><IconShare size={16} /></span>
                      </span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Scene 5: Profile ─────────────────────────────────────────────

const MOCK_TRADER_STATS = {
  accountValue: 48250,
  totalUnrealizedPnl: 2847,
  marginUsagePct: 34.7,
  directionBias: 'LONG',
  longPct: 71,
  shortPct: 29,
  longExposure: 31200,
  shortExposure: 12800,
  avgLeverage: 8.42,
  totalFunding: -127.83,
}

const MOCK_TRADING = {
  winCount: 187,
  totalTrades: 264,
  winRate: 71,
  closedTrades: [
    { coin: 'BTC', pnl: 1240, exitTime: Date.now() - 86400000 },
    { coin: 'ETH', pnl: -155, exitTime: Date.now() - 172800000 },
    { coin: 'SOL', pnl: 1255, exitTime: Date.now() - 259200000 },
    { coin: 'BTC', pnl: 840, exitTime: Date.now() - 345600000 },
    { coin: 'ETH', pnl: 320, exitTime: Date.now() - 432000000 },
    { coin: 'BTC', pnl: -90, exitTime: Date.now() - 518400000 },
    { coin: 'SOL', pnl: 560, exitTime: Date.now() - 604800000 },
    { coin: 'BTC', pnl: 1100, exitTime: Date.now() - 691200000 },
  ],
}

// Generate mock PnL timeline data for the chart
const MOCK_PNL_DATA = (() => {
  const now = Date.now()
  const points = []
  let pnl = 0
  for (let i = 90; i >= 0; i--) {
    pnl += (Math.random() - 0.35) * 800
    points.push({ ts: now - i * 86400000, pnl: Math.round(pnl * 100) / 100 })
  }
  return points
})()

const PROFILE_TABS = ['trader', 'posts', 'positions', 'history']
const PROFILE_TAB_LABELS = { trader: 'Trader', posts: 'Posts', positions: 'Positions (3)', history: 'History' }

const MOCK_PROFILE_POSTS = [
  { id: 'demo-1', content: 'Longed $BTC at $62k. This is the breakout we waited for.', authorAddress: '0xfaf7560b7a4d6227ff01f6618bcad0fca0befcd5', authorDisplayName: 'BTC club', authorUsername: 'realTrader', authorAvatarUrl: '/club.png', pnl: 1240, attachment: { type: 'pnl', coin: 'BTC' }, likeCount: 64, commentCount: 12, repostCount: 3, createdAt: new Date(Date.now() - 3600000).toISOString(), liked: false, reposted: false },
  { id: 'demo-2', content: 'Closed $ETH short for a small loss. Wrong read on the CPI data.', authorAddress: '0xfaf7560b7a4d6227ff01f6618bcad0fca0befcd5', authorDisplayName: 'BTC club', authorUsername: 'realTrader', authorAvatarUrl: '/club.png', pnl: -155, attachment: { type: 'pnl', coin: 'ETH' }, likeCount: 23, commentCount: 4, repostCount: 1, createdAt: new Date(Date.now() - 86400000).toISOString(), liked: true, reposted: false },
]

function ProfileTabContent({ tab }) {
  if (tab === 'trader') {
    return (
      <>
        <div className="trader-grid">
          <TraderStatsCards traderStats={MOCK_TRADER_STATS} trading={MOCK_TRADING} />
        </div>
        <div style={{ padding: '0 12px' }}>
          <div className="trader-chart-card">
            <PnLChart data={MOCK_PNL_DATA} height={220} />
          </div>
        </div>
      </>
    )
  }

  if (tab === 'posts') {
    return (
      <div className="feed-cards">
        {MOCK_PROFILE_POSTS.map(post => (
          <PostCard key={post.id} post={post} user={null} />
        ))}
      </div>
    )
  }

  if (tab === 'positions') return <PositionList positions={MOCK_POSITIONS} />

  if (tab === 'history') return <TradeList trades={MOCK_TRADES} />

  return null
}

export function ProfileScene({ playing, paused }) {
  const steps = useSequence(playing, [200, 1000, 2200, 3400])
  const [activeTab, setActiveTab] = useState('trader')
  const contentVisible = steps[1]

  // Cycle through tabs after initial content loads
  useEffect(() => {
    if (!contentVisible || paused) return
    let i = PROFILE_TABS.indexOf(activeTab)
    const iv = setInterval(() => {
      i = (i + 1) % PROFILE_TABS.length
      setActiveTab(PROFILE_TABS[i])
    }, 2800)
    return () => clearInterval(iv)
  }, [contentVisible, paused]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset tab when animation stops
  if (!contentVisible && activeTab !== 'trader') {
    setActiveTab('trader')
  }

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <AnimatePresence>
        {steps[0] && (
          <motion.div
            key="header"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          >
            <ProfileHeader
              address="0xfaf7560b7a4d6227ff01f6618bcad0fca0befcd5"
              displayName="BTC club"
              username="realTrader"
              avatarUrl="/club.png"
              bio="If this is your first night at the DEX, you HAVE to trade"
              pnl={12847.32}
              accountValue={48250.73}
              followingCount={142}
              followerCount={1283}
              actions={
                <>
                  <Button variant="outline" size="sm" className="rounded-full border-[var(--border)] text-[var(--text)] font-bold">Follow</Button>
                  <Button size="sm" className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold">Copy Trade</Button>
                </>
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {steps[0] && (
          <motion.div
            key="tabs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <Tabs value={activeTab} className="w-full">
              <TabsList className="gap-0 w-full relative rounded-none p-0 border-b border-[var(--border)]">
                {PROFILE_TABS.map(t => (
                  <TabsTrigger key={t} value={t} className="flex-1 h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">{PROFILE_TAB_LABELS[t]}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab content — swaps with animation */}
      <AnimatePresence mode="wait">
        {steps[1] && (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
          >
            <ProfileTabContent tab={activeTab} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
