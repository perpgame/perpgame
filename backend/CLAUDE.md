# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Hyperliquid copy-trading bot. It observes a source wallet's trades via WebSocket and computes proportional orders to execute on a subscriber wallet based on their relative account values.

## Commands

```bash
# Install dependencies (requires the `ws` package)
npm install

# Run the bot
node index.js
```

No build step, test framework, or linter is configured.

## Architecture

ES modules throughout (`import`/`export`). Connects to `wss://api.hyperliquid.xyz/ws`.

**Entry point** (`index.js`): Configures source/user wallet addresses, creates a `WSManager`, subscribes to balance and trade streams, and registers the copy-trade relationship.

**Shared memory** (`sharedMemory.js`): Two in-memory `Map`s — one stores each wallet's account value, the other maps source wallets to their subscriber wallets. All keys are lowercased. This is the glue between the balance handler and the order handler.

**WebSocket layer** (`websockets/`):
- `HLStream.js` — Low-level WebSocket client wrapping `ws`. Manages subscriptions, auto-reconnects with exponential backoff (500ms → 30s), and re-sends all subscriptions on reconnect. Emits `"raw"` events with parsed JSON.
- `WSManager.js` — High-level API. Creates an `HLStream`, routes all messages to the handler dispatcher, and exposes `observeWalletBalance()` / `observeWalletTrades()`.
- `handlers/index.js` — Routes messages by `event.channel` (`clearinghouseState` → balances, `userFills` → orders).
- `handlers/balances.js` — Extracts `marginSummary.accountValue` from clearinghouse state updates and writes to shared memory.
- `handlers/orders.js` — On source wallet fills, computes copy-trade size as `(subscriberValue / sourceValue) * fillSize` and logs the resulting orders. Actual order execution is not yet implemented.
