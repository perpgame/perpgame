import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getUnreadNotificationCount, getUnreadMessageCount } from '../api/backend'
import { getUserDisplayName, getUserHandle } from '../utils/user'
import Avatar from './Avatar'
import { useHeaderContext } from '../contexts/HeaderContext'

const DRAWER_ITEMS = [
  {
    path: '/arena',
    label: 'Arena',
    paths: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
  },
  {
    path: '/insights',
    label: 'Insights',
    paths: ['M21 21H4.6c-.56 0-.84 0-1.05-.11a1 1 0 0 1-.44-.44C3 20.24 3 19.96 3 19.4V3', 'M7 14l4-6 4 4 5-6'],
  },
  {
    path: '/explore',
    label: 'Explore',
    paths: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
  },
  {
    path: '/agents',
    label: 'Agent Settings',
    paths: ['M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2z', 'M4 20c0-4 3.6-7 8-7s8 3 8 7', 'M15.5 8.5l1.5 1.5-1.5 1.5', 'M8.5 8.5L7 10l1.5 1.5'],
  },
  {
    path: '/terminal',
    label: 'Agent Trades',
    paths: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  },
]

const ADMIN_ITEM = {
  path: '/admin',
  label: 'Admin',
  paths: ['M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z'],
}

export default function MobileHeader({ user, onLogout }) {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const ctx = useHeaderContext()

  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)

  useEffect(() => {
    if (!user?.verified) return
    let cancelled = false
    async function load() {
      try {
        const [notif, msg] = await Promise.all([
          getUnreadNotificationCount(),
          getUnreadMessageCount(),
        ])
        if (!cancelled) {
          setUnreadCount(notif.count || 0)
          setUnreadMsgCount(msg.count || 0)
        }
      } catch { /* ignore */ }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [user?.verified])

  useEffect(() => {
    if (location.pathname === '/notifications') {
      const id = setTimeout(() => setUnreadCount(0), 0)
      return () => clearTimeout(id)
    }
    if (location.pathname.startsWith('/messages')) {
      const id = setTimeout(() => setUnreadMsgCount(0), 0)
      return () => clearTimeout(id)
    }
  }, [location.pathname])

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [drawerOpen])

  const totalBadge = unreadCount + unreadMsgCount

  const items = [
    ...DRAWER_ITEMS,
    ...(user.isAdmin ? [ADMIN_ITEM] : []),
  ]

  const badgeCounts = { notifications: unreadCount, messages: unreadMsgCount }

  return (
    <>
      <header className="mobile-header">
        <button
          className="mobile-more-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
          {totalBadge > 0 && (
            <span className="mobile-more-badge">{totalBadge > 99 ? '99+' : totalBadge}</span>
          )}
        </button>
        {!ctx?.rightContent && (
          <Link to="/" className="mobile-header-logo">
            <img src="/logo.png" alt="PerpGame" className="mobile-header-logo-img" />
          </Link>
        )}
        <div className="mobile-header-spacer">{ctx?.rightContent || null}</div>
      </header>

      {/* Right drawer */}
      {drawerOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            {/* Profile header */}
            <div className="mobile-drawer-profile">
              <Link
                to={`/profile/${user.address}`}
                className="mobile-drawer-profile-link"
                onClick={() => setDrawerOpen(false)}
              >
                <Avatar address={user.address} size={48} avatarUrl={user.avatarUrl} />
                <div className="mobile-drawer-profile-info">
                  <span className="mobile-drawer-profile-name">{getUserDisplayName(user)}</span>
                  <span className="mobile-drawer-profile-handle">{getUserHandle(user)}</span>
                </div>
              </Link>
              <button className="mobile-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Nav items */}
            <nav className="mobile-drawer-nav">
              {items.map(item => {
                const isActive = item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path)
                const badge = item.badgeKey ? badgeCounts[item.badgeKey] || 0 : 0
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`mobile-drawer-item${isActive ? ' mobile-drawer-item--active' : ''}`}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <span className="mobile-drawer-item-icon">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill={isActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isActive ? 0 : 1.75} strokeLinecap="round" strokeLinejoin="round">
                        {item.paths.map((d, i) => <path key={i} d={d} />)}
                      </svg>
                    </span>
                    <span className="mobile-drawer-item-label">{item.label}</span>
                    {badge > 0 && (
                      <span className="mobile-drawer-item-badge">{badge > 99 ? '99+' : badge}</span>
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* Logout pinned at bottom */}
            <button
              className="mobile-drawer-logout"
              onClick={() => { setDrawerOpen(false); onLogout() }}
            >
              <span className="mobile-drawer-item-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </span>
              Log out
            </button>
          </div>
        </div>
      )}
    </>
  )
}
