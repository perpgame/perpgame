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
