import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent, createTestPost, cleanup } from "./setup.js"

const app = createTestApp()
let user
let agent
let postId
const createdAddresses = []

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent = await createTestAgent(user.address, "SocialBot")
  createdAddresses.push(user.address, agent.agentAddress)

  postId = await createTestPost(agent.agentAddress, "Longing $BTC here, breakout confirmed", ["BTC"])
  await createTestPost(agent.agentAddress, "Shorting $ETH, bearish divergence on 4H", ["ETH"])
  await createTestPost(agent.agentAddress, "SOL looking strong, buying the dip", ["SOL"])
})

// afterAll(async () => {
//   await cleanup(createdAddresses)
// })

describe("GET /api/feed", () => {
  it("returns 401 without key", async () => {
    const res = await request(app).get("/api/feed")
    expect(res.status).toBe(401)
  })

  it("returns agent posts", async () => {
    const res = await request(app)
      .get("/api/feed")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("posts")
    expect(Array.isArray(res.body.posts)).toBe(true)
    expect(res.body.posts.length).toBeGreaterThan(0)
    expect(res.body.posts[0]).toHaveProperty("content")
    expect(res.body.posts[0]).toHaveProperty("authorAddress")
  })

  it("supports limit param", async () => {
    const res = await request(app)
      .get("/api/feed?limit=1")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.posts.length).toBeLessThanOrEqual(1)
  })
})

describe("GET /api/feed?coin=", () => {
  it("filters by coin", async () => {
    const res = await request(app)
      .get("/api/feed?coin=BTC")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("posts")
    expect(Array.isArray(res.body.posts)).toBe(true)
  })

  it("rejects invalid coin format", async () => {
    const res = await request(app)
      .get("/api/feed?coin=invalid123")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(400)
  })
})

describe("GET /api/feed?sort=trending", () => {
  it("returns trending posts", async () => {
    const res = await request(app)
      .get("/api/feed?sort=trending")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("posts")
    expect(Array.isArray(res.body.posts)).toBe(true)
  })
})

describe("GET /api/posts/sentiment", () => {
  it("returns sentiment data", async () => {
    const res = await request(app)
      .get("/api/posts/sentiment")

    expect(res.status).toBe(200)
    expect(typeof res.body).toBe("object")
    if (res.body.BTC) {
      expect(res.body.BTC).toHaveProperty("bull")
      expect(res.body.BTC).toHaveProperty("bear")
      expect(res.body.BTC).toHaveProperty("score")
    }
  })
})

describe("GET /api/agents/leaderboard", () => {
  it("returns public agents", { timeout: 15000 }, async () => {
    const res = await request(app)
      .get("/api/agents/leaderboard")

    // 200 or 500 if HL API unreachable (leaderboard fetches live trading data)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true)
    }
  })
})

describe("POST /api/comments", () => {
  it("creates a comment as agent", async () => {
    const res = await request(app)
      .post("/api/comments")
      .set("X-Agent-Key", agent.apiKey)
      .send({ postId, content: "Agree, BTC looking strong" })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty("id")
  })

  it("rejects empty content", async () => {
    const res = await request(app)
      .post("/api/comments")
      .set("X-Agent-Key", agent.apiKey)
      .send({ postId, content: "" })

    expect(res.status).toBe(400)
  })

  it("rejects missing postId", async () => {
    const res = await request(app)
      .post("/api/comments")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "Hello" })

    expect(res.status).toBe(400)
  })
})
