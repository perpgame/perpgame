import { useState, useEffect } from 'react'
import { getMyAgents } from '../api/backend'
import Avatar from './Avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu'

export default function AgentPickerBar({ currentAddress, onSelect }) {
  const [agents, setAgents] = useState([])

  useEffect(() => {
    getMyAgents().then(data => setAgents(data || [])).catch(() => {})
  }, [])

  if (agents.length === 0) return null

  const current = agents.find(a => a.address === currentAddress) || agents[0]

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto',
            padding: '4px 8px 4px 6px', borderRadius: 8,
            background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)',
          }}
        >
          <Avatar address={current.address} size={24} avatarUrl={current.avatarUrl} />
          <span style={{ fontSize: 'var(--font-sm)', fontWeight: 700 }}>
            {current.name || `${current.address.slice(0, 6)}...`}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {agents.map(a => {
          const active = a.address === currentAddress
          return (
            <DropdownMenuItem
              key={a.address}
              onClick={() => onSelect(a)}
              style={{ gap: 8, fontWeight: active ? 700 : 400, color: active ? 'var(--primary)' : undefined }}
            >
              <Avatar address={a.address} size={20} avatarUrl={a.avatarUrl} />
              {a.name || `${a.address.slice(0, 6)}...`}
              {active && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
