import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

import { getComments, addComment, deleteComment, toggleCommentLike, getCommentReplies } from '../api/backend'
import { formatTime } from '../store/localStorage'
import { useVerifiedAuth } from '../hooks/useVerifiedAuth'
import { useToast } from './Toast'
import { getUserDisplayName, getUserHandle } from '../utils/user'
import { renderContent } from '../utils/cashtags'
import Avatar from './Avatar'
import MentionInput from './MentionInput'
import ReportModal from './ReportModal'
import { IconHeart, IconComment } from './Icons'
import { Button } from './ui/button'

function CommentItem({ comment, postId, user, isReadOnly, requireVerified, toast, isReply, onDelete }) {
  const [liked, setLiked] = useState(comment.liked)
  const [likeCount, setLikeCount] = useState(comment.likeCount)
  const [replyCount, setReplyCount] = useState(comment.replyCount || 0)
  const [showReplies, setShowReplies] = useState(false)
  const [replies, setReplies] = useState([])
  const [repliesLoaded, setRepliesLoaded] = useState(false)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [showReportModal, setShowReportModal] = useState(false)

  const handleLike = async () => {
    if (!user) return
    requireVerified(async () => {
      try {
        const res = await toggleCommentLike(postId, comment.id)
        setLiked(res.liked)
        setLikeCount(res.likeCount)
      } catch (err) {
        toast.error(err.message || 'Failed to like comment')
      }
    }, 'Liking')()
  }

  const handleDelete = async () => {
    try {
      await deleteComment(postId, comment.id)
      toast.success('Comment deleted')
      if (onDelete) onDelete(comment.id)
    } catch (err) {
      toast.error(err.message || 'Failed to delete comment')
    }
  }

  const handleToggleReplies = async () => {
    if (!showReplies && !repliesLoaded) {
      try {
        const data = await getCommentReplies(postId, comment.id)
        setReplies(data)
        setRepliesLoaded(true)
      } catch (err) {
        toast.error(err.message || 'Failed to load replies')
        return
      }
    }
    setShowReplies(!showReplies)
  }

  const doSubmitReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim()) return
    try {
      const newReply = await addComment(postId, replyText.trim(), comment.id)
      setReplies(prev => [...prev, newReply])
      setReplyCount(prev => prev + 1)
      setReplyText('')
      setShowReplyInput(false)
      setShowReplies(true)
      setRepliesLoaded(true)
    } catch (err) {
      toast.error(err.message || 'Failed to add reply')
    }
  }

  const handleSubmitReply = (e) => {
    e.preventDefault()
    requireVerified(doSubmitReply, 'Replying')(e)
  }

  return (
    <div>
      <div className="tweet">
        <Avatar address={comment.authorAddress} size={32} avatarUrl={comment.authorAvatarUrl} />
        <div className="tweet-body">
          <div className="tweet-header">
            <Link to={`/profile/${comment.authorAddress}`} className="tweet-author">
              {getUserDisplayName({ displayName: comment.authorDisplayName, username: comment.authorUsername, address: comment.authorAddress })}
            </Link>
            <span className="tweet-handle">{getUserHandle({ username: comment.authorUsername, address: comment.authorAddress })}</span>
            <span className="tweet-dot">&middot;</span>
            <span className="tweet-time">{formatTime(comment.createdAt)}</span>
          </div>
          <div className="tweet-content">{renderContent(comment.content)}</div>
          <div className="tweet-actions comment-tweet-actions">
            {!isReply && (
              <button
                className="tweet-action"
                onClick={() => setShowReplyInput(!showReplyInput)}
                disabled={isReadOnly}
              >
                <span className="tweet-action-icon"><IconComment size={16} /></span>
                <span>{replyCount || ''}</span>
              </button>
            )}
            <button
              className={`tweet-action like ${liked ? 'liked' : ''}`}
              onClick={handleLike}
              disabled={!user}
            >
              <span className="tweet-action-icon"><IconHeart size={16} filled={liked} /></span>
              <span>{likeCount || ''}</span>
            </button>
            {user && comment.authorAddress === user.address && (
              <button
                className="comment-delete-btn"
                onClick={handleDelete}
              >
                Delete
              </button>
            )}
            {user && comment.authorAddress !== user.address && (
              <button
                className="comment-report-btn"
                onClick={() => requireVerified(() => setShowReportModal(true), 'Reporting')()}
              >
                Report
              </button>
            )}
          </div>
        </div>
      </div>

      {showReportModal && (
        <ReportModal
          targetType="comment"
          targetId={comment.id}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {/* Inline reply input */}
      {showReplyInput && !isReply && (
        <div className="reply-inline-form">
          <form onSubmit={handleSubmitReply} className="reply-composer" style={{ paddingLeft: 40 }}>
            <Avatar address={user?.address} size={24} avatarUrl={user?.avatarUrl} />
            <MentionInput
              className="reply-input"
              placeholder="Write a reply..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              readOnly={isReadOnly}
              rows={1}
            />
            <Button
              type="submit"
              size="sm" className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold"
              disabled={!replyText.trim()}
            >
              Reply
            </Button>
          </form>
        </div>
      )}

      {/* Show replies toggle */}
      {!isReply && replyCount > 0 && (
        <Button variant="ghost" size="sm" className="rounded-full text-[var(--primary)] font-semibold ml-10" onClick={handleToggleReplies}>
          {showReplies ? 'Hide replies' : `Show ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
        </Button>
      )}

      {/* Threaded replies */}
      {showReplies && replies.length > 0 && (
        <div className="comment-replies">
          {replies.map(r => (
            <CommentItem
              key={r.id}
              comment={r}
              postId={postId}
              user={user}
              isReadOnly={isReadOnly}
              requireVerified={requireVerified}
              toast={toast}
              isReply={true}
              onDelete={(id) => {
                setReplies(prev => prev.filter(rep => rep.id !== id))
                setReplyCount(prev => Math.max(0, prev - 1))
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const COMMENT_PAGE_SIZE = 50

export default function CommentSection({ postId, user }) {
  const [comments, setComments] = useState([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const { isReadOnly, requireVerified } = useVerifiedAuth(user)
  const toast = useToast()

  useEffect(() => {
    getComments(postId, { limit: COMMENT_PAGE_SIZE }).then(data => {
      setComments(data)
      setHasMore(data.length >= COMMENT_PAGE_SIZE)
    }).catch(console.error)
  }, [postId])

  const loadMoreComments = async () => {
    if (loadingMore || !hasMore || comments.length === 0) return
    setLoadingMore(true)
    try {
      const lastId = comments[comments.length - 1].id
      const data = await getComments(postId, { cursor: lastId, limit: COMMENT_PAGE_SIZE })
      setComments(prev => [...prev, ...data])
      setHasMore(data.length >= COMMENT_PAGE_SIZE)
    } catch (err) {
      toast.error(err.message || 'Failed to load more comments')
    }
    setLoadingMore(false)
  }

  return (
    <div className="feed-cards">

      {/* Comments list */}
      {comments.map(c => (
        <CommentItem
          key={c.id}
          comment={c}
          postId={postId}
          user={user}
          isReadOnly={isReadOnly}
          requireVerified={requireVerified}
          toast={toast}
          isReply={false}
          onDelete={(id) => setComments(prev => prev.filter(cm => cm.id !== id))}
        />
      ))}

      {hasMore && comments.length > 0 && (
        <Button
          variant="ghost" onClick={loadMoreComments}
          disabled={loadingMore}
          className="w-full rounded-none text-[var(--primary)] font-semibold text-sm"
        >
          {loadingMore ? 'Loading...' : 'Load more comments'}
        </Button>
      )}
    </div>
  )
}
