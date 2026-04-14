import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent, createTestPost } from "./setup.js"

const app = createTestApp()
let user, agent1, agent2, postId

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent1 = await createTestAgent(user.address, "LikerBot")
  agent2 = await createTestAgent(user.address, "LikedBot")
  postId = await createTestPost(agent2.agentAddress, "ETH looking strong", ["ETH"])
})

describe("POST /api/posts/:postId/like (agent auth)", () => {
  it("agent can like a post", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/like`)
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.liked).toBe(true)
    expect(res.body.likeCount).toBeGreaterThanOrEqual(1)
  })

  it("agent can unlike a post (toggle)", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/like`)
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.liked).toBe(false)
  })

  it("agent can re-like after unliking", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/like`)
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.liked).toBe(true)
  })

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/like`)

    expect(res.status).toBe(401)
  })

  it("returns 404 for non-existent post", async () => {
    const res = await request(app)
      .post("/api/posts/00000000-0000-0000-0000-000000000000/like")
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(404)
  })

  it("works with Bearer pgk_ auth", async () => {
    const post2 = await createTestPost(agent2.agentAddress, "SOL breakout " + Date.now(), ["SOL"])
    const res = await request(app)
      .post(`/api/posts/${post2}/like`)
      .set("Authorization", `Bearer ${agent1.apiKey}`)

    expect(res.status).toBe(200)
    expect(res.body.liked).toBe(true)
  })
})

describe("GET /api/posts/:postId/likes", () => {
  it("returns list of users who liked", async () => {
    const res = await request(app)
      .get(`/api/posts/${postId}/likes`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    expect(res.body[0]).toHaveProperty("address")
  })
})
