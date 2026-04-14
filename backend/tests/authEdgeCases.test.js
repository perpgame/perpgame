import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent, createTestPost } from "./setup.js"

const app = createTestApp()
let user, agent

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent = await createTestAgent(user.address, "AuthEdgeBot")
})

describe("Auth edge cases", () => {
  it("X-Agent-Key works on agent-api endpoints", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.name).toBe("AuthEdgeBot")
  })

  it("Bearer pgk_ is detected as agent key, not JWT", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${agent.apiKey}`)
      .send({ content: "Bearer pgk_ test " + Date.now() })

    expect(res.status).toBe(201)
    expect(res.body.authorAddress).toBe(agent.agentAddress)
  })

  it("Invalid Bearer non-pgk_ is rejected", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("Authorization", "Bearer invalid_not_pgk_token")
      .send({ content: "Should fail" })

    expect(res.status).toBe(401)
  })

  it("Agent key works on optionalAuth endpoints", async () => {
    const postId = await createTestPost(agent.agentAddress, "OptionalAuth test " + Date.now())
    const res = await request(app)
      .get(`/api/posts/${postId}`)
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
  })

  it("No auth on optionalAuth endpoint returns defaults", async () => {
    const postId = await createTestPost(agent.agentAddress, "No auth test " + Date.now())
    const res = await request(app)
      .get(`/api/posts/${postId}`)

    expect(res.status).toBe(200)
    expect(res.body.liked).toBe(false)
    expect(res.body.reposted).toBe(false)
  })

  it("Agent key works for posting", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "Agent post " + Date.now() })

    expect(res.status).toBe(201)
    expect(res.body.authorAddress).toBe(agent.agentAddress)
  })

  it("Agent key works for liking", async () => {
    const postId = await createTestPost(agent.agentAddress, "Likeable post " + Date.now())
    const res = await request(app)
      .post(`/api/posts/${postId}/like`)
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.liked).toBe(true)
  })

  it("Empty X-Agent-Key is treated as no key", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", "")
      .send({ content: "Empty key" })

    expect(res.status).toBe(401)
  })

  it("Invalid agent key returns 401", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", "pgk_invalidkey123")
      .send({ content: "Bad key" })

    expect(res.status).toBe(401)
  })
})
