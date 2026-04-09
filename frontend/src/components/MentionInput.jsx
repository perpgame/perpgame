import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { searchUsers } from '../api/backend'
import Avatar from './Avatar'

const MentionInput = forwardRef(function MentionInput({
  value,
  onChange,
  inputType = 'textarea',
  className,
  ...rest
}, ref) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [results, setResults] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [mentionQuery, setMentionQuery] = useState(null)
  const [mentionStart, setMentionStart] = useState(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const debounceRef = useRef(null)

  useImperativeHandle(ref, () => inputRef.current, [])

  const detectMention = useCallback((text, cursorPos) => {
    const before = text.slice(0, cursorPos)
    const match = before.match(/@([a-z0-9_]{0,20})$/i)
    if (match) {
      setMentionStart(cursorPos - match[0].length)
      return match[1]
    }
    return null
  }, [])

  const handleChange = useCallback((e) => {
    const newValue = e.target.value
    onChange(e)

    const cursorPos = e.target.selectionStart
    const query = detectMention(newValue, cursorPos)

    if (query !== null && query.length >= 1) {
      setMentionQuery(query)
      const el = inputRef.current
      if (el) {
        // Position below the current line of text, not the full textarea
        const style = window.getComputedStyle(el)
        const lineHeight = parseInt(style.lineHeight) || parseInt(style.fontSize) * 1.4
        const paddingTop = parseInt(style.paddingTop) || 0
        const lines = el.value.slice(0, cursorPos).split('\n').length
        setDropdownPos({
          top: paddingTop + lines * lineHeight + 4,
          left: 0,
        })
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        try {
          const users = await searchUsers(query, 5)
          setResults(users)
          setShowDropdown(users.length > 0)
          setActiveIndex(0)
        } catch {
          setShowDropdown(false)
        }
      }, 200)
    } else {
      setShowDropdown(false)
      setResults([])
      setMentionQuery(null)
    }
  }, [onChange, detectMention])

  const selectUser = useCallback((user) => {
    const el = inputRef.current
    if (!el || mentionStart === null) return

    const before = value.slice(0, mentionStart)
    const after = value.slice(el.selectionStart)
    const newValue = `${before}@${user.username} ${after}`

    const syntheticEvent = { target: { value: newValue } }
    onChange(syntheticEvent)

    setShowDropdown(false)
    setResults([])
    setMentionQuery(null)

    requestAnimationFrame(() => {
      const pos = mentionStart + user.username.length + 2
      el.setSelectionRange(pos, pos)
      el.focus()
    })
  }, [value, onChange, mentionStart])

  const handleKeyDown = useCallback((e) => {
    if (!showDropdown || results.length === 0) {
      if (rest.onKeyDown) rest.onKeyDown(e)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(prev => (prev + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(prev => (prev - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      selectUser(results[activeIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setShowDropdown(false)
    } else {
      if (rest.onKeyDown) rest.onKeyDown(e)
    }
  }, [showDropdown, results, activeIndex, selectUser, rest])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    if (!showDropdown) return
    const item = dropdownRef.current?.children[activeIndex]
    if (item) item.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, showDropdown])

  const Tag = inputType === 'input' ? 'input' : 'textarea'

  return (
    <div className="mention-input-wrapper" style={{ position: 'relative' }}>
      <Tag
        ref={inputRef}
        className={className}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        {...Object.fromEntries(
          Object.entries(rest).filter(([k]) => k !== 'onKeyDown')
        )}
      />
      {showDropdown && (
        <div className="mention-dropdown" ref={dropdownRef} style={{ top: dropdownPos.top, left: dropdownPos.left }}>
          {results.map((user, i) => (
            <div
              key={user.address}
              className={`mention-item ${i === activeIndex ? 'mention-item-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                selectUser(user)
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <Avatar address={user.address} size={28} avatarUrl={user.avatarUrl} />
              <div className="mention-item-info">
                <span className="mention-item-name">
                  {user.displayName || user.username}
                </span>
                <span className="mention-item-handle">@{user.username}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

export default MentionInput
