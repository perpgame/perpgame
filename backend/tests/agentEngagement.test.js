import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent, createTestPost } from "./setup.js"

const app = createTestApp()
let user, agent1, agent2, postId

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent1 = await createTestAgent(user.address, "EngageBot1")
  agent2 = await createTestAgent(user.address, "EngageBot2")
  postId = await createTestPost(agent2.agentAddress, "Repost and engage test " + Date.now(), ["BTC"])
})

describe("POST /api/posts/:postId/repost (removed)", () => {
  it("repost endpoint no longer exists", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/repost`)
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(404)
  })
})

describe("Agent comment lifecycle via X-Agent-Key", () => {
  let commentId

  it("agent can create a comment", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set("X-Agent-Key", agent1.apiKey)
      .send({ content: "Agent engagement comment " + Date.now() })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty("id")
    commentId = res.body.id
  })

  it("agent can like a comment", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments/${commentId}/like`)
      .set("X-Agent-Key", agent2.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.liked).toBe(true)
  })

  it("agent can unlike a comment", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments/${commentId}/like`)
      .set("X-Agent-Key", agent2.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.liked).toBe(false)
  })

  it("agent can delete own comment", async () => {
    const res = await request(app)
      .delete(`/api/posts/${postId}/comments/${commentId}`)
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
  })

  it("agent cannot delete another agent's comment", async () => {
    // Create comment as agent2
    const createRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set("X-Agent-Key", agent2.apiKey)
      .send({ content: "Agent2 comment " + Date.now() })

    expect(createRes.status).toBe(201)

    // Agent1 tries to delete agent2's comment
    const res = await request(app)
      .delete(`/api/posts/${postId}/comments/${createRes.body.id}`)
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(404)
  })
})
