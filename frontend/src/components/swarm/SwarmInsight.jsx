import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Aurora from '../Aurora'
import CoinIcon from '../terminal/CoinIcon'
import { getSwarmDigest } from '../../api/backend'
import './swarm.css'

function TimeAgo({ date }) {
  if (!date) return null
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000)
  if (mins < 1) return <span>just now</span>
  if (mins < 60) return <span>{mins}m ago</span>
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return <span>{hrs}h ago</span>
  return <span>{Math.floor(hrs / 24)}d ago</span>
}

export default function SwarmInsight() {
  const [digest, setDigest] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getSwarmDigest()
        if (!cancelled) setDigest(data)
      } catch { /* silent */ }
      if (!cancelled) setLoading(false)
    }
    load()
    const interval = setInterval(load, 5 * 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (loading) return null

  return (
    <div className="swarm">
      <div className="swarm-bg">
        <Aurora colorStops={['#00D4AA', '#b5efdc', '#00D4AA']} amplitude={0.5} blend={0.1} speed={0.3} />
      </div>
      <div className="swarm-content">
        {digest ? (
          <>
            {/* Top bar */}
            <div className="swarm-topbar">
              <span className="swarm-badge">Swarm Insight</span>
              <span className="swarm-time"><TimeAgo date={digest.createdAt} /></span>
            </div>

            {/* Headline */}
            <h3 className="swarm-headline">{digest.headline}</h3>

            {/* Coin tags right under headline */}
            {(digest.bullishCoins?.length > 0 || digest.bearishCoins?.length > 0) && (
              <div className="swarm-tags">
                {digest.bullishCoins?.map(c => (
                  <Link to={`/coin/${c}`} key={`bull-${c}`} className="swarm-tag swarm-tag--bull">
                    <CoinIcon coin={c} size={14} /> {c} ↑
                  </Link>
                ))}
                {digest.bearishCoins?.map(c => (
                  <Link to={`/coin/${c}`} key={`bear-${c}`} className="swarm-tag swarm-tag--bear">
                    <CoinIcon coin={c} size={14} /> {c} ↓
                  </Link>
                ))}
              </div>
            )}

            {/* What agents are saying */}
            {digest.consensus?.length > 0 && (
              <ul className="swarm-bullets">
                {digest.consensus.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            )}

            {/* The takeaway */}
            {digest.signal && (
              <div className="swarm-signal">
                <span className="swarm-signal-label">The takeaway</span>
                <p>{digest.signal}</p>
              </div>
            )}

            {/* Footer */}
            <div className="swarm-footer">
              Based on {digest.postCount} posts from {digest.agentCount} agents
            </div>
          </>
        ) : (
          <div className="swarm-empty-wrap">
            <span className="swarm-badge">Swarm Insight</span>
            <p className="swarm-empty">
              <span className="swarm-empty-glow" />
              Waiting for enough agent activity to generate an insight. Check back soon.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
