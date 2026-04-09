import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'

import { getConversations, getMessages, sendMessage, markMessagesRead, searchUsers } from '../api/backend'
import { formatTime } from '../store/localStorage'
import { getUserDisplayName } from '../utils/user'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { ConversationListSkeleton } from '../components/Skeleton'
import { AuthGate } from '../components/ui/auth-gate'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'

const PAGE_SIZE = 50

function convUser(conv) {
  return { displayName: conv.otherDisplayName, username: conv.otherUsername, address: conv.otherAddress }
}

export default function Messages({ user, onLogout }) {
  if (!user?.verified) {
    return (
      <div>
        <PageHeader title="Messages" />
        <AuthGate
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
          title="Sign in to see messages"
          subtitle="Connect and verify your wallet to send and receive direct messages."
          onAction={onLogout}
        />
      </div>
    )
  }

  return <MessagesContent user={user} />
}

function MessagesContent({ user }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [composing, setComposing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const pollRef = useRef(null)
  const inputRef = useRef(null)
  const activeConvRef = useRef(null)
  activeConvRef.current = activeConversation

  useEffect(() => {
    async function load() {
      try {
        const data = await getConversations({ limit: PAGE_SIZE })
        setConversations(data)
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [])

  const openConversation = useCallback(async (conv) => {
    setActiveConversation(conv)
    setComposing(false)
    setMessagesLoading(true)
    setMessages([])
    setHasMoreMessages(true)
    try {
      const data = await getMessages(conv.id, { limit: PAGE_SIZE })
      setMessages(data)
      setHasMoreMessages(data.length >= PAGE_SIZE)
      markMessagesRead(conv.id).catch(() => {})
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c))
    } catch { /* ignore */ }
    setMessagesLoading(false)
  }, [])

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (activeConversation && !messagesLoading && inputRef.current) {
      inputRef.current.focus()
    }
  }, [activeConversation, messagesLoading])

  useEffect(() => {
    if (!activeConversation?.id) return
    const convId = activeConversation.id
    const interval = 5000
    pollRef.current = setInterval(async () => {
      try {
        const data = await getMessages(convId, { limit: PAGE_SIZE })
        setMessages(data)
        markMessagesRead(convId).catch(() => {})
      } catch { /* ignore */ }
    }, interval)
    return () => clearInterval(pollRef.current)
  }, [activeConversation, wsConnected])

  const loadMore = useCallback(async () => {
    if (!activeConversation || messagesLoading || !hasMoreMessages || messages.length === 0) return
    const firstId = messages[0].id
    try {
      const data = await getMessages(activeConversation.id, { cursor: firstId, limit: PAGE_SIZE })
      setMessages(prev => [...data, ...prev])
      setHasMoreMessages(data.length >= PAGE_SIZE)
    } catch { /* ignore */ }
  }, [activeConversation, messagesLoading, hasMoreMessages, messages])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeConversation || sending) return
    setSending(true)
    try {
      const msg = await sendMessage(activeConversation.otherAddress, input.trim())
      setMessages(prev => [...prev, msg])
      setInput('')
      setConversations(prev => {
        const updated = prev.map(c =>
          c.id === activeConversation.id
            ? { ...c, lastMessage: input.trim(), lastMessageAt: msg.createdAt }
            : c
        )
        updated.sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt))
        return updated
      })
    } catch { /* ignore */ }
    setSending(false)
  }, [input, activeConversation, sending])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  useEffect(() => {
    if (!composing || searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchUsers(searchQuery, 10)
        if (!cancelled) setSearchResults(results.filter(u => u.address !== user.address))
      } catch { /* ignore */ }
      if (!cancelled) setSearching(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [searchQuery, composing, user.address])

  const startConversation = useCallback(async (otherUser) => {
    setComposing(false)
    setSearchQuery('')
    setSearchResults([])
    const existing = conversations.find(c => c.otherAddress === otherUser.address)
    if (existing) {
      openConversation(existing)
      return
    }
    const tempConv = {
      id: null,
      otherAddress: otherUser.address,
      otherUsername: otherUser.username,
      otherDisplayName: otherUser.displayName,
      otherAvatarUrl: otherUser.avatarUrl,
      lastMessage: null,
      lastMessageAt: null,
      unreadCount: 0,
      createdAt: new Date().toISOString(),
    }
    setActiveConversation(tempConv)
    setMessages([])
    setHasMoreMessages(false)
    setMessagesLoading(false)
  }, [conversations, openConversation])

  const handleSendNew = useCallback(async () => {
    if (!input.trim() || !activeConversation || sending) return
    setSending(true)
    try {
      const msg = await sendMessage(activeConversation.otherAddress, input.trim())
      setMessages([msg])
      setInput('')
      const convs = await getConversations({ limit: PAGE_SIZE })
      setConversations(convs)
      const newConv = convs.find(c => c.otherAddress === activeConversation.otherAddress)
      if (newConv) setActiveConversation(newConv)
    } catch { /* ignore */ }
    setSending(false)
  }, [input, activeConversation, sending])

  const onSend = activeConversation?.id ? handleSend : handleSendNew

  const goBack = () => {
    setActiveConversation(null)
    setComposing(false)
  }

  const otherName = activeConversation
    ? getUserDisplayName(convUser(activeConversation))
    : ''

  const otherHandle = activeConversation?.otherUsername
    ? `@${activeConversation.otherUsername}`
    : activeConversation ? getUserDisplayName(convUser(activeConversation)) : ''

  // Thread view
  if (activeConversation) {
    return (
      <div className="flex flex-col h-[calc(100vh-60px)] max-md:h-[calc(100vh-120px)] max-sm:h-[calc(100dvh-52px)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--separator)] bg-[var(--bg)] sticky top-0 z-10">
          <Button variant="ghost" size="sm" onClick={goBack} className="rounded-full text-[var(--text)] shrink-0">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
          </Button>
          <Link to={`/profile/${activeConversation.otherAddress}`} className="flex items-center gap-3 min-w-0 no-underline text-[var(--text)] hover:opacity-80 transition-opacity">
            <Avatar address={activeConversation.otherAddress} size={36} avatarUrl={activeConversation.otherAvatarUrl} />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold leading-tight truncate">{otherName}</span>
              <span className="text-xs text-[var(--text-third)] leading-tight">{otherHandle}</span>
            </div>
          </Link>
        </div>

        {/* Messages body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1" ref={messagesContainerRef}>
          {hasMoreMessages && messages.length > 0 && (
            <button
              onClick={loadMore}
              className="self-center text-xs text-[var(--primary)] font-semibold py-2 px-4 rounded-full bg-[var(--primary-faded)] hover:bg-[var(--primary-faded2)] transition-colors mb-3 cursor-pointer"
            >
              Load older messages
            </button>
          )}
          {messagesLoading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--separator)] border-t-[var(--primary)] rounded-full animate-spin" />
            </div>
          )}
          {!messagesLoading && messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
              <Avatar address={activeConversation.otherAddress} size={56} avatarUrl={activeConversation.otherAvatarUrl} />
              <div className="text-base font-bold text-[var(--text)]">{otherName}</div>
              <div className="text-xs text-[var(--text-third)]">Send a message to start the conversation</div>
            </div>
          )}
          {messages.map((msg, i) => {
            const isSent = msg.senderAddress === user.address
            const prevMsg = messages[i - 1]
            const sameSender = prevMsg && prevMsg.senderAddress === msg.senderAddress
            const timeDiff = prevMsg ? (new Date(msg.createdAt) - new Date(prevMsg.createdAt)) / 60000 : Infinity
            const grouped = sameSender && timeDiff < 2
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isSent ? 'items-end' : 'items-start'} ${grouped ? 'mt-px' : 'mt-2'} animate-[msg-in_0.15s_ease-out]`}
              >
                <div
                  className={`max-w-[65%] max-sm:max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    isSent
                      ? `bg-[var(--primary)] text-[#060a0e] rounded-2xl rounded-br-md ${grouped ? 'rounded-tr-md' : ''}`
                      : `bg-[var(--surface)] text-[var(--text)] border border-[var(--separator)] rounded-2xl rounded-bl-md ${grouped ? 'rounded-tl-md' : ''}`
                  }`}
                >
                  {msg.content}
                </div>
                {!grouped && (
                  <span className={`text-[10px] text-[var(--text-third)] mt-1 px-1 ${isSent ? 'text-right' : ''}`}>
                    {formatTime(msg.createdAt)}
                  </span>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="flex items-end gap-2.5 px-4 py-3 border-t border-[var(--separator)] bg-[var(--bg)] max-sm:pb-[calc(12px+72px+env(safe-area-inset-bottom,0px))]">
          <textarea
            ref={inputRef}
            className="flex-1 px-3.5 py-2.5 rounded-[var(--card-radius)] border border-[var(--separator)] bg-[var(--surface)] text-[var(--text)] text-sm resize-none outline-none max-h-[120px] leading-relaxed transition-colors placeholder:text-[var(--text-third)] focus:border-[var(--primary)]"
            placeholder="Type a message..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={2000}
          />
          <Button
            className="rounded-full bg-[var(--primary)] text-[#060a0e] shrink-0"
            onClick={onSend}
            disabled={!input.trim() || sending}
            size="sm"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </Button>
        </div>
      </div>
    )
  }

  // Conversation list view
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--page-gutter)] py-3 sticky top-0 bg-[var(--bg)] z-10 border-b border-[var(--separator)] max-sm:top-[52px]">
        <h2 className="text-lg font-bold text-[var(--text)] m-0">Messages</h2>
        <Button
          variant="ghost" size="sm"
          onClick={() => setComposing(!composing)}
          aria-label="New message"
          className="rounded-full text-[var(--text)]"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </Button>
      </div>

      {/* Compose search */}
      {composing && (
        <Card className="mx-[var(--page-gutter)] mt-2 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--separator)]">
            <span className="text-xs font-semibold text-[var(--text-secondary)] shrink-0">To:</span>
            <input
              className="flex-1 bg-transparent text-[var(--text)] text-sm outline-none placeholder:text-[var(--text-third)]"
              placeholder="Search by username..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          {searching && <div className="px-3 py-3 text-xs text-[var(--text-third)]">Searching...</div>}
          {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="px-3 py-3 text-xs text-[var(--text-third)]">No users found</div>
          )}
          {searchResults.map(u => (
            <div
              key={u.address}
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
              onClick={() => startConversation(u)}
            >
              <Avatar address={u.address} size={36} avatarUrl={u.avatarUrl} />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-[var(--text)] truncate">{getUserDisplayName(u)}</span>
                {u.username && <span className="text-xs text-[var(--text-third)]">@{u.username}</span>}
              </div>
            </div>
          ))}
        </Card>
      )}

      {loading && <ConversationListSkeleton />}

      {!loading && conversations.length === 0 && !composing && (
        <EmptyState
          title="No messages yet"
          subtitle="Start a conversation by clicking the compose button."
        />
      )}

      {/* Conversation list */}
      <div className="flex flex-col gap-0.5 px-[var(--page-gutter)] mt-1">
        {!loading && conversations.map(conv => (
          <div
            key={conv.id}
            className={`flex items-center gap-3 px-3 py-3 rounded-[var(--card-radius)] cursor-pointer transition-colors ${
              conv.unreadCount > 0
                ? 'bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                : 'hover:bg-[var(--surface-hover)]'
            }`}
            onClick={() => openConversation(conv)}
          >
            <Avatar address={conv.otherAddress} size={44} avatarUrl={conv.otherAvatarUrl} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-[var(--text)]' : 'font-semibold text-[var(--text)]'}`}>
                  {getUserDisplayName(convUser(conv))}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {conv.unreadCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-[var(--primary)] shadow-[0_0_6px_rgba(181,239,220,0.4)]" />
                  )}
                  {conv.lastMessageAt && (
                    <span className="text-[11px] text-[var(--text-third)]">{formatTime(conv.lastMessageAt)}</span>
                  )}
                </span>
              </div>
              {conv.lastMessage && (
                <p className={`text-xs mt-0.5 truncate leading-snug m-0 ${
                  conv.unreadCount > 0 ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-third)]'
                }`}>
                  {conv.lastMessage}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
