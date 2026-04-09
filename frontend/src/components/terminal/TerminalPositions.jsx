import { useState, Fragment } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from '../ui/dialog'
import { compactUsd } from '../../utils/format'
import { formatUsd } from '../../api/hyperliquid'
import CoinIcon from './CoinIcon'
import { Button } from '../ui/button'
import { SideChip } from '../ui/side-chip'
import { PnlValue } from '../ui/pnl-value'


function AdjustMarginModal({ pos, accountValue, onAdjustMargin, onClose }) {
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('add') // 'add' or 'remove'
  const [busy, setBusy] = useState(false)

  // For adding: free collateral = account value minus total margin in use
  // For removing: excess margin above minimum required (positionValue / maxLeverage)
  const positionValue = Math.abs(pos.size) * pos.markPrice
  const minMargin = pos.maxLeverage ? positionValue / pos.maxLeverage : pos.marginUsed
  const marginAvailable = mode === 'add'
    ? Math.max(0, (accountValue || 0) - pos.marginUsed)
    : Math.max(0, pos.marginUsed - minMargin)

  const handleMax = () => {
    setAmount(marginAvailable.toFixed(2))
  }

  const handleSubmit = async () => {
    const val = parseFloat(amount)
    if (!val || val <= 0) return
    setBusy(true)
    try {
      await onAdjustMargin(pos, mode === 'add' ? val : -val)
      onClose()
    } catch {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-[var(--text)]">Adjust Margin</DialogTitle>
        </DialogHeader>
        <DialogBody className="py-4 px-4">
          <div className="pos-margin-modal-tabs">
            <button
              className={`pos-margin-modal-tab ${mode === 'add' ? 'pos-margin-modal-tab--active' : ''}`}
              onClick={() => { setMode('add'); setAmount('') }}
            >
              Add
            </button>
            <button
              className={`pos-margin-modal-tab ${mode === 'remove' ? 'pos-margin-modal-tab--active' : ''}`}
              onClick={() => { setMode('remove'); setAmount('') }}
            >
              Remove
            </button>
          </div>

          <div className="pos-margin-modal-input-wrap">
            <label className="pos-margin-modal-label">Amount</label>
            <div className="pos-margin-modal-input-row">
              <input
                type="number"
                className="pos-margin-modal-input"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
              <button className="pos-margin-modal-max" onClick={handleMax}>MAX</button>
            </div>
          </div>

          <div className="pos-margin-modal-info">
            <div className="pos-margin-modal-info-row">
              <span>Current margin for {pos.coin}-USDC</span>
              <span>{formatUsd(pos.marginUsed)}</span>
            </div>
            <div className="pos-margin-modal-info-row">
              <span>Margin available to {mode}</span>
              <span>{formatUsd(marginAvailable)}</span>
            </div>
          </div>

          <Button className="w-full rounded-lg bg-[var(--primary)] text-[#060a0e] font-bold mt-2"
            disabled={busy || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > marginAvailable}
            loading={busy}
            onClick={handleSubmit}
          >
            Confirm
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function PositionActions({ pos, onSetTpSl }) {
  const [tpPrice, setTpPrice] = useState('')
  const [slPrice, setSlPrice] = useState('')
  const [busy, setBusy] = useState(false)

  const handleTpSl = async () => {
    if (!tpPrice && !slPrice) return
    setBusy(true)
    try {
      await onSetTpSl(pos, {
        tpPrice: tpPrice || null,
        slPrice: slPrice || null,
      })
      setTpPrice('')
      setSlPrice('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 py-2.5 border-b border-[var(--separator-subtle)] bg-[var(--hover-tint)]">
      <div className="pos-actions">
        <div className="pos-actions-group">
          <span className="pos-actions-label">TP / SL</span>
          <div className="pos-actions-btns">
            <input
              type="number"
              className="pos-actions-input"
              placeholder="Take profit"
              value={tpPrice}
              onChange={e => setTpPrice(e.target.value)}
            />
            <input
              type="number"
              className="pos-actions-input"
              placeholder="Stop loss"
              value={slPrice}
              onChange={e => setSlPrice(e.target.value)}
            />
            <button
              className="pos-actions-btn pos-actions-btn--primary"
              disabled={busy || (!tpPrice && !slPrice)}
              onClick={handleTpSl}
            >
              {busy ? '...' : 'Set'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const gridCols = 'grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_80px] items-center [&>span]:min-w-0 [&>span]:flex [&>span]:items-center [&>span]:justify-center'

export default function TerminalPositions({ positions, onClose, onPartialClose, onSetTpSl, onAdjustMargin, accountValue, closingCoin }) {
  const [expandedCoin, setExpandedCoin] = useState(null)
  const [marginEditPos, setMarginEditPos] = useState(null)

  if (!positions.length) {
    return (
      <div className="terminal-panel-empty">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
        No open positions
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        {/* Header */}
        <div style={{ color: 'white' }} className={`${gridCols} py-2.5 text-xs font-medium text-[var(--text-third)] border-b border-[var(--separator)] min-w-[700px] divide-x divide-[var(--separator)]`}>
          <span className="px-8">Coin</span>
          <span className="px-8">Side</span>
          <span className="px-8">Size</span>
          <span className="px-8">Entry</span>
          <span className="px-8">Mark</span>
          <span className="px-8">PnL</span>
          <span className="px-8">Liq.</span>
          <span className="px-8">Margin</span>
          <span></span>
        </div>

        {/* Rows */}
        <div className="flex flex-col">
          {positions.map(pos => {
            const isLong = pos.side === 'Long'
            const posValue = Math.abs(pos.size) * pos.markPrice
            const isExpanded = expandedCoin === pos.coin

            return (
              <Fragment key={pos.coin}>
                <div className={`${gridCols} py-2.5 border-b border-[var(--separator-subtle)] hover:bg-[var(--hover-tint)] transition-colors min-w-[700px] divide-x divide-[var(--separator-subtle)] ${isExpanded ? 'bg-[var(--hover-tint)]' : ''}`}>
                  <span className="flex items-center justify-center gap-2 min-w-0 px-8">
                    <CoinIcon coin={pos.coin} size={20} />
                    <span className="font-semibold text-sm text-[var(--text)] shrink-0">{pos.coin}</span>
                  </span>
                  <span className="flex justify-center px-8">
                    <SideChip isLong={isLong}>{pos.side} {pos.leverage.toFixed(0)}x</SideChip>
                  </span>
                  <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">
                    {compactUsd(posValue)}
                  </span>
                  <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">
                    {compactUsd(pos.entryPrice)}
                  </span>
                  <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">
                    {compactUsd(pos.markPrice)}
                  </span>
                  <PnlValue value={pos.unrealizedPnl} className="text-[14px] tabular-nums font-medium px-8" />
                  <span className="text-[14px] tabular-nums px-8" style={{ color: pos.liquidationPx ? 'var(--loss-red)' : 'var(--text-third)' }}>
                    {pos.liquidationPx ? compactUsd(pos.liquidationPx) : '—'}
                  </span>
                  <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">
                    <span className="inline-flex items-center justify-center gap-1">
                      {compactUsd(pos.marginUsed)}
                      {onAdjustMargin && (
                        <button
                          className="pos-margin-edit-btn"
                          onClick={() => setMarginEditPos(pos)}
                          aria-label="Adjust margin"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            <path d="m15 5 4 4" />
                          </svg>
                        </button>
                      )}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 justify-center">
                    {onClose && (
                      <Button
                        variant="outline"
                        size="sm" disabled={closingCoin === pos.coin}
                        loading={closingCoin === pos.coin}
                        onClick={() => onClose(pos)}
                        className="rounded-full min-w-0 h-6 text-[10px] font-bold uppercase tracking-wide text-[var(--loss-red)] border-[var(--loss-red)]"
                      >
                        Close
                      </Button>
                    )}
                    {onPartialClose && (
                      <button
                        className="pos-expand-btn"
                        onClick={() => setExpandedCoin(isExpanded ? null : pos.coin)}
                        aria-label="Position options"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {isExpanded
                            ? <path d="m18 15-6-6-6 6" />
                            : <path d="m6 9 6 6 6-6" />
                          }
                        </svg>
                      </button>
                    )}
                  </span>
                </div>
                {isExpanded && (
                  <PositionActions
                    pos={pos}
                    onSetTpSl={onSetTpSl}
                  />
                )}
              </Fragment>
            )
          })}
        </div>
      </div>

      {marginEditPos && onAdjustMargin && (
        <AdjustMarginModal
          pos={marginEditPos}
          accountValue={accountValue}
          onAdjustMargin={onAdjustMargin}
          onClose={() => setMarginEditPos(null)}
        />
      )}
    </>
  )
}
