import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useVerifiedAuth } from '../hooks/useVerifiedAuth'
import { getUserDisplayName, getUserHandle } from '../utils/user'
import { useClickOutside } from '../hooks/useClickOutside'
import { getUnreadNotificationCount, getUnreadMessageCount } from '../api/backend'
import Avatar from './Avatar'


function SvgIcon({ paths, filled }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

const NAV_ITEMS = [
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
]

const ADMIN_ITEM = {
  path: '/admin',
  label: 'Admin',
  paths: ['M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z'],
}

const PROFILE_PATHS = ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z']

export default function Sidebar({ user, onLogout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isVerified } = useVerifiedAuth(user)
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const menuRef = useRef(null)

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

  // Clear badges when visiting respective pages
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

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useClickOutside(menuRef, closeMenu, menuOpen)

  const navItems = [...NAV_ITEMS, ...(user.isAdmin ? [ADMIN_ITEM] : [])]
  const mobileNavItems = [
    ...NAV_ITEMS,
    { path: '/explore', label: 'Explore', paths: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'] },
    { path: '/agents', label: 'Agent Settings', paths: ['M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2z', 'M4 20c0-4 3.6-7 8-7s8 3 8 7', 'M15.5 8.5l1.5 1.5-1.5 1.5', 'M8.5 8.5L7 10l1.5 1.5'] },
    { path: '/terminal', label: 'Agent Trades', paths: ['M22 12h-4l-3 9L9 3l-3 9H2'] },
  ]

  return (
    <>
      {/* Desktop sidebar (left column) */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Link to="/">
            <img src="/logo.png" alt="PerpGame" className="sidebar-logo-img" />
          </Link>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map(item => {
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path)
            const badgeCounts = { notifications: unreadCount, messages: unreadMsgCount }
            const badge = item.badgeKey ? badgeCounts[item.badgeKey] || 0 : 0
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span className="sidebar-link-icon">
                  <SvgIcon paths={item.paths} filled={isActive} />
                  {badge > 0 && (
                    <span className="sidebar-badge">{badge > 99 ? '99+' : badge}</span>
                  )}
                </span>
                <span className="sidebar-link-text">{item.label}</span>
              </Link>
            )
          })}

          <Link
            to="/explore"
            className={`sidebar-link ${location.pathname === '/explore' ? 'active' : ''}`}
          >
            <span className="sidebar-link-icon">
              <SvgIcon paths={['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35']} filled={location.pathname === '/explore'} />
            </span>
            <span className="sidebar-link-text">Explore</span>
          </Link>

          <Link
            to="/agents"
            className={`sidebar-link ${location.pathname.startsWith('/agents') ? 'active' : ''}`}
          >
            <span className="sidebar-link-icon">
              <SvgIcon paths={['M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2z', 'M4 20c0-4 3.6-7 8-7s8 3 8 7', 'M15.5 8.5l1.5 1.5-1.5 1.5', 'M8.5 8.5L7 10l1.5 1.5']} filled={location.pathname.startsWith('/agents')} />
            </span>
            <span className="sidebar-link-text">Agent Settings</span>
          </Link>

          <Link
            to="/terminal"
            className={`sidebar-link ${location.pathname.startsWith('/terminal') ? 'active' : ''}`}
          >
            <span className="sidebar-link-icon">
              <SvgIcon paths={['M22 12h-4l-3 9L9 3l-3 9H2']} filled={location.pathname.startsWith('/terminal')} />
            </span>
            <span className="sidebar-link-text">Agent Trades</span>
          </Link>

          <Link
            to="/deploy"
            className={`sidebar-link sidebar-link-deploy${location.pathname === '/deploy' ? ' active' : ''}`}
          >
            <span className="sidebar-link-icon">
              <SvgIcon paths={['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5']} filled={location.pathname === '/deploy'} />
            </span>
            <span className="sidebar-link-text">Deploy Agent</span>
          </Link>
        </nav>

        <div className="sidebar-profile" ref={menuRef}>
          <div className="sidebar-profile-avatar" onClick={() => setMenuOpen(!menuOpen)}>
            <Avatar address={user.address} size={40} avatarUrl={user.avatarUrl} />
          </div>
          <div className="sidebar-profile-info">
            <div className="sidebar-profile-name">
              {getUserDisplayName(user)}
              {' '}
            </div>
            <div className="sidebar-profile-handle">{getUserHandle(user)}</div>
          </div>
          <span className="sidebar-profile-dots" onClick={() => setMenuOpen(!menuOpen)}>···</span>
          {menuOpen && (
            <div className="sidebar-profile-menu">
              <button className="sidebar-profile-menu-item logout" onClick={() => { setMenuOpen(false); onLogout() }}>
                Log out {getUserHandle(user)}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="mobile-bottom-bar" aria-label="Mobile navigation">
        {mobileNavItems.map(item => {
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path)
          const badgeCounts = { notifications: unreadCount, messages: unreadMsgCount }
          const badge = item.badgeKey ? badgeCounts[item.badgeKey] || 0 : 0
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`mobile-bottom-link ${isActive ? 'active' : ''}`}
            >
              <span className="mobile-bottom-icon">
                <SvgIcon paths={item.paths} filled={isActive} />
                {badge > 0 && (
                  <span className="sidebar-badge">{badge > 99 ? '99+' : badge}</span>
                )}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
