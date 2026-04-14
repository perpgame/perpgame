import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent, createTestPost } from "./setup.js"

const app = createTestApp()
let user, agent1, agent2

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent1 = await createTestAgent(user.address, "FeedAgent1")
  agent2 = await createTestAgent(user.address, "FeedAgent2")

  await createTestPost(agent1.agentAddress, "BTC analysis for feed test", ["BTC"])
  await createTestPost(agent1.agentAddress, "ETH analysis for feed test", ["ETH"])
  await createTestPost(agent2.agentAddress, "SOL analysis for feed test", ["SOL"])
})

describe("GET /api/posts (public feed)", () => {
  it("returns posts without auth", async () => {
    const res = await request(app).get("/api/posts?limit=5")

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it("returns posts with agent key", async () => {
    const res = await request(app)
      .get("/api/posts?limit=5")
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("respects limit param", async () => {
    const res = await request(app).get("/api/posts?limit=2")

    expect(res.status).toBe(200)
    expect(res.body.length).toBeLessThanOrEqual(2)
  })

  it("post objects have expected shape", async () => {
    const res = await request(app).get("/api/posts?limit=1")

    expect(res.status).toBe(200)
    const post = res.body[0]
    expect(post).toHaveProperty("id")
    expect(post).toHaveProperty("authorAddress")
    expect(post).toHaveProperty("content")
    expect(post).toHaveProperty("tags")
    expect(post).toHaveProperty("likeCount")
    expect(post).toHaveProperty("commentCount")
    expect(post).toHaveProperty("createdAt")
    expect(post).toHaveProperty("direction")
    expect(post).toHaveProperty("timeframe")
  })
})

describe("GET /api/posts/arena", () => {
  it("returns agent-only posts", async () => {
    const res = await request(app).get("/api/posts/arena?limit=5")

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    for (const post of res.body) {
      expect(post.authorIsAgent).toBe(true)
    }
  })

  it("supports cursor pagination", async () => {
    const first = await request(app).get("/api/posts/arena?limit=2")
    expect(first.status).toBe(200)

    if (first.body.length >= 2) {
      const cursor = encodeURIComponent(first.body[first.body.length - 1].createdAt)
      const second = await request(app).get(`/api/posts/arena?limit=2&cursor=${cursor}`)
      expect(second.status).toBe(200)
      const firstIds = new Set(first.body.map(p => p.id))
      for (const post of second.body) {
        expect(firstIds.has(post.id)).toBe(false)
      }
    }
  })
})

describe("GET /api/posts/arena/trending", () => {
  it("returns trending posts", async () => {
    const res = await request(app).get("/api/posts/arena/trending?limit=5")

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe("GET /api/posts/coin/:coin", () => {
  it("filters posts by coin tag", async () => {
    const res = await request(app).get("/api/posts/coin/BTC?limit=5")

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("rejects invalid coin format", async () => {
    const res = await request(app).get("/api/posts/coin/invalid123")
    expect(res.status).toBe(400)
  })

  it("returns empty for non-existent coin", async () => {
    const res = await request(app).get("/api/posts/coin/ZZZZZ")

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe("GET /api/posts/popular-coins", () => {
  it("returns popular coins", async () => {
    const res = await request(app).get("/api/posts/popular-coins")

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty("coin")
      expect(res.body[0]).toHaveProperty("postCount")
    }
  })
})

describe("GET /api/posts/:id", () => {
  it("returns a single post by id", async () => {
    const postId = await createTestPost(agent1.agentAddress, "Single post test " + Date.now())
    const res = await request(app).get(`/api/posts/${postId}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(postId)
    expect(res.body).toHaveProperty("content")
    expect(res.body).toHaveProperty("authorAddress")
  })

  it("returns 404 for non-existent post", async () => {
    const res = await request(app).get("/api/posts/00000000-0000-0000-0000-000000000000")
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/posts/:id", () => {
  it("agent can delete own post", async () => {
    const content = "Agent post to delete " + Date.now() + Math.random()
    const createRes = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ content })

    expect(createRes.status).toBe(201)

    const res = await request(app)
      .delete(`/api/posts/${createRes.body.id}`)
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
  })

  it("cannot delete another agent's post", async () => {
    const postId = await createTestPost(agent2.agentAddress, "Not yours " + Date.now())

    const res = await request(app)
      .delete(`/api/posts/${postId}`)
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(404)
  })

  it("returns 401 without auth", async () => {
    const res = await request(app).delete("/api/posts/some-id")
    expect(res.status).toBe(401)
  })

  it("deleted post is not returned in feed", async () => {
    const createRes = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ content: "Will be deleted " + Date.now() })

    await request(app)
      .delete(`/api/posts/${createRes.body.id}`)
      .set("X-Agent-Key", agent1.apiKey)

    const getRes = await request(app).get(`/api/posts/${createRes.body.id}`)
    expect(getRes.status).toBe(404)
  })
})
