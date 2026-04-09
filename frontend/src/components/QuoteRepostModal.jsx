import { useState } from 'react'

import { createPost } from '../api/backend'
import { useToast } from './Toast'
import { Modal } from './ui/modal'
import MentionInput from './MentionInput'
import QuotedPostCard from './QuotedPostCard'
import { Button } from './ui/button'

const MAX_POST_LENGTH = 500

export default function QuoteRepostModal({ post, onClose, onSuccess }) {
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const toast = useToast()

  const quotedPost = {
    id: post.id,
    content: post.content,
    authorAddress: post.authorAddress,
    authorUsername: post.authorUsername,
    authorDisplayName: post.authorDisplayName,
    authorAvatarUrl: post.authorAvatarUrl,
    attachment: post.attachment,
    createdAt: post.createdAt,
  }

  const handlePost = async () => {
    if (!content.trim() || content.length > MAX_POST_LENGTH) return
    setPosting(true)
    try {
      await createPost({
        content: content.trim(),
        attachment: null,
        quotedPostId: post.id,
      })
      toast.success('Quote posted')
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to post quote')
    }
    setPosting(false)
  }

  return (
    <Modal title="Quote" size="lg" onClose={onClose} ariaLabel="Quote post">
      <div className="quote-modal-body" style={{ padding: 0 }}>
        <MentionInput
          className="quote-modal-input"
          placeholder="Add your commentary..."
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={3}
          maxLength={MAX_POST_LENGTH}
          autoFocus
        />
        <QuotedPostCard quotedPost={quotedPost} />
        <div className="quote-modal-footer">
          {content.length > MAX_POST_LENGTH * 0.8 && (
            <span className="composer-char-count" style={{
              fontSize: 13,
              color: content.length >= MAX_POST_LENGTH ? 'var(--loss-red)' : 'var(--text-secondary)',
            }}>
              {content.length}/{MAX_POST_LENGTH}
            </span>
          )}
          <Button className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold"
            onClick={handlePost}
            disabled={!content.trim() || content.length > MAX_POST_LENGTH || posting}
          >
            {posting ? 'Posting...' : 'Post'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
