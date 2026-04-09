import { useState, useEffect } from 'react'
import { Skeleton } from './ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from './ui/dialog'
import { getUserState, getUserFills, getUserPortfolio, buildPnlTimeline, buildPnlTimelineFromPortfolio, parseClosedTrades, parseLiquidations, buildLeverageMap, formatUsd } from '../api/hyperliquid'
import { formatPrice } from '../utils/format'
import CoinIcon from './terminal/CoinIcon'
import PostAttachment from './PostAttachment'
import { Button } from './ui/button'
import { Chip } from './ui/chip'

function IconChartLine({ size = 24 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}


function IconSkull({ size = 24 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 9s1.5-2 4-2 4 2 4 2" />
      <path d="M8 15s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
      <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
    </svg>
  )
}

function IconReplay({ size = 24 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  )
}


export default function AttachmentPicker({ address, onAttach, onClose, inline }) {
  const [step, setStep] = useState('type')
  const [loading, setLoading] = useState(true)
  const [timeline, setTimeline] = useState([])
  const [preview, setPreview] = useState(null)
  const [closedTrades, setClosedTrades] = useState([])
  const [liquidations, setLiquidations] = useState([])

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      setLoading(true)
      try {
        const [state, fills, portfolioData] = await Promise.all([
          getUserState(address),
          getUserFills(address),
          getUserPortfolio(address).catch(() => null),
        ])
        if (cancelled) return
        const leverageMap = buildLeverageMap(state)
        const trades = parseClosedTrades(fills, leverageMap)
        const liqs = parseLiquidations(fills, leverageMap)

        setClosedTrades(trades.slice(0, 50))
        setLiquidations(liqs)

        const portfolioTimeline = portfolioData ? buildPnlTimelineFromPortfolio(portfolioData) : []
        setTimeline(portfolioTimeline.length > 1 ? portfolioTimeline : buildPnlTimeline(fills))
      } catch {
        // Data unavailable
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [address])

  const hasChart = timeline.length > 1 && timeline.some(p => p.pnl !== 0)
  const hasLiquidations = liquidations.length > 0
  const hasTrades = closedTrades.length > 0

  const pickType = (type) => {
    if (type === 'chart') {
      setPreview({ type: 'chart', data: { timeline } })
      setStep('preview')
    } else if (type === 'liquidation') {
      if (liquidations.length === 1) {
        const liq = liquidations[0]
        setPreview({ type: 'liquidation', data: { coin: liq.coin, side: liq.side, leverage: liq.leverage, entryPrice: liq.entryPrice, liqPrice: liq.liqPrice, size: liq.size, loss: liq.loss } })
        setStep('preview')
      } else {
        setStep('liquidation')
      }
    } else if (type === 'trade') {
      if (closedTrades.length === 1) {
        setPreview({ type: 'trade', data: { ...closedTrades[0] } })
        setStep('preview')
      } else {
        setStep('trade')
      }
    }
  }

  const pickTrade = (trade) => {
    setPreview({ type: 'trade', data: { ...trade } })
    setStep('preview')
  }

  const pickLiquidation = (liq) => {
    setPreview({ type: 'liquidation', data: { coin: liq.coin, side: liq.side, leverage: liq.leverage, entryPrice: liq.entryPrice, liqPrice: liq.liqPrice, size: liq.size, loss: liq.loss } })
    setStep('preview')
  }

  const handleAttach = () => {
    onAttach(preview)
    onClose()
  }

  const titles = {
    type: 'Attach Trading Data',
    trade: 'Select Trade',
    liquidation: 'Select Liquidation',
    preview: 'Preview',
  }

  const options = [
    { type: 'chart', icon: <IconChartLine size={18} />, label: 'PnL Chart', desc: hasChart ? `${timeline.length} data points` : 'No trade history', enabled: hasChart },
    { type: 'liquidation', icon: <IconSkull size={18} />, label: 'Liquidation', desc: hasLiquidations ? `${liquidations.length} liq${liquidations.length > 1 ? 's' : ''}` : 'No liquidations', enabled: hasLiquidations, danger: true },
    { type: 'trade', icon: <IconReplay size={18} />, label: 'Trade Replay', desc: hasTrades ? `${closedTrades.length} closed` : 'No closed trades', enabled: hasTrades },
  ]

  const content = (
    <>
      {loading && (
        <div className="attach-grid">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="attach-card attach-card--disabled">
              <Skeleton classNames={{ base: 'w-9 h-9 rounded-lg bg-white/5' }} />
              <div className="attach-card__text">
                <Skeleton classNames={{ base: 'h-3.5 w-20 rounded-md bg-white/5' }} />
                <Skeleton classNames={{ base: 'h-3 w-14 rounded-md bg-white/[0.03] mt-1' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && step === 'type' && (
        <div className="attach-grid">
          {options.map(opt => (
            <button
              key={opt.type}
              className={`attach-card ${!opt.enabled ? 'attach-card--disabled' : ''}`}
              disabled={!opt.enabled}
              onClick={() => pickType(opt.type)}
            >
              <div className={`attach-card__icon ${opt.danger ? 'attach-card__icon--danger' : ''}`}>
                {opt.icon}
              </div>
              <div className="attach-card__text">
                <span className="attach-card__label">{opt.label}</span>
                <span className="attach-card__desc">{opt.desc}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && step === 'trade' && (
        <div className="positions-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Type</th>
                <th>Position Value</th>
                <th>Entry Price</th>
                <th>Exit Price</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody>
              {closedTrades.map((trade, i) => {
                const isLong = trade.side === 'Long'
                const posValue = trade.size * trade.exitPrice
                const pnlColor = trade.pnl >= 0 ? 'var(--profit-green)' : 'var(--loss-red)'
                return (
                  <tr key={i} style={{ cursor: 'pointer' }} onClick={() => pickTrade(trade)}>
                    <td>
                      <span className="positions-coin-cell">
                        <CoinIcon coin={trade.coin} size={16} />
                        <span className="positions-coin-name">{trade.coin}</span>
                      </span>
                    </td>
                    <td>
                      <Chip size="sm" className={`${isLong ? 'bg-[rgba(181,239,220,0.1)]' : 'bg-[rgba(246,70,93,0.1)]'} text-[10px] font-semibold px-1 ${isLong ? 'text-[var(--profit-green)]' : 'text-[var(--loss-red)]'}`}>
                        {trade.side}
                      </Chip>
                    </td>
                    <td>{formatUsd(posValue)}</td>
                    <td>{formatPrice(trade.entryPrice)}</td>
                    <td>{formatPrice(trade.exitPrice)}</td>
                    <td style={{ color: pnlColor }}>{formatUsd(trade.pnl)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && step === 'liquidation' && (
        <div className="positions-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Type</th>
                <th>Position Value</th>
                <th>Entry Price</th>
                <th>Liq. Price</th>
                <th>Loss</th>
              </tr>
            </thead>
            <tbody>
              {liquidations.map((liq, i) => {
                const isLong = liq.side === 'Long'
                const posValue = Math.abs(liq.size) * liq.entryPrice
                return (
                  <tr key={i} style={{ cursor: 'pointer' }} onClick={() => pickLiquidation(liq)}>
                    <td>
                      <span className="positions-coin-cell">
                        <CoinIcon coin={liq.coin} size={16} />
                        <span className="positions-coin-name">{liq.coin}</span>
                      </span>
                    </td>
                    <td>
                      <Chip size="sm" className={`${isLong ? 'bg-[rgba(181,239,220,0.1)]' : 'bg-[rgba(246,70,93,0.1)]'} text-[10px] font-semibold px-1 ${isLong ? 'text-[var(--profit-green)]' : 'text-[var(--loss-red)]'}`}>
                        {liq.side}
                      </Chip>
                    </td>
                    <td>{formatUsd(posValue)}</td>
                    <td>{formatPrice(liq.entryPrice)}</td>
                    <td style={{ color: 'var(--loss-red)' }}>{formatPrice(liq.liqPrice)}</td>
                    <td style={{ color: 'var(--loss-red)' }}>{formatUsd(-Math.abs(liq.loss))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && step === 'preview' && preview && (
        <div className="p-4">
          <PostAttachment attachment={preview} size="compact" />
          <div className="mt-4">
            <Button className="w-full rounded-lg bg-[var(--primary)] text-[#060a0e] font-bold" onClick={handleAttach}>
              Attach
            </Button>
          </div>
        </div>
      )}
    </>
  )

  if (inline) {
    return (
      <div className="attach-picker-inline">
        <div className="attach-picker-inline-header">
          {step !== 'type' && (
            <button className="attach-picker-inline-back" onClick={() => setStep('type')}>←</button>
          )}
          <span className="attach-picker-inline-title">{titles[step]}</span>
        </div>
        {content}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="md">
        <DialogHeader className="flex items-center gap-2">
          {step !== 'type' && (
            <Button variant="ghost" size="sm" onClick={() => setStep('type')} aria-label="Go back" className="rounded-full text-[var(--text)] min-w-6 w-6 h-6">
              ←
            </Button>
          )}
          <DialogTitle className="text-[15px] font-semibold text-[var(--text)]">{titles[step]}</DialogTitle>
        </DialogHeader>
        <DialogBody className="p-0">
          {content}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
