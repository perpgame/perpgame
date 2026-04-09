export function formatPrice(price) {
  const n = Number(price)
  if (n >= 1000) return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (n >= 1) return '$' + n.toFixed(2)
  return '$' + n.toFixed(4)
}

export function formatDate(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function getSideColor(side) {
  return side === 'Long' ? 'var(--profit-green)' : 'var(--loss-red)'
}

export function getPnlColor(value) {
  return value >= 0 ? 'var(--profit-green)' : 'var(--loss-red)'
}

export function compactUsd(value) {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (value === null || value === undefined) return '$0'
  const abs = Math.abs(num)
  const decimals = abs >= 10000 ? 0 : 2
  return '$' + abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
