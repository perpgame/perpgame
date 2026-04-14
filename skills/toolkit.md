---
name: perpgame-toolkit
version: 1.0.12
description: Hyperliquid DEX trading — wallet setup, onramp, balances, trading, withdrawals, and transfers. Use for ANY Hyperliquid request.
user-invocable: true
allowed-tools: ["bash", "exec"]
metadata: {"openclaw": {"requires": {"bins": ["perpgame-toolkit"]}}}
---

# Hyperliquid Trading (perpgame-toolkit)

ALWAYS use the `perpgame-toolkit` CLI. NEVER write inline Node.js scripts or import the SDK directly.

---

## Installation

If the `perpgame-toolkit` command is not found, install it from npm:
```bash
npm install @perpgame/toolkit
```

---

## Wallet Setup

Two flows depending on whether the user has a private key or not.

### Generate a new wallet
```bash
perpgame-toolkit create-wallet
```
Show the created address to the user.

### Import existing private key
Ask the user for their **private key** (hex, 0x-prefixed).
```bash
perpgame-toolkit import-wallet --private-key <key>
```

The private key is **never stored in plaintext** — always AES-256-GCM encrypted. Wallet encryption and storage is handled by the `perpgame-toolkit` CLI.

### Environment variables

| Variable | Description |
|----------|-------------|
| `PERPGAME_WALLET_DIR` | Override wallet directory (default: `~/.perpgame-trader`). Use different paths to run multiple agents with separate wallets on the same machine. |
| `PERPGAME_ENCRYPTION_KEY` | Override encryption key source (default: OS keychain or `~/.perpgame-trader/.encryption-key`). |

---

## Onramp & Deposit

When the user asks how to top up or fund their account, present **both** options:

### Option A — Buy with card (onramp)
```bash
perpgame-toolkit onramp-url
```
Returns JSON with a signed Onramper URL. Share the URL with the user — they open it in a browser to buy USDC on Arbitrum via credit card, Apple Pay, or Google Pay.

### Option B — Deposit USDC on Arbitrum directly
Show the user their wallet address so they can send USDC (Arbitrum) to it from any exchange or wallet:
```bash
perpgame-toolkit balances
```
Use the wallet address from the output. Tell the user to send **USDC on the Arbitrum network** to that address.

### After USDC arrives — Deposit to Hyperliquid
Once the user confirms USDC has arrived on Arbitrum (from either option):
```bash
perpgame-toolkit deposit-to-hl
```
Deposits all USDC from Arbitrum to Hyperliquid. To deposit a specific amount:
```bash
perpgame-toolkit deposit-to-hl --amount 50
```

Notes:
- Minimum Hyperliquid deposit is $6 USDC
- The wallet needs a small amount of ETH on Arbitrum for gas fees

---

## Balances

Fetches balances from both Arbitrum and Hyperliquid in one call.

```bash
perpgame-toolkit balances
```

Returns Arbitrum ETH + USDC balances, Hyperliquid account value, margin used, withdrawable amount, and open positions with entry price and unrealized PnL.

---

## Trading

### Before every trade session — approve builder fee
```bash
perpgame-toolkit approve-builder-fee --builder 0xb2fed3acf6e30e0f1902a2b190c88c9a0a68edc3 --fee-bps 50
```
Idempotent — returns `already_approved` if done. If it fails due to zero balance or no account, offer the user to fund their wallet via onramp, then retry.

### Place trades
**Use `perpgame-toolkit trade` for all orders** — it handles price lookup, USD-to-size conversion, leverage, and order placement in one call. `--usd` is the margin amount.

```bash
perpgame-toolkit trade --side <long|short|buy|sell> --coin <COIN> --usd <amount> [--leverage <n>] [--type market|limit] [--price <p>] [--reduce-only] [--slippage <pct>] [--tif <Gtc|Ioc|Alo>] [--tp <price>] [--sl <price>]
```

Examples:
- `perpgame-toolkit trade --side long --coin BTC --usd 10 --leverage 5`
- `perpgame-toolkit trade --side short --coin ETH --usd 50 --leverage 10`
- `perpgame-toolkit trade --side sell --coin BTC --usd 10 --reduce-only`
- `perpgame-toolkit trade --side long --coin BTC --usd 10 --leverage 5 --tp 100000 --sl 90000`

If a trade fails due to insufficient balance, offer the user to fund via onramp.

### Close / reduce position
```bash
perpgame-toolkit close-position --coin <COIN> [--pct <1-100>]
```
- `perpgame-toolkit close-position --coin BTC` — close 100%
- `perpgame-toolkit close-position --coin ETH --pct 50` — close 50%

### Stop loss / take profit

Set on new trade (market orders only):
```bash
perpgame-toolkit trade --side long --coin ETH --usd 50 --leverage 5 --tp 4000 --sl 3200
```

Set on existing position:
```bash
perpgame-toolkit set-tpsl --coin <COIN> [--tp <price>] [--sl <price>]
```
- `perpgame-toolkit set-tpsl --coin BTC --tp 100000 --sl 90000`
- `perpgame-toolkit set-tpsl --coin ETH --sl 3200` — stop loss only

Automatically detects position direction and size.

### Modify existing position
- **Increase position**: call `perpgame-toolkit trade` again with the same side — it adds to the existing position
- **Reduce position**: use `perpgame-toolkit close-position` with `--pct`

---

## Sign Message

Sign an arbitrary message with the wallet's private key.

```bash
perpgame-toolkit sign-message --message "your message here"
```

Returns JSON with `address`, `message`, and `signature`.

---

## Withdraw & Send

### Withdraw from Hyperliquid to Arbitrum
```bash
perpgame-toolkit withdraw-from-hl --amount <USDC amount> [--to <address>]
```
- `perpgame-toolkit withdraw-from-hl --amount 100` — withdraw to own wallet
- `perpgame-toolkit withdraw-from-hl --amount 50 --to 0xabc...` — withdraw to another address

Hyperliquid withdrawals take a few minutes to process.

### Send tokens on Arbitrum
```bash
perpgame-toolkit send --to <address> --amount <amount> [--token usdc|eth]
```
- `perpgame-toolkit send --to 0xabc... --amount 50` — send 50 USDC
- `perpgame-toolkit send --to 0xabc... --amount 0.01 --token eth` — send 0.01 ETH

Token defaults to USDC. ETH is needed on Arbitrum for gas fees.
