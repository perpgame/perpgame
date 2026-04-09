import { useState, useCallback, useEffect } from 'react'
import { useHeaderContext } from '../contexts/HeaderContext'
import { useParams, useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { DEFAULT_COIN } from '../config/hyperliquid'
import { useAssetMeta } from '../hooks/useAssetMeta'
import { useTerminalState } from '../hooks/useTerminalState'
import { useAgentTerminalState } from '../hooks/useAgentTerminalState'
// import { useHlTrading } from '../hooks/useHlTrading'
// import { useToast } from '../components/Toast'
import Sidebar from '../components/Sidebar'
import TerminalHeader from '../components/terminal/TerminalHeader'
import CandlestickChart from '../components/terminal/CandlestickChart'
import OrderBook from '../components/terminal/OrderBook'
// import OrderForm from '../components/terminal/OrderForm'
import TerminalPositions from '../components/terminal/TerminalPositions'
import TerminalOrders from '../components/terminal/TerminalOrders'
import TerminalTrades from '../components/terminal/TerminalTrades'
import CoinIcon from '../components/terminal/CoinIcon'
import AgentPickerBar from '../components/AgentPickerBar'
import { DataGrid, DataGridRow } from '../components/ui/data-grid'
import { SideChip } from '../components/ui/side-chip'
import { compactUsd } from '../utils/format'
import { formatTime } from '../store/localStorage'
import { getUserFills, getUserTransfers, getUserOrderHistory, parseOrderHistory, buildLeverageMap, getUserState } from '../api/hyperliquid'
import '../styles/terminal.css'


export default function Terminal({ user, onLogout }) {
  const { coin: paramCoin, agent: agentParam } = useParams()
  const navigate = useNavigate()
  const ctx = useHeaderContext()
  const coin = paramCoin?.toUpperCase() || DEFAULT_COIN
  const agentAddress = agentParam || null

  const { allCoins, getAssetInfo } = useAssetMeta()
  const {
    markPrice, allMids, refresh: refreshUser,
  } = useTerminalState(coin)

  const {
    positions, openOrders, accountValue, refresh: refreshAgent,
  } = useAgentTerminalState(agentAddress)

  // const { placeOrder, closePosition, partialClose, setTpSl, cancelOrder, adjustMargin, loading: tradingLoading } = useHlTrading({ refresh: refreshUser })
  // const toast = useToast()

  const [chartTab, setChartTab] = useState('chart')
  const [bottomTab, setBottomTab] = useState('positions')
  const [orderHistory, setOrderHistory] = useState([])
  const [transfers, setTransfers] = useState([])

  const assetInfo = getAssetInfo(coin)

  useEffect(() => {
    if (!agentAddress) return
    ctx?.setRightContent(
      <AgentPickerBar currentAddress={agentAddress} onSelect={agent => navigate(`/terminal/${coin.toLowerCase()}/${agent.address}`, { replace: true })} />
    )
    return () => ctx?.setRightContent(null)
  }, [agentAddress, coin]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!agentAddress) return
    let cancelled = false
    async function load() {
      try {
        const [fills, state, t] = await Promise.all([
          getUserFills(agentAddress).catch(() => []),
          getUserState(agentAddress).catch(() => null),
          getUserTransfers(agentAddress).catch(() => []),
        ])
        if (cancelled) return
        const leverageMap = buildLeverageMap(state)
        setOrderHistory(parseOrderHistory(fills, leverageMap))
        setTransfers(Array.isArray(t) ? t : [])
      } catch { /* ignore */ }
    }
    load()
    return () => { cancelled = true }
  }, [agentAddress])

  const handleChangeCoin = useCallback((newCoin) => {
    navigate(`/terminal/${newCoin.toLowerCase()}${agentAddress ? `/${agentAddress}` : ''}`, { replace: true })
  }, [navigate, agentAddress])

  const renderBottomTabs = () => (
    <Tabs value={bottomTab} onValueChange={setBottomTab} className="w-full">
      <TabsList className="gap-0 w-full relative rounded-none p-0 px-2 border-b border-[var(--separator)]">
        <TabsTrigger value="positions" className="max-w-fit px-3 h-8 data-[state=active]:text-[var(--text)] text-[var(--text-third)] font-semibold text-xs">
          {positions.length > 0
            ? <span>Positions <span className="ml-1 inline-flex items-center justify-center rounded-full bg-[var(--primary-faded2)] text-[var(--primary)] text-[10px] font-bold min-w-[18px] h-[18px] px-1">{positions.length}</span></span>
            : "Positions"
          }
        </TabsTrigger>
        <TabsTrigger value="orders" className="max-w-fit px-3 h-8 data-[state=active]:text-[var(--text)] text-[var(--text-third)] font-semibold text-xs">
          {openOrders.length > 0
            ? <span>Open Orders <span className="ml-1 inline-flex items-center justify-center rounded-full bg-[var(--primary-faded2)] text-[var(--primary)] text-[10px] font-bold min-w-[18px] h-[18px] px-1">{openOrders.length}</span></span>
            : "Open Orders"
          }
        </TabsTrigger>
        <TabsTrigger value="trades" className="max-w-fit px-3 h-8 data-[state=active]:text-[var(--text)] text-[var(--text-third)] font-semibold text-xs">Trades</TabsTrigger>
        <TabsTrigger value="fills" className="max-w-fit px-3 h-8 data-[state=active]:text-[var(--text)] text-[var(--text-third)] font-semibold text-xs">Orders</TabsTrigger>
        <TabsTrigger value="transfers" className="max-w-fit px-3 h-8 data-[state=active]:text-[var(--text)] text-[var(--text-third)] font-semibold text-xs">Transfers</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const renderBottomContent = () => (
    <div className="terminal-bottom-content">
      {bottomTab === 'positions' && (
        <TerminalPositions positions={positions} accountValue={accountValue} />
      )}
      {bottomTab === 'orders' && (
        <TerminalOrders orders={openOrders} />
      )}
      {bottomTab === 'trades' && (
        <TerminalTrades coin={coin} address={agentAddress} />
      )}
      {bottomTab === 'fills' && (
        orderHistory.length === 0 ? (
          <div className="terminal-panel-empty">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>
            </svg>
            No order history
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataGrid
              columns={['Coin', 'Side', 'Type', 'Size', 'Price', 'Trigger', 'Status']}
              minWidth="580px"
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
          </div>
        )
      )}
      {bottomTab === 'transfers' && (
        transfers.length === 0 ? (
          <div className="terminal-panel-empty">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            No deposits or withdrawals
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataGrid
              columns={['Coin', 'Type', 'Amount', 'Fee', 'Time']}
              minWidth="420px"
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
          </div>
        )
      )}
    </div>
  )

  return (
    <div className="terminal-layout">
      <Sidebar user={user} onLogout={onLogout} />

      <div className="terminal-main">
        <TerminalHeader
          coin={coin}
          coins={allCoins}
          allMids={allMids}
          assetInfo={assetInfo}
          accountValue={accountValue}
          onChangeCoin={handleChangeCoin}
        >
          {agentAddress && (
            <AgentPickerBar
              currentAddress={agentAddress}
              onSelect={agent => navigate(`/terminal/${coin.toLowerCase()}/${agent.address}`, { replace: true })}
            />
          )}
        </TerminalHeader>
        {/* Desktop layout */}
        <div className="terminal-body terminal-desktop-only">
          <div className="terminal-col-chart">
            <Tabs value={chartTab} onValueChange={setChartTab} className="w-full">
              <TabsList className="gap-0 w-full relative rounded-none p-0 px-3 border-b border-[var(--separator)]">
                <TabsTrigger value="chart" className="max-w-fit px-3.5 h-9 data-[state=active]:text-[var(--text)] text-[var(--text-third)] font-semibold text-xs">Chart</TabsTrigger>
                <TabsTrigger value="orderbook" className="max-w-fit px-3.5 h-9 data-[state=active]:text-[var(--text)] text-[var(--text-third)] font-semibold text-xs">Order Book</TabsTrigger>
              </TabsList>
            </Tabs>
            {chartTab === 'chart' && <CandlestickChart coin={coin} positions={positions} />}
            {chartTab === 'orderbook' && <OrderBook coin={coin} markPrice={markPrice} />}
          </div>

          {/* Order panel commented out — agent view only for now */}
          {/* <div className="terminal-col-order">
            <OrderForm ... />
          </div> */}
        </div>

        <div className="terminal-bottom terminal-desktop-only">
          {renderBottomTabs()}
          {renderBottomContent()}
        </div>

        {/* Mobile layout */}
        <div className="terminal-mobile-only">
          <Tabs value={chartTab} onValueChange={setChartTab} className="w-full">
            <TabsList className="gap-0 w-full relative rounded-none p-0 px-1 border-b border-[var(--separator)] bg-[rgba(6,10,14,0.4)]">
              <TabsTrigger value="chart" className="h-10 data-[state=active]:text-[var(--text)] text-[var(--text-third)] font-semibold text-[13px]">Chart</TabsTrigger>
              <TabsTrigger value="orderbook" className="h-10 data-[state=active]:text-[var(--text)] text-[var(--text-third)] font-semibold text-[13px]">Order Book</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="terminal-mobile-chart">
            {chartTab === 'chart' && <CandlestickChart coin={coin} positions={positions} />}
            {chartTab === 'orderbook' && <OrderBook coin={coin} markPrice={markPrice} />}
          </div>

          <div className="terminal-mobile-positions">
            {renderBottomTabs()}
            {renderBottomContent()}
          </div>
        </div>
      </div>
    </div>
  )
}
