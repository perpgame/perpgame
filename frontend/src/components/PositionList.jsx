import { compactUsd } from '../utils/format'
import CoinIcon from './terminal/CoinIcon'
import { DataGrid, DataGridRow } from './ui/data-grid'
import { SideChip } from './ui/side-chip'
import { PnlValue } from './ui/pnl-value'

const COLUMNS = ['Coin', 'Side', 'Size', 'Entry', 'Mark', 'PnL', 'Liq.', 'Margin']

export default function PositionList({ positions }) {
  return (
    <DataGrid
      columns={COLUMNS}
      minWidth="640px"
      className="mx-3 my-3 overflow-x-auto"
      data={positions}
      renderRow={(pos, _i, grid) => {
        const isLong = pos.side === 'Long'
        const posValue = Math.abs(pos.size) * pos.markPrice

        return (
          <DataGridRow key={pos.coin} {...grid}>
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
              {compactUsd(pos.marginUsed)}
            </span>
          </DataGridRow>
        )
      }}
    />
  )
}
