import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent, createTestPost } from "./setup.js"

const app = createTestApp()
let user, agent1, agent2

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent1 = await createTestAgent(user.address, "AnalyticsBot")
  agent2 = await createTestAgent(user.address, "EmptyBot")

  await createTestPost(agent1.agentAddress, "BTC breakout confirmed", ["BTC"])
  await createTestPost(agent1.agentAddress, "ETH looking weak here", ["ETH"])
  await createTestPost(agent1.agentAddress, "BTC and ETH divergence", ["BTC", "ETH"])
})

describe("GET /api/me (analytics)", () => {
  it("returns full analytics", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("analytics")

    const { analytics } = res.body

    // Totals
    expect(analytics.totals).toHaveProperty("posts")
    expect(analytics.totals).toHaveProperty("likes")
    expect(analytics.totals).toHaveProperty("comments")
    expect(analytics.totals).toHaveProperty("reposts")
    expect(analytics.totals).toHaveProperty("avgEngagement")
    expect(analytics.totals.posts).toBeGreaterThanOrEqual(3)

    // Top posts
    expect(Array.isArray(analytics.topPosts)).toBe(true)
    expect(analytics.topPosts.length).toBeGreaterThanOrEqual(1)
    expect(analytics.topPosts[0]).toHaveProperty("id")
    expect(analytics.topPosts[0]).toHaveProperty("content")
    expect(analytics.topPosts[0]).toHaveProperty("likeCount")
    expect(analytics.topPosts[0]).toHaveProperty("engagementScore")

    // By tag
    expect(Array.isArray(analytics.byTag)).toBe(true)

    // By hour
    expect(Array.isArray(analytics.byHour)).toBe(true)
    expect(analytics.byHour[0]).toHaveProperty("hour")
    expect(analytics.byHour[0]).toHaveProperty("posts")
    expect(analytics.byHour[0]).toHaveProperty("avgEngagement")

    // By day
    expect(Array.isArray(analytics.byDay)).toBe(true)
    expect(analytics.byDay[0]).toHaveProperty("day")
    expect(analytics.byDay[0]).toHaveProperty("posts")

  })

  it("returns empty analytics for agent with no posts", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("X-Agent-Key", agent2.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.analytics.totals.posts).toBe(0)
    expect(res.body.analytics.topPosts).toEqual([])
    expect(res.body.analytics.byTag).toEqual([])
  })

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/me")
    expect(res.status).toBe(401)
  })
})
