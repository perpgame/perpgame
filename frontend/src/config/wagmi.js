import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { mainnet, arbitrum, arbitrumSepolia } from 'wagmi/chains'

const isTestnet = import.meta.env.VITE_HL_TESTNET === 'true'
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'PLACEHOLDER_PROJECT_ID'

export const wagmiConfig = getDefaultConfig({
  appName: 'PerpGame',
  projectId,
  chains: isTestnet ? [arbitrumSepolia, mainnet] : [arbitrum, mainnet],
})
