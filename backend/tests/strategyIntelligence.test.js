/**
 * Tests for the strategy intelligence layer — parts not covered by strategies.test.js.
 *
 * Focused on:
 * - evaluate with real matched predictions (stats, walk-forward, persistence)
 * - evaluate with regimeFilter
 * - holdout gate opens after dev_validated promotion
 * - strategy mutation/genealogy fields (parentId, mutationType, insight)
 * - wrongStreak computation in /home
 * - circuit breaker drawdown in /home
 * - coin edge profiles with populated data
 * - dev vs holdout partition respected by evaluate
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { getDb } from "../db/index.js"
import { ensureDb, createTestApp, createTestUser, createTestAgent, cleanup } from "./setup.js"

const app = createTestApp()
const createdAddresses = []

afterAll(async () => {
  const db = getDb()
  for (const addr of createdAddresses) {
    await db.execute(sql`DELETE FROM strategies WHERE agent_address = ${addr}`).catch(() => {})
    await db.execute(sql`DELETE FROM coin_edge_profiles WHERE agent_address = ${addr}`).catch(() => {})
  }
  await cleanup(createdAddresses)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const auth = (token) => ({ Authorization: `Bearer ${token}` })

/**
 * Insert a scored prediction directly. expiresHoursAgo controls sort order in /home
 * (getRecentScoredPredictions sorts by prediction_expires_at DESC).
 * Lower expiresHoursAgo = more recent = appears first in the list.
 */
async function insertScoredPrediction(authorAddress, {
  coin = "BTC",
  direction = "bull",
  timeframe = "1h",
  outcome = "correct",
  priceAtCall = 65000,
  priceAtExpiry = 66000,
  indicators = null,
  marketRegime = null,
  netDelta = null,
  atrAtCall = null,
  isHoldout = false,
  expiresHoursAgo = 1,
} = {}) {
  const db = getDb()
  const id = randomUUID()
  const indicatorsJson = indicators ? JSON.stringify(indicators) : null
  // Use a static interval string, not a parameterized value, to avoid Postgres interval param issues
  const expiresAt = new Date(Date.now() - expiresHoursAgo * 3_600_000).toISOString()

  await db.execute(sql`
    INSERT INTO posts (
      id, author_address, content, tags,
      direction, timeframe,
      prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
      prediction_expires_at, prediction_scored, prediction_outcome,
      prediction_indicators, market_regime, prediction_net_delta, atr_at_call,
      is_holdout
    ) VALUES (
      ${id}, ${authorAddress},
      ${`${direction} ${coin} ${timeframe} — intel test`},
      ${JSON.stringify([coin])},
      ${direction}, ${timeframe},
      ${coin}, ${priceAtCall}, ${priceAtExpiry},
      ${expiresAt}::TIMESTAMPTZ, TRUE, ${outcome},
      ${indicatorsJson}::jsonb,
      ${marketRegime},
      ${netDelta},
      ${atrAtCall},
      ${isHoldout}
    )
  `)
  return id
}

// ─── Suite 1: Evaluate with real matched predictions ─────────────────────────

describe("evaluate — with real matched predictions", () => {
  let evalAgent, evalToken, strategyId

  // rsi=28 satisfies condition rsi < 40
  const matchingInd = { rsi: 28, trend: "bullish", macdHist: 0.5 }
  // rsi=65 does NOT satisfy rsi < 40
  const nonMatchingInd = { rsi: 65, trend: "bearish", macdHist: -0.3 }

  beforeAll(async () => {
    await ensureDb()
    const user = await createTestUser()
    evalAgent = await createTestAgent(user.address, "EvalBot")
    evalToken = (await createTestUser(evalAgent.agentAddress)).token
    createdAddresses.push(user.address, evalAgent.agentAddress)

    // 10 bull correct — rsi < 40 → MATCH
    for (let i = 0; i < 10; i++) {
      await insertScoredPrediction(evalAgent.agentAddress, {
        direction: "bull", outcome: "correct",
        indicators: matchingInd, netDelta: 0.015, atrAtCall: 500,
        marketRegime: "trending",
      })
    }
    // 5 bull wrong — rsi < 40 → MATCH
    for (let i = 0; i < 5; i++) {
      await insertScoredPrediction(evalAgent.agentAddress, {
        direction: "bull", outcome: "wrong",
        indicators: matchingInd, netDelta: -0.012, atrAtCall: 500,
        marketRegime: "trending",
      })
    }
    // 4 bull wrong — rsi >= 40 → condition fails → NOT MATCH
    for (let i = 0; i < 4; i++) {
      await insertScoredPrediction(evalAgent.agentAddress, {
        direction: "bull", outcome: "wrong",
        indicators: nonMatchingInd, netDelta: -0.010, atrAtCall: 500,
      })
    }
    // 3 bear correct — rsi < 40 → direction mismatch → NOT MATCH
    for (let i = 0; i < 3; i++) {
      await insertScoredPrediction(evalAgent.agentAddress, {
        direction: "bear", outcome: "correct",
        indicators: matchingInd, netDelta: 0.014, atrAtCall: 500,
      })
    }

    // Strategy: bull, rsi < 40
    const res = await request(app)
      .post(`/api/agents/${evalAgent.agentAddress}/strategies`)
      .set(auth(evalToken))
      .send({
        conditions: [{ path: "rsi", operator: "<", value: 40 }],
        direction: "bull",
        timeframe: "1h",
        coin: "BTC",
      })
    strategyId = res.body.id
  })

  it("matches only bull predictions where rsi < 40", async () => {
    const res = await request(app)
      .post(`/api/agents/${evalAgent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(evalToken))

    expect(res.status).toBe(200)
    // 10 correct + 5 wrong with matching indicators = 15 matched
    expect(res.body.matchedSignals).toBe(15)
  })

  it("totalPredictions reflects all dev-set predictions regardless of match", async () => {
    const res = await request(app)
      .post(`/api/agents/${evalAgent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(evalToken))

    expect(res.status).toBe(200)
    // 10 + 5 + 4 + 3 = 22 total dev predictions
    expect(res.body.totalPredictions).toBe(22)
  })

  it("stats.signals equals matched scored count", async () => {
    const res = await request(app)
      .post(`/api/agents/${evalAgent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(evalToken))

    expect(res.status).toBe(200)
    expect(res.body.stats.signals).toBe(15)
  })

  it("stats.accuracy computed from matched signals only", async () => {
    const res = await request(app)
      .post(`/api/agents/${evalAgent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(evalToken))

    expect(res.status).toBe(200)
    // 10 correct / 15 = 66.7%
    expect(res.body.stats.accuracy).toBeCloseTo(66.7, 0)
  })

  it("stats include kellyFraction, ciLower, ciUpper with valid ranges", async () => {
    const res = await request(app)
      .post(`/api/agents/${evalAgent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(evalToken))

    expect(res.status).toBe(200)
    const { stats } = res.body
    expect(typeof stats.kellyFraction).toBe("number")
    expect(typeof stats.ciLower).toBe("number")
    expect(typeof stats.ciUpper).toBe("number")
    expect(stats.ciLower).toBeLessThanOrEqual(stats.accuracy)
    expect(stats.ciUpper).toBeGreaterThanOrEqual(stats.accuracy)
  })

  it("promotionGate fails with fewer than 200 signals", async () => {
    const res = await request(app)
      .post(`/api/agents/${evalAgent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(evalToken))

    expect(res.status).toBe(200)
    expect(res.body.promotionGate.passes).toBe(false)
    expect(Array.isArray(res.body.promotionGate.failures)).toBe(true)
    expect(res.body.promotionGate.failures.length).toBeGreaterThan(0)
  })

  it("persists dev_stats to the strategy record", async () => {
    await request(app)
      .post(`/api/agents/${evalAgent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(evalToken))

    const listRes = await request(app)
      .get(`/api/agents/${evalAgent.agentAddress}/strategies`)
      .set(auth(evalToken))

    const s = listRes.body.strategies.find(s => s.id === strategyId)
    expect(s).toBeDefined()
    expect(s.dev_stats).not.toBeNull()
    expect(s.dev_stats.signals).toBe(15)
    expect(s.dev_stats.accuracy).toBeCloseTo(66.7, 0)
  })

  it("persists kelly_fraction to the strategy record", async () => {
    const listRes = await request(app)
      .get(`/api/agents/${evalAgent.agentAddress}/strategies`)
      .set(auth(evalToken))

    const s = listRes.body.strategies.find(s => s.id === strategyId)
    expect(s).toBeDefined()
    expect(typeof s.kelly_fraction).toBe("number")
  })
})

// ─── Suite 2: Evaluate with regimeFilter ─────────────────────────────────────

describe("evaluate — regimeFilter", () => {
  let agent, token, strategyId

  beforeAll(async () => {
    await ensureDb()
    const user = await createTestUser()
    agent = await createTestAgent(user.address, "RegimeFilterBot")
    token = (await createTestUser(agent.agentAddress)).token
    createdAddresses.push(user.address, agent.agentAddress)

    // 8 trending predictions
    for (let i = 0; i < 8; i++) {
      await insertScoredPrediction(agent.agentAddress, {
        direction: "bull", outcome: i < 6 ? "correct" : "wrong",
        indicators: { rsi: 30 }, marketRegime: "trending",
        netDelta: i < 6 ? 0.02 : -0.01, atrAtCall: 500,
      })
    }
    // 6 choppy predictions — should be excluded when regimeFilter=trending
    for (let i = 0; i < 6; i++) {
      await insertScoredPrediction(agent.agentAddress, {
        direction: "bull", outcome: "wrong",
        indicators: { rsi: 30 }, marketRegime: "choppy",
        netDelta: -0.02, atrAtCall: 500,
      })
    }

    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))
      .send({ conditions: [{ path: "rsi", operator: "<", value: 40 }], direction: "bull" })
    strategyId = res.body.id
  })

  it("regimeFilter=trending restricts to only trending predictions", async () => {
    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(token))
      .send({ regimeFilter: "trending" })

    expect(res.status).toBe(200)
    expect(res.body.totalPredictions).toBe(8)
  })

  it("unfiltered evaluate includes all 14 predictions", async () => {
    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(token))

    expect(res.status).toBe(200)
    expect(res.body.totalPredictions).toBe(14)
  })

  it("regimeFilter affects accuracy computation", async () => {
    const trending = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(token))
      .send({ regimeFilter: "trending" })

    const all = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(token))

    // Trending-only: 6/8 = 75%. All: 6/14 = ~42.9%. They should differ.
    expect(trending.body.stats.accuracy).not.toBe(all.body.stats.accuracy)
    expect(trending.body.stats.accuracy).toBeCloseTo(75, 0)
  })
})

// ─── Suite 3: Walk-forward folds built with enough data ──────────────────────

describe("evaluate — walk-forward folds", () => {
  let agent, token, strategyId

  beforeAll(async () => {
    await ensureDb()
    const user = await createTestUser()
    agent = await createTestAgent(user.address, "WalkFwdBot")
    token = (await createTestUser(agent.agentAddress)).token
    createdAddresses.push(user.address, agent.agentAddress)

    // 40 predictions — buildWalkForwardFolds needs >= numFolds*10 = 30
    for (let i = 0; i < 40; i++) {
      await insertScoredPrediction(agent.agentAddress, {
        direction: "bull",
        outcome: i % 3 === 0 ? "wrong" : "correct",
        indicators: { rsi: 28 },
        netDelta: i % 3 === 0 ? -0.01 : 0.015,
        atrAtCall: 500,
        // Stagger expiry so sorting is deterministic
        expiresHoursAgo: 40 - i,
      })
    }

    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))
      .send({ conditions: [{ path: "rsi", operator: "<", value: 40 }], direction: "bull" })
    strategyId = res.body.id
  })

  it("returns non-empty walkForward array", async () => {
    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(token))

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.walkForward)).toBe(true)
    expect(res.body.walkForward.length).toBeGreaterThan(0)
  })

  it("each fold has required fields", async () => {
    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(token))

    expect(res.status).toBe(200)
    for (const fold of res.body.walkForward) {
      expect(fold).toHaveProperty("fold")
      expect(fold).toHaveProperty("trainSignals")
      expect(fold).toHaveProperty("testSignals")
      expect(fold).toHaveProperty("accuracy")
      expect(fold).toHaveProperty("from")
      expect(fold).toHaveProperty("to")
    }
  })

  it("folds are ordered by fold number", async () => {
    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(token))

    expect(res.status).toBe(200)
    const folds = res.body.walkForward
    for (let i = 1; i < folds.length; i++) {
      expect(folds[i].fold).toBeGreaterThan(folds[i - 1].fold)
    }
  })
})

// ─── Suite 4: Holdout gate progression ───────────────────────────────────────

describe("evaluate — holdout gate by strategy status", () => {
  let agent, token, stratId

  beforeAll(async () => {
    await ensureDb()
    const user = await createTestUser()
    agent = await createTestAgent(user.address, "HoldoutGateBot")
    token = (await createTestUser(agent.agentAddress)).token
    createdAddresses.push(user.address, agent.agentAddress)

    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))
      .send({ conditions: [{ path: "rsi", operator: "<", value: 40 }], direction: "bull" })
    stratId = res.body.id
  })

  it("hypothesis: useHoldout=true returns 400", async () => {
    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${stratId}/evaluate`)
      .set(auth(token))
      .send({ useHoldout: true })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/dev_validated/)
  })

  it("candidate: useHoldout=true still returns 400", async () => {
    await request(app)
      .patch(`/api/agents/${agent.agentAddress}/strategies/${stratId}/status`)
      .set(auth(token))
      .send({ status: "candidate" })

    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${stratId}/evaluate`)
      .set(auth(token))
      .send({ useHoldout: true })

    expect(res.status).toBe(400)
  })

  it("dev_validated: useHoldout=true returns 200", async () => {
    await request(app)
      .patch(`/api/agents/${agent.agentAddress}/strategies/${stratId}/status`)
      .set(auth(token))
      .send({ status: "dev_validated" })

    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${stratId}/evaluate`)
      .set(auth(token))
      .send({ useHoldout: true })

    expect(res.status).toBe(200)
    expect(res.body.gate).toBe("holdoutValidated")
  })

  it("holdout evaluate persists holdout_stats to strategy record", async () => {
    await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${stratId}/evaluate`)
      .set(auth(token))
      .send({ useHoldout: true })

    const listRes = await request(app)
      .get(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))

    const s = listRes.body.strategies.find(s => s.id === stratId)
    expect(s).toBeDefined()
    expect(s.holdout_stats).not.toBeNull()
  })
})

// ─── Suite 5: Dev vs holdout partition ───────────────────────────────────────

describe("evaluate — dev vs holdout partition", () => {
  let agent, token, strategyId

  beforeAll(async () => {
    await ensureDb()
    const user = await createTestUser()
    agent = await createTestAgent(user.address, "PartitionBot")
    token = (await createTestUser(agent.agentAddress)).token
    createdAddresses.push(user.address, agent.agentAddress)

    // 7 dev-set predictions
    for (let i = 0; i < 7; i++) {
      await insertScoredPrediction(agent.agentAddress, {
        direction: "bull", outcome: "correct",
        indicators: { rsi: 28 }, isHoldout: false,
        netDelta: 0.02, atrAtCall: 500,
      })
    }
    // 5 holdout-set predictions
    for (let i = 0; i < 5; i++) {
      await insertScoredPrediction(agent.agentAddress, {
        direction: "bull", outcome: i < 3 ? "correct" : "wrong",
        indicators: { rsi: 28 }, isHoldout: true,
        netDelta: i < 3 ? 0.02 : -0.01, atrAtCall: 500,
      })
    }

    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))
      .send({ conditions: [{ path: "rsi", operator: "<", value: 40 }], direction: "bull" })
    strategyId = res.body.id

    // Promote to dev_validated to unlock holdout
    await request(app)
      .patch(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/status`)
      .set(auth(token))
      .send({ status: "dev_validated" })
  })

  it("useHoldout=false uses only dev-set (7 predictions)", async () => {
    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(token))
      .send({ useHoldout: false })

    expect(res.status).toBe(200)
    expect(res.body.totalPredictions).toBe(7)
  })

  it("useHoldout=true uses only holdout-set (5 predictions)", async () => {
    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(token))
      .send({ useHoldout: true })

    expect(res.status).toBe(200)
    expect(res.body.totalPredictions).toBe(5)
    expect(res.body.gate).toBe("holdoutValidated")
  })

  it("holdout accuracy is computed from holdout predictions only", async () => {
    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/evaluate`)
      .set(auth(token))
      .send({ useHoldout: true })

    expect(res.status).toBe(200)
    // 3 correct / 5 total = 60%
    expect(res.body.stats.accuracy).toBeCloseTo(60, 0)
  })
})

// ─── Suite 6: Strategy mutation/genealogy fields ──────────────────────────────

describe("POST /strategies — mutation and genealogy fields", () => {
  let agent, token

  beforeAll(async () => {
    await ensureDb()
    const user = await createTestUser()
    agent = await createTestAgent(user.address, "MutBot")
    token = (await createTestUser(agent.agentAddress)).token
    createdAddresses.push(user.address, agent.agentAddress)
  })

  it("stores parentId and mutationType=tighten", async () => {
    const parentRes = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))
      .send({ conditions: [{ path: "rsi", operator: "<", value: 35 }], direction: "bull" })
    const parentId = parentRes.body.id

    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))
      .send({
        conditions: [{ path: "rsi", operator: "<", value: 30 }],
        direction: "bull",
        parentId,
        mutationType: "tighten",
        insight: "Tightened after 3 consecutive losses in choppy regime",
      })

    expect(res.status).toBe(201)
    expect(res.body.parent_id).toBe(parentId)
    expect(res.body.mutation_type).toBe("tighten")
    expect(res.body.insight).toBe("Tightened after 3 consecutive losses in choppy regime")
  })

  it("stores mutationType=inverse for spawned inverse strategy", async () => {
    const parentRes = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))
      .send({ conditions: [{ path: "rsi", operator: "<", value: 35 }], direction: "bull" })
    const parentId = parentRes.body.id

    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))
      .send({
        conditions: [{ path: "rsi", operator: ">", value: 65 }],
        direction: "bear",
        parentId,
        mutationType: "inverse",
        insight: "Kelly went negative — spawning inverse",
      })

    expect(res.status).toBe(201)
    expect(res.body.mutation_type).toBe("inverse")
    expect(res.body.direction).toBe("bear")
    expect(res.body.parent_id).toBe(parentId)
  })

  it("defaults mutationType to origin when omitted", async () => {
    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))
      .send({ conditions: [{ path: "rsi", operator: "<", value: 40 }], direction: "bull" })

    expect(res.status).toBe(201)
    expect(res.body.mutation_type).toBe("origin")
    expect(res.body.parent_id).toBeNull()
  })

  it("insight is returned in strategy list", async () => {
    const insight = "RSI < 30 + negative funding in trending regime"
    await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))
      .send({
        conditions: [{ path: "rsi", operator: "<", value: 30 }],
        direction: "bull",
        insight,
      })

    const listRes = await request(app)
      .get(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))

    const found = listRes.body.strategies.find(s => s.insight === insight)
    expect(found).toBeDefined()
  })
})

// ─── Suite 7: wrongStreak in /home ───────────────────────────────────────────

describe("GET /api/home — wrongStreak from prediction history", () => {
  it("wrongStreak = 0 for agent with no predictions", async () => {
    await ensureDb()
    const user = await createTestUser()
    const agent = await createTestAgent(user.address, "ZeroStreakBot")
    createdAddresses.push(user.address, agent.agentAddress)

    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.your_account.wrongStreak).toBe(0)
  })

  it("wrongStreak counts consecutive wrong predictions from newest", async () => {
    await ensureDb()
    const user = await createTestUser()
    const agent = await createTestAgent(user.address, "StreakBot")
    createdAddresses.push(user.address, agent.agentAddress)

    // Oldest: 1 correct
    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "correct",
      priceAtCall: 65000, priceAtExpiry: 66000,
      expiresHoursAgo: 4,
    })
    // Then 3 consecutive wrong (most recent)
    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "wrong",
      priceAtCall: 65000, priceAtExpiry: 64000,
      expiresHoursAgo: 3,
    })
    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "wrong",
      priceAtCall: 65000, priceAtExpiry: 64000,
      expiresHoursAgo: 2,
    })
    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "wrong",
      priceAtCall: 65000, priceAtExpiry: 64000,
      expiresHoursAgo: 1,
    })

    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    // Newest-first: wrong, wrong, wrong, correct → streak = 3
    expect(res.body.your_account.wrongStreak).toBe(3)
  })

  it("wrongStreak resets to 0 when most recent prediction is correct", async () => {
    await ensureDb()
    const user = await createTestUser()
    const agent = await createTestAgent(user.address, "ResetStreakBot")
    createdAddresses.push(user.address, agent.agentAddress)

    // 2 older wrong predictions
    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "wrong",
      priceAtCall: 65000, priceAtExpiry: 64000,
      expiresHoursAgo: 3,
    })
    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "wrong",
      priceAtCall: 65000, priceAtExpiry: 64000,
      expiresHoursAgo: 2,
    })
    // Most recent: correct
    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "correct",
      priceAtCall: 65000, priceAtExpiry: 66000,
      expiresHoursAgo: 1,
    })

    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    // Newest-first: correct → streak breaks at 0
    expect(res.body.your_account.wrongStreak).toBe(0)
  })
})

// ─── Suite 8: Circuit breaker drawdown ───────────────────────────────────────

describe("GET /api/home — circuit breaker drawdown", () => {
  it("drawdownFromPeak = 0 with only correct predictions", async () => {
    await ensureDb()
    const user = await createTestUser()
    const agent = await createTestAgent(user.address, "AllWinBot")
    createdAddresses.push(user.address, agent.agentAddress)

    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "correct",
      priceAtCall: 100, priceAtExpiry: 115,
      expiresHoursAgo: 1,
    })

    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.circuit_breaker.drawdownFromPeak).toBe(0)
    expect(res.body.circuit_breaker.haltNewPositions).toBe(false)
    expect(res.body.circuit_breaker.kellyMultiplier).toBe(0.5)
  })

  it("circuit breaker fires when portfolio drawdown >= 15%", async () => {
    await ensureDb()
    const user = await createTestUser()
    const agent = await createTestAgent(user.address, "DrawdownBot")
    createdAddresses.push(user.address, agent.agentAddress)

    // prediction_expires_at is the sort key in getRecentScoredPredictions (DESC order).
    // Home code reverses the result to get chronological (oldest-first) order.
    // So: expiresHoursAgo=2 (older) is processed FIRST → big win sets the peak.
    //     expiresHoursAgo=1 (newer) is processed SECOND → big loss drops below peak.

    // Big win (older): +25% move → equity 1.0 → 1.25, peak = 1.25
    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "correct",
      priceAtCall: 100, priceAtExpiry: 125,
      expiresHoursAgo: 2,
    })
    // Big loss (newer): -25% → equity 1.25 × 0.75 = 0.9375
    // drawdown = (1.25 - 0.9375) / 1.25 = 25% → fires
    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "wrong",
      priceAtCall: 100, priceAtExpiry: 75,
      expiresHoursAgo: 1,
    })

    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.circuit_breaker.drawdownFromPeak).toBeGreaterThanOrEqual(15)
    expect(res.body.circuit_breaker.haltNewPositions).toBe(true)
    expect(res.body.circuit_breaker.active).toBe(true)
    expect(res.body.circuit_breaker.kellyMultiplier).toBe(0.35)
  })

  it("circuit breaker does not fire for sub-15% drawdown", async () => {
    await ensureDb()
    const user = await createTestUser()
    const agent = await createTestAgent(user.address, "SmallDdBot")
    createdAddresses.push(user.address, agent.agentAddress)

    // Win: +10% → equity = 1.10, peak = 1.10
    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "correct",
      priceAtCall: 100, priceAtExpiry: 110,
      expiresHoursAgo: 2,
    })
    // Loss: -5% → equity = 1.10 × 0.95 = 1.045
    // drawdown = (1.10 - 1.045) / 1.10 ≈ 5% → does not fire
    await insertScoredPrediction(agent.agentAddress, {
      direction: "bull", outcome: "wrong",
      priceAtCall: 100, priceAtExpiry: 95,
      expiresHoursAgo: 1,
    })

    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.circuit_breaker.haltNewPositions).toBe(false)
    expect(res.body.circuit_breaker.kellyMultiplier).toBe(0.5)
    expect(res.body.circuit_breaker.drawdownFromPeak).toBeLessThan(15)
  })
})

// ─── Suite 9: Coin edge profiles with populated data ─────────────────────────

describe("GET /strategies/:id/coin-profiles — with data", () => {
  let agent, token, strategyId

  beforeAll(async () => {
    await ensureDb()
    const user = await createTestUser()
    agent = await createTestAgent(user.address, "CoinProfBot")
    token = (await createTestUser(agent.agentAddress)).token
    createdAddresses.push(user.address, agent.agentAddress)

    const res = await request(app)
      .post(`/api/agents/${agent.agentAddress}/strategies`)
      .set(auth(token))
      .send({ conditions: [{ path: "rsi", operator: "<", value: 40 }], direction: "bull" })
    strategyId = res.body.id

    const db = getDb()
    await db.execute(sql`
      INSERT INTO coin_edge_profiles
        (agent_address, coin, signals, time_span_days, accuracy, ci_lower, kelly_fraction, best_regime, edge_status)
      VALUES
        (${agent.agentAddress}, 'BTC', 150, 95, 65.3, 57.1, 0.09, 'trending', 'confirmed'),
        (${agent.agentAddress}, 'ETH', 80,  60, 58.2, 48.0, 0.04, 'trending', 'weak'),
        (${agent.agentAddress}, 'DOGE', 51, 60, 47.1, 33.2, -0.06, NULL, 'none')
      ON CONFLICT (agent_address, coin) DO UPDATE SET
        signals = EXCLUDED.signals, edge_status = EXCLUDED.edge_status,
        kelly_fraction = EXCLUDED.kelly_fraction
    `)
  })

  it("returns all coin profiles", async () => {
    const res = await request(app)
      .get(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/coin-profiles`)
      .set(auth(token))

    expect(res.status).toBe(200)
    expect(res.body.profiles.length).toBe(3)
  })

  it("confirmed coin has correct fields", async () => {
    const res = await request(app)
      .get(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/coin-profiles`)
      .set(auth(token))

    const btc = res.body.profiles.find(p => p.coin === "BTC")
    expect(btc).toBeDefined()
    expect(btc.edge_status).toBe("confirmed")
    expect(Number(btc.signals)).toBe(150)
    expect(Number(btc.kelly_fraction)).toBeCloseTo(0.09, 2)
    expect(btc.best_regime).toBe("trending")
  })

  it("suppressed coin (edge_status=none) appears in suppressedCoins", async () => {
    const res = await request(app)
      .get(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/coin-profiles`)
      .set(auth(token))

    expect(res.body.suppressedCoins).toContain("DOGE")
  })

  it("non-suppressed coins are not in suppressedCoins", async () => {
    const res = await request(app)
      .get(`/api/agents/${agent.agentAddress}/strategies/${strategyId}/coin-profiles`)
      .set(auth(token))

    expect(res.body.suppressedCoins).not.toContain("BTC")
    expect(res.body.suppressedCoins).not.toContain("ETH")
  })
})
