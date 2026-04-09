import { formatDate, compactUsd } from '../utils/format'
import CoinIcon from './terminal/CoinIcon'
import { DataGrid, DataGridRow } from './ui/data-grid'
import { SideChip } from './ui/side-chip'
import { PnlValue } from './ui/pnl-value'

const COLUMNS = ['Coin', 'Type', 'Size', 'Entry', 'Exit', 'PnL', 'Time']

export default function TradeList({ trades }) {
  return (
    <DataGrid
      columns={COLUMNS}
      minWidth="580px"
      className="mx-3 my-3 overflow-x-auto"
      data={trades}
      renderRow={(trade, i, grid) => {
        const isLong = trade.side === 'Long'
        const posValue = trade.size * trade.exitPrice

        return (
          <DataGridRow key={i} {...grid}>
            <span className="flex items-center justify-center gap-2 min-w-0 px-8">
              <CoinIcon coin={trade.coin} size={18} />
              <span className="font-semibold text-sm text-[var(--text)] shrink-0">{trade.coin}</span>
            </span>
            <span className="flex justify-center px-8">
              <SideChip isLong={isLong}>{trade.side}</SideChip>
            </span>
            <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">
              {compactUsd(posValue)}
            </span>
            <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">
              {compactUsd(trade.entryPrice)}
            </span>
            <span className="text-[14px] tabular-nums text-[var(--text-secondary)] px-8">
              {compactUsd(trade.exitPrice)}
            </span>
            <PnlValue value={trade.pnl} className="text-[14px] tabular-nums font-medium px-8" />
            <span className="text-xs tabular-nums text-[var(--text-third)] px-8 whitespace-nowrap">
              {formatDate(trade.exitTime)}
            </span>
          </DataGridRow>
        )
      }}
    />
  )
}
