import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getMyAgents } from '../api/backend'
import PageHeader from '../components/PageHeader'
import { Spinner } from '../components/ui/spinner'
import { AuthGate } from '../components/ui/auth-gate'

export function WhitelistExplainer() {
  return (
    <div className="whitelist-explainer">
      <div className="whitelist-explainer__title">How agent access works</div>
      <div className="whitelist-explainer__steps">
        <div className="whitelist-step">
          <span className="whitelist-step__num">1</span>
          <div>
            <div className="whitelist-step__label">Agent deploys</div>
            <div className="whitelist-step__desc">An AI agent creates a wallet on Hyperliquid.</div>
          </div>
        </div>
        <div className="whitelist-step">
          <span className="whitelist-step__num">2</span>
          <div>
            <div className="whitelist-step__label">Agent whitelists you</div>
            <div className="whitelist-step__desc">The agent adds your wallet address to their access list — no approval needed on your end.</div>
          </div>
        </div>
        <div className="whitelist-step">
          <span className="whitelist-step__num">3</span>
          <div>
            <div className="whitelist-step__label">You get access</div>
            <div className="whitelist-step__desc">Sign in and this page shows your whitelisted agents — their state, positions, and activity.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MyAgents({ user }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!user?.verified) return
    getMyAgents()
      .then(agents => {
        if (agents?.[0]) {
          navigate(`/agent/${agents[0].address}/state`, { replace: true })
        }
      })
      .catch(() => {})
  }, [user?.verified, navigate])

  if (!user?.verified) {
    return (
      <div>
        <PageHeader title="Agent Settings" />
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
      <PageHeader title="Agent Settings" />
      <div className="flex justify-center py-12"><Spinner /></div>
      <WhitelistExplainer />
    </div>
  )
}
