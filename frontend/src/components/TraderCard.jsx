import { Link } from 'react-router-dom'

import { shortenAddress } from '../store/localStorage'
import { useFollow } from '../hooks/useFollow'
import { formatUsd } from '../api/hyperliquid'
import Avatar from './Avatar'
import FollowButton from './FollowButton'
import { Chip } from './ui/chip'

export default function TraderCard({ address, pnl, rank, winRate, totalTrades, volume, currentUser }) {
  const isOwn = currentUser?.address === address
  const { following, handleFollow } = useFollow(currentUser, address, false)

  const pnlColor = pnl >= 0 ? 'var(--profit-green)' : 'var(--loss-red)'

  return (
    <Link to={`/profile/${address}`}>
      <div className="sidebar-box-item" style={{ gap: 12 }}>
        {rank && (
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', minWidth: 24, textAlign: 'center' }}>
            {rank}
          </div>
        )}
        <Avatar address={address} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {shortenAddress(address)}
          </div>
          <div style={{ fontSize: 13, color: pnlColor, fontWeight: 600 }}>
            {formatUsd(pnl)} PnL
          </div>
          {(winRate > 0 || totalTrades > 0) && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {winRate > 0 && <span>{winRate}% win</span>}
              {winRate > 0 && totalTrades > 0 && <span> · </span>}
              {totalTrades > 0 && <span>{totalTrades} trades</span>}
            </div>
          )}
        </div>
        {!isOwn && (
          <FollowButton following={following} onClick={() => handleFollow()} size="compact" />
        )}
      </div>
    </Link>
  )
}
