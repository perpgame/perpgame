import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { useToast } from './components/Toast'
import { useAccount, useDisconnect } from 'wagmi'
import Sidebar from './components/Sidebar'
import RightSidebar from './components/RightSidebar'

import Login from './pages/Login'
import Profile from './pages/Profile'
import PostDetail from './pages/PostDetail'
import PostLikes from './pages/PostLikes'
import FollowList from './pages/FollowList'
import CoinThread from './pages/CoinThread'
import Portfolio from './pages/Portfolio'
import Arena from './pages/Arena'
import AgentLeaderboard from './pages/AgentLeaderboard'
import AgentState from './pages/AgentState'
import MyAgents from './pages/MyAgents'
import DeployAgent from './pages/DeployAgent'
import Insights from './pages/Insights'
import Animation from './pages/Animation'
import Admin from './pages/Admin'
import ErrorLogs from './pages/ErrorLogs'
import Terminal from './pages/Terminal'
import AgentTradesPicker from './pages/AgentTradesPicker'
import MobileSearch from './components/MobileSearch'
import MobileHeader from './components/MobileHeader'
import { getMe, logout as apiLogout, onSessionExpired, onServerError, startIdleTimer, clearSessionToken, getSessionToken } from './api/backend'
import { HeaderProvider } from './contexts/HeaderContext'
import './App.css'

function App() {
  const toast = useToast()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const { address: walletAddress, isConnected, status } = useAccount()
  const { disconnect } = useDisconnect()

  // Load user from stored token on mount
  useEffect(() => {
    async function loadUser() {
      const token = getSessionToken()
      if (!token) { setLoading(false); return }
      try {
        const me = await getMe()
        setUser(me)
      } catch {
        clearSessionToken()
      }
      setLoading(false)
    }
    loadUser()
  }, [])

  const handleLogout = useCallback(async () => {
    if (user?.verified) {
      try { await apiLogout() } catch { /* ignore */ }
    }
    clearSessionToken()
    disconnect()
    setUser(null)
  }, [disconnect, user])

  // If wallet disconnects and user was verified, auto-logout after grace period
  // (wallet extensions briefly disconnect on page focus/resume — 5s grace avoids false logouts)
  useEffect(() => {
    if (!user || !user.verified) return
    if (status === 'reconnecting' || status === 'connecting') return
    if (!isConnected) {
      const id = setTimeout(() => handleLogout(), 5000)
      return () => clearTimeout(id)
    }
  }, [isConnected, status, user, handleLogout])

  // If reconnected address differs from stored user, logout
  useEffect(() => {
    if (!user || !user.verified || !walletAddress) return
    if (walletAddress.toLowerCase() !== user.address) {
      const id = setTimeout(() => handleLogout(), 0)
      return () => clearTimeout(id)
    }
  }, [walletAddress, user, handleLogout])

  // Server error listener (global 500 toast)
  useEffect(() => {
    const unsub = onServerError((e) => {
      toast.error(e.detail?.message || 'Something went wrong. Please try again.')
    })
    return unsub
  }, [toast])

  // Session expiration listener + idle timer (skip for guests)
  useEffect(() => {
    if (!user || !user.verified) return
    const unsubExpired = onSessionExpired(() => {
      clearSessionToken()
      disconnect()
      setUser(null)
    })
    const stopIdle = startIdleTimer()
    return () => { unsubExpired(); stopIdle() }
  }, [user, disconnect])

  const location = useLocation()

  const handleLogin = (userData) => {
    setUser(userData)
  }

  if (loading) {
    return (
      <div className="app-loading">
        <img src="/logo.png" alt="PerpGame" className="app-loading-logo" />
      </div>
    )
  }

  const guest = { address: 'guest', username: 'guest', displayName: 'Guest', verified: false }
  const activeUser = user || guest
  const isGuest = !user

  return (
    <HeaderProvider>
    <Routes>
      <Route path="/" element={user?.verified ? <Navigate to="/arena" replace /> : <Login onLogin={handleLogin} />} />
      <Route path="/animation" element={<Animation />} />
      <Route path="/terminal/:coin" element={<><MobileHeader user={activeUser} onLogout={handleLogout} /><Terminal user={activeUser} onLogout={handleLogout} /></>} />
      <Route path="/terminal/:coin/:agent" element={<><MobileHeader user={activeUser} onLogout={handleLogout} /><Terminal user={activeUser} onLogout={handleLogout} /></>} />
      <Route path="*" element={
        <div className="layout">
          <Sidebar user={activeUser} onLogout={isGuest ? null : handleLogout} />
          <main className="main-content">
            <MobileHeader user={activeUser} onLogout={isGuest ? null : handleLogout} />
            <MobileSearch />
              <div key={location.pathname.split('/').slice(0, 2).join('/')} className="page-transition">
              <Routes>
                <Route path="/terminal" element={<AgentTradesPicker user={activeUser} />} />
                <Route path="/agents" element={<MyAgents user={activeUser} />} />
                <Route path="/deploy" element={<DeployAgent />} />
                <Route path="/agent/:address/state" element={<AgentState user={activeUser} />} />
                <Route path="/profile/:address" element={<Profile currentUser={activeUser} onLogout={handleLogout} />} />
                <Route path="/profile/:address/:type" element={<FollowList />} />
                <Route path="/explore" element={<AgentLeaderboard />} />
                <Route path="/post/:postId" element={<PostDetail user={activeUser} />} />
                <Route path="/post/:postId/likes" element={<PostLikes />} />
                <Route path="/coin/:ticker" element={<CoinThread user={activeUser} />} />
                <Route path="/portfolio" element={<Portfolio user={activeUser} />} />
                <Route path="/arena" element={<Arena user={activeUser} />} />
                <Route path="/arena/leaderboard" element={<Navigate to="/explore" replace />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/admin" element={<Admin user={activeUser} />} />
                <Route path="/admin/error-logs" element={<ErrorLogs />} />
                <Route path="*" element={<Navigate to="/arena" replace />} />
              </Routes>
              </div>
          </main>
          <RightSidebar user={activeUser} />
        </div>
      } />
    </Routes>
    </HeaderProvider>
  )
}

export default App
