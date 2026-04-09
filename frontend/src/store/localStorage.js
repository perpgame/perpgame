const KEYS = {
  CURRENT_USER: 'perpgame_current_user',
  USERS: 'perpgame_users',
  POSTS: 'perpgame_posts',
  COMMENTS: 'perpgame_comments',
  LIKES: 'perpgame_likes',
  FOLLOWS: 'perpgame_follows',
  POINTS: 'perpgame_points',
}

function get(key) {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

function set(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

// Current user
export function getCurrentUser() {
  const user = get(KEYS.CURRENT_USER)
  if (user && user.verified === undefined) {
    user.verified = false
  }
  return user
}

export function setCurrentUser(user) {
  set(KEYS.CURRENT_USER, user)
  // Also save to users registry
  const users = get(KEYS.USERS) || {}
  users[user.address] = { ...users[user.address], ...user }
  set(KEYS.USERS, users)
  // Auto-award 50 account points on first login
  const points = getPoints(user.address)
  if (!points.account) {
    addPoints(user.address, 'account', 50)
  }
}

export function getUser(address) {
  const users = get(KEYS.USERS) || {}
  return users[address] || null
}

export function getAllUsers() {
  return get(KEYS.USERS) || {}
}

// Posts
export function getPosts() {
  return get(KEYS.POSTS) || []
}

export function getPost(postId) {
  const posts = getPosts()
  return posts.find(p => p.id === postId) || null
}

export function createPost(post) {
  const posts = getPosts()
  const newPost = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    createdAt: new Date().toISOString(),
    ...post,
  }
  posts.unshift(newPost)
  set(KEYS.POSTS, posts)
  return newPost
}

export function deletePost(postId) {
  const posts = getPosts().filter(p => p.id !== postId)
  set(KEYS.POSTS, posts)
}

export function getUserPosts(address) {
  return getPosts().filter(p => p.authorAddress === address)
}

// Comments
export function getComments(postId) {
  const all = get(KEYS.COMMENTS) || {}
  return all[postId] || []
}

export function addComment(postId, comment) {
  const all = get(KEYS.COMMENTS) || {}
  if (!all[postId]) all[postId] = []
  const newComment = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    createdAt: new Date().toISOString(),
    ...comment,
  }
  all[postId].push(newComment)
  set(KEYS.COMMENTS, all)
  return newComment
}

export function getCommentCount(postId) {
  const all = get(KEYS.COMMENTS) || {}
  return (all[postId] || []).length
}

// Likes
export function getLikes(postId) {
  const all = get(KEYS.LIKES) || {}
  return all[postId] || []
}

export function toggleLike(postId, userAddress) {
  const all = get(KEYS.LIKES) || {}
  if (!all[postId]) all[postId] = []
  const idx = all[postId].indexOf(userAddress)
  if (idx === -1) {
    all[postId].push(userAddress)
  } else {
    all[postId].splice(idx, 1)
  }
  set(KEYS.LIKES, all)
  return all[postId]
}

export function isLiked(postId, userAddress) {
  const all = get(KEYS.LIKES) || {}
  return (all[postId] || []).includes(userAddress)
}

// Follows
export function getFollowing(userAddress) {
  const all = get(KEYS.FOLLOWS) || {}
  return all[userAddress] || []
}

export function getFollowers(userAddress) {
  const all = get(KEYS.FOLLOWS) || {}
  const followers = []
  for (const [addr, following] of Object.entries(all)) {
    if (following.includes(userAddress)) followers.push(addr)
  }
  return followers
}

export function toggleFollow(userAddress, targetAddress) {
  const all = get(KEYS.FOLLOWS) || {}
  if (!all[userAddress]) all[userAddress] = []
  const idx = all[userAddress].indexOf(targetAddress)
  if (idx === -1) {
    all[userAddress].push(targetAddress)
  } else {
    all[userAddress].splice(idx, 1)
  }
  set(KEYS.FOLLOWS, all)
  return all[userAddress]
}

export function isFollowing(userAddress, targetAddress) {
  const all = get(KEYS.FOLLOWS) || {}
  return (all[userAddress] || []).includes(targetAddress)
}


// Points
function defaultPoints() {
  return { total: 0, account: 0, invites: 0, hlReferral: 0, inviteCount: 0, hlReferralVerified: false, referralCode: '', referredBy: null }
}

export function getPoints(userAddress) {
  const all = get(KEYS.POINTS) || {}
  const p = all[userAddress]
  const code = getReferralCode(userAddress)
  if (!p) return { ...defaultPoints(), referralCode: code }
  return { ...defaultPoints(), ...p, referralCode: code }
}

export function addPoints(userAddress, actionType, amount) {
  const all = get(KEYS.POINTS) || {}
  if (!all[userAddress]) all[userAddress] = { ...defaultPoints() }
  all[userAddress].total += amount
  if (actionType === 'account') all[userAddress].account += amount
  if (actionType === 'invites') {
    all[userAddress].invites += amount
    all[userAddress].inviteCount = (all[userAddress].inviteCount || 0) + 1
  }
  if (actionType === 'hlReferral') all[userAddress].hlReferral += amount
  set(KEYS.POINTS, all)
}

export function setHlReferralVerified(userAddress) {
  const all = get(KEYS.POINTS) || {}
  if (!all[userAddress]) all[userAddress] = { ...defaultPoints() }
  all[userAddress].hlReferralVerified = true
  set(KEYS.POINTS, all)
}

export function getReferralCode(userAddress) {
  if (!userAddress) return ''
  const all = get(KEYS.POINTS) || {}
  if (!all[userAddress]) all[userAddress] = { ...defaultPoints() }
  // Return existing stored code or generate a new random one
  if (all[userAddress].referralCode) return all[userAddress].referralCode
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const code = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  all[userAddress].referralCode = code
  set(KEYS.POINTS, all)
  return code
}

export function findUserByReferralCode(code) {
  if (!code) return null
  const all = get(KEYS.POINTS) || {}
  const normalized = code.toLowerCase()
  for (const [addr, data] of Object.entries(all)) {
    if (data.referralCode && data.referralCode.toLowerCase() === normalized) return addr
  }
  return null
}

export function setReferredBy(userAddress, referrerAddress) {
  const all = get(KEYS.POINTS) || {}
  if (!all[userAddress]) all[userAddress] = { ...defaultPoints() }
  all[userAddress].referredBy = referrerAddress
  set(KEYS.POINTS, all)
}

// Utility
export function shortenAddress(address) {
  if (!address) return ''
  return address.slice(0, 6) + '...' + address.slice(-4)
}

export function formatTime(isoString) {
  const now = new Date()
  // Ensure the string is parsed as UTC — postgres returns timestamps without 'Z',
  // causing browsers to treat them as local time and produce wrong offsets.
  const str = typeof isoString === 'string' && !isoString.endsWith('Z') && !isoString.includes('+')
    ? isoString.replace(' ', 'T') + 'Z'
    : isoString
  const date = new Date(str)
  const diff = (now - date) / 1000

  if (diff < 60) return 'now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h'
  if (diff < 604800) return Math.floor(diff / 86400) + 'd'
  return date.toLocaleDateString()
}
