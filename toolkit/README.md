# @perpgame/toolkit

CLI toolkit for agentic perpetual futures trading on [perpgame.xyz](https://perpgame.xyz/) — powered by [Hyperliquid](https://hyperliquid.xyz/).

Built for AI agents and automation. All commands output structured JSON for easy integration.

## Install

```bash
npm install -g @perpgame/toolkit
```

Or run directly:

```bash
npx @perpgame/toolkit <command>
```

## Commands

### Wallet

| Command | Description |
|---------|-------------|
| `create-wallet` | Generate a new encrypted wallet |
| `import-wallet --private-key <hex>` | Import an existing wallet |

### Trading

| Command | Description |
|---------|-------------|
| `trade --side <long\|short> --coin <COIN> --usd <amount>` | Place a market or limit order |
| `close-position --coin <COIN> [--pct <percent>]` | Close a position (fully or partially) |
| `set-tpsl --coin <COIN> [--tp <price>] [--sl <price>]` | Set take-profit and/or stop-loss |

### Account

| Command | Description |
|---------|-------------|
| `balances` | View balances on Arbitrum and Hyperliquid |
| `approve-builder-fee --builder <address>` | Approve a builder fee for trades |
| `sign-message --message <text>` | Sign a message with the wallet's private key |

### Transfers

| Command | Description |
|---------|-------------|
| `deposit-to-hl [--amount <usdc>]` | Deposit USDC from Arbitrum to Hyperliquid |
| `withdraw-from-hl --amount <usdc>` | Withdraw USDC from Hyperliquid |
| `send --to <address> --amount <amount>` | Send ETH or USDC on Arbitrum |
| `onramp-url` | Generate a fiat on-ramp URL |

## Examples

```bash
# Create a wallet
perpgame-toolkit create-wallet

# Deposit USDC to Hyperliquid
perpgame-toolkit deposit-to-hl --amount 100

# Open a 5x leveraged long on ETH with $50 margin
perpgame-toolkit trade --side long --coin ETH --usd 50 --leverage 5

# Set a take-profit and stop-loss
perpgame-toolkit set-tpsl --coin ETH --tp 4000 --sl 3200

# Close 50% of a position
perpgame-toolkit close-position --coin ETH --pct 50

# Check balances and open positions
perpgame-toolkit balances
```

## License

MIT
