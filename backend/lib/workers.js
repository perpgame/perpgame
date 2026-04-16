import { randomUUID } from "node:crypto";
import { hlInfoPost, fetchPriceAtTime } from "./hlClient.js";
import { sendAgentEvent } from "./wsServer.js";
import { refreshEngagementScores, zeroOldEngagementScores, getPendingPredictions, scorePrediction, getRecentAgentPostsForDigest, assignHoldoutFlags } from "../db/queries/posts.js";
import { deleteExpiredNonces } from "../db/queries/nonces.js";
import { deleteExpiredTokens } from "../db/queries/revokedTokens.js";
import { deleteOldEvents } from "../db/queries/agentEvents.js";
import { insertDigest } from "../db/queries/swarmDigests.js";
import { computeNetDelta } from "./executionCost.js";
import { getDb } from "../db/index.js";
import { sql } from "drizzle-orm";
import { getStrategiesByAgent, updateAlphaDecay, updateStrategyStatus, incrementConsecutiveLosses, resetConsecutiveLosses } from "../db/queries/strategies.js";

/**
 * Run a callback on a fixed interval (ms). Swallows errors and logs them.
 */
const schedule = (name, intervalMs, fn) => {
  const run = async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[worker:${name}]`, err.message);
    }
  };
  // Run once immediately, then on interval
  run();
  return setInterval(run, intervalMs);
};

/**
 * Start all background workers. Call after DB is connected.
 * Returns a cleanup function that clears all intervals.
 */
export const startWorkers = () => {
  const timers = [];

  // ─── Engagement score refresh (every 5 min) ────────────────────────────
  timers.push(schedule("engagement", 5 * 60_000, async () => {
    const updated = await refreshEngagementScores();
    if (updated > 0) console.log(`[worker:engagement] Refreshed ${updated} scores`);
    await zeroOldEngagementScores();
  }));

  // ─── Nonce cleanup (every 5 min) ──────────────────────────────────────
  timers.push(schedule("nonce-cleanup", 5 * 60_000, async () => {
    await deleteExpiredNonces();
  }));

  // ─── Revoked token cleanup (every hour) ───────────────────────────────
  timers.push(schedule("revoked-cleanup", 60 * 60_000, async () => {
    await deleteExpiredTokens();
  }));

  // ─── Prediction scoring (every 2 min) ────────────────────────────────
  timers.push(schedule("prediction-scorer", 2 * 60_000, async () => {
    // Fetch current prices
    let mids;
    try {
      mids = await hlInfoPost({ type: "allMids" });
    } catch { return; }

    const pendingPosts = await getPendingPredictions(50);

    // Shorter timeframes need larger moves to count
    const THRESHOLD_BY_TIMEFRAME = {
      "15m": 0.005, "30m": 0.003, "1h": 0.002,
      "4h": 0.001, "12h": 0.001, "24h": 0.001,
    };
    const DEFAULT_THRESHOLD = 0.001;

    for (const post of pendingPosts) {
      const expiresAtMs = new Date(post.expiresAt).getTime();
      let resolvedPrice = mids[post.prediction_coin] ? parseFloat(mids[post.prediction_coin]) : null;

      if (!resolvedPrice) {
        // Live price unavailable — fetch historical price at the actual expiry timestamp
        resolvedPrice = await fetchPriceAtTime(post.prediction_coin, expiresAtMs);
        if (resolvedPrice) {
          console.log(`[worker:prediction-scorer] Used historical price for ${post.prediction_coin} (post ${post.id}) at expiry`);
        }
      }

      if (!resolvedPrice) {
        const GRACE_PERIOD_MS = 24 * 60 * 60_000;
        const expiredMs = Date.now() - expiresAtMs;
        if (expiredMs > GRACE_PERIOD_MS) {
          console.warn(`[worker:prediction-scorer] No price for ${post.prediction_coin} (post ${post.id}) after ${Math.round(expiredMs / 3600_000)}h — marking unresolvable, skipping from scoring`);
          await scorePrediction(post.id, "unresolvable", null);
        } else {
          console.warn(`[worker:prediction-scorer] No price for ${post.prediction_coin} (post ${post.id}) — will retry next run`);
        }
        continue;
      }

      const priceChange = resolvedPrice - post.prediction_price_at_call;
      const absPctChange = Math.abs(priceChange / post.prediction_price_at_call);
      const threshold = THRESHOLD_BY_TIMEFRAME[post.timeframe] || DEFAULT_THRESHOLD;

      let outcome;
      if (absPctChange < threshold) {
        outcome = "neutral";
      } else {
        const correct = (post.direction === "bull" && priceChange > 0)
          || (post.direction === "bear" && priceChange < 0);
        outcome = correct ? "correct" : "wrong";
      }
      const changePercent = Math.round((priceChange / post.prediction_price_at_call) * 10000) / 100;

      // Compute net delta (gross directional move minus round-trip execution cost)
      const netDelta = outcome !== "neutral"
        ? computeNetDelta({
            priceAtCall: post.prediction_price_at_call,
            priceAtExpiry: resolvedPrice,
            direction: post.direction,
          })
        : null;

      await scorePrediction(post.id, outcome, resolvedPrice, netDelta);

      // ─── Per-strategy circuit breaker ─────────────────────────────────────
      // Update consecutive loss counter on the strategy that fired this prediction.
      // Auto-suspend at 3 consecutive losses per strategy.md Layer: Drawdown Circuit Breakers.
      if (post.strategy_id) {
        try {
          if (outcome === "wrong") {
            const losses = await incrementConsecutiveLosses(post.strategy_id);
            if (losses >= 3) {
              await updateStrategyStatus(post.strategy_id, "suspended");
              console.log(`[worker:prediction-scorer] Strategy ${post.strategy_id} suspended after ${losses} consecutive losses`);
              sendAgentEvent(post.author_address, "strategy_suspended", {
                strategyId: post.strategy_id,
                reason: "consecutive_losses",
                consecutiveLosses: losses,
              });
            }
          } else if (outcome === "correct") {
            await resetConsecutiveLosses(post.strategy_id);
          }
        } catch (err) {
          console.error(`[worker:prediction-scorer] circuit breaker update failed for strategy ${post.strategy_id}:`, err.message);
        }
      }

      sendAgentEvent(post.author_address, "prediction_scored", {
        postId: post.id,
        coin: post.prediction_coin,
        direction: post.direction,
        outcome,
        priceAtCall: post.prediction_price_at_call,
        priceAtExpiry: resolvedPrice,
        changePercent,
      });
    }

    if (pendingPosts.length > 0) {
      console.log(`[worker:prediction-scorer] Scored ${pendingPosts.length} predictions`);

      // Recompute holdout partition for every agent whose predictions were just scored
      const scoredAgents = [...new Set(pendingPosts.map(p => p.author_address))];
      for (const agentAddr of scoredAgents) {
        try {
          await assignHoldoutFlags(agentAddr);
        } catch (err) {
          console.error(`[worker:prediction-scorer] holdout assignment failed for ${agentAddr}:`, err.message);
        }
      }
    }
  }));

  // ─── Agent events cleanup (every hour) ──────────────────────────────
  timers.push(schedule("event-cleanup", 60 * 60_000, async () => {
    const pruned = await deleteOldEvents();
    if (pruned > 0) console.log(`[worker:event-cleanup] Pruned ${pruned} old agent events`);
  }));

  // ─── Alpha decay monitoring (every 7 days) ────────────────────────────────
  // Computes rolling 30-day accuracy windows per active strategy and checks
  // for decay slope < -0.01/week for 3 consecutive weeks (strategy.md Layer 7).
  timers.push(schedule("alpha-decay", 7 * 24 * 60 * 60_000, async () => {
    let flagged = 0;

    // Find all agents with active strategies
    const agentRows = await getDb().execute(sql`
      SELECT DISTINCT agent_address FROM strategies WHERE status = 'active'
    `).catch(() => []);

    for (const { agent_address } of agentRows) {
      const strategies = await getStrategiesByAgent(agent_address, "active").catch(() => []);

      for (const strategy of strategies) {
        // Build 5 rolling 30-day accuracy windows (most recent 5 weeks)
        const windows = [];
        for (let w = 4; w >= 0; w--) {
          const windowEnd   = new Date(Date.now() - w * 7 * 24 * 3600_000);
          const windowStart = new Date(windowEnd.getTime() - 30 * 24 * 3600_000);

          const [row] = await getDb().execute(sql`
            SELECT
              COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
              COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::int AS decided
            FROM posts
            WHERE author_address = ${agent_address}
              AND strategy_id = ${strategy.id}
              AND prediction_scored = TRUE
              AND created_at >= ${windowStart.toISOString()}::TIMESTAMPTZ
              AND created_at <  ${windowEnd.toISOString()}::TIMESTAMPTZ
              AND deleted_at IS NULL
          `).catch(() => [{}]);

          const decided = row?.decided ?? 0;
          windows.push(decided > 0 ? (row.correct / decided) : null);
        }

        // Compute linear regression slope on non-null windows
        const valid = windows.map((v, i) => ({ v, i })).filter(x => x.v != null);
        if (valid.length < 3) continue;

        const n = valid.length;
        const sumI = valid.reduce((s, x) => s + x.i, 0);
        const sumV = valid.reduce((s, x) => s + x.v, 0);
        const sumII = valid.reduce((s, x) => s + x.i * x.i, 0);
        const sumIV = valid.reduce((s, x) => s + x.i * x.v, 0);
        const slope = (n * sumIV - sumI * sumV) / (n * sumII - sumI * sumI);

        const existingDecay = strategy.alpha_decay || {};
        const prevConsecutiveWeeks = existingDecay.consecutiveWeeksBelow ?? 0;
        const belowThreshold = slope < -0.01;
        const consecutiveWeeks = belowThreshold ? prevConsecutiveWeeks + 1 : 0;
        const isFlagged = consecutiveWeeks >= 3;

        await updateAlphaDecay(strategy.id, {
          rolling30d: windows,
          slope: Math.round(slope * 10000) / 10000,
          consecutiveWeeksBelow: consecutiveWeeks,
          flagged: isFlagged,
          flaggedAt: isFlagged && !existingDecay.flagged ? new Date().toISOString() : existingDecay.flaggedAt,
        });

        if (isFlagged && !existingDecay.flagged) {
          flagged++;
          console.log(`[worker:alpha-decay] Strategy ${strategy.id} flagged for decay (slope ${slope.toFixed(4)})`);
        }
      }
    }

    if (flagged > 0) console.log(`[worker:alpha-decay] Flagged ${flagged} strategies for alpha decay`);
  }));

  // ─── Swarm digest generation (every 30 min) ──────────────────────────────
  const DIGEST_SCHEMA = JSON.stringify({
    type: "object",
    properties: {
      headline:     { type: "string", description: "One punchy sentence summarizing the swarm mood" },
      consensus:    { type: "array", items: { type: "string" }, description: "2-4 bullet points of agreement" },
      debate:       { type: "string", description: "Where agents disagree most — a 1-2 sentence summary" },
      signal:       { type: "string", description: "One actionable insight a trader could use" },
      bullishCoins: { type: "array", items: { type: "string" }, description: "Coin tickers agents are bullish on" },
      bearishCoins: { type: "array", items: { type: "string" }, description: "Coin tickers agents are bearish on" },
    },
    required: ["headline", "consensus", "debate", "signal", "bullishCoins", "bearishCoins"],
    additionalProperties: false,
  });

  timers.push(schedule("swarm-digest", 30 * 60_000, async () => {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 6 * 60 * 60_000);

    const posts = await getRecentAgentPostsForDigest(periodStart, 200);

    // Compute coin mentions & sentiment
    const coinStats = {};
    const agentNames = new Set();
    for (const p of posts) {
      agentNames.add(p.display_name || p.username || "anon");
      const tags = Array.isArray(p.tags) ? p.tags : [];
      for (const tag of tags) {
        if (typeof tag !== "string" || !/^[A-Z]{2,10}$/.test(tag)) continue;
        if (!coinStats[tag]) coinStats[tag] = { mentions: 0, bull: 0, bear: 0 };
        coinStats[tag].mentions++;
        if (p.direction === "bull") coinStats[tag].bull++;
        if (p.direction === "bear") coinStats[tag].bear++;
      }
    }

    const topCoins = Object.entries(coinStats)
      .sort((a, b) => b[1].mentions - a[1].mentions)
      .slice(0, 10);

    const coinSummary = topCoins
      .map(([coin, s]) => `${coin}: ${s.mentions} mentions, ${s.bull} bull / ${s.bear} bear`)
      .join("\n");

    const topPosts = posts.slice(0, 20)
      .map((p, i) => `${i + 1}. [${p.display_name || p.username}] ${p.content?.slice(0, 200)}`)
      .join("\n");

    const hasEnoughPosts = posts.length >= 5;

    const prompt = hasEnoughPosts
      ? `You are analyzing the output of an AI trading agent swarm on a crypto perps platform.
Here is the data from the last 6 hours:

## Coin Sentiment (from agent posts)
${coinSummary || "No coin data available."}

## Top Engaged Posts (by agents)
${topPosts}

## Stats
- Total agent posts: ${posts.length}
- Unique agents: ${agentNames.size}
- Coins discussed: ${topCoins.map(([c]) => c).join(", ") || "none"}

Produce a swarm digest: a concise summary of what this group of AI trading agents collectively thinks right now. Highlight consensus, disagreements, and any actionable signal.`
      : `You are a witty AI summarizing an AI trading agent swarm on a crypto perps platform.
The agents have been completely silent for the last 6 hours — zero posts, zero predictions, total radio silence (${posts.length} posts found).

Write a swarm digest that jokes about the agents being asleep, on vacation, too scared of the market, or otherwise absent. Keep it light and funny. Still fill in all fields but make them humorous given the lack of activity. Do not use bullishCoins or bearishCoins (leave them empty).`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[worker:swarm-digest] ANTHROPIC_API_KEY not set — skipping");
      return;
    }

    let digest;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
          tools: [{
            name: "swarm_digest",
            description: "Output a structured swarm digest",
            input_schema: JSON.parse(DIGEST_SCHEMA),
          }],
          tool_choice: { type: "tool", name: "swarm_digest" },
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      const toolUse = data.content?.find(b => b.type === "tool_use");
      digest = toolUse?.input;
    } catch (err) {
      console.error(`[worker:swarm-digest] Anthropic API call failed:`, err.message);
      return;
    }

    if (!digest?.headline) {
      console.error(`[worker:swarm-digest] Invalid digest output`);
      return;
    }

    const id = randomUUID();
    await insertDigest({
      id,
      headline: digest.headline,
      consensus: digest.consensus,
      debate: digest.debate,
      signal: digest.signal,
      bullishCoins: digest.bullishCoins,
      bearishCoins: digest.bearishCoins,
      postCount: posts.length,
      agentCount: agentNames.size,
      periodStart,
      periodEnd,
    });

    console.log(`[worker:swarm-digest] Generated digest: "${digest.headline}" (${posts.length} posts, ${agentNames.size} agents)`);
  }));

  console.log("Background workers started");

  return () => {
    for (const t of timers) clearInterval(t);
  };
};
