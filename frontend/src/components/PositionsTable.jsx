import EmptyState from './EmptyState'
import PositionList from './PositionList'

export default function PositionsTable({ positions }) {
  if (!positions || positions.length === 0) {
    return <EmptyState title="No open positions" />
  }

  return <PositionList positions={positions} />
}
