import { useState, useEffect, useMemo } from 'react'
import { Skeleton } from '../components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import PageHeader from '../components/PageHeader'
import Aurora from '../components/Aurora'
import PositionsTable from '../components/PositionsTable'
import CoinIcon from '../components/terminal/CoinIcon'
import { DataGrid, DataGridRow } from '../components/ui/data-grid'
import { SideChip } from '../components/ui/side-chip'
import { PnlValue } from '../components/ui/pnl-value'
import { AuthGate } from '../components/ui/auth-gate'
import { compactUsd } from '../utils/format'
import { formatTime } from '../store/localStorage'
import { Button } from '../components/ui/button'
import DepositWithdrawModal from '../components/DepositWithdrawModal'
import {
  getUserState,
  getUserFills,
  getUserPortfolio,
  getUserTransfers,
  getFrontendOpenOrders,
  getUserOrderHistory,
  parsePositions,
  parseAccountValue,
  parseTotalPnl,
  parseTotalPnlFromPortfolio,
  parseClosedTrades,
  parseOrderHistory,
  buildLeverageMap,
  computeTradeStats,
  formatUsd,
} from '../api/hyperliquid'

function BalanceSkeleton() {
  return (
    <div className="port-balance-card">
      <Skeleton classNames={{ base: 'h-3 w-20 rounded-md bg-white/5' }} />
      <Skeleton classNames={{ base: 'h-8 w-40 rounded-md bg-white/5 mt-2' }} />
      <Skeleton classNames={{ base: 'h-3 w-24 rounded-md bg-white/[0.03] mt-2' }} />
      <div className="port-actions" style={{ marginTop: 16 }}>
        <Skeleton classNames={{ base: 'h-9 w-28 rounded-full bg-white/5' }} />
        <Skeleton classNames={{ base: 'h-9 w-28 rounded-full bg-white/5' }} />
      </div>
    </div>
  )
}

function PositionsSkeleton() {
  return (
    <div className="port-positions">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="port-position-row">
          <Skeleton classNames={{ base: 'w-6 h-6 rounded-full bg-white/5' }} />
          <Skeleton classNames={{ base: 'h-4 w-16 rounded-md bg-white/5' }} />
          <Skeleton classNames={{ base: 'h-4 w-20 rounded-md bg-white/5 ml-auto' }} />
        </div>
      ))}
    </div>
  )
}

export default function Portfolio({ user }) {
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState(null)
  const [fills, setFills] = useState([])
  const [portfolioData, setPortfolioData] = useState(null)
  const [transfers, setTransfers] = useState([])
  const [openOrders, setOpenOrders] = useState([])
  const [orderHistory, setOrderHistory] = useState([])
  const [tab, setTab] = useState('positions')
  const [modalMode, setModalMode] = useState(null) // 'deposit' | 'withdraw' | null

  const address = user?.address

  useEffect(() => {
    if (!address) return
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [s, f, p, t, o, oh] = await Promise.all([
          getUserState(address).catch(() => null),
          getUserFills(address).catch(() => []),
          getUserPortfolio(address).catch(() => null),
          getUserTransfers(address).catch(() => []),
          getFrontendOpenOrders(address).catch(() => []),
          getUserOrderHistory(address).catch(() => []),
        ])
        if (cancelled) return
        setState(s)
        setFills(f || [])
        setPortfolioData(p)
        setTransfers(Array.isArray(t) ? t : [])
        const openArr = Array.isArray(o) ? o : []
        setOpenOrders(openArr)
        setOrderHistory(parseOrderHistory(oh, openArr))
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [address])

  const reload = () => {
    if (!address) return
    Promise.all([
      getUserState(address).catch(() => null),
      getUserTransfers(address).catch(() => []),
    ]).then(([s, t]) => {
      setState(s)
      setTransfers(Array.isArray(t) ? t : [])
    })
  }

  const accountValue = state ? parseAccountValue(state) : 0
  const withdrawableBalance = state?.withdrawable ? parseFloat(state.withdrawable) : 0
  const positions = useMemo(() => state ? parsePositions(state) : [], [state])
  const totalPnl = useMemo(() => {
    if (portfolioData) {
      const v = parseTotalPnlFromPortfolio(portfolioData)
      if (v != null) return v
    }
    return parseTotalPnl(fills)
  }, [fills, portfolioData])

  const tradeStats = useMemo(() => {
    if (!state || !fills.length) return null
    const leverageMap = buildLeverageMap(state)
    const trades = parseClosedTrades(fills, leverageMap)
    return { ...computeTradeStats(trades), trades: trades.slice(0, 50) }
  }, [state, fills])

  if (!user?.verified) {
    return (
      <div>
        <PageHeader title="Portfolio" showBack />
        <AuthGate
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a4 4 0 0 0-8 0v2" /></svg>}
          title="Sign in to view your portfolio"
          subtitle="Connect and verify your wallet to see your balances and positions."
          onVerified={() => window.location.reload()}
        />
      </div>
    )
  }

  return (
    <div className="port-page">
      <PageHeader title="Portfolio" />

      {/* Balance Card */}
      {loading ? <BalanceSkeleton /> : (
        <div className="port-balance-card port-balance-card--aurora">
          <Aurora colorStops={['#0B6E4F', '#b5efdc', '#073B3A']} amplitude={1.4} blend={0.5} speed={0.5} />
          <span className="port-balance-value">{formatUsd(accountValue)}</span>
          <PnlValue value={totalPnl} className="port-balance-pnl" showSign formatter={v => `${formatUsd(v)} PnL`} />
          <div className="port-actions">
            <Button className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold px-6"
              onClick={() => setModalMode('deposit')}
            >
              Deposit
            </Button>
            <Button variant="outline"
              className="rounded-full border-[var(--separator)] text-[var(--text)] font-semibold px-6"
              onClick={() => setModalMode('withdraw')}
            >
              Withdraw
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      {!loading && (
        <>
          <div className="port-tabs">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full border-b border-[var(--separator)]">
                <TabsTrigger value="positions" className="flex-1 h-12 text-[14px] font-medium text-[var(--text-secondary)] data-[state=active]:text-[var(--text)] data-[state=active]:font-bold">Positions</TabsTrigger>
                <TabsTrigger value="orders" className="flex-1 h-12 text-[14px] font-medium text-[var(--text-secondary)] data-[state=active]:text-[var(--text)] data-[state=active]:font-bold">Open Orders</TabsTrigger>
                <TabsTrigger value="history" className="flex-1 h-12 text-[14px] font-medium text-[var(--text-secondary)] data-[state=active]:text-[var(--text)] data-[state=active]:font-bold">Trades</TabsTrigger>
                <TabsTrigger value="fills" className="flex-1 h-12 text-[14px] font-medium text-[var(--text-secondary)] data-[state=active]:text-[var(--text)] data-[state=active]:font-bold">Orders</TabsTrigger>
                <TabsTrigger value="transfers" className="flex-1 h-12 text-[14px] font-medium text-[var(--text-secondary)] data-[state=active]:text-[var(--text)] data-[state=active]:font-bold">Transfers</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {tab === 'positions' && (
            <PositionsTable positions={positions} />
          )}

          {tab === 'orders' && (
            openOrders.length === 0 ? (
              <div className="port-empty">No open orders</div>
            ) : (
              <DataGrid
                columns={['Coin', 'Side', 'Type', 'Size', 'Price']}
                minWidth="420px"
                className="mx-3 overflow-x-auto"
                data={openOrders}
                renderRow={(o, i, grid) => {
                  const isBuy = o.side === 'B'
                  return (
                    <DataGridRow key={o.oid || i} {...grid}>
                      <span className="flex items-center justify-center gap-2 min-w-0 px-8">
                        <CoinIcon coin={o.coin} size={20} />
                        <span className="font-semibold text-sm text-[var(--text)] shrink-0">{o.coin}</span>
                      </span>
                      <span className="flex justify-center px-8">
                        <SideChip isLong={isBuy}>{isBuy ? 'Buy' : 'Sell'}</SideChip>
                      </span>
                      <span className="text-[14px] text-[var(--text-secondary)] px-8">{o.orderType || 'Limit'}</span>
                      <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{o.sz}</span>
                      <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{compactUsd(parseFloat(o.limitPx))}</span>
                    </DataGridRow>
                  )
                }}
              />
            )
          )}

          {tab === 'history' && (
            !tradeStats?.trades?.length ? (
              <div className="port-empty">No trade history</div>
            ) : (
              <DataGrid
                columns={['Coin', 'Side', 'Size', 'Entry', 'Exit', 'PnL']}
                minWidth="480px"
                className="mx-3 overflow-x-auto"
                data={tradeStats.trades}
                renderRow={(t, i, grid) => (
                  <DataGridRow key={i} {...grid}>
                    <span className="flex items-center justify-center gap-2 min-w-0 px-8">
                      <CoinIcon coin={t.coin} size={20} />
                      <span className="font-semibold text-sm text-[var(--text)] shrink-0">{t.coin}</span>
                    </span>
                    <span className="flex justify-center px-8">
                      <SideChip isLong={t.side === 'Long'}>{t.side}</SideChip>
                    </span>
                    <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{compactUsd(t.size * t.exitPrice)}</span>
                    <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{compactUsd(t.entryPrice)}</span>
                    <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{compactUsd(t.exitPrice)}</span>
                    <PnlValue value={t.pnl} className="text-[14px] tabular-nums font-medium px-8" />
                  </DataGridRow>
                )}
              />
            )
          )}

          {tab === 'fills' && (
            orderHistory.length === 0 ? (
              <div className="port-empty">No order history</div>
            ) : (
              <DataGrid
                columns={['Coin', 'Side', 'Type', 'Size', 'Price', 'Trigger', 'Status']}
                minWidth="580px"
                className="mx-3 overflow-x-auto"
                data={orderHistory}
                renderRow={(o, i, grid) => {
                  const statusColor = o.status === 'filled' ? 'text-[var(--profit-green)]'
                    : o.status === 'canceled' || o.status === 'marginCanceled' ? 'text-[var(--text-third)]'
                    : o.status === 'triggered' ? 'text-[var(--primary)]'
                    : 'text-[var(--text-secondary)]'
                  const statusLabel = o.status === 'filled' ? 'Filled'
                    : o.status === 'canceled' ? 'Canceled'
                    : o.status === 'triggered' ? 'Triggered'
                    : o.status === 'marginCanceled' ? 'Margin Canceled'
                    : o.status === 'open' ? 'Open'
                    : o.status
                  return (
                    <DataGridRow key={o.oid || i} {...grid}>
                      <span className="flex items-center justify-center gap-2 min-w-0 px-8">
                        <CoinIcon coin={o.coin} size={20} />
                        <span className="font-semibold text-sm text-[var(--text)] shrink-0">{o.coin}</span>
                      </span>
                      <span className="flex justify-center px-8">
                        <SideChip isLong={o.sideType === 'long'}>{o.side}</SideChip>
                      </span>
                      <span className="text-[14px] text-[var(--text-secondary)] px-8">{o.type}</span>
                      <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{o.size}</span>
                      <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{o.price === 'Market' ? 'Market' : compactUsd(parseFloat(o.price))}</span>
                      <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{o.trigger}</span>
                      <span className={`text-xs font-medium px-8 ${statusColor}`}>{statusLabel}</span>
                    </DataGridRow>
                  )
                }}
              />
            )
          )}

          {tab === 'transfers' && (
            transfers.length === 0 ? (
              <div className="port-empty">No deposits or withdrawals</div>
            ) : (
              <DataGrid
                columns={['Coin', 'Type', 'Amount', 'Fee', 'Time']}
                minWidth="420px"
                className="mx-3 overflow-x-auto"
                data={transfers}
                renderRow={(t, i, grid) => {
                  const delta = t.delta
                  const type = delta?.type || 'unknown'
                  const usdc = parseFloat(delta?.usdc || 0)
                  const fee = parseFloat(delta?.fee || 0)
                  const isDeposit = type === 'deposit' || usdc > 0
                  const label = type === 'deposit' ? 'Deposit'
                    : type === 'withdraw' ? 'Withdrawal'
                    : type === 'internalTransfer' ? 'Transfer'
                    : type === 'spotTransfer' ? 'Spot Transfer'
                    : type
                  return (
                    <DataGridRow key={i} {...grid}>
                      <span className="flex items-center justify-center gap-2 min-w-0 px-8">
                        <CoinIcon coin="USDC" size={20} />
                        <span className="font-semibold text-sm text-[var(--text)] shrink-0">USDC</span>
                      </span>
                      <span className="flex justify-center px-8">
                        <SideChip isLong={isDeposit}>{label}</SideChip>
                      </span>
                      <span className="text-[14px] tabular-nums font-medium px-8" style={{ color: isDeposit ? 'var(--profit-green)' : 'var(--loss-red)' }}>
                        {isDeposit ? '+' : ''}{compactUsd(usdc)}
                      </span>
                      <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">
                        {fee > 0 ? compactUsd(fee) : '—'}
                      </span>
                      <span className="text-xs tabular-nums text-[var(--text-third)] px-8">
                        {formatTime(t.time)}
                      </span>
                    </DataGridRow>
                  )
                }}
              />
            )
          )}
        </>
      )}

      {loading && <PositionsSkeleton />}

      {modalMode && (
        <DepositWithdrawModal
          mode={modalMode}
          withdrawableBalance={withdrawableBalance}
          onClose={() => setModalMode(null)}
          onSuccess={() => { setModalMode(null); reload() }}
        />
      )}
    </div>
  )
}
