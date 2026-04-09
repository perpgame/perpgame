import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'

import { getNotifications, markNotificationsRead } from '../api/backend'
import { formatTime } from '../store/localStorage'
import { getUserDisplayName } from '../utils/user'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { NotificationListSkeleton } from '../components/Skeleton'
import { AuthGate } from '../components/ui/auth-gate'
import { Button } from '../components/ui/button'

const ACTION_TEXT = {
  like: 'liked your post',
  comment: 'commented on your post',
  reply: 'replied to your comment',
  follow: 'followed you',
  repost: 'reposted your post',
  mention: 'mentioned you',
  trade_open: 'opened a new position',
  trade_close: 'closed a position',
  trade_liquidation: 'was liquidated',
}

function getNotificationLink(n) {
  if (n.notificationType === 'follow') {
    return `/profile/${n.actorAddress}`
  }
  if (n.postId) {
    return `/post/${n.postId}`
  }
  return null
}

const PAGE_SIZE = 50

export default function Notifications({ user, onLogout }) {
  if (!user?.verified) {
    return (
      <div>
        <PageHeader title="Notifications" />
        <AuthGate
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>}
          title="Sign in to see notifications"
          subtitle="Connect and verify your wallet to receive notifications when someone likes, comments, or follows you."
          onAction={onLogout}
        />
      </div>
    )
  }

  return <NotificationsContent user={user} />
}

function NotificationsContent({ user }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await getNotifications({ limit: PAGE_SIZE })
        setNotifications(data)
        setHasMore(data.length >= PAGE_SIZE)
      } catch {
        // ignore
      }
      setLoading(false)
    }
    load()
    markNotificationsRead().catch(() => {})
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || notifications.length === 0) return
    setLoadingMore(true)
    try {
      const lastId = notifications[notifications.length - 1].id
      const data = await getNotifications({ cursor: lastId, limit: PAGE_SIZE })
      setNotifications(prev => [...prev, ...data])
      setHasMore(data.length >= PAGE_SIZE)
    } catch {
      // ignore
    }
    setLoadingMore(false)
  }, [loadingMore, hasMore, notifications])

  return (
    <div>
      {loading && <NotificationListSkeleton />}

      {!loading && notifications.length === 0 && (
        <EmptyState
          title="No notifications yet"
          subtitle="When someone likes, comments, reposts, or follows you, it will show up here."
        />
      )}

      {!loading && notifications.map(n => {
        const link = getNotificationLink(n)
        const actorName = getUserDisplayName({ displayName: n.actorDisplayName, username: n.actorUsername, address: n.actorAddress })
        const actorHandle = n.actorUsername ? `@${n.actorUsername}` : null
        const content = (
          <div className={`notification-item${n.isRead ? '' : ' notification-item--unread'}`}>
            <Link to={`/profile/${n.actorAddress}`} className="notification-avatar-link" onClick={e => e.stopPropagation()}>
              <Avatar address={n.actorAddress} size={40} avatarUrl={n.actorAvatarUrl} />
            </Link>
            <div className="notification-item-body">
              <div className="notification-item-text">
                <span className="notification-item-actor">{actorName}</span>
                {actorHandle && <span className="notification-item-handle"> {actorHandle}</span>}
                {' '}
                {ACTION_TEXT[n.notificationType] || n.notificationType}
              </div>
              {n.postContentPreview && (
                <div className="notification-preview">{n.postContentPreview}</div>
              )}
              <div className="notification-item-time">{formatTime(n.createdAt)}</div>
            </div>
          </div>
        )

        return link ? (
          <Link key={n.id} to={link} className="notification-link">
            {content}
          </Link>
        ) : (
          <div key={n.id}>{content}</div>
        )
      })}

      {!loading && hasMore && notifications.length > 0 && (
        <Button
          variant="ghost" onClick={loadMore}
          disabled={loadingMore}
          className="w-full rounded-none text-[var(--primary)] font-semibold text-sm border-t border-[var(--border)]"
        >
          {loadingMore ? 'Loading...' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
