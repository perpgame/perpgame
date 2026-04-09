import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getCoinPosts } from '../api/backend'
import { getMetaAndAssetCtxs } from '../api/hyperliquid'
import { formatPrice } from '../utils/format'
import PostCard from '../components/PostCard'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { FeedSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'

const LIMIT = 20

function coinLogoUrl(ticker) {
  return `https://cdn.jsdelivr.net/gh/madenix/Crypto-logo-cdn@main/Logos/${ticker.toUpperCase()}.svg`
}

export default function CoinThread({ user }) {
  const { ticker } = useParams()
  const coin = ticker.toUpperCase()
  const [posts, setPosts] = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [coinData, setCoinData] = useState(null)
  const sentinelRef = useRef(null)
  const loadingRef = useRef(false)
  const loadMoreRef = useRef(null)
  const toast = useToast()

  useEffect(() => {
    async function fetchCoinData() {
      try {
        const [meta, ctxs] = await getMetaAndAssetCtxs()
        const idx = meta.universe.findIndex(u => u.name === coin)
        if (idx !== -1) {
          const markPx = parseFloat(ctxs[idx].markPx)
          const prevDayPx = parseFloat(ctxs[idx].prevDayPx)
          const dayChange = prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0
          setCoinData({ markPx, dayChange })
        }
      } catch {
        // silently fail
      }
    }
    fetchCoinData()
    const interval = setInterval(fetchCoinData, 30000)
    return () => clearInterval(interval)
  }, [coin])

  const refreshPosts = useCallback(async () => {
    try {
      const data = await getCoinPosts(coin, { limit: LIMIT })
      setPosts(data)
      setHasMore(data.length >= LIMIT)
      setCursor(data.length > 0 ? data[data.length - 1].createdAt : null)
    } catch (err) {
      toast.error(err.message || 'Failed to load posts')
    } finally {
      setInitialLoading(false)
    }
  }, [coin])

  useEffect(() => {
    setPosts([])
    setCursor(null)
    setHasMore(true)
    setInitialLoading(true)
    refreshPosts()
  }, [refreshPosts])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !cursor) return
    loadingRef.current = true
    setLoadingMore(true)
    try {
      const data = await getCoinPosts(coin, { cursor, limit: LIMIT })
      if (data.length > 0) {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id))
          const newPosts = data.filter(p => !existingIds.has(p.id))
          return [...prev, ...newPosts]
        })
        setCursor(data[data.length - 1].createdAt)
      }
      if (data.length < LIMIT) setHasMore(false)
    } catch (err) {
      toast.error(err.message || 'Failed to load more posts')
    } finally {
      loadingRef.current = false
      setLoadingMore(false)
    }
  }, [coin, cursor, hasMore])

  // Keep ref in sync so observer always calls latest loadMore
  loadMoreRef.current = loadMore

  // Create observer once — uses ref for stable callback
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreRef.current() },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  const isUp = coinData ? coinData.dayChange >= 0 : true

  return (
    <div>
      <PageHeader showBack>
        <div className="coin-thread-header">
          <div className="coin-thread-left">
            <img
              src={coinLogoUrl(coin)}
              alt={coin}
              className="coin-thread-logo"
              loading="lazy"
              onError={e => { e.target.style.display = 'none' }}
            />
            <span className="coin-thread-ticker">{coin}</span>
          </div>
          {coinData && (
            <div className="coin-thread-right">
              <span className="coin-thread-price">{formatPrice(coinData.markPx)}</span>
              <span className={`coin-thread-change ${isUp ? 'coin-thread-up' : 'coin-thread-down'}`}>
                {isUp ? '+' : ''}{coinData.dayChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </PageHeader>

      <div className="feed-cards">
        {initialLoading ? (
          <FeedSkeleton count={4} />
        ) : posts.length === 0 ? (
          <EmptyState
            title={`No posts about ${coin} yet`}
            subtitle={`Be the first to post about $${coin}!`}
          />
        ) : (
          posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              user={user}
              onUpdate={refreshPosts}
            />
          ))
        )}
      </div>

      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && (
        <div className="loading-more-indicator">Loading more...</div>
      )}
    </div>
  )
}
