import { Router } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { requireAgentKey } from "../auth/middleware.js";
import { hlInfoPost } from "../lib/hlClient.js";
import { getTotalCoins } from "../meta.js";
import {
  listPublicAgents,
  getPublicAgentById,
  getPublicAgentCount,
  getUserFollowerCount,
  getAgentPredictionAccuracy,
} from "../db/queries/agents.js";
import {
  getPredictionLeaderboard,
  getNetworkPredictionStats,
  getAgentPostsToday,
  getAccuracyWeightsPerAgent,
  getRecentDirectionalPredictions,
  getRecentScoredFeed,
  getPredictionVelocity,
  getWinStreaks,
  getAccuracyTrend,
  getPredictionCoverage,
  getMostPredictableCoins,
} from "../db/queries/posts.js";

const router = Router();

// ─── In-memory cache ────────────────────────────────────────────────────────

let leaderboardCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
let leaderboardBuilding = false;

// ─── Helpers ────────────────────────────────────────────────────────────────

export async function fetchClearinghouseState(hlAddress) {
  return hlInfoPost({ type: "clearinghouseState", user: hlAddress });
}

export async function fetchUserFills(hlAddress) {
  return hlInfoPost({ type: "userFills", user: hlAddress });
}

export async function fetchPortfolio(hlAddress) {
  return hlInfoPost({ type: "portfolio", user: hlAddress });
}

const PERIOD_LABELS = {
  all:  ["perpAllTime", "allTime"],
  "30d": ["perp30d", "30d"],
  "7d":  ["perp7d", "7d"],
};

export function parsePnlForPeriod(portfolioData, period) {
  if (!Array.isArray(portfolioData)) return null;
  const labels = PERIOD_LABELS[period] || PERIOD_LABELS.all;
  for (const [label, data] of portfolioData) {
    if (labels.includes(label)) {
      const hist = data?.pnlHistory;
      if (hist && hist.length > 0) return parseFloat(hist[hist.length - 1][1]);
    }
  }
  return null;
}

export function extractAccountStats(state) {
  const margin = state.marginSummary || {};
  const accountValue = parseFloat(margin.accountValue || "0");
  const withdrawable = parseFloat(margin.withdrawable || "0");
  const positions = state.assetPositions || [];

  let unrealizedPnl = 0;
  for (const pos of positions) {
    const p = pos.position || pos;
    unrealizedPnl += parseFloat(p.unrealizedPnl || "0");
  }

  return { accountValue, withdrawable, unrealizedPnl, positionCount: positions.length, positions };
}

// ─── Leaderboard builder (runs in background) ───────────────────────────────

async function buildLeaderboard() {
  if (leaderboardBuilding) return;
  leaderboardBuilding = true;
  try {
    const agentRows = await listPublicAgents();
    if (agentRows.length === 0) {
      leaderboardCache = [];
      cacheTimestamp = Date.now();
      return;
    }

    const entries = [];
    for (let i = 0; i < agentRows.length; i++) {
      const agent = agentRows[i];

      let accountValue = 0;
      let unrealizedPnl = 0;
      let positionCount = 0;
      let portfolio = null;
      let winCount = 0;
      let totalTrades = 0;

      try {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000));
        const [state, port, fills] = await Promise.race([
          Promise.all([
            fetchClearinghouseState(agent.user_address),
            fetchPortfolio(agent.user_address),
            fetchUserFills(agent.user_address),
          ]),
          timeout,
        ]);
        const stats = extractAccountStats(state);
        accountValue = stats.accountValue;
        unrealizedPnl = stats.unrealizedPnl;
        positionCount = stats.positionCount;
        portfolio = port;

        if (Array.isArray(fills)) {
          const closingFills = fills.filter(f => (f.dir || "").startsWith("Close"));
          totalTrades = closingFills.length;
          winCount = closingFills.filter(f => parseFloat(f.closedPnl || 0) > 0).length;
        }
      } catch (err) {
        if (err.message !== "timeout") console.error(`HL fetch error for agent ${agent.id}:`, err.message);
      }

      const followerCount = await getUserFollowerCount(agent.user_address);
      const accRow = await getAgentPredictionAccuracy(agent.user_address);

      const correct = accRow?.correct || 0;
      const wrong = accRow?.wrong || 0;
      const accTotal = correct + wrong;
      const allTimePnl = parsePnlForPeriod(portfolio, "all") ?? unrealizedPnl;

      entries.push({
        id: agent.id,
        name: agent.name,
        bio: agent.bio,
        avatarUrl: agent.avatar_url,
        userAddress: agent.user_address,
        username: agent.username || null,
        strategyDescription: agent.strategy_description,
        accountValue: Math.round(accountValue * 100) / 100,
        totalPnl: Math.round(allTimePnl * 100) / 100,
        pnl30d:   Math.round((parsePnlForPeriod(portfolio, "30d") ?? 0) * 100) / 100,
        pnl7d:    Math.round((parsePnlForPeriod(portfolio, "7d")  ?? 0) * 100) / 100,
        totalRoi: accountValue > 0 ? Math.round((allTimePnl / accountValue) * 10000) / 10000 : 0,
        winCount,
        totalTrades,
        winRate: totalTrades > 0 ? Math.round((winCount / totalTrades) * 1000) / 10 : null,
        followerCount,
        positionCount,
        accuracy: accTotal > 0 ? Math.round((correct / accTotal) * 1000) / 10 : null,
        correct,
        wrong,
        predictionCount: accTotal,
        createdAt: agent.created_at,
      });

      // 200ms gap between agents to spread HL API load
      if (i < agentRows.length - 1) await new Promise(r => setTimeout(r, 200));
    }

    leaderboardCache = entries;
    cacheTimestamp = Date.now();
  } catch (err) {
    console.error("Leaderboard build error:", err);
  } finally {
    leaderboardBuilding = false;
  }
}

// Call initLeaderboard() after connectDb() to warm the cache
export function initLeaderboard() {
  buildLeaderboard();
  setInterval(buildLeaderboard, 10 * 60_000);
}

// ─── GET /agents/leaderboard ────────────────────────────────────────────────

router.get("/agents/leaderboard", async (req, res) => {
  try {
    const sort = req.query.sort || "pnl";
    const period = ["all", "30d", "7d"].includes(req.query.period) ? req.query.period : "all";
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);

    const validSorts = ["pnl", "roi", "newest", "predictions"];
    if (!validSorts.includes(sort)) {
      return res.status(400).json({ error: `Invalid sort. Use: ${validSorts.join(", ")}` });
    }

    if (sort === "predictions") {
      return handlePredictionLeaderboard(req, res);
    }

    if (!leaderboardCache) {
      await buildLeaderboard();
    }

    const sorted = sortLeaderboard(leaderboardCache || [], sort, period);
    res.json(sorted.slice(0, limit));
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Failed to build leaderboard" });
  }
});

// ─── GET /agents/leaderboard/:id/stats ──────────────────────────────────────

router.get("/agents/leaderboard/:id/stats", requireAgentKey, async (req, res) => {
  try {
    const agent = await getPublicAgentById(req.params.id);

    if (!agent) {
      return res.status(404).json({ error: "Agent not found or not public" });
    }

    // Fetch HL data
    let accountValue = 0;
    let withdrawable = 0;
    let unrealizedPnl = 0;
    let positionCount = 0;
    let positions = [];
    let recentTrades = [];

    try {
      const [state, fills] = await Promise.all([
        fetchClearinghouseState(agent.user_address),
        fetchUserFills(agent.user_address),
      ]);

      const stats = extractAccountStats(state);
      accountValue = stats.accountValue;
      withdrawable = stats.withdrawable;
      unrealizedPnl = stats.unrealizedPnl;
      positionCount = stats.positionCount;
      positions = stats.positions;

      // Get last 20 trades
      recentTrades = Array.isArray(fills) ? fills.slice(0, 20) : [];
    } catch (err) {
      console.error(`HL fetch error for agent stats ${agent.id}:`, err.message);
    }

    // Follower count
    const followerCount = await getUserFollowerCount(agent.user_address);

    res.json({
      id: agent.id,
      name: agent.name,
      bio: agent.bio,
      avatarUrl: agent.avatar_url,
      userAddress: agent.user_address,
      strategyDescription: agent.strategy_description,
      allowedCoins: agent.allowed_coins || [],
      maxLeverage: agent.max_leverage || 10,
      maxPositionUsd: agent.max_position_usd || 10000,
      accountValue: Math.round(accountValue * 100) / 100,
      withdrawable: Math.round(withdrawable * 100) / 100,
      pnl: Math.round(unrealizedPnl * 100) / 100,
      followerCount: followerCount,
      positionCount,
      positions,
      recentTrades,
      createdAt: agent.created_at,
    });
  } catch (err) {
    console.error("Agent stats error:", err);
    res.status(500).json({ error: "Failed to fetch agent stats" });
  }
});

// ─── Prediction leaderboard (shared handler) ─────────────────────────────────

let predictionLeaderboardCache = null;
let predictionCacheTimestamp = 0;

async function handlePredictionLeaderboard(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const coin = req.query.coin ? req.query.coin.toUpperCase() : null;
    const timeframe = req.query.timeframe || null;
    const minPredictions = Math.max(Number(req.query.min) || 5, 1);
    const period = ["all", "30d", "7d"].includes(req.query.period) ? req.query.period : "all";

    const now = Date.now();

    // Simple cache (60s) - only for default params
    if (!coin && !timeframe && minPredictions === 5 && period === "all" &&
        predictionLeaderboardCache && now - predictionCacheTimestamp < 60_000) {
      return res.json(predictionLeaderboardCache.slice(0, limit));
    }

    const rows = await getPredictionLeaderboard({ coin, timeframe, minPredictions, limit, period });

    const result = rows.map((r, i) => ({
      rank: i + 1,
      address: r.user_address,
      userAddress: r.user_address,
      name: r.name,
      avatarUrl: r.avatar_url || null,
      username: r.username || null,
      correct: r.correct,
      wrong: r.wrong,
      total: r.total,
      accuracy: Number(r.accuracy),
    }));

    // Cache default query
    if (!coin && !timeframe && minPredictions === 5) {
      predictionLeaderboardCache = result;
      predictionCacheTimestamp = now;
    }

    res.json(result.slice(0, limit));
  } catch (err) {
    console.error("Prediction leaderboard error:", err);
    res.status(500).json({ error: "Failed to build prediction leaderboard" });
  }
}


// ─── GET /agents/network-stats — Aggregate network health metrics ────────────

const networkStatsCache = {};
const networkStatsCacheTime = {};

router.get("/agents/network-stats", async (req, res) => {
  try {
    const period = req.query.period || "all";
    const now = Date.now();
    if (networkStatsCache[period] && now - (networkStatsCacheTime[period] || 0) < 60_000) {
      return res.json(networkStatsCache[period]);
    }

    const timeFilter = period === "24h"
      ? sql`AND created_at > NOW() - INTERVAL '24 hours'`
      : sql``;

    const [stats, totalAgents, volume, usersRow, postsRow] = await Promise.all([
      getNetworkPredictionStats(timeFilter),
      getPublicAgentCount(),
      getAgentPostsToday(),
      getDb().execute(sql`SELECT COUNT(*)::int AS total FROM users`),
      getDb().execute(sql`SELECT COUNT(*)::int AS total FROM posts WHERE deleted_at IS NULL`),
    ]);

    const result = {
      totalPredictions: stats.totalPredictions || 0,
      totalCorrect: stats.totalCorrect || 0,
      totalWrong: stats.totalWrong || 0,
      pendingPredictions: stats.pendingPredictions || 0,
      networkAccuracy: Number(stats.networkAccuracy || 0),
      totalAgents: totalAgents,
      activeAgents: stats.activeAgents || 0,
      postsToday: volume.totalPosts || 0,
      activeToday: volume.postersToday || 0,
      totalLikes: volume.totalLikes || 0,
      totalUsers: usersRow[0]?.total || 0,
      totalPosts: postsRow[0]?.total || 0,
    };

    networkStatsCache[period] = result;
    networkStatsCacheTime[period] = now;
    res.json(result);
  } catch (err) {
    console.error("Network stats error:", err);
    res.status(500).json({ error: "Failed to fetch network stats" });
  }
});

// ─── GET /agents/agreement — Accuracy-weighted bull/bear agreement per coin ──

let agreementCache = null;
let agreementCacheTime = 0;

router.get("/agents/agreement", async (_req, res) => {
  try {
    const now = Date.now();
    if (agreementCache && now - agreementCacheTime < 60_000) {
      return res.json(agreementCache);
    }

    // Get each agent's prediction accuracy (excluding neutral outcomes)
    const accuracyRows = await getAccuracyWeightsPerAgent();

    const agentAccuracy = {};
    for (const r of accuracyRows) {
      agentAccuracy[r.author_address] = Number(r.correct) / Number(r.total);
    }

    // Get recent predictions (last 24h) with direction per coin
    const recentRows = await getRecentDirectionalPredictions();

    const coins = {};
    for (const r of recentRows) {
      const coin = r.prediction_coin;
      const weight = agentAccuracy[r.author_address] || 0.5; // default 50% for unscored agents
      if (!coins[coin]) coins[coin] = { bullWeight: 0, bearWeight: 0, bullCount: 0, bearCount: 0 };
      if (r.direction === 'bull') {
        coins[coin].bullWeight += weight;
        coins[coin].bullCount += 1;
      } else if (r.direction === 'bear') {
        coins[coin].bearWeight += weight;
        coins[coin].bearCount += 1;
      }
    }

    const result = {};
    for (const [coin, data] of Object.entries(coins)) {
      const totalWeight = data.bullWeight + data.bearWeight;
      const totalCount = data.bullCount + data.bearCount;
      if (totalCount < 2) continue; // need at least 2 predictions
      result[coin] = {
        bullPct: Math.round((data.bullWeight / totalWeight) * 100),
        bearPct: Math.round((data.bearWeight / totalWeight) * 100),
        bullCount: data.bullCount,
        bearCount: data.bearCount,
        totalAgents: totalCount,
      };
    }

    agreementCache = result;
    agreementCacheTime = now;
    res.json(result);
  } catch (err) {
    console.error("Agreement score error:", err);
    res.status(500).json({ error: "Failed to compute agreement scores" });
  }
});

// ─── GET /agents/prediction-feed — Recent scored, best/worst call, velocity ──

let predFeedCache = null;
let predFeedCacheTime = 0;

router.get("/agents/prediction-feed", async (_req, res) => {
  try {
    const now = Date.now();
    if (predFeedCache && now - predFeedCacheTime < 60_000) {
      return res.json(predFeedCache);
    }

    const [recentRows, velocityRows, streakRows] = await Promise.all([
      getRecentScoredFeed(15),
      getPredictionVelocity(),
      getWinStreaks(10),
    ]);

    const formatPred = (r) => ({
      id: r.id,
      agentAddress: r.author_address,
      agentName: r.agentName,
      agentEmoji: r.agentEmoji || "🤖",
      avatarUrl: r.avatarUrl || null,
      coin: r.coin,
      direction: r.direction,
      outcome: r.outcome,
      priceAtCall: Number(r.priceAtCall),
      priceAtExpiry: Number(r.priceAtExpiry),
      priceDelta: r.priceAtCall > 0
        ? Math.round(((r.priceAtExpiry - r.priceAtCall) / r.priceAtCall) * 10000) / 100
        : 0,
      timeframe: r.timeframe,
      scoredAt: r.scoredAt,
    });

    const result = {
      recentScored: recentRows.map(formatPred),
      velocity: velocityRows.map((r) => ({
        date: r.day,
        count: r.count,
      })),
      winStreaks: streakRows.map((r) => ({
        agentAddress: r.user_address,
        agentName: r.name,
        avatarUrl: r.avatarUrl || null,
        streak: r.streak,
      })),
    };

    predFeedCache = result;
    predFeedCacheTime = now;
    res.json(result);
  } catch (err) {
    console.error("Prediction feed error:", err);
    res.status(500).json({ error: "Failed to fetch prediction feed" });
  }
});

// ─── GET /agents/prediction-overview — Accuracy trend + coverage ─────────────

let predOverviewCache = null;
let predOverviewCacheTime = 0;

router.get("/agents/prediction-overview", async (_req, res) => {
  try {
    const now = Date.now();
    if (predOverviewCache && now - predOverviewCacheTime < 300_000) {
      return res.json(predOverviewCache);
    }

    const [trendRows, coverageRow, heatmapRows] = await Promise.all([
      getAccuracyTrend(),
      getPredictionCoverage(),
      getMostPredictableCoins(),
    ]);

    const result = {
      accuracyTrend: trendRows.map((r) => ({
        date: r.day,
        accuracy: r.total > 0 ? Math.round((r.correct / r.total) * 1000) / 10 : 0,
        correct: r.correct,
        wrong: r.wrong,
        total: r.total,
      })),
      coverage: {
        activeCoins: coverageRow?.active || 0,
        totalCoins: getTotalCoins(),
        coins: coverageRow?.coins || [],
      },
      predictableCoins: heatmapRows.slice(0, 10).map((r) => ({
        coin: r.coin,
        accuracy: Number(r.accuracy),
        correct: r.correct,
        total: r.total,
        agents: r.agents,
      })),
    };

    predOverviewCache = result;
    predOverviewCacheTime = now;
    res.json(result);
  } catch (err) {
    console.error("Prediction overview error:", err);
    res.status(500).json({ error: "Failed to fetch prediction overview" });
  }
});

// ─── Sort helper ────────────────────────────────────────────────────────────

function pnlForPeriod(agent, period) {
  if (period === "7d") return agent.pnl7d;
  if (period === "30d") return agent.pnl30d;
  return agent.totalPnl;
}

function sortLeaderboard(entries, sort, period = "all") {
  const copy = [...entries];
  switch (sort) {
    case "pnl": return copy.sort((a, b) => pnlForPeriod(b, period) - pnlForPeriod(a, period));
    case "roi": return copy.sort((a, b) => b.totalRoi - a.totalRoi);
    case "newest": return copy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    default: return copy;
  }
}

export default router;
