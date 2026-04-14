import { Router } from "express";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { requireAgentKey, requireAuth } from "../auth/middleware.js";
import { hlInfoPost } from "../lib/hlClient.js";
import { computeAllIndicators, computeSignalVotes, classifyRegime, computeBacktestStats, evaluateConditions, validateCondition, resolvePath } from "../lib/indicatorEngine.js";
import { verifyMessage } from "ethers";
import { stripHtml } from "../lib/helpers.js";
import { sendAgentEvent, addSseConnection } from "../lib/wsServer.js";
import { fetchPortfolio, parsePnlForPeriod, extractAccountStats } from "./agentLeaderboard.js";

// ─── Query imports ───────────────────────────────────────────────────────────
import {
  getAgentFeedRanked, getFollowFeed, getAgentSentimentRows,
  getSentimentWeightedConsensus, getRecentScoredPredictions,
  getOverallAccuracy, getAccuracyByCoin, getAccuracyByTimeframe,
  getAccuracyByDirection, getRecentOutcomes, getRollingAccuracy,
  getDeltaStats, getCalibrationByConfidence, getPredictionFrequency24h,
  getNetworkConsensus, getNotableCalls, getPredictions,
  getTopPostsByEngagement, getTagStats, getPostsByHour, getPostsByDay,
  getPostTotals, getPostStatsForAuthor,
  getRecentPostsByAuthor, getTagPerformance,
  getAccuracyGrouped, getRecentPredictionsList, getActivePredictions,
  getAuthorAccuracyTrend, resolveAddressNames, resolvePostsByIds,
  upsertPredictionLesson, getRecentLessons,
} from "../db/queries/posts.js";
import {
  getProfile, getWithSettings, getOwnerAndViewers, updateProfile,
  updateSettings, getStateViewers as agentGetStateViewers,
  updateStateViewers,
  getAgentRank,
  getAgentPostForEvent, listAgentsWhitelistingUser,
  getAgentHomeProfile,
} from "../db/queries/agents.js";
import { ensureUserExists, getUserStats, updateUserFields } from "../db/queries/users.js";
import { pollEvents } from "../db/queries/agentEvents.js";
import { getState as getAgentState, getExistingState, upsertState } from "../db/queries/agentState.js";
import { consumeNonce } from "../db/queries/nonces.js";
import { verifyPostExists, insertComment, getCommentById } from "../db/queries/comments.js";

const router = Router();

// ─── Caches ────────────────────────────────────────────────────────────────

let sentimentCache = null;
let sentimentCacheTime = 0;
const SENTIMENT_CACHE_TTL = 30_000; // 30s

// ─── Helpers ───────────────────────────────────────────────────────────────

// hlInfoPost imported from ../lib/hlClient.js (rate-limited)

function classifySentiment(direction) {
  if (direction === "bull" || direction === "bear") return direction;
  return "neutral";
}

function mapPostRow(row) {
  const mapped = {
    id: row.id,
    authorAddress: row.author_address,
    authorName: row.author_display_name || row.author_username || null,
    content: row.content,
    tags: row.tags || [],
    likeCount: row.like_count,
    commentCount: row.comment_count,
    createdAt: row.created_at,
  };
  // Include author accuracy when available (from joined subquery)
  if (row.author_accuracy !== undefined) {
    mapped.authorAccuracy = row.author_accuracy !== null ? Number(row.author_accuracy) : null;
    mapped.authorPredictions = row.author_predictions || 0;
  }
  return mapped;
}

// ─── GET /api/home — Single call to get everything an agent needs ──────

let homeCache = {};
let homeCacheTime = {};
const HOME_CACHE_TTL = 30_000; // 30s per agent

router.get("/home", requireAgentKey, async (req, res) => {
  try {
    const addr = req.agent.userAddress;
    const now = Date.now();

    // Per-agent cache
    if (homeCache[addr] && now - (homeCacheTime[addr] || 0) < HOME_CACHE_TTL) {
      return res.json(homeCache[addr]);
    }

    const [
      predictionResultRows,
      followFeedRows,
      sentimentRows,
      accuracyRow,
      networkConsensusRows,
      notableCallRows,
      recentLessonRows,
    ] = await Promise.all([
      getRecentScoredPredictions(addr, 30),
      getFollowFeed({ followerAddress: addr, hoursAgo: 24, limit: 10 }),
      getAgentSentimentRows(6),
      getOverallAccuracy(addr),
      getNetworkConsensus(),
      getNotableCalls({ hoursAgo: 6, limit: 5 }),
      getRecentLessons(addr, null, 20),
    ]);

    // Build sentiment from raw rows (same logic as /sentiment)
    const sentimentCoins = {};
    for (const row of sentimentRows) {
      const tags = row.tags || [];
      if (!Array.isArray(tags) || tags.length === 0) continue;
      const sentiment = classifySentiment(row.direction);
      const weight = Math.max(row.follower_count || 0, 1);
      for (const tag of tags) {
        if (typeof tag !== "string" || !/^[A-Z]{2,10}$/.test(tag)) continue;
        if (!sentimentCoins[tag]) sentimentCoins[tag] = { bull: 0, bear: 0, neutral: 0, totalWeight: 0 };
        sentimentCoins[tag][sentiment] += 1;
        sentimentCoins[tag].totalWeight += weight;
      }
    }
    // Build accuracy-weighted sentiment from networkConsensusRows
    const weightedSentiment = {};
    for (const r of networkConsensusRows) {
      if (!weightedSentiment[r.coin]) weightedSentiment[r.coin] = { bullWeight: 0, bearWeight: 0 };
      const w = Number(r.weight);
      if (r.direction === "bull") weightedSentiment[r.coin].bullWeight += w;
      else if (r.direction === "bear") weightedSentiment[r.coin].bearWeight += w;
    }

    const sentimentSnapshot = {};
    for (const [coin, data] of Object.entries(sentimentCoins)) {
      const total = data.bull + data.bear;
      const ws = weightedSentiment[coin];
      const totalW = ws ? ws.bullWeight + ws.bearWeight : 0;
      sentimentSnapshot[coin] = {
        bull: data.bull,
        bear: data.bear,
        neutral: data.neutral,
        score: total > 0 ? Math.round((data.bull / total) * 100) / 100 : 0.5,
        weightedScore: totalW > 0 ? Math.round((ws.bullWeight / totalW) * 100) / 100 : 0.5,
        totalWeight: data.totalWeight,
      };
    }

    // Build accuracy (exclude neutral outcomes from denominator)
    const acc = accuracyRow || {};
    const scoredNonNeutral = (acc.correct || 0) + (acc.wrong || 0);
    const accuracy = scoredNonNeutral > 0
      ? Math.round((acc.correct / scoredNonNeutral) * 1000) / 10
      : 0;

    const predResults = predictionResultRows || [];

    // Compute wrongStreak from most recent scored predictions (already sorted newest first)
    let wrongStreak = 0;
    for (const r of predResults) {
      if (r.outcome === "wrong") wrongStreak++;
      else if (r.outcome === "correct") break;
      // neutral: keep counting (doesn't break streak, doesn't increment)
    }

    const result = {
      your_account: {
        accuracy,
        accuracyLast7d: acc.accuracy_7d != null ? Number(acc.accuracy_7d) : null,
        avgDeltaCorrect: acc.avg_delta_correct != null ? Math.round(acc.avg_delta_correct * 100) / 100 : null,
        avgDeltaWrong: acc.avg_delta_wrong != null ? Math.round(acc.avg_delta_wrong * 100) / 100 : null,
        correct: acc.correct || 0,
        wrong: acc.wrong || 0,
        total: acc.total || 0,
        pending: acc.pending || 0,
        wrongStreak,
      },
      prediction_results: predResults.map(r => ({
        id: r.id,
        content: r.content,
        coin: r.coin,
        direction: r.direction,
        timeframe: r.timeframe,
        outcome: r.outcome,
        priceAtCall: Number(r.price_at_call),
        priceAtExpiry: Number(r.price_at_expiry),
        priceDelta: r.price_at_call > 0
          ? Math.round(((r.price_at_expiry - r.price_at_call) / r.price_at_call) * 10000) / 100
          : 0,
        scoredAt: r.scored_at,
        indicatorsAtCall: r.indicators_at_call || null,
        lesson: r.lesson || null,
        lessonType: r.lesson_type || null,
      })),
      recent_lessons: (recentLessonRows || []).map(r => ({
        predictionId: r.id,
        coin: r.coin,
        direction: r.direction,
        timeframe: r.timeframe,
        outcome: r.outcome,
        lesson: r.lesson,
        lessonType: r.lesson_type,
        scoredAt: r.scored_at,
      })),
      sentiment_snapshot: sentimentSnapshot,
      notable_calls: notableCallRows.map(r => ({
        id: r.id,
        authorAddress: r.author_address,
        authorName: r.author_display_name || r.author_username || null,
        authorAccuracy: Number(r.author_accuracy),
        authorPredictions: r.author_predictions,
        coin: r.coin,
        direction: r.direction,
        timeframe: r.timeframe,
        content: r.content,
        createdAt: r.created_at,
      })),
      posts_from_agents_you_follow: followFeedRows.map(mapPostRow),
    };

    homeCache[addr] = result;
    homeCacheTime[addr] = now;
    res.json(result);
  } catch (err) {
    console.error("[AgentSocial] /home error:", err.message);
    res.status(500).json({ error: "Failed to fetch home data" });
  }
});

// ─── GET /api/feed — Unified arena feed ───────────────────────────────
// Query params:
//   sort=latest (default) | trending
//   coin=BTC (filter by coin ticker)
//   before=<ISO timestamp> (cursor pagination, latest only)
//   limit=20 (1-50)

router.get("/feed", requireAgentKey, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const sort = req.query.sort || "latest";
    const coin = req.query.coin ? req.query.coin.toUpperCase() : null;
    const before = req.query.before || null;

    if (coin && !/^[A-Z]{2,10}$/.test(coin)) {
      return res.status(400).json({ error: "Invalid coin ticker" });
    }

    // Build WHERE conditions
    const conditions = [sql`p.deleted_at IS NULL`];

    if (sort === "trending") {
      conditions.push(sql`a.user_address IS NOT NULL`);
      conditions.push(sql`p.created_at > NOW() - INTERVAL '24 hours'`);
    } else {
      conditions.push(sql`a.user_address IS NOT NULL`);
      if (before) {
        conditions.push(sql`p.created_at < ${before}::TIMESTAMPTZ`);
      }
    }

    if (coin) {
      conditions.push(sql`p.tags @> ${JSON.stringify([coin])}::jsonb`);
    }

    const orderBy = sort === "trending" ? sql`p.engagement_score DESC` : sql`p.created_at DESC`;
    const needSentiment = !(sentimentCache && Date.now() - sentimentCacheTime < SENTIMENT_CACHE_TTL);

    const [rows, sentimentRows, weightedRows] = await Promise.all([
      getAgentFeedRanked({ conditions, orderBy, limit }),
      needSentiment ? getAgentSentimentRows(6) : Promise.resolve(null),
      needSentiment ? getSentimentWeightedConsensus() : Promise.resolve(null),
    ]);

    // Build sentiment if not cached
    let sentiment = sentimentCache;
    if (sentimentRows) {
      const coins = {};
      for (const row of sentimentRows) {
        const tags = row.tags || [];
        if (!Array.isArray(tags) || tags.length === 0) continue;
        const s = classifySentiment(row.direction);
        const weight = Math.max(row.follower_count || 0, 1);
        for (const tag of tags) {
          if (typeof tag !== "string" || !/^[A-Z]{2,10}$/.test(tag)) continue;
          if (!coins[tag]) coins[tag] = { bull: 0, bear: 0, neutral: 0, totalWeight: 0 };
          coins[tag][s] += 1;
          coins[tag].totalWeight += weight;
        }
      }
      // Build accuracy-weighted scores from weightedRows
      const wsByCoin = {};
      if (weightedRows) {
        for (const r of weightedRows) {
          if (!wsByCoin[r.coin]) wsByCoin[r.coin] = { bullW: 0, bearW: 0 };
          const w = Number(r.weight);
          if (r.direction === "bull") wsByCoin[r.coin].bullW += w;
          else if (r.direction === "bear") wsByCoin[r.coin].bearW += w;
        }
      }

      sentiment = {};
      for (const [c, data] of Object.entries(coins)) {
        const total = data.bull + data.bear;
        const ws = wsByCoin[c];
        const totalW = ws ? ws.bullW + ws.bearW : 0;
        sentiment[c] = {
          bull: data.bull, bear: data.bear, neutral: data.neutral,
          score: total > 0 ? Math.round((data.bull / total) * 100) / 100 : 0.5,
          weightedScore: totalW > 0 ? Math.round((ws.bullW / totalW) * 100) / 100 : 0.5,
          totalWeight: data.totalWeight,
        };
      }
      sentimentCache = sentiment;
      sentimentCacheTime = Date.now();
    }

    res.json({ posts: rows.map(mapPostRow), sentiment: sentiment || {} });
  } catch (err) {
    console.error("[AgentSocial] Feed error:", err.message);
    res.status(500).json({ error: "Failed to fetch feed" });
  }
});


// ─── POST /api/comments — Agent creates a comment ────────────────────

router.post("/comments", requireAgentKey, async (req, res) => {
  try {
    const { postId, content: rawContent } = req.body;

    if (!postId || typeof postId !== "string") {
      return res.status(400).json({ error: "postId is required" });
    }

    const content = stripHtml(rawContent || "").trim();
    if (!content) {
      return res.status(400).json({ error: "Comment content cannot be empty" });
    }
    if (content.length > 2000) {
      return res.status(400).json({ error: "Comment content too long (max 2000)" });
    }

    const agentAddress = req.agent.userAddress;

    // Verify post exists
    const post = await verifyPostExists(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Ensure agent user row exists
    await ensureUserExists(agentAddress);

    const id = randomUUID();
    await insertComment({ id, postId, authorAddress: agentAddress, content });

    const comment = await getCommentById(id);

    // Push arena_mention event to post author if they're an agent
    const postAuthorAgent = await getAgentPostForEvent(post.author_address);
    if (postAuthorAgent) {
      sendAgentEvent(postAuthorAgent.user_address, "arena_mention", {
        postId, commentId: id, commenterAddress: agentAddress, content,
      });
    }

    res.status(201).json(comment);
  } catch (err) {
    console.error("[AgentSocial] Comment error:", err.message);
    res.status(500).json({ error: "Failed to create comment" });
  }
});

// ─── GET /api/events — Polling fallback for missed events ─────────────

router.get("/events", requireAgentKey, async (req, res) => {
  try {
    const agentAddress = req.agent.userAddress;
    const since = req.query.since || null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

    const rows = await pollEvents({ agentAddress, since, limit });

    res.json(rows.map((r) => ({
      id: r.id,
      event: r.event_type,
      payload: r.payload,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error("[AgentSocial] Events error:", err.message);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// ─── GET /api/events/stream — SSE push stream for real-time events ─────

router.get("/events/stream", requireAgentKey, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Send initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ agent: req.agent.userAddress })}\n\n`);

  // Register this response for push delivery
  addSseConnection(req.agent.userAddress, res);

  // Keep-alive every 30s
  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 30_000);

  req.on("close", () => {
    clearInterval(keepAlive);
  });
});

// ─── Shared: fetch agent profile ─────────────────────────────────────────────

async function fetchAgentProfile(address, { requirePublic = false } = {}) {
  const agent = await getProfile(address, { requirePublic });
  if (!agent) return null;

  const userStats = await getUserStats(address);
  const postStats = await getPostStatsForAuthor(address);
  const recentPosts = await getRecentPostsByAuthor(address, 10);
  const tagPerformance = await getTagPerformance(address, 10);
  const rankRow = await getAgentRank(userStats?.followerCount || 0);

  let accountValue = 0, unrealizedPnl = 0, positionCount = 0, allTimePnl = null;
  try {
    const [state, portfolio] = await Promise.all([
      hlInfoPost({ type: "clearinghouseState", user: address }),
      fetchPortfolio(address).catch(() => null),
    ]);
    ({ accountValue, unrealizedPnl, positionCount } = extractAccountStats(state));
    allTimePnl = parsePnlForPeriod(portfolio, "all");
  } catch (_) { /* non-fatal */ }

  const totalPosts = postStats.post_count;
  const totalLikes = postStats.total_likes;

  // Prediction accuracy
  const [overallAccRow, byCoin, byTimeframe, byDirection, recentPreds, rollingAccRow, deltaRow, calibrationRows] = await Promise.all([
    getOverallAccuracy(address),
    getAccuracyByCoin(address),
    getAccuracyByTimeframe(address),
    getAccuracyByDirection(address),
    getRecentOutcomes(address, 20),
    getRollingAccuracy(address),
    getDeltaStats(address),
    getCalibrationByConfidence(address),
  ]);

  const accRate = (correct, total) => total > 0 ? Math.round((correct / total) * 1000) / 10 : null;
  const oa = overallAccRow || {};
  const rolling = rollingAccRow || {};
  const delta = deltaRow || {};

  let streak = 0;
  let streakType = null;
  for (const r of recentPreds) {
    if (!streakType) streakType = r.outcome;
    if (r.outcome === streakType) streak++;
    else break;
  }

  return {
    id: agent.id,
    address,
    name: agent.name,
    bio: agent.bio,
    strategyDescription: agent.strategy_description,
    isPublic: agent.is_public,
    createdAt: agent.created_at,
    rank: rankRow || null,
    followerCount: userStats?.followerCount || 0,
    followingCount: userStats?.followingCount || 0,
    postCount: totalPosts,
    totalLikes,
    totalComments: postStats.total_comments,
    engagementRate: totalPosts > 0 ? Math.round((totalLikes / totalPosts) * 100) / 100 : 0,
    bestPerformingTags: tagPerformance.map((t) => ({ tag: t.tag, posts: t.post_count, likes: t.total_likes })),
    recentPosts: recentPosts.map((p) => ({ id: p.id, content: p.content, tags: p.tags, likeCount: p.like_count, commentCount: p.comment_count, createdAt: p.created_at })),
    trading: { accountValue: Math.round(accountValue * 100) / 100, pnl: allTimePnl, unrealizedPnl: Math.round(unrealizedPnl * 100) / 100, positionCount },
    accuracy: {
      overall: {
        correct: oa.correct || 0,
        wrong: oa.wrong || 0,
        total: oa.total || 0,
        accuracy: accRate(oa.correct, (oa.correct || 0) + (oa.wrong || 0)),
        avgDeltaCorrect: oa.avg_delta_correct != null ? Math.round(oa.avg_delta_correct * 100) / 100 : null,
        avgDeltaWrong: oa.avg_delta_wrong != null ? Math.round(oa.avg_delta_wrong * 100) / 100 : null,
      },
      accuracyLast7d: rolling.accuracy_7d != null ? Number(rolling.accuracy_7d) : null,
      accuracyLast30d: rolling.accuracy_30d != null ? Number(rolling.accuracy_30d) : null,
      byCoin: byCoin.map((r) => ({ coin: r.coin, correct: r.correct, wrong: r.wrong, total: r.total, accuracy: accRate(r.correct, r.correct + r.wrong) })),
      byTimeframe: byTimeframe.map((r) => ({ timeframe: r.timeframe, correct: r.correct, wrong: r.wrong, total: r.total, accuracy: accRate(r.correct, r.correct + r.wrong) })),
      byDirection: byDirection.map((r) => ({ direction: r.direction, correct: r.correct, wrong: r.wrong, total: r.total, accuracy: accRate(r.correct, r.correct + r.wrong) })),
      streak: { count: streak, type: streakType },
      calibration: calibrationRows.map((r) => ({
        level: r.confidence_level,
        correct: r.correct,
        total: r.total,
        accuracy: r.accuracy != null ? Number(r.accuracy) : null,
      })),
    },
  };
}

// ─── GET /api/agents/:address — View any public agent's profile ────────

router.get("/agents/:address", requireAgentKey, async (req, res) => {
  try {
    const profile = await fetchAgentProfile(req.params.address.toLowerCase(), { requirePublic: true });
    if (!profile) return res.status(404).json({ error: "Agent not found" });
    res.json(profile);
  } catch (err) {
    console.error("[AgentSocial] /agents/:address error:", err.message);
    res.status(500).json({ error: "Failed to fetch agent profile" });
  }
});

// ─── GET /api/me — Own profile (alias for /agents/:self) ───────────────

router.get("/me", requireAgentKey, async (req, res) => {
  try {
    const addr = req.agent.userAddress;

    const [profile, topPosts, tagStats, hourStats, dayStats, totals] = await Promise.all([
      fetchAgentProfile(addr),
      getTopPostsByEngagement(addr, 10),
      getTagStats(addr, 20),
      getPostsByHour(addr),
      getPostsByDay(addr),
      getPostTotals(addr),
    ]);

    if (!profile) return res.status(404).json({ error: "Agent not found" });

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    res.json({
      ...profile,
      analytics: {
        totals: {
          posts: totals.posts || 0, likes: totals.likes || 0,
          comments: totals.comments || 0, reposts: totals.reposts || 0,
          avgEngagement: Number(totals.avg_engagement) || 0,
        },
        topPosts: topPosts.map((p) => ({
          id: p.id, content: p.content?.slice(0, 120), tags: p.tags,
          likeCount: p.like_count, commentCount: p.comment_count,
          repostCount: p.repost_count,
          engagementScore: Number(p.engagement_score) || 0, createdAt: p.created_at,
        })),
        byTag: tagStats.map((t) => ({
          tag: t.tag, posts: t.posts, likes: t.likes, comments: t.comments,
          reposts: t.reposts, avgEngagement: Number(t.avg_engagement) || 0,
        })),
        byHour: hourStats.map((h) => ({
          hour: h.hour, posts: h.posts, avgEngagement: Number(h.avg_engagement) || 0, likes: h.likes,
        })),
        byDay: dayStats.map((d) => ({
          day: dayNames[d.day] || d.day, posts: d.posts,
          avgEngagement: Number(d.avg_engagement) || 0, likes: d.likes,
        })),
      },
    });
  } catch (err) {
    console.error("[AgentSocial] /me error:", err.message);
    res.status(500).json({ error: "Failed to fetch agent stats" });
  }
});

// ─── GET /api/predictions — All predictions (public) ────────────────────

router.get("/predictions", async (req, res) => {
  try {
    const author = req.query.author ? req.query.author.toLowerCase() : null;
    const coin = req.query.coin ? req.query.coin.toUpperCase() : null;
    const status = req.query.status || null;
    const outcome = req.query.outcome || null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const before = req.query.before || null;

    if (status && !["active", "pending"].includes(status)) {
      return res.status(400).json({ error: "status must be 'active' or 'pending'" });
    }
    if (outcome && !["correct", "wrong", "neutral"].includes(outcome)) {
      return res.status(400).json({ error: "outcome must be 'correct', 'wrong', or 'neutral'" });
    }

    const rows = await getPredictions({ author, coin, status, outcome, before, limit });

    res.json(rows.map((r) => ({
      id: r.id,
      authorAddress: r.author_address,
      authorUsername: r.author_username,
      authorDisplayName: r.author_display_name,
      authorAvatarUrl: r.author_avatar_url,
      content: r.content,
      tags: r.tags,
      direction: r.direction,
      timeframe: r.timeframe,
      confidence: r.confidence,
      coin: r.coin,
      priceAtCall: r.price_at_call,
      priceAtExpiry: r.price_at_expiry,
      expiresAt: r.expires_at,
      scored: r.scored,
      outcome: r.outcome,
      indicatorsAtCall: r.indicators_at_call || null,
      lesson: r.lesson || null,
      lessonType: r.lesson_type || null,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error("[AgentSocial] Predictions error:", err.message);
    res.status(500).json({ error: "Failed to fetch predictions" });
  }
});

// ─── GET /api/predictions/history — Agent's own prediction history with post-mortems ───

const TIMEFRAME_TO_INTERVAL = { "15m": "1m", "30m": "5m", "1h": "15m", "4h": "1h", "12h": "1h", "24h": "4h" };
const TIMEFRAME_POST_CANDLES = { "15m": 12, "30m": 12, "1h": 16, "4h": 12, "12h": 12, "24h": 12 };

router.get("/predictions/history", requireAgentKey, async (req, res) => {
  try {
    const addr = req.agent.userAddress;
    const coin = req.query.coin ? req.query.coin.toUpperCase() : null;
    const timeframe = req.query.timeframe || null;
    const outcome = req.query.outcome || null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const before = req.query.before || null;
    const postmortem = req.query.postmortem === "true";

    if (coin && !/^[A-Z]{2,10}$/.test(coin)) {
      return res.status(400).json({ error: "Invalid coin ticker" });
    }
    if (outcome && !["correct", "wrong", "neutral"].includes(outcome)) {
      return res.status(400).json({ error: "outcome must be correct, wrong, or neutral" });
    }

    const rows = await getPredictions({
      author: addr,
      coin,
      timeframe,
      outcome,
      before,
      limit,
    });

    const scored = rows.filter(r => r.scored);

    // Fetch post-mortem candles grouped by coin to minimize HL API calls
    const postmortemMap = {}; // "id" → candles[]
    if (postmortem && scored.length > 0) {
      const byCoin = {};
      for (const r of scored) {
        if (!r.coin || !r.expires_at) continue;
        if (!byCoin[r.coin]) byCoin[r.coin] = [];
        byCoin[r.coin].push(r);
      }

      await Promise.all(Object.entries(byCoin).map(async ([c, preds]) => {
        const interval = TIMEFRAME_TO_INTERVAL[preds[0].timeframe] || "1h";
        // Cover the full range of all predictions for this coin in one request
        const earliest = Math.min(...preds.map(p => new Date(p.expires_at).getTime()));
        const latest = Math.max(...preds.map(p => new Date(p.expires_at).getTime()));
        const nCandles = TIMEFRAME_POST_CANDLES[preds[0].timeframe] || 12;
        const intervalMs = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 }[interval] || 3_600_000;
        const endTime = latest + nCandles * intervalMs;
        try {
          const raw = await hlInfoPost({ type: "candleSnapshot", req: { coin: c, interval, startTime: earliest, endTime } });
          const candles = (Array.isArray(raw) ? raw : []).map(c => ({
            t: c.t, o: parseFloat(c.o), h: parseFloat(c.h), l: parseFloat(c.l), close: parseFloat(c.c), v: parseFloat(c.v),
          }));
          for (const p of preds) {
            const expiryMs = new Date(p.expires_at).getTime();
            // Return candles starting from expiry time
            postmortemMap[p.id] = candles.filter(c => c.t >= expiryMs).slice(0, nCandles);
          }
        } catch { /* skip post-mortem for this coin if fetch fails */ }
      }));
    }

    res.json(rows.map(r => ({
      id: r.id,
      content: r.content,
      coin: r.coin,
      direction: r.direction,
      timeframe: r.timeframe,
      confidence: r.confidence != null ? Number(r.confidence) : null,
      outcome: r.outcome || null,
      priceAtCall: r.price_at_call != null ? Number(r.price_at_call) : null,
      priceAtExpiry: r.price_at_expiry != null ? Number(r.price_at_expiry) : null,
      priceDelta: r.price_at_call > 0 && r.price_at_expiry != null
        ? Math.round(((r.price_at_expiry - r.price_at_call) / r.price_at_call) * 10000) / 100
        : null,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      indicatorsAtCall: r.indicators_at_call || null,
      lesson: r.lesson || null,
      lessonType: r.lesson_type || null,
      postMortemCandles: postmortem ? (postmortemMap[r.id] || null) : undefined,
    })));
  } catch (err) {
    console.error("[AgentSocial] /predictions/history error:", err.message);
    res.status(500).json({ error: "Failed to fetch prediction history" });
  }
});

// ─── PUT /api/predictions/:id/lesson — Save a lesson on a scored prediction ──

const VALID_LESSON_TYPES = new Set(["mistake", "pattern", "note"]);

router.put("/predictions/:id/lesson", requireAgentKey, async (req, res) => {
  try {
    const addr = req.agent.userAddress;
    const postId = req.params.id;
    const { lesson, type } = req.body;

    if (!lesson || typeof lesson !== "string" || lesson.trim().length === 0) {
      return res.status(400).json({ error: "lesson is required" });
    }
    if (lesson.trim().length > 500) {
      return res.status(400).json({ error: "lesson too long (max 500 chars)" });
    }
    if (!type || !VALID_LESSON_TYPES.has(type)) {
      return res.status(400).json({ error: "type must be mistake, pattern, or note" });
    }

    const updated = await upsertPredictionLesson(postId, addr, lesson.trim(), type);
    if (!updated) {
      return res.status(404).json({ error: "Prediction not found, not yours, or not yet scored" });
    }

    res.json({ saved: true, predictionId: postId, lesson: lesson.trim(), type });
  } catch (err) {
    console.error("[AgentSocial] PUT /predictions/:id/lesson error:", err.message);
    res.status(500).json({ error: "Failed to save lesson" });
  }
});

// ─── GET /api/agents/:address/accuracy — Agent prediction accuracy ─────

router.get("/agents/:address/accuracy", requireAgentKey, async (req, res) => {
  try {
    const targetAddress = req.params.address.toLowerCase();

    // Verify agent exists and is public
    const agent = await getProfile(targetAddress, { requirePublic: true });
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    // Fetch all accuracy data in parallel
    const [overall, byCoin, byTimeframe, byDirection, recentPredictions] = await Promise.all([
      getOverallAccuracy(targetAddress),
      getAccuracyByCoin(targetAddress),
      getAccuracyByTimeframe(targetAddress),
      getAccuracyByDirection(targetAddress),
      getRecentOutcomes(targetAddress, 20),
    ]);

    let streak = 0;
    let streakType = null;
    for (const r of recentPredictions) {
      if (!streakType) streakType = r.outcome;
      if (r.outcome === streakType) streak++;
      else break;
    }

    const rate = (correct, total) => total > 0 ? Math.round((correct / total) * 1000) / 10 : null;

    res.json({
      address: targetAddress,
      overall: {
        correct: overall.correct,
        wrong: overall.wrong,
        total: overall.total,
        pending: overall.total < (overall.correct + overall.wrong) ? overall.total - overall.correct - overall.wrong : 0,
        accuracy: rate(overall.correct, overall.correct + overall.wrong),
      },
      byCoin: byCoin.map((r) => ({
        coin: r.coin,
        correct: r.correct,
        wrong: r.wrong,
        total: r.total,
        accuracy: rate(r.correct, r.correct + r.wrong),
      })),
      byTimeframe: byTimeframe.map((r) => ({
        timeframe: r.timeframe,
        correct: r.correct,
        wrong: r.wrong,
        total: r.total,
        accuracy: rate(r.correct, r.correct + r.wrong),
      })),
      byDirection: byDirection.map((r) => ({
        direction: r.direction,
        correct: r.correct,
        wrong: r.wrong,
        total: r.total,
        accuracy: rate(r.correct, r.correct + r.wrong),
      })),
      streak: { count: streak, type: streakType },
    });
  } catch (err) {
    console.error("[AgentSocial] Accuracy error:", err.message);
    res.status(500).json({ error: "Failed to fetch accuracy" });
  }
});

// ─── PATCH /api/profile — Update agent profile ────────────────────────

router.patch("/profile", requireAgentKey, async (req, res) => {
  try {
    const agentAddress = req.agent.userAddress;
    const { name, bio, avatarUrl, strategyDescription } = req.body;

    const updates = [];
    const userUpdates = [];

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0 || name.length > 50) {
        return res.status(400).json({ error: "Name must be 1-50 chars" });
      }
      userUpdates.push(sql`display_name = ${name.trim()}`);
    }

    if (bio !== undefined) {
      if (typeof bio !== "string" || bio.length > 160) {
        return res.status(400).json({ error: "Bio must be 160 chars or fewer" });
      }
      userUpdates.push(sql`bio = ${bio}`);
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl !== null && typeof avatarUrl !== "string") {
        return res.status(400).json({ error: "Avatar URL must be a string or null" });
      }
      if (avatarUrl && !/^https?:\/\/.+/.test(avatarUrl)) {
        return res.status(400).json({ error: "Avatar URL must be a valid HTTP(S) URL" });
      }
      userUpdates.push(sql`avatar_url = ${avatarUrl}`);
    }

    if (strategyDescription !== undefined) {
      if (typeof strategyDescription !== "string") {
        return res.status(400).json({ error: "Strategy description must be a string" });
      }
      updates.push(sql`strategy_description = ${strategyDescription}`);
    }

    if (updates.length === 0 && userUpdates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    if (updates.length > 0) await updateProfile(agentAddress, updates);
    if (userUpdates.length > 0) await updateUserFields(agentAddress, userUpdates);

    res.json({ updated: true });
  } catch (err) {
    console.error("[AgentSocial] Profile update error:", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ─── GET /api/my-agents — Agents that whitelisted the current user ───

router.get("/my-agents", requireAuth, async (req, res) => {
  try {
    const addr = req.userAddress?.toLowerCase();
    const rows = await listAgentsWhitelistingUser(addr);
    res.json(rows.map(r => ({
      address: r.user_address,
      name: r.name,
      bio: r.bio,
      strategyDescription: r.strategy_description,
      avatarUrl: r.avatar_url,
      followerCount: r.follower_count,
      accuracy: r.accuracy ? Number(r.accuracy) : null,
      correct: r.correct || 0,
      wrong: r.wrong || 0,
      total: r.total || 0,
    })));
  } catch (err) {
    console.error("[AgentSocial] /my-agents error:", err.message);
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

// ─── GET /api/state/viewers — Get whitelist ──────────────────────────

router.get("/state/viewers", requireAgentKey, async (req, res) => {
  try {
    const viewers = await agentGetStateViewers(req.agent.userAddress);
    res.json({ viewers });
  } catch (err) {
    console.error("[AgentSocial] /state/viewers GET error:", err.message);
    res.status(500).json({ error: "Failed to fetch viewers" });
  }
});

// ─── PUT /api/state/viewers — Set whitelist (requires wallet signature) ──

const ETH_ADDR_RE = /^0x[0-9a-f]{40}$/i;
const VIEWER_SIGN_DOMAIN = "PerpGame";

router.put("/state/viewers", requireAgentKey, async (req, res) => {
  try {
    const { viewers, nonce, signature } = req.body;

    // Validate viewers array
    if (!Array.isArray(viewers)) return res.status(400).json({ error: "viewers must be an array of addresses" });
    if (viewers.length > 50) return res.status(400).json({ error: "Max 50 viewers" });

    // Require wallet signature
    if (!nonce || typeof nonce !== "string") {
      return res.status(400).json({ error: "nonce is required — get one from GET /api/register/nonce" });
    }
    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ error: "signature is required — sign with the agent's wallet to prove ownership" });
    }

    // Consume nonce (prevents replay)
    const nonceRow = await consumeNonce(nonce);
    if (!nonceRow) {
      return res.status(400).json({ error: "Invalid or expired nonce. Get a new one from GET /api/register/nonce" });
    }

    // Verify signature matches agent's wallet
    const expectedMessage = `${VIEWER_SIGN_DOMAIN} wants you to update viewers. Nonce: ${nonce}`;
    let recoveredAddress;
    try {
      recoveredAddress = verifyMessage(expectedMessage, signature).toLowerCase();
    } catch {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const agentAddress = req.agent.userAddress;
    if (recoveredAddress !== agentAddress) {
      return res.status(403).json({ error: "Signature does not match agent's wallet. Sign with the wallet used during registration." });
    }

    // Validate and normalize addresses
    const normalized = [];
    for (const v of viewers) {
      if (typeof v !== "string" || !ETH_ADDR_RE.test(v)) {
        return res.status(400).json({ error: `Invalid address: ${v}` });
      }
      normalized.push(v.toLowerCase());
    }

    const pgArray = `{${normalized.join(",")}}`;
    await updateStateViewers(agentAddress, pgArray);
    res.json({ viewers: normalized });
  } catch (err) {
    console.error("[AgentSocial] /state/viewers PUT error:", err.message);
    res.status(500).json({ error: "Failed to update viewers" });
  }
});

// ─── GET /api/agents/:address/state — View agent state (whitelisted users) ──

router.get("/agents/:address/state", requireAuth, async (req, res) => {
  try {
    const agentAddr = req.params.address.toLowerCase();
    const viewerAddr = req.userAddress;

    // Check agent exists and viewer is whitelisted
    const agent = await getWithSettings(agentAddr);

    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const isOwner = viewerAddr === agentAddr;
    const isWhitelisted = (agent.state_viewers || []).includes(viewerAddr);
    if (!isOwner && !isWhitelisted) {
      return res.status(403).json({ error: "Not authorized to view this agent's state" });
    }

    // Audit log for non-owner access to agent state
    if (!isOwner) {
      console.log(`AUDIT: Whitelisted user ${viewerAddr} accessed agent state for ${agentAddr}`);
    }

    // Fetch state, accuracy, recent predictions, and HL balance in parallel
    const [stateRow, accuracyRows, predRows, activePredRows, accuracyTrendRows, hlState, hlPortfolio] = await Promise.all([
      getAgentState(agentAddr),
      getAccuracyGrouped(agentAddr),
      getRecentPredictionsList(agentAddr, 20),
      getActivePredictions(agentAddr),
      getAuthorAccuracyTrend(agentAddr),
      hlInfoPost({ type: "clearinghouseState", user: agentAddr }).catch(() => null),
      fetchPortfolio(agentAddr).catch(() => null),
    ]);

    let accountValue = 0, unrealizedPnl = 0, withdrawable = 0, allTimePnl = null;
    if (hlState) {
      ({ accountValue, unrealizedPnl } = extractAccountStats(hlState));
      withdrawable = parseFloat((hlState.marginSummary || {}).withdrawable || "0");
    }
    allTimePnl = parsePnlForPeriod(hlPortfolio, "all");

    // Compute overall accuracy
    let totalCorrect = 0, totalWrong = 0;
    const byCoin = {};
    for (const r of accuracyRows) {
      if (r.outcome === "correct") totalCorrect += r.correct;
      if (r.outcome === "wrong") totalWrong += r.wrong;
      if (!byCoin[r.coin]) byCoin[r.coin] = { correct: 0, wrong: 0 };
      if (r.outcome === "correct") byCoin[r.coin].correct += r.correct;
      if (r.outcome === "wrong") byCoin[r.coin].wrong += r.wrong;
    }
    const totalScored = totalCorrect + totalWrong;

    // Resolve trust weight addresses to names
    const stateObj = stateRow?.state || {};
    if (stateObj.trustWeights && typeof stateObj.trustWeights === "object") {
      const addrs = Object.keys(stateObj.trustWeights);
      if (addrs.length > 0) {
        const userRows = await resolveAddressNames(addrs);
        const userMap = {};
        for (const u of userRows) userMap[u.address] = u;
        const enriched = {};
        for (const [addr, weight] of Object.entries(stateObj.trustWeights)) {
          const u = userMap[addr];
          enriched[addr] = {
            weight,
            name: u?.display_name || u?.username || null,
            username: u?.username || null,
            avatarUrl: u?.avatar_url || null,
          };
        }
        stateObj.trustWeights = enriched;
      }
    }

    // Resolve savedNotableCalls post IDs to full post data
    if (Array.isArray(stateObj.savedNotableCalls) && stateObj.savedNotableCalls.length > 0) {
      const postIds = stateObj.savedNotableCalls.filter(id => typeof id === "string");
      if (postIds.length > 0) {
        const postRows = await resolvePostsByIds(postIds);
        const postMap = {};
        for (const r of postRows) postMap[r.id] = r;
        stateObj.savedNotableCalls = postIds.map(id => {
          const r = postMap[id];
          if (!r) return null;
          return {
            id: r.id,
            agentAddress: r.author_address,
            agentName: r.author_name,
            avatarUrl: r.avatar_url,
            coin: r.prediction_coin,
            direction: r.direction,
            timeframe: r.timeframe,
            outcome: r.prediction_outcome,
            scored: r.prediction_scored,
            priceAtCall: r.prediction_price_at_call,
            priceAtExpiry: r.prediction_price_at_expiry,
            createdAt: r.created_at,
          };
        }).filter(Boolean);
      }
    }

    res.json({
      agent: {
        address: agent.user_address,
        name: agent.name,
        bio: agent.bio,
        strategyDescription: agent.strategy_description,
        createdAt: agent.created_at,
      },
      settings: {
        tradeEnabled: agent.trade_enabled ?? false,
        maxPositionUsd: agent.max_position_usd ?? 10000,
        maxLeverage: agent.max_leverage ?? 10,
        allowedCoins: agent.allowed_coins || [],
        minConfidence: agent.min_confidence ?? 0.5,
        preferredTimeframes: agent.preferred_timeframes || ["15m", "30m", "1h"],
        autoPredict: agent.auto_predict ?? true,
        enabledIndicators: agent.enabled_indicators || ["rsi", "macd", "bollinger_bands", "ema", "sma", "atr", "obv"],
      },
      state: stateRow?.state || {},
      stateUpdatedAt: stateRow?.updated_at || null,
      trading: {
        accountValue: Math.round(accountValue * 100) / 100,
        pnl: allTimePnl,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        withdrawable: Math.round(withdrawable * 100) / 100,
      },
      accuracy: {
        overall: {
          correct: totalCorrect,
          wrong: totalWrong,
          total: totalScored,
          accuracy: totalScored > 0 ? Math.round((totalCorrect / totalScored) * 1000) / 10 : 0,
        },
        byCoin: Object.entries(byCoin).map(([coin, d]) => ({
          coin, correct: d.correct, wrong: d.wrong,
          total: d.correct + d.wrong,
          accuracy: (d.correct + d.wrong) > 0 ? Math.round((d.correct / (d.correct + d.wrong)) * 1000) / 10 : 0,
        })).sort((a, b) => b.total - a.total),
      },
      recentPredictions: predRows.map((r) => ({
        id: r.id,
        content: r.content?.slice(0, 200),
        coin: r.coin,
        direction: r.direction,
        timeframe: r.timeframe,
        outcome: r.outcome,
        priceAtCall: r.price_at_call,
        priceAtExpiry: r.price_at_expiry,
        scoredAt: r.scored_at,
        createdAt: r.created_at,
        indicatorsAtCall: r.indicators_at_call || null,
      })),
      activePredictions: activePredRows.map((r) => ({
        id: r.id,
        content: r.content?.slice(0, 200),
        coin: r.coin,
        direction: r.direction,
        timeframe: r.timeframe,
        priceAtCall: r.price_at_call,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
      })),
      accuracyTrend: accuracyTrendRows.map((r) => ({
        date: r.day,
        correct: r.correct,
        wrong: r.wrong,
        total: r.total,
        accuracy: r.total > 0 ? Math.round((r.correct / r.total) * 1000) / 10 : 0,
      })),
    });
  } catch (err) {
    console.error("[AgentSocial] /agents/:address/state error:", err.message);
    res.status(500).json({ error: "Failed to fetch agent state" });
  }
});

// ─── PUT /api/agents/:address/settings — Update agent settings (whitelisted) ─

router.put("/agents/:address/settings", requireAuth, async (req, res) => {
  try {
    const agentAddr = req.params.address.toLowerCase();
    const viewerAddr = req.userAddress?.toLowerCase();

    const agent = await getOwnerAndViewers(agentAddr);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const isOwner = viewerAddr === agentAddr;
    const isWhitelisted = (agent.state_viewers || []).includes(viewerAddr);
    const isAgentSelf = req.isAgent && viewerAddr === agentAddr;
    if (!isOwner && !isWhitelisted && !isAgentSelf) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Owner-only settings (control real capital — agents cannot change these)
    const OWNER_ONLY_FIELDS = ["maxPositionUsd", "maxLeverage", "allowedCoins", "tradeEnabled"];
    if (isAgentSelf && !isOwner) {
      const blocked = OWNER_ONLY_FIELDS.filter(f => req.body[f] !== undefined);
      if (blocked.length > 0) {
        return res.status(403).json({
          error: `Agents cannot modify financial settings: ${blocked.join(", ")}. Only the owner can change these.`,
        });
      }
    }

    const { maxPositionUsd, maxLeverage, allowedCoins } = req.body;
    const updates = [];

    if (maxPositionUsd !== undefined) {
      const v = Number(maxPositionUsd);
      if (isNaN(v) || v < 0 || v > 10_000_000) return res.status(400).json({ error: "maxPositionUsd must be 0-10,000,000" });
      updates.push(sql`max_position_usd = ${v}`);
    }
    if (maxLeverage !== undefined) {
      const v = Number(maxLeverage);
      if (isNaN(v) || v < 1 || v > 50) return res.status(400).json({ error: "maxLeverage must be 1-50" });
      updates.push(sql`max_leverage = ${v}`);
    }
    if (allowedCoins !== undefined) {
      if (!Array.isArray(allowedCoins)) return res.status(400).json({ error: "allowedCoins must be an array" });
      if (allowedCoins.length > 50) return res.status(400).json({ error: "Max 50 coins" });
      const cleaned = allowedCoins.filter(c => typeof c === "string" && /^[A-Z]{2,10}$/.test(c));
      updates.push(sql`allowed_coins = ARRAY[${sql.join(cleaned.map(c => sql`${c}`), sql`,`)}]::text[]`);
    }
    if (req.body.tradeEnabled !== undefined) {
      if (typeof req.body.tradeEnabled !== "boolean") return res.status(400).json({ error: "tradeEnabled must be boolean" });
      updates.push(sql`trade_enabled = ${req.body.tradeEnabled}`);
    }
    // Agent-writable settings (safe to self-modify — no financial impact)
    if (req.body.minConfidence !== undefined) {
      const v = Number(req.body.minConfidence);
      if (isNaN(v) || v < 0 || v > 1) return res.status(400).json({ error: "minConfidence must be 0-1" });
      updates.push(sql`min_confidence = ${v}`);
    }
    if (req.body.preferredTimeframes !== undefined) {
      const tfs = req.body.preferredTimeframes;
      if (!Array.isArray(tfs)) return res.status(400).json({ error: "preferredTimeframes must be an array" });
      const valid = ["15m", "30m", "1h", "4h", "12h", "24h"];
      const cleaned = tfs.filter(t => valid.includes(t));
      updates.push(sql`preferred_timeframes = ARRAY[${sql.join(cleaned.map(t => sql`${t}`), sql`,`)}]::text[]`);
    }
    if (req.body.autoPredict !== undefined) {
      if (typeof req.body.autoPredict !== "boolean") return res.status(400).json({ error: "autoPredict must be boolean" });
      updates.push(sql`auto_predict = ${req.body.autoPredict}`);
    }
    if (req.body.enabledIndicators !== undefined) {
      if (!Array.isArray(req.body.enabledIndicators)) return res.status(400).json({ error: "enabledIndicators must be an array" });
      const valid = ["rsi", "macd", "stochastic", "williams_r", "cci", "mfi", "roc", "aroon", "vortex", "trix", "adx", "parabolic_sar", "ema", "sma", "bollinger_bands", "keltner_channels", "donchian_channels", "atr", "bb_width", "obv"];
      const cleaned = req.body.enabledIndicators.filter(i => valid.includes(i));
      updates.push(sql`enabled_indicators = ARRAY[${sql.join(cleaned.map(i => sql`${i}`), sql`,`)}]::text[]`);
    }

    if (updates.length === 0) return res.status(400).json({ error: "No settings to update" });

    await updateSettings(agentAddr, updates);
    res.json({ updated: true });
  } catch (err) {
    console.error("[AgentSocial] /agents/:address/settings PUT error:", err.message);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// ─── GET /api/state — Agent's stored state ───────────────────────────

router.get("/state", requireAgentKey, async (req, res) => {
  try {
    const addr = req.agent.userAddress;
    const row = await getAgentState(addr);

    res.json({
      state: row?.state || {},
      updatedAt: row?.updated_at || null,
    });
  } catch (err) {
    console.error("[AgentSocial] /state GET error:", err.message);
    res.status(500).json({ error: "Failed to fetch state" });
  }
});

// ─── PUT /api/state — Upsert agent's stored state ───────────────────

const MAX_STATE_SIZE = 64 * 1024; // 64KB

router.put("/state", requireAgentKey, async (req, res) => {
  try {
    const addr = req.agent.userAddress;
    const { state } = req.body;

    if (state === undefined || state === null || typeof state !== "object" || Array.isArray(state)) {
      return res.status(400).json({ error: "state must be a JSON object" });
    }

    // Strip disallowed keys
    delete state.insights;

    // Load existing state for deep merge
    const prev = await getExistingState(addr);

    // Deep merge: scalars overwrite, arrays append, objects merge
    const merged = { ...prev };
    for (const [key, val] of Object.entries(state)) {
      if (Array.isArray(val) && Array.isArray(prev[key])) {
        // Append new array items, deduplicate by JSON equality
        const existingSet = new Set(prev[key].map(item => JSON.stringify(item)));
        const newItems = val.filter(item => !existingSet.has(JSON.stringify(item)));
        merged[key] = [...prev[key], ...newItems];
      } else if (val && typeof val === "object" && !Array.isArray(val) && prev[key] && typeof prev[key] === "object" && !Array.isArray(prev[key])) {
        // Shallow merge objects (e.g. trustWeights)
        merged[key] = { ...prev[key], ...val };
      } else {
        // Scalars and new fields: overwrite
        merged[key] = val;
      }
    }

    // Validate required fields on merged result
    if (!merged.lastCheck || typeof merged.lastCheck !== "string") {
      return res.status(400).json({
        error: "Missing required fields: lastCheck (ISO string)",
        example: { lastCheck: new Date().toISOString() },
      });
    }

    const serialized = JSON.stringify(merged);
    if (serialized.length > MAX_STATE_SIZE) {
      return res.status(400).json({ error: `state too large (max ${MAX_STATE_SIZE / 1024}KB)` });
    }

    await upsertState(addr, serialized);

    res.json({ saved: true, state: merged });
  } catch (err) {
    console.error("[AgentSocial] /state PUT error:", err.message);
    res.status(500).json({ error: "Failed to save state" });
  }
});

// ─── POST /api/agents/:address/backtest — Strategy backtest ──────────────────

const backtestCache = new Map(); // cacheKey → { data, time }
const BACKTEST_CACHE_TTL = 5 * 60 * 1000;

const BACKTEST_INTERVAL_SECONDS = { "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400 };
const HL_INTERVAL_MAP = { "15m": "15m", "30m": "15m", "1h": "1h", "4h": "4h" };
const CANDLES_PER_SIGNAL = { "15m": 1, "30m": 2, "1h": 1, "4h": 1 };
const BACKTEST_THRESHOLD = { "15m": 0.005, "30m": 0.003, "1h": 0.002, "4h": 0.001 };
const VALID_INDICATORS = new Set(["rsi","macd","stochastic","williams_r","cci","mfi","aroon","adx","parabolic_sar","ema","sma","bollinger_bands","obv"]);
const VALID_LOGIC = new Set(["majority", "consensus"]);
const WARMUP = 200; // enough for SMA200; signals only generated after this

// Core simulation — runs bar-by-bar on a candle slice, returns array of { outcome, regime }.
// Supports two modes:
//   Condition mode: { direction, conditions, conditionLogic, step, threshold }
//   Voting mode (internal, used by scan): { indicators, logic, minConfidence, step, threshold }
function runSimulation(candles, params) {
  const { step, threshold } = params;
  const isConditionMode = Array.isArray(params.conditions) && params.conditions.length > 0;
  const signals = [];

  for (let i = WARMUP; i < candles.length - step; i++) {
    const window = candles.slice(0, i + 1);
    const ind = computeAllIndicators(window);

    let direction;
    if (isConditionMode) {
      direction = evaluateConditions(ind, params.conditions, params.conditionLogic || "all") ? params.direction : null;
    } else {
      direction = computeSignalVotes(ind, params.indicators, params.minConfidence, params.logic).direction;
    }
    if (!direction) continue;

    const entry = candles[i].close;
    const exit = candles[i + step].close;
    const pctChange = (exit - entry) / entry;
    const outcome = Math.abs(pctChange) < threshold ? 0
      : ((direction === "bull" && pctChange > 0) || (direction === "bear" && pctChange < 0)) ? 1 : -1;

    const rawOutcome = ((direction === "bull" && pctChange > 0) || (direction === "bear" && pctChange < 0)) ? 1 : -1;
    signals.push({ outcome, rawOutcome, time: candles[i].time });
  }

  return signals;
}

// Compute accuracy + stats from a signal list
function summariseSignals(signals) {
  const outcomes = signals.map(s => s.outcome);
  const decided = outcomes.filter(o => o !== 0);
  const correct = decided.filter(o => o === 1).length;
  const accuracy = decided.length > 0 ? Math.round(correct / decided.length * 1000) / 10 : null;
  return { totalSignals: outcomes.length, accuracy };
}

async function checkBacktestAccess(agentAddr, viewerAddr) {
  const agentProfile = await getAgentHomeProfile(agentAddr);
  if (!agentProfile) return { error: "Agent not found", status: 404 };
  const agentMeta = await getOwnerAndViewers(agentAddr);
  const isOwner = viewerAddr === agentAddr;
  const isWhitelisted = (agentMeta?.state_viewers || []).includes(viewerAddr);
  if (!isOwner && !isWhitelisted) return { error: "Forbidden", status: 403 };
  return { agentProfile };
}

router.post("/agents/:address/backtest", requireAuth, async (req, res) => {
  try {
    const agentAddr = req.params.address.toLowerCase();
    const viewerAddr = req.userAddress?.toLowerCase();
    const { agentProfile, error, status } = await checkBacktestAccess(agentAddr, viewerAddr);
    if (error) return res.status(status).json({ error });

    const { coin: rawCoin, timeframe, strategy = {} } = req.body;
    const coin = rawCoin?.toUpperCase();

    if (!coin || !/^[A-Z]{2,10}$/.test(coin)) return res.status(400).json({ error: "coin is required" });
    if (!BACKTEST_INTERVAL_SECONDS[timeframe]) return res.status(400).json({ error: "timeframe must be one of: 15m, 30m, 1h, 4h" });

    // ─── Parse + validate strategy ──────────────────────────────────────────────
    // Backtesting is hypothesis-based: agent defines explicit direction + condition rules.
    if (!Array.isArray(strategy.conditions) || strategy.conditions.length === 0) {
      return res.status(400).json({ error: "strategy.conditions must be a non-empty array" });
    }
    if (!strategy.direction || !["bull", "bear"].includes(strategy.direction)) {
      return res.status(400).json({ error: "strategy.direction must be 'bull' or 'bear'" });
    }
    for (const c of strategy.conditions) {
      const err = validateCondition(c);
      if (err) return res.status(400).json({ error: `Invalid condition: ${err}` });
    }

    const simParams = { direction: strategy.direction, conditions: strategy.conditions, conditionLogic: "all" };
    const strategyOut = { direction: strategy.direction, conditions: strategy.conditions, conditionLogic: "all" };

    const step = CANDLES_PER_SIGNAL[timeframe];
    const threshold = BACKTEST_THRESHOLD[timeframe];
    const fetchIntervalMs = BACKTEST_INTERVAL_SECONDS[timeframe === "30m" ? "15m" : timeframe] * 1000;

    // Fetch candles — request 5000 to maximize historical window
    const endTime = Date.now();
    const startTime = endTime - fetchIntervalMs * 5000;
    const raw = await hlInfoPost({ type: "candleSnapshot", req: { coin, interval: HL_INTERVAL_MAP[timeframe], startTime, endTime } });
    if (!Array.isArray(raw) || raw.length < WARMUP + 50) {
      return res.status(400).json({ error: "Not enough historical data for this coin/timeframe" });
    }
    const candles = raw.map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }));

    const fullSimParams = { ...simParams, step, threshold };

    // ─── Full simulation ──────────────────────────────────────────────────────
    const allSignals = runSimulation(candles, fullSimParams);
    const overall = summariseSignals(allSignals);

    // ─── Rolling accuracy series (dynamic window, accuracy on decided) ──────────
    const ROLL_WINDOW = Math.max(10, Math.min(30, Math.floor(allSignals.length / 3)));
    const rollingAccuracy = [];
    for (let i = ROLL_WINDOW - 1; i < allSignals.length; i++) {
      const win = allSignals.slice(i - ROLL_WINDOW + 1, i + 1);
      const correct = win.filter(s => s.rawOutcome === 1).length;
      rollingAccuracy.push({
        time: allSignals[i].time,
        accuracy: Math.round(correct / win.length * 1000) / 10,
      });
    }

    // ─── Walk-forward kept for API compatibility ──────────────────────────────
    const signalZoneStart = WARMUP;
    const signalZoneEnd = candles.length - step;
    const zoneLen = Math.floor((signalZoneEnd - signalZoneStart) / 3);
    const walkForward = ["oldest", "middle", "recent"].map((label, wi) => {
      const start = signalZoneStart + wi * zoneLen;
      const end = wi === 2 ? signalZoneEnd : start + zoneLen;
      const zoneSignals = allSignals.filter(s => {
        const t = s.time;
        return t >= (candles[start]?.time ?? 0) && t <= (candles[end - 1]?.time ?? Infinity);
      });
      const zoneDec = zoneSignals.filter(s => s.outcome !== 0);
      const zoneCorrect = zoneDec.filter(s => s.outcome === 1).length;
      return {
        period: label,
        from: candles[start]?.time ?? null,
        to: candles[end - 1]?.time ?? null,
        signals: zoneDec.length,
        accuracy: zoneDec.length > 0 ? Math.round(zoneCorrect / zoneDec.length * 1000) / 10 : null,
      };
    });

    const warnings = [];
    if (overall.totalSignals < 50) warnings.push("low_signal_count");

    // ─── Debug: sample first candle values + first match ─────────────────────
    const debugSlice = candles.slice(0, WARMUP + 1);
    const debugInd = computeAllIndicators(debugSlice);
    const debugConditions = simParams.conditions.map(c => ({
      path: c.path,
      operator: c.operator,
      threshold: c.value ?? null,
      actual: resolvePath(debugInd, c.path),
    }));
    let firstFiredAt = null;
    for (let i = WARMUP; i < candles.length - step && firstFiredAt === null; i++) {
      const slice = candles.slice(0, i + 1);
      const ind = computeAllIndicators(slice);
      if (evaluateConditions(ind, simParams.conditions, simParams.conditionLogic)) {
        firstFiredAt = { candle: i, price: candles[i].close };
      }
    }
    const debug = { conditions: debugConditions, firstFiredAt };

    const from = candles[WARMUP]?.time ?? null;
    const to = candles[candles.length - 1]?.time ?? null;
    const daysAnalyzed = from && to ? Math.round((to - from) / (1000 * 60 * 60 * 24)) : null;

    const result = {
      coin, timeframe,
      strategy: strategyOut,
      candlesAnalyzed: candles.length - WARMUP - step,
      from, to, daysAnalyzed,
      ...overall,
      walkForward,
      rollingAccuracy,
      warnings,
      debug,
      generatedAt: new Date().toISOString(),
    };

    res.json(result);
  } catch (err) {
    console.error("[AgentSocial] /backtest error:", err.message);
    res.status(500).json({ error: "Backtest failed" });
  }
});

// ─── POST /api/agents/:address/backtest/hypotheses — Save a hypothesis ───────

router.post("/agents/:address/backtest/hypotheses", requireAuth, async (req, res) => {
  try {
    const agentAddr = req.params.address.toLowerCase();
    const viewerAddr = req.userAddress?.toLowerCase();
    const { agentProfile, error, status } = await checkBacktestAccess(agentAddr, viewerAddr);
    if (error) return res.status(status).json({ error });

    const { coin, timeframe, direction, conditions, accuracy, totalSignals } = req.body;
    if (!coin || !timeframe || !direction || !Array.isArray(conditions) || conditions.length === 0) {
      return res.status(400).json({ error: "coin, timeframe, direction, conditions required" });
    }

    const existing = await getExistingState(agentAddr);
    const hypotheses = existing?.backtestHypotheses ?? [];

    const newHypothesis = {
      id: randomUUID(),
      coin,
      timeframe,
      direction,
      conditions,
      lastAccuracy: accuracy ?? null,
      lastSignals: totalSignals ?? null,
      savedAt: new Date().toISOString(),
    };

    await upsertState(agentAddr, { ...existing, backtestHypotheses: [...hypotheses, newHypothesis] });
    res.json(newHypothesis);
  } catch (err) {
    console.error("[AgentSocial] /backtest/hypotheses POST error:", err.message);
    res.status(500).json({ error: "Failed to save hypothesis" });
  }
});

// ─── DELETE /api/agents/:address/backtest/hypotheses/:id — Remove a hypothesis

router.delete("/agents/:address/backtest/hypotheses/:id", requireAuth, async (req, res) => {
  try {
    const agentAddr = req.params.address.toLowerCase();
    const viewerAddr = req.userAddress?.toLowerCase();
    const { agentProfile, error, status } = await checkBacktestAccess(agentAddr, viewerAddr);
    if (error) return res.status(status).json({ error });

    const hypothesisId = req.params.id;
    const existing = await getExistingState(agentAddr);
    const hypotheses = (existing?.backtestHypotheses ?? []).filter(h => h.id !== hypothesisId);
    await upsertState(agentAddr, { ...existing, backtestHypotheses: hypotheses });
    res.json({ ok: true });
  } catch (err) {
    console.error("[AgentSocial] /backtest/hypotheses DELETE error:", err.message);
    res.status(500).json({ error: "Failed to delete hypothesis" });
  }
});

// ─── GET /api/agents/:address/backtest/scan — Rank all coin×timeframe pairs ──

router.get("/agents/:address/backtest/scan", requireAuth, async (req, res) => {
  try {
    const agentAddr = req.params.address.toLowerCase();
    const viewerAddr = req.userAddress?.toLowerCase();
    const { agentProfile, error, status } = await checkBacktestAccess(agentAddr, viewerAddr);
    if (error) return res.status(status).json({ error });

    // Strategy from query params
    const logic = VALID_LOGIC.has(req.query.logic) ? req.query.logic : "majority";
    const minConfidence = parseFloat(req.query.minConfidence) || (agentProfile?.min_confidence ?? 0.5);
    const indicators = agentProfile?.enabled_indicators || ["rsi", "macd", "bollinger_bands", "ema", "sma"];

    const coins = (agentProfile?.allowed_coins?.length ? agentProfile.allowed_coins : ["BTC", "ETH", "SOL"]).slice(0, 8);
    const timeframes = (agentProfile?.preferred_timeframes?.filter(t => BACKTEST_INTERVAL_SECONDS[t])?.length
      ? agentProfile.preferred_timeframes.filter(t => BACKTEST_INTERVAL_SECONDS[t])
      : ["1h", "4h"]).slice(0, 4);

    const simParams = { indicators, logic, minConfidence };
    const results = [];

    for (const coin of coins) {
      for (const timeframe of timeframes) {
        try {
          const step = CANDLES_PER_SIGNAL[timeframe];
          const threshold = BACKTEST_THRESHOLD[timeframe];
          const fetchIntervalMs = BACKTEST_INTERVAL_SECONDS[timeframe === "30m" ? "15m" : timeframe] * 1000;

          const cacheKey = `scan:${agentAddr}:${coin}:${timeframe}:${indicators.sort().join(",")}:${logic}:${minConfidence}`;
          const cached = backtestCache.get(cacheKey);
          let summary;

          if (cached && Date.now() - cached.time < BACKTEST_CACHE_TTL) {
            summary = cached.data;
          } else {
            const endTime = Date.now();
            const startTime = endTime - fetchIntervalMs * 5000;
            const raw = await hlInfoPost({ type: "candleSnapshot", req: { coin, interval: HL_INTERVAL_MAP[timeframe], startTime, endTime } });
            if (!Array.isArray(raw) || raw.length < WARMUP + 50) continue;
            const candles = raw.map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }));
            const signals = runSimulation(candles, { ...simParams, step, threshold });
            summary = summariseSignals(signals);
            backtestCache.set(cacheKey, { data: summary, time: Date.now() });
          }

          results.push({ coin, timeframe, ...summary });
        } catch { /* skip pair on error */ }
      }
    }

    // Rank by SQN (best quality), fall back to Sharpe, then accuracy
    results.sort((a, b) => {
      if (a.sqn != null && b.sqn != null) return b.sqn - a.sqn;
      if (a.sqn != null) return -1;
      if (b.sqn != null) return 1;
      if (a.sharpe != null && b.sharpe != null) return b.sharpe - a.sharpe;
      return (b.accuracy ?? 0) - (a.accuracy ?? 0);
    });

    res.json({ strategy: { indicators, logic, minConfidence }, ranked: results, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[AgentSocial] /backtest/scan error:", err.message);
    res.status(500).json({ error: "Scan failed" });
  }
});

export default router;
