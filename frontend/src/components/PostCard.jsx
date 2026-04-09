import { Link, useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { formatTime } from '../store/localStorage'
import { useVerifiedAuth } from '../hooks/useVerifiedAuth'
import { usePostActions } from '../hooks/usePostActions'
import { useToast } from './Toast'
import { renderContent, getAttachmentCoin } from '../utils/cashtags'
import { getUserDisplayName, getUserHandle } from '../utils/user'
import { IconComment, IconRepost, IconHeart, IconShare } from './Icons'
import { Card } from './ui/card'
import { Chip } from './ui/chip'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './ui/dropdown-menu'
import Avatar from './Avatar'
import CoinIcon from './terminal/CoinIcon'
import PostAttachment from './PostAttachment'
import QuotedPostCard from './QuotedPostCard'
import QuoteRepostModal from './QuoteRepostModal'
import ReportModal from './ReportModal'

const blockStyle = { display: 'block' }

export default function PostCard({ post, user, onUpdate }) {
  const [showReportModal, setShowReportModal] = useState(false)
  const commentCount = post.commentCount || 0
  const { requireVerified } = useVerifiedAuth(user)
  const navigate = useNavigate()
  const toast = useToast()

  const {
    liked, likeCount, reposted, repostCount,
    showQuoteModal, setShowQuoteModal,
    handleShare, handleDelete,
  } = usePostActions(post, {
    onDelete: onUpdate || (() => navigate('/')),
    onShareCopied: () => toast.success('Link copied'),
  })

  const authorUser = useMemo(() => ({ displayName: post.authorDisplayName, username: post.authorUsername, address: post.authorAddress }), [post.authorDisplayName, post.authorUsername, post.authorAddress])
  const repostUser = useMemo(() => post.repostedBy ? { displayName: post.repostedByDisplayName, username: post.repostedByUsername, address: post.repostedBy } : null, [post.repostedBy, post.repostedByDisplayName, post.repostedByUsername])

  const coinTag = getAttachmentCoin(post.attachment)
  const [expanded, setExpanded] = useState(false)
  const isTruncated = post.content && post.content.length > 280

  return (
    <>
      <div style={{ ...blockStyle, cursor: 'pointer' }} onClick={() => navigate(`/post/${post.id}`)}>
        {post.repostedBy && (
          <Link to={`/profile/${post.repostedBy}`} className="repost-indicator" onClick={(e) => e.stopPropagation()}>
            <Avatar address={post.repostedBy} size={18} avatarUrl={post.repostedByAvatarUrl} />
            <IconRepost size={14} />
            <span>{getUserDisplayName(repostUser)} reposted</span>
          </Link>
        )}
        <Card className="flex gap-3 p-3 sm:p-4 mx-3 mb-2 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer">
          <Avatar address={post.authorAddress} size={40} avatarUrl={post.authorAvatarUrl} />
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start gap-1.5 text-sm">
              <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                <Link to={`/profile/${post.authorAddress}`} className="font-bold text-[var(--text)] hover:underline" onClick={e => e.stopPropagation()}>
                  {getUserDisplayName(authorUser)}
                </Link>
                <span className="text-[var(--text-third)]">{getUserHandle(authorUser)}</span>
                <span className="text-[var(--text-third)]">·</span>
                <span className="text-[var(--text-third)]">{formatTime(post.createdAt)}</span>
                {coinTag && (
                  <Chip size="sm" className="tweet-coin-badge">${coinTag}</Chip>
                )}
                {post.predictionOutcome && (
                  <Chip size="sm" className={`font-bold ${post.predictionOutcome === 'correct' ? 'bg-[rgba(181,239,220,0.15)] text-[var(--profit-green)]' : post.predictionOutcome === 'neutral' ? 'bg-[rgba(255,255,255,0.08)] text-[var(--text-secondary)]' : 'bg-[rgba(246,70,93,0.15)] text-[var(--loss-red)]'}`}>
                    {post.predictionOutcome === 'correct' ? '✓ CORRECT' : post.predictionOutcome === 'neutral' ? '— NEUTRAL' : '✗ WRONG'}
                  </Chip>
                )}
              </div>
              {user && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button className="post-more-btn shrink-0" onClick={(e) => { e.preventDefault(); e.stopPropagation() }} aria-label="More options">
                      &middot;&middot;&middot;
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                    {user.address === post.authorAddress ? (
                      <DropdownMenuItem className="text-[var(--loss-red)]" onClick={(e) => handleDelete(e)}>
                        Delete
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => requireVerified(() => setShowReportModal(true), 'Reporting')()}>
                        Report
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Content */}
            <div className="tweet-content">
              {isTruncated && !expanded
                ? <>{renderContent(post.content.slice(0, 280) + '…')}<Link to={`/post/${post.id}`} className="post-see-more" onClick={(e) => e.stopPropagation()}>See more</Link></>
                : renderContent(post.content)
              }
            </div>

            {post.attachment && (
              <div className="tweet-attachment-wrapper">
                <PostAttachment attachment={post.attachment} size="compact" />
              </div>
            )}

            {post.predictionCoin && post.direction && (
              <div className="post-prediction-card">
                <CoinIcon coin={post.predictionCoin} size={16} />
                <span className="post-prediction-coin">{post.predictionCoin}</span>
                <span className={`post-prediction-dir ${post.direction}`}>
                  {post.direction === 'bull' ? '↑' : '↓'}
                </span>
                {post.predictionPriceAtCall != null && (
                  <span className="post-prediction-price">
                    ${Number(post.predictionPriceAtCall).toLocaleString(undefined, { maximumFractionDigits: post.predictionPriceAtCall >= 1 ? 2 : 6 })}
                  </span>
                )}
                {post.timeframe && <span className="post-prediction-tf">{post.timeframe}</span>}
                {post.predictionPriceAtExpiry != null && post.predictionPriceAtCall != null && (
                  <span className={`post-prediction-delta ${((post.predictionPriceAtExpiry - post.predictionPriceAtCall) / post.predictionPriceAtCall) >= 0 ? 'green' : 'red'}`}>
                    {((post.predictionPriceAtExpiry - post.predictionPriceAtCall) / post.predictionPriceAtCall * 100) >= 0 ? '+' : ''}
                    {((post.predictionPriceAtExpiry - post.predictionPriceAtCall) / post.predictionPriceAtCall * 100).toFixed(2)}%
                  </span>
                )}
                {post.predictionOutcome && (
                  <span className={`post-prediction-outcome ${post.predictionOutcome}`}>
                    {post.predictionOutcome === 'correct' ? '✓' : post.predictionOutcome === 'neutral' ? '—' : '✗'}
                  </span>
                )}
              </div>
            )}

            {post.quotedPost && (
              <QuotedPostCard quotedPost={post.quotedPost} />
            )}

            {/* Actions */}
            <div className="flex items-center justify-between max-w-[320px] mt-2 -ml-2">
              <button className="tweet-action" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/post/${post.id}`) }} aria-label="Comment">
                <span className="tweet-action-icon"><IconComment size={16} /></span>
                <span>{commentCount || ''}</span>
              </button>
              <button className={`tweet-action repost ${reposted ? 'reposted' : ''}`} aria-label="Quote Repost">
                <span className="tweet-action-icon"><IconRepost size={16} /></span>
                <span>{repostCount || ''}</span>
              </button>
              <button className={`tweet-action like ${liked ? 'liked' : ''}`} aria-label={liked ? 'Unlike' : 'Like'}>
                <span className="tweet-action-icon"><IconHeart size={16} filled={liked} /></span>
                <span>{likeCount || ''}</span>
              </button>
              <button className="tweet-action" onClick={handleShare} aria-label="Share">
                <span className="tweet-action-icon"><IconShare size={16} /></span>
              </button>
            </div>
          </div>
        </Card>
      </div>
      {showQuoteModal && (
        <QuoteRepostModal
          post={post}
          onClose={() => setShowQuoteModal(false)}
          onSuccess={onUpdate}
        />
      )}
      {showReportModal && (
        <ReportModal
          targetType="post"
          targetId={post.id}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </>
  )
}
