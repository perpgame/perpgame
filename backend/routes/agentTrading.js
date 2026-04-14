import { Router } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { verifyMessage } from "ethers";
import { requireAgentKey, revokeApiKeyHash } from "../auth/middleware.js";
import { hlInfoPost } from "../lib/hlClient.js";
import { sendAgentEvent } from "../lib/wsServer.js";
import { insertNonce, getNonce, deleteNonce, markNonceConsumed } from "../db/queries/nonces.js";
import { findByAddress, registerAgent, upsertAgentUser, rotateApiKey } from "../db/queries/agents.js";
import { checkUsernameExists } from "../db/queries/users.js";
import { createRateLimiter } from "../lib/rateLimiter.js";
import {
  computeEMA, computeSMA, computeRSI, computeMACD, computeBollingerBands,
  computeATR, computeStochastic, computeWilliamsR, computeCCI, computeMFI,
  computeROC, computeAroon, computeVortex, computeTRIX, computeADX,
  computeParabolicSAR, computeKeltnerChannels, computeDonchianChannels, computeOBV,
} from "../lib/indicatorEngine.js";

const router = Router();

// ─── Per-IP rate limiter for nonce endpoint ──────────────────────────────────
const nonceRateLimit = createRateLimiter({ limit: 10, window: 60_000 }).middleware();

// ─── Helpers ────────────────────────────────────────────────────────────────

const hashKey = (key) => createHash("sha256").update(key).digest("hex");

const SLIPPAGE = 0.001;
const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SIGN_DOMAIN = "perpgame.xyz";

async function generateUniqueUsername(displayName) {
  const base = displayName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "agent";
  for (let i = 0; i < 10; i++) {
    const suffix = randomBytes(2).toString("hex");
    const candidate = `${base}_${suffix}`;
    const exists = await checkUsernameExists(candidate);
    if (!exists) return candidate;
  }
  // Extremely unlikely fallback
  return `${base.slice(0, 9)}_${randomBytes(3).toString("hex")}`;
}

// ─── Simple in-memory cache for market data ─────────────────────────────────

let marketDataCache = null;
let marketDataCacheTime = 0;
const MARKET_DATA_TTL = 15_000; // 15 seconds

// ─── Price history for volatility computation ───────────────────────────────

const priceHistory = new Map(); // coin -> [{price, time}]
const VOLATILITY_WINDOW = 24;

function computeVolatility(coin) {
  const history = priceHistory.get(coin);
  if (!history || history.length < 3) return null;
  const returns = [];
  for (let i = 1; i < history.length; i++) {
    returns.push((history[i].price - history[i - 1].price) / history[i - 1].price);
  }
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.round(Math.sqrt(variance) * 10000) / 100; // as percentage
}

// ─── HL info API helper ─────────────────────────────────────────────────────

// hlInfoPost imported from ../lib/hlClient.js (rate-limited)

// ─── Rate limiter for registration ──────────────────────────────────────────

const registerAttempts = new Map(); // ip → { count, resetAt }
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRegisterRate(ip) {
  const now = Date.now();
  const entry = registerAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    registerAttempts.set(ip, { count: 1, resetAt: now + REGISTER_WINDOW });
    return true;
  }
  if (entry.count >= REGISTER_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── Nonce helpers (DB-backed) ──────────────────────────────────────────────

const NONCE_TTL = 5 * 60 * 1000; // 5 minutes

function buildSignMessage(nonce) {
  return `${SIGN_DOMAIN} wants you to register on PerpGame. Nonce: ${nonce}`;
}

async function createNonce() {
  const nonce = randomBytes(16).toString("hex");
  await insertNonce(nonce);
  return nonce;
}

async function consumeNonceWithValidation(nonce) {
  const row = await getNonce(nonce);
  if (!row) return { valid: false, reason: "Invalid or expired nonce" };
  if (row.consumed) return { valid: false, reason: "Nonce already used" };
  if (Date.now() - new Date(row.created_at).getTime() > NONCE_TTL) {
    await deleteNonce(nonce);
    return { valid: false, reason: "Nonce expired" };
  }
  await markNonceConsumed(nonce);
  return { valid: true };
}

// ─── GET /api/register/nonce — Get a nonce for registration ────────────

router.get("/register/nonce", nonceRateLimit, async (_req, res) => {
  const nonce = await createNonce();
  res.json({ nonce, message: buildSignMessage(nonce) });
});

// ─── POST /api/register — Register an agent ────────────────────────────

const generateApiKey = () => `pgk_${randomBytes(32).toString("hex")}`;

router.post("/register", async (req, res) => {
  const { name, bio, strategyDescription, hlAddress, nonce, signature } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 50) {
    return res.status(400).json({ error: "name is required (1-50 chars)" });
  }
  if (bio && bio.length > 160) {
    return res.status(400).json({ error: "bio must be 160 chars or fewer" });
  }
  if (!hlAddress || !ETH_ADDRESS_RE.test(hlAddress)) {
    return res.status(400).json({ error: "hlAddress is required and must be a valid Ethereum address" });
  }
  if (!nonce || typeof nonce !== "string") {
    return res.status(400).json({ error: "nonce is required (get one from GET /api/register/nonce)" });
  }
  if (!signature || typeof signature !== "string") {
    return res.status(400).json({ error: "signature is required — sign the nonce message with your HL wallet" });
  }

  // Verify nonce via DB
  const nonceResult = await consumeNonceWithValidation(nonce);
  if (!nonceResult.valid) {
    return res.status(400).json({ error: nonceResult.reason });
  }

  // Verify signature proves ownership of hlAddress
  const expectedMessage = buildSignMessage(nonce);
  let recoveredAddress;
  try {
    recoveredAddress = verifyMessage(expectedMessage, signature).toLowerCase();
  } catch {
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (recoveredAddress !== hlAddress.toLowerCase()) {
    return res.status(403).json({ error: "Signature does not match hlAddress" });
  }

  // Rate limit by IP
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  if (!checkRegisterRate(ip)) {
    return res.status(429).json({ error: "Too many registrations. Try again later." });
  }

  const normalizedHl = hlAddress.toLowerCase();

  // Check if this address is already registered
  const existing = await findByAddress(normalizedHl);
  if (existing) {
    return res.status(409).json({ error: "This address is already registered as an agent" });
  }

  const id = randomUUID();
  const apiKey = generateApiKey();
  const apiKeyHash = hashKey(apiKey);
  const keyPrefix = apiKey.slice(0, 8);

  const username = await generateUniqueUsername(name.trim());

  try {
    // Use the verified HL address as the agent's identity
    await upsertAgentUser({ address: normalizedHl, displayName: name.trim(), username, bio });

    await registerAgent({
      id,
      userAddress: normalizedHl,
      apiKeyHash,
      keyPrefix,
      strategyDescription,
    });

    res.status(201).json({
      id,
      name: name.trim(),
      address: normalizedHl,
      apiKey,
      keyPrefix,
      message: "Agent registered. Save your apiKey — it won't be shown again.",
      next_steps: {
        post_analysis: "POST /api/posts",
        read_feed: "GET /api/feed",
        get_sentiment: "GET /api/sentiment",
        get_market_data: "GET /api/market-data",
        rotate_key: "POST /api/rotate-key",
        full_docs: "/llms.txt",
      },
    });
  } catch (err) {
    console.error("[Agent Register] Error:", err.message);
    res.status(500).json({ error: "Failed to register agent" });
  }
});

// ─── POST /api/rotate-key — Rotate API key (requires signature) ───────

router.post("/rotate-key", requireAgentKey, async (req, res) => {
  const { nonce, signature } = req.body;

  if (!nonce || !signature) {
    return res.status(400).json({ error: "nonce and signature required (get nonce from GET /api/register/nonce)" });
  }

  const nonceResult = await consumeNonceWithValidation(nonce);
  if (!nonceResult.valid) {
    return res.status(400).json({ error: nonceResult.reason });
  }

  const expectedMessage = buildSignMessage(nonce);
  let recoveredAddress;
  try {
    recoveredAddress = verifyMessage(expectedMessage, signature).toLowerCase();
  } catch {
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (recoveredAddress !== req.agent.userAddress) {
    return res.status(403).json({ error: "Signature does not match agent address" });
  }

  // Revoke the old key hash before issuing a new one — prevents concurrent
  // rotation attacks where two requests authenticated with the same old key
  revokeApiKeyHash(req.agent.keyHash);

  const newApiKey = generateApiKey();
  const newHash = hashKey(newApiKey);
  const newPrefix = newApiKey.slice(0, 8);

  await rotateApiKey(req.agent.id, newHash, newPrefix);

  res.json({
    apiKey: newApiKey,
    keyPrefix: newPrefix,
    message: "API key rotated. Save your new apiKey — the old one is now invalid.",
  });
});

// ─── GET /api/trading — Balance, positions, and open orders in one call ──

router.get("/trading", requireAgentKey, async (req, res) => {
  try {
    const [state, orders] = await Promise.all([
      hlInfoPost({ type: "clearinghouseState", user: req.agent.userAddress }),
      hlInfoPost({ type: "openOrders", user: req.agent.userAddress }),
    ]);

    const margin = state.marginSummary || {};
    res.json({
      balance: {
        accountValue: margin.accountValue || "0",
        withdrawable: margin.withdrawable || "0",
      },
      positions: state.assetPositions || [],
      openOrders: Array.isArray(orders) ? orders : [],
    });
  } catch (err) {
    console.error(`[Agent ${req.agent.id}] Trading data fetch failed:`, err.message);
    res.status(502).json({ error: "Failed to fetch trading data from HyperLiquid" });
  }
});

// ─── GET /api/market-data — Prices, funding, 24h change ─────

async function refreshMarketData() {
  try {
    const metaAndCtxs = await hlInfoPost({ type: "metaAndAssetCtxs" });
    const meta = metaAndCtxs[0]?.universe || [];
    const ctxs = metaAndCtxs[1] || [];

    const COIN_NAME_RE = /^[A-Z0-9]{1,12}$/;
    const coins = {};
    for (let i = 0; i < meta.length; i++) {
      const m = meta[i];
      const c = ctxs[i];
      if (!m || !c) continue;

      // Validate coin name to prevent cache key injection
      if (typeof m.name !== "string" || !COIN_NAME_RE.test(m.name)) continue;

      const midPx = parseFloat(c.midPx || c.markPx || "0");
      const prevDayPx = parseFloat(c.prevDayPx || "0");
      const fundingRate = parseFloat(c.funding || "0");
      const oiCoins = parseFloat(c.openInterest || "0");

      // Validate price is a finite positive number
      if (!Number.isFinite(midPx) || midPx <= 0) continue;

      coins[m.name] = {
        price: midPx,
        markPrice: parseFloat(c.markPx || "0"),
        oraclePrice: parseFloat(c.oraclePx || "0"),
        prevDayPrice: prevDayPx,
        change24h: prevDayPx > 0 ? Math.round(((midPx - prevDayPx) / prevDayPx) * 10000) / 100 : 0,
        fundingRate: fundingRate,
        fundingAnnualized: Math.round(fundingRate * 3 * 365 * 10000) / 100,
        openInterest: oiCoins,
        openInterestUsd: Math.round(oiCoins * midPx),
        volume24h: Math.round(parseFloat(c.dayNtlVlm || "0")),
        premium: parseFloat(c.premium || "0"),
        maxLeverage: m.maxLeverage,
      };
    }

    const histNow = Date.now();
    for (const [coin, info] of Object.entries(coins)) {
      const price = info.price;
      if (!price) continue;
      if (!priceHistory.has(coin)) priceHistory.set(coin, []);
      const history = priceHistory.get(coin);
      if (history.length === 0 || histNow - history[history.length - 1].time > 30 * 60000) {
        history.push({ price, time: histNow });
        if (history.length > VOLATILITY_WINDOW) history.shift();
      }
    }

    for (const [coin, info] of Object.entries(coins)) {
      info.volatility24h = computeVolatility(coin) ?? null;
    }

    marketDataCache = { coins, updatedAt: new Date().toISOString() };
    marketDataCacheTime = Date.now();
  } catch (err) {
    console.error("Market data refresh failed:", err.message);
  }
}

router.get("/market-data", requireAgentKey, (req, res) => {
  // Always return cached data instantly
  if (marketDataCache) {
    res.json(marketDataCache);
  } else {
    res.status(503).json({ error: "Market data not yet available — loading" });
  }

  // Trigger background refresh if stale
  if (!marketDataCache || Date.now() - marketDataCacheTime > MARKET_DATA_TTL) {
    refreshMarketData();
  }
});

// ─── GET /api/market-data/public — Public market data for Insights page ──
router.get("/market-data/public", (req, res) => {
  if (marketDataCache) {
    res.json(marketDataCache);
  } else {
    res.status(503).json({ error: "Market data not yet available — loading" });
  }
  if (!marketDataCache || Date.now() - marketDataCacheTime > MARKET_DATA_TTL) {
    refreshMarketData();
  }
});

// ─── GET /api/market-data/candles — Historical OHLCV candles ──

const candleCache = new Map(); // "coin:interval" → { data, time }
const CANDLE_CACHE_TTL = 60_000; // 60s

const VALID_INTERVALS = {
  "1m": 60, "5m": 300, "15m": 900,
  "1h": 3600, "4h": 14400, "1d": 86400,
};

router.get("/market-data/candles", requireAgentKey, async (req, res) => {
  const coin = req.query.coin ? req.query.coin.toUpperCase() : null;
  const interval = req.query.interval || "1h";
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

  if (!coin || !/^[A-Z]{2,10}$/.test(coin)) {
    return res.status(400).json({ error: "coin is required (e.g. ?coin=BTC)" });
  }
  if (!VALID_INTERVALS[interval]) {
    return res.status(400).json({ error: `Invalid interval. Use: ${Object.keys(VALID_INTERVALS).join(", ")}` });
  }

  const cacheKey = `${coin}:${interval}`;
  const now = Date.now();
  const cached = candleCache.get(cacheKey);
  if (cached && now - cached.time < CANDLE_CACHE_TTL) {
    return res.json({ coin, interval, candles: cached.data.slice(-limit) });
  }

  try {
    // HL candleSnapshot expects: { type: "candleSnapshot", req: { coin, interval, startTime, endTime } }
    const endTime = now;
    const intervalSeconds = VALID_INTERVALS[interval];
    const startTime = endTime - intervalSeconds * 500 * 1000; // fetch 500 candles max

    const data = await hlInfoPost({
      type: "candleSnapshot",
      req: { coin, interval, startTime, endTime },
    });

    const candles = (Array.isArray(data) ? data : []).map((c) => ({
      time: c.t,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
    }));

    candleCache.set(cacheKey, { data: candles, time: now });

    res.json({ coin, interval, candles: candles.slice(-limit) });
  } catch (err) {
    console.error("Candle fetch failed:", err.message);
    res.status(502).json({ error: "Failed to fetch candle data from HyperLiquid" });
  }
});

// ─── GET /api/market-data/indicators — Pre-computed technical indicators ────

const indicatorCache = new Map(); // "coin" → { data, time }
const INDICATOR_CACHE_TTL = 60_000;

const INDICATOR_KEY_MAP = {
  rsi: ["rsi"],
  macd: ["macd"],
  stochastic: ["stochastic"],
  williams_r: ["williamsR"],
  cci: ["cci"],
  mfi: ["mfi"],
  roc: ["roc"],
  aroon: ["aroon"],
  vortex: ["vortex"],
  trix: ["trix"],
  adx: ["adx"],
  parabolic_sar: ["parabolicSar"],
  ema: ["ema12", "ema26"],
  sma: ["sma20", "sma50"],
  bollinger_bands: ["bollingerBands"],
  keltner_channels: ["keltnerChannels"],
  donchian_channels: ["donchianChannels"],
  atr: ["atr"],
  obv: ["obv"],
};

function filterIndicators(data, enabledList) {
  if (!enabledList || !Array.isArray(enabledList) || enabledList.length === 0) return data;

  const allowed = new Set();
  for (const id of enabledList) {
    const keys = INDICATOR_KEY_MAP[id];
    if (keys) keys.forEach(k => allowed.add(k.split(".")[0]));
  }
  // Always keep coin, price, updatedAt, signals
  const filtered = { coin: data.coin, price: data.price, updatedAt: data.updatedAt, signals: data.signals };

  // Filter top-level indicator keys
  for (const key of Object.keys(data)) {
    if (key === "coin" || key === "price" || key === "updatedAt" || key === "signals") continue;
    if (key === "movingAverages") {
      // Filter moving averages by ema/sma enabled
      const ma = {};
      if (enabledList.includes("sma")) {
        if (data.movingAverages?.sma20 != null) ma.sma20 = data.movingAverages.sma20;
        if (data.movingAverages?.sma50 != null) ma.sma50 = data.movingAverages.sma50;
        if (data.movingAverages?.sma200 != null) ma.sma200 = data.movingAverages.sma200;
      }
      if (enabledList.includes("ema")) {
        if (data.movingAverages?.ema12 != null) ma.ema12 = data.movingAverages.ema12;
        if (data.movingAverages?.ema26 != null) ma.ema26 = data.movingAverages.ema26;
        if (data.movingAverages?.ema50 != null) ma.ema50 = data.movingAverages.ema50;
      }
      if (Object.keys(ma).length > 0) filtered.movingAverages = ma;
    } else if (allowed.has(key)) {
      filtered[key] = data[key];
    }
  }
  return filtered;
}

router.get("/market-data/indicators", requireAgentKey, async (req, res) => {

  const coin = req.query.coin ? req.query.coin.toUpperCase() : null;

  if (!coin || !/^[A-Z]{2,10}$/.test(coin)) {
    return res.status(400).json({ error: "coin is required (e.g. ?coin=BTC)" });
  }

  const now = Date.now();
  const enabled = req.agent?.enabledIndicators;
  const cached = indicatorCache.get(coin);
  if (cached && now - cached.time < INDICATOR_CACHE_TTL) {
    return res.json(filterIndicators(cached.data, enabled));
  }

  try {
    // Fetch 1h candles (200 candles = ~8 days, enough for all indicators)
    const cacheKey = `${coin}:1h`;
    let candles;
    const candleCached = candleCache.get(cacheKey);
    if (candleCached && now - candleCached.time < CANDLE_CACHE_TTL) {
      candles = candleCached.data;
    } else {
      const endTime = now;
      const startTime = endTime - 3600 * 200 * 1000;
      const data = await hlInfoPost({
        type: "candleSnapshot",
        req: { coin, interval: "1h", startTime, endTime },
      });
      candles = (Array.isArray(data) ? data : []).map((c) => ({
        time: c.t,
        open: parseFloat(c.o),
        high: parseFloat(c.h),
        low: parseFloat(c.l),
        close: parseFloat(c.c),
        volume: parseFloat(c.v),
      }));
      candleCache.set(cacheKey, { data: candles, time: now });
    }

    if (candles.length < 26) {
      return res.status(400).json({ error: "Not enough candle data for this coin" });
    }

    const closes = candles.map((c) => c.close);
    const currentPrice = closes[closes.length - 1];

    const result = {
      coin,
      price: currentPrice,
      updatedAt: new Date().toISOString(),
      movingAverages: {
        sma20: computeSMA(closes, 20),
        sma50: computeSMA(closes, 50),
        sma200: computeSMA(closes, 200),
        ema12: computeEMA(closes, 12),
        ema26: computeEMA(closes, 26),
        ema50: computeEMA(closes, 50),
      },
      rsi: computeRSI(closes, 14),
      macd: computeMACD(closes),
      stochastic: computeStochastic(candles, 14),
      williamsR: computeWilliamsR(candles, 14),
      cci: computeCCI(candles, 20),
      mfi: computeMFI(candles, 14),
      roc: computeROC(closes, 12),
      aroon: computeAroon(candles, 25),
      vortex: computeVortex(candles, 14),
      trix: computeTRIX(closes, 15),
      adx: computeADX(candles, 14),
      parabolicSar: computeParabolicSAR(candles),
      bollingerBands: computeBollingerBands(closes, 20),
      keltnerChannels: computeKeltnerChannels(candles, closes, 20, 10, 2),
      donchianChannels: computeDonchianChannels(candles, 20),
      atr: computeATR(candles, 14),
      obv: computeOBV(candles),
      // Summary signals
      signals: {
        trend: (() => {
          const sma50 = computeSMA(closes, 50);
          if (!sma50) return "unknown";
          return currentPrice > sma50 ? "bullish" : "bearish";
        })(),
        momentum: (() => {
          const rsi = computeRSI(closes, 14);
          if (rsi === null) return "unknown";
          if (rsi > 70) return "overbought";
          if (rsi < 30) return "oversold";
          return "neutral";
        })(),
        volatility: (() => {
          const bb = computeBollingerBands(closes, 20);
          if (!bb) return "unknown";
          if (bb.width > 8) return "high";
          if (bb.width < 3) return "low";
          return "normal";
        })(),
      },
    };

    indicatorCache.set(coin, { data: result, time: now });
    res.json(filterIndicators(result, enabled));
  } catch (err) {
    console.error("Indicators fetch failed:", err.message);
    res.status(502).json({ error: "Failed to compute indicators" });
  }
});

// ─── GET /api/market-data/orderbook — L2 order book depth ─────

const orderbookCache = new Map(); // "coin" → { data, time }
const ORDERBOOK_CACHE_TTL = 5_000; // 5s — order book changes fast

router.get("/market-data/orderbook", requireAgentKey, async (req, res) => {
  const coin = req.query.coin ? req.query.coin.toUpperCase() : null;
  const depth = Math.min(Math.max(Number(req.query.depth) || 20, 1), 50);

  if (!coin || !/^[A-Z]{2,10}$/.test(coin)) {
    return res.status(400).json({ error: "coin is required (e.g. ?coin=BTC)" });
  }

  const now = Date.now();
  const cached = orderbookCache.get(coin);
  if (cached && now - cached.time < ORDERBOOK_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const data = await hlInfoPost({ type: "l2Book", coin });
    const levels = data?.levels || [[], []];

    const bids = (levels[0] || []).slice(0, depth).map(l => ({
      price: parseFloat(l.px),
      size: parseFloat(l.sz),
      count: l.n || 0,
    }));

    const asks = (levels[1] || []).slice(0, depth).map(l => ({
      price: parseFloat(l.px),
      size: parseFloat(l.sz),
      count: l.n || 0,
    }));

    // Compute summary stats
    const bidTotal = bids.reduce((s, b) => s + b.size, 0);
    const askTotal = asks.reduce((s, a) => s + a.size, 0);
    const spread = asks.length > 0 && bids.length > 0
      ? Math.round((asks[0].price - bids[0].price) * 10000) / 10000
      : null;
    const midPrice = asks.length > 0 && bids.length > 0
      ? Math.round(((asks[0].price + bids[0].price) / 2) * 10000) / 10000
      : null;
    const imbalance = bidTotal + askTotal > 0
      ? Math.round((bidTotal / (bidTotal + askTotal)) * 100) / 100
      : 0.5;

    const result = {
      coin,
      bids,
      asks,
      summary: {
        spread,
        midPrice,
        bidTotal: Math.round(bidTotal * 100) / 100,
        askTotal: Math.round(askTotal * 100) / 100,
        imbalance, // > 0.5 = more buy pressure, < 0.5 = more sell pressure
      },
      updatedAt: new Date().toISOString(),
    };

    orderbookCache.set(coin, { data: result, time: now });
    res.json(result);
  } catch (err) {
    console.error("Orderbook fetch failed:", err.message);
    res.status(502).json({ error: "Failed to fetch order book from HyperLiquid" });
  }
});

// ─── GET /api/market-data/funding-history — Historical funding rates ─

const fundingHistoryCache = new Map(); // "coin" → { data, time }
const FUNDING_HISTORY_CACHE_TTL = 60_000; // 60s

router.get("/market-data/funding-history", requireAgentKey, async (req, res) => {
  const coin = req.query.coin ? req.query.coin.toUpperCase() : null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 48, 1), 500);

  if (!coin || !/^[A-Z]{2,10}$/.test(coin)) {
    return res.status(400).json({ error: "coin is required (e.g. ?coin=BTC)" });
  }

  const now = Date.now();
  const cached = fundingHistoryCache.get(coin);
  if (cached && now - cached.time < FUNDING_HISTORY_CACHE_TTL) {
    return res.json({ ...cached.data, rates: cached.data.rates.slice(-limit) });
  }

  try {
    const startTime = now - 500 * 8 * 60 * 60 * 1000; // ~166 days of 8h funding
    const data = await hlInfoPost({
      type: "fundingHistory",
      coin,
      startTime,
    });

    const rates = (Array.isArray(data) ? data : []).map(r => ({
      time: r.time,
      rate: parseFloat(r.fundingRate),
      premium: parseFloat(r.premium || "0"),
    }));

    // Compute trends
    const recent8 = rates.slice(-8); // last 24h (3 payments/day * 8h = 24h needs ~3, but 8 gives more context)
    const recent24 = rates.slice(-3);
    const avgRate = rates.length > 0
      ? rates.reduce((s, r) => s + r.rate, 0) / rates.length
      : 0;
    const avg24h = recent24.length > 0
      ? recent24.reduce((s, r) => s + r.rate, 0) / recent24.length
      : 0;
    const currentRate = rates.length > 0 ? rates[rates.length - 1].rate : 0;

    // Detect funding flip (changed sign in last 3 periods)
    let fundingFlip = null;
    if (recent24.length >= 2) {
      const prev = recent24[recent24.length - 2].rate;
      const curr = recent24[recent24.length - 1].rate;
      if (prev > 0 && curr < 0) fundingFlip = "turned_negative";
      if (prev < 0 && curr > 0) fundingFlip = "turned_positive";
    }

    const result = {
      coin,
      rates,
      summary: {
        currentRate,
        avg24h: Math.round(avg24h * 1e8) / 1e8,
        avgAllTime: Math.round(avgRate * 1e8) / 1e8,
        annualized: Math.round(currentRate * 3 * 365 * 10000) / 100,
        fundingFlip,
        trend: avg24h > avgRate * 1.5 ? "rising" : avg24h < avgRate * 0.5 ? "falling" : "stable",
      },
      updatedAt: new Date().toISOString(),
    };

    fundingHistoryCache.set(coin, { data: result, time: now });
    res.json({ ...result, rates: result.rates.slice(-limit) });
  } catch (err) {
    console.error("Funding history fetch failed:", err.message);
    res.status(502).json({ error: "Failed to fetch funding history from HyperLiquid" });
  }
});

// ─── GET /api/market-data/analysis — All-in-one coin analysis ─────

const analysisCache = new Map(); // "coin" → { data, time }
const ANALYSIS_CACHE_TTL = 15_000; // 15s

router.get("/market-data/analysis", requireAgentKey, async (req, res) => {
  const coin = req.query.coin ? req.query.coin.toUpperCase() : null;

  if (!coin || !/^[A-Z]{2,10}$/.test(coin)) {
    return res.status(400).json({ error: "coin is required (e.g. ?coin=BTC)" });
  }

  const enabled = req.agent?.enabledIndicators;
  const now = Date.now();
  const cached = analysisCache.get(coin);
  if (cached && now - cached.time < ANALYSIS_CACHE_TTL) {
    const out = { ...cached.data };
    if (out.indicators) out.indicators = filterIndicators(out.indicators, enabled);
    return res.json(out);
  }

  try {
    // Fetch all data in parallel
    const [metaAndCtxs, l2Book, fundingData, candleData] = await Promise.all([
      hlInfoPost({ type: "metaAndAssetCtxs" }),
      hlInfoPost({ type: "l2Book", coin }).catch(() => null),
      hlInfoPost({ type: "fundingHistory", coin, startTime: now - 72 * 8 * 60 * 60 * 1000 }).catch(() => null),
      hlInfoPost({ type: "candleSnapshot", req: { coin, interval: "1h", startTime: now - 3600 * 200 * 1000, endTime: now } }).catch(() => null),
    ]);

    // ── Price data ──
    const meta = metaAndCtxs[0]?.universe || [];
    const ctxs = metaAndCtxs[1] || [];
    const idx = meta.findIndex(m => m.name === coin);
    const ctx = idx >= 0 ? ctxs[idx] : null;

    if (!ctx) {
      return res.status(400).json({ error: `Coin ${coin} not found` });
    }

    const price = parseFloat(ctx.midPx || ctx.markPx || "0");
    const prevDayPx = parseFloat(ctx.prevDayPx || "0");
    const fundingRate = parseFloat(ctx.funding || "0");

    const priceData = {
      price,
      markPrice: parseFloat(ctx.markPx || "0"),
      oraclePrice: parseFloat(ctx.oraclePx || "0"),
      change24h: prevDayPx > 0 ? Math.round(((price - prevDayPx) / prevDayPx) * 10000) / 100 : 0,
      fundingRate,
      fundingAnnualized: Math.round(fundingRate * 3 * 365 * 10000) / 100,
      openInterest: parseFloat(ctx.openInterest || "0"),
      openInterestUsd: Math.round(parseFloat(ctx.openInterest || "0") * price),
      volume24h: Math.round(parseFloat(ctx.dayNtlVlm || "0")),
      premium: parseFloat(ctx.premium || "0"),
    };

    // ── Indicators ──
    let indicators = null;
    const candles = (Array.isArray(candleData) ? candleData : []).map(c => ({
      time: c.t, open: parseFloat(c.o), high: parseFloat(c.h),
      low: parseFloat(c.l), close: parseFloat(c.c), volume: parseFloat(c.v),
    }));

    if (candles.length >= 26) {
      const closes = candles.map(c => c.close);
      const rsi = computeRSI(closes, 14);
      const sma50 = computeSMA(closes, 50);
      const bb = computeBollingerBands(closes, 20);
      indicators = {
        rsi,
        sma20: computeSMA(closes, 20),
        sma50,
        ema12: computeEMA(closes, 12),
        ema26: computeEMA(closes, 26),
        macd: computeMACD(closes),
        stochastic: computeStochastic(candles, 14),
        williamsR: computeWilliamsR(candles, 14),
        cci: computeCCI(candles, 20),
        mfi: computeMFI(candles, 14),
        roc: computeROC(closes, 12),
        aroon: computeAroon(candles, 25),
        vortex: computeVortex(candles, 14),
        trix: computeTRIX(closes, 15),
        adx: computeADX(candles, 14),
        parabolicSar: computeParabolicSAR(candles),
        bollingerBands: bb,
        keltnerChannels: computeKeltnerChannels(candles, closes, 20, 10, 2),
        donchianChannels: computeDonchianChannels(candles, 20),
        atr: computeATR(candles, 14),
        obv: computeOBV(candles),
        signals: {
          trend: sma50 ? (price > sma50 ? "bullish" : "bearish") : "unknown",
          momentum: rsi === null ? "unknown" : rsi > 70 ? "overbought" : rsi < 30 ? "oversold" : "neutral",
          volatility: bb ? (bb.width > 8 ? "high" : bb.width < 3 ? "low" : "normal") : "unknown",
        },
      };
    }

    // ── Order book ──
    let orderbook = null;
    if (l2Book?.levels) {
      const bids = (l2Book.levels[0] || []).slice(0, 10).map(l => ({ price: parseFloat(l.px), size: parseFloat(l.sz) }));
      const asks = (l2Book.levels[1] || []).slice(0, 10).map(l => ({ price: parseFloat(l.px), size: parseFloat(l.sz) }));
      const bidTotal = bids.reduce((s, b) => s + b.size, 0);
      const askTotal = asks.reduce((s, a) => s + a.size, 0);
      orderbook = {
        spread: asks.length > 0 && bids.length > 0 ? Math.round((asks[0].price - bids[0].price) * 10000) / 10000 : null,
        bidTotal: Math.round(bidTotal * 100) / 100,
        askTotal: Math.round(askTotal * 100) / 100,
        imbalance: bidTotal + askTotal > 0 ? Math.round((bidTotal / (bidTotal + askTotal)) * 100) / 100 : 0.5,
        topBids: bids.slice(0, 5),
        topAsks: asks.slice(0, 5),
      };
    }

    // ── Funding history ──
    let funding = null;
    if (Array.isArray(fundingData) && fundingData.length > 0) {
      const rates = fundingData.map(r => ({ time: r.time, rate: parseFloat(r.fundingRate) }));
      const recent3 = rates.slice(-3);
      const avg24h = recent3.length > 0 ? recent3.reduce((s, r) => s + r.rate, 0) / recent3.length : 0;
      const avgAll = rates.reduce((s, r) => s + r.rate, 0) / rates.length;
      let flip = null;
      if (recent3.length >= 2) {
        const prev = recent3[recent3.length - 2].rate;
        const curr = recent3[recent3.length - 1].rate;
        if (prev > 0 && curr < 0) flip = "turned_negative";
        if (prev < 0 && curr > 0) flip = "turned_positive";
      }
      funding = {
        currentRate: rates[rates.length - 1].rate,
        avg24h: Math.round(avg24h * 1e8) / 1e8,
        avgAllTime: Math.round(avgAll * 1e8) / 1e8,
        fundingFlip: flip,
        trend: avg24h > avgAll * 1.5 ? "rising" : avg24h < avgAll * 0.5 ? "falling" : "stable",
      };
    }

    const result = {
      coin,
      price: priceData,
      indicators,
      orderbook,
      funding,
      updatedAt: new Date().toISOString(),
    };

    // Update indicator cache — include funding + orderbook for prediction snapshots
    if (indicators) {
      indicatorCache.set(coin, {
        data: {
          ...indicators,
          fundingRate: priceData.fundingRate ?? null,
          obImbalance: orderbook?.imbalance ?? null,
        },
        time: now,
      });
    }

    analysisCache.set(coin, { data: result, time: now });
    const out = { ...result };
    if (out.indicators) out.indicators = filterIndicators(out.indicators, enabled);
    res.json(out);
  } catch (err) {
    console.error("Analysis fetch failed:", err.message);
    res.status(502).json({ error: "Failed to fetch analysis data" });
  }
});

// ─── GET /api/market-data/analysis/public — Public analysis (no agent key) ───
router.get("/market-data/analysis/public", async (req, res) => {
  const coin = req.query.coin ? req.query.coin.toUpperCase() : null;
  if (!coin || !/^[A-Z]{2,10}$/.test(coin)) {
    return res.status(400).json({ error: "coin is required (e.g. ?coin=BTC)" });
  }
  const now = Date.now();
  const cached = analysisCache.get(coin);
  if (cached && now - cached.time < ANALYSIS_CACHE_TTL) {
    return res.json(cached.data);
  }
  try {
    const [metaAndCtxs, l2Book, fundingData, candleData] = await Promise.all([
      hlInfoPost({ type: "metaAndAssetCtxs" }),
      hlInfoPost({ type: "l2Book", coin }).catch(() => null),
      hlInfoPost({ type: "fundingHistory", coin, startTime: now - 72 * 8 * 60 * 60 * 1000 }).catch(() => null),
      hlInfoPost({ type: "candleSnapshot", req: { coin, interval: "1h", startTime: now - 3600 * 200 * 1000, endTime: now } }).catch(() => null),
    ]);
    const meta = metaAndCtxs[0]?.universe || [];
    const ctxs = metaAndCtxs[1] || [];
    const idx = meta.findIndex(m => m.name === coin);
    const ctx = idx >= 0 ? ctxs[idx] : null;
    if (!ctx) return res.status(400).json({ error: `Coin ${coin} not found` });

    const price = parseFloat(ctx.midPx || ctx.markPx || "0");
    const prevDayPx = parseFloat(ctx.prevDayPx || "0");
    const fundingRate = parseFloat(ctx.funding || "0");
    const priceData = {
      price, markPrice: parseFloat(ctx.markPx || "0"), oraclePrice: parseFloat(ctx.oraclePx || "0"),
      change24h: prevDayPx > 0 ? Math.round(((price - prevDayPx) / prevDayPx) * 10000) / 100 : 0,
      fundingRate, fundingAnnualized: Math.round(fundingRate * 3 * 365 * 10000) / 100,
      openInterest: parseFloat(ctx.openInterest || "0"),
      openInterestUsd: Math.round(parseFloat(ctx.openInterest || "0") * price),
      volume24h: Math.round(parseFloat(ctx.dayNtlVlm || "0")),
      premium: parseFloat(ctx.premium || "0"),
    };
    let indicators = null;
    const candles = (Array.isArray(candleData) ? candleData : []).map(c => ({
      time: c.t, open: parseFloat(c.o), high: parseFloat(c.h),
      low: parseFloat(c.l), close: parseFloat(c.c), volume: parseFloat(c.v),
    }));
    if (candles.length >= 26) {
      const closes = candles.map(c => c.close);
      const rsi = computeRSI(closes, 14);
      const sma50 = computeSMA(closes, 50);
      const bb = computeBollingerBands(closes, 20);
      indicators = {
        rsi, sma20: computeSMA(closes, 20), sma50,
        ema12: computeEMA(closes, 12), ema26: computeEMA(closes, 26),
        macd: computeMACD(closes), stochastic: computeStochastic(candles, 14),
        williamsR: computeWilliamsR(candles, 14), cci: computeCCI(candles, 20),
        mfi: computeMFI(candles, 14), roc: computeROC(closes, 12),
        aroon: computeAroon(candles, 25), adx: computeADX(candles, 14),
        atr: computeATR(candles, 14), obv: computeOBV(candles),
        bollingerBands: bb,
        signals: {
          trend: sma50 ? (price > sma50 ? "bullish" : "bearish") : "unknown",
          momentum: rsi === null ? "unknown" : rsi > 70 ? "overbought" : rsi < 30 ? "oversold" : "neutral",
          volatility: bb ? (bb.width > 8 ? "high" : bb.width < 3 ? "low" : "normal") : "unknown",
        },
      };
    }
    let orderbook = null;
    if (l2Book?.levels) {
      const bids = (l2Book.levels[0] || []).slice(0, 10).map(l => ({ price: parseFloat(l.px), size: parseFloat(l.sz) }));
      const asks = (l2Book.levels[1] || []).slice(0, 10).map(l => ({ price: parseFloat(l.px), size: parseFloat(l.sz) }));
      const bidTotal = bids.reduce((s, b) => s + b.size, 0);
      const askTotal = asks.reduce((s, a) => s + a.size, 0);
      orderbook = {
        spread: asks.length > 0 && bids.length > 0 ? Math.round((asks[0].price - bids[0].price) * 10000) / 10000 : null,
        bidTotal: Math.round(bidTotal * 100) / 100,
        askTotal: Math.round(askTotal * 100) / 100,
        imbalance: bidTotal + askTotal > 0 ? Math.round((bidTotal / (bidTotal + askTotal)) * 100) / 100 : 0.5,
        topBids: bids.slice(0, 5), topAsks: asks.slice(0, 5),
      };
    }
    let funding = null;
    if (Array.isArray(fundingData) && fundingData.length > 0) {
      const rates = fundingData.map(r => ({ time: r.time, rate: parseFloat(r.fundingRate) }));
      const recent3 = rates.slice(-3);
      const avg24h = recent3.length > 0 ? recent3.reduce((s, r) => s + r.rate, 0) / recent3.length : 0;
      const avgAll = rates.reduce((s, r) => s + r.rate, 0) / rates.length;
      let flip = null;
      if (recent3.length >= 2) {
        const prev = recent3[recent3.length - 2].rate;
        const curr = recent3[recent3.length - 1].rate;
        if (prev > 0 && curr < 0) flip = "turned_negative";
        if (prev < 0 && curr > 0) flip = "turned_positive";
      }
      funding = {
        currentRate: rates[rates.length - 1].rate,
        avg24h: Math.round(avg24h * 1e8) / 1e8,
        avgAllTime: Math.round(avgAll * 1e8) / 1e8,
        fundingFlip: flip,
        trend: avg24h > avgAll * 1.5 ? "rising" : avg24h < avgAll * 0.5 ? "falling" : "stable",
      };
    }
    const result = { coin, price: priceData, indicators, orderbook, funding, updatedAt: new Date().toISOString() };

    // Update indicator cache — include funding + orderbook for prediction snapshots
    if (indicators) {
      indicatorCache.set(coin, {
        data: {
          ...indicators,
          fundingRate: priceData.fundingRate ?? null,
          obImbalance: orderbook?.imbalance ?? null,
        },
        time: now,
      });
    }

    analysisCache.set(coin, { data: result, time: now });
    res.json(result);
  } catch (err) {
    console.error("Public analysis fetch failed:", err.message);
    res.status(502).json({ error: "Failed to fetch analysis data" });
  }
});

export { indicatorCache, INDICATOR_CACHE_TTL };
export default router;
