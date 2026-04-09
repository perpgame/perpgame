import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { getPost } from '../api/backend'
import { useVerifiedAuth } from '../hooks/useVerifiedAuth'
import { useClickOutside } from '../hooks/useClickOutside'
import { usePostActions } from '../hooks/usePostActions'
import { renderContent, getAttachmentCoin } from '../utils/cashtags'
import { getUserDisplayName, getUserHandle } from '../utils/user'

import Avatar from '../components/Avatar'
import CoinIcon from '../components/terminal/CoinIcon'
import { Chip } from '../components/ui/chip'
import PostAttachment from '../components/PostAttachment'
import CommentSection from '../components/CommentSection'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import QuotedPostCard from '../components/QuotedPostCard'
import QuoteRepostModal from '../components/QuoteRepostModal'
import { Button } from '../components/ui/button'

export default function PostDetail({ user }) {
  const { postId } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const repostMenuRef = useRef(null)
  const { requireVerified } = useVerifiedAuth(user)
  const navigate = useNavigate()

  const {
    likeCount, repostCount,
    showRepostMenu, setShowRepostMenu,
    showQuoteModal, setShowQuoteModal,
    syncFromPost,
   handleDelete,
  } = usePostActions(post, {
    requireVerified,
    onDelete: () => navigate(-1),
  })

  const closeRepostMenu = useCallback(() => setShowRepostMenu(false), [setShowRepostMenu])
  useClickOutside(repostMenuRef, closeRepostMenu, showRepostMenu)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const p = await getPost(postId)
        setPost(p)
        syncFromPost(p)
      } catch {
        setPost(null)
      }
      setLoading(false)
    }
    load()
  }, [postId, syncFromPost])

  if (loading) {
    return (
      <div>
        <PageHeader title="Post" showBack />
      </div>
    )
  }

  if (!post) {
    return (
      <div>
        <PageHeader title="Post" showBack />
        <EmptyState
          title="This post doesn't exist"
          subtitle="Try searching for something else."
        />
      </div>
    )
  }

  const authorUser = { displayName: post.authorDisplayName, username: post.authorUsername, address: post.authorAddress }

  return (
    <div>
      <PageHeader title="Post" showBack />

      <div className="post-detail">
        <div className="post-detail-author">
          <Avatar address={post.authorAddress} size={40} avatarUrl={post.authorAvatarUrl} />
          <div>
            <Link to={`/profile/${post.authorAddress}`} className="post-detail-author-name">
              {getUserDisplayName(authorUser)}
            </Link>
            <div className="post-detail-author-handle">
              {getUserHandle(authorUser)}
            </div>
          </div>
          {getAttachmentCoin(post.attachment) && (
            <span className="tweet-coin-badge post-detail-badge">${getAttachmentCoin(post.attachment)}</span>
          )}
          {user && user.address === post.authorAddress && (
            <Button size="sm" variant="ghost" className="rounded-full text-[var(--loss-red)] font-bold ml-auto" onClick={handleDelete} aria-label="Delete post">
              Delete
            </Button>
          )}
        </div>

        <div className="post-detail-content">
          {renderContent(post.content)}
        </div>

        {post.attachment && (
          <div className="post-detail-attachment">
            <PostAttachment attachment={post.attachment} size="default" />
          </div>
        )}

        {post.quotedPost && (
          <div className="post-detail-attachment">
            <QuotedPostCard quotedPost={post.quotedPost} />
          </div>
        )}

        {post.predictionCoin && post.direction && (
          <div className="post-prediction-card" style={{ marginTop: 12 }}>
            <CoinIcon coin={post.predictionCoin} size={16} />
            <span className="post-prediction-coin">{post.predictionCoin}</span>
            <span className={`post-prediction-dir ${post.direction}`}>
              {post.direction === 'bull' ? '↑' : '↓'}
            </span>
            {post.priceAtCall != null && (
              <span className="post-prediction-price">
                ${Number(post.priceAtCall).toLocaleString(undefined, { maximumFractionDigits: post.priceAtCall >= 1 ? 2 : 6 })}
              </span>
            )}
            {post.timeframe && <span className="post-prediction-tf">{post.timeframe}</span>}
            {post.priceAtExpiry != null && post.priceAtCall != null && (
              <span className={`post-prediction-delta ${((post.priceAtExpiry - post.priceAtCall) / post.priceAtCall) >= 0 ? 'green' : 'red'}`}>
                {((post.priceAtExpiry - post.priceAtCall) / post.priceAtCall * 100) >= 0 ? '+' : ''}
                {((post.priceAtExpiry - post.priceAtCall) / post.priceAtCall * 100).toFixed(2)}%
              </span>
            )}
            {post.predictionOutcome && (
              <span className={`post-prediction-outcome ${post.predictionOutcome}`}>
                {post.predictionOutcome === 'correct' ? '✓' : post.predictionOutcome === 'neutral' ? '—' : '✗'}
              </span>
            )}
          </div>
        )}

        {post.predictionOutcome && (
          <div style={{ marginTop: 8 }}>
            <Chip size="sm" className={`font-bold ${post.predictionOutcome === 'correct' ? 'bg-[rgba(181,239,220,0.15)] text-[var(--profit-green)]' : post.predictionOutcome === 'neutral' ? 'bg-[rgba(255,255,255,0.08)] text-[var(--text-secondary)]' : 'bg-[rgba(246,70,93,0.15)] text-[var(--loss-red)]'}`}>
              {post.predictionOutcome === 'correct' ? '✓ CORRECT' : post.predictionOutcome === 'neutral' ? '— NEUTRAL' : '✗ WRONG'}
            </Chip>
          </div>
        )}

        <div className="post-detail-timestamp">
          {new Date(post.createdAt).toLocaleString()}
        </div>

        <div className="post-detail-stats">
          <span><strong>{repostCount}</strong> <span className="post-detail-stats-label">Reposts</span></span>
          <Link to={`/post/${post.id}/likes`} className="post-detail-stats-link">
            <strong>{likeCount}</strong> <span className="post-detail-stats-label">Likes</span>
          </Link>
        </div>
      </div>

      <CommentSection postId={post.id} user={user} />

      {showQuoteModal && (
        <QuoteRepostModal
          post={post}
          onClose={() => setShowQuoteModal(false)}
        />
      )}
    </div>
  )
}
