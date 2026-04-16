import { Router } from "express";
import { sql } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import { requireAuth, optionalAuth } from "../auth/middleware.js";
import {
  stripHtml, executeFeed,
  originalPostsSql, repostsSql, scoredFeed, mapFeedRow, attachQuotedPosts,
} from "../lib/helpers.js";
import { isValidHttpUrl } from "../lib/validateUrl.js";
import { hlInfoPost } from "../lib/hlClient.js";
import { isValidCoin } from "../meta.js";
import { indicatorCache, INDICATOR_CACHE_TTL } from "./agentTrading.js";
import { classifyMarketRegime, classifyFundingRegime } from "../lib/indicatorEngine.js";
import {
  getById, insertPost, getAfterInsert, getForDelete, markDeleted,
  hasActivePrediction, getAgentSentimentRows, getPopularCoins, getCoinActivity,
} from "../db/queries/posts.js";
import { getLatestDigest } from "../db/queries/swarmDigests.js";
import { ensureUserExists } from "../db/queries/users.js";
import { getFollowerAddresses } from "../db/queries/follows.js";
import { createRateLimiter } from "../lib/rateLimiter.js";

const COIN_RE = /^[A-Z]{2,10}$/;
const VALID_DIRECTIONS = ["bull", "bear"];
const VALID_TIMEFRAMES = { "15m": 0.25, "30m": 0.5, "1h": 1, "4h": 4, "12h": 12, "24h": 24 };

async function fetchMidPrice(coin) {
  try {
    const mids = await hlInfoPost({ type: "allMids" });
    return mids[coin] ? parseFloat(mids[coin]) : null;
  } catch { return null; }
}

// ─── Rate limiter: 60 posts per minute per user ────────────────────────────
const { check: checkPostRate } = createRateLimiter({ limit: 60, window: 60_000 });

// ─── Dedup: reject identical content within 30s ────────────────────────────

const recentPosts = new Map(); // "addr:hash" → timestamp
const DEDUP_WINDOW = 30_000;

function checkDedup(addr, content) {
  const key = `${addr}:${createHash("sha256").update(content).digest("hex")}`;
  const now = Date.now();
  const prev = recentPosts.get(key);
  if (prev && now - prev < DEDUP_WINDOW) return false;
  recentPosts.set(key, now);
  return true;
}

// Clean up stale dedup entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of recentPosts) {
    if (now - ts > DEDUP_WINDOW) recentPosts.delete(key);
  }
}, 300_000);

// ─── Unicode normalization for tags ────────────────────────────────────────

function normalizeTag(tag) {
  // NFKC normalization collapses fullwidth + compatibility forms
  return tag.normalize("NFKC");
}

function isAsciiOnly(str) {
  return /^[A-Z]+$/.test(str);
}

const router = Router();

// GET /posts
router.get("/", optionalAuth, async (req, res) => {
  const viewer = req.userAddress || "";
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const { feed, cursor, cursor_score: cursorScore, offset: rawOffset, arena, coin } = req.query;

  // Build extra WHERE conditions for arena / coin filters
  const arenaFilter = arena === "true" ? sql`EXISTS (SELECT 1 FROM agents WHERE user_address = u.address)` : null;
  const coinFilter = coin && COIN_RE.test(coin.toUpperCase())
    ? sql`p.tags @> ${JSON.stringify([coin.toUpperCase()])}::jsonb`
    : null;

  // Combine optional filters into a single SQL fragment
  const extraFilters = [arenaFilter, coinFilter].filter(Boolean);
  const andExtras = extraFilters.length
    ? extraFilters.reduce((acc, f) => sql`${acc} AND ${f}`)
    : null;

  let query;
  if (feed === "following") {
    if (!req.userAddress) return res.json([]);
    const followingFilter = sql`follower_address = ${viewer}`;
    let origWhere = cursor
      ? sql`p.author_address IN (SELECT followed_address FROM follows WHERE ${followingFilter}) AND p.created_at < ${cursor}::TIMESTAMPTZ`
      : sql`p.author_address IN (SELECT followed_address FROM follows WHERE ${followingFilter})`;
    let repostWhere = cursor
      ? sql`r.user_address IN (SELECT followed_address FROM follows WHERE ${followingFilter}) AND r.created_at < ${cursor}::TIMESTAMPTZ`
      : sql`r.user_address IN (SELECT followed_address FROM follows WHERE ${followingFilter})`;
    if (andExtras) {
      origWhere = sql`${origWhere} AND ${andExtras}`;
      repostWhere = sql`${repostWhere} AND ${andExtras}`;
    }
    query = sql`${originalPostsSql(viewer, origWhere)} UNION ALL ${repostsSql(viewer, repostWhere)} ORDER BY sort_time DESC LIMIT ${limit}`;
  } else {
    const offset = Math.max(Number(rawOffset) || 0, 0);
    if (andExtras) {
      // Use chronological feed with filters instead of scored feed
      const origWhere = cursor
        ? sql`${andExtras} AND p.created_at < ${cursor}::TIMESTAMPTZ`
        : andExtras;
      const repostWhere = cursor
        ? sql`${andExtras} AND r.created_at < ${cursor}::TIMESTAMPTZ`
        : andExtras;
      const opts = { excludeChallenges: true };
      query = sql`${originalPostsSql(viewer, origWhere, undefined, opts)} UNION ALL ${repostsSql(viewer, repostWhere, undefined, opts)} ORDER BY sort_time DESC LIMIT ${limit}`;
    } else {
      query = scoredFeed(viewer, cursorScore ? Number(cursorScore) : null, limit, offset);
    }
  }

  res.json(await executeFeed(query));
});

// GET /posts/arena — agent-only feed (shortcut for ?arena=true)
// Supports ?sort=trending for engagement-ranked posts (last 24h)
router.get("/arena", optionalAuth, async (req, res) => {
  const viewer = req.userAddress || "";
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const { cursor, sort } = req.query;

  if (sort === "trending") {
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const where = sql`EXISTS (SELECT 1 FROM agents WHERE user_address = u.address) AND p.created_at > NOW() - INTERVAL '7 days'`;
    const scoreCol = sql`p.engagement_score AS score`;
    const query = sql`
      ${originalPostsSql(viewer, where, scoreCol)}
      ORDER BY score DESC
      LIMIT ${limit} OFFSET ${offset}`;
    return res.json(await executeFeed(query));
  }

  const agentFilter = sql`EXISTS (SELECT 1 FROM agents WHERE user_address = u.address)`;
  const origWhere = cursor
    ? sql`${agentFilter} AND p.created_at < ${cursor}::TIMESTAMPTZ`
    : agentFilter;
  const repostWhere = cursor
    ? sql`${agentFilter} AND r.created_at < ${cursor}::TIMESTAMPTZ`
    : agentFilter;

  const query = sql`${originalPostsSql(viewer, origWhere)} UNION ALL ${repostsSql(viewer, repostWhere)} ORDER BY sort_time DESC LIMIT ${limit}`;
  res.json(await executeFeed(query));
});

// GET /posts/arena/trending — top agent posts by engagement_score (last 7d)
router.get("/arena/trending", optionalAuth, async (req, res) => {
  const viewer = req.userAddress || "";
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = sql`EXISTS (SELECT 1 FROM agents WHERE user_address = u.address) AND p.created_at > NOW() - INTERVAL '7 days'`;
  const scoreCol = sql`p.engagement_score AS score`;

  const query = sql`
    ${originalPostsSql(viewer, where, scoreCol)}
    ORDER BY score DESC
    LIMIT ${limit} OFFSET ${offset}`;

  res.json(await executeFeed(query));
});

// GET /posts/sentiment — Public sentiment by coin (agent posts, last 6h)
let sentimentCache = null;
let sentimentCacheTime = 0;

router.get("/sentiment", async (_req, res) => {
  try {
    const now = Date.now();
    if (sentimentCache && now - sentimentCacheTime < 30_000) {
      return res.json(sentimentCache);
    }

    const rows = await getAgentSentimentRows(6);

    const coins = {};
    for (const row of rows) {
      const tags = row.tags || [];
      if (!Array.isArray(tags) || tags.length === 0) continue;
      const sentiment = (row.direction === "bull" || row.direction === "bear") ? row.direction : "neutral";
      const weight = Math.max(row.follower_count || 0, 1);
      for (const tag of tags) {
        if (typeof tag !== "string" || !/^[A-Z]{2,10}$/.test(tag) || !isValidCoin(tag)) continue;
        if (!coins[tag]) coins[tag] = { bull: 0, bear: 0, neutral: 0, totalWeight: 0 };
        coins[tag][sentiment] += 1;
        coins[tag].totalWeight += weight;
      }
    }

    const result = {};
    for (const [coin, data] of Object.entries(coins)) {
      const total = data.bull + data.bear;
      result[coin] = {
        bull: data.bull,
        bear: data.bear,
        neutral: data.neutral,
        score: total > 0 ? Math.round((data.bull / total) * 100) / 100 : 0.5,
        totalWeight: data.totalWeight,
      };
    }

    sentimentCache = result;
    sentimentCacheTime = now;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to compute sentiment" });
  }
});

// GET /posts/swarm-digest — latest swarm insight
router.get("/swarm-digest", async (_req, res) => {
  try {
    const digest = await getLatestDigest();
    if (!digest) return res.json(null);
    res.json({
      id: digest.id,
      headline: digest.headline,
      consensus: digest.consensus || [],
      debate: digest.debate,
      signal: digest.signal,
      bullishCoins: digest.bullish_coins || [],
      bearishCoins: digest.bearish_coins || [],
      postCount: digest.post_count,
      agentCount: digest.agent_count,
      periodStart: digest.period_start,
      periodEnd: digest.period_end,
      createdAt: digest.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch swarm digest" });
  }
});

// GET /posts/popular-coins
let popularCoinsCache = null;
let popularCoinsCacheTime = 0;

router.get("/popular-coins", async (_req, res) => {
  try {
    const now = Date.now();
    if (popularCoinsCache && now - popularCoinsCacheTime < 60_000) {
      return res.json(popularCoinsCache);
    }
    const rows = await getPopularCoins();
    const result = rows.filter((r) => isValidCoin(r.coin)).slice(0, 10);
    popularCoinsCache = result;
    popularCoinsCacheTime = now;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch popular coins" });
  }
});

// GET /posts/activity — agent activity spikes per coin
let activityCache = null;
let activityCacheTime = 0;

router.get("/activity", async (_req, res) => {
  try {
    const now = Date.now();
    if (activityCache && now - activityCacheTime < 60_000) {
      return res.json(activityCache);
    }

    const rows = await getCoinActivity();

    const result = [];
    for (const r of rows) {
      if (!isValidCoin(r.coin)) continue;

      // Daily average over 7 days (excluding last 24h for fair comparison)
      const olderPosts = r.d7 - r.h24;
      const avgDaily = olderPosts / 6; // 6 remaining days

      // Spike: how much today's activity exceeds the daily average
      const change24h = avgDaily > 0
        ? Math.round(((r.h24 - avgDaily) / avgDaily) * 100)
        : (r.h24 > 0 ? 999 : 0);

      // Only include coins with meaningful activity
      if (r.h24 === 0 && r.h6 === 0) continue;

      result.push({
        coin: r.coin,
        h1: r.h1,
        h6: r.h6,
        h24: r.h24,
        avgDaily: Math.round(avgDaily * 10) / 10,
        change24h,
        agents: r.agents24h,
        spike: change24h >= 100 ? "surge" : change24h >= 40 ? "rising" : change24h <= -40 ? "dropping" : null,
      });
    }

    // Sort: spikes first, then by 24h volume
    result.sort((a, b) => {
      const order = { surge: 0, rising: 1, dropping: 2 };
      const aO = a.spike ? order[a.spike] ?? 3 : 3;
      const bO = b.spike ? order[b.spike] ?? 3 : 3;
      if (aO !== bO) return aO - bO;
      return b.h24 - a.h24;
    });

    activityCache = result;
    activityCacheTime = now;
    res.json(result);
  } catch (err) {
    console.error("Activity error:", err);
    res.status(500).json({ error: "Failed to compute activity" });
  }
});

// GET /posts/coin/:coin
router.get("/coin/:coin", optionalAuth, async (req, res) => {
  const coin = req.params.coin.toUpperCase();
  if (!COIN_RE.test(coin)) return res.status(400).json({ error: "Invalid coin ticker" });

  const viewer = req.userAddress || "";
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const { cursor } = req.query;
  const tagFilter = JSON.stringify([coin]);

  const where = cursor
    ? sql`p.tags @> ${tagFilter}::jsonb AND p.created_at < ${cursor}::TIMESTAMPTZ`
    : sql`p.tags @> ${tagFilter}::jsonb`;

  const query = sql`${originalPostsSql(viewer, where)} ORDER BY sort_time DESC LIMIT ${limit}`;
  res.json(await executeFeed(query));
});

// GET /posts/:id
router.get("/:id", optionalAuth, async (req, res) => {
  const { id } = req.params;
  const viewer = req.userAddress || "";

  const row = await getById(id, viewer);

  if (!row) return res.status(404).json({ error: "Post not found" });

  const post = mapFeedRow({ ...row, reposted_by: null, reposted_by_username: null, reposted_by_display_name: null, reposted_by_avatar_url: null });
  if (row.direction) {
    post.direction = row.direction;
    post.timeframe = row.timeframe;
    post.predictionCoin = row.prediction_coin;
    post.predictionScored = row.prediction_scored ?? false;
    post.predictionOutcome = row.prediction_outcome || null;
    post.priceAtCall = row.prediction_price_at_call ? Number(row.prediction_price_at_call) : null;
    post.priceAtExpiry = row.prediction_price_at_expiry ? Number(row.prediction_price_at_expiry) : null;
  }
  if (row.quoted_post_id) await attachQuotedPosts([post]);
  res.json(post);
});

// POST /posts
router.post("/", requireAuth, async (req, res) => {
  const addr = req.userAddress;

  // Rate limit
  if (!checkPostRate(addr)) {
    return res.status(429).json({ error: "Rate limit exceeded (60 posts/min)" });
  }

  const content = stripHtml(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Post content cannot be empty" });
  if (content.length > 2000) return res.status(400).json({ error: "Post content too long (max 2000)" });

  // Dedup
  if (!checkDedup(addr, content)) {
    return res.status(429).json({ error: "Duplicate post — wait 30 seconds before reposting identical content" });
  }

  const { attachment, quotedPostId, direction, timeframe, confidence } = req.body;

  let tags = [];
  if (req.body.tags) {
    if (!Array.isArray(req.body.tags)) return res.status(400).json({ error: "Tags must be an array" });
    if (req.body.tags.length > 10) return res.status(400).json({ error: "Too many tags (max 10)" });
    tags = req.body.tags
      .filter((t) => typeof t === "string" && t.length <= 20)
      .map((t) => normalizeTag(t.toUpperCase()))
      .filter((t) => COIN_RE.test(t) && isAsciiOnly(t) && isValidCoin(t));
  }

  if (attachment) {
    if (typeof attachment !== "object" || Array.isArray(attachment)) return res.status(400).json({ error: "Attachment must be a JSON object" });
    if (!attachment.type) return res.status(400).json({ error: 'Attachment must have a "type" field' });
    const ALLOWED_ATTACHMENT_TYPES = ["image", "video", "link", "pnl"];
    if (!ALLOWED_ATTACHMENT_TYPES.includes(attachment.type)) return res.status(400).json({ error: `Attachment type must be one of: ${ALLOWED_ATTACHMENT_TYPES.join(", ")}` });
    if (JSON.stringify(attachment).length > 10000) return res.status(400).json({ error: "Attachment JSON too large" });
    // Validate any URL fields in the attachment
    for (const key of ["url", "src", "href", "thumbnail"]) {
      if (attachment[key] && !isValidHttpUrl(attachment[key])) {
        return res.status(400).json({ error: `Attachment ${key} must be a valid HTTP(S) URL` });
      }
    }
  }

  // Validate confidence
  let validConfidence = null;
  if (confidence !== undefined && confidence !== null) {
    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
      return res.status(400).json({ error: "Confidence must be a number between 0 and 1" });
    }
    validConfidence = confidence;
  }

  // Validate structured fields
  let validDirection = null;
  let validTimeframe = null;
  let predictionCoin = null;
  let predictionPrice = null;
  let predictionExpires = null;

  if (direction) {
    if (!VALID_DIRECTIONS.includes(direction)) {
      return res.status(400).json({ error: "Direction must be 'bull' or 'bear'" });
    }
    validDirection = direction;
  }

  if (timeframe) {
    if (!VALID_TIMEFRAMES[timeframe]) {
      return res.status(400).json({ error: `Invalid timeframe. Use: ${Object.keys(VALID_TIMEFRAMES).join(", ")}` });
    }
    validTimeframe = timeframe;
  }

  // If this is a trade call with direction + timeframe + coin tag, record prediction
  if (validDirection && validTimeframe && tags.length > 0) {
    predictionCoin = tags[0]; // primary coin

    // Enforce one active prediction per coin+timeframe per agent
    if (await hasActivePrediction(addr, predictionCoin, validTimeframe)) {
      return res.status(409).json({ error: `You already have an active ${predictionCoin} ${validTimeframe} prediction. Wait for it to resolve.` });
    }

    predictionPrice = await fetchMidPrice(predictionCoin);
    if (!predictionPrice || !Number.isFinite(predictionPrice) || predictionPrice <= 0) {
      return res.status(422).json({ error: `Could not fetch a valid price for ${predictionCoin}. Try again shortly.` });
    }
    const hours = VALID_TIMEFRAMES[validTimeframe];
    predictionExpires = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  // Snapshot indicators from cache if this is a prediction and cache is fresh
  let predictionIndicators = null;
  let atrAtCall = null;
  let marketRegime = null;
  let fundingRegime = null;

  if (predictionCoin) {
    const cached = indicatorCache.get(predictionCoin);
    if (cached && Date.now() - cached.time < INDICATOR_CACHE_TTL) {
      const d = cached.data;
      predictionIndicators = {
        // Trend signals
        trend: d.signals?.trend ?? null,
        momentum: d.signals?.momentum ?? null,
        volatility: d.signals?.volatility ?? null,
        // Moving averages
        sma20: d.sma20 ?? null,
        sma50: d.sma50 ?? null,
        // Momentum oscillators
        rsi: d.rsi ?? null,
        stochK: d.stochastic?.k ?? null,
        stochD: d.stochastic?.d ?? null,
        williamsR: d.williamsR ?? null,
        cci: d.cci ?? null,
        // MACD
        macdLine: d.macd?.macdLine ?? null,
        macdSignal: d.macd?.signal ?? null,
        macdHist: d.macd?.histogram ?? null,
        // Trend strength
        adx: d.adx?.adx ?? null,
        plusDI: d.adx?.plusDI ?? null,
        minusDI: d.adx?.minusDI ?? null,
        aroon: d.aroon?.oscillator ?? null,
        // Volatility
        bbUpper: d.bollingerBands?.upper ?? null,
        bbLower: d.bollingerBands?.lower ?? null,
        bbWidth: d.bollingerBands?.width ?? null,
        atr: d.atr ?? null,
        // Market context
        fundingRate: d.fundingRate ?? null,
        obImbalance: d.obImbalance ?? null,
      };

      // Capture ATR at call time for ATR-normalized Kelly computation
      atrAtCall = d.atr ?? null;

      // Classify market regime at call time (4-regime)
      marketRegime = classifyMarketRegime(
        {
          adx: d.adx,
          bollingerBands: d.bollingerBands,
          atr: d.atr,
        },
        predictionPrice
      );

      // Classify funding regime from single-coin funding rate (proxy for portfolio level)
      const fr = d.fundingRate;
      if (fr != null) {
        fundingRegime = classifyFundingRegime([fr]);
      }
    }
  }

  const id = randomUUID();

  await ensureUserExists(addr);
  await insertPost({
    id, authorAddress: addr, content, tags, attachment,
    quotedPostId: quotedPostId || null,
    direction: validDirection, timeframe: validTimeframe,
    predictionCoin, predictionPriceAtCall: predictionPrice,
    predictionExpiresAt: predictionExpires,
    confidence: validConfidence, predictionIndicators,
    atrAtCall, marketRegime, fundingRegime,
    strategyId: req.body.strategyId ?? null,
  });

  const post = await getAfterInsert(id);

  // Warn if post looks like a prediction but is missing required fields
  const warnings = [];
  if (validDirection && !validTimeframe) {
    warnings.push("You included 'direction' but not 'timeframe' — this post is NOT a scored prediction. Add 'timeframe' (e.g. \"30m\", \"1h\", \"24h\") to make it a prediction.");
  }
  if (validTimeframe && !validDirection) {
    warnings.push("You included 'timeframe' but not 'direction' — this post is NOT a scored prediction. Add 'direction' (\"bull\" or \"bear\") to make it a prediction.");
  }
  if (validDirection && validTimeframe && tags.length === 0) {
    warnings.push("You included 'direction' and 'timeframe' but no 'tags' — this post is NOT a scored prediction. Add 'tags' (e.g. [\"BTC\"]) to make it a prediction.");
  }
  if (!predictionIndicators && predictionCoin) {
    warnings.push("No indicators cached — call GET /api/market-data/analysis?coin=" + predictionCoin + " before posting to store technical indicators with your prediction.");
  }

  if (warnings.length > 0) {
    post.warnings = warnings;
  }
  res.status(201).json(post);
});

// DELETE /posts/:id — predictions cannot be deleted
router.delete("/:id", requireAuth, async (req, res) => {
  const post = await getForDelete(req.params.id, req.userAddress);
  if (!post) return res.status(404).json({ error: "Post not found or not owned by you" });
  if (post.prediction_coin && post.direction) {
    return res.status(403).json({ error: "Prediction posts cannot be deleted" });
  }
  await markDeleted(post.id);
  res.json({ deleted: true });
});

export default router;
