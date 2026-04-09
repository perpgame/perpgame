import { shortenAddress } from '../store/localStorage'

export function getUserDisplayName({ displayName, username, address }) {
  return displayName || username || shortenAddress(address)
}

export function getUserHandle({ username, address }) {
  return username ? `@${username}` : `@${address?.slice(2, 8)}`
}
