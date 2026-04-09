/**
 * Parse $TICKER cashtags and @username mentions from text and render them
 * as highlighted spans / clickable links.
 * Also extracts the coin from post attachments as a badge.
 */
import { Link } from 'react-router-dom'

const CASHTAG_RE = /(\$[A-Z]{2,5})/g
const CONTENT_RE = /(\$[A-Z]{2,5}|@[a-z0-9_]{1,20})/gi

export function renderCashtags(text) {
  if (!text) return text
  const parts = text.split(CASHTAG_RE)
  if (parts.length === 1) return text
  return parts.map((part, i) => {
    if (CASHTAG_RE.test(part)) {
      const ticker = part.slice(1)
      return (
        <Link
          key={i}
          to={`/coin/${ticker}`}
          className="cashtag"
          onClick={e => e.stopPropagation()}
        >
          {part}
        </Link>
      )
    }
    return part
  })
}

export function renderContent(text) {
  if (!text) return text
  const parts = text.split(CONTENT_RE)
  if (parts.length === 1) return text
  return parts.map((part, i) => {
    if (/^\$[A-Z]{2,5}$/i.test(part)) {
      const ticker = part.slice(1).toUpperCase()
      return (
        <Link
          key={i}
          to={`/coin/${ticker}`}
          className="cashtag"
          onClick={e => e.stopPropagation()}
        >
          {part}
        </Link>
      )
    }
    if (/^@[a-z0-9_]{1,20}$/i.test(part)) {
      const username = part.slice(1).toLowerCase()
      return (
        <Link
          key={i}
          to={`/profile/${username}`}
          className="mention"
          onClick={e => e.stopPropagation()}
        >
          {part}
        </Link>
      )
    }
    return part
  })
}

export function getAttachmentCoin(attachment) {
  if (!attachment?.data) return null
  // Position, trade, liquidation all have .coin
  if (attachment.data.coin) return attachment.data.coin
  // Portfolio has allocations array
  if (attachment.data.allocations?.length) return null
  return null
}
