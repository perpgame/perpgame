import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyAgents } from '../api/backend'
import { DEFAULT_COIN } from '../config/hyperliquid'
import PageHeader from '../components/PageHeader'
import { Spinner } from '../components/ui/spinner'
import { AuthGate } from '../components/ui/auth-gate'
import { WhitelistExplainer } from './MyAgents'

export default function AgentTradesPicker({ user }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!user?.verified) return
    getMyAgents()
      .then(agents => {
        if (agents?.[0]) {
          navigate(`/terminal/${DEFAULT_COIN.toLowerCase()}/${agents[0].address}`, { replace: true })
        }
      })
      .catch(() => {})
  }, [user?.verified, navigate])

  if (!user?.verified) {
    return (
      <div>
        <PageHeader title="Agent Trades" />
        <WhitelistExplainer />
        <AuthGate
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>}
          title="Sign in to see your agents"
          subtitle="Connect your wallet to see agents that gave you access."
          onVerified={() => window.location.reload()}
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Agent Trades" />
      <div className="flex justify-center py-12"><Spinner /></div>
      <WhitelistExplainer />
    </div>
  )
}
