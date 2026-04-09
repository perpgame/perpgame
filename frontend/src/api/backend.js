const API_URL = import.meta.env.VITE_API_URL || '/api'

// Session token is now stored in httpOnly cookie set by the server.
// These functions are kept for backward compatibility but localStorage
// is only used as a fallback — the cookie is the primary auth mechanism.
const TOKEN_KEY = 'perpgame_token'

export function setSessionToken(token) {
  // Store minimally — cookie is the real auth, this is only for WebSocket handshake
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearSessionToken() { localStorage.removeItem(TOKEN_KEY) }
export function getSessionToken() { return localStorage.getItem(TOKEN_KEY) }

// --- Session expiration ---

export function onSessionExpired(callback) {
  window.addEventListener('perpgame:session-expired', callback)
  return () => window.removeEventListener('perpgame:session-expired', callback)
}

// --- Server error ---

export function onServerError(callback) {
  window.addEventListener('perpgame:server-error', callback)
  return () => window.removeEventListener('perpgame:server-error', callback)
}

// --- Idle timeout (disabled — JWT expiry handles session lifetime) ---

export function startIdleTimer() {
  return () => {}
}

// --- Client-side throttle ---

const throttleTimestamps = {}

function throttled(key, minIntervalMs, fn) {
  return (...args) => {
    const now = Date.now()
    const last = throttleTimestamps[key] || 0
    if (now - last < minIntervalMs) {
      return Promise.reject(new Error('Too many requests, please slow down'))
    }
    throttleTimestamps[key] = now
    return fn(...args)
  }
}

// --- Core fetch wrapper ---

export async function fetchApi(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }

  const token = getSessionToken()
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // Only treat as session expired if the server explicitly says the token is invalid/expired,
    // not for any random 401 (e.g. permission checks on public routes)
    if (res.status === 401 && path !== '/auth/me') {
      const msg = (body.error || '').toLowerCase()
      if (msg.includes('expired') || msg.includes('invalid token') || msg.includes('no token')) {
        window.dispatchEvent(new CustomEvent('perpgame:session-expired'))
      }
    }
    if (res.status >= 500) {
      window.dispatchEvent(new CustomEvent('perpgame:server-error', { detail: { message: body.error || 'Server error' } }))
    }
    const err = new Error(body.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  if (res.status === 204) return null
  return res.json()
}

// --- Auth ---

export async function getNonce() {
  return fetchApi('/auth/nonce')
}

export async function login(message, signature) {
  return fetchApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ message, signature }),
  })
}

export async function logout() {
  return fetchApi('/auth/logout', { method: 'POST' })
}

export async function getMe() {
  return fetchApi('/auth/me')
}

export async function setUsername(username) {
  return fetchApi('/auth/username', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}

export async function checkUsername(username) {
  return fetchApi(`/auth/check-username/${encodeURIComponent(username)}`)
}

export async function setBio(bio) {
  return fetchApi('/auth/bio', {
    method: 'POST',
    body: JSON.stringify({ bio }),
  })
}

export async function setDisplayName(name) {
  return fetchApi('/auth/name', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}


export async function uploadAvatar(file) {
  const formData = new FormData()
  formData.append('avatar', file)
  const headers = {}
  const token = getSessionToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_URL}/auth/avatar`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// --- Posts ---

export async function getPosts({ cursor, offset, limit = 20, feed } = {}) {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  if (offset != null) params.set('offset', String(offset))
  params.set('limit', String(limit))
  if (feed) params.set('feed', feed)
  return fetchApi(`/posts?${params}`)
}

export async function getPost(id) {
  return fetchApi(`/posts/${id}`)
}

export const createPost = throttled('createPost', 3000, ({ content, tags, attachment, quotedPostId }) => {
  return fetchApi('/posts', {
    method: 'POST',
    body: JSON.stringify({ content, tags, attachment, quotedPostId }),
  })
})

export async function deletePost(id) {
  return fetchApi(`/posts/${id}`, { method: 'DELETE' })
}

export async function getPopularCoins() {
  return fetchApi('/posts/popular-coins')
}

export async function getCoinPosts(coin, { cursor, limit = 20 } = {}) {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  params.set('limit', String(limit))
  return fetchApi(`/posts/coin/${encodeURIComponent(coin)}?${params}`)
}

export async function getUserPosts(address, { cursor, limit = 20 } = {}) {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  params.set('limit', String(limit))
  return fetchApi(`/users/${address}/posts?${params}`)
}

// --- Likes ---

export const toggleLike = throttled('toggleLike', 1000, (postId) => {
  return fetchApi(`/posts/${postId}/like`, { method: 'POST' })
})

export async function getPostLikes(postId) {
  return fetchApi(`/posts/${postId}/likes`)
}

// --- Comments ---

export async function getComments(postId, { cursor, limit = 50 } = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)
  return fetchApi(`/posts/${postId}/comments?${params}`)
}

export const addComment = throttled('addComment', 2000, (postId, content, parentCommentId = null) => {
  const body = { content }
  if (parentCommentId) body.parentCommentId = parentCommentId
  return fetchApi(`/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
})

export async function deleteComment(postId, commentId) {
  return fetchApi(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' })
}

export const toggleCommentLike = throttled('toggleCommentLike', 1000, (postId, commentId) => {
  return fetchApi(`/posts/${postId}/comments/${commentId}/like`, { method: 'POST' })
})

export async function getCommentReplies(postId, commentId) {
  return fetchApi(`/posts/${postId}/comments/${commentId}/replies`)
}

// --- Follows ---

export const toggleFollow = throttled('toggleFollow', 1000, (address) => {
  return fetchApi(`/users/${address}/follow`, { method: 'POST' })
})

export async function getFollowers(address) {
  return fetchApi(`/users/${address}/followers`)
}

export async function getFollowing(address) {
  return fetchApi(`/users/${address}/following`)
}

// --- Users ---

export async function getUser(address) {
  return fetchApi(`/users/${address}`)
}

export async function getUserStats(address) {
  return fetchApi(`/users/${address}/stats`)
}

export async function getUserPredictionStats(address, period = 'all') {
  return fetchApi(`/users/${address}/prediction-stats?period=${period}`)
}

export async function getUserCount() {
  return fetchApi('/users/count')
}

export async function getTopTraders(limit = 10) {
  return fetchApi(`/users/top-traders?limit=${limit}`)
}

export async function getLeaderboard(limit = 20) {
  return fetchApi(`/users/leaderboard?limit=${limit}`)
}

export async function searchUsers(q, limit = 10) {
  const params = new URLSearchParams({ q, limit: String(limit) })
  return fetchApi(`/users/search?${params}`)
}

// --- Notifications ---

export async function getNotifications({ cursor, limit = 50 } = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)
  return fetchApi(`/notifications?${params}`)
}

export async function markNotificationsRead() {
  return fetchApi('/notifications/read', { method: 'POST' })
}

export async function getUnreadNotificationCount() {
  return fetchApi('/notifications/unread')
}

// --- Messages ---

export async function getConversations({ cursor, limit = 50 } = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)
  return fetchApi(`/messages?${params}`)
}

export const sendMessage = throttled('sendMessage', 1000, (recipientAddress, content) => {
  return fetchApi('/messages/send', {
    method: 'POST',
    body: JSON.stringify({ recipientAddress, content }),
  })
})

export async function getUnreadMessageCount() {
  return fetchApi('/messages/unread')
}

export async function getMessages(conversationId, { cursor, limit = 50 } = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)
  return fetchApi(`/messages/${encodeURIComponent(conversationId)}?${params}`)
}

export async function markMessagesRead(conversationId) {
  return fetchApi(`/messages/${encodeURIComponent(conversationId)}/read`, { method: 'POST' })
}

// --- Reports ---

export const reportContent = throttled('reportContent', 5000, (targetType, targetId, reason, detail) => {
  return fetchApi('/reports', {
    method: 'POST',
    body: JSON.stringify({ targetType, targetId, reason, detail: detail || undefined }),
  })
})

export async function getAdminReports(status = 'pending') {
  return fetchApi(`/admin/reports?status=${encodeURIComponent(status)}`)
}

export async function resolveReport(id, status, deleteContent = false) {
  return fetchApi(`/admin/reports/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ status, deleteContent }),
  })
}

export async function getAdminErrorLogs(limit = 100) {
  return fetchApi(`/admin/error-logs?limit=${limit}`)
}

export async function clearAdminErrorLogs() {
  return fetchApi('/admin/error-logs', { method: 'DELETE' })
}

// --- Agent Leaderboard ---

export async function getAgentLeaderboard(sort = 'pnl', period = 'all') {
  return fetchApi(`/agents/leaderboard?sort=${sort}&period=${period}`)
}

export async function getPredictionLeaderboard({ coin, timeframe, min = 5, limit = 50 } = {}) {
  const params = new URLSearchParams()
  if (coin) params.set('coin', coin)
  if (timeframe) params.set('timeframe', timeframe)
  params.set('min', min)
  params.set('limit', limit)
  params.set('sort', 'predictions')
  return fetchApi(`/agents/leaderboard?${params}`)
}

export async function getNetworkStats(period) {
  const q = period ? `?period=${period}` : ''
  return fetchApi(`/agents/network-stats${q}`)
}

export async function getPredictionFeed() {
  return fetchApi('/agents/prediction-feed')
}

export async function getPredictionOverview() {
  return fetchApi('/agents/prediction-overview')
}

export async function getAgentState(agentAddress) {
  return fetchApi(`/agents/${agentAddress}/state`)
}

export async function runBacktest(agentAddress, coin, timeframe, strategy = {}) {
  return fetchApi(`/agents/${agentAddress}/backtest`, {
    method: 'POST',
    body: JSON.stringify({ coin, timeframe, strategy }),
  })
}

export async function saveBacktestHypothesis(agentAddress, hypothesis) {
  return fetchApi(`/agents/${agentAddress}/backtest/hypotheses`, {
    method: 'POST',
    body: JSON.stringify(hypothesis),
  })
}

export async function deleteBacktestHypothesis(agentAddress, hypothesisId) {
  return fetchApi(`/agents/${agentAddress}/backtest/hypotheses/${hypothesisId}`, { method: 'DELETE' })
}

export async function runBacktestScan(agentAddress, strategy = {}) {
  const params = new URLSearchParams()
  if (strategy.logic) params.set('logic', strategy.logic)
if (strategy.minConfidence != null) params.set('minConfidence', String(strategy.minConfidence))
  return fetchApi(`/agents/${agentAddress}/backtest/scan?${params}`)
}

export async function getAgentLessons(agentAddress, limit = 30) {
  const rows = await fetchApi(`/predictions?author=${agentAddress}&limit=${limit}`)
  return (Array.isArray(rows) ? rows : []).filter(r => r.lesson)
}

export async function updateAgentSettings(agentAddress, settings) {
  return fetchApi(`/agents/${agentAddress}/settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export async function getMyAgents() {
  return fetchApi('/my-agents')
}

export async function getAgreementScores() {
  return fetchApi('/agents/agreement')
}

// --- Sentiment ---

export async function getSentiment() {
  return fetchApi('/posts/sentiment')
}

export async function getSwarmDigest() {
  return fetchApi('/posts/swarm-digest')
}

export async function getMarketData() {
  return fetchApi('/market-data/public')
}

export async function getCoinAnalysis(coin) {
  return fetchApi(`/market-data/analysis/public?coin=${coin}`)
}

export async function getActivity() {
  return fetchApi('/posts/activity')
}


// --- Arena ---

export async function getArenaFeed(cursor) {
  const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return fetchApi(`/posts/arena${params}`)
}

export async function getArenaTrending() {
  return fetchApi(`/posts/arena/trending`)
}

// --- Admin ---

export async function getAdminStats() { return fetchApi('/admin/stats') }
export async function getAdminUsers() { return fetchApi('/admin/users') }
export async function getAdminPosts() { return fetchApi('/admin/posts') }
export async function getAdminComments() { return fetchApi('/admin/comments') }
export async function getAdminLikes() { return fetchApi('/admin/likes') }
export async function getAdminFollows() { return fetchApi('/admin/follows') }
