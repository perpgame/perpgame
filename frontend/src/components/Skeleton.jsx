function Skeleton({ width, height, circle, style }) {
  return (
    <div
      className={`skeleton${circle ? ' skeleton-circle' : ''}`}
      style={{ width, height, ...style }}
    />
  )
}

export function PostSkeleton() {
  return (
    <div className="skeleton-post">
      <Skeleton width={40} height={40} circle />
      <div className="skeleton-post-body">
        <div className="skeleton-post-header">
          <Skeleton width={100} height={14} />
          <Skeleton width={60} height={12} />
          <Skeleton width={40} height={12} />
        </div>
        <div className="skeleton-post-lines">
          <Skeleton width="100%" height={14} />
          <Skeleton width="75%" height={14} />
        </div>
        <div className="skeleton-post-actions">
          <Skeleton width={32} height={14} />
          <Skeleton width={32} height={14} />
          <Skeleton width={32} height={14} />
        </div>
      </div>
    </div>
  )
}

export function FeedSkeleton({ count = 5 }) {
  return Array.from({ length: count }, (_, i) => <PostSkeleton key={i} />)
}

export function TraderRowSkeleton() {
  return (
    <div className="skeleton-trader-row">
      <Skeleton width={20} height={16} />
      <Skeleton width={44} height={44} circle />
      <div className="skeleton-trader-info">
        <Skeleton width={120} height={14} />
        <Skeleton width={80} height={12} />
      </div>
      <Skeleton width={60} height={14} style={{ marginLeft: 'auto' }} />
    </div>
  )
}

function AgentCardSkeleton() {
  return (
    <div className="trader-card" style={{ gap: 8 }}>
      {/* Header: rank + avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Skeleton width={20} height={11} />
        <Skeleton width={18} height={18} circle />
        <Skeleton width={90} height={11} />
      </div>
      {/* Main value */}
      <Skeleton width={80} height={20} style={{ marginTop: 2 }} />
      {/* Sub rows */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton width={36} height={10} />
        <Skeleton width={48} height={10} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton width={52} height={10} />
        <Skeleton width={64} height={10} />
      </div>
      {/* Bar */}
      <Skeleton width="100%" height={4} style={{ borderRadius: 2, marginTop: 2 }} />
    </div>
  )
}

export function ExploreListSkeleton({ count = 6 }) {
  return (
    <div className="explore-grid">
      {Array.from({ length: count }, (_, i) => <AgentCardSkeleton key={i} />)}
    </div>
  )
}

export function NotificationSkeleton() {
  return (
    <div className="skeleton-notification">
      <Skeleton width={40} height={40} circle />
      <div className="skeleton-notification-body">
        <Skeleton width="70%" height={14} />
        <Skeleton width="40%" height={12} />
      </div>
    </div>
  )
}

export function NotificationListSkeleton({ count = 6 }) {
  return Array.from({ length: count }, (_, i) => <NotificationSkeleton key={i} />)
}

export function ProfileSkeleton() {
  return (
    <>
      <div className="skeleton-profile-hero">
        <Skeleton width={80} height={12} />
        <Skeleton width={120} height={28} />
        <Skeleton width={100} height={12} />
      </div>
      <div className="skeleton-profile-identity">
        <Skeleton width={64} height={64} circle />
        <div className="skeleton-profile-identity-info">
          <Skeleton width={140} height={16} />
          <Skeleton width={90} height={13} />
        </div>
      </div>
      <div className="skeleton-profile-stats">
        <Skeleton width={60} height={13} />
        <Skeleton width={60} height={13} />
        <Skeleton width={60} height={13} />
      </div>
    </>
  )
}

export function ConversationSkeleton() {
  return (
    <div className="conversation-skeleton">
      <Skeleton width={48} height={48} circle />
      <div className="conversation-skeleton-body">
        <div className="conversation-skeleton-row">
          <Skeleton width={120} height={14} />
          <Skeleton width={32} height={12} />
        </div>
        <Skeleton width="70%" height={13} />
      </div>
    </div>
  )
}

export function ConversationListSkeleton({ count = 6 }) {
  return Array.from({ length: count }, (_, i) => <ConversationSkeleton key={i} />)
}

export default Skeleton
