import { useRef, useCallback, useState, useEffect } from 'react'

const TILT_MAX = 12 // degrees
const GLOW_SIZE = 180 // px
const SPRING = 0.08

export default function WalletCard3D({ children, className = '', isActive, ...props }) {
  const cardRef = useRef(null)
  const glowRef = useRef(null)
  const rafRef = useRef(null)
  const target = useRef({ rx: 0, ry: 0, gx: 50, gy: 50 })
  const current = useRef({ rx: 0, ry: 0, gx: 50, gy: 50 })
  const [hovered, setHovered] = useState(false)

  const animate = useCallback(() => {
    const c = current.current
    const t = target.current

    c.rx += (t.rx - c.rx) * SPRING
    c.ry += (t.ry - c.ry) * SPRING
    c.gx += (t.gx - c.gx) * SPRING
    c.gy += (t.gy - c.gy) * SPRING

    const card = cardRef.current
    if (card) {
      card.style.transform =
        `perspective(600px) rotateX(${c.rx}deg) rotateY(${c.ry}deg) scale3d(1.02, 1.02, 1.02)`
    }

    const glow = glowRef.current
    if (glow) {
      glow.style.background =
        `radial-gradient(${GLOW_SIZE}px circle at ${c.gx}% ${c.gy}%, rgba(181,239,220,0.12), transparent 60%)`
    }

    rafRef.current = requestAnimationFrame(animate)
  }, [])

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    target.current.ry = (x - 0.5) * TILT_MAX
    target.current.rx = -(y - 0.5) * TILT_MAX
    target.current.gx = x * 100
    target.current.gy = y * 100
  }, [])

  const handleMouseEnter = useCallback(() => {
    setHovered(true)
    rafRef.current = requestAnimationFrame(animate)
  }, [animate])

  const handleMouseLeave = useCallback(() => {
    setHovered(false)
    target.current = { rx: 0, ry: 0, gx: 50, gy: 50 }
    // let spring settle then stop
    const settle = () => {
      const c = current.current
      c.rx += (0 - c.rx) * SPRING
      c.ry += (0 - c.ry) * SPRING
      c.gx += (50 - c.gx) * SPRING
      c.gy += (50 - c.gy) * SPRING

      const card = cardRef.current
      if (card) {
        card.style.transform =
          `perspective(600px) rotateX(${c.rx}deg) rotateY(${c.ry}deg) scale3d(1, 1, 1)`
      }
      const glow = glowRef.current
      if (glow) {
        glow.style.background =
          `radial-gradient(${GLOW_SIZE}px circle at ${c.gx}% ${c.gy}%, rgba(181,239,220,0), transparent 60%)`
      }

      if (Math.abs(c.rx) > 0.01 || Math.abs(c.ry) > 0.01) {
        rafRef.current = requestAnimationFrame(settle)
      } else {
        if (card) card.style.transform = ''
        cancelAnimationFrame(rafRef.current)
      }
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(settle)
  }, [])

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div
      className={`wallet-card-3d-wrap${isActive ? ' wallet-card-3d--active' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Animated mesh background */}
      <div className="wallet-card-3d-mesh" aria-hidden="true" />

      {/* Edge shimmer */}
      {isActive && <div className="wallet-card-3d-shimmer" aria-hidden="true" />}

      <div ref={cardRef} className={`wallet-card-3d ${className}`} {...props}>
        {/* Mouse-follow glow */}
        <div
          ref={glowRef}
          className="wallet-card-3d-glow"
          aria-hidden="true"
          style={{ opacity: hovered ? 1 : 0 }}
        />
        {children}
      </div>
    </div>
  )
}
