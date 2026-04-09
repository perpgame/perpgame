import EmptyState from './EmptyState'
import TradeList from './TradeList'

export default function TradeHistory({ trades }) {
  if (!trades || trades.length === 0) {
    return <EmptyState title="No trading history" />
  }

  return <TradeList trades={trades} />
}
