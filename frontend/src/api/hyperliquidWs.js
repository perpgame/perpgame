import { HL_WS_URL } from '../config/hyperliquid'

let ws = null
let reconnectTimer = null
let pingTimer = null
let subscriptions = new Map() // id -> { channel, params, callback }
let subIdCounter = 0
let connected = false
let connecting = false

function getWs() {
  if (ws && connected) return ws
  if (connecting) return null
  connect()
  return null
}

function connect() {
  if (connecting || connected) return
  connecting = true

  ws = new WebSocket(HL_WS_URL)

  ws.onopen = () => {
    connected = true
    connecting = false
    clearTimeout(reconnectTimer)

    // Re-subscribe all active subscriptions
    for (const [, sub] of subscriptions) {
      sendSubscribe(sub.channel, sub.params)
    }

    // Start keepalive ping
    startPing()
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.channel === 'pong') return

      // Route to matching subscribers
      for (const [, sub] of subscriptions) {
        if (sub.channel === msg.channel) {
          // Check if params match (e.g. coin)
          if (matchesSubscription(sub, msg)) {
            sub.callback(msg.data)
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  ws.onclose = () => {
    connected = false
    connecting = false
    stopPing()
    scheduleReconnect()
  }

  ws.onerror = () => {
    connected = false
    connecting = false
    stopPing()
    if (ws) {
      try { ws.close() } catch { /* ignore */ }
    }
    scheduleReconnect()
  }
}

function matchesSubscription(sub, msg) {
  // For candle channel, match coin + interval
  if (sub.channel === 'candle' && msg.data?.s) {
    return msg.data.s === sub.params.coin
  }
  // For l2Book, match coin
  if (sub.channel === 'l2Book' && msg.data?.coin) {
    return msg.data.coin === sub.params.coin
  }
  // For trades, match coin
  if (sub.channel === 'trades' && Array.isArray(msg.data)) {
    return true // trades come with coin in each trade
  }
  // allMids always matches
  if (sub.channel === 'allMids') return true
  return true
}

function sendSubscribe(channel, params) {
  if (!ws || !connected) return
  const msg = { method: 'subscribe', subscription: { type: channel, ...params } }
  ws.send(JSON.stringify(msg))
}

function sendUnsubscribe(channel, params) {
  if (!ws || !connected) return
  const msg = { method: 'unsubscribe', subscription: { type: channel, ...params } }
  ws.send(JSON.stringify(msg))
}

function startPing() {
  stopPing()
  pingTimer = setInterval(() => {
    if (ws && connected) {
      ws.send(JSON.stringify({ method: 'ping' }))
    }
  }, 15000)
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer)
  // Only reconnect if there are active subscriptions
  if (subscriptions.size > 0) {
    reconnectTimer = setTimeout(() => connect(), 3000)
  }
}

export function subscribe(channel, params, callback) {
  const id = ++subIdCounter
  subscriptions.set(id, { channel, params: params || {}, callback })

  // Connect and subscribe
  if (connected) {
    sendSubscribe(channel, params)
  } else {
    getWs() // triggers connect
  }

  // Return unsubscribe function
  return () => {
    const sub = subscriptions.get(id)
    if (sub) {
      subscriptions.delete(id)
      // Only unsubscribe from WS if no other subs for same channel+params
      const hasOther = [...subscriptions.values()].some(
        s => s.channel === sub.channel && JSON.stringify(s.params) === JSON.stringify(sub.params)
      )
      if (!hasOther) {
        sendUnsubscribe(sub.channel, sub.params)
      }
    }

    // Disconnect if no more subscriptions
    if (subscriptions.size === 0) {
      stopPing()
      clearTimeout(reconnectTimer)
      if (ws) {
        try { ws.close() } catch { /* ignore */ }
        ws = null
        connected = false
      }
    }
  }
}

export function disconnect() {
  subscriptions.clear()
  stopPing()
  clearTimeout(reconnectTimer)
  if (ws) {
    try { ws.close() } catch { /* ignore */ }
    ws = null
    connected = false
    connecting = false
  }
}
