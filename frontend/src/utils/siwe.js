import { verifyMessage } from 'viem'

export function buildSiweMessage(address, chainId, nonce) {
  const domain = window.location.host
  const origin = window.location.origin
  const issuedAt = new Date().toISOString()

  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to PerpGame',
    '',
    `URI: ${origin}`,
    `Version: 1`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n')
}

export async function verifySiweSignature(message, signature, expectedAddress) {
  const valid = await verifyMessage({
    address: expectedAddress,
    message,
    signature,
  })
  return valid
}
