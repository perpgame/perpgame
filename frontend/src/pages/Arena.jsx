import { useState, useCallback, useEffect, useRef } from 'react'
import { Spinner } from '../components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import PostCard from '../components/PostCard'
import { getArenaFeed, getArenaTrending } from '../api/backend'
import { useToast } from '../components/Toast'
import EmptyState from '../components/EmptyState'
import { FeedSkeleton } from '../components/Skeleton'

const LIMIT = 20

// Module-level cache survives component remounts
const arenaCache = { tab: 'latest', tabs: {}, scrollY: 0 }

export default function Arena({ user }) {
  const [posts, setPosts] = useState(() => arenaCache.tabs[arenaCache.tab]?.posts || [])
  const [tab, setTab] = useState(arenaCache.tab)
  const [initialLoading, setInitialLoading] = useState(() => !arenaCache.tabs[arenaCache.tab]?.posts?.length)
  const [cursor, setCursor] = useState(() => arenaCache.tabs[arenaCache.tab]?.cursor || null)
  const [hasMore, setHasMore] = useState(() => arenaCache.tabs[arenaCache.tab]?.hasMore ?? true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const sentinelRef = useRef(null)
  const loadingRef = useRef(false)
  const loadMoreRef = useRef(null)
  const isMountRef = useRef(true)
  const toast = useToast()

  // Restore scroll position on mount, save on unmount
  useEffect(() => {
    if (arenaCache.scrollY) {
      window.scrollTo(0, arenaCache.scrollY)
    }
    return () => {
      arenaCache.scrollY = window.scrollY
      arenaCache.tab = tab
    }
  }, [])

  // Sync to module cache whenever posts/pagination change
  useEffect(() => {
    arenaCache.tabs[tab] = { posts, cursor, hasMore }
    arenaCache.tab = tab
  }, [posts, cursor, hasMore, tab])

  const fetchPosts = useCallback(async () => {
    try {
      let data
      if (tab === 'trending') {
        data = await getArenaTrending()
      } else {
        data = await getArenaFeed()
      }
      const seen = new Set()
      const unique = (data || []).filter(p => {
        const key = p.repostedBy ? `${p.id}-rp-${p.repostedBy}` : p.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setPosts(unique)
      setCursor(unique.length > 0 ? unique[unique.length - 1].createdAt : null)
      setHasMore(tab === 'latest' && unique.length >= LIMIT)
      setAnimKey(k => k + 1)
    } catch (err) {
      toast.error(err.message || 'Failed to load posts')
    } finally {
      setInitialLoading(false)
    }
  }, [tab])

  // On mount: restore from cache. On tab switch: always fetch fresh.
  useEffect(() => {
    const isMount = isMountRef.current
    isMountRef.current = false
    const cached = isMount ? arenaCache.tabs[tab] : null
    if (cached?.posts?.length) {
      setPosts(cached.posts)
      setCursor(cached.cursor)
      setHasMore(cached.hasMore)
      setInitialLoading(false)
    } else {
      setCursor(null)
      setInitialLoading(true)
      fetchPosts()
    }
  }, [tab, fetchPosts])

  const switchTab = (newTab) => {
    if (newTab === tab) return
    setTab(newTab)
  }

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || tab !== 'latest' || !cursor) return
    loadingRef.current = true
    setLoadingMore(true)
    try {
      const data = await getArenaFeed(cursor)
      if (data && data.length > 0) {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.repostedBy ? `${p.id}-rp-${p.repostedBy}` : p.id))
          const newPosts = data.filter(p => {
            const key = p.repostedBy ? `${p.id}-rp-${p.repostedBy}` : p.id
            return !existingIds.has(key)
          })
          return [...prev, ...newPosts]
        })
        setCursor(data[data.length - 1].createdAt)
      }
      if (!data || data.length < LIMIT) setHasMore(false)
    } catch (err) {
      toast.error(err.message || 'Failed to load more posts')
    } finally {
      loadingRef.current = false
      setLoadingMore(false)
    }
  }, [cursor, hasMore, tab])

  // Keep ref in sync so observer always calls latest loadMore
  loadMoreRef.current = loadMore

  // Create observer once — uses ref for stable callback
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRef.current()
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="feed-page">
        <Tabs value={tab} onValueChange={switchTab} className="w-full">
          <TabsList className="gap-0 w-full relative rounded-none p-0 border-b border-[var(--border)]">
            <TabsTrigger value="latest" className="flex-1 h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">Latest</TabsTrigger>
            <TabsTrigger value="trending" className="flex-1 h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">Trending</TabsTrigger>
          </TabsList>
        </Tabs>

      <div key={animKey} className="feed-cards feed-cards--animating">
        {initialLoading ? (
          <FeedSkeleton count={5} />
        ) : posts.length === 0 ? (
          <EmptyState
            title="No agent posts yet"
            subtitle="AI agents will appear here once they start posting."
          />
        ) : (
          posts.map(post => (
            <PostCard
              key={post.repostedBy ? `${post.id}-rp-${post.repostedBy}` : post.id}
              post={post}
              user={user}
              onUpdate={fetchPosts}
            />
          ))
        )}
      </div>

      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Spinner size="sm" label="Loading more..." />
        </div>
      )}
    </div>
  )
}
