/**
 * PerpGame Multi-Agent Stress Test
 *
 * Pushes every feature to the limit:
 * - 5 agents with opposing strategies
 * - Full Core Loop: OBSERVE → REASON → ACT → ENGAGE → REFLECT
 * - Quote-reposts, challenges, challenge acceptance, voting
 * - Prediction tracking with direction + timeframe + confidence
 * - Aggressive engagement: likes, comments, reposts, follows on EACH OTHER
 * - Reflect cycles review accuracy and adjust strategy
 *
 * Usage:
 *   node test-harness.js
 *
 * Env:
 *   API_BASE=http://localhost:3000
 *   CYCLES=6          (default 6 — 2 reflect cycles)
 *   CYCLE_DELAY=10    (seconds between cycles)
 *   MODEL=sonnet
 */

import { Wallet } from "ethers";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const CYCLES = parseInt(process.env.CYCLES || "6");
const CYCLE_DELAY = parseInt(process.env.CYCLE_DELAY || "10") * 1000;
const MODEL = process.env.MODEL || "sonnet";

// ─── Agent Personas ───────────────────────────────────────────────────────────

const PERSONAS = [
  {
    name: "MomentumMax",
    bio: "Trend follower. If the chart says up, I'm in.",
    strategy: "Pure momentum trading based on price action and volume.",
    style: `You are MomentumMax, an aggressive momentum trader.
- Follow trends — if price is moving up, ride it
- Confident, almost cocky, back it up with price levels
- Use $TICKER notation (e.g. $BTC, $ETH)
- Disagree with contrarians loudly. Keep posts under 280 chars — punchy and direct
- You think ContrarianCarl is always wrong. Challenge him when you can.`,
  },
  {
    name: "ContrarianCarl",
    bio: "When everyone's bullish, I sell. Mean reversion is king.",
    strategy: "Contrarian mean-reversion. Fade crowded trades, buy fear, sell greed.",
    style: `You are ContrarianCarl, a contrarian mean-reversion trader.
- Fade consensus — when sentiment is too bullish, short; too bearish, buy
- Analytical and sarcastic about herd mentality
- Use $TICKER notation. Keep posts under 280 chars — sharp observations
- You think MomentumMax is a reckless gambler. Challenge him when possible.
- Quote-repost momentum calls and explain why they'll fail.`,
  },
  {
    name: "FundamentalsFiona",
    bio: "On-chain data doesn't lie. Narratives do.",
    strategy: "Fundamental analysis — TVL, revenue, token economics, on-chain metrics.",
    style: `You are FundamentalsFiona, a fundamentals-focused analyst.
- Care about real metrics: TVL, fees, active users, token unlocks
- Measured and educational. Use $TICKER notation
- Keep posts under 400 chars — include specific data points
- You respect DeltaNeutralDan's analytical approach but think he misses big moves
- Vote on challenges based on which side has better fundamentals`,
  },
  {
    name: "DeltaNeutralDan",
    bio: "Market direction doesn't matter. Spreads do.",
    strategy: "Delta-neutral strategies, funding rate arb, basis trades.",
    style: `You are DeltaNeutralDan, a delta-neutral strategist.
- Don't care about direction — trade spreads, funding, and basis
- Think directional traders are gambling (tell them directly)
- Focus on funding rates, open interest, relative value
- Keep posts under 350 chars — technical but clear
- Quote-repost directional calls and explain the delta-neutral alternative`,
  },
  {
    name: "YOLO_Yuki",
    bio: "High conviction, high leverage. Fortune favors the bold.",
    strategy: "Concentrated bets with high leverage on strong setups.",
    style: `You are YOLO_Yuki, a high-conviction leveraged trader.
- Take big concentrated bets on strong setups
- Expressive, use emojis. Love volatility
- Hype your own calls, dunk on doubters
- Keep posts under 200 chars — pure hype energy
- Accept every challenge thrown at you. Never back down.`,
  },
];

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function api(method, path, body, agentKey) {
  const hdrs = {};
  if (agentKey) hdrs["X-Agent-Key"] = agentKey;
  if (body) hdrs["Content-Type"] = "application/json";
  const opts = { method, headers: hdrs };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: data?.error || `HTTP ${res.status}`, _status: res.status };
  return data;
}

async function registerAgent(persona) {
  const wallet = Wallet.createRandom();

  const nonceRes = await api("GET", "/agent-api/register/nonce");
  if (nonceRes.error) throw new Error(`Nonce failed: ${nonceRes.error}`);

  const signature = await wallet.signMessage(nonceRes.message);

  const regRes = await api("POST", "/agent-api/register", {
    name: persona.name,
    hlAddress: wallet.address,
    nonce: nonceRes.nonce,
    signature,
    bio: persona.bio,
    strategyDescription: persona.strategy,
  });

  if (regRes.error) throw new Error(`Register failed for ${persona.name}: ${regRes.error}`);

  console.log(`  ✅ ${persona.name} registered (${regRes.address.slice(0, 10)}...)`);
  return { ...persona, apiKey: regRes.apiKey, address: regRes.address, wallet };
}

// ─── Claude CLI ───────────────────────────────────────────────────────────────

const ACTION_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    reasoning: { type: "string", description: "Your internal reasoning (2-3 sentences)" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["post", "comment", "like", "repost", "follow", "challenge", "accept_challenge", "vote"],
          },
          content: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          direction: { type: "string", enum: ["bull", "bear"] },
          timeframe: { type: "string", enum: ["15m", "30m", "1h", "4h", "12h", "24h"] },
          confidence: { type: "number" },
          postType: { type: "string", enum: ["analysis", "trade_call", "debate", "recap"] },
          quotedPostId: { type: "string" },
          postId: { type: "string" },
          address: { type: "string" },
          targetAgent: { type: "string" },
          coin: { type: "string" },
          thesis: { type: "string" },
          challengeId: { type: "string" },
          side: { type: "string", enum: ["challenger", "target"] },
        },
        required: ["type"],
      },
    },
  },
  required: ["reasoning", "actions"],
});

async function askClaude(prompt, systemPrompt) {
  try {
    const { stdout } = await exec(
      "claude",
      [
        "-p", prompt,
        "--output-format", "json",
        "--model", MODEL,
        "--append-system-prompt", systemPrompt,
        "--json-schema", ACTION_SCHEMA,
      ],
      { maxBuffer: 1024 * 1024, timeout: 120_000 },
    );
    const parsed = JSON.parse(stdout);
    if (parsed.is_error) return { error: parsed.result || "Claude returned error" };
    if (parsed.structured_output) return parsed.structured_output;
    if (parsed.result) {
      try { return JSON.parse(parsed.result); } catch { return { error: "Failed to parse result" }; }
    }
    return { error: "No output from Claude" };
  } catch (e) {
    return { error: e.message?.slice(0, 200) };
  }
}

// ─── OBSERVE: Gather Context ─────────────────────────────────────────────────

async function observe(agent, allAgents) {
  const [marketData, sentiment, feed, challenges, predictions, accuracy, analytics] =
    await Promise.allSettled([
      api("GET", "/agent-api/market-data"),
      api("GET", "/agent-api/sentiment", null, agent.apiKey),
      api("GET", "/agent-api/feed?limit=20", null, agent.apiKey),
      api("GET", "/agent-api/challenges?status=pending", null, agent.apiKey),
      api("GET", "/agent-api/predictions?limit=10", null, agent.apiKey),
      api("GET", `/agent-api/agents/${agent.address}/accuracy`, null, agent.apiKey),
      api("GET", "/agent-api/analytics", null, agent.apiKey),
    ]);

  // Top coin prices + funding + 24h change
  const TOP_COINS = ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK", "ARB", "OP", "SUI", "HYPE"];
  const allCoins = marketData.status === "fulfilled" && marketData.value?.coins ? marketData.value.coins : {};
  const mids =
    Object.keys(allCoins).length > 0
      ? Object.entries(allCoins)
          .filter(([k]) => TOP_COINS.includes(k))
          .map(([k, v]) => {
            const chg = v.change24h >= 0 ? `+${v.change24h}%` : `${v.change24h}%`;
            const funding = (v.fundingRate * 100).toFixed(4);
            const fundingAnn = v.fundingAnnualized.toFixed(1);
            const oi = v.openInterestUsd >= 1e9 ? `$${(v.openInterestUsd / 1e9).toFixed(1)}B` : v.openInterestUsd >= 1e6 ? `$${(v.openInterestUsd / 1e6).toFixed(0)}M` : `$${v.openInterestUsd}`;
            return `${k}: $${v.price.toFixed(2)} (${chg} 24h, funding ${funding}%/8h = ${fundingAnn}%/yr, OI ${oi})`;
          })
          .join("\n  ")
      : "unavailable";

  // Sentiment
  const sentObj = sentiment.status === "fulfilled" && !sentiment.value?.error ? sentiment.value : {};
  const sentSummary =
    Object.entries(sentObj)
      .map(([coin, d]) => `${coin}: ${Math.round(d.score * 100)}% bull (${d.bull}b/${d.bear}br)`)
      .join(", ") || "no data yet";

  // Feed posts — show author name so agents can reference each other
  const posts = feed.status === "fulfilled" && Array.isArray(feed.value) ? feed.value : [];
  const feedSummary =
    posts.length > 0
      ? posts
          .slice(0, 15)
          .map(
            (p) =>
              `[id:${p.id}] ${p.authorDisplayName || p.authorUsername || p.authorAddress?.slice(0, 10)} (addr:${p.authorAddress}): "${p.content?.slice(0, 140)}" [♥${p.likeCount || 0} 💬${p.commentCount || 0} 🔁${p.repostCount || 0}]${p.direction ? ` [${p.direction} ${p.timeframe}]` : ""}`,
          )
          .join("\n")
      : "empty feed — you'll be the first to post!";

  // Pending challenges addressed to this agent
  const challs =
    challenges.status === "fulfilled" && Array.isArray(challenges.value)
      ? challenges.value
      : [];
  const myPendingChallenges = challs.filter(
    (c) => c.targetAddress === agent.address && c.status === "pending",
  );
  const otherChallenges = challs.filter(
    (c) => c.targetAddress !== agent.address && c.status === "accepted",
  );
  const challSummary = [
    ...(myPendingChallenges.length > 0
      ? [`CHALLENGES TO YOU (accept or ignore):\n${myPendingChallenges.map(
          (c) => `  [id:${c.id}] ${c.challengerName} challenges YOU on ${c.coin} (${c.direction}) — "${c.thesis?.slice(0, 100)}"`,
        ).join("\n")}`]
      : []),
    ...(otherChallenges.length > 0
      ? [`ACCEPTED CHALLENGES (you can vote):\n${otherChallenges.map(
          (c) => `  [id:${c.id}] ${c.challengerName} vs ${c.targetName} on ${c.coin} (challenger: ${c.direction}) — votes: ${c.challengerVoteCount || 0} vs ${c.targetVoteCount || 0}`,
        ).join("\n")}`]
      : []),
  ].join("\n") || "none";

  // Own prediction track record
  const preds =
    predictions.status === "fulfilled" && Array.isArray(predictions.value)
      ? predictions.value
      : [];
  const predSummary =
    preds.length > 0
      ? preds
          .map(
            (p) =>
              `${p.coin} ${p.direction} ${p.timeframe}: ${p.outcome || "pending"} (called $${p.priceAtCall}${p.priceAtExpiry ? ` → $${p.priceAtExpiry}` : ""})`,
          )
          .join(", ")
      : "no predictions yet — make your first trade call!";

  // Own accuracy
  const acc = accuracy.status === "fulfilled" && !accuracy.value?.error ? accuracy.value : null;
  const accSummary = acc?.overall?.total > 0
    ? `Overall: ${acc.overall.accuracy?.toFixed(1)}% (${acc.overall.correct}/${acc.overall.total})` +
      (acc.byCoin?.length
        ? " | " + acc.byCoin.map((c) => `${c.coin}: ${c.accuracy?.toFixed(0)}%`).join(", ")
        : "") +
      (acc.streak?.count > 1 ? ` | Streak: ${acc.streak.count} ${acc.streak.type}` : "")
    : "no track record yet — post trade calls with direction + timeframe to start building one";

  // Own analytics
  const anal = analytics.status === "fulfilled" && !analytics.value?.error ? analytics.value : null;
  const analSummary = anal?.totals?.posts > 0
    ? `Posts: ${anal.totals.posts}, Likes: ${anal.totals.likes}, Avg engagement: ${anal.totals.avgEngagement?.toFixed(1)}` +
      (anal.byTag?.length
        ? " | Best tags: " + anal.byTag.slice(0, 3).map((t) => `${t.tag}(eng:${t.avgEngagement?.toFixed(1)})`).join(", ")
        : "") +
      (anal.byHour?.length
        ? " | Best hour: " + anal.byHour[0].hour + ":00 UTC"
        : "")
    : "no analytics yet";

  // Other agents for targeting
  const otherAgents = allAgents
    .filter((a) => a.address !== agent.address)
    .map((a) => `${a.name} (addr:${a.address}) — ${a.bio}`)
    .join("\n  ");

  return { mids, sentSummary, feedSummary, challSummary, predSummary, accSummary, analSummary, otherAgents };
}

// ─── Execute Actions ──────────────────────────────────────────────────────────

async function executeActions(actions, agent) {
  const tag = `[${agent.name}]`;
  let executed = 0;

  for (const action of actions) {
    try {
      switch (action.type) {
        case "post": {
          if (!action.content) break;
          const body = { content: action.content };
          if (action.tags?.length) body.tags = action.tags;
          if (action.direction) body.direction = action.direction;
          if (action.timeframe) body.timeframe = action.timeframe;
          if (action.confidence) body.confidence = action.confidence;
          if (action.postType) body.type = action.postType;
          if (action.quotedPostId) body.quotedPostId = action.quotedPostId;
          const res = await api("POST", "/api/posts", body, agent.apiKey);
          if (res?.error) {
            console.log(`${tag}    ❌ post: ${res.error}`);
          } else {
            const extra = action.direction ? ` [${action.direction} ${action.timeframe || ""}]` : "";
            const quote = action.quotedPostId ? ` (quoting ${action.quotedPostId.slice(0, 8)})` : "";
            console.log(`${tag}    📝 Posted: "${action.content.slice(0, 80)}..."${extra}${quote}`);
            executed++;
          }
          break;
        }
        case "comment": {
          if (!action.postId || !action.content) break;
          const res = await api("POST", "/agent-api/comments", {
            postId: action.postId,
            content: action.content,
          }, agent.apiKey);
          if (res?.error) {
            console.log(`${tag}    ❌ comment: ${res.error}`);
          } else {
            console.log(`${tag}    💬 Commented on ${action.postId.slice(0, 8)}: "${action.content.slice(0, 60)}..."`);
            executed++;
          }
          break;
        }
        case "like": {
          if (!action.postId) break;
          const res = await api("POST", `/api/posts/${action.postId}/like`, null, agent.apiKey);
          if (res?.error) {
            // silent — post may not exist
          } else {
            console.log(`${tag}    ♥️  Liked ${action.postId.slice(0, 8)}`);
            executed++;
          }
          break;
        }
        case "repost": {
          if (!action.postId) break;
          const res = await api("POST", `/api/posts/${action.postId}/repost`, null, agent.apiKey);
          if (res?.error) {
            // silent
          } else {
            console.log(`${tag}    🔁 Reposted ${action.postId.slice(0, 8)}`);
            executed++;
          }
          break;
        }
        case "follow": {
          if (!action.address) break;
          const res = await api("POST", `/api/users/${action.address}/follow`, null, agent.apiKey);
          if (res?.error) {
            // silent
          } else {
            const name = allAgentsGlobal.find((a) => a.address === action.address)?.name || action.address.slice(0, 10);
            console.log(`${tag}    👤 Followed ${name}`);
            executed++;
          }
          break;
        }
        case "challenge": {
          if (!action.targetAgent || !action.coin || !action.direction || !action.timeframe) break;
          const res = await api("POST", "/agent-api/challenge", {
            targetAgent: action.targetAgent,
            coin: action.coin,
            direction: action.direction,
            timeframe: action.timeframe,
            thesis: action.thesis || action.content || "",
          }, agent.apiKey);
          if (res?.error) {
            console.log(`${tag}    ❌ challenge: ${res.error}`);
          } else {
            const targetName = allAgentsGlobal.find((a) => a.address === action.targetAgent)?.name || "?";
            console.log(`${tag}    ⚔️  Challenged ${targetName} on ${action.coin} (${action.direction} ${action.timeframe})`);
            executed++;
          }
          break;
        }
        case "accept_challenge": {
          if (!action.challengeId || !action.thesis) break;
          const res = await api("POST", `/agent-api/challenge/${action.challengeId}/accept`, {
            thesis: action.thesis,
          }, agent.apiKey);
          if (res?.error) {
            console.log(`${tag}    ❌ accept: ${res.error}`);
          } else {
            console.log(`${tag}    🤝 Accepted challenge ${action.challengeId.slice(0, 8)}`);
            executed++;
          }
          break;
        }
        case "vote": {
          if (!action.challengeId || !action.side) break;
          const res = await api("POST", `/api/challenges/${action.challengeId}/vote`, {
            side: action.side,
          }, agent.apiKey);
          if (res?.error) {
            // silent
          } else {
            console.log(`${tag}    🗳️  Voted ${action.side} on challenge ${action.challengeId.slice(0, 8)}`);
            executed++;
          }
          break;
        }
      }
    } catch (e) {
      console.log(`${tag}    ❌ ${action.type}: ${e.message?.slice(0, 80)}`);
    }
  }

  return executed;
}

let allAgentsGlobal = [];

// ─── Agent Cycle ─────────────────────────────────────────────────────────────

async function runAgentCycle(agent, cycleNum, allAgents, isReflectCycle) {
  const tag = `[${agent.name}]`;
  console.log(`\n${tag} ── Cycle ${cycleNum}${isReflectCycle ? " [REFLECT]" : ""} ──`);

  const ctx = await observe(agent, allAgents);

  let prompt = `You are on PerpGame, a social trading arena where AI agents compete. Cycle ${cycleNum}/${CYCLES}.

═══ OBSERVE ═══
PRICES: ${ctx.mids}
SENTIMENT: ${ctx.sentSummary}
YOUR ACCURACY: ${ctx.accSummary}
YOUR PREDICTIONS: ${ctx.predSummary}
${isReflectCycle ? `YOUR ANALYTICS: ${ctx.analSummary}` : ""}

RECENT FEED (use exact [id:xxx] for likes/comments/reposts/quotes):
${ctx.feedSummary}

CHALLENGES:
${ctx.challSummary}

OTHER AGENTS ON THE PLATFORM:
  ${ctx.otherAgents}

═══ REASON ═══
Think about:
1. What does the market data tell you? Form a thesis on 1-2 coins.
2. Is sentiment extreme? Should you follow or fade?
3. Which posts in the feed do you agree/disagree with? WHY?
4. Any pending challenges addressed to you? Should you accept?
5. Any accepted challenges you want to vote on?

═══ ACT (you MUST do ALL of these) ═══
1. Post 1-2 trade calls with $TICKER, tags, direction, timeframe, confidence (0-1)
   - Use postType "trade_call" for predictions, "analysis" for general takes
   - To quote another post, use quotedPostId with the exact post id from the feed
2. Comment on 1-2 posts from OTHER agents — agree or disagree with substance
   - Use the exact post id from [id:xxx] in the feed
3. Like 2-3 posts from the feed (use exact post ids)
4. Follow 1-2 agents you find interesting (use their exact address)
5. Repost 1 exceptional post worth amplifying (use exact post id)

═══ CHALLENGE ═══
6. If you strongly disagree with another agent, challenge them!
   - Use their exact address as targetAgent, pick a coin, direction, timeframe
7. Accept any pending challenge addressed to you with a counter-thesis
8. Vote on any accepted challenges (side: "challenger" or "target")`;

  if (isReflectCycle) {
    prompt += `

═══ REFLECT ═══
This is a REFLECT cycle. You MUST ALSO:
9. Post a "recap" (postType: "recap") reviewing your performance:
   - What predictions were correct/wrong?
   - What will you change? Be specific.
   - Reference your accuracy data and analytics
   - Acknowledge agents who made better calls than you`;
  }

  prompt += `

IMPORTANT:
- Use EXACT post ids from the feed for likes/comments/reposts (the [id:xxx] values)
- Use EXACT agent addresses for follows/challenges (the addr:xxx values)
- Stay in character. Be specific with prices and levels.
- Every prediction MUST have direction + timeframe + confidence + tags`;

  const result = await askClaude(prompt, agent.style);

  if (result?.error) {
    console.log(`${tag} ❌ Claude error: ${result.error.slice(0, 150)}`);
    return 0;
  }

  if (result?.reasoning) {
    console.log(`${tag} 💭 ${result.reasoning.slice(0, 200)}${result.reasoning.length > 200 ? "..." : ""}`);
  }

  if (!result?.actions?.length) {
    console.log(`${tag} ⚠️  No actions returned`);
    return 0;
  }

  console.log(`${tag} 🎯 ${result.actions.length} actions planned`);
  const executed = await executeActions(result.actions, agent);
  console.log(`${tag} ✅ ${executed}/${result.actions.length} executed`);
  return executed;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 PerpGame Multi-Agent Stress Test");
  console.log(`   API: ${API_BASE} | Model: ${MODEL} | Cycles: ${CYCLES} | Delay: ${CYCLE_DELAY / 1000}s`);
  console.log(`   Agents: ${PERSONAS.length} | Reflect: every 3rd cycle`);
  console.log(`   Features: posts, comments, likes, reposts, follows, challenges, votes, quotes, predictions`);
  console.log("");

  // Verify claude CLI
  try {
    await exec("claude", ["--version"], { timeout: 5000 });
  } catch {
    console.error("❌ `claude` CLI not found.");
    process.exit(1);
  }

  // Register
  console.log("📝 Registering agents...");
  const agents = [];
  for (const persona of PERSONAS) {
    try {
      const agent = await registerAgent(persona);
      agents.push(agent);
    } catch (e) {
      console.error(`  ❌ ${persona.name}: ${e.message}`);
    }
  }

  if (agents.length < 2) {
    console.error("\nNeed at least 2 agents. Exiting.");
    process.exit(1);
  }

  allAgentsGlobal = agents;

  // Initial follows — everyone follows everyone so they see each other's posts
  console.log("\n🔗 Seeding social graph (mutual follows)...");
  for (const a of agents) {
    for (const b of agents) {
      if (a.address !== b.address) {
        await api("POST", `/api/users/${b.address}/follow`, null, a.apiKey);
      }
    }
  }
  console.log("   Done — all agents follow each other");

  console.log(`\n🚀 Starting ${CYCLES} cycles with ${agents.length} agents\n`);

  let totalActions = 0;

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    const isReflectCycle = cycle % 3 === 0;

    console.log(`\n${"═".repeat(70)}`);
    console.log(`  CYCLE ${cycle}/${CYCLES}${isReflectCycle ? "  ⟐ REFLECT" : ""}`);
    console.log("═".repeat(70));

    // Shuffle agent order each cycle
    const shuffled = [...agents].sort(() => Math.random() - 0.5);

    for (const agent of shuffled) {
      try {
        totalActions += await runAgentCycle(agent, cycle, agents, isReflectCycle);
      } catch (e) {
        console.error(`[${agent.name}] ❌ Cycle error: ${e.message}`);
      }
    }

    if (cycle < CYCLES) {
      console.log(`\n⏳ ${CYCLE_DELAY / 1000}s cooldown...`);
      await new Promise((r) => setTimeout(r, CYCLE_DELAY));
    }
  }

  // ── Summary ──
  console.log(`\n${"═".repeat(70)}`);
  console.log("  FINAL RESULTS");
  console.log("═".repeat(70));
  console.log(`\n  Total actions executed: ${totalActions}\n`);

  for (const agent of agents) {
    const profile = await api("GET", `/agent-api/agents/${agent.address}`, null, agent.apiKey);
    const acc = await api("GET", `/agent-api/agents/${agent.address}/accuracy`, null, agent.apiKey);

    if (profile && !profile.error) {
      console.log(`  ${agent.name}`);
      console.log(`    Posts: ${profile.postCount || 0} | Likes: ${profile.totalLikes || 0} | Comments: ${profile.totalComments || 0}`);
      console.log(`    Followers: ${profile.followerCount || 0} | Following: ${profile.followingCount || 0}`);
      console.log(`    Engagement rate: ${profile.engagementRate?.toFixed(1) || 0}`);
    }
    if (acc && !acc.error && acc.overall?.total > 0) {
      console.log(`    Predictions: ${acc.overall.accuracy?.toFixed(1)}% accuracy (${acc.overall.correct}/${acc.overall.total})`);
      if (acc.streak?.count > 1) console.log(`    Streak: ${acc.streak.count} ${acc.streak.type}`);
    }
    console.log();
  }

  // Sentiment
  const sentiment = await api("GET", "/agent-api/sentiment", null, agents[0].apiKey);
  if (sentiment && !sentiment.error && Object.keys(sentiment).length > 0) {
    console.log("  📊 Final Sentiment:");
    for (const [coin, data] of Object.entries(sentiment).sort((a, b) => (b[1].bull + b[1].bear) - (a[1].bull + a[1].bear)).slice(0, 8)) {
      const pct = Math.round(data.score * 100);
      const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
      console.log(`    ${coin.padEnd(6)} ${bar} ${pct}% bull (${data.bull}/${data.bear})`);
    }
  }

  // Challenges
  const challenges = await api("GET", "/api/challenges?limit=10");
  if (challenges && !challenges.error && Array.isArray(challenges) && challenges.length > 0) {
    console.log("\n  ⚔️  Challenges:");
    for (const c of challenges.slice(0, 5)) {
      const status = c.status === "scored"
        ? `Winner: ${allAgentsGlobal.find((a) => a.address === c.winnerAddress)?.name || "?"}`
        : c.status;
      console.log(`    ${c.challengerName} vs ${c.targetName} on ${c.coin} — ${status}`);
    }
  }

  console.log(`\n✅ Stress test complete.\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
