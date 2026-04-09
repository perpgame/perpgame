import Avatar from './Avatar'
import Aurora from './Aurora'
import { formatUsd } from '../api/hyperliquid'
import { getPnlColor } from '../utils/format'
import { shortenAddress } from '../store/localStorage'
import { getUserDisplayName } from '../utils/user'

export default function ProfileHeader({
  address,
  displayName,
  username,
  bio,
  avatarUrl,
  registered = true,
  pnl = 0,
  predictionStats = null,
  followingCount = 0,
  followerCount = 0,
  onAddressCopy,
  socialLinks,
  actions,
}) {
  const profileUser = { displayName, username, address }
  const pnlColor = getPnlColor(pnl)
  const accuracy = predictionStats?.accuracy != null ? Number(predictionStats.accuracy) : null
  const accuracyColor = accuracy === null
    ? 'var(--text)'
    : accuracy >= 60 ? 'var(--profit-green)'
    : accuracy >= 45 ? 'var(--text)'
    : 'var(--loss-red)'

  return (
    <div className="profile-upper profile-upper--aurora">
      <Aurora colorStops={['#0B6E4F', '#b5efdc', '#073B3A']} amplitude={1.2} blend={0.5} speed={0.5} />
      <div className="profile-upper-top">
        <div className="profile-identity-left">
          <Avatar address={address} size={56} avatarUrl={avatarUrl} />
          <div className="profile-identity-info">
            <div className="profile-name">
              {getUserDisplayName(profileUser)}
            </div>
            <div className="profile-handle">
              {!registered ? (
                <span className="badge-unregistered">Not on PerpGame</span>
              ) : (
                `@${username || address.slice(2, 8)}`
              )}
              <span
                className="profile-handle-address"
                onClick={onAddressCopy}
                title="Copy address"
              >
                · {shortenAddress(address)}
              </span>
            </div>
          </div>
        </div>
        {actions && (
          <div className="profile-upper-actions">
            {actions}
          </div>
        )}
      </div>

      {bio && <div className="profile-upper-bio">{bio}</div>}

      <div className="profile-upper-stats">
        <div className="profile-stat-pill">
          <span className="profile-stat-pill__value" style={{ color: pnlColor }}>{formatUsd(pnl)}</span>
          <span className="profile-stat-pill__label">PnL</span>
        </div>
        <div className="profile-stat-pill" style={{ opacity: accuracy !== null ? 1 : 0.5 }}>
          <span className="profile-stat-pill__value" style={{ color: accuracyColor }}>
            {accuracy !== null ? `${accuracy.toFixed(0)}%` : '—'}
          </span>
          <span className="profile-stat-pill__label">Accuracy</span>
        </div>
      </div>

      <div className="profile-social-row">
        {socialLinks || (
          <>
            <span className="profile-social-link">
              <span className="profile-social-count">{followingCount}</span> Following
            </span>
            <span className="profile-social-link">
              <span className="profile-social-count">{followerCount}</span> Followers
            </span>
          </>
        )}
      </div>
    </div>
  )
}
