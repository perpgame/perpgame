import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { wagmiConfig } from './config/wagmi'
import '@rainbow-me/rainbowkit/styles.css'
import './index.css'
import './styles/trades.css'
import { ToastProvider } from './components/Toast'
import App from './App.jsx'

const queryClient = new QueryClient()

const appTheme = {
  ...darkTheme({
    accentColor: '#b5efdc',
    accentColorForeground: '#060a0e',
    borderRadius: 'large',
    fontStack: 'system',
    overlayBlur: 'small',
  }),
  colors: {
    ...darkTheme().colors,
    accentColor: '#b5efdc',
    accentColorForeground: '#060a0e',
    connectButtonBackground: '#0d1117',
    connectButtonInnerBackground: '#0d1117',
    connectButtonText: '#e7e9ea',
    modalBackground: '#0d1117',
    modalBorder: 'rgba(181, 239, 220, 0.1)',
    modalText: '#e7e9ea',
    modalTextDim: '#71767b',
    modalTextSecondary: '#71767b',
    generalBorder: 'rgba(181, 239, 220, 0.08)',
    generalBorderDim: 'rgba(181, 239, 220, 0.05)',
    menuItemBackground: 'rgba(181, 239, 220, 0.06)',
    actionButtonBorder: 'rgba(181, 239, 220, 0.1)',
    actionButtonSecondaryBackground: 'rgba(181, 239, 220, 0.08)',
    closeButton: '#71767b',
    closeButtonBackground: 'rgba(181, 239, 220, 0.06)',
    profileAction: '#0d1117',
    profileActionHover: 'rgba(181, 239, 220, 0.06)',
    profileForeground: '#0a0f14',
    selectedOptionBorder: 'rgba(181, 239, 220, 0.2)',
    error: '#f6465d',
    standby: '#b5efdc',
  },
  shadows: {
    connectButton: 'none',
    dialog: '0 8px 32px rgba(0, 0, 0, 0.5)',
    profileDetailsAction: 'none',
    selectedOption: '0 0 0 1px rgba(181, 239, 220, 0.15)',
    selectedWallet: '0 0 0 1px rgba(181, 239, 220, 0.15)',
    walletLogo: 'none',
  },
  fonts: {
    body: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={appTheme}>
          <BrowserRouter>
            <ToastProvider>
              <App />
            </ToastProvider>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
