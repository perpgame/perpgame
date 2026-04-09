import { useState, useRef } from 'react'

import { IconSearch } from './Icons'
import UserSearchInput from './UserSearchInput'
import { Button } from './ui/button'

export default function MobileSearch() {
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  const handleOpen = () => {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleClose = () => {
    setOpen(false)
  }

  return (
    <div className="mobile-search">
      {!open && (
        <Button variant="ghost" size="sm" onClick={handleOpen} aria-label="Search" className="rounded-full text-[var(--text)]">
          <IconSearch size={20} />
        </Button>
      )}
      {open && (
        <div className="mobile-search-bar">
          <UserSearchInput
            inputRef={inputRef}
            onSelect={handleClose}
            onEscape={handleClose}
          />
          <Button variant="ghost" size="sm" onClick={handleClose} className="rounded-full text-[var(--primary)] font-semibold">Cancel</Button>
        </div>
      )}
    </div>
  )
}
