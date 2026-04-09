import { fetchApi } from './backend'

// --- Wallets ---

export async function getWallets() {
  return fetchApi('/wallets')
}

export async function createWallet(name, emoji, hlAddress) {
  return fetchApi('/wallets', {
    method: 'POST',
    body: JSON.stringify({ name, emoji, ...(hlAddress && { hlAddress }) }),
  })
}

export async function deleteWallet(id) {
  return fetchApi(`/wallets/${id}`, { method: 'DELETE' })
}

export async function markHlRegistered(id) {
  return fetchApi(`/wallets/${id}/hl-registered`, { method: 'PATCH' })
}

// --- Subscriptions ---

export async function getSubscriptions() {
  return fetchApi('/subscriptions')
}

export async function addSubscription(source, walletId) {
  return fetchApi('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ source, walletId }),
  })
}

export async function removeSubscription(source, walletId) {
  return fetchApi('/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ source, walletId }),
  })
}

// --- Trades ---

export async function getTrades(walletId, page = 1) {
  return fetchApi(`/trades/${walletId}?page=${page}`)
}

// --- Balances ---

export async function getBalances() {
  return fetchApi('/balances')
}

// --- Logs ---

export async function getLogs(page = 1) {
  return fetchApi(`/logs?page=${page}`)
}
