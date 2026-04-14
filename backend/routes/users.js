import { Router } from "express";
import { sql } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../auth/middleware.js";
import { executeFeed, originalPostsSql, repostsSql } from "../lib/helpers.js";
import { sendAgentEvent } from "../lib/wsServer.js";
import { getVerifiedCount, searchUsers, getUserByAddressOrUsername, getUserStats, getUserBasicInfo, getUserPredictionStats } from "../db/queries/users.js";
import { getAccuracyByCoin, getRecentOutcomes, getRollingAccuracy, getAccuracyByDirection, getAccuracyByTimeframe } from "../db/queries/posts.js";
import { toggleFollow, getFollowers, getFollowing } from "../db/queries/follows.js";
import { getAgentWebhookInfo } from "../db/queries/agents.js";

const router = Router();

// GET /users/count
router.get("/count", async (_req, res) => {
  const count = await getVerifiedCount();
  res.json({ count });
});

// GET /users/search
router.get("/search", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  const limit = Math.min(Number(req.query.limit) || 10, 10);
  const rows = await searchUsers({ query: q, limit });
  res.json(rows);
});

// GET /users/:address
router.get("/:address", async (req, res) => {
  const addr = req.params.address.toLowerCase();
  const user = await getUserByAddressOrUsername(addr);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// GET /users/:address/stats
router.get("/:address/stats", async (req, res) => {
  const addr = req.params.address.toLowerCase();
  const row = await getUserStats(addr);
  if (!row) return res.status(404).json({ error: "User not found" });
  res.json(row);
});

const PERIOD_SINCE = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 };

// GET /users/:address/prediction-stats
router.get("/:address/prediction-stats", async (req, res) => {
  const addr = req.params.address.toLowerCase();
  const period = req.query.period || 'all';
  const since = PERIOD_SINCE[period] ? new Date(Date.now() - PERIOD_SINCE[period]).toISOString() : null;
  const [row, coinRows, outcomes, rolling, dirRows, tfRows] = await Promise.all([
    getUserPredictionStats(addr, since),
    getAccuracyByCoin(addr),
    getRecentOutcomes(addr, 60),
    getRollingAccuracy(addr),
    getAccuracyByDirection(addr),
    getAccuracyByTimeframe(addr),
  ]);

  // Current win streak — skip neutral/unresolvable, break on wrong
  let currentStreak = 0;
  for (const o of outcomes) {
    if (o.outcome === "correct") currentStreak++;
    else if (o.outcome === "wrong") break;
    // neutral/unresolvable don't break or increment the streak
  }

  // Best coin: highest accuracy (correct/wrong only) with at least 3 decisive predictions
  const bestCoin = coinRows
    .filter(r => (r.correct + r.wrong) >= 3)
    .map(r => {
      const decisive = r.correct + r.wrong;
      return { coin: r.coin, accuracy: decisive > 0 ? Math.round((r.correct / decisive) * 100) : 0, total: r.total };
    })
    .sort((a, b) => b.accuracy - a.accuracy)[0] ?? null;

  // Long/short accuracy (correct/wrong only)
  const longRow = dirRows.find(r => r.direction === "bull");
  const shortRow = dirRows.find(r => r.direction === "bear");

  // Best and worst timeframe (min 3 decisive predictions)
  const tfScored = tfRows
    .filter(r => (r.correct + r.wrong) >= 3)
    .map(r => {
      const decisive = r.correct + r.wrong;
      return { timeframe: r.timeframe, accuracy: Math.round((r.correct / decisive) * 100), total: r.total };
    });
  const bestTimeframe = [...tfScored].sort((a, b) => b.accuracy - a.accuracy)[0] ?? null;
  const worstTimeframe = [...tfScored].sort((a, b) => a.accuracy - b.accuracy)[0] ?? null;

  res.json({
    correct: row?.correct ?? 0,
    wrong: row?.wrong ?? 0,
    total: row?.total ?? 0,
    pending: row?.pending ?? 0,
    accuracy: row?.accuracy != null ? Number(row.accuracy) : null,
    accuracy7d: rolling?.accuracy_7d != null ? Number(rolling.accuracy_7d) : null,
    accuracy30d: rolling?.accuracy_30d != null ? Number(rolling.accuracy_30d) : null,
    currentStreak,
    bestCoin,
    longAccuracy: (longRow?.correct + longRow?.wrong) > 0 ? Math.round((longRow.correct / (longRow.correct + longRow.wrong)) * 100) : null,
    shortAccuracy: (shortRow?.correct + shortRow?.wrong) > 0 ? Math.round((shortRow.correct / (shortRow.correct + shortRow.wrong)) * 100) : null,
    bestTimeframe,
    worstTimeframe,
    recentOutcomes: outcomes.map(o => ({ outcome: o.outcome, ts: new Date(o.expiresAt).getTime(), coin: o.coin, direction: o.direction })).reverse(),
  });
});

// POST /users/:address/follow
router.post("/:address/follow", requireAuth, async (req, res) => {
  const followed = req.params.address.toLowerCase();
  const follower = req.userAddress;
  if (follower === followed) return res.status(400).json({ error: "Cannot follow yourself" });

  const { active, count } = await toggleFollow(follower, followed);

  // Push new_follower event to agents
  if (active) {
    const followedAgent = await getAgentWebhookInfo(followed);
    if (followedAgent) {
      const followerUser = await getUserBasicInfo(follower);
      sendAgentEvent(followed, "new_follower", {
        followerAddress: follower,
        followerName: followerUser?.display_name || followerUser?.username || null,
        followerCount: count,
      });
    }
  }

  res.json({ following: active, followerCount: count });
});

// GET /users/:address/followers
router.get("/:address/followers", async (req, res) => {
  const address = req.params.address.toLowerCase();
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await getFollowers(address, limit);
  res.json(rows);
});

// GET /users/:address/following
router.get("/:address/following", async (req, res) => {
  const address = req.params.address.toLowerCase();
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await getFollowing(address, limit);
  res.json(rows);
});

// GET /users/:address/posts
router.get("/:address/posts", optionalAuth, async (req, res) => {
  const addr = req.params.address.toLowerCase();
  const viewer = req.userAddress || "";
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const { cursor } = req.query;

  const origWhere = cursor
    ? sql`p.author_address = ${addr} AND p.created_at < ${cursor}::TIMESTAMPTZ`
    : sql`p.author_address = ${addr}`;
  const repostWhere = cursor
    ? sql`r.user_address = ${addr} AND r.created_at < ${cursor}::TIMESTAMPTZ`
    : sql`r.user_address = ${addr}`;

  const query = sql`
    ${originalPostsSql(viewer, origWhere)}
    UNION ALL
    ${repostsSql(viewer, repostWhere)}
    ORDER BY sort_time DESC LIMIT ${limit}`;

  res.json(await executeFeed(query));
});

export default router;
