export const HL_TESTNET = import.meta.env.VITE_HL_TESTNET === 'true'

const HL_BASE = HL_TESTNET
  ? 'https://api.hyperliquid-testnet.xyz'
  : 'https://api.hyperliquid.xyz'

// In dev, proxy through Vite to avoid CORS
const isDev = import.meta.env.DEV
export const HL_API_URL = isDev ? '/hl-api/info' : `${HL_BASE}/info`
export const HL_EXCHANGE_URL = isDev ? '/hl-api/exchange' : `${HL_BASE}/exchange`
export const HL_WS_URL = isDev ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/hl-ws` : `${HL_BASE.replace('https', 'wss')}/ws`

export const HL_CHAIN = HL_TESTNET ? 'Testnet' : 'Mainnet'
export const HL_SIGNATURE_CHAIN_ID = HL_TESTNET ? '0x66eee' : '0xa4b1'

export const BUILDER_WALLET = '0xb2fed3acf6e30e0f1902a2b190c88c9a0a68edc3'
export const BUILDER_FEE_BPS = 50

export const CANDLE_INTERVALS = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1d' },
]

export const ORDER_TYPES = {
  MARKET: 'market',
  LIMIT: 'limit',
}

export const ORDER_SIDES = {
  BUY: 'buy',
  SELL: 'sell',
}

// Default candle lookback per interval (in ms)
export const CANDLE_LOOKBACK = {
  '1m': 4 * 60 * 60 * 1000,       // 4 hours
  '5m': 24 * 60 * 60 * 1000,      // 1 day
  '15m': 3 * 24 * 60 * 60 * 1000, // 3 days
  '1h': 7 * 24 * 60 * 60 * 1000,  // 7 days
  '4h': 30 * 24 * 60 * 60 * 1000, // 30 days
  '1d': 365 * 24 * 60 * 60 * 1000, // 1 year
}

export const DEFAULT_COIN = 'BTC'
export const DEFAULT_INTERVAL = '15m'
export const DEFAULT_LEVERAGE = 10
