import { useState } from 'react'

const TICKER_MAP = {
  KPEPE: 'PEPE',
  KBONK: 'BONK',
  KSHIB: 'SHIB',
  KFLOKI: 'FLOKI',
  KLUNC: 'LUNC',
}

function getIconUrl(coin) {
  const ticker = TICKER_MAP[coin] || coin.toUpperCase()
  return `https://cdn.jsdelivr.net/gh/madenix/Crypto-logo-cdn@main/Logos/${ticker}.svg`
}

// Deterministic color from coin name
function hashColor(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = str.charCodeAt(i) + ((h << 5) - h)
  }
  const hue = Math.abs(h) % 360
  return `hsl(${hue}, 55%, 55%)`
}

export default function CoinIcon({ coin, size = 20 }) {
  const [failed, setFailed] = useState(false)

  if (failed || !coin) {
    const letter = (coin || '?')[0].toUpperCase()
    return (
      <span
        className="coin-icon-fallback"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.48,
          background: hashColor(coin || ''),
        }}
      >
        {letter}
      </span>
    )
  }

  return (
    <img
      src={getIconUrl(coin)}
      alt={coin}
      width={size}
      height={size}
      className="coin-icon"
      onError={() => setFailed(true)}
    />
  )
}
