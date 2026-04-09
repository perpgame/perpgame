import { useState, useEffect } from 'react'

import { getPoints as apiGetPoints, verifyHlReferral } from '../api/backend'
import { useVerifiedAuth } from '../hooks/useVerifiedAuth'
import { useToast } from '../components/Toast'
import { POINT_VALUES } from '../engine/points'
import PageHeader from '../components/PageHeader'
import { AuthGate } from '../components/ui/auth-gate'
import { Button } from '../components/ui/button'

export default function Points({ user, onLogout }) {
  if (!user?.verified) {
    return (
      <div>
        <PageHeader title="Points" />
        <AuthGate
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
          title="Sign in to earn points"
          subtitle="Connect and verify your wallet to earn points, invite friends, and unlock rewards."
          onAction={onLogout}
        />
      </div>
    )
  }

  return <PointsContent user={user} />
}

function PointsContent({ user }) {
  const [points, setPointsState] = useState({ total: 0, account: 0, invites: 0, hlReferral: 0, inviteCount: 0, hlReferralVerified: false, referralCode: '' })
  const [copied, setCopied] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const { isReadOnly, requireVerified } = useVerifiedAuth(user)
  const toast = useToast()

  useEffect(() => {
    apiGetPoints().then(setPointsState).catch(err => toast.error(err.message || 'Failed to load points'))
  }, [])

  const refreshPoints = async () => {
    try {
      const pts = await apiGetPoints()
      setPointsState(pts)
    } catch (e) {
      console.error(e)
    }
  }

  const referralUrl = `https://perpgame.xyz/?ref=${points.referralCode}`

  const handleCopy = requireVerified(() => {
    navigator.clipboard.writeText(referralUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, 'Copying referral link')

  const handleVerify = requireVerified(async () => {
    setVerifying(true)
    setVerifyError('')
    try {
      const result = await verifyHlReferral()
      if (result.verified) {
        await refreshPoints()
      } else {
        setVerifyError(result.message || 'Referral code "PERPGAME" not found on your HyperLiquid account.')
      }
    } catch {
      setVerifyError('Failed to verify. Please try again.')
    }
    setVerifying(false)
  }, 'Verifying referral')

  return (
    <div>

      {isReadOnly && (
        <div className="read-only-banner">
          <span className="badge-read-only">Read-only</span>
          <span>Verify your wallet to earn points and unlock all actions.</span>
        </div>
      )}

      <div className="page-hero" style={{ flexDirection: 'column' }}>
        <span className="page-hero-badge">Season 1</span>
        <div className="page-hero-value page-hero-value--xl">{points.total.toLocaleString()}</div>
        <div className="page-hero-sublabel">Total Points</div>
      </div>

      <div className="points-actions">
        {/* Create Account */}
        <div className="points-action-card">
          <div className="points-action-header">
            <span className="points-action-title">Create Account</span>
            {points.account > 0
              ? <span className="points-action-done">Done</span>
              : <span className="points-action-pts">{POINT_VALUES.account} pts</span>
            }
          </div>
          <div className="points-action-body">
            <p className="points-action-desc">Sign up for PerpGame to earn your first points.</p>
          </div>
        </div>

        {/* Invite Friends */}
        <div className="points-action-card">
          <div className="points-action-header">
            <span className="points-action-title">Invite Friends</span>
            <span className="points-action-pts">{POINT_VALUES.invite} pts each</span>
          </div>
          <div className="points-action-body">
            <p className="points-action-desc">Share your referral link. Earn {POINT_VALUES.invite} points for each friend who signs up.</p>
            {points.inviteCount > 0 && (
              <p className="points-action-count">{points.inviteCount} invite{points.inviteCount !== 1 ? 's' : ''} so far</p>
            )}
            <div className="points-action-referral-link">
              <span>{referralUrl}</span>
              <Button size="sm" className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
          </div>
        </div>

        {/* HL Referral */}
        <div className="points-action-card">
          <div className="points-action-header">
            <span className="points-action-title">Get a Fee Discount on HyperLiquid</span>
            {points.hlReferralVerified
              ? <span className="points-action-done">Done</span>
              : <span className="points-action-pts">{POINT_VALUES.hl_referral} pts</span>
            }
          </div>
          <div className="points-action-body">
            <p className="points-action-desc">
              Apply code <strong>PERPGAME</strong> for a fee discount. Place at least one trade, then verify.
            </p>
            {!points.hlReferralVerified && (
              <>
                <div className="points-action-buttons">
                  <Button
                    as="a"
                    href="https://app.hyperliquid.xyz/join/PERPGAME"
                    target="_blank"
                    rel="noopener noreferrer" variant="outline"
                    className="rounded-full border-[var(--border)] text-[var(--text)] font-bold"
                  >
                    Apply Code
                  </Button>
                  <Button className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold"
                    onClick={handleVerify}
                    disabled={verifying}
                  >
                    {verifying ? 'Verifying...' : 'Verify'}
                  </Button>
                </div>
                {verifyError && <p className="points-action-error">{verifyError}</p>}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="points-airdrop">
        <div className="points-airdrop-title">About Season 1</div>
        <div className="points-airdrop-body">
          Earn points by completing actions on PerpGame. Points earned during Season 1 will be used to determine your allocation in the upcoming airdrop.
        </div>
        <div className="points-airdrop-disclaimer">
          Snapshot date TBA. Keep earning points to maximize your allocation.
        </div>
      </div>
    </div>
  )
}
