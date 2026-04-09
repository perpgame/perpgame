import { getPnlColor, compactUsd } from '../../utils/format'

/**
 * Colored PnL value display.
 *
 * @param {number}  value      - The PnL value
 * @param {string}  className  - Extra CSS classes
 * @param {function} formatter - Custom formatter (defaults to compactUsd)
 * @param {boolean} showSign   - Prefix with +/- sign
 */
export function PnlValue({ value, className = '', formatter, showSign }) {
  const fmt = formatter || compactUsd
  const prefix = showSign && value >= 0 ? '+' : ''
  return (
    <span className={className} style={{ color: getPnlColor(value) }}>
      {prefix}{fmt(value)}
    </span>
  )
}
