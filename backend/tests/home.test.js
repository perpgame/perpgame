import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { getDb } from "../db/index.js"
import { ensureDb, createTestApp, createTestUser, createTestAgent, createTestPost, cleanup } from "./setup.js"

const app = createTestApp()
let agent
let agent2
let postId
const createdAddresses = []

beforeAll(async () => {
  await ensureDb()

  // Create two agents — agent2 will be followed by agent
  const user = await createTestUser()
  agent = await createTestAgent(user.address, "HomeBot")
  createdAddresses.push(user.address, agent.agentAddress)

  const user2 = await createTestUser()
  agent2 = await createTestAgent(user2.address, "FollowedBot")
  createdAddresses.push(user2.address, agent2.agentAddress)

  // Create posts by both agents
  postId = await createTestPost(agent.agentAddress, "Longing $BTC breakout confirmed", ["BTC"])
  await createTestPost(agent2.agentAddress, "Shorting $ETH bearish divergence", ["ETH"])

  const db = getDb()

  // Agent follows agent2
  await db.execute(sql`
    INSERT INTO follows (follower_address, followed_address)
    VALUES (${agent.agentAddress}, ${agent2.agentAddress})
    ON CONFLICT DO NOTHING
  `)

  // Create a scored prediction for agent
  const predPostId = randomUUID()
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                       prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
                       prediction_expires_at, prediction_scored, prediction_outcome)
    VALUES (${predPostId}, ${agent.agentAddress}, 'BTC to 70k', ${JSON.stringify(["BTC"])},
            'bull', '24h', 'BTC', 65000, 68000,
            NOW() - INTERVAL '1 hour', TRUE, 'correct')
  `)
})

afterAll(async () => {
  const db = getDb()
  for (const addr of createdAddresses) {
    await db.execute(sql`DELETE FROM follows WHERE follower_address = ${addr} OR followed_address = ${addr}`).catch(() => {})
  }
  await cleanup(createdAddresses)
})

describe("GET /api/home", () => {
  it("returns 401 without key", async () => {
    const res = await request(app).get("/api/home")
    expect(res.status).toBe(401)
  })

  it("returns full home response", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("your_account")
    expect(res.body).toHaveProperty("prediction_results")
    expect(res.body).toHaveProperty("recent_lessons")
    expect(res.body).toHaveProperty("sentiment_snapshot")
    expect(res.body).toHaveProperty("posts_from_agents_you_follow")
    expect(res.body).not.toHaveProperty("latest_feed")
    expect(res.body).not.toHaveProperty("what_to_do_next")
    expect(res.body).not.toHaveProperty("quick_links")
    expect(res.body).not.toHaveProperty("your_settings")
  })

  it("your_account has correct fields", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    const account = res.body.your_account
    expect(account).toHaveProperty("accuracy")
    expect(account).toHaveProperty("correct")
    expect(account).toHaveProperty("wrong")
    expect(account).toHaveProperty("total")
    expect(account).toHaveProperty("pending")
    expect(account).toHaveProperty("wrongStreak")
    expect(account).not.toHaveProperty("name")
    expect(account).not.toHaveProperty("followers")
    expect(account).not.toHaveProperty("totalPredictions")
  })

  it("includes scored prediction results", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(Array.isArray(res.body.prediction_results)).toBe(true)
    expect(res.body.prediction_results.length).toBeGreaterThanOrEqual(1)

    const pred = res.body.prediction_results[0]
    expect(pred).toHaveProperty("id")
    expect(pred).toHaveProperty("coin", "BTC")
    expect(pred).toHaveProperty("direction", "bull")
    expect(pred).toHaveProperty("outcome", "correct")
    expect(pred).toHaveProperty("priceAtCall")
    expect(pred).toHaveProperty("priceAtExpiry")
    expect(pred).toHaveProperty("priceDelta")
    expect(pred.priceDelta).toBeCloseTo(4.62, 1)
  })

  it("includes accuracy in your_account", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    const account = res.body.your_account
    expect(account.correct).toBeGreaterThanOrEqual(1)
    expect(account.total).toBeGreaterThanOrEqual(1)
    expect(account.accuracy).toBeGreaterThan(0)
  })

  it("includes sentiment snapshot", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(typeof res.body.sentiment_snapshot).toBe("object")
  })

  it("includes posts from followed agents", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(Array.isArray(res.body.posts_from_agents_you_follow)).toBe(true)
    // agent follows agent2 who posted
    expect(res.body.posts_from_agents_you_follow.length).toBeGreaterThanOrEqual(1)
    expect(res.body.posts_from_agents_you_follow[0]).toHaveProperty("authorAddress", agent2.agentAddress)
  })


  it("includes circuit_breaker with required fields", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    const cb = res.body.circuit_breaker
    expect(cb).toBeDefined()
    expect(typeof cb.active).toBe("boolean")
    expect(typeof cb.haltNewPositions).toBe("boolean")
    expect(typeof cb.drawdownFromPeak).toBe("number")
    expect(typeof cb.kellyMultiplier).toBe("number")
    // New agent with 1 correct prediction: no drawdown
    expect(cb.haltNewPositions).toBe(false)
    expect(cb.drawdownFromPeak).toBe(0)
    expect(cb.kellyMultiplier).toBe(0.5)
  })

  it("includes funding_regime", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    const validRegimes = ["funding_long", "funding_short", "funding_neutral"]
    expect(validRegimes).toContain(res.body.funding_regime)
  })

  it("includes active_strategies as array", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.active_strategies)).toBe(true)
    // New agent: no strategies yet
    expect(res.body.active_strategies).toHaveLength(0)
  })

  it("active_strategies entries have required fields when populated", async () => {
    // Create and activate a strategy for this agent, then check home
    const { createTestUser: ctu, createTestAgent: cta } = await import("./setup.js")
    const db = getDb()
    const u = await ctu()
    const a = await cta(u.address, "HomeStratBot")

    // Insert an active strategy directly
    await db.execute(sql`
      INSERT INTO strategies (id, agent_address, conditions, direction, timeframe, coin, status, consecutive_losses)
      VALUES ('s_homtest1', ${a.agentAddress}, '[]'::jsonb, 'bull', '1h', 'BTC', 'active', 0)
    `)

    // Bust home cache by using a fresh key lookup
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", a.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.active_strategies.length).toBeGreaterThanOrEqual(1)
    const s = res.body.active_strategies[0]
    expect(s).toHaveProperty("id")
    expect(s).toHaveProperty("direction")
    expect(s).toHaveProperty("status", "active")
    expect(s).toHaveProperty("consecutiveLosses")

    // Cleanup
    await db.execute(sql`DELETE FROM strategies WHERE id = 's_homtest1'`).catch(() => {})
    await db.execute(sql`DELETE FROM agents WHERE user_address = ${a.agentAddress}`).catch(() => {})
    await db.execute(sql`DELETE FROM users WHERE address = ${a.agentAddress} OR address = ${u.address}`).catch(() => {})
  })

  it("returns cached response on second call", async () => {
    const res1 = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    const res2 = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    // Should be identical (cached)
    expect(JSON.stringify(res1.body)).toBe(JSON.stringify(res2.body))
  })
})

describe("GET /api/home — agent with no activity", () => {
  let freshAgent

  beforeAll(async () => {
    const freshUser = await createTestUser()
    freshAgent = await createTestAgent(freshUser.address, "FreshBot")
    createdAddresses.push(freshUser.address, freshAgent.agentAddress)
  })

  it("returns valid response with empty arrays", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", freshAgent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.your_account.total).toBe(0)
    expect(res.body.your_account.accuracy).toBe(0)
    expect(res.body.your_account.wrongStreak).toBe(0)
    expect(res.body.prediction_results).toEqual([])
    expect(res.body.recent_lessons).toEqual([])
    expect(res.body.posts_from_agents_you_follow).toEqual([])
  })
})
