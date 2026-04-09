import { useAccount, useDisconnect, useSignMessage } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useState } from 'react'
import { Button } from './button'
import { login, getNonce, setSessionToken } from '../../api/backend'
import { buildSiweMessage } from '../../utils/siwe'

/**
 * Reusable verification gate — shown when user needs to sign in / verify.
 * Handles full wallet connect → sign → verify flow inline.
 */
export function AuthGate({ icon, title, subtitle, onVerified }) {
  const { address, isConnected, chain } = useAccount()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  const handleVerify = async () => {
    if (!address || !chain) return
    setSigning(true)
    setError('')
    try {
      const { nonce } = await getNonce()
      const message = buildSiweMessage(address, chain.id, nonce)
      const signature = await signMessageAsync({ message })
      const data = await login(message, signature)
      if (data.token) setSessionToken(data.token)
      if (onVerified) onVerified(data.user)
    } catch (err) {
      setError(err.shortMessage || err.message || 'Verification failed')
      setSigning(false)
    }
  }

  return (
    <div className="profile-gate">
      {icon && <div className="profile-gate-icon">{icon}</div>}
      <h3 className="profile-gate-title">{title}</h3>
      <p className="profile-gate-subtitle">{subtitle}</p>

      {error && <p className="text-[var(--loss-red)] text-sm mt-2">{error}</p>}

      {isConnected && address ? (
        <div className="flex flex-col items-center gap-3 mt-6">
          <p className="text-sm text-[var(--text-secondary)]">
            Connected: {address.slice(0, 6)}...{address.slice(-4)}
          </p>
          <Button className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold" onClick={handleVerify} disabled={signing}>
            {signing ? 'Verifying...' : 'Verify Wallet'}
          </Button>
          <button className="text-xs text-[var(--text-secondary)] hover:text-[var(--text)]" onClick={() => { disconnect(); setError('') }}>
            Disconnect
          </button>
        </div>
      ) : (
        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => (
            <div {...(!mounted && { 'aria-hidden': true, style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' } })}>
              <Button className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold mt-6" onClick={openConnectModal}>
                Sign In
              </Button>
            </div>
          )}
        </ConnectButton.Custom>
      )}
    </div>
  )
}
