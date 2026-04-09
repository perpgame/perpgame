import { encode as encodeMsgpack } from '@msgpack/msgpack'
import { keccak256, parseSignature } from 'viem'
import { HL_TESTNET } from '../config/hyperliquid'

const toUint64Bytes = (n) => {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(n))
  return bytes
}

const concat = (...arrays) => {
  const total = arrays.reduce((sum, a) => sum + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

/** Build EIP-712 typed data for exchange actions (orders, leverage, cancel). */
export function buildExchangeTypedData(action, nonce) {
  const actionBytes = encodeMsgpack(action)
  const nonceBytes = toUint64Bytes(nonce)
  const vaultMarker = new Uint8Array([0])

  const hash = keccak256(concat(actionBytes, nonceBytes, vaultMarker))

  return {
    domain: {
      name: 'Exchange',
      version: '1',
      chainId: 1337,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    },
    primaryType: 'Agent',
    message: { source: HL_TESTNET ? 'b' : 'a', connectionId: hash },
  }
}

/** Build EIP-712 typed data for L1 actions (builder fee approval). */
export function buildL1TypedData({ action, types, primaryType }) {
  const { signatureChainId } = action

  return {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: parseInt(signatureChainId),
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: { [primaryType]: types },
    primaryType,
    message: action,
  }
}

/** Parse hex signature to { r, s, v } for HL API. */
export function parseSig(hexSig) {
  const { r, s, v } = parseSignature(hexSig)
  return { r, s, v: Number(v) }
}
