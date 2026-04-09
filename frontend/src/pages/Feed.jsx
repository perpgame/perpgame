import { useState, useCallback, useEffect, useRef } from 'react'
import { Spinner } from '../components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import PostComposer from '../components/PostComposer'
import PostCard from '../components/PostCard'
import { getPosts } from '../api/backend'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { FeedSkeleton } from '../components/Skeleton'
import { Button } from '../components/ui/button'


const LIMIT = 20

// Module-level cache survives component remounts
const feedCache = { tab: 'foryou', tabs: {}, scrollY: 0 }

export default function Feed({ user }) {
  const [posts, setPosts] = useState(() => feedCache.tabs[feedCache.tab]?.posts || [])
  const [tab, setTab] = useState(feedCache.tab)
  const [initialLoading, setInitialLoading] = useState(() => !feedCache.tabs[feedCache.tab]?.posts?.length)
  // "following" uses cursor (chronological), "foryou" uses offset (scored)
  const [cursor, setCursor] = useState(() => feedCache.tabs[feedCache.tab]?.cursor || null)
  const [offset, setOffset] = useState(() => feedCache.tabs[feedCache.tab]?.offset || 0)
  const [hasMore, setHasMore] = useState(() => feedCache.tabs[feedCache.tab]?.hasMore ?? true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasNewPosts, setHasNewPosts] = useState(false)
  const sentinelRef = useRef(null)
  const loadingRef = useRef(false)
  const loadMoreRef = useRef(null)
  const cacheRef = useRef(feedCache.tabs)
  const toast = useToast()

  // Restore scroll position on mount, save on unmount
  useEffect(() => {
    if (feedCache.scrollY) {
      window.scrollTo(0, feedCache.scrollY)
    }
    return () => {
      feedCache.scrollY = window.scrollY
      feedCache.tab = tab
    }
  }, [])

  // Sync to module cache whenever posts/pagination change
  useEffect(() => {
    feedCache.tabs[tab] = { posts, cursor, offset, hasMore }
    feedCache.tab = tab
    cacheRef.current = feedCache.tabs
  }, [posts, cursor, offset, hasMore, tab])

  const isFollowing = tab === 'following'
  const feedParam = isFollowing ? 'following' : undefined

  const refreshPosts = useCallback(async () => {
    try {
      const data = await getPosts({ feed: feedParam, limit: LIMIT })
      // Deduplicate by post id (safety net)
      const seen = new Set()
      const unique = data.filter(p => {
        const key = p.repostedBy ? `${p.id}-rp-${p.repostedBy}` : p.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setPosts(unique)
      setHasMore(data.length >= LIMIT)
      if (isFollowing) {
        setCursor(data.length > 0 ? data[data.length - 1].createdAt : null)
      } else {
        setOffset(data.length)
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load posts')
    } finally {
      setInitialLoading(false)
    }
  }, [feedParam, isFollowing])

  // Cache current tab state before switching
  const switchTab = (newTab) => {
    if (newTab === tab) return
    setTab(newTab)
  }

  // On tab change: restore from cache or fetch fresh
  useEffect(() => {
    const cached = feedCache.tabs[tab]
    if (cached?.posts?.length) {
      setPosts(cached.posts)
      setCursor(cached.cursor)
      setOffset(cached.offset)
      setHasMore(cached.hasMore)
      setInitialLoading(false)
    } else {
      setOffset(0)
      setCursor(null)
      setInitialLoading(true)
      refreshPosts()
    }
  }, [refreshPosts])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return
    if (isFollowing && !cursor) return
    loadingRef.current = true
    setLoadingMore(true)
    try {
      const params = isFollowing
        ? { cursor, feed: feedParam, limit: LIMIT }
        : { offset, feed: feedParam, limit: LIMIT }
      const data = await getPosts(params)
      if (data.length > 0) {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.repostedBy ? `${p.id}-rp-${p.repostedBy}` : p.id))
          const newPosts = data.filter(p => {
            const key = p.repostedBy ? `${p.id}-rp-${p.repostedBy}` : p.id
            return !existingIds.has(key)
          })
          return [...prev, ...newPosts]
        })
        if (isFollowing) {
          setCursor(data[data.length - 1].createdAt)
        } else {
          setOffset(prev => prev + data.length)
        }
      }
      if (data.length < LIMIT) setHasMore(false)
    } catch (err) {
      toast.error(err.message || 'Failed to load more posts')
    } finally {
      loadingRef.current = false
      setLoadingMore(false)
    }
  }, [cursor, offset, hasMore, feedParam, isFollowing])

  // Check for new posts periodically
  useEffect(() => {
    if (initialLoading || posts.length === 0) return
    const interval = setInterval(async () => {
      try {
        const data = await getPosts({ feed: feedParam, limit: 1 })
        if (data.length > 0) {
          const newestId = data[0].repostedBy ? `${data[0].id}-rp-${data[0].repostedBy}` : data[0].id
          const currentNewestId = posts[0]?.repostedBy ? `${posts[0].id}-rp-${posts[0].repostedBy}` : posts[0]?.id
          if (newestId !== currentNewestId && window.scrollY > 200) {
            setHasNewPosts(true)
          }
        }
      } catch { /* ignore */ }
    }, 30000)
    return () => clearInterval(interval)
  }, [posts, feedParam, initialLoading])

  const handleNewPosts = useCallback(() => {
    setHasNewPosts(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    refreshPosts()
  }, [refreshPosts])

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
      <PageHeader>
        <Tabs value={tab} onValueChange={switchTab} className="w-full">
          <TabsList className="gap-0 w-full relative rounded-none p-0 border-b border-[var(--border)]">
            <TabsTrigger value="foryou" className="flex-1 h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">For you</TabsTrigger>
            <TabsTrigger value="following" className="flex-1 h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">Following</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      {hasNewPosts && (
        <Button
          variant="flat" className="w-full rounded-none bg-[var(--surface-hover)] text-[var(--primary)] font-semibold text-sm border-b border-[var(--border)]"
          onClick={handleNewPosts}
        >
          New posts available
        </Button>
      )}

      <div className="feed-cards">
        <PostComposer user={user} onPost={(newPost) => {
          if (newPost?.id) {
            const enriched = {
              ...newPost,
              authorUsername: newPost.authorUsername || user?.username,
              authorDisplayName: newPost.authorDisplayName || user?.displayName,
              authorAvatarUrl: newPost.authorAvatarUrl || user?.avatarUrl,
            }
            setPosts(prev => [enriched, ...prev.filter(p => p.id !== newPost.id)])
          } else {
            refreshPosts()
          }
        }} />

        {initialLoading ? (
          <FeedSkeleton count={5} />
        ) : posts.length === 0 ? (
          <EmptyState
            title={tab === 'following' ? 'No posts yet' : 'Welcome to PerpGame'}
            subtitle={tab === 'following'
              ? 'Follow some traders to see their posts here.'
              : "This is the best place to see what's happening in perps. Share your first post!"}
          />
        ) : (
          posts.map(post => (
            <PostCard
              key={post.repostedBy ? `${post.id}-rp-${post.repostedBy}` : post.id}
              post={post}
              user={user}
              onUpdate={refreshPosts}
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
