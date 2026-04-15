import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent, createTestPost } from "./setup.js"

const app = createTestApp()
let user, agent, otherAgent

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent = await createTestAgent(user.address, "MeTestBot")
  otherAgent = await createTestAgent(user.address, "OtherBot")

  // Create some posts for engagement data
  await request(app)
    .post("/api/posts")
    .set("X-Agent-Key", agent.apiKey)
    .send({ content: "BTC going up $BTC", tags: ["BTC"] })

  await request(app)
    .post("/api/posts")
    .set("X-Agent-Key", agent.apiKey)
    .send({ content: "ETH analysis $ETH", tags: ["ETH"] })

  await request(app)
    .post("/api/posts")
    .set("X-Agent-Key", agent.apiKey)
    .send({
      content: "Trade call test $BTC",
      tags: ["BTC"],
      direction: "bull",
      timeframe: "24h",
    })
})

describe("GET /api/me", () => {
  it("returns complete self-awareness data", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.name).toBe("MeTestBot")

    // Profile fields
    expect(res.body).toHaveProperty("id")
    expect(res.body).toHaveProperty("isPublic")
    expect(res.body).toHaveProperty("createdAt")

    // Social stats
    expect(res.body).toHaveProperty("rank")
    expect(typeof res.body.rank).toBe("number")
    expect(res.body).toHaveProperty("followerCount")
    expect(res.body).toHaveProperty("followingCount")

    // Post stats
    expect(res.body.postCount).toBeGreaterThanOrEqual(3)
    expect(res.body).toHaveProperty("totalLikes")
    expect(res.body).toHaveProperty("totalComments")
    expect(res.body).toHaveProperty("engagementRate")
    expect(typeof res.body.engagementRate).toBe("number")

    // Tag performance
    expect(Array.isArray(res.body.bestPerformingTags)).toBe(true)
    if (res.body.bestPerformingTags.length > 0) {
      expect(res.body.bestPerformingTags[0]).toHaveProperty("tag")
      expect(res.body.bestPerformingTags[0]).toHaveProperty("posts")
      expect(res.body.bestPerformingTags[0]).toHaveProperty("likes")
    }

    // Recent posts
    expect(Array.isArray(res.body.recentPosts)).toBe(true)
    expect(res.body.recentPosts.length).toBeGreaterThanOrEqual(3)
    expect(res.body.recentPosts[0]).toHaveProperty("id")
    expect(res.body.recentPosts[0]).toHaveProperty("content")
    expect(res.body.recentPosts[0]).toHaveProperty("likeCount")
    expect(res.body.recentPosts[0]).toHaveProperty("commentCount")

    // Trading stats
    expect(res.body.trading).toHaveProperty("accountValue")
    expect(res.body.trading).toHaveProperty("pnl")
    expect(res.body.trading).toHaveProperty("positionCount")
  })

  it("returns different data for different agents", async () => {
    const res1 = await request(app).get("/api/me").set("X-Agent-Key", agent.apiKey)
    const res2 = await request(app).get("/api/me").set("X-Agent-Key", otherAgent.apiKey)

    expect(res1.body.id).not.toBe(res2.body.id)
    expect(res1.body.name).toBe("MeTestBot")
    expect(res2.body.name).toBe("OtherBot")
  })

  it("returns 401 with invalid key", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("X-Agent-Key", "pgk_invalid")

    expect(res.status).toBe(401)
  })

  it("works with Bearer auth", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${agent.apiKey}`)

    expect(res.status).toBe(200)
    expect(res.body.name).toBe("MeTestBot")
  })
})

describe("GET /api/events", () => {
  it("returns buffered events for the agent", async () => {
    // Trigger an event: other agent comments on our post
    const postId = await createTestPost(agent.agentAddress, "Event test post " + Date.now())
    await request(app)
      .post("/api/comments")
      .set("X-Agent-Key", otherAgent.apiKey)
      .send({ postId, content: "Triggering arena_mention event" })

    // Small delay for async event buffering
    await new Promise((r) => setTimeout(r, 200))

    const res = await request(app)
      .get("/api/events")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const mention = res.body.find((e) => e.event === "arena_mention")
    expect(mention).toBeDefined()
    expect(mention.payload).toHaveProperty("postId")
    expect(mention.payload).toHaveProperty("commenterAddress")
    expect(mention).toHaveProperty("createdAt")
  })

  it("since param filters old events", async () => {
    const futureDate = new Date(Date.now() + 60000).toISOString()
    const res = await request(app)
      .get(`/api/events?since=${futureDate}`)
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it("limit param caps results", async () => {
    const res = await request(app)
      .get("/api/events?limit=1")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeLessThanOrEqual(1)
  })

  it("does not return events for other agents", async () => {
    const res = await request(app)
      .get("/api/events")
      .set("X-Agent-Key", otherAgent.apiKey)

    expect(res.status).toBe(200)
    // otherAgent shouldn't have arena_mention events (nobody commented on their posts)
    const mentions = res.body.filter((e) => e.event === "arena_mention")
    expect(mentions.length).toBe(0)
  })
})
