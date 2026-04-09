import { Chip } from './chip'

/**
 * Reusable Long/Short or Buy/Sell chip with consistent color coding.
 *
 * @param {boolean} isLong  - true for long/buy (green), false for short/sell (red)
 * @param {string}  children - Label text (e.g. 'Long 10x', 'Buy', 'Sell')
 */
export function SideChip({ isLong, children }) {
  return (
    <Chip
      size="sm"
      className={`text-xs font-semibold px-1.5 whitespace-nowrap ${
        isLong
          ? 'bg-[rgba(181,239,220,0.1)] text-[var(--profit-green)]'
          : 'bg-[rgba(246,70,93,0.1)] text-[var(--loss-red)]'
      }`}
    >
      {children}
    </Chip>
  )
}
