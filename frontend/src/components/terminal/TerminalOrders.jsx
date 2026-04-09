
import { formatDate, compactUsd } from '../../utils/format'
import CoinIcon from './CoinIcon'
import { Button } from '../ui/button'
import { SideChip } from '../ui/side-chip'
import { DataGrid, DataGridRow } from '../ui/data-grid'


function getTriggerLabel(order) {
  if (order.triggerCondition) return order.triggerCondition
  const type = order.orderType
  if (!type || type === 'Limit') return null
  const triggerPx = order.triggerPx ? compactUsd(order.triggerPx) : null
  if (!triggerPx) return type
  return `Trigger @ ${triggerPx}`
}

const COLUMNS = ['Coin', 'Side', 'Type', 'Size', 'Price', 'Trigger', 'Time']

export default function TerminalOrders({ orders, onCancel, cancellingOid }) {
  if (!orders.length) {
    return (
      <div className="terminal-panel-empty">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
        No open orders
      </div>
    )
  }

  return (
    <DataGrid
      columns={COLUMNS}
      gridTemplate="1fr 1fr 1fr 1fr 1fr 1fr 1fr auto"
      minWidth="600px"
      noCard
      className="overflow-x-auto"
      data={orders}
      extraCol
      renderRow={(order, _i, grid) => {
        const isBuy = order.side === 'B'
        const sz = parseFloat(order.sz)
        const px = parseFloat(order.limitPx)
        const value = sz * px
        return (
          <DataGridRow key={order.oid} {...grid}>
            <span className="flex items-center justify-center gap-2 min-w-0 px-8">
              <CoinIcon coin={order.coin} size={20} />
              <span className="font-semibold text-sm text-[var(--text)] shrink-0">{order.coin}</span>
            </span>
            <span className="flex justify-center px-8">
              <SideChip isLong={isBuy}>{isBuy ? 'Buy' : 'Sell'}</SideChip>
            </span>
            <span className="text-[14px] text-[var(--text-secondary)] px-8">{order.orderType || 'Limit'}</span>
            <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{compactUsd(value)}</span>
            <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">
              {order.orderType === 'Stop Market' || order.orderType === 'Take Profit Market' ? 'Market' : compactUsd(order.limitPx)}
            </span>
            <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">{getTriggerLabel(order) || '—'}</span>
            <span className="text-xs tabular-nums text-[var(--text-third)] px-8">{order.timestamp ? formatDate(order.timestamp) : '-'}</span>
            <span className="flex justify-center">
              {onCancel && (
                <Button
                  variant="outline"
                  size="sm" disabled={cancellingOid === order.oid}
                  loading={cancellingOid === order.oid}
                  onClick={() => onCancel(order)}
                  className="rounded-full min-w-0 h-6 text-[10px] font-bold uppercase tracking-wide text-[var(--loss-red)] border-[var(--loss-red)]"
                >
                  Cancel
                </Button>
              )}
            </span>
          </DataGridRow>
        )
      }}
    />
  )
}
