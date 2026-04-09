import { useState, useMemo, useRef, useEffect, useCallback } from 'react'

import { createPost } from '../api/backend'
import { getAttachmentCoin } from '../utils/cashtags'
import { useVerifiedAuth } from '../hooks/useVerifiedAuth'
import { useToast } from './Toast'
import { IconChart } from './Icons'
import Avatar from './Avatar'
import MentionInput from './MentionInput'
import AttachmentPicker from './AttachmentPicker'
import PostAttachment from './PostAttachment'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import { Button } from './ui/button'

const CASHTAG_RE = /\$([A-Z]{2,5})/g
const MAX_POST_LENGTH = 500

export default function PostComposer({ user, onPost }) {
  const [content, setContent] = useState('')
  const [focused, setFocused] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const { isReadOnly } = useVerifiedAuth(user)
  const toast = useToast()
  const inputRef = useRef(null)
  const emojiWrapRef = useRef(null)
  const emojiBtnRef = useRef(null)

  const insertEmoji = useCallback((emoji) => {
    const native = emoji.native
    if (!native) return
    const el = inputRef.current
    const pos = el ? el.selectionStart ?? content.length : content.length
    const newContent = content.slice(0, pos) + native + content.slice(pos)
    setContent(newContent)
    setShowEmojiPicker(false)
    requestAnimationFrame(() => {
      if (el) {
        const newPos = pos + native.length
        el.setSelectionRange(newPos, newPos)
        el.focus()
      }
    })
  }, [content])

  // Close picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return
    const handler = (e) => {
      if (emojiWrapRef.current?.contains(e.target)) return
      if (emojiBtnRef.current?.contains(e.target)) return
      setShowEmojiPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showEmojiPicker])

  const detectedCashtags = useMemo(() => {
    const matches = [...content.matchAll(CASHTAG_RE)].map(m => m[1])
    return [...new Set(matches)]
  }, [content])

  const handlePost = async () => {
    if (!content.trim() || content.length > MAX_POST_LENGTH) return
    try {
      const attachmentCoin = getAttachmentCoin(attachment)
      const allTags = [...new Set([...detectedCashtags, ...(attachmentCoin ? [attachmentCoin] : [])])]
      const newPost = await createPost({
        content: content.trim(),
        tags: allTags.length > 0 ? allTags : undefined,
        attachment: attachment || null,
      })
      setContent('')
      setAttachment(null)
      setFocused(false)
      if (onPost) onPost(newPost)
    } catch (err) {
      toast.error(err.message || 'Failed to create post')
    }
  }

  return (
    <div className={`composer ${isReadOnly ? 'composer-disabled' : ''}`}>
      <Avatar address={user.address} size={40} avatarUrl={user.avatarUrl} />
      <div className="composer-body">
        <MentionInput
          ref={inputRef}
          className="composer-input"
          placeholder={isReadOnly ? 'Verify your wallet to post' : "What's happening in perps?"}
          value={content}
          onChange={e => setContent(e.target.value)}
          onFocus={() => setFocused(true)}
          rows={focused ? 3 : 1}
          maxLength={MAX_POST_LENGTH}
          readOnly={isReadOnly}
        />
        {attachment && (
          <div className="composer-attachment-preview">
            <button className="composer-attachment-remove" onClick={() => setAttachment(null)}>&times;</button>
            <PostAttachment attachment={attachment} size="compact" />
          </div>
        )}
        <div className="composer-footer">
          <div className="composer-footer-left">
            <div className="composer-detected-tags">
              {detectedCashtags.map(tag => (
                <span key={tag} className="composer-detected-tag">${tag}</span>
              ))}
            </div>
            {!attachment && (
              <div className="composer-emoji-wrap">
                <button
                  type="button"
                  className="composer-emoji-btn"
                  onClick={() => { setShowAttachmentPicker(prev => !prev); setShowEmojiPicker(false) }}
                  aria-label="Attach trading data"
                >
                  <IconChart size={20} />
                </button>
                {showAttachmentPicker && (
                  <div className="composer-attach-picker">
                    <AttachmentPicker
                      address={user.address}
                      onAttach={(att) => { setAttachment(att); setShowAttachmentPicker(false) }}
                      onClose={() => setShowAttachmentPicker(false)}
                      inline
                    />
                  </div>
                )}
              </div>
            )}
            <div className="composer-emoji-wrap" ref={emojiWrapRef}>
              <button
                ref={emojiBtnRef}
                type="button"
                className="composer-emoji-btn"
                onClick={() => { setShowEmojiPicker(prev => !prev); setShowAttachmentPicker(false) }}
                aria-label="Add emoji"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </button>
              {showEmojiPicker && (
                <div className="composer-emoji-picker">
                  <Picker
                    data={data}
                    onEmojiSelect={insertEmoji}
                    theme="dark"
                    set="native"
                    previewPosition="none"
                    skinTonePosition="search"
                    perLine={8}
                  />
                </div>
              )}
            </div>
          </div>
          {content.length > MAX_POST_LENGTH * 0.8 && (
            <span className="composer-char-count" style={{
              fontSize: 13,
              color: content.length >= MAX_POST_LENGTH ? 'var(--loss-red)' : 'var(--text-secondary)',
            }}>
              {content.length}/{MAX_POST_LENGTH}
            </span>
          )}
          <Button disabled={!content.trim() || content.length > MAX_POST_LENGTH}
            onClick={handlePost}
            className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold text-[15px] px-5"
          >
            Post
          </Button>
        </div>
      </div>
    </div>
  )
}
