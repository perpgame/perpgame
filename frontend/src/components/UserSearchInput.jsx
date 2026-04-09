import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchUsers } from '../api/backend'
import { getUserDisplayName, getUserHandle } from '../utils/user'
import { IconSearch } from './Icons'
import Avatar from './Avatar'
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover'
import { Command, CommandList, CommandGroup, CommandItem, CommandEmpty } from './ui/command'

export default function UserSearchInput({ inputRef: externalRef, onSelect, onEscape, className }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const debounceRef = useRef(null)
  const internalRef = useRef(null)
  const ref = externalRef || internalRef

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleChange = useCallback((e) => {
    const val = e.target.value
    setQuery(val)
    const q = val.trim()
    if (q.length >= 1) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        try {
          const users = await searchUsers(q, 5)
          setResults(users)
          setOpen(users.length > 0)
          setActiveIndex(0)
        } catch {
          setOpen(false)
        }
      }, 200)
    } else {
      setOpen(false)
      setResults([])
    }
  }, [])

  const selectUser = useCallback((u) => {
    setOpen(false)
    setResults([])
    setQuery('')
    if (onSelect) {
      onSelect(u)
    } else {
      navigate(`/profile/${u.username || u.address}`)
    }
  }, [navigate, onSelect])

  const handleKeyDown = (e) => {
    if (open && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(prev => (prev + 1) % results.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(prev => (prev - 1 + results.length) % results.length)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        selectUser(results[activeIndex])
        return
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      if (onEscape) onEscape()
      return
    }
    if (e.key === 'Enter' && query.trim()) {
      const q = query.trim()
      if (/^0x[a-fA-F0-9]{40}$/.test(q)) {
        setQuery('')
        setResults([])
        setOpen(false)
        navigate(`/profile/${q}`)
      } else if (/^[a-z0-9_]{1,20}$/.test(q)) {
        searchUsers(q, 1).then(users => {
          if (users.length > 0) {
            setQuery('')
            setResults([])
            setOpen(false)
            navigate(`/profile/${users[0].username || users[0].address}`)
          } else {
            setResults([])
            setOpen(false)
          }
        }).catch(() => {})
      }
    }
  }

  const handleFocus = () => {
    if (results.length > 0) setOpen(true)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={className} style={{ position: 'relative' }}>
          <div className="search-input-wrap">
            <span className="search-icon"><IconSearch size={16} /></span>
            <input
              ref={ref}
              className="search-input"
              placeholder="Search username or address"
              value={query}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              aria-label="Search users"
              autoComplete="off"
            />
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="p-0"
        style={{ width: 'var(--radix-popover-anchor-width)' }}
        onOpenAutoFocus={e => e.preventDefault()}
        onInteractOutside={() => setOpen(false)}
      >
        <Command shouldFilter={false}>
          <CommandList>
            {results.length === 0 && <CommandEmpty>No results</CommandEmpty>}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((u, i) => (
                  <CommandItem
                    key={u.address}
                    onSelect={() => selectUser(u)}
                    data-selected={i === activeIndex ? 'true' : undefined}
                  >
                    <Avatar address={u.address} size={28} avatarUrl={u.avatarUrl} />
                    <div className="mention-item-info" style={{ marginLeft: 8 }}>
                      <span className="mention-item-name">{getUserDisplayName(u)}</span>
                      <span className="mention-item-handle">{getUserHandle(u)}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
