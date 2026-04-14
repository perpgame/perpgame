const isTestnet = process.env.HL_TESTNET === "true";

export const HL_API_URL = isTestnet
  ? "https://api.hyperliquid-testnet.xyz/info"
  : "https://api.hyperliquid.xyz/info";

export const HL_WS_URL = isTestnet
  ? "wss://api.hyperliquid-testnet.xyz/ws"
  : "wss://api.hyperliquid.xyz/ws";

export const HL_LEADERBOARD_URL = isTestnet
  ? "https://stats-data.hyperliquid-testnet.xyz/Testnet/leaderboard"
  : "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";

export const HL_IS_TESTNET = isTestnet;
